-- Stage 7: LAN lobbies
--
-- Paste this whole file into the Supabase SQL Editor and press Run.
-- It is safe to run more than once. Run the Stage 5 (lobbies) migration first.
--
-- What it does:
--   * lobbies get an is_lan flag and a net_key
--   * net_key is a SHA-256 hash of the host's public network address, worked out on the server
--     from the request headers. The raw address is never stored. For IPv4 it is the whole address;
--     for IPv6 it is the /64 prefix, because every device on a home network gets its own IPv6
--     address inside the same /64.
--   * list_lobbies only shows a LAN lobby to players whose net_key matches the host's, and tells
--     the game which lobbies are LAN so it can tag them
--   * join_lobby and get_lobby also return is_lan. Joining is not limited by network, so the invite
--     link and QR code still work if the address check ever disagrees (for example one device on
--     IPv4 and the other on IPv6)
--
-- The network check only decides who sees a LAN lobby in the list. It is not a security boundary:
-- private LAN lobbies still need their password.

begin;

alter table public.lobbies add column if not exists is_lan boolean not null default false;
alter table public.lobbies add column if not exists net_key text;

-- ---------------------------------------------------------------------------
-- Hashed network key of the caller, or null if the address cannot be read.
-- ---------------------------------------------------------------------------

create or replace function public.caller_net_key()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    headers json;
    raw text;
    addr inet;
    key text;
begin
    begin
        headers := nullif(current_setting('request.headers', true), '')::json;
    exception when others then
        return null;
    end;
    if headers is null then
        return null;
    end if;

    raw := coalesce(
        nullif(trim(headers->>'cf-connecting-ip'), ''),
        nullif(trim(split_part(headers->>'x-forwarded-for', ',', 1)), ''),
        nullif(trim(headers->>'x-real-ip'), '')
    );
    if raw is null then
        return null;
    end if;
    raw := regexp_replace(raw, '^::ffff:', '', 'i');

    begin
        addr := raw::inet;
    exception when others then
        return null;
    end;

    if family(addr) = 6 then
        key := network(set_masklen(addr, 64))::text;
    else
        key := host(addr);
    end if;
    return encode(extensions.digest('fungdung-lan:' || key, 'sha256'), 'hex');
end;
$$;

-- ---------------------------------------------------------------------------
-- create_lobby gains p_lan. The old signature is dropped first so there is only one
-- create_lobby for the API to call. Older pages that do not send p_lan still work.
-- ---------------------------------------------------------------------------

drop function if exists public.create_lobby(text, boolean, text, text, uuid);

create or replace function public.create_lobby(
    p_name text,
    p_private boolean,
    p_password text,
    p_peer text,
    p_id uuid default null,
    p_lan boolean default false
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
    lan boolean := coalesce(p_lan, false);
    net text := public.caller_net_key();
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
    if lan and net is null then
        raise exception 'lan_unavailable';
    end if;

    perform public.prune_lobbies();

    select display_name into hn from public.profiles where id = uid;
    if hn is null then
        hn := (public.ensure_profile()).display_name;
    end if;

    delete from public.lobbies where host_id = uid;

    insert into public.lobbies (id, host_id, name, host_name, is_private, password_hash, peer_id, is_lan, net_key)
    values (
        coalesce(p_id, gen_random_uuid()), uid, cleaned, hn, is_priv,
        case when is_priv then extensions.crypt(p_password, extensions.gen_salt('bf', 8)) end,
        p_peer, lan, net
    )
    returning id into new_id;

    return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- list_lobbies gains an is_lan column, so it has to be dropped and made again.
-- ---------------------------------------------------------------------------

drop function if exists public.list_lobbies();

create function public.list_lobbies()
returns table (
    id uuid,
    name text,
    host_name text,
    is_private boolean,
    is_lan boolean,
    players int,
    max_players int,
    created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    me text := public.caller_net_key();
begin
    if auth.uid() is null then
        raise exception 'not_signed_in' using errcode = '28000';
    end if;
    perform public.prune_lobbies();
    return query
        select l.id, l.name, l.host_name, l.is_private, l.is_lan, l.players, l.max_players, l.created_at
        from public.lobbies l
        where l.status = 'open'
          and l.last_seen > now() - interval '45 seconds'
          and (not l.is_lan or (me is not null and l.net_key = me))
        order by l.is_lan desc, l.created_at desc
        limit 50;
end;
$$;

-- Safe details of one lobby, for invite links. Same as before plus is_lan.
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
        'is_lan', l.is_lan, 'players', l.players, 'max_players', l.max_players, 'status', l.status
    );
end;
$$;

-- Same as before plus is_lan in the success result.
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

    return jsonb_build_object(
        'ok', true, 'peer_id', l.peer_id, 'name', l.name, 'host_name', l.host_name, 'is_lan', l.is_lan
    );
end;
$$;

revoke all on function public.caller_net_key() from public, anon, authenticated;
revoke all on function public.create_lobby(text, boolean, text, text, uuid, boolean) from public, anon;
revoke all on function public.list_lobbies() from public, anon;
revoke all on function public.get_lobby(uuid) from public, anon;
revoke all on function public.join_lobby(uuid, text) from public, anon;
grant execute on function public.create_lobby(text, boolean, text, text, uuid, boolean) to authenticated;
grant execute on function public.list_lobbies() to authenticated;
grant execute on function public.get_lobby(uuid) to authenticated;
grant execute on function public.join_lobby(uuid, text) to authenticated;

commit;

-- Shows the result: one row, lan_column = true. lobbies is the number of open lobbies (usually 0).
select
    exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'lobbies' and column_name = 'is_lan'
    ) as lan_column,
    (select count(*) from public.lobbies) as lobbies;
