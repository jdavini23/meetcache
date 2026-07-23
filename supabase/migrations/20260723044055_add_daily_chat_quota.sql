create table public.chat_daily_quotas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  quota_date date not null,
  request_count integer not null check (request_count > 0)
);

alter table public.chat_daily_quotas enable row level security;

revoke all on table public.chat_daily_quotas from public, anon, authenticated;
grant select, insert, update, delete on table public.chat_daily_quotas to service_role;

create or replace function public.consume_daily_chat_quota(
  p_user_id uuid,
  p_max_requests integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_count integer;
begin
  if p_user_id is null or p_max_requests < 1 then
    raise exception 'invalid daily quota request';
  end if;

  insert into public.chat_daily_quotas (
    user_id,
    quota_date,
    request_count
  )
  values (p_user_id, current_date, 1)
  on conflict (user_id) do update
    set quota_date = current_date,
        request_count = case
          when public.chat_daily_quotas.quota_date < current_date
          then 1
          else public.chat_daily_quotas.request_count + 1
        end
  returning request_count into current_count;

  return current_count <= p_max_requests;
end;
$$;

revoke all on function public.consume_daily_chat_quota(uuid, integer)
from public, anon, authenticated;
grant execute on function public.consume_daily_chat_quota(uuid, integer)
to service_role;
