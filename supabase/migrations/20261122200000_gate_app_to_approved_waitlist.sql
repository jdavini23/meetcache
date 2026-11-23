-- Invite-only access to /app: a new account can only be created for an email
-- that is on the waitlist AND has been approved (access_granted_at is set).
--
-- Enforced server-side by Supabase Auth's "Before User Created" hook, so the
-- browser cannot bypass it. Existing accounts are unaffected: the hook only
-- runs when a user is first created.
--
-- After applying, enable the hook in the Supabase Dashboard:
--   Authentication > Hooks > Before User Created > Postgres function
--   > public.hook_require_waitlist_access
--
-- To let someone in:
--   update public.waitlist set access_granted_at = now() where email = 'parent@example.com';

alter table public.waitlist
  add column if not exists access_granted_at timestamptz;

-- Visitors' column-level insert grants (see 20261122060000_harden_waitlist.sql)
-- do not include access_granted_at, so nobody can approve themselves.

create or replace function public.hook_require_waitlist_access(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  signup_email text := lower(trim(event->'user'->>'email'));
begin
  if signup_email is not null and exists (
    select 1
    from public.waitlist
    where email = signup_email
      and access_granted_at is not null
  ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Cache is invite-only right now. Join the waitlist at meetcache.com and we''ll email you when your spot opens.'
    )
  );
end;
$$;

grant execute on function public.hook_require_waitlist_access(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_require_waitlist_access(jsonb) from public, anon, authenticated;
