-- Stage 5: lobbies
--
-- Paste this whole file into the Supabase SQL Editor and press Run.
-- It is safe to run more than once. Run the Stage 2 migration first.
--
-- What it does:
--   * a lobbies table for the co-op lobby list
--   * players cannot read or write that table at all. Row-level security is on and there are no
--     policies, so every direct query is refused. Everything goes through the functions below,
--     which only ever return safe columns.
--   * lobby passwords are hashed with bcrypt inside the database and never stored as text
--   * the PeerJS id of a lobby is only handed out by join_lobby, after the password check
--   * wrong passwords are counted, and guessing is cut off after a few tries

begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.lobbies (
    id uuid primary key default gen_random_uuid(),
    host_id uuid not null unique references auth.users (id) on delete cascade,
    name text not null,
    host_name text not null,
    is_private boolean not null default false,
    password_hash text,
    peer_id text not null,
    players int not null default 1,
    max_players int not null default 4,
    status text not null default 'open',
    created_at timestamptz not null default now(),
    last_seen timestamptz not null default now(),
    constraint lobbies_name_check check (char_length(name) between 3 and 24),
    constraint lobbies_players_check check (max_players between 1 and 4 and players between 1 and max_players),
    constraint lobbies_status_check check (status in ('open', 'in_run')),
    constraint lobbies_password_check check (is_private = (password_hash is not null))
);

create index if not exists lobbies_last_seen_idx on public.lobbies (last_seen);

create table if not exists public.lobby_join_attempts (
    id bigint generated always as identity primary key,
    lobby_id uuid not null references public.lobbies (id) on delete cascade,
    user_id uuid not null,
    at timestamptz not null default now()
);

create index if not exists lobby_join_attempts_lobby_idx on public.lobby_join_attempts (lobby_id, at);

alter table public.lobbies enable row level security;
alter table public.lobby_join_attempts enable row level security;

revoke all on public.lobbies from anon, authenticated;
revoke all on public.lobby_join_attempts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Housekeeping: lobbies with no heartbeat for 2 minutes are deleted
-- ---------------------------------------------------------------------------

create or replace function public.prune_lobbies()
returns void
language sql
security definer
set search_path = ''
as $$
    delete from public.lobbies where last_seen < now() - interval '2 minutes';
    delete from public.lobby_join_attempts where at < now() - interval '1 day';
$$;

-- ---------------------------------------------------------------------------
-- Host functions. Each one only ever touches the caller's own lobby.
-- ---------------------------------------------------------------------------

