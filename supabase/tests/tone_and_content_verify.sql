-- =====================================================================
-- Ink & Stone — tone & content verification scenario.
-- Run by CI against the local stack (see .github/workflows/ci.yml), and by
-- hand with `psql -v ON_ERROR_STOP=1 -f`. Re-runnable: it creates and
-- drops its own throwaway space.
-- =====================================================================
do $$
declare
  v_session jsonb; v_token text; v_ptoken text; v_vtoken text; v_space uuid;
  v_row public.tone_and_content; v_n int; v_label text;
  v_session2 jsonb; v_gtoken2 text;
begin
  v_session := public.create_space('TONE-TEST', 'gm-pw', 'player-pw');
  v_token   := v_session->>'token';
  v_space   := (v_session->'space'->>'id')::uuid;
  v_ptoken  := (public.join_space(v_session->'space'->>'invite_code', 'player-pw'))->>'token';

  -- (1) Empty before anyone writes: zero rows, not an error.
  select count(*) into v_n from public.get_tone_and_content(v_token);
  if v_n <> 0 then raise exception 'FAIL empty-read: % rows', v_n; end if;

  -- (2) A PLAYER can write. This is the whole point of the table.
  v_row := public.save_tone_and_content(v_ptoken,
    jsonb_build_object('notes', '<h2>Tone</h2><p>Plays it straight.</p>'));
  if v_row.notes not like '%Plays it straight%' then
    raise exception 'FAIL player-write: %', v_row.notes;
  end if;

  -- (3) Key-presence merge: an absent key is a no-op.
  v_row := public.save_tone_and_content(v_token, '{}'::jsonb);
  if v_row.notes not like '%Plays it straight%' then
    raise exception 'FAIL absent-key-clobbered: %', v_row.notes;
  end if;

  -- (4) An explicit empty string clears it.
  v_row := public.save_tone_and_content(v_token, jsonb_build_object('notes', ''));
  if v_row.notes <> '' then raise exception 'FAIL clear: %', v_row.notes; end if;

  -- (5) One row per space, whoever writes.
  select count(*) into v_n from public.tone_and_content where space_id = v_space;
  if v_n <> 1 then raise exception 'FAIL row-count: %', v_n; end if;

  -- (6) A VIEWER reads but cannot write.
  perform public.update_space_settings(v_token, 'gm-pw',
    jsonb_build_object('public_read', true));
  v_vtoken := (public.join_space(v_session->'space'->>'invite_code', ''))->>'token';
  select count(*) into v_n from public.get_tone_and_content(v_vtoken);
  if v_n <> 1 then raise exception 'FAIL viewer-read: % rows', v_n; end if;
  begin
    perform public.save_tone_and_content(v_vtoken, jsonb_build_object('notes', 'nope'));
    raise exception 'FAIL viewer-write: was allowed';
  exception when insufficient_privilege then null;   -- 42501, expected
  end;

  -- (7) Tenant isolation: a second space's GM gets none of this space's row,
  --     even though it has one (row-count above is 1). `get_tone_and_content`
  --     is `security definer` and granted to anon — the scope to the
  --     caller's own space is the whole security boundary, so this is the
  --     check most worth having on it.
  v_session2 := public.create_space('TONE-TEST-2', 'gm-pw-2', 'player-pw-2');
  v_gtoken2  := v_session2->>'token';
  select count(*) into v_n from public.get_tone_and_content(v_gtoken2);
  if v_n <> 0 then raise exception 'FAIL tenant-isolation: % rows', v_n; end if;
  perform public.delete_space(v_gtoken2, 'gm-pw-2');

  -- (8) The ledger captured it, and revision_label names the field.
  --     `revisions` stores before/after only — the label is COMPUTED at read
  --     time (get_revisions), so there is no revisions.label column to read.
  select public.revision_label('tone_and_content', r.before, r.after) into v_label
    from public.revisions r
   where r.space_id = v_space and r.table_name = 'tone_and_content'
   order by r.id desc limit 1;
  if v_label is distinct from 'notes' then
    raise exception 'FAIL ledger-label: %', coalesce(v_label, '<null>');
  end if;

  -- (9) delete_space takes the row with it.
  perform public.delete_space(v_token, 'gm-pw');
  select count(*) into v_n from public.tone_and_content where space_id = v_space;
  if v_n <> 0 then raise exception 'FAIL orphan after delete_space: %', v_n; end if;

  raise notice 'tone_and_content: ALL CHECKS PASSED';
end $$;
