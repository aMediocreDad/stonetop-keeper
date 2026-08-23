-- =====================================================================
-- Ink & Stone — discovery block verification scenario.
-- Run by CI against the local stack (see .github/workflows/ci.yml), and by
-- hand with `psql -v ON_ERROR_STOP=1 -f`. Re-runnable any number of times.
--
-- Same begin/rollback + delete_space belt-and-suspenders as
-- discoveries_verify.sql, and the bootstrap is copied from it verbatim:
-- create_space returns jsonb carrying the GM token and the invite code,
-- join_space exchanges that code for a player token.
--
-- Covers: the column round-trips both RPCs; the GM-held pair is stripped
-- for a player and kept for the GM; a PLAYER write cannot erase the pair
-- it never saw, whether the payload is an object or jsonb null; a JSON
-- scalar raises 22023 in neither the strip nor the re-graft, both INCOMING
-- and already STORED; a GM's explicit null clears while a PLAYER's does
-- not (it lands {} with the pair re-grafted — step 3b); and an absent key
-- keeps a POPULATED block. No UI can show any of it.
--
-- Not covered, deliberately: a non-object payload that is an ARRAY. One
-- `jsonb_typeof(...) = 'object'` test discriminates all three non-object
-- shapes through a single branch, and step (3b) already exercises that
-- branch with jsonb null, so an array step would add a case without
-- adding a path.
--
-- NULL doctrine, as in discoveries_verify.sql: assertions on `?` and on
-- jsonb_array_length are spelled `is not false` / `is not true`, never
-- bare — `if NULL then` takes NEITHER branch in PL/pgSQL, so the naive
-- form reads an over-stripped NULL column as a PASS.
-- =====================================================================

begin;

do $$
declare
  v_session jsonb;
  v_gtoken  text;
  v_ptoken  text;
  v_id      uuid;
  v_row     public.characters;
