-- =============================================================
-- Web Push Notifications: push_subscriptions table + RLS
-- =============================================================
-- Stores PushSubscription objects from browsers that the user
-- granted notification permission. Each user can have multiple
-- subscriptions (one per device/browser they installed the PWA on).
--
-- Used by the daily salary alerts cron and any other backend push
-- sender to fan out notifications.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text        NOT NULL,
  endpoint     text        NOT NULL UNIQUE,
  p256dh       text        NOT NULL,
  auth         text        NOT NULL,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,

  CONSTRAINT push_subscriptions_user_fk
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON public.push_subscriptions(user_id);

-- ── RLS ───────────────────────────────────────────────────────
GRANT SELECT, INSERT, DELETE ON public.push_subscriptions TO authenticated;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- A user can read/insert/delete only their own subscriptions.
-- The server (service_role) bypasses RLS, so the cron can read
-- everyone's endpoints to send pushes.
DROP POLICY IF EXISTS "push_subs_select_own" ON public.push_subscriptions;
CREATE POLICY "push_subs_select_own"
  ON public.push_subscriptions FOR SELECT TO authenticated
  USING (
    user_id IN (
      SELECT id FROM public.users
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "push_subs_insert_own" ON public.push_subscriptions;
CREATE POLICY "push_subs_insert_own"
  ON public.push_subscriptions FOR INSERT TO authenticated
  WITH CHECK (
    user_id IN (
      SELECT id FROM public.users
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "push_subs_delete_own" ON public.push_subscriptions;
CREATE POLICY "push_subs_delete_own"
  ON public.push_subscriptions FOR DELETE TO authenticated
  USING (
    user_id IN (
      SELECT id FROM public.users
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

-- ── Updated-at trigger ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.push_subscriptions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS push_subscriptions_updated_at ON public.push_subscriptions;
CREATE TRIGGER push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.push_subscriptions_updated_at();
