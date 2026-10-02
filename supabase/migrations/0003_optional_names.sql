-- Player names on the live board become optional.
--
-- A pick can now be marked as made without typing who was taken. It is stored as a row with an empty
-- name, and counts exactly like a named pick for auto-advance and for finishing the draft. Typing a
-- name still works, and a name is never overwritten by marking the pick.
--
-- Run after 0002_shared_key.sql. Existing picks are untouched.

-- Allow an empty player_taken (still at most 80 characters). The check was created inline in 0001, so
-- find it by what it checks rather than trusting its generated name.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.picks'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%player_taken%'
  loop
    execute format('alter table public.picks drop constraint %I', c.conname);
  end loop;
end $$;

alter table picks add constraint picks_player_taken_len check (length(btrim(player_taken)) <= 80);

-- Same rules as before, plus p_blank_ok: store a pick with no name (without overwriting an existing name).
drop function if exists _write_pick(uuid, text, int, text);

create function _write_pick(
  p_draft uuid, p_player text, p_round int, p_text text, p_blank_ok boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
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

  if v_text = '' and not p_blank_ok then
    delete from picks where draft_id = p_draft and player = p_player and round = p_round;
    return;
  end if;

  if v_text = '' then
    insert into picks (draft_id, player, round, player_taken)
    values (p_draft, p_player, p_round, '')
    on conflict (draft_id, player, round) do nothing;
  else
    insert into picks (draft_id, player, round, player_taken)
    values (p_draft, p_player, p_round, v_text)
    on conflict (draft_id, player, round)
    do update set player_taken = excluded.player_taken, updated_at = now();
  end if;

  -- Only a pick going from empty to made on the round on the clock can move the draft forward.
  if d.status = 'live' and d.auto_advance and not v_was and p_round = d.current_round
     and d.current_round < v_rounds
     and (select count(*) from picks where draft_id = p_draft and round = p_round) = v_players then
    update drafts set current_round = current_round + 1 where id = p_draft;
  end if;

  -- Every cell made: the draft is over.
  if d.status = 'live'
     and (select count(*) from picks where draft_id = p_draft) = v_players * v_rounds then
    update drafts set status = 'complete', completed_at = now() where id = p_draft;
  end if;
end $$;

-- Mark a pick as made (no name needed), or take the mark back. A pick that already has a name keeps it
-- when marked; un-marking removes the pick entirely.
create function mark_pick(p_key text, p_draft uuid, p_player text, p_round int, p_made boolean) returns void
language plpgsql security definer set search_path = public as $$
declare d drafts%rowtype;
begin
  perform _require_key(p_key);
  select * into d from drafts where id = p_draft;
  if d.id is null or d.status = 'preview' then raise exception 'This draft has not started'; end if;
  if not (d.config -> 'names') ? p_player then raise exception 'No such player in this draft'; end if;
  if p_round < 1 or p_round > _rounds(d.config) then raise exception 'There is no round %', p_round; end if;
  perform _write_pick(p_draft, p_player, p_round, '', coalesce(p_made, false));
end $$;

-- Dropping and recreating a function resets who may run it, so apply the same lockdown as before.
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
  mark_pick(text, uuid, text, int, boolean),
  set_round(text, uuid, int),
  set_auto_advance(text, uuid, boolean),
  finish_draft(text, uuid),
  delete_draft(text, uuid)
to anon, authenticated;
