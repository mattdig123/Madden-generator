-- Madden draft league: replace the commissioner + per-person keys with ONE shared league key.
--
-- Anyone who has the league key (it travels in the league link) can add and edit players, change the
-- settings, start drafts and enter any pick. Everyone else can only read. Nothing is writable directly;
-- every write goes through the functions below, which take the key.
--
-- Run after 0001_league.sql. Safe to run on a project that already has a league: the existing invite
-- code simply becomes the league key, so links people already have keep working.

-- ---------------------------------------------------------------------------------------------
-- Remove the old commissioner / member machinery
-- ---------------------------------------------------------------------------------------------

drop function if exists
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
  admin_delete_draft(text, uuid),
  bootstrap_league(text, text, text),
  _require_admin(text),
  _require_member(uuid, text),
  _new_token(),
  _hash_token(text);

drop table if exists member_secret;

alter table league_secret drop column if exists passcode_hash;
alter table league_secret rename column invite_code to league_key;

-- ---------------------------------------------------------------------------------------------
-- Helpers (not callable from the browser)
-- ---------------------------------------------------------------------------------------------

create function _require_key(p_key text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_key is null or not exists (select 1 from league_secret where league_key = p_key) then
    raise exception 'That league key is not right' using errcode = '28000';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Setup (run by the owner in the SQL editor; NOT callable from the browser)
-- ---------------------------------------------------------------------------------------------

create function bootstrap_league(p_name text, p_key text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from league) then
    raise exception 'The league already exists';
  end if;
  if length(coalesce(p_key, '')) < 12 then
    raise exception 'Use a league key of at least 12 characters';
  end if;
  insert into league (name) values (btrim(p_name));
  insert into league_secret (league_key) values (p_key);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Anyone with the key
-- ---------------------------------------------------------------------------------------------

create function check_key(p_key text) returns boolean
language sql security definer set search_path = public as $$
  select exists (select 1 from league_secret where league_key = p_key)
$$;

-- A new key for a new link. The old key stops working immediately.
create function rotate_key(p_key text, p_new_key text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _require_key(p_key);
  if length(coalesce(p_new_key, '')) < 12 then
    raise exception 'Use a league key of at least 12 characters';
  end if;
  update league_secret set league_key = p_new_key where id = 1;
end $$;

create function add_player(p_key text, p_name text, p_team text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform _require_key(p_key);
  if exists (select 1 from drafts where status = 'live') then
    raise exception 'Players can''t be added during a live draft';
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
  delete from drafts where status = 'preview'; -- the players changed, so any preview is stale
  return v_id;
end $$;

create function update_player(p_key text, p_player uuid, p_name text, p_team text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _require_key(p_key);
  if exists (select 1 from drafts where status = 'live') then
    raise exception 'Players can''t be changed during a live draft';
  end if;
  if not exists (select 1 from members where id = p_player) then
    raise exception 'No such player';
  end if;
  if exists (select 1 from members where id <> p_player and lower(name) = lower(btrim(p_name))) then
    raise exception 'Someone is already using that name';
  end if;
  if exists (select 1 from members where id <> p_player and team = p_team) then
    raise exception 'That team is already taken';
  end if;
  update members set name = btrim(p_name), team = p_team where id = p_player;
  delete from drafts where status = 'preview';
end $$;

create function remove_player(p_key text, p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _require_key(p_key);
  if exists (select 1 from drafts where status = 'live') then
    raise exception 'Players can''t be removed during a live draft';
  end if;
  delete from members where id = p_player;
  delete from drafts where status = 'preview';
end $$;

create function save_settings(p_key text, p_name text, p_rules jsonb, p_roster jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _require_key(p_key);
  if p_rules is not null and jsonb_typeof(p_rules) <> 'array' then raise exception 'Rules must be a list'; end if;
  if p_roster is not null and jsonb_typeof(p_roster) <> 'array' then raise exception 'Roster must be a list'; end if;
  update league set name = btrim(p_name), rules = p_rules, roster = p_roster where id = 1;
  delete from drafts where status = 'preview'; -- settings changed, so any preview is stale
end $$;

-- Snapshots the current players into a draft preview with the given rules and roster.
create function create_preview(
  p_key text, p_title text, p_seed text, p_rules jsonb, p_roster jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_names jsonb;
  v_teams jsonb;
begin
  perform _require_key(p_key);
  if exists (select 1 from drafts where status = 'live') then
    raise exception 'A draft is already in progress';
  end if;
  if (select count(*) from members) < 2 then
    raise exception 'Add at least 2 players before creating a draft';
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
create function reroll(p_key text, p_draft uuid, p_seed text, p_player text) returns void
language plpgsql security definer set search_path = public as $$
declare d drafts%rowtype;
begin
  perform _require_key(p_key);
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

create function start_draft(p_key text, p_draft uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _require_key(p_key);
  if exists (select 1 from drafts where status = 'live') then
    raise exception 'A draft is already in progress';
  end if;
  update drafts set status = 'live', current_round = 1 where id = p_draft and status = 'preview';
  if not found then raise exception 'There is no preview to start'; end if;
end $$;

-- Enter, fix or clear any player's pick in any round (live or finished drafts).
create function set_pick(p_key text, p_draft uuid, p_player text, p_round int, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare d drafts%rowtype;
begin
  perform _require_key(p_key);
  select * into d from drafts where id = p_draft;
  if d.id is null or d.status = 'preview' then raise exception 'This draft has not started'; end if;
  if not (d.config -> 'names') ? p_player then raise exception 'No such player in this draft'; end if;
  if p_round < 1 or p_round > _rounds(d.config) then raise exception 'There is no round %', p_round; end if;
  perform _write_pick(p_draft, p_player, p_round, p_text);
end $$;

create function set_round(p_key text, p_draft uuid, p_round int) returns void
language plpgsql security definer set search_path = public as $$
declare d drafts%rowtype;
begin
  perform _require_key(p_key);
  select * into d from drafts where id = p_draft;
  if d.id is null or d.status <> 'live' then raise exception 'This draft is not live'; end if;
  if p_round < 1 or p_round > _rounds(d.config) then raise exception 'There is no round %', p_round; end if;
  update drafts set current_round = p_round where id = p_draft;
end $$;

create function set_auto_advance(p_key text, p_draft uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _require_key(p_key);
  update drafts set auto_advance = p_on where id = p_draft;
end $$;

-- Ends a live draft early (for example if the group stops before every round is filled).
create function finish_draft(p_key text, p_draft uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _require_key(p_key);
  update drafts set status = 'complete', completed_at = now() where id = p_draft and status = 'live';
  if not found then raise exception 'This draft is not live'; end if;
end $$;

create function delete_draft(p_key text, p_draft uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _require_key(p_key);
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
  check_key(text),
  rotate_key(text, text),
  add_player(text, text, text),
  update_player(text, uuid, text, text),
  remove_player(text, uuid),
  save_settings(text, text, jsonb, jsonb),
  create_preview(text, text, text, jsonb, jsonb),
  reroll(text, uuid, text, text),
  start_draft(text, uuid),
  set_pick(text, uuid, text, int, text),
  set_round(text, uuid, int),
  set_auto_advance(text, uuid, boolean),
  finish_draft(text, uuid),
  delete_draft(text, uuid)
to anon, authenticated;
