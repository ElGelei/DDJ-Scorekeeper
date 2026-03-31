-- DDZ PVP tables

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  status text not null default 'bidding' check (status in ('bidding','playing','finished')),
  current_player_slot int not null default 0,
  landlord_slot int,
  landlord_cards jsonb,
  multiplier int not null default 1,
  base_bid int not null default 0,
  last_action_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.game_hands (
  game_id uuid not null references public.game_sessions(id) on delete cascade,
  player_slot int not null check (player_slot in (0,1,2)),
  cards jsonb not null default '[]',
  primary key (game_id, player_slot)
);

create table if not exists public.game_moves (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.game_sessions(id) on delete cascade,
  player_slot int not null,
  move_type text not null check (move_type in ('bid','play','pass','timeout')),
  cards_played jsonb,
  bid_value int,
  played_at timestamptz not null default now()
);

-- Bids state (per player per game)
create table if not exists public.game_bids (
  game_id uuid not null references public.game_sessions(id) on delete cascade,
  player_slot int not null,
  bid_value int,  -- null = not yet bid
  primary key (game_id, player_slot)
);

-- Enable RLS
alter table public.game_sessions enable row level security;
alter table public.game_hands enable row level security;
alter table public.game_moves enable row level security;
alter table public.game_bids enable row level security;

-- game_sessions: room members can read
create policy "room members can read game sessions"
  on public.game_sessions for select
  using (
    exists (
      select 1 from public.room_members rm
      where rm.room_id = game_sessions.room_id
        and rm.user_id = auth.uid()
    )
  );

-- game_sessions: room members can insert/update (server-side via service role bypasses this)
create policy "room members can insert game sessions"
  on public.game_sessions for insert
  with check (
    exists (
      select 1 from public.room_members rm
      where rm.room_id = game_sessions.room_id
        and rm.user_id = auth.uid()
    )
  );

create policy "room members can update game sessions"
  on public.game_sessions for update
  using (
    exists (
      select 1 from public.room_members rm
      where rm.room_id = game_sessions.room_id
        and rm.user_id = auth.uid()
    )
  );

-- game_hands: each player sees only their own slot
create policy "player sees own hand"
  on public.game_hands for select
  using (
    exists (
      select 1
      from public.game_sessions gs
      join public.room_members rm on rm.room_id = gs.room_id
      where gs.id = game_hands.game_id
        and rm.user_id = auth.uid()
        and rm.pvp_slot = game_hands.player_slot
    )
  );

-- game_moves: room members can read all moves (public history)
create policy "room members can read moves"
  on public.game_moves for select
  using (
    exists (
      select 1
      from public.game_sessions gs
      join public.room_members rm on rm.room_id = gs.room_id
      where gs.id = game_moves.game_id
        and rm.user_id = auth.uid()
    )
  );

-- game_bids: room members can read bids
create policy "room members can read bids"
  on public.game_bids for select
  using (
    exists (
      select 1
      from public.game_sessions gs
      join public.room_members rm on rm.room_id = gs.room_id
      where gs.id = game_bids.game_id
        and rm.user_id = auth.uid()
    )
  );

-- Add pvp_slot (0-2) and is_ready to room_members for PVP (separate from the existing player_slot 1-3)
alter table public.room_members add column if not exists pvp_slot int;
alter table public.room_members add column if not exists is_ready boolean not null default false;

-- Enable realtime on public tables
alter publication supabase_realtime add table public.game_sessions;
alter publication supabase_realtime add table public.game_moves;
alter publication supabase_realtime add table public.game_bids;
