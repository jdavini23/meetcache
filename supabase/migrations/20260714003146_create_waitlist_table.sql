create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  source text,
  referrer text,
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;

create policy "anon can join waitlist"
on public.waitlist
for insert
to anon
with check (true);
