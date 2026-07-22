alter table public.messages
  add column response_status text check (response_status in ('pending', 'failed', 'completed'));

drop trigger if exists apply_waitlist_use_case_on_insert
on public.waitlist_use_case_submissions;

drop function if exists private.apply_waitlist_use_case();
