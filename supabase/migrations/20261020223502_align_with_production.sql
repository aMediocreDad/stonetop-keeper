-- Bring a fresh database up to production's posture.
--
-- `20260822193819_init.sql` is a dump, and a dump records privilege state,
-- not the revokes that produced it. `supabase db diff --linked` against
-- production showed no structural drift, only what the dump lost:
--
--   * production revokes `service_role` from the tables, the sequence and
--     every RPC, and `anon`/`authenticated` from the internal helpers;
--   * production publishes four tables to `supabase_realtime`.
--
-- The diff also listed a schema-level `grant execute on functions to public`
-- default. It is not copied, and not revoked either: EXECUTE for PUBLIC is
-- Postgres's GLOBAL default, which a per-schema default cannot take away, so a
-- fresh database and production behave the same. A new function is callable
-- by anyone until revoked, which is why every function in init.sql carries
-- its own `revoke all ... from public`. New ones need it too.
--
-- Everything below is idempotent and already true in production, so it is a
-- no-op there and only changes a fresh database (CI, the local stack).

-- Internal helpers: no API role calls these directly.
revoke all on function public.app_broadcast_change() from anon, authenticated, service_role;
revoke all on function public.app_capture_revision() from anon, authenticated, service_role;
revoke all on function public.app_character_mechanics_open(text, jsonb, jsonb) from anon, authenticated, service_role;
revoke all on function public.app_character_row_for_role(public.characters, text) from anon, authenticated, service_role;
revoke all on function public.app_gen_invite_code() from anon, authenticated, service_role;
revoke all on function public.app_is_follower(jsonb, jsonb) from anon, authenticated, service_role;
revoke all on function public.app_legacy_hash(text) from anon, authenticated, service_role;
revoke all on function public.app_new_token() from anon, authenticated, service_role;
revoke all on function public.app_note_login_failure(text) from anon, authenticated, service_role;
revoke all on function public.app_session_from_token(text) from anon, authenticated, service_role;
revoke all on function public.app_space_from_token(text) from anon, authenticated, service_role;
revoke all on function public.app_to_base36(bigint) from anon, authenticated, service_role;
revoke all on function public.app_verify_password(uuid, text) from anon, authenticated, service_role;
revoke all on function public.prune_revisions(integer) from anon, authenticated, service_role;
revoke all on function public.revision_changed_keys(jsonb, jsonb) from anon, authenticated, service_role;
revoke all on function public.revision_label(text, jsonb, jsonb) from anon, authenticated, service_role;
revoke all on function public.revision_merge_timeline(jsonb, jsonb) from anon, authenticated, service_role;
revoke all on function public.revision_preview_label(uuid, uuid, text, jsonb, jsonb) from anon, authenticated, service_role;
revoke all on function public.revision_table_rank(text) from anon, authenticated, service_role;
revoke all on function public.revision_undo_check(uuid, uuid, text, jsonb) from anon, authenticated, service_role;
revoke all on function public.revision_will_exist(uuid, uuid, text, uuid) from anon, authenticated, service_role;
revoke all on function public.season_has_text(jsonb) from anon, authenticated, service_role;
revoke all on function public.season_rev(jsonb) from anon, authenticated, service_role;
revoke all on function public.set_updated_at() from anon, authenticated, service_role;
revoke all on function public.timeline_latest(jsonb) from anon, authenticated, service_role;

-- The map-image edge function calls this with the service role; the API
-- roles never do.
revoke all on function public.map_image_access(text, uuid, boolean) from anon, authenticated;

-- RPCs: the app and the MCP server call these as anon with a space token,
-- never with the service role.
revoke all on function public.create_character(text, jsonb) from service_role;
revoke all on function public.create_location(text, jsonb) from service_role;
revoke all on function public.create_map(text, jsonb) from service_role;
revoke all on function public.create_map_pin(text, jsonb) from service_role;
revoke all on function public.create_relation(text, jsonb) from service_role;
revoke all on function public.create_space(text, text, text) from service_role;
revoke all on function public.delete_character(text, uuid) from service_role;
revoke all on function public.delete_location(text, uuid) from service_role;
revoke all on function public.delete_map(text, uuid) from service_role;
revoke all on function public.delete_map_pin(text, uuid) from service_role;
revoke all on function public.delete_relation(text, uuid) from service_role;
revoke all on function public.delete_space(text, text) from service_role;
revoke all on function public.get_characters(text) from service_role;
revoke all on function public.get_gm_journal(text) from service_role;
revoke all on function public.get_locations(text) from service_role;
revoke all on function public.get_map_pins(text, uuid) from service_role;
revoke all on function public.get_maps(text) from service_role;
revoke all on function public.get_relations(text) from service_role;
revoke all on function public.get_revisions(text, integer, bigint) from service_role;
revoke all on function public.get_timeline(text) from service_role;
revoke all on function public.get_tone_and_content(text) from service_role;
revoke all on function public.join_space(text, text) from service_role;
revoke all on function public.move_timeline_entry(text, integer, text, integer, text) from service_role;
revoke all on function public.preview_undo_event(text, uuid, uuid) from service_role;
revoke all on function public.save_gm_journal(text, jsonb) from service_role;
revoke all on function public.save_gm_timeline(text, jsonb) from service_role;
revoke all on function public.save_gm_timeline_entry(text, integer, text, jsonb, integer) from service_role;
revoke all on function public.save_timeline(text, jsonb) from service_role;
revoke all on function public.save_timeline_entry(text, integer, text, jsonb, integer) from service_role;
revoke all on function public.save_tone_and_content(text, jsonb) from service_role;
revoke all on function public.undo_event(text, uuid) from service_role;
revoke all on function public.update_character(text, uuid, jsonb) from service_role;
revoke all on function public.update_location(text, uuid, jsonb) from service_role;
revoke all on function public.update_map(text, uuid, jsonb) from service_role;
revoke all on function public.update_map_pin(text, uuid, jsonb) from service_role;
revoke all on function public.update_relation(text, uuid, jsonb) from service_role;
revoke all on function public.update_space_settings(text, text, jsonb) from service_role;

revoke all on table
  public.characters, public.gm_journal, public.locations, public.relations,
  public.revisions, public.space_login_throttle, public.space_sessions,
  public.spaces, public.timelines, public.tone_and_content
  from service_role;
revoke all on sequence public.revisions_id_seq from service_role;

-- Defaults for objects future migrations create.
alter default privileges for role postgres in schema public revoke all on tables from service_role;
alter default privileges for role postgres in schema public revoke all on sequences from service_role;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, service_role;

comment on schema public is null;

-- Realtime. `add table` errors on a table already published, so guard it.
do $$
declare
  t text;
begin
  foreach t in array array['characters', 'locations', 'relations', 'spaces'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;
