create table public.child_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() unique references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 80),
  birth_month smallint not null check (birth_month between 1 and 12),
  birth_year smallint not null check (birth_year between 2000 and 2100),
  pronouns text check (pronouns is null or char_length(pronouns) <= 40),
  routines text not null check (char_length(routines) between 1 and 1200),
  challenges text not null check (char_length(challenges) between 1 and 1200),
  parent_notes text check (parent_notes is null or char_length(parent_notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  child_profile_id uuid not null unique references public.child_profiles(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('parent', 'assistant')),
  content text not null check (char_length(content) between 1 and 8000),
  created_at timestamptz not null default now()
);

create index messages_conversation_created_at_idx on public.messages (conversation_id, created_at);

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger child_profiles_set_updated_at before update on public.child_profiles for each row execute function public.set_updated_at();
create trigger conversations_set_updated_at before update on public.conversations for each row execute function public.set_updated_at();

revoke all on function public.set_updated_at() from public, anon, authenticated;

alter table public.child_profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy "users manage own child profile" on public.child_profiles for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users manage own conversation" on public.conversations for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and exists (select 1 from public.child_profiles p where p.id = child_profile_id and p.user_id = (select auth.uid())));
create policy "users read own messages" on public.messages for select to authenticated using ((select auth.uid()) = user_id);

-- Browser clients may create the conversation after onboarding. Message writes are
-- deliberately server-only, using the service-role key in POST /api/chat.
grant select, insert, update, delete on public.child_profiles to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select on public.messages to authenticated;
grant select, insert, update, delete on public.child_profiles, public.conversations, public.messages to service_role;