begin
  v_session := public.create_space('DISCBLOCK-TEST', 'gm-pw', 'player-pw');
  v_gtoken  := v_session->>'token';
  v_ptoken  := (public.join_space(v_session->'space'->>'invite_code', 'player-pw'))->>'token';

  -- (1) create_character carries the block through its allow-list.
  --     gm_only false: the row must be one a player can read at all.
  v_id := (public.create_character(v_gtoken, jsonb_build_object(
    'name', 'A half-buried plaque', 'type', 'DISCOVERY', 'role', 'arcanum',
    'gm_only', false,
    'discovery', jsonb_build_object(
      'tier', 'minor',
      'interesting', 'a maker sigil',
      'useful', 'the device is nearby',
      'moves', jsonb_build_array(
        jsonb_build_object('name', 'Thunderous Bellow', 'text', 'When you...'))
    )))).id;

  select * into strict v_row from public.characters where id = v_id;
  if v_row.discovery->>'tier' is distinct from 'minor' then
    raise exception 'FAIL: create_character dropped discovery.tier (allow-list?)';
  end if;

  -- (2a) The GM read keeps the pair.
  select * into strict v_row from public.get_characters(v_gtoken) where id = v_id;
  if v_row.discovery->>'interesting' is distinct from 'a maker sigil' then
    raise exception 'FAIL: the GM read lost discovery.interesting';
  end if;

  -- (2b) The player read strips the pair and keeps everything else.
  select * into strict v_row from public.get_characters(v_ptoken) where id = v_id;
  -- Pin the shape first: `?` on a SQL NULL left operand returns NULL, and the
  -- leak test below would then read an over-stripped column as a pass. This
  -- also puts the right message on the right failure.
  if jsonb_typeof(v_row.discovery) is distinct from 'object' then
    raise exception 'FAIL: the player read did not return an object block: %', v_row.discovery;
  end if;
  if (v_row.discovery ? 'interesting') is not false
     or (v_row.discovery ? 'useful') is not false then
    raise exception 'FAIL: the player read leaked the GM-held pair: %', v_row.discovery;
  end if;
  if v_row.discovery->>'tier' is distinct from 'minor'
     or (jsonb_array_length(v_row.discovery->'moves') = 1) is not true then
    raise exception 'FAIL: the player read over-stripped the block: %', v_row.discovery;
  end if;

  -- (3) A PLAYER write must land its own change and NOT erase the pair it
  --     never saw. This is the whole reason the column can be player-writable.
  perform public.update_character(v_ptoken, v_id, jsonb_build_object(
    'discovery', jsonb_build_object('tier', 'major')));
  select * into strict v_row from public.characters where id = v_id;
  if v_row.discovery->>'interesting' is distinct from 'a maker sigil' then
    raise exception 'FAIL: a player write ERASED the GM-held pair: %', v_row.discovery;
  end if;
  if v_row.discovery->>'tier' is distinct from 'major' then
    raise exception 'FAIL: the player write did not land: %', v_row.discovery;
  end if;

  -- (3b) The same protection must hold for a NON-OBJECT player payload.
  --      An object payload takes the re-graft branch; jsonb null and scalars
  --      would slip past it and overwrite the whole column, so they are
  --      coerced to {} before the concatenation. Without that coercion this
  --      one call silently erases prep the player never saw.
  perform public.update_character(v_ptoken, v_id, jsonb_build_object('discovery', null));
  select * into strict v_row from public.characters where id = v_id;
  if v_row.discovery->>'interesting' is distinct from 'a maker sigil'
     or v_row.discovery->>'useful' is distinct from 'the device is nearby' then
    raise exception 'FAIL: a player null-write ERASED the GM-held pair: %', v_row.discovery;
  end if;

  -- (3c) A player may not AUTHOR the pair where none is stored. The re-graft
  --      alone did not cover this: it contributes only keys that already
  --      exist, so with the pair unset the concatenation added nothing and the
  --      player's own values landed in the GM-held fields — then vanished from
  --      that player's own reads, leaving the GM prep text they never wrote.
  perform public.update_character(v_gtoken, v_id, jsonb_build_object('discovery', null));
  perform public.update_character(v_ptoken, v_id, jsonb_build_object(
    'discovery', jsonb_build_object('tier', 'minor', 'interesting', 'PLAYER FORGERY')));
  select * into strict v_row from public.characters where id = v_id;
  if v_row.discovery ? 'interesting' then
    raise exception 'FAIL: a player AUTHORED discovery.interesting where none was stored: %', v_row.discovery;
  end if;
  if v_row.discovery->>'tier' is distinct from 'minor' then
    raise exception 'FAIL: stripping the pair also dropped the player''s own key: %', v_row.discovery;
  end if;

  -- (3d) Nor at creation, which had no stored value to re-graft from.
  declare v_forged uuid;
  begin
    v_forged := (public.create_character(v_ptoken, jsonb_build_object(
      'name', 'DISCBLOCK-TEST forgery', 'type', 'PNJ',
      'discovery', jsonb_build_object('useful', 'PLAYER FORGERY')))).id;
    select * into strict v_row from public.characters where id = v_forged;
    if v_row.discovery ? 'useful' then
      raise exception 'FAIL: a player authored discovery.useful at CREATE: %', v_row.discovery;
    end if;
  end;

  -- Restore the fixture the later cases expect.
  perform public.update_character(v_gtoken, v_id, jsonb_build_object(
    'discovery', jsonb_build_object(
      'tier', 'minor', 'interesting', 'a maker sigil', 'useful', 'the device is nearby',
      'moves', jsonb_build_array(jsonb_build_object('name', 'Thunderous Bellow', 'text', 'When you...')))));

  -- (4) A JSON scalar raises 22023 in neither direction — INCOMING or STORED.
  --     `-` (the read strip) and `->` (the re-graft) both have to tolerate one,
  --     because a past write or a restored revision can have left one behind.
  perform public.update_character(v_gtoken, v_id,
    jsonb_build_object('discovery', to_jsonb('junk'::text)));
  -- (4a) stored scalar, on the READ path.
  select * into strict v_row from public.get_characters(v_ptoken) where id = v_id;
  -- (4b) incoming scalar from a player: coerced to {}, re-graft still fires.
  perform public.update_character(v_ptoken, v_id,
    jsonb_build_object('discovery', to_jsonb('junk2'::text)));
  -- (4c) stored scalar, incoming OBJECT — the case (4b) short-circuits past.
  --      This is the one that exercises `discovery->'interesting'` against a
  --      scalar left operand. Put a scalar back first: (4b) has since coerced
  --      the column to {}.
  perform public.update_character(v_gtoken, v_id,
    jsonb_build_object('discovery', to_jsonb('junk3'::text)));
  perform public.update_character(v_ptoken, v_id,
    jsonb_build_object('discovery', jsonb_build_object('tier', 'minor')));
  select * into strict v_row from public.characters where id = v_id;
  if v_row.discovery->>'tier' is distinct from 'minor' then
    raise exception 'FAIL: a player write over a STORED scalar did not land: %', v_row.discovery;
  end if;

  -- (5) A GM's explicit null clears; an absent key keeps. Every write below
  --     is the GM's on purpose — a PLAYER's null does NOT clear, and that is
  --     step (3b)'s business, not this one's.
  --
  -- "Clears" is asserted on the JSON type, not with `is not null`. On the GM
  -- branch the RPC values this column with `p_data->'discovery'`, exactly like
  -- `threat` and `statblock`, and `jsonb_build_object('discovery', null)` yields the JSON
  -- null `{"discovery": null}` — so `->` returns jsonb 'null', never SQL
  -- NULL, and the stored value is jsonb 'null'. That is the house shape, not
  -- a defect: supabase-statblock.sql's read-path guard exists precisely
  -- because "past writes can have left threat as a JSON scalar
  -- (e.g. 'null'::jsonb)". Over the wire PostgREST renders both as `null`,
  -- so the client sees a cleared block either way. The `coalesce(...,'null')`
  -- form passes whichever of the two the column ends up holding, so this
  -- assertion survives a future normalisation without being rewritten.
  perform public.update_character(v_gtoken, v_id, jsonb_build_object('discovery', null));
  select * into strict v_row from public.characters where id = v_id;
  if coalesce(jsonb_typeof(v_row.discovery), 'null') <> 'null' then
    raise exception 'FAIL: update_character did not clear discovery on an explicit null: %',
      v_row.discovery;
  end if;
  perform public.update_character(v_gtoken, v_id, jsonb_build_object('name', 'Still here'));
  select * into strict v_row from public.characters where id = v_id;
  if coalesce(jsonb_typeof(v_row.discovery), 'null') <> 'null' then
    raise exception 'FAIL: an absent key resurrected discovery: %', v_row.discovery;
  end if;
  -- ...and "keeps" is only meaningful against something worth keeping. The
  -- assertion above only proves an absent key leaves a CLEARED column alone;
  -- re-populate and repeat, or a clause that silently nulls the column on
  -- every unrelated write would pass.
  perform public.update_character(v_gtoken, v_id, jsonb_build_object(
    'discovery', jsonb_build_object('tier', 'major', 'interesting', 'a maker sigil')));
  perform public.update_character(v_gtoken, v_id, jsonb_build_object('notes', '<p>found</p>'));
  select * into strict v_row from public.characters where id = v_id;
  if v_row.discovery->>'tier' is distinct from 'major'
     or v_row.discovery->>'interesting' is distinct from 'a maker sigil' then
    raise exception 'FAIL: an absent key did not keep a POPULATED block: %', v_row.discovery;
  end if;

  perform public.delete_space(v_gtoken, 'gm-pw');
end $$;

-- raise notice is swallowed by the MCP SQL runner; this is what makes a
-- passing run actually visible there.
select 'discovery_block_verify: OK' as result;

rollback;
