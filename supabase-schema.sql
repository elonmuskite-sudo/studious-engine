create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  member_id text not null unique,
  first_name text not null,
  last_name text not null,
  full_name text,
  password text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.members add column if not exists email text;
alter table public.members add column if not exists email_verified boolean not null default false;
alter table public.members add column if not exists role text not null default 'user';
alter table public.members add column if not exists avatar_url text;
alter table public.members add column if not exists created_at timestamptz not null default now();

create unique index if not exists idx_members_email
  on public.members (email)
  where email is not null;
create index if not exists idx_members_role on public.members (role);

create table if not exists public.profiles (
  id uuid primary key references public.members (id) on delete cascade,
  email text not null unique,
  full_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null default 'private',
  owner_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_members (
  chat_id uuid not null references public.chats (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (chat_id, profile_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  content text not null,
  type text not null default 'text',
  file_url text,
  file_name text,
  encrypted boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_chats_owner_id on public.chats (owner_id);
create index if not exists idx_chats_created_at on public.chats (created_at);
create index if not exists idx_chat_members_profile_id on public.chat_members (profile_id);
create index if not exists idx_messages_chat_id on public.messages (chat_id);
create index if not exists idx_messages_created_at on public.messages (created_at);

alter table public.members enable row level security;
alter table public.profiles enable row level security;
alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages enable row level security;

drop policy if exists "Members can view non-admin accounts" on public.members;
create policy "Members can view non-admin accounts"
  on public.members for select
  using (role is distinct from 'supabase_admin');

drop policy if exists "Admin self read" on public.members;
create policy "Admin self read"
  on public.members for select
  using (role = 'supabase_admin' and auth.uid() = id);

drop policy if exists "Members can create regular accounts" on public.members;
create policy "Members can create regular accounts"
  on public.members for insert
  with check (role = 'user');

drop policy if exists "Members can update their own account" on public.members;
create policy "Members can update their own account"
  on public.members for update
  using (auth.uid() = id and role = 'user')
  with check (auth.uid() = id and role = 'user');

drop policy if exists "Members can delete their own account" on public.members;
create policy "Members can delete their own account"
  on public.members for delete
  using (auth.uid() = id and role = 'user');

drop policy if exists "Profiles are readable by their owner" on public.profiles;
create policy "Profiles are readable by their owner"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Members can create their own profile" on public.profiles;
create policy "Members can create their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Members can update their own profile" on public.profiles;
create policy "Members can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Members can delete their own profile" on public.profiles;
create policy "Members can delete their own profile"
  on public.profiles for delete
  using (auth.uid() = id);

drop policy if exists "Chat members can view chats" on public.chats;
create policy "Chat members can view chats"
  on public.chats for select
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.chat_members cm
      where cm.chat_id = id and cm.profile_id = auth.uid()
    )
  );

drop policy if exists "Members can create owned chats" on public.chats;
create policy "Members can create owned chats"
  on public.chats for insert
  with check (owner_id = auth.uid());

drop policy if exists "Chat owners can update chats" on public.chats;
create policy "Chat owners can update chats"
  on public.chats for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "Chat owners can delete chats" on public.chats;
create policy "Chat owners can delete chats"
  on public.chats for delete
  using (owner_id = auth.uid());

drop policy if exists "Members can view their chat memberships" on public.chat_members;
create policy "Members can view their chat memberships"
  on public.chat_members for select
  using (profile_id = auth.uid());

drop policy if exists "Members can join chats as themselves" on public.chat_members;
create policy "Members can join chats as themselves"
  on public.chat_members for insert
  with check (profile_id = auth.uid());

drop policy if exists "Members can leave chats themselves" on public.chat_members;
create policy "Members can leave chats themselves"
  on public.chat_members for delete
  using (profile_id = auth.uid());

drop policy if exists "Chat members can view messages" on public.messages;
create policy "Chat members can view messages"
  on public.messages for select
  using (
    exists (
      select 1 from public.chat_members cm
      where cm.chat_id = messages.chat_id and cm.profile_id = auth.uid()
    )
  );

drop policy if exists "Chat members can send messages" on public.messages;
create policy "Chat members can send messages"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.chat_members cm
      where cm.chat_id = messages.chat_id and cm.profile_id = auth.uid()
    )
  );

drop policy if exists "Senders can update their messages" on public.messages;
create policy "Senders can update their messages"
  on public.messages for update
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

drop policy if exists "Senders can delete their messages" on public.messages;
create policy "Senders can delete their messages"
  on public.messages for delete
  using (sender_id = auth.uid());

revoke all on public.members from anon, authenticated;
grant select (id, member_id, first_name, last_name, full_name, avatar_url, email, email_verified, role, created_at)
  on public.members to anon, authenticated;
grant insert (member_id, first_name, last_name, full_name, password, avatar_url, email, email_verified, role)
  on public.members to anon, authenticated;
grant update (member_id, first_name, last_name, full_name, password, avatar_url, email, email_verified, role)
  on public.members to authenticated;
grant delete on public.members to authenticated;
grant all on public.members, public.profiles, public.chats, public.chat_members, public.messages to service_role;
grant select, insert, update, delete on public.profiles, public.chats, public.chat_members, public.messages to authenticated;

create or replace function public.verify_member_login(p_member_id text, p_password text)
returns table (
  id uuid,
  member_id text,
  first_name text,
  last_name text,
  full_name text,
  email text,
  email_verified boolean,
  role text,
  avatar_url text,
  created_at timestamptz
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select m.id, m.member_id, m.first_name, m.last_name, m.full_name,
         m.email, m.email_verified, m.role, m.avatar_url, m.created_at
  from public.members m
  where m.member_id = p_member_id and m.password = p_password
$$;

revoke all on function public.verify_member_login(text, text) from public;
grant execute on function public.verify_member_login(text, text) to anon, authenticated, service_role;