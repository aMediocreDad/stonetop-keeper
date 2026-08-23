-- =====================================================================
-- Ink & Stone — statblock / kind / follower verification scenario.
-- Run by CI against the local stack (see .github/workflows/ci.yml), and by
-- hand with `psql -v ON_ERROR_STOP=1 -f`.
-- Unlike the other tests/*_verify.sql scripts, this one wraps its own
-- fixtures in begin/rollback rather than relying solely on delete_space
-- cleanup: statblock's write guards are read-path *and* write-path (not
-- just an additive column), so the fixtures span several roles/rows and
-- a hard rollback is the simplest way to guarantee no residue on a
-- shared DB. It still calls delete_space near the end too, matching the
-- other scripts' convention, belt-and-suspenders with the rollback.
-- Covers: app_is_follower's NULL behaviour (group 0 — the one bug that
-- only shows up in SQL), app_character_mechanics_open's type matrix
-- (group 0bis), the read/write matrix for
-- instinct/statblock/kind/follower, followerhood WITHOUT a stat block,
-- the legacy nested shape a pre-migration revision restore resurrects,
-- a GM-type-write regression guard, gm_notes/gm_only leak checks,
-- create_character's own write guard (positive + negative), the rule
-- that a MENACE is never a follower however its columns are shaped
-- (group 11 — a REVEALED threat is the row where that leaks), and three
-- role-gate (FORBIDDEN) probes across player and viewer sessions.
-- Re-runnable any number of times.
-- =====================================================================

begin;

do $$
declare
  v_session            jsonb;
  v_gtoken             text;
  v_ptoken             text;
  v_vtoken             text;
  v_row                public.characters;
  v_read               public.characters;
  v_db                 public.characters;
  v_pnj_a              uuid;  -- plain PNJ: statblock + kind + instinct + legacy threat.instinct + gm_notes
  v_pnj_bare           uuid;  -- plain PNJ with NOTHING set: both followerhood arms are SQL NULL
  v_gm_only            uuid;  -- gm_only PNJ: must be absent from every player/viewer read
  v_pnj_follower       uuid;  -- PNJ with follower = {...} (object) AND a stat block
  v_pnj_follower_bare  uuid;  -- PNJ with follower = {...} and NO stat block at all
  v_pnj_legacy         uuid;  -- PNJ whose follower still lives INSIDE statblock (pre-migration shape)
  v_pnj_null_follower  uuid;  -- PNJ with follower = null (must NOT count)
  v_pj                 uuid;  -- player character
  v_menace             uuid;  -- REVEALED threat carrying a follower object
  v_menace_legacy      uuid;  -- REVEALED threat whose follower is nested in statblock
begin
  ------------------------------------------------------------------
  -- (0) app_is_follower never returns NULL.
  --
  -- THE bug this file exists to catch. jsonb_typeof() of a SQL NULL is
  -- NULL, so a `=` comparison yields NULL for the overwhelmingly common
  -- shape (no follower, no statblock) — and the read rule's
  -- `if type <> 'PJ' and not <NULL>` then falls through WITHOUT
  -- stripping, publishing every plain NPC's stat block, kind and
  -- instinct to every player. Only SQL can see this: the client-side
  -- predicate is a separate implementation and stays correct.
  ------------------------------------------------------------------
  if public.app_is_follower(null, null) is not false
     or public.app_is_follower(null, '{"hp":6}'::jsonb) is not false
     or public.app_is_follower('null'::jsonb, null) is not false
     or public.app_is_follower('{"cost":"x"}'::jsonb, null) is not true
     or public.app_is_follower(null, '{"follower":{"cost":"x"}}'::jsonb) is not true then
    raise exception 'FAIL: app_is_follower returned NULL or the wrong verdict for some shape';
  end if;

  ------------------------------------------------------------------
  -- (0bis) app_character_mechanics_open: the POLICY predicate — which
  -- rows' mechanics belong to a player rather than to GM prep. It is
  -- app_is_follower plus the two type rules: a PJ is always open, and a
  -- MENACE is NEVER a follower however its columns are shaped (a threat
  -- sheet is GM prep; the book's follower layer describes someone who
  -- travels with the PCs). Both followerhood arms must be closed for a
  -- MENACE — the nested legacy one included, since a revision restore
  -- can hand back exactly that shape.
  --
  -- Same NULL doctrine as group (0): never NULL, or the read rule's
  -- `if not <NULL>` falls through without stripping.
  ------------------------------------------------------------------
  if public.app_character_mechanics_open('PJ', null, null) is not true
     or public.app_character_mechanics_open('PNJ', null, null) is not false
     or public.app_character_mechanics_open('PNJ', '{"cost":"x"}'::jsonb, null) is not true
     or public.app_character_mechanics_open('PNJ', null, '{"follower":{"cost":"x"}}'::jsonb) is not true
     or public.app_character_mechanics_open('MENACE', null, null) is not false
     or public.app_character_mechanics_open('MENACE', '{"cost":"x"}'::jsonb, null) is not false
     or public.app_character_mechanics_open('MENACE', null, '{"follower":{"cost":"x"}}'::jsonb) is not false
     -- A PJ stays open even if something has left a follower block on it.
     or public.app_character_mechanics_open('PJ', '{"cost":"x"}'::jsonb, null) is not true then
    raise exception 'FAIL: app_character_mechanics_open returned NULL or the wrong verdict for some shape';
  end if;

  ------------------------------------------------------------------
  -- Fixtures: GM session, player session, a viewer session (needs
  -- public_read on), and characters covering the followerhood matrix
  -- the migration branches on.
  ------------------------------------------------------------------
  v_session := public.create_space('STATBLOCK-TEST', 'gm-pw', 'player-pw');
  v_gtoken  := v_session->>'token';
  v_ptoken  := (public.join_space(v_session->'space'->>'invite_code', 'player-pw'))->>'token';
  perform public.update_space_settings(v_gtoken, 'gm-pw', jsonb_build_object('public_read', true));
  v_vtoken  := (public.join_space(v_session->'space'->>'invite_code', ''))->>'token';

  -- Plain PNJ: monster stat block (no follower), a bestiary kind,
  -- instinct set, a legacy threat blob that still carries its own
  -- instinct key (the pre-migration shape the read/write guards must not
  -- leak), and gm_notes (must never reach a non-GM reader).
  v_row := public.create_character(v_gtoken, jsonb_build_object(
    'name','Grave Warden','role','undead sentinel','type','PNJ',
    'instinct','guard the barrow',
    'gm_notes','secret GM prep — do not show players',
    'kind','undead',
    'tags', jsonb_build_array('solitary','stealthy'),
    'statblock', jsonb_build_object(
      'hp',12,'armor',1,'armorNote','ancient chain',
      'damage','d8','specialQualities','unnerving stillness',
      'moves', jsonb_build_array('grapple and drag')),
    'threat', jsonb_build_object(
      'instinct','hollow out the barrow',
      'portents', jsonb_build_array('cold wind'),
      'stakes', '[]'::jsonb, 'gmMoves', '[]'::jsonb,
      'impendingDoom', jsonb_build_object('text','','done',false))));
  v_pnj_a := v_row.id;

  -- Bare PNJ: statblock, kind and follower all SQL NULL. This is the
  -- shape group (0) is about — and the most common row in a real
  -- grimoire, so it gets a full read assertion of its own below.
  v_row := public.create_character(v_gtoken, jsonb_build_object(
    'name','Village Baker','role','baker','type','PNJ',
    'instinct','keep the ovens lit'));
  v_pnj_bare := v_row.id;

  -- gm_only PNJ: must never appear in a non-GM read at all (long-standing
  -- behaviour of the GM layer; asserted here because check (2) shares the
  -- same read call and it costs nothing extra to prove).
  v_row := public.create_character(v_gtoken, jsonb_build_object(
    'name','Secret NPC','role','hidden threat','type','PNJ','gm_only',true,
    'instinct','lurk unseen'));
  v_gm_only := v_row.id;

  -- Follower PNJ: `follower` is an object -> player-facing rows, because a
  -- follower's sheet belongs to the player who recruited them rather than to
  -- the GM's prep.
  v_row := public.create_character(v_gtoken, jsonb_build_object(
    'name','Rowan the Sworn','role','sworn follower','type','PNJ',
    'instinct','protect the caravan',
    'kind','npc',
    'statblock', jsonb_build_object(
      'hp',6,'armor',0,'armorNote','','damage','d6',
      'specialQualities','','moves','[]'::jsonb),
    'follower', jsonb_build_object('cost',1,'loyalty',2,'leaderId',null::jsonb)));
  v_pnj_follower := v_row.id;

  -- Follower PNJ with NO stat block: the whole point of hoisting
  -- `follower` out of the JSONB. Followerhood must not require stats.
  v_row := public.create_character(v_gtoken, jsonb_build_object(
    'name','Maren the Smith','role','smith','type','PNJ',
    'instinct','finish what she started',
    'follower', jsonb_build_object('cost','a forge','loyalty',1,'leaderId',null::jsonb)));
  v_pnj_follower_bare := v_row.id;

  -- PNJ with an explicit follower = null — must NOT count as
  -- followerhood: the guard uses jsonb_typeof(...) = 'object', not `?`.
  v_row := public.create_character(v_gtoken, jsonb_build_object(
    'name','Not Actually A Follower','role','drifter','type','PNJ',
    'instinct','wander the roads',
    'kind','npc',
    'follower', null::jsonb));
  v_pnj_null_follower := v_row.id;

  -- Prove the fixture actually landed as JSON null rather than silently
  -- becoming SQL NULL — otherwise check (4) below would pass vacuously
  -- under a `?`-based guard too, defeating the point of the typeof test.
  select * into strict v_db from public.characters where id = v_pnj_null_follower;
  if jsonb_typeof(v_db.follower) is distinct from 'null' then
    raise exception 'FAIL: fixture follower=null did not persist as JSON null';
  end if;

  -- Legacy shape: `follower` still nested inside `statblock`, columns
  -- empty. Only a revision undo older than this migration produces it,
  -- and it must still read as a follower — otherwise an undo silently
  -- takes a player's own follower sheet away from them, through the
  -- one-way door. Written directly: no RPC accepts this shape any more.
  v_row := public.create_character(v_gtoken, jsonb_build_object(
    'name','Restored Squire','role','squire','type','PNJ',
    'instinct','carry the shield'));
  v_pnj_legacy := v_row.id;
  update public.characters
     set statblock = jsonb_build_object('hp',4,'armor',0,'moves','[]'::jsonb,
           'kind','npc',
           'follower', jsonb_build_object('cost',1,'loyalty',1,'leaderId',null::jsonb)),
         kind = null, follower = null
   where id = v_pnj_legacy;

  -- PJ: instinct (and, per the guard, statblock too) is always
  -- player-visible regardless of any follower shape.
  v_row := public.create_character(v_gtoken, jsonb_build_object(
    'name','Ysolde','role','ranger','type','PJ',
    'instinct','protect the party'));
  v_pj := v_row.id;

  -- REVEALED threat (gm_only false — the GM has shown it to the table)
  -- that ALSO carries a follower object. This is the row the MENACE rule
  -- exists for: `gm_only` is the app's only reveal switch, so a revealed
  -- threat is a visible row, and before the rule its followerhood opened
  -- the GM's instinct, stat block and legacy threat->'instinct' to every
  -- player — for reading AND writing. No `role`: a threat has none, and
  -- create_character must accept a payload that omits the key (the column
  -- is NOT NULL, so an un-coalesced p_data->>'role' raises 23502).
  v_row := public.create_character(v_gtoken, jsonb_build_object(
    'name','The Pale Hunter','type','MENACE',
    'instinct','hunt the ones who trespass',
    'gm_only', false,
    'gm_notes','the Hunter is Fflur''s bargain come due',
    'kind','spirit',
    'tags', jsonb_build_array('large','stealthy'),
    'statblock', jsonb_build_object(
      'hp',20,'armor',2,'armorNote','','damage','d10',
      'specialQualities','walks between','moves','[]'::jsonb),
    'threat', jsonb_build_object(
      'instinct','claim the wood',
      'portents', jsonb_build_array('hoofprints in ash'),
      'stakes','[]'::jsonb,'gmMoves','[]'::jsonb,
      'impendingDoom', jsonb_build_object('text','','done',false)),
    'follower', jsonb_build_object('cost','a life','loyalty',1,'leaderId',null::jsonb)));
  v_menace := v_row.id;
  if v_row.role <> '' then
    raise exception 'FAIL: create_character did not default a missing role to empty';
  end if;

  -- Same, but with the follower nested in `statblock` — the shape a
  -- pre-migration revision restore resurrects. The nested arm has to be
  -- closed for a MENACE too, or an undo re-opens the leak.
  v_row := public.create_character(v_gtoken, jsonb_build_object(
    'name','Revenants of the Gwead','type','MENACE',
    'instinct','drag the living down','gm_only', false));
  v_menace_legacy := v_row.id;
  update public.characters
     set statblock = jsonb_build_object('hp',8,'armor',0,'moves','[]'::jsonb,
           'follower', jsonb_build_object('cost',1,'loyalty',1,'leaderId',null::jsonb)),
         follower = null
   where id = v_menace_legacy;

  ------------------------------------------------------------------
  -- (1) GM read: a plain PNJ's statblock + kind + instinct return intact.
  ------------------------------------------------------------------
  select c.* into strict v_read from public.get_characters(v_gtoken) c where c.id = v_pnj_a;
  if not (v_read.instinct = 'guard the barrow'
          and v_read.kind = 'undead'
          and v_read.statblock->>'armorNote' = 'ancient chain') then
    raise exception 'FAIL: GM read of plain PNJ statblock/kind/instinct intact';
  end if;

  ------------------------------------------------------------------
  -- (1bis) GM write of `type` still works after gating it to GM-only
  -- (regression guard for the critical fix: type is GM-writable, just
  -- not player-writable). Round-trips through a different value and
  -- back so a "silently keep old value" bug would be caught, then
  -- restores 'PNJ' before the checks below rely on it.
  ------------------------------------------------------------------
  v_row := public.update_character(v_gtoken, v_pnj_a, jsonb_build_object('type','GROUPE'));
  if v_row.type <> 'GROUPE' then
    raise exception 'FAIL: GM type write regressed';
  end if;
  v_row := public.update_character(v_gtoken, v_pnj_a, jsonb_build_object('type','PNJ'));
  if v_row.type <> 'PNJ' then
    raise exception 'FAIL: GM type write (restore) regressed';
  end if;

  ------------------------------------------------------------------
  -- (2) Player read, plain PNJ: the MECHANICS go — instinct='',
  --     statblock null, legacy threat->'instinct' stripped (other threat
  --     keys survive), gm_notes stripped — but the DESCRIPTION stays:
  --     `kind` and `tags` are what a table observes about a creature it
  --     can see, and the client decides whether tags apply from `kind`,
  --     so nulling it silently hid a visible monster's tags. A creature
  --     the GM has not revealed is a `gm_only` row, asserted just below.
  ------------------------------------------------------------------
  select c.* into strict v_read from public.get_characters(v_ptoken) c where c.id = v_pnj_a;
  if not (v_read.instinct = ''
          and v_read.statblock is null
          and not (v_read.threat ? 'instinct')
          and (v_read.threat ? 'portents')
          and v_read.gm_notes is null) then
    raise exception 'FAIL: player read of plain PNJ stripped instinct/statblock/threat.instinct/gm_notes';
  end if;
  if not (v_read.kind = 'undead' and v_read.tags ? 'stealthy') then
    raise exception 'FAIL: player read of plain PNJ lost the kind/tags description';
  end if;
  if exists (select 1 from public.get_characters(v_ptoken) c where c.id = v_gm_only) then
    raise exception 'FAIL: gm_only row leaked to player read';
  end if;

  ------------------------------------------------------------------
  -- (2bis) Player read, BARE PNJ (statblock/kind/follower all SQL NULL):
  --        instinct still stripped. Same rule as (2), but this is the
  --        row shape a NULL-returning app_is_follower lets through — the
  --        one in (2) at least has a statblock object to probe into.
  ------------------------------------------------------------------
  select c.* into strict v_read from public.get_characters(v_ptoken) c where c.id = v_pnj_bare;
  if v_read.instinct <> '' then
    raise exception 'FAIL: player read of a bare PNJ leaked the instinct';
  end if;

  ------------------------------------------------------------------
  -- (3) Player read, follower PNJ: instinct, statblock, kind and the
  --     follower block itself all return intact.
  ------------------------------------------------------------------
  select c.* into strict v_read from public.get_characters(v_ptoken) c where c.id = v_pnj_follower;
  if not (v_read.instinct = 'protect the caravan'
          and v_read.kind = 'npc'
          and v_read.statblock->>'damage' = 'd6'
          and v_read.follower->>'loyalty' = '2') then
    raise exception 'FAIL: player read of follower PNJ intact';
  end if;

  ------------------------------------------------------------------
  -- (3bis) Player read, follower with NO stat block: still player-facing.
  --        Followerhood is independent of stats.
  ------------------------------------------------------------------
  select c.* into strict v_read from public.get_characters(v_ptoken) c
   where c.id = v_pnj_follower_bare;
  if not (v_read.instinct = 'finish what she started'
          and v_read.statblock is null
          and v_read.follower->>'cost' = 'a forge') then
    raise exception 'FAIL: player read of a statless follower';
  end if;

  ------------------------------------------------------------------
  -- (3ter) Player read, LEGACY nested follower: still player-facing via
  --        the statblock->'follower' fallback arm.
  ------------------------------------------------------------------
  select c.* into strict v_read from public.get_characters(v_ptoken) c where c.id = v_pnj_legacy;
  if not (v_read.instinct = 'carry the shield'
          and v_read.statblock->'follower'->>'loyalty' = '1') then
    raise exception 'FAIL: legacy nested follower no longer counts as followerhood';
  end if;

  ------------------------------------------------------------------
  -- (4) Player read, follower=null: stripped (typeof guard, not `?`).
  --     The mechanics only — `kind` rides along, as in (2).
  ------------------------------------------------------------------
  select c.* into strict v_read from public.get_characters(v_ptoken) c where c.id = v_pnj_null_follower;
  if not (v_read.instinct = '' and v_read.statblock is null) then
    raise exception 'FAIL: player read of follower=null PNJ not stripped';
  end if;

  ------------------------------------------------------------------
  -- (5) Player read, PJ: instinct intact.
  ------------------------------------------------------------------
  select c.* into strict v_read from public.get_characters(v_ptoken) c where c.id = v_pj;
  if v_read.instinct <> 'protect the party' then
    raise exception 'FAIL: player read of PJ instinct intact';
  end if;

  ------------------------------------------------------------------
  -- (6) Player update_character sending instinct='', statblock=null,
  --     kind=null AND follower=null on a plain PNJ: every column
  --     unchanged. The RPC's own RETURNING row always shows the stripped
  --     values for a non-follower, non-PJ row regardless of whether the
  --     write applied, so the real assertion has to read the table
  --     directly — this is the "value the RPC deliberately hides" case.
  --     `follower` matters most here: it is the field that gates the
  --     other three, so a player who could write it would unlock them
  --     all in one call.
  ------------------------------------------------------------------
  perform public.update_character(v_ptoken, v_pnj_a, jsonb_build_object(
    'instinct','', 'statblock', null::jsonb, 'kind', null::jsonb,
    'follower', jsonb_build_object('cost','self-promotion','loyalty',3)));
  select * into strict v_db from public.characters where id = v_pnj_a;
  if not (v_db.instinct = 'guard the barrow'
          and v_db.kind = 'undead'
          and v_db.statblock->>'armorNote' = 'ancient chain'
          and v_db.follower is null) then
    raise exception 'FAIL: player write on a plain PNJ was not silently ignored (self-promotion?)';
  end if;

  ------------------------------------------------------------------
  -- (7) Player update_character sending follower (loyalty tick) on a
  --     follower row: applied, and the RETURNING row keeps it (a
  --     follower row is never stripped, so the RPC return proves this
  --     one on its own).
  ------------------------------------------------------------------
  v_row := public.update_character(v_ptoken, v_pnj_follower, jsonb_build_object(
    'follower', jsonb_build_object('cost',1,'loyalty',3,'leaderId',null::jsonb)));
  if v_row.follower->>'loyalty' <> '3' then
    raise exception 'FAIL: player loyalty tick on follower row not applied/returned';
  end if;

  ------------------------------------------------------------------
  -- (7bis) Player update on a follower row may also carry `kind` — the
  --        value they legitimately read back. Needed because a revision
  --        restore can hand the client a kind that only exists nested in
  --        `statblock`, and the client hoists it on save; if this write
  --        were refused the classification would be lost.
  ------------------------------------------------------------------
  v_row := public.update_character(v_ptoken, v_pnj_follower,
    jsonb_build_object('kind','beast'));
  if v_row.kind <> 'beast' then
    raise exception 'FAIL: player kind write on a follower row was refused';
  end if;
  v_row := public.update_character(v_gtoken, v_pnj_follower, jsonb_build_object('kind','npc'));

  ------------------------------------------------------------------
  -- (8) Player update_character sending threat WITHOUT an instinct key,
  --     on a row whose threat already has one: the key is preserved
  --     (jsonb_set re-injects it, guarded by
  --     coalesce(threat ? 'instinct', false) against a NULL threat).
  --     The RETURNING row strips threat->'instinct' again for display
  --     on this plain PNJ, so — as with (6) — read the table directly
  --     to prove the underlying value survived.
  ------------------------------------------------------------------
  perform public.update_character(v_ptoken, v_pnj_a, jsonb_build_object(
    'threat', jsonb_build_object(
      'portents', jsonb_build_array('cold wind','a second omen'))));
  select * into strict v_db from public.characters where id = v_pnj_a;
  if not (v_db.threat->>'instinct' = 'hollow out the barrow'
          and v_db.threat->'portents' ? 'a second omen') then
    raise exception 'FAIL: legacy threat.instinct not preserved on player threat write';
  end if;

  ------------------------------------------------------------------
  -- (9) GM paths unchanged: instinct, statblock, kind and follower
  --     writes, and clearing statblock/follower back to null, all still
  --     apply unconditionally for the gm role (it short-circuits every
  --     guard).
  ------------------------------------------------------------------
  v_row := public.update_character(v_gtoken, v_pnj_a,
    jsonb_build_object('instinct','guard the barrow at all costs'));
  if v_row.instinct <> 'guard the barrow at all costs' then
    raise exception 'FAIL: GM instinct write unaffected by new guards';
  end if;

  v_row := public.update_character(v_gtoken, v_pnj_a, jsonb_build_object(
    'statblock', jsonb_build_object('hp',9), 'kind','construct',
    'follower', jsonb_build_object('cost',2,'loyalty',0,'leaderId',null::jsonb)));
  if not (v_row.statblock->>'hp' = '9' and v_row.kind = 'construct'
          and v_row.follower->>'cost' = '2') then
    raise exception 'FAIL: GM statblock/kind/follower write unaffected by new guards';
  end if;

  v_row := public.update_character(v_gtoken, v_pnj_a, jsonb_build_object(
    'statblock', null::jsonb, 'follower', null::jsonb));
  if not ((v_row.statblock is null or v_row.statblock = 'null'::jsonb)
          and (v_row.follower is null or v_row.follower = 'null'::jsonb)) then
    raise exception 'FAIL: GM statblock/follower clear (set null) unaffected by new guards';
  end if;

  ------------------------------------------------------------------
  -- (10) create_character mirrors the write guard on the INCOMING row:
  --      a non-GM creating a non-PJ, non-follower row must NOT persist
  --      instinct/statblock/kind. This is a distinct code path from
  --      every update_character check above, which only ever test an
  --      EXISTING row's prior state — creation has no prior row, so it
  --      needs its own positive AND negative coverage.
  ------------------------------------------------------------------
  v_row := public.create_character(v_ptoken, jsonb_build_object(
    'name','Player-Made NPC','role','stranger','type','PNJ',
    'instinct','should not persist', 'kind','undead',
    'statblock', jsonb_build_object('hp',3)));
  select * into strict v_db from public.characters where id = v_row.id;
  if not (v_db.instinct = '' and v_db.statblock is null and v_db.kind is null) then
    raise exception 'FAIL: non-GM create stored instinct/statblock/kind on a non-follower row';
  end if;

  -- Mirror-positive: the same non-GM caller CAN seed a follower row from
  -- creation (`follower` is an object on the INCOMING payload) — proved
  -- on the RPC's own return, since a follower row is never stripped
  -- either way. Deliberately preserved from the pre-column behaviour.
  v_row := public.create_character(v_ptoken, jsonb_build_object(
    'name','Player-Made Follower','role','hedge knight','type','PNJ',
    'instinct','guard my liege', 'kind','npc',
    'statblock', jsonb_build_object('hp',4),
    'follower', jsonb_build_object('cost',1,'loyalty',1,'leaderId',null::jsonb)));
  if not (v_row.instinct = 'guard my liege'
          and v_row.kind = 'npc'
          and v_row.follower->>'loyalty' = '1') then
    raise exception 'FAIL: non-GM create did not persist instinct/kind/follower on a follower row';
  end if;

  ------------------------------------------------------------------
  -- (11) A MENACE IS NEVER A FOLLOWER. Every check below fails against
  --      the pre-rule migration, where app_is_follower knew nothing of
  --      `type` and a threat's follower block satisfied the read rule and
  --      all four write guards.
  --
  -- (11a) Player read of a REVEALED threat: the mechanics go, exactly as
  --       for a plain PNJ.
  ------------------------------------------------------------------
  select c.* into strict v_read from public.get_characters(v_ptoken) c where c.id = v_menace;
  if not (v_read.instinct = ''
          and v_read.statblock is null
          and not (v_read.threat ? 'instinct')
          and (v_read.threat ? 'portents')
          and v_read.gm_notes is null) then
    raise exception 'FAIL: player read of a revealed MENACE with a follower block leaked its mechanics';
  end if;

  -- (11b) …but the DESCRIPTION stays, same doctrine as (2): the table can
  --       see the thing. `follower` rides along too — the read rule never
  --       rewrote it, and hiding it would only mask a shape the GM can fix.
  if not (v_read.kind = 'spirit' and v_read.tags ? 'stealthy') then
    raise exception 'FAIL: player read of a revealed MENACE lost the kind/tags description';
  end if;

  -- (11c) Legacy nested arm, same verdict — an undo must not re-open it.
  select c.* into strict v_read from public.get_characters(v_ptoken) c
   where c.id = v_menace_legacy;
  if not (v_read.instinct = '' and v_read.statblock is null) then
    raise exception 'FAIL: player read of a MENACE whose follower is nested in statblock leaked its mechanics';
  end if;

  -- (11d) Player writes on the threat are silently ignored — including
  --       `follower` itself, which is what a player would have to write to
  --       unlock the other three. Read the table: the RPC's own RETURNING
  --       row is stripped either way.
  perform public.update_character(v_ptoken, v_menace, jsonb_build_object(
    'instinct','player overwrote the GM instinct',
    'statblock', jsonb_build_object('hp',1),
    'kind','npc',
    'follower', jsonb_build_object('cost','free','loyalty',3,'leaderId',null::jsonb)));
  select * into strict v_db from public.characters where id = v_menace;
  if not (v_db.instinct = 'hunt the ones who trespass'
          and v_db.statblock->>'hp' = '20'
          and v_db.kind = 'spirit'
          and v_db.follower->>'loyalty' = '1') then
    raise exception 'FAIL: player write on a revealed MENACE was not silently ignored';
  end if;

  -- (11e) The GM still sees and writes everything on it — the rule closes
  --       a player path, it does not take the sheet away from its owner.
  select c.* into strict v_read from public.get_characters(v_gtoken) c where c.id = v_menace;
  if not (v_read.instinct = 'hunt the ones who trespass'
          and v_read.statblock->>'hp' = '20'
          and v_read.threat->>'instinct' = 'claim the wood'
          and v_read.gm_notes is not null) then
    raise exception 'FAIL: GM read of a revealed MENACE is no longer intact';
  end if;
  v_row := public.update_character(v_gtoken, v_menace,
    jsonb_build_object('statblock', jsonb_build_object('hp',18)));
  if v_row.statblock->>'hp' <> '18' then
    raise exception 'FAIL: GM statblock write on a MENACE was refused';
  end if;

  -- (11f) create_character mirrors the rule on the INCOMING row: a non-GM
  --       cannot mint a threat that declares itself a follower and get the
  --       mechanics stored. `follower` is not even kept — the row is not
  --       one, so storing the shape would only re-arm the old leak for the
  --       next reader of this code.
  v_row := public.create_character(v_ptoken, jsonb_build_object(
    'name','Player-Made Threat','type','MENACE',
    'instinct','should not persist','kind','undead',
    'statblock', jsonb_build_object('hp',7),
    'follower', jsonb_build_object('cost',1,'loyalty',1,'leaderId',null::jsonb)));
  select * into strict v_db from public.characters where id = v_row.id;
  if not (v_db.instinct = '' and v_db.statblock is null and v_db.kind is null
          and v_db.follower is null) then
    raise exception 'FAIL: non-GM create of a MENACE declaring itself a follower stored its mechanics';
  end if;

  ------------------------------------------------------------------
  -- FORBIDDEN probes: role gates raise SQLSTATE 42501, they do not
  -- silently no-op (unlike the instinct/statblock/kind/follower/type
  -- guards above, which silently ignore). Each probe expects the call to
  -- raise; if it does NOT, the probe's own 'FAIL' raise (default SQLSTATE
  -- P0001) propagates because it is not 42501 and so is not caught below.
  ------------------------------------------------------------------
  begin
    perform public.update_character(v_ptoken, v_pnj_a, jsonb_build_object('gm_only', true));
    raise exception 'FAIL: player gm_only write did not raise FORBIDDEN';
  exception
    when sqlstate '42501' then null;  -- expected
  end;

  begin
    perform public.update_character(v_ptoken, v_pnj_a, jsonb_build_object('gm_notes', 'nope'));
    raise exception 'FAIL: player gm_notes write did not raise FORBIDDEN';
  exception
    when sqlstate '42501' then null;  -- expected
  end;

  begin
    perform public.update_character(v_vtoken, v_pnj_a, jsonb_build_object('instinct', 'viewer should not write'));
    raise exception 'FAIL: viewer write did not raise FORBIDDEN';
  exception
    when sqlstate '42501' then null;  -- expected
  end;

  perform public.delete_space(v_gtoken, 'gm-pw');
  raise notice 'statblock_verify: OK';
end $$;

-- raise notice is swallowed by the MCP SQL runner; this is what makes a
-- passing run actually visible there.
select 'statblock_verify: OK' as result;

rollback;
