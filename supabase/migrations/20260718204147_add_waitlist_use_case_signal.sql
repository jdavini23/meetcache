alter table if exists public.waitlist
add column if not exists use_case_signal text;
