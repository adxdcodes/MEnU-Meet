create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  full_name text,
  avatar_url text,
  is_allowed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique check (room_code ~ '^[A-Z0-9]{6,12}$'),
  name text not null check (char_length(name) between 1 and 100),
  host_id uuid not null references public.profiles(id) on delete cascade,
  max_participants integer not null default 5 check (max_participants between 2 and 5),
  is_locked boolean not null default false,
  require_approval boolean not null default true,
  allow_chat boolean not null default true,
  allow_screen_share boolean not null default true,
  connection_mode text not null default 'p2p',
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

-- Safe migration for existing MEnU Meet projects.
alter table public.meetings
  add column if not exists connection_mode text not null default 'p2p';

alter table public.meetings
  drop constraint if exists meetings_connection_mode_check;

alter table public.meetings
  add constraint meetings_connection_mode_check
  check (connection_mode in ('p2p','sfu'));

create table if not exists public.meeting_participants (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'participant' check (role in ('host','participant')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique(meeting_id,user_id)
);

create table if not exists public.join_requests (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique(meeting_id,user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 2000),
  created_at timestamptz not null default now()
);

-- Case-insensitive username uniqueness. Existing duplicate usernames must be
-- cleaned up before this index is created if your database already contains them.
create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, username, full_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'username'), ''),
      'user_' || substr(replace(new.id::text,'-',''),1,8)
    ),
    nullif(new.raw_user_meta_data->>'full_name','')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.prevent_client_access_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' and new.is_allowed is distinct from old.is_allowed then
    raise exception 'Only an administrator can change is_allowed';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_client_access_change on public.profiles;
create trigger prevent_client_access_change
before update on public.profiles
for each row execute procedure public.prevent_client_access_change();

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

-- Used by the username + password login screen. It intentionally returns an
-- email only for an existing MEnU Meet account. Password verification
-- remains inside Supabase Auth via signInWithPassword().
create or replace function public.get_email_for_username(p_username text)
returns text
language sql
security definer
set search_path = public, auth
as $$
  select u.email
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(p.username) = lower(trim(p_username))
    and u.email is not null
  limit 1;
$$;

revoke all on function public.get_email_for_username(text) from public;
grant execute on function public.get_email_for_username(text) to anon, authenticated;

alter table public.profiles enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_participants enable row level security;
alter table public.join_requests enable row level security;
alter table public.messages enable row level security;

-- Re-runnable policies.
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update_self on public.profiles;
drop policy if exists meetings_select_allowed on public.meetings;
drop policy if exists meetings_insert_allowed on public.meetings;
drop policy if exists meetings_update_host on public.meetings;
drop policy if exists participants_select_allowed on public.meeting_participants;
drop policy if exists participants_insert_self on public.meeting_participants;
drop policy if exists participants_update_self_or_host on public.meeting_participants;
drop policy if exists join_requests_select on public.join_requests;
drop policy if exists join_requests_insert_allowed on public.join_requests;
drop policy if exists join_requests_update_host on public.join_requests;
drop policy if exists messages_select_member on public.messages;
drop policy if exists messages_insert_member on public.messages;

create policy profiles_select on public.profiles
for select to authenticated
using (id = auth.uid() or is_allowed = true);

create policy profiles_update_self on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy meetings_select_allowed on public.meetings
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_allowed = true
  )
);

create policy meetings_insert_allowed on public.meetings
for insert to authenticated
with check (
  host_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_allowed = true
  )
);

create policy meetings_update_host on public.meetings
for update to authenticated
using (host_id = auth.uid())
with check (host_id = auth.uid());

create policy participants_select_allowed on public.meeting_participants
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_allowed = true
  )
);

create policy participants_insert_self on public.meeting_participants
for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_allowed = true
  )
);

create policy participants_update_self_or_host on public.meeting_participants
for update to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.meetings m
    where m.id = meeting_id and m.host_id = auth.uid()
  )
);

create policy join_requests_select on public.join_requests
for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.meetings m
    where m.id = meeting_id and m.host_id = auth.uid()
  )
);

create policy join_requests_insert_allowed on public.join_requests
for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_allowed = true
  )
);

create policy join_requests_update_host on public.join_requests
for update to authenticated
using (
  exists (
    select 1 from public.meetings m
    where m.id = meeting_id and m.host_id = auth.uid()
  )
);

create policy messages_select_member on public.messages
for select to authenticated
using (
  exists (
    select 1 from public.meeting_participants mp
    where mp.meeting_id = messages.meeting_id
      and mp.user_id = auth.uid()
  )
);

create policy messages_insert_member on public.messages
for insert to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.meeting_participants mp
    where mp.meeting_id = messages.meeting_id
      and mp.user_id = auth.uid()
      and mp.left_at is null
  )
);

-- Realtime for chat/presence-related table changes.
do $$
begin
  alter publication supabase_realtime add table public.meetings;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.join_requests;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.meeting_participants;
exception when duplicate_object then null;
end $$;

-- is_allowed must be changed from a trusted admin context/service role.
-- Never expose the service-role key in the React application.
