-- Enable necessary extensions
create extension if not exists "pgcrypto";

-- ============================================================
-- USERS
-- ============================================================
create table if not exists public.users (
  id uuid references auth.users(id) on delete cascade primary key,
  display_name text not null,
  player_id text unique not null,
  avatar_url text,
  created_at timestamptz default now() not null
);

-- Generate a unique PlayerID like "Greg#4821"
create or replace function generate_player_id(display_name text)
returns text language plpgsql as $$
declare
  base_name text;
  tag text;
  candidate text;
  max_attempts int := 10;
begin
  base_name := initcap(regexp_replace(display_name, '[^a-zA-Z0-9]', '', 'g'));
  if length(base_name) = 0 then base_name := 'Player'; end if;
  if length(base_name) > 12 then base_name := left(base_name, 12); end if;

  for i in 1..max_attempts loop
    tag := lpad(floor(random() * 9000 + 1000)::text, 4, '0');
    candidate := base_name || '#' || tag;
    if not exists (select 1 from public.users where player_id = candidate) then
      return candidate;
    end if;
  end loop;

  return base_name || '#' || right(extract(epoch from now())::bigint::text, 4);
end;
$$;

-- Auto-create user profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  dname text;
begin
  dname := coalesce(
    new.raw_user_meta_data->>'display_name',
    new.raw_user_meta_data->>'full_name',
    split_part(new.email, '@', 1),
    'Player'
  );

  insert into public.users (id, display_name, player_id, avatar_url)
  values (
    new.id,
    dname,
    generate_player_id(dname),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Trigger (drop first to allow re-run)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- FRIENDSHIPS
-- ============================================================
create table if not exists public.friendships (
  id uuid default gen_random_uuid() primary key,
  requester_id uuid references public.users(id) on delete cascade not null,
  addressee_id uuid references public.users(id) on delete cascade not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz default now() not null,
  unique(requester_id, addressee_id),
  check (requester_id != addressee_id)
);

create index if not exists friendships_requester_idx on public.friendships(requester_id);
create index if not exists friendships_addressee_idx on public.friendships(addressee_id);

-- ============================================================
-- ROOMS
-- ============================================================
create table if not exists public.rooms (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  code text unique not null default upper(substring(gen_random_uuid()::text, 1, 6)),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz default now() not null
);

-- ============================================================
-- ROOM MEMBERS
-- ============================================================
create table if not exists public.room_members (
  room_id uuid references public.rooms(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  player_slot int not null check (player_slot between 1 and 3),
  joined_at timestamptz default now() not null,
  primary key (room_id, user_id)
);

create index if not exists room_members_room_idx on public.room_members(room_id);
create index if not exists room_members_user_idx on public.room_members(user_id);

-- ============================================================
-- SESSIONS
-- ============================================================
create table if not exists public.sessions (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references public.rooms(id) on delete cascade not null,
  started_at timestamptz default now() not null,
  ended_at timestamptz
);

create index if not exists sessions_room_idx on public.sessions(room_id);

-- ============================================================
-- ROUNDS
-- ============================================================
create table if not exists public.rounds (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references public.rooms(id) on delete cascade not null,
  session_id uuid references public.sessions(id) on delete cascade not null,
  landlord_slot int not null check (landlord_slot between 1 and 3),
  winner text not null check (winner in ('landlord', 'peasants')),
  pts int not null default 1,
  multiplier int not null default 1,
  played_at timestamptz default now() not null
);

create index if not exists rounds_room_idx on public.rounds(room_id);
create index if not exists rounds_session_idx on public.rounds(session_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.users enable row level security;
alter table public.friendships enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.sessions enable row level security;
alter table public.rounds enable row level security;

-- Drop existing policies before recreating (idempotent)
do $$ begin
  drop policy if exists "Users can view all profiles" on public.users;
  drop policy if exists "Users can update own profile" on public.users;
  drop policy if exists "Users can view their friendships" on public.friendships;
  drop policy if exists "Users can send friend requests" on public.friendships;
  drop policy if exists "Addressee can update friendship" on public.friendships;
  drop policy if exists "Users can delete their friendships" on public.friendships;
  drop policy if exists "Room members can view rooms" on public.rooms;
  drop policy if exists "Authenticated users can create rooms" on public.rooms;
  drop policy if exists "Creator can update room" on public.rooms;
  drop policy if exists "Members can view room membership" on public.room_members;
  drop policy if exists "Users can join rooms" on public.room_members;
  drop policy if exists "Users can leave rooms" on public.room_members;
  drop policy if exists "Room members can view sessions" on public.sessions;
  drop policy if exists "Room members can create sessions" on public.sessions;
  drop policy if exists "Room members can update sessions" on public.sessions;
  drop policy if exists "Room members can view rounds" on public.rounds;
  drop policy if exists "Room members can insert rounds" on public.rounds;
  drop policy if exists "Room members can delete rounds" on public.rounds;
end $$;

-- users
create policy "Users can view all profiles" on public.users
  for select to authenticated using (true);
create policy "Users can update own profile" on public.users
  for update to authenticated using (auth.uid() = id);

-- friendships
create policy "Users can view their friendships" on public.friendships
  for select to authenticated using (auth.uid() = requester_id or auth.uid() = addressee_id);
create policy "Users can send friend requests" on public.friendships
  for insert to authenticated with check (auth.uid() = requester_id);
create policy "Addressee can update friendship" on public.friendships
  for update to authenticated using (auth.uid() = addressee_id);
create policy "Users can delete their friendships" on public.friendships
  for delete to authenticated using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- rooms
create policy "Room members can view rooms" on public.rooms
  for select to authenticated using (
    exists (select 1 from public.room_members rm where rm.room_id = id and rm.user_id = auth.uid())
    or created_by = auth.uid()
  );
create policy "Authenticated users can create rooms" on public.rooms
  for insert to authenticated with check (auth.uid() = created_by);
create policy "Creator can update room" on public.rooms
  for update to authenticated using (auth.uid() = created_by);

-- room_members
create policy "Members can view room membership" on public.room_members
  for select to authenticated using (
    exists (select 1 from public.room_members rm where rm.room_id = room_id and rm.user_id = auth.uid())
  );
create policy "Users can join rooms" on public.room_members
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can leave rooms" on public.room_members
  for delete to authenticated using (auth.uid() = user_id);

-- sessions
create policy "Room members can view sessions" on public.sessions
  for select to authenticated using (
    exists (select 1 from public.room_members rm where rm.room_id = room_id and rm.user_id = auth.uid())
  );
create policy "Room members can create sessions" on public.sessions
  for insert to authenticated with check (
    exists (select 1 from public.room_members rm where rm.room_id = room_id and rm.user_id = auth.uid())
  );
create policy "Room members can update sessions" on public.sessions
  for update to authenticated using (
    exists (select 1 from public.room_members rm where rm.room_id = room_id and rm.user_id = auth.uid())
  );

-- rounds
create policy "Room members can view rounds" on public.rounds
  for select to authenticated using (
    exists (select 1 from public.room_members rm where rm.room_id = room_id and rm.user_id = auth.uid())
  );
create policy "Room members can insert rounds" on public.rounds
  for insert to authenticated with check (
    exists (select 1 from public.room_members rm where rm.room_id = room_id and rm.user_id = auth.uid())
  );
create policy "Room members can delete rounds" on public.rounds
  for delete to authenticated using (
    exists (select 1 from public.room_members rm where rm.room_id = room_id and rm.user_id = auth.uid())
  );

-- ============================================================
-- REALTIME
-- ============================================================
do $$ begin
  alter publication supabase_realtime add table public.rounds;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.sessions;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.room_members;
exception when others then null; end $$;
