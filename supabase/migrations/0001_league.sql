-- Madden draft league: shared tables, locked-down writes, and RPC functions.
--
-- Everyone can READ the league, members, drafts and picks (the site is public to anyone with the link).
-- Nothing can be written directly. All writes go through the functions below, which check either a
-- member token (players entering their own pick) or the commissioner passcode.
--
-- Run this once in the Supabase SQL editor, then bootstrap the league (see docs/SETUP.md).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

create table league (
  id int primary key default 1 check (id = 1),
  name text not null,
  -- null means "use the app defaults"
  rules jsonb,
  roster jsonb,
  created_at timestamptz not null default now()
);

create table league_secret (
  id int primary key default 1 references league (id) on delete cascade,
  passcode_hash text not null,
  invite_code text not null
);

create table members (
  id uuid primary key default gen_random_uuid(),
  -- strict join order (timestamps can tie)
  join_order bigint generated always as identity,
  name text not null check (length(btrim(name)) between 1 and 40),
  team text not null check (team ~ '^[a-z]{2,3}$'),
  joined_at timestamptz not null default now()
);
create unique index members_name_key on members (lower(name));
create unique index members_team_key on members (team);

create table member_secret (
  member_id uuid primary key references members (id) on delete cascade,
  token_hash text not null
);

create table drafts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text not null check (status in ('preview', 'live', 'complete')),
  -- seed, names, teams, rerolls, rules, roster: positions are derived from this by the app
  config jsonb not null,
  current_round int not null default 1,
  auto_advance boolean not null default true,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table picks (
  draft_id uuid not null references drafts (id) on delete cascade,
  player text not null,
  round int not null check (round >= 1),
  player_taken text not null check (length(btrim(player_taken)) between 1 and 80),
  updated_at timestamptz not null default now(),
  primary key (draft_id, player, round)
);

-- ---------------------------------------------------------------------------------------------
-- Row-level security: public read, no direct writes, secrets unreachable
-- ---------------------------------------------------------------------------------------------

alter table league enable row level security;
alter table league_secret enable row level security;
alter table members enable row level security;
alter table member_secret enable row level security;
alter table drafts enable row level security;
alter table picks enable row level security;

create policy "public read" on league for select to anon, authenticated using (true);
create policy "public read" on members for select to anon, authenticated using (true);
create policy "public read" on drafts for select to anon, authenticated using (true);
create policy "public read" on picks for select to anon, authenticated using (true);

revoke all on league, league_secret, members, member_secret, drafts, picks from anon, authenticated;
grant select on league, members, drafts, picks to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Helpers (not callable from the browser)
-- ---------------------------------------------------------------------------------------------

