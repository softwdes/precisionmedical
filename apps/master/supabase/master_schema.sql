-- ══════════════════════════════════════════════════════════
-- MASTER SAAS MODULE — Schema & Seed
-- Ejecutar en Supabase SQL Editor
-- ══════════════════════════════════════════════════════════

-- 1. user_roles
create table if not exists public.user_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('trainer', 'super_admin')),
  created_at  timestamptz default now(),
  unique(user_id, role)
);
alter table public.user_roles enable row level security;
create policy "Service role full access" on public.user_roles using (true) with check (true);

-- 2. planes_saas
create table if not exists public.planes_saas (
  id                          uuid primary key default gen_random_uuid(),
  nombre                      text not null check (nombre in ('basico','vip','premium')),
  precio_mensual              numeric(10,2) not null,
  limite_alumnos              int,
  limite_ia_diario            int,
  incluye_metricas            boolean default false,
  incluye_whatsapp            boolean default false,
  incluye_soporte_prioritario boolean default false,
  activo                      boolean default true,
  created_at                  timestamptz default now()
);
alter table public.planes_saas enable row level security;
create policy "Public read planes" on public.planes_saas for select using (true);

-- 3. trainer_suscripciones
create table if not exists public.trainer_suscripciones (
  id                  uuid primary key default gen_random_uuid(),
  trainer_id          uuid not null references public.trainers(id) on delete cascade,
  plan_id             uuid not null references public.planes_saas(id),
  estado              text not null default 'trial' check (estado in ('activo','trial','suspendido','cancelado')),
  fecha_inicio        date not null default current_date,
  fecha_fin_trial     date,
  fecha_proximo_pago  date not null default (current_date + interval '30 days'),
  metodo_pago         text,
  notas               text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  unique(trainer_id)
);
alter table public.trainer_suscripciones enable row level security;
create policy "Service role full access" on public.trainer_suscripciones using (true) with check (true);

-- 4. master_pagos
create table if not exists public.master_pagos (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null references public.trainers(id) on delete cascade,
  plan_id     uuid not null references public.planes_saas(id),
  monto       numeric(10,2) not null,
  fecha_pago  date not null default current_date,
  periodo     text not null,
  estado      text not null default 'pendiente' check (estado in ('pagado','pendiente','vencido')),
  metodo_pago text,
  notas       text,
  created_at  timestamptz default now()
);
alter table public.master_pagos enable row level security;
create policy "Service role full access" on public.master_pagos using (true) with check (true);

-- 5. master_ai_log
create table if not exists public.master_ai_log (
  id              uuid primary key default gen_random_uuid(),
  admin_id        uuid not null references auth.users(id) on delete cascade,
  mensaje_usuario text not null,
  respuesta_ia    text not null,
  fecha           date not null default current_date,
  created_at      timestamptz default now()
);
alter table public.master_ai_log enable row level security;
create policy "Service role full access" on public.master_ai_log using (true) with check (true);

-- ══════════════════════════════════════════════════════════
-- SEED: Planes
-- ══════════════════════════════════════════════════════════
insert into public.planes_saas (nombre, precio_mensual, limite_alumnos, limite_ia_diario, incluye_metricas, incluye_whatsapp, incluye_soporte_prioritario)
values
  ('basico',  29, 20, 10,  false, false, false),
  ('vip',     59, 50, 30,  true,  true,  false),
  ('premium', 99, null, null, true, true,  true)
on conflict do nothing;

-- ══════════════════════════════════════════════════════════
-- SEED: Super Admin role
-- Reemplazá el email con el real del administrador
-- ══════════════════════════════════════════════════════════
insert into public.user_roles (user_id, role)
select id, 'super_admin' from auth.users where email = 'esdsalinas@gmail.com'
on conflict do nothing;
