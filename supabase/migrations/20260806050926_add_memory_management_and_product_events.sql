create table public.product_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null check (event_name in (
    'app_session_started',
    'memory_manager_opened',
    'memory_use_disclosure_opened',
    'memory_updated',
    'memory_deleted'
  )),
  subject_id uuid,
  client_event_id uuid,
  created_at timestamptz not null default now()
);

create index product_events_user_created_at_idx on public.product_events (user_id, created_at desc);
create index product_events_name_created_at_idx on public.product_events (event_name, created_at desc);
create unique index product_events_user_client_event_id_idx
  on public.product_events (user_id, client_event_id)
  where client_event_id is not null;

alter table public.product_events enable row level security;

revoke all on table public.product_events from public, anon, authenticated;
grant select, insert, update, delete on table public.product_events to service_role;

create or replace function public.resolve_memory_suggestion(
  p_suggestion_id uuid,
  p_user_id uuid,
  p_action text,
  p_content text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  suggestion public.memory_suggestions%rowtype;
  final_content text;
  new_memory public.child_memories%rowtype;
  final_action text;
  memory_count integer;
begin
  select * into suggestion
  from public.memory_suggestions
  where id = p_suggestion_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Memory suggestion not found';
  end if;

  if suggestion.decision <> 'pending' then
    raise exception 'Memory suggestion has already been resolved';
  end if;

  if p_action = 'reject' then
    update public.memory_suggestions
    set decision = 'rejected', decided_at = now()
    where id = suggestion.id;
    return jsonb_build_object('id', suggestion.id, 'decision', 'rejected');
  end if;

  if p_action <> 'accept' then
    raise exception 'Unsupported memory suggestion action';
  end if;

  perform 1
  from public.child_profiles
  where id = suggestion.child_profile_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Child profile not found';
  end if;

  select count(*) into memory_count
  from public.child_memories
  where child_profile_id = suggestion.child_profile_id and user_id = p_user_id;

  if memory_count >= 12 then
    raise exception 'memory_limit_reached';
  end if;

  final_content := trim(coalesce(p_content, suggestion.suggested_content));
  if char_length(final_content) < 1 or char_length(final_content) > 280 then
    raise exception 'Memory content must be between 1 and 280 characters';
  end if;

  final_action := case when p_content is null or final_content = suggestion.suggested_content then 'accepted' else 'edited' end;
  insert into public.child_memories (child_profile_id, user_id, memory_type, content, source_conversation_id, parent_action)
  values (suggestion.child_profile_id, p_user_id, suggestion.suggested_type, final_content, suggestion.conversation_id, final_action)
  returning * into new_memory;

  update public.memory_suggestions
  set decision = final_action, resulting_memory_id = new_memory.id, decided_at = now()
  where id = suggestion.id;

  return jsonb_build_object(
    'id', suggestion.id,
    'decision', final_action,
    'memory', jsonb_build_object(
      'id', new_memory.id,
      'child_profile_id', new_memory.child_profile_id,
      'memory_type', new_memory.memory_type,
      'content', new_memory.content,
      'parent_action', new_memory.parent_action,
      'created_at', new_memory.created_at,
      'updated_at', new_memory.updated_at
    )
  );
end;
$$;

revoke all on function public.resolve_memory_suggestion(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.resolve_memory_suggestion(uuid, uuid, text, text) to service_role;

create or replace function public.update_child_memory(
  p_memory_id uuid,
  p_user_id uuid,
  p_content text
)
returns public.child_memories
language plpgsql
security invoker
set search_path = ''
as $$
declare
  memory public.child_memories%rowtype;
begin
  select * into memory
  from public.child_memories
  where id = p_memory_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Memory not found';
  end if;

  if char_length(trim(p_content)) < 1 or char_length(trim(p_content)) > 280 then
    raise exception 'Memory content must be between 1 and 280 characters';
  end if;

  update public.child_memories
  set content = trim(p_content)
  where id = memory.id
  returning * into memory;

  insert into public.product_events (user_id, event_name, subject_id)
  values (p_user_id, 'memory_updated', memory.id);

  return memory;
end;
$$;

revoke all on function public.update_child_memory(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.update_child_memory(uuid, uuid, text) to service_role;

create or replace function public.delete_child_memory(
  p_memory_id uuid,
  p_user_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  memory public.child_memories%rowtype;
begin
  select * into memory
  from public.child_memories
  where id = p_memory_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Memory not found';
  end if;

  insert into public.product_events (user_id, event_name, subject_id)
  values (p_user_id, 'memory_deleted', memory.id);

  delete from public.child_memories where id = memory.id;
  return memory.id;
end;
$$;

revoke all on function public.delete_child_memory(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_child_memory(uuid, uuid) to service_role;
