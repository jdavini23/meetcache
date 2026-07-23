create table public.families (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  email text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.families enable row level security;

create or replace function public.get_family(p_token text)
returns jsonb
language sql
security definer
set search_path = 'public'
as $$
  select context from public.families where token = p_token;
$$;

create or replace function public.upsert_family(
  p_token text,
  p_email text,
  p_context jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  result jsonb;
begin
  insert into public.families (token, email, context)
  values (p_token, p_email, coalesce(p_context, '{}'::jsonb))
  on conflict (token) do update
    set context = excluded.context,
        email = coalesce(excluded.email, public.families.email),
        updated_at = now()
  returning context into result;

  return result;
end;
$$;