-- Creates the caller's lobby, replacing any lobby they already had. Returns the lobby id.
create or replace function public.create_lobby(
    p_name text,
    p_private boolean,
    p_password text,
    p_peer text,
    p_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    uid uuid := auth.uid();
    cleaned text := public.clean_display_name(p_name);
    is_priv boolean := coalesce(p_private, false);
    hn text;
    new_id uuid;
begin
    if uid is null then
        raise exception 'not_signed_in' using errcode = '28000';
    end if;
    if char_length(cleaned) not between 3 and 24 or cleaned !~ '^[A-Za-z0-9_ ''!.-]+$' then
        raise exception 'lobby_name_invalid';
    end if;
    if p_peer is null or p_peer !~ '^[A-Za-z0-9_-]{8,64}$' then
        raise exception 'lobby_peer_invalid';
    end if;
    if is_priv and (p_password is null or char_length(p_password) not between 4 and 64) then
        raise exception 'lobby_password_invalid';
    end if;

    perform public.prune_lobbies();

    select display_name into hn from public.profiles where id = uid;
    if hn is null then
        hn := (public.ensure_profile()).display_name;
    end if;

    delete from public.lobbies where host_id = uid;

    insert into public.lobbies (id, host_id, name, host_name, is_private, password_hash, peer_id)
    values (
        coalesce(p_id, gen_random_uuid()), uid, cleaned, hn, is_priv,
        case when is_priv then extensions.crypt(p_password, extensions.gen_salt('bf', 8)) end,
        p_peer
    )
    returning id into new_id;

    return new_id;
end;
$$;

-- Keeps the caller's lobby alive and updates its player count and status.
-- Returns false if the lobby no longer exists (the game then creates it again).
create or replace function public.heartbeat_lobby(p_players int, p_status text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
    update public.lobbies
    set last_seen = now(),
        players = greatest(1, least(coalesce(p_players, 1), max_players)),
        status = case when p_status in ('open', 'in_run') then p_status else status end
    where host_id = auth.uid();
    return found;
end;
$$;

-- Deletes the caller's lobby.
create or replace function public.close_lobby()
returns void
language sql
security definer
set search_path = ''
as $$
    delete from public.lobbies where host_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Functions for players looking for a lobby. None of them return a password hash,
-- and only join_lobby returns a peer id.
-- ---------------------------------------------------------------------------

-- Open lobbies that sent a heartbeat in the last 45 seconds.
create or replace function public.list_lobbies()
returns table (
    id uuid,
    name text,
    host_name text,
    is_private boolean,
    players int,
    max_players int,
    created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null then
        raise exception 'not_signed_in' using errcode = '28000';
    end if;
    perform public.prune_lobbies();
    return query
        select l.id, l.name, l.host_name, l.is_private, l.players, l.max_players, l.created_at
        from public.lobbies l
        where l.status = 'open' and l.last_seen > now() - interval '45 seconds'
        order by l.created_at desc
        limit 50;
end;
$$;

-- Safe details of one lobby, for invite links.
create or replace function public.get_lobby(p_lobby uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    l public.lobbies;
begin
    if auth.uid() is null then
        raise exception 'not_signed_in' using errcode = '28000';
    end if;
    select * into l from public.lobbies where id = p_lobby;
    if not found or l.last_seen < now() - interval '45 seconds' then
        return jsonb_build_object('found', false);
    end if;
    return jsonb_build_object(
        'found', true, 'id', l.id, 'name', l.name, 'host_name', l.host_name, 'is_private', l.is_private,
        'players', l.players, 'max_players', l.max_players, 'status', l.status
    );
end;
$$;

-- Returns the peer id of a lobby if the caller may join it.
-- Result is {"ok": true, "peer_id": ...} or {"ok": false, "error": <token>}.
-- It returns the failure instead of raising it so that the wrong-password count is kept.
create or replace function public.join_lobby(p_lobby uuid, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    uid uuid := auth.uid();
    l public.lobbies;
    mine int;
    total int;
begin
    if uid is null then
        raise exception 'not_signed_in' using errcode = '28000';
    end if;

    select * into l from public.lobbies where id = p_lobby;
    if not found or l.last_seen < now() - interval '45 seconds' then
        return jsonb_build_object('ok', false, 'error', 'lobby_closed');
    end if;
    if l.status <> 'open' then
        return jsonb_build_object('ok', false, 'error', 'lobby_started');
    end if;
    if l.players >= l.max_players then
        return jsonb_build_object('ok', false, 'error', 'lobby_full');
    end if;

    if l.is_private then
        select count(*) filter (where a.user_id = uid), count(*)
        into mine, total
        from public.lobby_join_attempts a
        where a.lobby_id = p_lobby and a.at > now() - interval '10 minutes';

        -- 5 wrong tries per player, 40 per lobby, in any 10 minutes
        if mine >= 5 or total >= 40 then
            return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
        end if;

        if p_password is null or l.password_hash <> extensions.crypt(p_password, l.password_hash) then
            insert into public.lobby_join_attempts (lobby_id, user_id) values (p_lobby, uid);
            return jsonb_build_object('ok', false, 'error', 'wrong_password');
        end if;
    end if;

    return jsonb_build_object('ok', true, 'peer_id', l.peer_id, 'name', l.name, 'host_name', l.host_name);
end;
$$;

revoke all on function public.prune_lobbies() from public, anon, authenticated;
revoke all on function public.create_lobby(text, boolean, text, text, uuid) from public, anon;
revoke all on function public.heartbeat_lobby(int, text) from public, anon;
revoke all on function public.close_lobby() from public, anon;
revoke all on function public.list_lobbies() from public, anon;
revoke all on function public.get_lobby(uuid) from public, anon;
revoke all on function public.join_lobby(uuid, text) from public, anon;
grant execute on function public.create_lobby(text, boolean, text, text, uuid) to authenticated;
grant execute on function public.heartbeat_lobby(int, text) to authenticated;
grant execute on function public.close_lobby() to authenticated;
grant execute on function public.list_lobbies() to authenticated;
grant execute on function public.get_lobby(uuid) to authenticated;
grant execute on function public.join_lobby(uuid, text) to authenticated;

commit;

-- Shows the result: a single row with the number of lobbies (0 on a fresh install).
select count(*) as lobbies from public.lobbies;