create function _require_admin(p_passcode text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_passcode is null or not exists (
    select 1 from league_secret where passcode_hash = crypt(p_passcode, passcode_hash)
  ) then
    raise exception 'Wrong commissioner passcode' using errcode = '28000';
  end if;
end $$;

-- Returns the member's name when the id and token match.
create function _require_member(p_member uuid, p_token text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_name text;
begin
  select m.name into v_name
  from members m join member_secret s on s.member_id = m.id
  where m.id = p_member and s.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if v_name is null then
    raise exception 'You are not signed in as that member' using errcode = '28000';
  end if;
  return v_name;
end $$;

create function _new_token() returns text
language sql set search_path = public, extensions as $$
  select encode(gen_random_bytes(24), 'hex')
$$;

create function _hash_token(p_token text) returns text
language sql set search_path = public, extensions as $$
  select encode(digest(p_token, 'sha256'), 'hex')
$$;

create function _rounds(p_config jsonb) returns int
language sql immutable set search_path = public as $$
  select coalesce(sum((r ->> 'count')::int), 0)::int from jsonb_array_elements(p_config -> 'roster') r
$$;

-- Writes (or clears) one pick and applies auto-advance / completion. Caller has already authorised it.
create function _write_pick(p_draft uuid, p_player text, p_round int, p_text text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  d drafts%rowtype;
  v_text text := left(btrim(coalesce(p_text, '')), 80);
  v_rounds int;
  v_players int;
  v_was boolean;
begin
  select * into d from drafts where id = p_draft for update;
  v_rounds := _rounds(d.config);
  v_players := jsonb_array_length(d.config -> 'names');

  select exists (
    select 1 from picks where draft_id = p_draft and player = p_player and round = p_round
  ) into v_was;

  if v_text = '' then
    delete from picks where draft_id = p_draft and player = p_player and round = p_round;
    return;
  end if;

  insert into picks (draft_id, player, round, player_taken)
  values (p_draft, p_player, p_round, v_text)
  on conflict (draft_id, player, round)
  do update set player_taken = excluded.player_taken, updated_at = now();

  -- Only a pick going from empty to filled on the round on the clock can move the draft forward.
  if d.status = 'live' and d.auto_advance and not v_was and p_round = d.current_round
     and d.current_round < v_rounds
     and (select count(*) from picks where draft_id = p_draft and round = p_round) = v_players then
    update drafts set current_round = current_round + 1 where id = p_draft;
  end if;

  -- Every cell filled: the draft is over.
  if d.status = 'live'
     and (select count(*) from picks where draft_id = p_draft) = v_players * v_rounds then
    update drafts set status = 'complete', completed_at = now() where id = p_draft;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Setup (run by the owner in the SQL editor; NOT callable from the browser)
-- ---------------------------------------------------------------------------------------------

create function bootstrap_league(p_name text, p_passcode text, p_invite text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if exists (select 1 from league) then
    raise exception 'The league already exists';
  end if;
  if length(coalesce(p_passcode, '')) < 8 then
    raise exception 'Use a commissioner passcode of at least 8 characters';
  end if;
  if length(coalesce(p_invite, '')) < 4 then
    raise exception 'Use an invite code of at least 4 characters';
  end if;
  insert into league (name) values (btrim(p_name));
  insert into league_secret (passcode_hash, invite_code) values (crypt(p_passcode, gen_salt('bf')), p_invite);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Member functions
-- ---------------------------------------------------------------------------------------------

create function join_league(p_invite text, p_name text, p_team text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid;
  v_token text := _new_token();
begin
  if not exists (select 1 from league_secret where invite_code = p_invite) then
    raise exception 'That invite code is not valid';
  end if;
  if exists (select 1 from drafts where status = 'live') then
    raise exception 'A draft is in progress, so nobody can join right now';
  end if;
  if (select count(*) from members) >= 32 then
    raise exception 'The league is full';
  end if;
  if exists (select 1 from members where lower(name) = lower(btrim(p_name))) then
    raise exception 'Someone is already using that name';
  end if;
  if exists (select 1 from members where team = p_team) then
    raise exception 'That team is already taken';
  end if;

  insert into members (name, team) values (btrim(p_name), p_team) returning id into v_id;
  insert into member_secret (member_id, token_hash) values (v_id, _hash_token(v_token));
  delete from drafts where status = 'preview'; -- the roster of players changed
  return jsonb_build_object('member_id', v_id, 'token', v_token);
end $$;

create function submit_pick(p_draft uuid, p_member uuid, p_token text, p_round int, p_text text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_name text := _require_member(p_member, p_token);
  d drafts%rowtype;
begin
  select * into d from drafts where id = p_draft;
  if d.id is null or d.status <> 'live' then
    raise exception 'This draft is not live';
  end if;
  if not (d.config -> 'names') ? v_name then
    raise exception 'You are not part of this draft';
  end if;
  if p_round < 1 or p_round > _rounds(d.config) then
    raise exception 'There is no round %', p_round;
  end if;
  if p_round > d.current_round then
    raise exception 'Round % has not opened yet', p_round;
  end if;
  perform _write_pick(p_draft, v_name, p_round, p_text);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Commissioner functions
-- ---------------------------------------------------------------------------------------------

create function admin_login(p_passcode text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  return exists (select 1 from league_secret where passcode_hash = crypt(coalesce(p_passcode, ''), passcode_hash));
end $$;

create function admin_get_invite(p_passcode text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v text;
begin
  perform _require_admin(p_passcode);
  select invite_code into v from league_secret;
  return v;
end $$;

create function admin_save_settings(p_passcode text, p_name text, p_rules jsonb, p_roster jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _require_admin(p_passcode);
  if p_rules is not null and jsonb_typeof(p_rules) <> 'array' then raise exception 'Rules must be a list'; end if;
  if p_roster is not null and jsonb_typeof(p_roster) <> 'array' then raise exception 'Roster must be a list'; end if;
  update league set name = btrim(p_name), rules = p_rules, roster = p_roster where id = 1; -- Supabase rejects UPDATE/DELETE without WHERE
  delete from drafts where status = 'preview'; -- settings changed, so any preview is stale
end $$;

create function admin_remove_member(p_passcode text, p_member uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _require_admin(p_passcode);
  if exists (select 1 from drafts where status = 'live') then
    raise exception 'Members cannot be removed during a live draft';
  end if;
  delete from members where id = p_member;
  delete from drafts where status = 'preview';
end $$;

-- A new token for a member who switched devices. The old one stops working.
create function admin_issue_claim_token(p_passcode text, p_member uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_token text := _new_token();
begin
  perform _require_admin(p_passcode);
  if not exists (select 1 from members where id = p_member) then raise exception 'No such member'; end if;
  update member_secret set token_hash = _hash_token(v_token) where member_id = p_member;
  return v_token;
end $$;

-- Snapshots the current members into a draft preview with the league's rules and roster.
create function admin_create_preview(
  p_passcode text, p_title text, p_seed text, p_rules jsonb, p_roster jsonb
) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid;
  v_names jsonb;
  v_teams jsonb;
begin
  perform _require_admin(p_passcode);
  if exists (select 1 from drafts where status = 'live') then
    raise exception 'A draft is already in progress';
  end if;
  if (select count(*) from members) < 2 then
    raise exception 'At least 2 members need to join before a draft can be created';
  end if;
  select jsonb_agg(name order by join_order), jsonb_object_agg(name, team)
    into v_names, v_teams from members;

  delete from drafts where status = 'preview';
  insert into drafts (title, status, config)
  values (
    coalesce(nullif(btrim(p_title), ''), 'Draft'),
    'preview',
    jsonb_build_object(
      'seed', p_seed, 'names', v_names, 'teams', v_teams, 'rerolls', '{}'::jsonb,
      'rules', coalesce(p_rules, '[]'::jsonb), 'roster', p_roster
    )
  )
  returning id into v_id;
  return v_id;
end $$;

-- Re-rolls a preview: everyone (new seed) or a single player (bumps their counter).
create function admin_reroll(p_passcode text, p_draft uuid, p_seed text, p_player text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare d drafts%rowtype;
begin
  perform _require_admin(p_passcode);
  select * into d from drafts where id = p_draft for update;
  if d.id is null or d.status <> 'preview' then
    raise exception 'Only a preview can be re-rolled';
  end if;
  if p_player is null then
    update drafts set config = jsonb_set(jsonb_set(config, '{seed}', to_jsonb(p_seed)), '{rerolls}', '{}'::jsonb)
    where id = p_draft;
  else
    if not (d.config -> 'names') ? p_player then raise exception 'No such player in this draft'; end if;
    update drafts set config = jsonb_set(
      config, array['rerolls', p_player],
      to_jsonb(coalesce((config -> 'rerolls' ->> p_player)::int, 0) + 1), true
    ) where id = p_draft;
  end if;
end $$;

create function admin_start_draft(p_passcode text, p_draft uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _require_admin(p_passcode);
  if exists (select 1 from drafts where status = 'live') then
    raise exception 'A draft is already in progress';
  end if;
  update drafts set status = 'live', current_round = 1 where id = p_draft and status = 'preview';
  if not found then raise exception 'There is no preview to start'; end if;
end $$;

create function admin_set_pick(p_passcode text, p_draft uuid, p_player text, p_round int, p_text text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare d drafts%rowtype;
begin
  perform _require_admin(p_passcode);
  select * into d from drafts where id = p_draft;
  if d.id is null or d.status = 'preview' then raise exception 'This draft has not started'; end if;
  if not (d.config -> 'names') ? p_player then raise exception 'No such player in this draft'; end if;
  if p_round < 1 or p_round > _rounds(d.config) then raise exception 'There is no round %', p_round; end if;
  perform _write_pick(p_draft, p_player, p_round, p_text);
end $$;

create function admin_set_round(p_passcode text, p_draft uuid, p_round int) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare d drafts%rowtype;
begin
  perform _require_admin(p_passcode);
  select * into d from drafts where id = p_draft;
  if d.id is null or d.status <> 'live' then raise exception 'This draft is not live'; end if;
  if p_round < 1 or p_round > _rounds(d.config) then raise exception 'There is no round %', p_round; end if;
  update drafts set current_round = p_round where id = p_draft;
end $$;

create function admin_set_auto_advance(p_passcode text, p_draft uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _require_admin(p_passcode);
  update drafts set auto_advance = p_on where id = p_draft;
end $$;

-- Ends a live draft early (for example if the group stops before every round is filled).
create function admin_finish_draft(p_passcode text, p_draft uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _require_admin(p_passcode);
  update drafts set status = 'complete', completed_at = now() where id = p_draft and status = 'live';
  if not found then raise exception 'This draft is not live'; end if;
end $$;

create function admin_delete_draft(p_passcode text, p_draft uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _require_admin(p_passcode);
  delete from drafts where id = p_draft;
end $$;

-- ---------------------------------------------------------------------------------------------
-- What the browser may call
-- ---------------------------------------------------------------------------------------------

-- Postgres lets everyone run new functions by default. Take that away from every function in the
-- schema first (helpers, bootstrap_league and anything else), then grant back only the list below.
-- The functions themselves are SECURITY DEFINER, so they still work for the callers allowed here.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  join_league(text, text, text),
  submit_pick(uuid, uuid, text, int, text),
  admin_login(text),
  admin_get_invite(text),
  admin_save_settings(text, text, jsonb, jsonb),
  admin_remove_member(text, uuid),
  admin_issue_claim_token(text, uuid),
  admin_create_preview(text, text, text, jsonb, jsonb),
  admin_reroll(text, uuid, text, text),
  admin_start_draft(text, uuid),
  admin_set_pick(text, uuid, text, int, text),
  admin_set_round(text, uuid, int),
  admin_set_auto_advance(text, uuid, boolean),
  admin_finish_draft(text, uuid),
  admin_delete_draft(text, uuid)
to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table league, members, drafts, picks;
  end if;
end $$;
