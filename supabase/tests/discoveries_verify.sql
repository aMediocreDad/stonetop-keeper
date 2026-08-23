-- =====================================================================
-- Ink & Stone — discoveries verification scenario.
-- Run by CI against the local stack (see .github/workflows/ci.yml), and by
-- hand with `psql -v ON_ERROR_STOP=1 -f`. Re-runnable any number of times.
--
-- Same begin/rollback + delete_space belt-and-suspenders as
-- statblock_verify.sql, and for the same reason: the change is a
-- write-path guard, so the fixtures span two roles and a hard rollback
-- guarantees no residue on a shared DB.
--
-- Covers: the widened CHECK, app_character_mechanics_open's type matrix
-- including its NULL doctrine, and — the point of the file — that a
-- PLAYER cannot write instinct/statblock/kind/follower on a DISCOVERY
-- row that has been handed a follower block. Nothing on screen could
-- show that hole: the sheet never offers those fields for the type.
-- =====================================================================

begin;

-- (1) The CHECK accepts the new value.
do $$
declare v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint where conname = 'characters_type_check';
  if v_def is null or v_def not like '%DISCOVERY%' then
    raise exception 'FAIL: characters_type_check does not accept DISCOVERY (%)', v_def;
  end if;
end $$;

-- (2) The predicate's type matrix, direct. Cheap, and it localises a
--     failure: if this passes and (3) fails, the wiring is the problem.
--
-- Each TRUE/FALSE assertion below is spelled with `is not true` / `is not
-- false`, never bare `if not ...` / `if ...`: in PL/pgSQL, `if NULL then`
-- takes NEITHER branch, so the naive form would silently read a NULL
-- regression in the predicate as a PASS. `is not true` / `is not false`
-- are NULL-explicit — a NULL result fails the assertion instead.
do $$
declare v_follower jsonb := '{"cost":"","loyalty":0,"leaderId":null}'::jsonb;
begin
  if public.app_character_mechanics_open('PJ', null, null) is not true then
    raise exception 'FAIL: regression — a PJ must stay mechanics-open';
  end if;
  if public.app_character_mechanics_open('PNJ', v_follower, null) is not true then
    raise exception 'FAIL: regression — a follower PNJ must stay mechanics-open';
  end if;
  if public.app_character_mechanics_open('MENACE', v_follower, null) is not false then
    raise exception 'FAIL: regression — a MENACE must never be mechanics-open';
  end if;
  if public.app_character_mechanics_open('DISCOVERY', v_follower, null) is not false then
    raise exception 'FAIL: a DISCOVERY with a follower block is mechanics-open';
  end if;
  -- NULL doctrine: callers spell their test `if not ...`, so NULL is not an
  -- acceptable answer. With a NULL type both `is distinct from` tests are
  -- true and the expression must reduce to app_is_follower alone.
  if public.app_character_mechanics_open(null, v_follower, null) is null then
    raise exception 'FAIL: app_character_mechanics_open returned NULL for a NULL type';
  end if;
end $$;

-- (3) The write path. THIS is the hole.
do $$
declare
  v_session jsonb;
  v_gtoken  text;
  v_ptoken  text;
  v_disc    uuid;
  v_db      public.characters;
begin
  v_session := public.create_space('DISCOVERY-TEST', 'gm-pw', 'player-pw');
  v_gtoken  := v_session->>'token';
  v_ptoken  := (public.join_space(v_session->'space'->>'invite_code', 'player-pw'))->>'token';

  -- A discovery the GM has (implausibly, but a restored revision or a
  -- hand-written MCP payload can do it) handed a follower block and a
  -- stat block. Visible to players: gm_only false, so the row is theirs
  -- to read and the guard is the only thing standing in the way.
  v_disc := (public.create_character(v_gtoken, jsonb_build_object(
    'name','The bronze plate', 'type','DISCOVERY', 'role','arcanum',
    'instinct','stay buried',
    'follower', jsonb_build_object('cost','','loyalty',0,'leaderId',null::jsonb),
    'statblock', jsonb_build_object('hp',3,'armor',0,'damage','none',
                                    'armorNote','verdigris','moves','[]'::jsonb),
    'kind','maker',
    'gm_only', false))).id;

  -- The player write that must be silently RETAINED, not applied. The
  -- guards do not raise (that is deliberate and unchanged): they keep the
  -- stored value and return the row.
  perform public.update_character(v_ptoken, v_disc, jsonb_build_object(
    'instinct','serve me', 'statblock', null::jsonb, 'kind', null::jsonb,
    'follower', jsonb_build_object('cost','self-promotion','loyalty',3)));
  select * into strict v_db from public.characters where id = v_disc;
  if not (v_db.instinct = 'stay buried'
          and v_db.kind = 'maker'
          and v_db.statblock->>'armorNote' = 'verdigris'
          and v_db.follower->>'loyalty' = '0') then
    raise exception 'FAIL: a player wrote mechanics on a DISCOVERY (%)', to_jsonb(v_db);
  end if;

  -- What a player MAY still write on a discovery, unchanged from every
  -- other type: campaign facts. A discovery the party found and renamed
  -- must not need the GM.
  perform public.update_character(v_ptoken, v_disc, jsonb_build_object(
    'name','The green plate', 'role','artifact',
    'traits', jsonb_build_array(jsonb_build_object('label','cleaned','checked',true))));
  select * into strict v_db from public.characters where id = v_disc;
  if not (v_db.name = 'The green plate' and v_db.role = 'artifact'
          and v_db.traits->0->>'label' = 'cleaned') then
    raise exception 'FAIL: a player could not write a discovery''s name/subtype/requirements';
  end if;

  -- And the privilege boundary still RAISES where it always did.
  begin
    perform public.update_character(v_ptoken, v_disc, jsonb_build_object('gm_notes','nope'));
    raise exception 'FAIL: player gm_notes write on a discovery did not raise FORBIDDEN';
  exception
    when sqlstate '42501' then null;  -- expected
  end;

  perform public.delete_space(v_gtoken, 'gm-pw');
end $$;

-- raise notice is swallowed by the MCP SQL runner; this is what makes a
-- passing run actually visible there.
select 'discoveries_verify: OK' as result;

rollback;
