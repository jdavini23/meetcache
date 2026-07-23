alter table public.messages
  add column if not exists response_status text
  check (response_status in ('pending', 'failed', 'completed'));
