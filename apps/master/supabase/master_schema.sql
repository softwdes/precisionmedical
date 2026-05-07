-- ══════════════════════════════════════════════════════════
-- MASTER SAAS MODULE — Schema & Seed (idempotente)
-- Seguro de ejecutar múltiples veces en Supabase SQL Editor
-- ══════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────
-- 1. user_roles
-- ──────────────────────────────────────────────────────────
create table if not exists public.user_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('trainer', 'super_admin')),
  created_at  timestamptz default now(),
  unique(user_id, role)
);
alter table public.user_roles enable row level security;

drop policy if exists "Service role full access" on public.user_roles;
create policy "Service role full access" on public.user_roles using (true) with check (true);

-- ──────────────────────────────────────────────────────────
-- 2. planes_saas
-- ──────────────────────────────────────────────────────────
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

-- UNIQUE en nombre necesario para que ON CONFLICT (nombre) funcione
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'planes_saas_nombre_key'
      and conrelid = 'public.planes_saas'::regclass
  ) then
    alter table public.planes_saas add constraint planes_saas_nombre_key unique (nombre);
  end if;
end $$;

alter table public.planes_saas enable row level security;

drop policy if exists "Public read planes" on public.planes_saas;
create policy "Public read planes" on public.planes_saas for select using (true);

-- ──────────────────────────────────────────────────────────
-- 3. trainer_suscripciones
-- (depende de public.trainers que ya existe en la BD del trainer)
-- ──────────────────────────────────────────────────────────
create table if not exists public.trainer_suscripciones (
  id                  uuid primary key default gen_random_uuid(),
  trainer_id          uuid not null references public.trainers(id) on delete cascade,
  plan_id             uuid not null references public.planes_saas(id),
  estado              text not null default 'trial'
                        check (estado in ('activo','trial','suspendido','cancelado')),
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

-- Acceso total para operaciones del panel master (service role)
drop policy if exists "Service role full access" on public.trainer_suscripciones;
create policy "Service role full access" on public.trainer_suscripciones
  using (true) with check (true);

-- Lectura del propio plan desde el módulo trainer
drop policy if exists "Trainer reads own subscription" on public.trainer_suscripciones;
create policy "Trainer reads own subscription" on public.trainer_suscripciones
  for select using (
    trainer_id in (select id from public.trainers where user_id = auth.uid())
  );

-- ──────────────────────────────────────────────────────────
-- 4. master_pagos
-- ──────────────────────────────────────────────────────────
create table if not exists public.master_pagos (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null references public.trainers(id) on delete cascade,
  plan_id     uuid not null references public.planes_saas(id),
  monto       numeric(10,2) not null,
  fecha_pago  date not null default current_date,
  periodo     text not null,
  estado      text not null default 'pendiente'
                check (estado in ('pagado','pendiente','vencido')),
  metodo_pago text,
  notas       text,
  created_at  timestamptz default now()
);
alter table public.master_pagos enable row level security;

drop policy if exists "Service role full access" on public.master_pagos;
create policy "Service role full access" on public.master_pagos using (true) with check (true);

-- ──────────────────────────────────────────────────────────
-- 5. master_ai_log
-- ──────────────────────────────────────────────────────────
create table if not exists public.master_ai_log (
  id              uuid primary key default gen_random_uuid(),
  admin_id        uuid not null references auth.users(id) on delete cascade,
  mensaje_usuario text not null,
  respuesta_ia    text not null,
  fecha           date not null default current_date,
  created_at      timestamptz default now()
);
alter table public.master_ai_log enable row level security;

drop policy if exists "Service role full access" on public.master_ai_log;
create policy "Service role full access" on public.master_ai_log using (true) with check (true);

-- ══════════════════════════════════════════════════════════
-- SEED / UPDATE: Planes
-- ON CONFLICT (nombre) DO UPDATE garantiza valores correctos
-- tanto en la primera ejecución como en actualizaciones
-- ══════════════════════════════════════════════════════════
insert into public.planes_saas
  (nombre, precio_mensual, limite_alumnos, limite_ia_diario,
   incluye_metricas, incluye_whatsapp, incluye_soporte_prioritario)
values
  ('basico',  10,  15,   20,   false, false, false),
  ('vip',     20,  50,   50,   true,  true,  false),
  ('premium', 50,  null, 1000, true,  true,  true)
on conflict (nombre) do update set
  precio_mensual              = excluded.precio_mensual,
  limite_alumnos              = excluded.limite_alumnos,
  limite_ia_diario            = excluded.limite_ia_diario,
  incluye_metricas            = excluded.incluye_metricas,
  incluye_whatsapp            = excluded.incluye_whatsapp,
  incluye_soporte_prioritario = excluded.incluye_soporte_prioritario;

-- ══════════════════════════════════════════════════════════
-- PROTECCIÓN: Impedir eliminar el último super_admin
-- ══════════════════════════════════════════════════════════
create or replace function public.protect_last_super_admin()
returns trigger language plpgsql as $$
begin
  if old.role = 'super_admin' then
    if (select count(*) from public.user_roles where role = 'super_admin') <= 1 then
      raise exception 'No se puede eliminar el único super_admin del sistema';
    end if;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_protect_super_admin on public.user_roles;
create trigger trg_protect_super_admin
  before delete on public.user_roles
  for each row execute function public.protect_last_super_admin();

-- ══════════════════════════════════════════════════════════
-- SEED: Asignar plan básico (trial) a trainers sin suscripción
-- Cubre trainers creados antes de instalar el módulo master
-- ══════════════════════════════════════════════════════════
insert into public.trainer_suscripciones (trainer_id, plan_id, estado)
select
  t.id,
  (select id from public.planes_saas where nombre = 'basico'),
  'trial'
from public.trainers t
where not exists (
  select 1 from public.trainer_suscripciones ts where ts.trainer_id = t.id
)
on conflict (trainer_id) do nothing;

-- ══════════════════════════════════════════════════════════
-- SEED: Super Admin role
-- Reemplazá el email con el del administrador real
-- ══════════════════════════════════════════════════════════
insert into public.user_roles (user_id, role)
select id, 'super_admin' from auth.users where email = 'esdsalinas@gmail.com'
on conflict do nothing;
