-- Email an invite automatically when a waitlist email is approved.
--
-- When access_granted_at is first set (on insert, or an update from null),
-- pg_net posts the email to /api/webhooks/waitlist-approved, which sends the
-- invite through Resend and records invite_sent_at.
--
-- Reuses the Vault secrets from 20261122070000_waitlist_signup_alert.sql:
-- the endpoint is derived from waitlist_alert_url, and the same shared secret
-- authenticates the request. No new secrets are needed.
--
-- To approve someone (this sends the invite):
--   update public.waitlist set access_granted_at = now() where email = 'parent@example.com';
-- To resend, clear and set it again:
--   update public.waitlist set access_granted_at = null where email = 'parent@example.com';
--   update public.waitlist set access_granted_at = now() where email = 'parent@example.com';

alter table public.waitlist
  add column if not exists invite_sent_at timestamptz;

create or replace function private.notify_waitlist_approved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  signup_webhook_url text;
  webhook_secret text;
begin
  -- Only when access is newly granted.
  if new.access_granted_at is null
    or (tg_op = 'UPDATE' and old.access_granted_at is not null) then
    return null;
  end if;

  select decrypted_secret into signup_webhook_url
  from vault.decrypted_secrets where name = 'waitlist_alert_url';
  select decrypted_secret into webhook_secret
  from vault.decrypted_secrets where name = 'waitlist_alert_secret';

  if signup_webhook_url is null or webhook_secret is null then
    return null;
  end if;

  -- pg_net sends after commit, so a slow or failing endpoint never blocks the approval.
  perform net.http_post(
    url := replace(signup_webhook_url, '/waitlist-signup', '/waitlist-approved'),
    body := jsonb_build_object('email', new.email),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-waitlist-alert-secret', webhook_secret
    ),
    timeout_milliseconds := 5000
  );

  return null;
exception when others then
  raise warning 'waitlist invite skipped: %', sqlerrm;
  return null;
end;
$$;

revoke all on function private.notify_waitlist_approved() from public, anon, authenticated;

drop trigger if exists notify_waitlist_approved on public.waitlist;
create trigger notify_waitlist_approved
after insert or update of access_granted_at on public.waitlist
for each row execute function private.notify_waitlist_approved();
