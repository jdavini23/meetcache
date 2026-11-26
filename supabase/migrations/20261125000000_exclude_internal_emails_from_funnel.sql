-- Keep the founder's own test addresses out of funnel reporting.
--
-- private.internal_emails lists addresses that belong to the team. The
-- activity view flags matching people with is_internal, and the funnel counts
-- only real people (plus how many internal rows it left out, as a check).
--
-- Addresses are added in the SQL editor, never in a migration, so they stay
-- out of the repository:
--   insert into private.internal_emails (email) values ('you@example.com') on conflict do nothing;

create schema if not exists private;

create table if not exists private.internal_emails (
  email text primary key check (email = lower(email) and length(email) between 3 and 320),
  added_at timestamptz not null default now()
);

revoke all on private.internal_emails from public, anon, authenticated;
grant select, insert, delete on private.internal_emails to service_role;

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
  (select count(*) from public.product_events e where e.user_id = p.user_id and e.event_name = 'memory_use_disclosure_opened') as memory_disclosures_opened,
  exists (select 1 from private.internal_emails i where i.email = p.email) as is_internal
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
  count(*) filter (where replies_using_memory > 0) as got_a_reply_using_memory,
  (select count(*) from private.cache_user_activity where is_internal) as excluded_internal
from private.cache_user_activity
where not is_internal;

revoke all on private.cache_user_activity, private.cache_funnel from public, anon, authenticated;
grant select on private.cache_user_activity, private.cache_funnel to service_role;
