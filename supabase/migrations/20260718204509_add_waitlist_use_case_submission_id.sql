alter table public.waitlist_use_case_submissions
add column if not exists id bigint generated always as identity primary key;
