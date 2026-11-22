-- Email the founder on every waitlist signup.
-- After each insert, pg_net posts the new row to /api/webhooks/waitlist-signup,
-- which sends the alert through Resend. The endpoint URL and shared secret live
-- in Supabase Vault (names below), so no secret is stored in this repository:
--   select vault.create_secret('https://www.meetcache.com/api/webhooks/waitlist-signup', 'waitlist_alert_url');
--   select vault.create_secret('<same value as WAITLIST_ALERT_SECRET>', 'waitlist_alert_secret');
-- Until both secrets exist the trigger does nothing.

create extension if not exists pg_net with schema extensions;

create or replace function private.notify_waitlist_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  webhook_url text;
  webhook_secret text;
begin
  select decrypted_secret into webhook_url
  from vault.decrypted_secrets where name = 'waitlist_alert_url';
  select decrypted_secret into webhook_secret
  from vault.decrypted_secrets where name = 'waitlist_alert_secret';

  if webhook_url is null or webhook_secret is null then
    return null;
  end if;

  -- pg_net queues the request and sends it after commit, so a slow or failing
  -- endpoint never delays or blocks a signup.
  perform net.http_post(
    url := webhook_url,
    body := jsonb_build_object(
      'email', new.email,
      'source', new.source,
      'utm_source', new.utm_source,
      'utm_medium', new.utm_medium,
      'utm_campaign', new.utm_campaign,
      'created_at', new.created_at
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-waitlist-alert-secret', webhook_secret
    ),
    timeout_milliseconds := 5000
  );

  return null;
exception when others then
  -- An alert is never worth losing a signup over.
  raise warning 'waitlist signup alert skipped: %', sqlerrm;
  return null;
end;
$$;

revoke all on function private.notify_waitlist_signup() from public, anon, authenticated;

drop trigger if exists notify_waitlist_signup on public.waitlist;
create trigger notify_waitlist_signup
after insert on public.waitlist
for each row execute function private.notify_waitlist_signup();
