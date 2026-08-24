-- =====================================================================
-- Ink & Stone — revision ledger verification scenario.
-- Run by CI against the local stack (see .github/workflows/ci.yml), and by
-- hand with `psql -v ON_ERROR_STOP=1 -f`. Re-runnable: it creates
-- and drops its own throwaway space.
-- =====================================================================
do $$
declare
  v_token text; v_space uuid; v_char uuid; v_other uuid; v_loc uuid;
  v_rel uuid; v_n int; v_event uuid; v_session jsonb; v_map uuid; v_pin uuid;
begin
  -- A throwaway grimoire with a GM session, via the real RPCs.
  v_session := public.create_space('LEDGER-TEST', 'gm-pw', 'player-pw');
  v_token := v_session->>'token';
  v_space := (v_session->'space'->>'id')::uuid;

  -- (1) A create is captured as INSERT with the actor's role.
  v_char := (public.create_character(v_token, jsonb_build_object(
    'name','Ereth','role','the smith','type','PNJ','notes','<p>first</p>'))).id;
  select count(*) into v_n from public.revisions
   where space_id = v_space and table_name = 'characters' and op = 'INSERT';
  if v_n <> 1 then raise exception 'FAIL capture insert: got %', v_n; end if;
  select count(*) into v_n from public.revisions
   where space_id = v_space and actor_role = 'gm';
  if v_n < 1 then raise exception 'FAIL actor_role not stamped'; end if;

  -- (2) A no-op update logs nothing.
  perform public.update_character(v_token, v_char, jsonb_build_object('name','Ereth'));
  select count(*) into v_n from public.revisions
   where space_id = v_space and table_name = 'characters' and op = 'UPDATE';
  if v_n <> 0 then raise exception 'FAIL no-op update was logged: got %', v_n; end if;

  -- (3) A real update logs one UPDATE carrying both sides.
  perform public.update_character(v_token, v_char, jsonb_build_object('notes','<p>second</p>'));
  select count(*) into v_n from public.revisions
   where space_id = v_space and table_name = 'characters' and op = 'UPDATE'
     and before->>'notes' = '<p>first</p>' and after->>'notes' = '<p>second</p>';
  if v_n <> 1 then raise exception 'FAIL update snapshot: got %', v_n; end if;

  -- (4) A cascade groups under ONE event: deleting a character takes its
  --     relation with it, and both rows share an event_id.
  v_other := (public.create_character(v_token, jsonb_build_object(
    'name','Vahalla','role','the elder','type','PNJ','notes',''))).id;
  v_rel := (public.create_relation(v_token, jsonb_build_object(
    'from_character_id', v_char, 'to_character_id', v_other,
    'relation_type','ami'))).id;
  perform public.delete_character(v_token, v_char);
  select count(distinct event_id) into v_n from public.revisions
   where space_id = v_space and op = 'DELETE';
  if v_n <> 1 then raise exception 'FAIL cascade spans % events, expected 1', v_n; end if;
  select count(*) into v_n from public.revisions
   where space_id = v_space and op = 'DELETE' and table_name in ('characters','relations');
  if v_n <> 2 then raise exception 'FAIL cascade captured % rows, expected 2', v_n; end if;

  -- (5) update_space_settings writes NOTHING (spaces is excluded on purpose:
  --     the row holds bcrypt password hashes).
  select count(*) into v_n from public.revisions where table_name = 'spaces';
  perform public.update_space_settings(v_token, 'gm-pw', jsonb_build_object('public_read', true));
  if (select count(*) from public.revisions where table_name = 'spaces') <> v_n then
    raise exception 'FAIL spaces table was captured';
  end if;

  -- (6) delete_space writes nothing new (event_kind guard) and cascades the
  --     ledger away with the grimoire. A map + pin exercise the guard's real
  --     job: delete_space never deletes maps/map_pins explicitly (they
  --     cascade when the spaces row goes), so without the guard that
  --     cascade would fire the capture trigger and try to INSERT a
  --     revisions row referencing the space mid-delete — a foreign-key
  --     violation (23503), not merely wasted logging.
  v_map := (public.create_map(v_token, jsonb_build_object('name','Test Map'))).id;
  v_pin := (public.create_map_pin(v_token, jsonb_build_object(
    'map_id', v_map, 'x', 0.5, 'y', 0.5, 'label', 'Test Pin'))).id;
  perform public.delete_space(v_token, 'gm-pw');
  select count(*) into v_n from public.revisions where space_id = v_space;
  if v_n <> 0 then raise exception 'FAIL ledger survived space delete: % rows', v_n; end if;

  raise notice 'CAPTURE OK';
