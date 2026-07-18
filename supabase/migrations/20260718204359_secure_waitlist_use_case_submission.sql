create table if not exists public.waitlist_use_case_submissions (
  email text not null,
  use_case_signal text not null check (
    use_case_signal in (
      'sleep_bedtime',
      'behavior_emotions',
      'routines_transitions',
      'something_else'
    )
  ),
  submitted_at timestamp with time zone not null default now()
);

alter table public.waitlist_use_case_submissions enable row level security;

revoke all on table public.waitlist_use_case_submissions from anon, authenticated;
grant insert (email, use_case_signal) on table public.waitlist_use_case_submissions to anon;

create policy "anon can submit waitlist use case"
on public.waitlist_use_case_submissions
for insert
to anon
with check (
  length(email) between 3 and 320
  and use_case_signal in (
    'sleep_bedtime',
    'behavior_emotions',
    'routines_transitions',
    'something_else'
  )
);

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

revoke all on function private.apply_waitlist_use_case() from public, anon, authenticated;

drop trigger if exists apply_waitlist_use_case_on_insert
on public.waitlist_use_case_submissions;

create trigger apply_waitlist_use_case_on_insert
before insert on public.waitlist_use_case_submissions
for each row execute function private.apply_waitlist_use_case();
