-- Founder-only funnel reporting: waitlist -> invite -> account -> first message -> return.
--
-- Every step except "opened the app" is derived from the source tables, so the
-- numbers stay correct without duplicating state into product_events. App
-- sessions come from the app_session_started event that /app records once per
-- browser tab.
--
-- These views live in the private schema (not exposed through the Data API)
-- and are readable only by the database owner and service role. Read them from
-- the Supabase SQL editor:
--   select * from private.cache_funnel;
--   select * from private.cache_user_activity order by waitlist_joined_at desc nulls last;

create schema if not exists private;

create or replace view private.cache_user_activity as
with accounts as (
  select u.id as user_id, lower(u.email) as email, u.created_at as account_created_at
  from auth.users u
),
people as (
  select
    coalesce(w.email, a.email) as email,
    a.user_id,
    w.created_at as waitlist_joined_at,
    w.source as waitlist_source,
    w.utm_source,
    w.utm_campaign,
    w.use_case_signal,
    w.access_granted_at,
    w.invite_sent_at,
    a.account_created_at
  from public.waitlist w
  full outer join accounts a on a.email = w.email
),
parent_messages as (
  select user_id,
    min(created_at) as first_message_at,
    max(created_at) as last_message_at,
    count(*) as parent_messages
  from public.messages where role = 'parent' group by user_id
),
active_days as (
  select user_id, count(distinct (created_at at time zone 'utc')::date) as active_days
  from (
    select user_id, created_at from public.messages where role = 'parent'
    union all
    select user_id, created_at from public.product_events where event_name = 'app_session_started'
  ) activity
  group by user_id
)
select
  p.email,
  p.user_id,
  p.waitlist_joined_at,
  p.waitlist_source,
  p.utm_source,
  p.utm_campaign,
  p.use_case_signal,
  p.access_granted_at,
  p.invite_sent_at,
  p.account_created_at,
  profile.created_at as profile_created_at,
  pm.first_message_at,
  pm.last_message_at,
  coalesce(pm.parent_messages, 0) as parent_messages,
  coalesce(ad.active_days, 0) as active_days,
  (select count(*) from public.product_events e where e.user_id = p.user_id and e.event_name = 'app_session_started') as app_sessions,
  (select count(*) from public.child_memories m where m.user_id = p.user_id) as saved_memories,
  (select count(*) from public.memory_suggestions s where s.user_id = p.user_id and s.decision in ('accepted', 'edited')) as accepted_suggestions,
  (select count(*) from public.memory_suggestions s where s.user_id = p.user_id) as memory_suggestions,
  (select count(distinct u.assistant_message_id) from public.memory_message_uses u where u.user_id = p.user_id) as replies_using_memory,
  (select count(*) from public.product_events e where e.user_id = p.user_id and e.event_name = 'memory_use_disclosure_opened') as memory_disclosures_opened
from people p
left join public.child_profiles profile on profile.user_id = p.user_id
left join parent_messages pm on pm.user_id = p.user_id
left join active_days ad on ad.user_id = p.user_id;

create or replace view private.cache_funnel as
select
  count(*) filter (where waitlist_joined_at is not null) as waitlist_signups,
  count(*) filter (where use_case_signal is not null) as answered_use_case,
  count(*) filter (where access_granted_at is not null) as approved,
  count(*) filter (where invite_sent_at is not null) as invited,
  count(*) filter (where account_created_at is not null) as accounts,
  count(*) filter (where account_created_at is not null and waitlist_joined_at is null) as accounts_without_waitlist,
  count(*) filter (where profile_created_at is not null) as created_profile,
  count(*) filter (where parent_messages > 0) as sent_first_message,
  count(*) filter (where active_days >= 2) as returned_another_day,
  count(*) filter (where saved_memories > 0) as saved_a_memory,
  count(*) filter (where replies_using_memory > 0) as got_a_reply_using_memory
from private.cache_user_activity;

revoke all on private.cache_user_activity, private.cache_funnel from public, anon, authenticated;
grant select on private.cache_user_activity, private.cache_funnel to service_role;
