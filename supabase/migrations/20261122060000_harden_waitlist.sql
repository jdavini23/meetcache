-- Harden the public waitlist before sending social traffic to the landing page.
-- Safe to apply before the matching client deploy: the current client only
-- inserts email, source, and referrer, which remain insertable.

-- 1. Attribution: record which campaign brought each signup.
alter table public.waitlist
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text;

-- 2. Validate what anonymous visitors can write, since the insert policy is open.
alter table public.waitlist
  add constraint waitlist_email_valid check (
    length(email) <= 320
    and email = lower(email)
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  add constraint waitlist_source_length check (source is null or length(source) <= 40),
  add constraint waitlist_referrer_length check (referrer is null or length(referrer) <= 2048),
  add constraint waitlist_utm_length check (
    coalesce(length(utm_source), 0) <= 100
    and coalesce(length(utm_medium), 0) <= 100
    and coalesce(length(utm_campaign), 0) <= 100
  );

-- 3. Least privilege: visitors may only insert these columns. RLS already blocks
-- reads, updates, and deletes, but the broad default grants were one permissive
-- policy away from exposing the list.
revoke all on table public.waitlist from anon, authenticated;
grant insert (email, source, referrer, utm_source, utm_medium, utm_campaign)
  on table public.waitlist to anon, authenticated;

-- Signed-in parents who return to the landing page send an authenticated JWT,
-- so the insert policies must cover both roles.
drop policy if exists "anon can join waitlist" on public.waitlist;
create policy "visitors can join waitlist"
on public.waitlist
for insert
to anon, authenticated
with check (true);

grant insert (email, use_case_signal)
  on table public.waitlist_use_case_submissions to authenticated;
alter policy "anon can submit waitlist use case"
  on public.waitlist_use_case_submissions
  to anon, authenticated;

-- 4. Remove the unused July prototype storage. Its SECURITY DEFINER functions
-- were callable by anyone through /rest/v1/rpc and allowed unbounded writes.
drop function if exists public.get_family(text);
drop function if exists public.upsert_family(text, text, jsonb);
drop table if exists public.families;
