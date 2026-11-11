-- Stage 7c: automatic LAN tag
--
-- Paste this whole file into the Supabase SQL Editor and press Run.
-- It is safe to run more than once. Run the Stage 7b (lan_match) migration first.
-- Run it BEFORE loading the new game code: the new code reads columns this file adds.
--
-- What changes: there is no separate "LAN lobby" any more. Every lobby is listed for everyone, and
-- the server tells each player which lobbies are hosted on the same network as them (on_lan), using
-- the network keys from Stage 7b. The game tags those LAN and lists them first, and join_lobby says
-- whether the host is on the same network so the game can try a direct local connection.
--
-- Lobbies created by older pages with is_lan = true are still only shown on their own network.

begin;

-- ---------------------------------------------------------------------------
-- list_lobbies: on_lan replaces is_lan in the result, so it is dropped and made again.
-- ---------------------------------------------------------------------------

drop function if exists public.list_lobbies(text[]);

create or replace function public.list_lobbies(p_addrs text[] default null)
returns table (
    id uuid,
    name text,
    host_name text,
    is_private boolean,
    on_lan boolean,
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
        select l.id, l.name, l.host_name, l.is_private, coalesce(l.net_keys && me, false) as on_lan,
               l.players, l.max_players, l.created_at
        from public.lobbies l
        where l.status = 'open'
          and l.last_seen > now() - interval '45 seconds'
          and (not l.is_lan or coalesce(l.net_keys && me, false))
        order by coalesce(l.net_keys && me, false) desc, l.created_at desc
        limit 50;
end;
$$;

-- ---------------------------------------------------------------------------
-- join_lobby gains p_addrs and returns on_lan. The old signature is dropped so there is only one.
-- ---------------------------------------------------------------------------

drop function if exists public.join_lobby(uuid, text);

create or replace function public.join_lobby(p_lobby uuid, p_password text, p_addrs text[] default null)
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
        'ok', true, 'peer_id', l.peer_id, 'name', l.name, 'host_name', l.host_name,
        'on_lan', coalesce(l.net_keys && public.caller_net_keys(p_addrs), false)
    );
end;
$$;

revoke all on function public.list_lobbies(text[]) from public, anon;
revoke all on function public.join_lobby(uuid, text, text[]) from public, anon;
grant execute on function public.list_lobbies(text[]) to authenticated;
grant execute on function public.join_lobby(uuid, text, text[]) to authenticated;

commit;

-- Shows the result: one row, list_lobbies_functions = 1 and join_lobby_functions = 1.
select
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'list_lobbies') as list_lobbies_functions,
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'join_lobby') as join_lobby_functions;
