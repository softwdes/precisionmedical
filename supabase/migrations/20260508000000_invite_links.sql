create table if not exists public.invite_links (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  full_url    text not null,
  expires_at  timestamptz not null,
  created_at  timestamptz default now()
);

alter table public.invite_links enable row level security;

-- Anon can read active (unexpired) links — needed for the /acceso/[code] redirect route
create policy "anon_read_active" on public.invite_links
  for select to anon
  using (expires_at > now());

create index on public.invite_links (code);
