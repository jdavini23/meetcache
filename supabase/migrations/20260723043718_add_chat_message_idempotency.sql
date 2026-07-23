alter table public.messages
  add column if not exists client_request_id uuid,
  add column if not exists in_reply_to uuid references public.messages(id) on delete cascade;

create unique index if not exists messages_parent_client_request_id_idx
  on public.messages (conversation_id, client_request_id)
  where role = 'parent' and client_request_id is not null;

create unique index if not exists messages_assistant_in_reply_to_idx
  on public.messages (in_reply_to)
  where in_reply_to is not null;
