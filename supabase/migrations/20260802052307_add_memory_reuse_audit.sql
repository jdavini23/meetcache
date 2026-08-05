create table public.memory_message_uses (
  id uuid primary key default gen_random_uuid(),
  assistant_message_id uuid not null references public.messages(id) on delete cascade,
  child_memory_id uuid references public.child_memories(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_type_snapshot text not null check (memory_type_snapshot in ('trigger', 'helps', 'worsens', 'parent_preference', 'recurring_situation', 'routine', 'school_context', 'sensory_context')),
  content_snapshot text not null check (char_length(content_snapshot) between 1 and 280),
  created_at timestamptz not null default now(),
  unique (assistant_message_id, child_memory_id)
);

create index memory_message_uses_assistant_message_idx on public.memory_message_uses (assistant_message_id, created_at);
create index memory_message_uses_child_memory_idx on public.memory_message_uses (child_memory_id) where child_memory_id is not null;
create index memory_message_uses_user_created_at_idx on public.memory_message_uses (user_id, created_at);

alter table public.memory_message_uses enable row level security;

create policy "users read own memory usage" on public.memory_message_uses
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.memory_message_uses from public, anon, authenticated;
grant select on table public.memory_message_uses to authenticated;
grant select, insert, update, delete on table public.memory_message_uses to service_role;

create or replace function public.persist_assistant_message_with_memory_uses(
  p_conversation_id uuid,
  p_user_id uuid,
  p_content text,
  p_in_reply_to uuid,
  p_memory_suggestion_eligible boolean,
  p_used_memory_ids uuid[] default '{}'::uuid[]
)
returns public.messages
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_message public.messages%rowtype;
  expected_memory_count integer;
  inserted_memory_count integer;
begin
  if p_content is null or char_length(trim(p_content)) not between 1 and 8000 then
    raise exception 'Assistant content must be between 1 and 8000 characters';
  end if;

  if not exists (
    select 1
    from public.conversations conversation
    join public.messages parent_message
      on parent_message.id = p_in_reply_to
      and parent_message.conversation_id = conversation.id
      and parent_message.user_id = p_user_id
      and parent_message.role = 'parent'
    where conversation.id = p_conversation_id
      and conversation.user_id = p_user_id
  ) then
    raise exception 'Conversation or parent message not found';
  end if;

  if cardinality(coalesce(p_used_memory_ids, '{}'::uuid[])) > 12 then
    raise exception 'At most 12 memory references are allowed';
  end if;

  select count(distinct memory_ids.memory_id)
  into expected_memory_count
  from unnest(coalesce(p_used_memory_ids, '{}'::uuid[])) as memory_ids(memory_id);

  if expected_memory_count <> cardinality(coalesce(p_used_memory_ids, '{}'::uuid[])) then
    raise exception 'Duplicate memory references are not allowed';
  end if;

  insert into public.messages (
    conversation_id,
    user_id,
    role,
    content,
    in_reply_to,
    memory_suggestion_eligible
  )
  values (
    p_conversation_id,
    p_user_id,
    'assistant',
    trim(p_content),
    p_in_reply_to,
    p_memory_suggestion_eligible
  )
  returning * into new_message;

  insert into public.memory_message_uses (
    assistant_message_id,
    child_memory_id,
    user_id,
    memory_type_snapshot,
    content_snapshot
  )
  select
    new_message.id,
    memory.id,
    p_user_id,
    memory.memory_type,
    memory.content
  from public.child_memories memory
  join public.conversations conversation
    on conversation.child_profile_id = memory.child_profile_id
  where memory.id = any(coalesce(p_used_memory_ids, '{}'::uuid[]))
    and memory.user_id = p_user_id
    and conversation.id = p_conversation_id
    and conversation.user_id = p_user_id;

  get diagnostics inserted_memory_count = row_count;
  if inserted_memory_count <> expected_memory_count then
    raise exception 'One or more memory references are unavailable';
  end if;

  return new_message;
end;
$$;

revoke all on function public.persist_assistant_message_with_memory_uses(uuid, uuid, text, uuid, boolean, uuid[])
from public, anon, authenticated;
grant execute on function public.persist_assistant_message_with_memory_uses(uuid, uuid, text, uuid, boolean, uuid[])
to service_role;
