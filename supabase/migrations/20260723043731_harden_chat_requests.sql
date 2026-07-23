alter table public.messages
  add column if not exists processing_started_at timestamptz;

update public.messages
set processing_started_at = coalesce(processing_started_at, created_at)
where role = 'parent'
  and client_request_id is not null;

create table public.chat_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0)
);

alter table public.chat_rate_limits enable row level security;

revoke all on table public.chat_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.chat_rate_limits to service_role;

create or replace function public.consume_chat_rate_limit(
  p_user_id uuid,
  p_max_requests integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_count integer;
begin
  if p_user_id is null
    or p_max_requests < 1
    or p_window_seconds < 1 then
    raise exception 'invalid rate limit request';
  end if;

  insert into public.chat_rate_limits (
    user_id,
    window_started_at,
    request_count
  )
  values (p_user_id, now(), 1)
  on conflict (user_id) do update
    set window_started_at = case
          when public.chat_rate_limits.window_started_at
            <= now() - make_interval(secs => p_window_seconds)
          then now()
          else public.chat_rate_limits.window_started_at
        end,
        request_count = case
          when public.chat_rate_limits.window_started_at
            <= now() - make_interval(secs => p_window_seconds)
          then 1
          else public.chat_rate_limits.request_count + 1
        end
  returning request_count into current_count;

  return current_count <= p_max_requests;
end;
$$;

revoke all on function public.consume_chat_rate_limit(uuid, integer, integer)
from public, anon, authenticated;
grant execute on function public.consume_chat_rate_limit(uuid, integer, integer)
to service_role;

create schema if not exists private;

create or replace function private.apply_waitlist_use_case()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.waitlist
  set use_case_signal = new.use_case_signal
  where email = lower(new.email);

  if not found then
    raise exception 'waitlist entry not found' using errcode = 'P0002';
  end if;

  return null;
end;
$$;

revoke all on function private.apply_waitlist_use_case()
from public, anon, authenticated;

drop trigger if exists apply_waitlist_use_case_on_insert
on public.waitlist_use_case_submissions;

create trigger apply_waitlist_use_case_on_insert
before insert on public.waitlist_use_case_submissions
for each row execute function private.apply_waitlist_use_case();