end $$;

-- =====================================================================
-- (B) Ledger read.
-- =====================================================================
do $$
declare
  v_token text; v_ptoken text; v_space uuid; v_char uuid; v_other uuid;
  v_ledger jsonb; v_ev jsonb; v_session jsonb; v_n int;
begin
  v_session := public.create_space('LEDGER-READ', 'gm-pw', 'player-pw');
  v_token := v_session->>'token';
  v_space := (v_session->'space'->>'id')::uuid;

  v_char  := (public.create_character(v_token, jsonb_build_object(
    'name','Ereth','role','the smith','type','PNJ','notes','<p>a</p>'))).id;
  v_other := (public.create_character(v_token, jsonb_build_object(
    'name','Vahalla','role','the elder','type','PNJ','notes',''))).id;
  perform public.create_relation(v_token, jsonb_build_object(
    'from_character_id', v_char, 'to_character_id', v_other, 'relation_type','ami'));
  perform public.update_character(v_token, v_char, jsonb_build_object('notes','<p>b</p>'));

  v_ledger := public.get_revisions(v_token, 25, null);

  -- Newest event first: the notes update.
  v_ev := v_ledger->0;
  if v_ev->'rows'->0->>'op' <> 'UPDATE' then
    raise exception 'FAIL newest event is %', v_ev->'rows'->0->>'op';
  end if;
  if v_ev->'rows'->0->>'label' <> 'Ereth' then
    raise exception 'FAIL character label is %', v_ev->'rows'->0->>'label';
  end if;
  if not (v_ev->'rows'->0->'changed' ? 'notes') then
    raise exception 'FAIL changed keys are %', v_ev->'rows'->0->'changed';
  end if;
  if v_ev->'rows'->0->'changed' ? 'updated_at' then
    raise exception 'FAIL updated_at leaked into changed keys';
  end if;

  -- Payloads are NOT in the list response (a page of 25 must stay small).
  if v_ev->'rows'->0 ? 'before' or v_ev->'rows'->0 ? 'after' then
    raise exception 'FAIL list response carries payloads';
  end if;

  -- The relation label names both ends.
  select count(*) into v_n
    from jsonb_array_elements(v_ledger) e,
         jsonb_array_elements(e->'rows') r
   where r->>'table_name' = 'relations' and r->>'label' = 'Ereth → Vahalla';
  if v_n <> 1 then raise exception 'FAIL relation label missing'; end if;

  -- Keyset pagination: asking for one event, then everything before it,
  -- never splits an event and never repeats one.
  v_ledger := public.get_revisions(v_token, 1, null);
  if jsonb_array_length(v_ledger) <> 1 then raise exception 'FAIL limit ignored'; end if;
  v_ledger := public.get_revisions(v_token, 25, (v_ledger->0->>'last_id')::bigint);
  if jsonb_array_length(v_ledger) <> 3 then
    raise exception 'FAIL page 2 has % events, expected 3', jsonb_array_length(v_ledger);
  end if;

  -- revision_label's timelines branch must union both sides' year keys:
  -- a year written, then removed entirely, is still visible in the label
  -- (not silently dropped by a one-sided jsonb_object_keys pick).
  perform public.save_timeline(v_token, jsonb_build_object(
    'entries', jsonb_build_object('2020', jsonb_build_object(
      'spring', jsonb_build_object('title', 'A season', 'body', '<p>text</p>')))));
  perform public.save_timeline(v_token, jsonb_build_object('entries', '{}'::jsonb));

  -- Full page, not just the newest event: the first save's INSERT row has
  -- gm_entries still unset (SQL NULL -> to_jsonb's JSON `null`, not '{}'),
  -- so this also proves that row renders through revision_label without
  -- the 22023 a bare jsonb_object_keys(null) would raise.
  perform public.get_revisions(v_token, 25, null);

  v_ledger := public.get_revisions(v_token, 1, null);
  v_ev := v_ledger->0;
  if v_ev->'rows'->0->>'table_name' <> 'timelines' then
    raise exception 'FAIL newest event after chronicle edit is %', v_ev->'rows'->0->>'table_name';
  end if;
  if v_ev->'rows'->0->>'label' <> '2020:spring' then
    raise exception 'FAIL removed-year label is %', v_ev->'rows'->0->>'label';
  end if;

  -- p_limit floor: a nonsensical limit must not raise a raw Postgres error
  -- (2201W, invalid_row_count_in_limit_clause) — it clamps up to 1 instead.
  perform public.get_revisions(v_token, -1, null);
  perform public.get_revisions(v_token, 0, null);

  -- A player is refused.
  v_ptoken := (public.join_space((v_session->'space'->>'invite_code'), 'player-pw'))->>'token';
  begin
    perform public.get_revisions(v_ptoken, 25, null);
    raise exception 'FAIL player could read the ledger';
  exception when sqlstate '42501' then null;
  end;

  perform public.delete_space(v_token, 'gm-pw');
  raise notice 'LEDGER READ OK';
end $$;

-- =====================================================================
-- (C) Undo preview.
-- =====================================================================
do $$
declare
  v_token text; v_ptoken text; v_space uuid; v_char uuid; v_other uuid; v_map uuid;
  v_loc uuid; v_pin uuid; v_event uuid; v_event2 uuid; v_plan jsonb; v_session jsonb; v_n int;
begin
  v_session := public.create_space('LEDGER-PREVIEW', 'gm-pw', 'player-pw');
  v_token := v_session->>'token';
  v_space := (v_session->'space'->>'id')::uuid;

  v_char  := (public.create_character(v_token, jsonb_build_object(
    'name','Ereth','role','the smith','type','PNJ','notes','<p>a</p>'))).id;
  v_other := (public.create_character(v_token, jsonb_build_object(
    'name','Vahalla','role','the elder','type','PNJ','notes',''))).id;
  perform public.create_relation(v_token, jsonb_build_object(
    'from_character_id', v_char, 'to_character_id', v_other, 'relation_type','ami'));

  -- Delete Ereth: one event, two rows (her + the cascaded relation).
  perform public.delete_character(v_token, v_char);
  select event_id into v_event from public.revisions
   where space_id = v_space and table_name = 'characters' and op = 'DELETE';

  v_plan := public.preview_undo_event(v_token, v_event);
  if jsonb_array_length(v_plan->'rows') <> 2 then
    raise exception 'FAIL plan has % rows, expected 2', jsonb_array_length(v_plan->'rows');
  end if;

  -- Parents first: the character precedes the relation.
  if v_plan->'rows'->0->>'table_name' <> 'characters' then
    raise exception 'FAIL plan order starts with %', v_plan->'rows'->0->>'table_name';
  end if;
  if v_plan->'rows'->0->>'action' <> 're-insert' then
    raise exception 'FAIL action is %', v_plan->'rows'->0->>'action';
  end if;
  -- Payloads ARE present here — one event is small, and the GM must be
  -- able to read what is about to come back.
  if v_plan->'rows'->0->'before'->>'notes' <> '<p>a</p>' then
    raise exception 'FAIL preview lacks the before payload';
  end if;

  -- Regression for the Critical: existence must mean "will exist once this
  -- event's own re-inserts have run", not "exists live right now". Ereth
  -- is not live at this instant — she's the very row this event would
  -- re-insert — so a check against bare live state would falsely flag the
  -- cascaded relation as character_missing even though undoing this one
  -- event brings both her and the bond back together.
  if (v_plan->'rows'->1->>'unrestorable')::boolean then
    raise exception 'FAIL cascade relation falsely flagged unrestorable: %',
      v_plan->'rows'->1->>'reason';
  end if;

  -- Finding 2 (Item 2): the relation's own label must name Ereth by name,
  -- not by raw uuid, even though she is not live at this instant (she is
  -- the very row this event re-inserts). This is the one place
  -- preview_undo_event's revision_preview_label differs from plain
  -- revision_label -- it must resolve her name from this event's own
  -- DELETE snapshot for characters, not just the live table. Must run
  -- BEFORE Vahalla is deleted below: once she is gone too, her endpoint
  -- legitimately falls back to a uuid, which would make this assertion
  -- fail for the wrong reason.
  if v_plan->'rows'->1->>'label' <> 'Ereth → Vahalla' then
    raise exception 'FAIL preview relation label is %', v_plan->'rows'->1->>'label';
  end if;

  -- NOW Vahalla is gone too, via a SEPARATE, LATER event that this undo
  -- does not cover. Undoing the Ereth event only re-inserts Ereth and the
  -- relation — it has no idea Vahalla ever existed — so the relation is
  -- genuinely, not falsely, unrestorable: no re-insert in *this* event's
  -- own plan brings Vahalla back.
  perform public.delete_character(v_token, v_other);
  v_plan := public.preview_undo_event(v_token, v_event);
  select count(*) into v_n
    from jsonb_array_elements(v_plan->'rows') r
   where r->>'table_name' = 'relations'
     and (r->>'unrestorable')::boolean
     and r->>'reason' = 'character_missing';
  if v_n <> 1 then raise exception 'FAIL relation not flagged unrestorable'; end if;

  -- SET NULL + CASCADE, both undone within the same event: delete a
  -- location that has a character living there (characters.location,
  -- SET NULL) and a pin anchored to it (map_pins.location_id, CASCADE).
  -- The location is rank 1 — processed before both children — so neither
  -- the cascaded pin nor the nulled character should preview as blocked on
  -- a location that this same event's own re-insert is, in fact, bringing
  -- back. Also exercises the IMPORTANT fix: the character row is an
  -- UPDATE, and until now revision_undo_check never ran on UPDATE rows.
  v_loc := (public.create_location(v_token, jsonb_build_object(
    'name','Hearthstone','color','#8b7355'))).id;
  v_char := (public.create_character(v_token, jsonb_build_object(
    'name','Orin','role','the miller','type','PNJ','notes','','location', v_loc))).id;
  v_map := (public.create_map(v_token, jsonb_build_object('name','Region Map'))).id;
  v_pin := (public.create_map_pin(v_token, jsonb_build_object(
    'map_id', v_map, 'x', 0.2, 'y', 0.2, 'label', 'Hearthstone', 'location_id', v_loc))).id;

  perform public.delete_location(v_token, v_loc);
  select event_id into v_event from public.revisions
   where space_id = v_space and table_name = 'locations' and row_id = v_loc and op = 'DELETE';
  v_plan := public.preview_undo_event(v_token, v_event);

  select count(*) into v_n
    from jsonb_array_elements(v_plan->'rows') r
   where r->>'table_name' = 'map_pins' and (r->>'unrestorable')::boolean;
  if v_n <> 0 then raise exception 'FAIL cascaded pin falsely flagged unrestorable'; end if;

  select count(*) into v_n
    from jsonb_array_elements(v_plan->'rows') r
   where r->>'table_name' = 'characters' and (r->>'row_id')::uuid = v_char
     and r->>'reason' = 'location_missing';
  if v_n <> 0 then raise exception 'FAIL nulled character falsely flagged location_missing'; end if;

  -- Discriminating case for the IMPORTANT fix: the SET-NULL check above
  -- passes under the old bare-existence UPDATE test too (the parent it
  -- points at is revived by the *same* event, so neither old nor new code
  -- would flag it) — it only proves no regression. This one distinguishes
  -- them: move a character from location A to B (one event, `before`
  -- holds A), then delete A in a SEPARATE, later event that this preview
  -- does not cover. The old code never checked an UPDATE's `before` for a
  -- dangling FK at all, so it would have reported this row as plain
  -- restorable with no reason; the fix must report location_missing.
  v_loc   := (public.create_location(v_token, jsonb_build_object(
    'name','Old Ford','color','#8b7355'))).id;
  v_other := (public.create_location(v_token, jsonb_build_object(
    'name','New Ford','color','#3c6e8b'))).id;
  v_char  := (public.create_character(v_token, jsonb_build_object(
    'name','Beall','role','the ferryman','type','PNJ','notes','','location', v_loc))).id;
  perform public.update_character(v_token, v_char, jsonb_build_object('location', v_other));
  select event_id into v_event from public.revisions
   where space_id = v_space and row_id = v_char and op = 'UPDATE'
   order by id desc limit 1;
  perform public.delete_location(v_token, v_loc);

  v_plan := public.preview_undo_event(v_token, v_event);
  select count(*) into v_n
    from jsonb_array_elements(v_plan->'rows') r
   where r->>'table_name' = 'characters' and (r->>'row_id')::uuid = v_char
     and r->>'reason' = 'location_missing';
  if v_n <> 1 then
    raise exception 'FAIL UPDATE row did not detect its own dangling FK parent';
  end if;

  -- changed_since: edit a row after the event that touched it.
  -- DEVIATION from the task-3 brief: the brief reused v_other here, but
  -- v_other (Vahalla) was deleted two statements above, so update_character
  -- on it always raises NOT_FOUND regardless of preview_undo_event's
  -- correctness (update_character in supabase-gm-layer.sql: `if not found
  -- then raise exception 'NOT_FOUND'; end if;`). Using a fresh live
  -- character instead; assertion text and ordering unchanged from the brief.
  v_char := (public.create_character(v_token, jsonb_build_object(
    'name','Naia','role','the scout','type','PNJ','notes','<p>w</p>'))).id;
  perform public.update_character(v_token, v_char, jsonb_build_object('notes','<p>x</p>'));
  select event_id into v_event from public.revisions
   where space_id = v_space and row_id = v_char and op = 'UPDATE'
   order by id desc limit 1;
  perform public.update_character(v_token, v_char, jsonb_build_object('notes','<p>y</p>'));
  v_plan := public.preview_undo_event(v_token, v_event);
  if not (v_plan->'rows'->0->>'changed_since')::boolean then
    raise exception 'FAIL changed_since not detected';
  end if;

  -- group_intact: the server-side check backing a grouped ledger card's
  -- revert (see preview_undo_event's p_expect_event_id). Two adjacent
  -- updates to the same row stand in for the client's collapsed run — the
  -- OLDER event (v_event) is the revert target, the NEWER one (v_event2) is
  -- passed as p_expect_event_id.
  v_char := (public.create_character(v_token, jsonb_build_object(
    'name','Bryn','role','the tanner','type','PNJ','notes','<p>1</p>'))).id;
  perform public.update_character(v_token, v_char, jsonb_build_object('notes','<p>2</p>'));
  select event_id into v_event from public.revisions
   where space_id = v_space and row_id = v_char and op = 'UPDATE'
   order by id desc limit 1;                                     -- older of the pair
  perform public.update_character(v_token, v_char, jsonb_build_object('notes','<p>3</p>'));
  select event_id into v_event2 from public.revisions
   where space_id = v_space and row_id = v_char and op = 'UPDATE'
   order by id desc limit 1;                                     -- newer of the pair

  -- Untouched since the newer edit: changed_since (measured against the
  -- OLDER event, same as every other assertion in this file) is true --
  -- that alone is exactly the false alarm this feature exists to quiet --
  -- while group_intact (measured against the NEWER event) is true, because
  -- nothing outside the pair has touched the row.
  v_plan := public.preview_undo_event(v_token, v_event, v_event2);
  if not (v_plan->'rows'->0->>'changed_since')::boolean then
    raise exception 'FAIL group scenario: changed_since should be true against the older event';
  end if;
  if not (v_plan->'rows'->0->>'group_intact')::boolean then
    raise exception 'FAIL group_intact false right after the burst, expected true';
  end if;

  -- An unrelated write lands on top -- stands in for a player, another tab,
  -- or another GM session writing to the same row while the confirm dialog
  -- sat open. The row no longer matches even the NEWEST event's `after`:
  -- group_intact must flip to false, so the per-row warning cannot be
  -- suppressed.
  perform public.update_character(v_token, v_char, jsonb_build_object('notes','<p>4</p>'));
  v_plan := public.preview_undo_event(v_token, v_event, v_event2);
  if (v_plan->'rows'->0->>'group_intact')::boolean then
    raise exception 'FAIL group_intact true after an unrelated write landed, expected false';
  end if;

  -- Omitting p_expect_event_id (the plain, non-grouped call every other
  -- assertion in this file uses) must not attempt the check at all --
  -- group_intact stays JSON null, never a stray true/false.
  v_plan := public.preview_undo_event(v_token, v_event);
  if v_plan->'rows'->0->'group_intact' <> 'null'::jsonb then
    raise exception 'FAIL group_intact should be null without p_expect_event_id: %',
      v_plan->'rows'->0->'group_intact';
  end if;

  -- An unknown event is NOT_FOUND.
  begin
    perform public.preview_undo_event(v_token, gen_random_uuid());
    raise exception 'FAIL unknown event accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%NOT_FOUND%' then raise; end if;
  end;

  -- A player is refused. Added beyond the brief: preview_undo_event returns
  -- before/after payloads verbatim (gm_only, gm_notes, gm_entries in
  -- plaintext), so the gate matters even more here than in get_revisions,
  -- which block (B) above already covers.
  v_ptoken := (public.join_space((v_session->'space'->>'invite_code'), 'player-pw'))->>'token';
  begin
    perform public.preview_undo_event(v_ptoken, v_event);
    raise exception 'FAIL player could preview the ledger';
  exception when sqlstate '42501' then null;
  end;

  perform public.delete_space(v_token, 'gm-pw');
  raise notice 'PREVIEW OK';
end $$;

-- =====================================================================
-- (D) Undo.
-- =====================================================================
do $$
declare
  v_token text; v_space uuid; v_char uuid; v_other uuid; v_loc uuid;
  v_loc2 uuid; v_event uuid; v_res jsonb; v_session jsonb; v_n int; v_rev int;
  v_tl jsonb;
  -- Finding 2 tests 2-3: a second, chronicle-fresh space, plus the extra
  -- event ids the undo/resave/undo-that-undo chain needs to track.
  v_tl_token text; v_tl_space uuid; v_tl_session jsonb;
  v_event2 uuid; v_event3 uuid;
begin
  v_session := public.create_space('LEDGER-UNDO', 'gm-pw', 'player-pw');
  v_token := v_session->>'token';
  v_space := (v_session->'space'->>'id')::uuid;

  -- (1) Undo an UPDATE restores the whole row.
  v_char := (public.create_character(v_token, jsonb_build_object(
    'name','Ereth','role','the smith','type','PNJ','notes','<p>a</p>'))).id;
  perform public.update_character(v_token, v_char, jsonb_build_object('notes','<p>b</p>'));
  select event_id into v_event from public.revisions
   where space_id = v_space and op = 'UPDATE' order by id desc limit 1;
  perform public.undo_event(v_token, v_event);
  if (select notes from public.characters where id = v_char) <> '<p>a</p>' then
    raise exception 'FAIL update not undone';
  end if;

  -- (2) The undo is itself an event => undoing it is redo.
  select event_id into v_event from public.revisions
   where space_id = v_space and op = 'UPDATE' order by id desc limit 1;
  perform public.undo_event(v_token, v_event);
  if (select notes from public.characters where id = v_char) <> '<p>b</p>' then
    raise exception 'FAIL redo (undo of undo) did not reapply';
  end if;

  -- (3) Undo a cascading delete restores the character AND its relation.
  v_other := (public.create_character(v_token, jsonb_build_object(
    'name','Vahalla','role','the elder','type','PNJ','notes',''))).id;
  perform public.create_relation(v_token, jsonb_build_object(
    'from_character_id', v_char, 'to_character_id', v_other, 'relation_type','ami'));
  perform public.delete_character(v_token, v_char);
  select event_id into v_event from public.revisions
   where space_id = v_space and table_name = 'characters' and op = 'DELETE'
   order by id desc limit 1;
  v_res := public.undo_event(v_token, v_event);
  if not exists (select 1 from public.characters where id = v_char) then
    raise exception 'FAIL character not restored';
  end if;
  select count(*) into v_n from public.relations
   where from_character_id = v_char and to_character_id = v_other;
  if v_n <> 1 then raise exception 'FAIL relation not restored with its character'; end if;

  -- (4) Undoing a location delete re-links the characters it nulled.
  v_loc := (public.create_location(v_token, jsonb_build_object(
    'name','Gordins Delve','color','#7AA177'))).id;
  perform public.update_character(v_token, v_char,
    jsonb_build_object('location', v_loc::text));
  perform public.delete_location(v_token, v_loc);
  if (select location from public.characters where id = v_char) is not null then
    raise exception 'FAIL cascade did not null the link (test premise wrong)';
  end if;
  select event_id into v_event from public.revisions
   where space_id = v_space and table_name = 'locations' and op = 'DELETE'
   order by id desc limit 1;
  perform public.undo_event(v_token, v_event);
  if (select location from public.characters where id = v_char) <> v_loc then
    raise exception 'FAIL character link not restored with its location';
  end if;

  -- (4b) DEVIATION beyond the brief: undoing an UPDATE whose `before` points
  --      at a parent deleted in a SEPARATE, LATER event must patch the
  --      dangling FK (location_missing), not blindly restore it and crash
  --      with a raw 23503. This is the undo-side counterpart of
  --      preview_undo_event's Old Ford / New Ford case (block C above) —
  --      the brief's undo_event UPDATE branch never called
  --      revision_undo_check at all, so this path was untested; without the
  --      fix the whole undo_event transaction aborts uncaught instead of
  --      skipping/patching just this row, contradicting the "best-effort"
  --      contract stated in the SQL's own comments.
  v_loc  := (public.create_location(v_token, jsonb_build_object(
    'name','Coldwater Ford','color','#8b7355'))).id;
  v_loc2 := (public.create_location(v_token, jsonb_build_object(
    'name','Warm Ford','color','#3c6e8b'))).id;
  perform public.update_character(v_token, v_char, jsonb_build_object('location', v_loc::text));
  perform public.update_character(v_token, v_char, jsonb_build_object('location', v_loc2::text));
  select event_id into v_event from public.revisions
   where space_id = v_space and table_name = 'characters' and row_id = v_char and op = 'UPDATE'
   order by id desc limit 1;
  perform public.delete_location(v_token, v_loc);  -- separate, later event; not part of v_event
  v_res := public.undo_event(v_token, v_event);
  if exists (select 1 from public.characters where id = v_char and location is not null) then
    raise exception 'FAIL dangling FK on UPDATE restore was not nulled';
  end if;
  select count(*) into v_n
    from jsonb_array_elements(v_res->'rows') r
   where r->>'table_name' = 'characters' and (r->>'row_id')::uuid = v_char
     and r->>'reason' = 'location_missing';
  if v_n <> 1 then raise exception 'FAIL UPDATE restore did not report location_missing'; end if;

  -- (5) Best-effort: an unrestorable row is skipped, the rest still lands.
  perform public.delete_character(v_token, v_char);   -- takes the relation too
  select event_id into v_event from public.revisions
   where space_id = v_space and table_name = 'characters' and op = 'DELETE'
   order by id desc limit 1;
  perform public.delete_character(v_token, v_other);  -- the relation's other end
  v_res := public.undo_event(v_token, v_event);
  if not exists (select 1 from public.characters where id = v_char) then
    raise exception 'FAIL character not restored despite a skippable row';
  end if;
  select count(*) into v_n
    from jsonb_array_elements(v_res->'rows') r
   where r->>'table_name' = 'relations' and r->>'status' = 'skipped';
  if v_n <> 1 then raise exception 'FAIL relation was not reported as skipped'; end if;

  -- (6) A chronicle restore must BUMP the season rev strictly past what it
  --     was just before the undo, not merely match it -- matching is not
  --     enough: it would leave the restored season at exactly the rev an
  --     already-open tab holds as its save's base rev, so that tab's next
  --     autosave would pass its own compare-and-swap and silently clobber
  --     the restore with no conflict banner. Capture the rev that existed
  --     immediately before the undo and assert the restored rev exceeds it
  --     -- ">= 2" would pass both the old (v_cur_rev) and new (v_cur_rev + 1)
  --     behaviour and prove nothing; "> pre-undo rev" only passes the fix.
  perform public.save_timeline_entry(v_token, 2, 'spring',
    jsonb_build_object('title','', 'body','<p>one</p>'), 0);          -- rev 1
  perform public.save_timeline_entry(v_token, 2, 'spring',
    jsonb_build_object('title','', 'body','<p>two</p>'), 1);          -- rev 2
  select entries into v_tl from public.timelines where space_id = v_space;
  v_rev := public.season_rev(v_tl->'2'->'spring');                   -- rev just before the undo (2)
  select event_id into v_event from public.revisions
   where space_id = v_space and table_name = 'timelines' order by id desc limit 1;
  perform public.undo_event(v_token, v_event);                        -- back to "one"
  select entries into v_tl from public.timelines where space_id = v_space;
  if v_tl->'2'->'spring'->>'body' <> '<p>one</p>' then
    raise exception 'FAIL chronicle text not restored';
  end if;
  if public.season_rev(v_tl->'2'->'spring') <= v_rev then
    raise exception 'FAIL restored rev % did not exceed pre-undo rev %',
      public.season_rev(v_tl->'2'->'spring'), v_rev;
  end if;

  -- (7) A player is refused.
  begin
    perform public.undo_event(
      (public.join_space((v_session->'space'->>'invite_code'), 'player-pw'))->>'token',
      v_event);
    raise exception 'FAIL player could undo';
  exception when sqlstate '42501' then null;
  end;

  -- (8) Undo an INSERT event removes the row (Finding 2, test 1): exercises
  --     the destructive `delete from` branch, distinct from the re-insert
  --     and restore branches exercised above. Also covers Finding 4: the
  --     returned event_id is the NEW event the undo itself created, so it
  --     must be non-null and differ from the event being undone.
  v_char := (public.create_character(v_token, jsonb_build_object(
    'name','Sabra','role','the herbalist','type','PNJ','notes',''))).id;
  select event_id into v_event from public.revisions
   where space_id = v_space and table_name = 'characters' and row_id = v_char and op = 'INSERT';
  v_res := public.undo_event(v_token, v_event);
  if exists (select 1 from public.characters where id = v_char) then
    raise exception 'FAIL character not removed by undoing its own insert';
  end if;
  select count(*) into v_n
    from jsonb_array_elements(v_res->'rows') r
   where (r->>'row_id')::uuid = v_char and r->>'action' = 'remove' and r->>'status' = 'done';
  if v_n <> 1 then raise exception 'FAIL insert-undo row reported wrong action/status: %', v_res; end if;
  if v_res->>'event_id' is null or v_res->>'event_id' = v_event::text then
    raise exception 'FAIL undo_event returned event_id % undoing %', v_res->>'event_id', v_event;
  end if;

  -- (9) Undo the first chronicle save on a fresh space (Finding 2, test 2).
  --     save_timeline_entry's very first call on a space INSERTs the row
  --     then immediately UPDATEs it (bumping rev), so this one event holds
  --     BOTH ops for the SAME timelines row — untested above, where every
  --     chronicle edit landed on an already-existing row. A fresh space is
  --     required: v_space already has chronicle history from (6), so its
  --     next save would be a plain UPDATE, not this INSERT+UPDATE pair.
  v_tl_session := public.create_space('LEDGER-UNDO-TL', 'gm-pw', 'player-pw');
  v_tl_token   := v_tl_session->>'token';
  v_tl_space   := (v_tl_session->'space'->>'id')::uuid;

  perform public.save_timeline_entry(v_tl_token, 3, 'spring',
    jsonb_build_object('title','', 'body','<p>chronicle one</p>'), 0);
  select event_id into v_event from public.revisions
   where space_id = v_tl_space and table_name = 'timelines';

  v_res := public.undo_event(v_tl_token, v_event);
  v_event2 := (v_res->>'event_id')::uuid;
  if exists (select 1 from public.timelines where space_id = v_tl_space) then
    raise exception 'FAIL timelines row not removed by undoing the first save';
  end if;

  -- Undo THAT undo: a full redo, restoring both the row and its text. The
  -- text only reappears once this second call's own restore pass runs, so
  -- the check belongs after undo_event returns, not on any intermediate
  -- state of the first call.
  perform public.undo_event(v_tl_token, v_event2);
  select entries into v_tl from public.timelines where space_id = v_tl_space;
  if v_tl->'3'->'spring'->>'body' <> '<p>chronicle one</p>' then
    raise exception 'FAIL chronicle redo lost its text: %', v_tl;
  end if;

  -- (10) DEVIATION beyond the brief: the 23505 regression the IMPORTANT fix
  --      addresses. timelines.space_id is UNIQUE, but the DELETE/re-insert
  --      branch only ever screened by id — so re-inserting an event's own
  --      timelines row after a SEPARATE, LATER save has since claimed that
  --      space_id for a new row raised 23505 uncaught and aborted the whole
  --      undo, restoring nothing. Chained off (9)'s space and event (v_event
  --      is still the first-save event; no new space to clean up): undo
  --      that same event a SECOND time (removes the row again, minting a
  --      new event), let a fresh save reclaim the space's one-row slot,
  --      then undo THAT undo.
  --      DEVIATION from Finding 2's literal wording: "any other row in the
  --      same event still reports done" is not constructible here — the
  --      only way to get an op=DELETE revision on timelines at all is via
  --      undo_event's own remove branch, so the event under test here can
  --      only ever hold the two entries for this one physical row (both
  --      the re-insert and its sibling restore skip; neither can be
  --      'done', since the restore's row_missing is a direct consequence of
  --      the re-insert having failed first). The discriminating assertion
  --      is that the sibling skips cleanly instead of the whole call
  --      aborting, and that the row a completely separate save produced is
  --      left untouched.
  perform public.undo_event(v_tl_token, v_event);
  select event_id into v_event3 from public.revisions
   where space_id = v_tl_space and table_name = 'timelines'
   order by id desc limit 1;

  perform public.save_timeline_entry(v_tl_token, 4, 'summer',
    jsonb_build_object('title','', 'body','<p>chronicle two</p>'), 0);

  v_res := public.undo_event(v_tl_token, v_event3);   -- must not raise

  select count(*) into v_n
    from jsonb_array_elements(v_res->'rows') r
   where r->>'table_name' = 'timelines' and r->>'action' = 're-insert'
     and r->>'status' = 'skipped' and r->>'reason' = 'constraint_23505';
  if v_n <> 1 then
    raise exception 'FAIL colliding re-insert not reported constraint_23505: %', v_res;
  end if;

  -- The discriminating assertion: the sibling row skips cleanly instead of
  -- the whole call aborting (which is exactly what happened here, uncaught,
  -- before the IMPORTANT fix).
  select count(*) into v_n
    from jsonb_array_elements(v_res->'rows') r
   where r->>'table_name' = 'timelines' and r->>'action' = 'restore'
     and r->>'status' = 'skipped' and r->>'reason' = 'row_missing';
  if v_n <> 1 then
    raise exception 'FAIL sibling restore did not skip cleanly: %', v_res;
  end if;

  -- The resaved row itself, wholly unrelated to the event under test, must
  -- be untouched by the failed undo.
  select entries into v_tl from public.timelines where space_id = v_tl_space;
  if v_tl is null then
    raise exception 'FAIL resaved timelines row disappeared after the failed undo';
  end if;
  if v_tl->'4'->'summer'->>'body' <> '<p>chronicle two</p>' then
    raise exception 'FAIL resaved chronicle text corrupted by the failed undo: %', v_tl;
  end if;

  perform public.delete_space(v_tl_token, 'gm-pw');

  perform public.delete_space(v_token, 'gm-pw');
  raise notice 'UNDO OK';
end $$;
