-- =====================================================================
-- Ink & Stone — GM journal verification scenario.
-- Run by CI against the local stack (see .github/workflows/ci.yml), and by
-- hand with `psql -v ON_ERROR_STOP=1 -f`. Re-runnable: it
-- creates and drops its own throwaway space.
-- =====================================================================
do $$
declare
  v_session jsonb; v_token text; v_ptoken text; v_space uuid;
  v_row public.gm_journal; v_n int; v_event uuid; v_forbidden boolean;
begin
  v_session := public.create_space('JOURNAL-TEST', 'gm-pw', 'player-pw');
  v_token := v_session->>'token';
  v_space := (v_session->'space'->>'id')::uuid;
  v_ptoken := (public.join_space(v_session->'space'->>'invite_code', 'player-pw'))->>'token';

  -- (1) No row yet: GM read returns zero rows (no row created on read).
  select count(*) into v_n from public.get_gm_journal(v_token);
  if v_n <> 0 then raise exception 'FAIL empty read: got % rows', v_n; end if;

  -- (2) First save (notes only) upserts the row; wonders default to [].
  v_row := public.save_gm_journal(v_token, jsonb_build_object('notes', '<p>first</p>'));
  if v_row.notes <> '<p>first</p>' or v_row.wonders <> '[]'::jsonb then
    raise exception 'FAIL first save: %', to_jsonb(v_row);
  end if;

  -- (3) Wonders-only save must NOT clobber notes (key-presence merge).
  v_row := public.save_gm_journal(v_token, jsonb_build_object(
    'wonders', jsonb_build_array(jsonb_build_object(
      'id','00000000-0000-0000-0000-000000000001','text','I wonder…',
      'resolved',false,'created_at','2026-07-30T00:00:00Z'))));
  if v_row.notes <> '<p>first</p>' then raise exception 'FAIL merge clobbered notes'; end if;
  if jsonb_array_length(v_row.wonders) <> 1 then raise exception 'FAIL wonders not saved'; end if;

  -- (4) Notes-only save must not clobber wonders either.
  v_row := public.save_gm_journal(v_token, jsonb_build_object('notes', '<p>second</p>'));
  if jsonb_array_length(v_row.wonders) <> 1 then raise exception 'FAIL merge clobbered wonders'; end if;

  -- (5) Player read: zero rows (hidden row == missing row).
  select count(*) into v_n from public.get_gm_journal(v_ptoken);
  if v_n <> 0 then raise exception 'FAIL player read leaked % rows', v_n; end if;

  -- (6) Player write: FORBIDDEN.
  v_forbidden := false;
  begin
    perform public.save_gm_journal(v_ptoken, jsonb_build_object('notes','<p>nope</p>'));
  exception when insufficient_privilege then v_forbidden := true;
  end;
  if not v_forbidden then raise exception 'FAIL player write allowed'; end if;

  -- (7) Ledger: the saves above produced 1 INSERT + 2 UPDATEs, actor gm.
  select count(*) into v_n from public.revisions
   where space_id = v_space and table_name = 'gm_journal' and op = 'INSERT';
  if v_n <> 1 then raise exception 'FAIL capture insert: got %', v_n; end if;
  select count(*) into v_n from public.revisions
   where space_id = v_space and table_name = 'gm_journal' and op = 'UPDATE';
  if v_n <> 2 then raise exception 'FAIL capture updates: got %', v_n; end if;

  -- (8) No-op save logs nothing new.
  perform public.save_gm_journal(v_token, jsonb_build_object('notes', '<p>second</p>'));
  select count(*) into v_n from public.revisions
   where space_id = v_space and table_name = 'gm_journal' and op = 'UPDATE';
  if v_n <> 2 then raise exception 'FAIL no-op save was logged'; end if;

  -- (9) Label names the changed part.
  select count(*) into v_n from public.revisions r
   where r.space_id = v_space and r.table_name = 'gm_journal' and r.op = 'UPDATE'
     and public.revision_label('gm_journal', r.before, r.after) = 'notes';
  if v_n < 1 then raise exception 'FAIL label'; end if;

  -- (10) Undo restores the previous notes through the generic path.
  -- Match on the AFTER side: both UPDATEs above still carry
  -- before.notes = '<p>first</p>' (the wonders save did not touch notes),
  -- so selecting by `before` alone is ambiguous.
  select event_id into v_event from public.revisions
   where space_id = v_space and table_name = 'gm_journal' and op = 'UPDATE'
     and after->>'notes' = '<p>second</p>' limit 1;
  perform public.undo_event(v_token, v_event);
  select count(*) into v_n from public.gm_journal
   where space_id = v_space and notes = '<p>first</p>';
  if v_n <> 1 then raise exception 'FAIL undo did not restore notes'; end if;

  -- (11) delete_space removes the journal row without erroring.
  perform public.delete_space(v_token, 'gm-pw');
  select count(*) into v_n from public.gm_journal where space_id = v_space;
  if v_n <> 0 then raise exception 'FAIL journal row survived delete_space'; end if;

  raise notice 'gm_journal verify: ALL OK';
end $$;
