alter table public.messages
  add column if not exists memory_suggestion_eligible boolean not null default false;

create table public.child_memories (
  id uuid primary key default gen_random_uuid(),
  child_profile_id uuid not null references public.child_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_type text not null check (memory_type in ('trigger', 'helps', 'worsens', 'parent_preference', 'recurring_situation', 'routine', 'school_context', 'sensory_context')),
  content text not null check (char_length(content) between 1 and 280),
  source text not null default 'conversation' check (source = 'conversation'),
  source_conversation_id uuid not null references public.conversations(id) on delete cascade,
  parent_action text not null check (parent_action in ('accepted', 'edited')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memory_suggestion_runs (
  assistant_message_id uuid primary key references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending', 'ready', 'empty')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.memory_suggestions (
  id uuid primary key default gen_random_uuid(),
  assistant_message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  child_profile_id uuid not null references public.child_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  suggestion_index smallint not null check (suggestion_index between 1 and 3),
  suggested_type text not null check (suggested_type in ('trigger', 'helps', 'worsens', 'parent_preference', 'recurring_situation', 'routine', 'school_context', 'sensory_context')),
  suggested_content text not null check (char_length(suggested_content) between 1 and 280),
  decision text not null default 'pending' check (decision in ('pending', 'accepted', 'edited', 'rejected')),
  resulting_memory_id uuid references public.child_memories(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (assistant_message_id, suggestion_index)
);

create index child_memories_profile_created_at_idx on public.child_memories (child_profile_id, created_at desc);
create index child_memories_user_created_at_idx on public.child_memories (user_id, created_at desc);
create index memory_suggestions_conversation_pending_idx on public.memory_suggestions (conversation_id, created_at) where decision = 'pending';
create index memory_suggestions_user_created_at_idx on public.memory_suggestions (user_id, created_at);

create trigger child_memories_set_updated_at before update on public.child_memories for each row execute function public.set_updated_at();

alter table public.child_memories enable row level security;
alter table public.memory_suggestion_runs enable row level security;
alter table public.memory_suggestions enable row level security;

create policy "users read own child memories" on public.child_memories for select to authenticated using ((select auth.uid()) = user_id);
create policy "users read own memory suggestions" on public.memory_suggestions for select to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.child_memories, public.memory_suggestion_runs, public.memory_suggestions to service_role;

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
  new_memory_id uuid;
  final_action text;
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

  final_content := trim(coalesce(p_content, suggestion.suggested_content));
  if char_length(final_content) < 1 or char_length(final_content) > 280 then
    raise exception 'Memory content must be between 1 and 280 characters';
  end if;

  final_action := case when p_content is null or final_content = suggestion.suggested_content then 'accepted' else 'edited' end;
  insert into public.child_memories (child_profile_id, user_id, memory_type, content, source_conversation_id, parent_action)
  values (suggestion.child_profile_id, p_user_id, suggestion.suggested_type, final_content, suggestion.conversation_id, final_action)
  returning id into new_memory_id;

  update public.memory_suggestions
  set decision = final_action, resulting_memory_id = new_memory_id, decided_at = now()
  where id = suggestion.id;

  return jsonb_build_object('id', suggestion.id, 'decision', final_action, 'memoryId', new_memory_id);
end;
$$;

revoke all on function public.resolve_memory_suggestion(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.resolve_memory_suggestion(uuid, uuid, text, text) to service_role;
