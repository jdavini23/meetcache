alter table public.messages
  add column client_request_id uuid,
  add column in_reply_to uuid references public.messages(id) on delete cascade;

create unique index messages_parent_client_request_id_idx
  on public.messages (conversation_id, client_request_id)
  where role = 'parent' and client_request_id is not null;

create unique index messages_assistant_in_reply_to_idx
  on public.messages (in_reply_to)
  where in_reply_to is not null;
