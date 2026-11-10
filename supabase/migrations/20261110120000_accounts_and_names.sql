-- Stage 2: accounts and names
--
-- Paste this whole file into the Supabase SQL Editor and press Run.
-- It is safe to run more than once.
--
-- What it does:
--   * display_name rules enforced in the database: 3-16 characters, letters, numbers,
--     underscores and single spaces, no leading or trailing space, unique ignoring case
--   * every profile gets a default name like "Spore1234"
--   * players can read only their own profile row, and can no longer write to the table
--     directly. All writes go through the two functions at the bottom.

begin;

create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    display_name text,
    created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- ---------------------------------------------------------------------------
-- Name helpers
-- ---------------------------------------------------------------------------

-- Trims the ends and squeezes runs of whitespace down to one space.
create or replace function public.clean_display_name(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
    select btrim(regexp_replace(coalesce(raw, ''), '\s+', ' ', 'g'));
$$;

-- The one definition of a valid name. Used by the table constraint and by set_display_name.
create or replace function public.display_name_ok(name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
    select name is not null
        and char_length(name) between 3 and 16
        and name ~ '^[A-Za-z0-9_]+( [A-Za-z0-9_]+)*$';
$$;

-- Picks a free default name: Spore1000 to Spore9999, then six digits if those are crowded.
create or replace function public.random_display_name()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
    candidate text;
begin
    for i in 1..30 loop
        candidate := 'Spore' || (1000 + floor(random() * 9000))::int;
        if not exists (select 1 from public.profiles where lower(display_name) = lower(candidate)) then
            return candidate;
        end if;
    end loop;
    return 'Spore' || (100000 + floor(random() * 900000))::int;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fix up existing rows, then add the rules
-- ---------------------------------------------------------------------------

alter table public.profiles drop constraint if exists profiles_display_name_check;
drop index if exists public.profiles_display_name_lower_key;

do $$
declare
    r record;
begin
    update public.profiles
    set display_name = public.clean_display_name(display_name)
    where display_name is not null
        and display_name <> public.clean_display_name(display_name);

    -- Missing names, names that break the rules, and every duplicate after the oldest one.
    for r in
        select id
        from (
            select id, display_name,
                row_number() over (partition by lower(display_name) order by created_at, id) as n
            from public.profiles
        ) t
        where not public.display_name_ok(display_name) or n > 1
    loop
        update public.profiles set display_name = public.random_display_name() where id = r.id;
    end loop;
end;
$$;

alter table public.profiles alter column display_name set not null;

alter table public.profiles
    add constraint profiles_display_name_check check (public.display_name_ok(display_name));

create unique index profiles_display_name_lower_key on public.profiles (lower(display_name));

-- ---------------------------------------------------------------------------
-- Row-level security: read your own row, write nothing directly
-- ---------------------------------------------------------------------------

do $$
declare
    p record;
begin
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'profiles' loop
        execute format('drop policy %I on public.profiles', p.policyname);
    end loop;
end;
$$;

create policy profiles_select_own on public.profiles
    for select to authenticated
    using ((select auth.uid()) = id);

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Functions the game calls
-- ---------------------------------------------------------------------------

-- Returns the caller's profile, creating it with a default name the first time.
create or replace function public.ensure_profile()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
    uid uuid := auth.uid();
    p public.profiles;
begin
    if uid is null then
        raise exception 'not_signed_in' using errcode = '28000';
    end if;

    select * into p from public.profiles where id = uid;
    if found then
        return p;
    end if;

    for i in 1..5 loop
        begin
            insert into public.profiles (id, display_name)
            values (uid, public.random_display_name())
            on conflict (id) do nothing;

            select * into p from public.profiles where id = uid;
            return p;
        exception when unique_violation then
            -- Another player took that default name in the same instant. Pick again.
            null;
        end;
    end loop;

    raise exception 'name_generation_failed';
end;
$$;

-- Changes the caller's name. Returns the cleaned-up name that was stored.
-- Raises 'name_invalid' or 'name_taken' so the game can show a clear message.
create or replace function public.set_display_name(new_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    uid uuid := auth.uid();
    cleaned text := public.clean_display_name(new_name);
    changed int;
begin
    if uid is null then
        raise exception 'not_signed_in' using errcode = '28000';
    end if;

    if not public.display_name_ok(cleaned) then
        raise exception 'name_invalid';
    end if;

    begin
        update public.profiles set display_name = cleaned where id = uid;
        get diagnostics changed = row_count;
    exception when unique_violation then
        raise exception 'name_taken';
    end;

    if changed = 0 then
        raise exception 'no_profile';
    end if;

    return cleaned;
end;
$$;

-- The two pure helpers stay callable (the table constraint uses one of them).
revoke all on function public.random_display_name() from public, anon, authenticated;
revoke all on function public.ensure_profile() from public, anon;
revoke all on function public.set_display_name(text) from public, anon;
grant execute on function public.ensure_profile() to authenticated;
grant execute on function public.set_display_name(text) to authenticated;

commit;

-- Shows the newest profiles so you can see the result.
select id, display_name, created_at from public.profiles order by created_at desc limit 10;
