-- Stage 7b: better LAN lobby matching
--
-- Paste this whole file into the Supabase SQL Editor and press Run.
-- It is safe to run more than once. Run the Stage 7 (LAN lobbies) migration first.
-- Run it BEFORE loading the new game code: the new code sends an extra argument that the old
-- functions do not accept.
--
-- Why: Stage 7 matched devices only by the address the server saw them come from. Two devices on
-- the same Wi-Fi can arrive by different routes (one over IPv4, one over IPv6, or through iCloud
-- Private Relay), so a LAN lobby could be missing from the Join list.
--
-- What it does:
--   * the game now also sends the public addresses its browser learned from a STUN server
--     (the same one PeerJS already uses). The server hashes each one right away and never
--     stores the raw address. Private, loopback and link-local addresses are ignored, because
--     every home network reuses them.
--   * each lobby keeps a list of network keys (net_keys). A LAN lobby is listed for a player if
--     any of the player's keys matches any of the host's.
--   * create_lobby and list_lobbies take a new optional p_addrs argument. Calls without it still
--     work, so older pages are not broken.
--
-- As before, this only decides who sees a LAN lobby in the list. It is not a security boundary.

begin;

alter table public.lobbies add column if not exists net_keys text[];

-- ---------------------------------------------------------------------------
-- Hashed network key of one public address, or null if it is not a usable public address.
-- IPv4: the whole address. IPv6: the /64 prefix, which every device on a home network shares.
-- ---------------------------------------------------------------------------

create or replace function public.net_key_of(p_addr text)
returns text
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
    addr inet;
    key text;
begin
    if p_addr is null or char_length(p_addr) > 64 then
        return null;
    end if;
    begin
        addr := regexp_replace(trim(p_addr), '^::ffff:', '', 'i')::inet;
    exception when others then
        return null;
    end;

    if family(addr) = 6 then
        if addr <<= 'fc00::/7' or addr <<= 'fe80::/10' or addr <<= '::1/128' or addr <<= '::/128' then
            return null;
        end if;
        key := network(set_masklen(addr, 64))::text;
    else
        if addr <<= '10.0.0.0/8' or addr <<= '172.16.0.0/12' or addr <<= '192.168.0.0/16'
            or addr <<= '127.0.0.0/8' or addr <<= '169.254.0.0/16' or addr <<= '100.64.0.0/10'
            or addr <<= '0.0.0.0/8' then
            return null;
        end if;
        key := host(addr);
    end if;
    return encode(extensions.digest('fungdung-lan:' || key, 'sha256'), 'hex');
end;
$$;

-- Same result as Stage 7 for the address the request came from, now through net_key_of.
create or replace function public.caller_net_key()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    headers json;
begin
    begin
        headers := nullif(current_setting('request.headers', true), '')::json;
    exception when others then
        return null;
    end;
    if headers is null then
        return null;
    end if;
    return public.net_key_of(coalesce(
        nullif(trim(headers->>'cf-connecting-ip'), ''),
        nullif(trim(split_part(headers->>'x-forwarded-for', ',', 1)), ''),
        nullif(trim(headers->>'x-real-ip'), '')
    ));
end;
$$;

-- Every network key of the caller: the request address plus up to 4 addresses the game sent.
create or replace function public.caller_net_keys(p_addrs text[])
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    keys text[] := '{}';
    k text;
    a text;
begin
    k := public.caller_net_key();
    if k is not null then
        keys := keys || k;
    end if;
    if p_addrs is not null then
        foreach a in array coalesce(p_addrs[1:4], '{}') loop
            k := public.net_key_of(a);
            if k is not null and not (k = any (keys)) then
                keys := keys || k;
            end if;
        end loop;
    end if;
    return keys;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_lobby gains p_addrs. The Stage 7 signature is dropped so there is only one.
-- ---------------------------------------------------------------------------

drop function if exists public.create_lobby(text, boolean, text, text, uuid, boolean);

create or replace function public.create_lobby(
    p_name text,
    p_private boolean,
    p_password text,
    p_peer text,
    p_id uuid default null,
    p_lan boolean default false,
    p_addrs text[] default null
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
    keys text[] := public.caller_net_keys(p_addrs);
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
    if lan and cardinality(keys) = 0 then
        raise exception 'lan_unavailable';
    end if;

    perform public.prune_lobbies();

    select display_name into hn from public.profiles where id = uid;
    if hn is null then
        hn := (public.ensure_profile()).display_name;
    end if;

    delete from public.lobbies where host_id = uid;

    insert into public.lobbies (id, host_id, name, host_name, is_private, password_hash, peer_id, is_lan, net_key, net_keys)
    values (
        coalesce(p_id, gen_random_uuid()), uid, cleaned, hn, is_priv,
        case when is_priv then extensions.crypt(p_password, extensions.gen_salt('bf', 8)) end,
        p_peer, lan, keys[1], keys
    )
    returning id into new_id;

    return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- list_lobbies gains p_addrs and matches LAN lobbies on any shared network key.
-- ---------------------------------------------------------------------------

drop function if exists public.list_lobbies();

create or replace function public.list_lobbies(p_addrs text[] default null)
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
    me text[] := public.caller_net_keys(p_addrs);
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
          and (not l.is_lan or coalesce(l.net_keys && me, false))
        order by l.is_lan desc, l.created_at desc
        limit 50;
end;
$$;

revoke all on function public.net_key_of(text) from public, anon, authenticated;
revoke all on function public.caller_net_key() from public, anon, authenticated;
revoke all on function public.caller_net_keys(text[]) from public, anon, authenticated;
revoke all on function public.create_lobby(text, boolean, text, text, uuid, boolean, text[]) from public, anon;
revoke all on function public.list_lobbies(text[]) from public, anon;
grant execute on function public.create_lobby(text, boolean, text, text, uuid, boolean, text[]) to authenticated;
grant execute on function public.list_lobbies(text[]) to authenticated;

commit;

-- Shows the result: one row, net_keys_column = true and both functions = 1.
select
    exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'lobbies' and column_name = 'net_keys'
    ) as net_keys_column,
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'create_lobby') as create_lobby_functions,
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'list_lobbies') as list_lobbies_functions;
