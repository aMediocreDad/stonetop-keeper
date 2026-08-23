--
-- Ink & Stone — complete schema, squashed.
--
-- Generated mechanically with `pg_dump --schema-only --schema=public` against
-- production, replacing the former db/01..19 migration chain. Do not hand-edit
-- function bodies: re-derive by dumping production instead.
--
-- Apply locally with `supabase db reset`, which replays this file from scratch.
-- Production already holds this schema -- it is the source it was dumped from,
-- so this file is never applied there. A later change is a NEW timestamped
-- migration beside this one, applied locally first and then to production;
-- never an edit to this file.
--
-- Privileges are included deliberately. This schema's security model is
-- REVOKE/GRANT-based -- RLS is enabled on every table with zero policies
-- (deny-all), anon holds no table privileges, and every way in is a
-- SECURITY DEFINER RPC. Dumping with --no-privileges would silently strip all
-- of that. See the trailing revoke sweep for why absence alone is not enough.
--
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA IF NOT EXISTS public;


ALTER SCHEMA public OWNER TO postgres;

--
-- Name: app_broadcast_change(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.app_broadcast_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space uuid;
begin
  v_space := coalesce(new.space_id, old.space_id);
  perform realtime.send(
    jsonb_build_object('space_id', v_space, 'table', tg_table_name, 'op', tg_op),
    'change',
    'space-' || v_space::text,
    false
  );
  return null;
end $$;


ALTER FUNCTION public.app_broadcast_change() OWNER TO postgres;

--
-- Name: app_capture_revision(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.app_capture_revision() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare
  v_before jsonb;
  v_after  jsonb;
  v_space  uuid;
  v_row    uuid;
begin
  -- REQUIRED, not an optimization. delete_space never deletes maps/map_pins
  -- explicitly (they cascade from the spaces row), so this trigger fires
  -- during that cascade too. Without this guard, capturing here would
  -- INSERT a revisions row whose space_id FK points at the space row
  -- currently being deleted -> 23503 foreign_key_violation, breaking
  -- delete_space for any space that owns a map. A raw `delete from
  -- public.spaces` outside delete_space is therefore unsupported: it never
  -- sets this flag, so the same cascade will 23503.
  if coalesce(current_setting('app.event_kind', true), '') = 'space_delete' then
    return null;
  end if;

  if tg_op <> 'INSERT' then v_before := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_after  := to_jsonb(new); end if;

  -- maps.thumb is a ~57 kB data-URL preview; the real image lives in
  -- Storage under image_path. Snapshotting it would dominate the ledger.
  if tg_table_name = 'maps' then
    v_before := v_before - 'thumb';
    v_after  := v_after  - 'thumb';
  end if;

  -- A debounced autosave that changed nothing must not fill the ledger.
  -- Does not cover timelines: save_timeline_entry bumps a `rev` counter
  -- inside `entries` on every save, so before/after always differ there
  -- even when the visible season text is unchanged.
  if tg_op = 'UPDATE'
     and (v_before - 'updated_at') = (v_after - 'updated_at') then
    return null;
  end if;

  v_space := coalesce((v_after->>'space_id')::uuid, (v_before->>'space_id')::uuid);
  v_row   := coalesce((v_after->>'id')::uuid, (v_before->>'id')::uuid);

  insert into public.revisions
    (space_id, event_id, table_name, row_id, op, before, after, actor_role)
  values (
    v_space,
    -- No session (SQL Editor, migration, seed) => a fresh event and a null
    -- actor. Logged, and visibly attributed to nobody.
    coalesce(nullif(current_setting('app.event_id', true), '')::uuid, gen_random_uuid()),
    tg_table_name, v_row, tg_op, v_before, v_after,
    nullif(current_setting('app.actor_role', true), '')
  );
  return null;
end $$;


ALTER FUNCTION public.app_capture_revision() OWNER TO postgres;

--
-- Name: app_character_mechanics_open(text, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.app_character_mechanics_open(v_type text, v_follower jsonb, v_statblock jsonb) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'extensions'
    AS $$
  select v_type is not distinct from 'PJ'
      or (v_type is distinct from 'MENACE'
          and v_type is distinct from 'DISCOVERY'
          and public.app_is_follower(v_follower, v_statblock))
$$;


ALTER FUNCTION public.app_character_mechanics_open(v_type text, v_follower jsonb, v_statblock jsonb) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: characters; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.characters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    space_id uuid NOT NULL,
    name text NOT NULL,
    role text DEFAULT ''::text NOT NULL,
    type text NOT NULL,
    location uuid,
    notes text DEFAULT ''::text NOT NULL,
    traits jsonb DEFAULT '[]'::jsonb NOT NULL,
    tags jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    gm_only boolean DEFAULT false NOT NULL,
    gm_notes text,
    threat jsonb,
    instinct text DEFAULT ''::text NOT NULL,
    statblock jsonb,
    kind text,
    follower jsonb,
    dead boolean DEFAULT false NOT NULL,
    discovery jsonb,
    CONSTRAINT characters_type_check CHECK ((type = ANY (ARRAY['PJ'::text, 'PNJ'::text, 'GROUPE'::text, 'MENACE'::text, 'DISCOVERY'::text])))
);

ALTER TABLE ONLY public.characters REPLICA IDENTITY FULL;


ALTER TABLE public.characters OWNER TO postgres;

--
-- Name: COLUMN characters.discovery; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.characters.discovery IS 'Per-kind DISCOVERY fields (tier, interesting, useful, moves, tracks, mysteries, consequences). Meaningless on the other four types; tolerated rather than forbidden, per the read-path doctrine. `interesting`/`useful` are GM-held and stripped by app_character_row_for_role.';


--
-- Name: app_character_row_for_role(public.characters, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.app_character_row_for_role(v_row public.characters, v_role text) RETURNS public.characters
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public', 'extensions'
    AS $$
begin
  if v_role = 'gm' then return v_row; end if;
  v_row.gm_notes := null;
  -- `interesting`/`useful` are answers the GM withholds until a roll lands,
  -- so publishing a discovery must not publish them. The rest of the block
  -- IS player-facing: an arcanum is a handout.
  -- Same shape guard as `threat` below: `-` raises 22023 unless the left
  -- operand is an object or array, and a past write could have left a scalar.
  v_row.discovery := case when jsonb_typeof(v_row.discovery) = 'object'
                          then v_row.discovery - 'interesting' - 'useful'
                          else v_row.discovery end;
  -- `kind`/`tags`/`follower` deliberately survive: description, not mechanics.
  if not public.app_character_mechanics_open(
       v_row.type, v_row.follower, v_row.statblock) then
    v_row.instinct  := '';
    v_row.statblock := null;
    -- `-` on a jsonb value raises 22023 unless the left operand is an
    -- object/array; past writes can have left threat as a JSON scalar
    -- (e.g. 'null'::jsonb), so guard the shape before subtracting.
    v_row.threat    := case when jsonb_typeof(v_row.threat) = 'object'
                             then v_row.threat - 'instinct' else v_row.threat end;
  end if;
  return v_row;
end $$;


ALTER FUNCTION public.app_character_row_for_role(v_row public.characters, v_role text) OWNER TO postgres;

--
-- Name: app_gen_invite_code(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.app_gen_invite_code() RETURNS text
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare c text := 'abcdefghijklmnopqrstuvwxyz'; f text := '';
begin
  for i in 1..5 loop
    f := f || substr(c, 1 + floor(random()*26)::int, 1);
  end loop;
  return substr(f,1,2) || '-' || substr(f,3,3);
end $$;


ALTER FUNCTION public.app_gen_invite_code() OWNER TO postgres;

--
-- Name: app_is_follower(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.app_is_follower(v_follower jsonb, v_statblock jsonb) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'extensions'
    AS $$
  select jsonb_typeof(v_follower) is not distinct from 'object'
      or jsonb_typeof(v_statblock->'follower') is not distinct from 'object'
$$;


ALTER FUNCTION public.app_is_follower(v_follower jsonb, v_statblock jsonb) OWNER TO postgres;

--
-- Name: app_legacy_hash(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.app_legacy_hash(p text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
declare h bigint := 0; salt text := 'inkstone-salt-2024';
        v_str text; i int;
begin
  v_str := coalesce(p,'') || salt;
  for i in 1..length(v_str) loop
    h := (h << 5) - h + ascii(substr(v_str, i, 1));
    h := h & 4294967295;
    if h >= 2147483648 then h := h - 4294967296; end if;
  end loop;
  if h < 0 then h := -h; end if;
  return lpad(public.app_to_base36(h), 16, '0');
end $$;


ALTER FUNCTION public.app_legacy_hash(p text) OWNER TO postgres;

--
-- Name: app_new_token(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.app_new_token() RETURNS text
    LANGUAGE sql
    SET search_path TO 'public', 'extensions'
    AS $$
  select encode(gen_random_bytes(24), 'hex');
$$;


ALTER FUNCTION public.app_new_token() OWNER TO postgres;

--
-- Name: app_note_login_failure(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.app_note_login_failure(p_code text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_fails int;
begin
  insert into public.space_login_throttle (invite_code, fail_count, window_start)
  values (p_code, 1, now())
  on conflict (invite_code) do update set
    fail_count = case
      when space_login_throttle.window_start < now() - interval '15 minutes' then 1
      else space_login_throttle.fail_count + 1 end,
    window_start = case
      when space_login_throttle.window_start < now() - interval '15 minutes' then now()
      else space_login_throttle.window_start end
  returning fail_count into v_fails;

  if v_fails >= 10 then
    update public.space_login_throttle
       set locked_until = now() + interval '15 minutes'
     where invite_code = p_code;
  end if;
end $$;


ALTER FUNCTION public.app_note_login_failure(p_code text) OWNER TO postgres;

--
-- Name: app_session_from_token(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.app_session_from_token(p_token text, OUT o_space uuid, OUT o_role text) RETURNS record
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
begin
  update public.space_sessions
     set last_seen = now()
   where token_hash = encode(digest(p_token, 'sha256'), 'hex')
     and last_seen > now() - interval '90 days'
  returning space_id, role into o_space, o_role;
  if o_space is null then
    raise exception 'INVALID_TOKEN' using errcode = '28000';
  end if;
  -- Revision-ledger provenance. event_kind is cleared so a previous
  -- statement's kind cannot leak into this call.
  perform set_config('app.event_id',   gen_random_uuid()::text, true);
  perform set_config('app.actor_role', o_role,                  true);
  perform set_config('app.event_kind', '',                      true);
end $$;


ALTER FUNCTION public.app_session_from_token(p_token text, OUT o_space uuid, OUT o_role text) OWNER TO postgres;

--
-- Name: app_space_from_token(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.app_space_from_token(p_token text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space uuid;
begin
  update public.space_sessions
     set last_seen = now()
   where token_hash = encode(digest(p_token, 'sha256'), 'hex')
     and last_seen > now() - interval '90 days'
  returning space_id into v_space;
  if v_space is null then
    raise exception 'INVALID_TOKEN' using errcode = '28000';
  end if;
  return v_space;
end $$;


ALTER FUNCTION public.app_space_from_token(p_token text) OWNER TO postgres;

--
-- Name: app_to_base36(bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.app_to_base36(n bigint) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
declare digits text := '0123456789abcdefghijklmnopqrstuvwxyz';
        r text := ''; v bigint := n;
begin
  if v = 0 then return '0'; end if;
  while v > 0 loop
    r := substr(digits, (v % 36)::int + 1, 1) || r;
    v := v / 36;
  end loop;
  return r;
end $$;


ALTER FUNCTION public.app_to_base36(n bigint) OWNER TO postgres;

--
-- Name: app_verify_password(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.app_verify_password(p_space_id uuid, p_password text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $_$
declare v_hash text; v_ok boolean := false;
begin
  select password_hash into v_hash from public.spaces where id = p_space_id;
  if v_hash is null then return false; end if;

  if left(v_hash, 1) = '$' then            -- already bcrypt
    v_ok := (v_hash = crypt(p_password, v_hash));
  else                                     -- legacy 32-bit hash
    v_ok := (v_hash = public.app_legacy_hash(p_password));
    if v_ok then
      update public.spaces
         set password_hash = crypt(p_password, gen_salt('bf', 12))
       where id = p_space_id;
    end if;
  end if;
  return v_ok;
end $_$;


ALTER FUNCTION public.app_verify_password(p_space_id uuid, p_password text) OWNER TO postgres;

--
-- Name: create_character(text, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_character(p_token text, p_data jsonb) RETURNS public.characters
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space uuid; v_role text; v_row public.characters; v_open boolean;
begin
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role = 'viewer' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if v_role <> 'gm'
     and (coalesce((p_data->>'gm_only')::boolean, false) or p_data ? 'gm_notes') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  v_open := v_role = 'gm' or public.app_character_mechanics_open(
              p_data->>'type', p_data->'follower', p_data->'statblock');

  insert into public.characters
    (space_id, name, role, type, location, notes, traits, tags, instinct,
     gm_only, gm_notes, threat, statblock, kind, follower, dead, discovery)
  values (
    v_space,
    p_data->>'name',
    coalesce(p_data->>'role', ''),
    p_data->>'type',
    (nullif(p_data->>'location',''))::uuid,
    coalesce(p_data->>'notes', ''),
    coalesce(p_data->'traits', '[]'::jsonb),
    coalesce(p_data->'tags',   '[]'::jsonb),
    coalesce(case when v_open then p_data->>'instinct' end, ''),
    coalesce((p_data->>'gm_only')::boolean, false),
    p_data->>'gm_notes',
    p_data->'threat',
    case when v_open then p_data->'statblock' end,
    case when v_open then p_data->>'kind' end,
    case when v_open then p_data->'follower' end,
    coalesce((p_data->>'dead')::boolean, false),
    -- The block itself is ungated, like name/traits. The GM-HELD PAIR is the
    -- exception: creation has no stored value to re-graft, so without this a
    -- player could author prep the GM never wrote.
    -- The ::text casts are load-bearing: without them both operands of `-`
    -- parse as `unknown` and the call fails at runtime with 42725.
    case when v_role = 'gm' then p_data->'discovery'
         when jsonb_typeof(p_data->'discovery') = 'object'
           then (p_data->'discovery') - 'interesting'::text - 'useful'::text
         else p_data->'discovery' end
  ) returning * into v_row;
  return public.app_character_row_for_role(v_row, v_role);
end $$;


ALTER FUNCTION public.create_character(p_token text, p_data jsonb) OWNER TO postgres;

--
-- Name: locations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    space_id uuid NOT NULL,
    name text NOT NULL,
    color text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    tags jsonb DEFAULT '[]'::jsonb NOT NULL,
    steading jsonb,
    gm_only boolean DEFAULT false NOT NULL,
    gm_notes text
);

ALTER TABLE ONLY public.locations REPLICA IDENTITY FULL;


ALTER TABLE public.locations OWNER TO postgres;

--
-- Name: create_location(text, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_location(p_token text, p_data jsonb) RETURNS public.locations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space uuid; v_role text; v_row public.locations;
begin
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role = 'viewer' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if v_role <> 'gm'
     and (coalesce((p_data->>'gm_only')::boolean, false) or p_data ? 'gm_notes') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.locations
    (space_id, name, color, description, notes, tags, steading, gm_only, gm_notes)
  values (
    v_space,
    p_data->>'name',
    p_data->>'color',
    coalesce(p_data->>'description', ''),
    coalesce(p_data->>'notes', ''),
    coalesce(p_data->'tags', '[]'::jsonb),
    p_data->'steading',
    coalesce((p_data->>'gm_only')::boolean, false),
    p_data->>'gm_notes'
  ) returning * into v_row;
  if v_role <> 'gm' then v_row.gm_notes := null; end if;
  return v_row;
end $$;


ALTER FUNCTION public.create_location(p_token text, p_data jsonb) OWNER TO postgres;

--
-- Name: maps; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.maps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    space_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    location_id uuid,
    image_path text,
    image_width integer,
    image_height integer,
    thumb text,
    gm_only boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.maps OWNER TO postgres;

--
-- Name: create_map(text, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_map(p_token text, p_data jsonb) RETURNS public.maps
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space uuid; v_role text; v_row public.maps; v_loc uuid;
begin
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role <> 'gm' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if coalesce(trim(p_data->>'name'), '') = '' then raise exception 'INVALID_INPUT'; end if;
  if length(coalesce(p_data->>'thumb', '')) > 200000 then raise exception 'INVALID_INPUT'; end if;

  v_loc := (nullif(p_data->>'location_id',''))::uuid;
  if v_loc is not null and not exists (
       select 1 from public.locations where id = v_loc and space_id = v_space) then
    raise exception 'NOT_FOUND';
  end if;

  insert into public.maps (space_id, name, description, location_id, thumb, gm_only)
  values (
    v_space,
    trim(p_data->>'name'),
    p_data->>'description',
    v_loc,
    p_data->>'thumb',
    coalesce((p_data->>'gm_only')::boolean, false)
  ) returning * into v_row;
  return v_row;
end $$;


ALTER FUNCTION public.create_map(p_token text, p_data jsonb) OWNER TO postgres;

--
-- Name: map_pins; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.map_pins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    map_id uuid NOT NULL,
    space_id uuid NOT NULL,
    x double precision NOT NULL,
    y double precision NOT NULL,
    character_id uuid,
    location_id uuid,
    label text,
    note text,
    gm_only boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT map_pins_one_entity CHECK (((character_id IS NULL) OR (location_id IS NULL))),
    CONSTRAINT map_pins_x_check CHECK (((x >= (0)::double precision) AND (x <= (1)::double precision))),
    CONSTRAINT map_pins_y_check CHECK (((y >= (0)::double precision) AND (y <= (1)::double precision)))
);


ALTER TABLE public.map_pins OWNER TO postgres;

--
-- Name: create_map_pin(text, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_map_pin(p_token text, p_data jsonb) RETURNS public.map_pins
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare
  v_space uuid; v_role text; v_row public.map_pins; v_map public.maps;
  v_char uuid; v_loc uuid;
begin
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role = 'viewer' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  -- Same rule as update_map_pin: the KEY's presence is GM-only (clients omit
  -- it for players), keeping the create/update contract symmetrical.
  if v_role <> 'gm' and p_data ? 'gm_only' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_map from public.maps
    where id = (p_data->>'map_id')::uuid and space_id = v_space;
  if not found or (v_role <> 'gm' and v_map.gm_only) then
    raise exception 'NOT_FOUND';
  end if;

  v_char := (nullif(p_data->>'character_id',''))::uuid;
  v_loc  := (nullif(p_data->>'location_id',''))::uuid;
  if v_char is not null and not exists (
       select 1 from public.characters where id = v_char and space_id = v_space
         and (v_role = 'gm' or gm_only = false)) then
    raise exception 'NOT_FOUND';
  end if;
  if v_loc is not null and not exists (
       select 1 from public.locations where id = v_loc and space_id = v_space
         and (v_role = 'gm' or gm_only = false)) then
    raise exception 'NOT_FOUND';
  end if;

  -- Une note libre (aucune fiche liée) doit porter un libellé.
  if v_char is null and v_loc is null
     and coalesce(trim(p_data->>'label'), '') = '' then
    raise exception 'INVALID_INPUT';
  end if;

  insert into public.map_pins
    (map_id, space_id, x, y, character_id, location_id, label, note, gm_only)
  values (
    v_map.id, v_space,
    (p_data->>'x')::double precision,
    (p_data->>'y')::double precision,
    v_char, v_loc,
    p_data->>'label',
    p_data->>'note',
    coalesce((p_data->>'gm_only')::boolean, false)
  ) returning * into v_row;
  return v_row;
end $$;


ALTER FUNCTION public.create_map_pin(p_token text, p_data jsonb) OWNER TO postgres;

--
-- Name: relations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.relations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    space_id uuid NOT NULL,
    from_character_id uuid NOT NULL,
    to_character_id uuid NOT NULL,
    relation_type text NOT NULL,
    relation_detail text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    gm_only boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY public.relations REPLICA IDENTITY FULL;


ALTER TABLE public.relations OWNER TO postgres;

--
-- Name: create_relation(text, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_relation(p_token text, p_data jsonb) RETURNS public.relations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space uuid; v_role text; v_row public.relations;
begin
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role = 'viewer' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if v_role <> 'gm' and coalesce((p_data->>'gm_only')::boolean, false) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_role <> 'gm' and exists (
       select 1 from public.characters
        where space_id = v_space and gm_only
          and id in ((p_data->>'from_character_id')::uuid,
                     (p_data->>'to_character_id')::uuid)) then
    raise exception 'NOT_FOUND';
  end if;

  insert into public.relations
    (space_id, from_character_id, to_character_id, relation_type, relation_detail, gm_only)
  values (
    v_space,
    (p_data->>'from_character_id')::uuid,
    (p_data->>'to_character_id')::uuid,
    p_data->>'relation_type',
    p_data->>'relation_detail',
    coalesce((p_data->>'gm_only')::boolean, false)
  ) returning * into v_row;
  return v_row;
end $$;


ALTER FUNCTION public.create_relation(p_token text, p_data jsonb) OWNER TO postgres;

--
-- Name: create_space(text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_space(p_name text, p_password text, p_player_password text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space public.spaces; v_token text; v_code text; v_try int := 0;
begin
  if coalesce(trim(p_name),'') = '' or coalesce(p_password,'') = '' then
    raise exception 'INVALID_INPUT';
  end if;

  loop
    v_code := public.app_gen_invite_code();
    exit when not exists (select 1 from public.spaces where invite_code = v_code);
    v_try := v_try + 1;
    if v_try > 20 then raise exception 'CODE_GEN_FAILED'; end if;
  end loop;

  insert into public.spaces (name, invite_code, password_hash, player_password_hash)
  values (
    trim(p_name), v_code,
    crypt(p_password, gen_salt('bf', 12)),
    case when coalesce(p_player_password,'') = '' then null
         else crypt(p_player_password, gen_salt('bf', 12)) end
  ) returning * into v_space;

  v_token := public.app_new_token();
  insert into public.space_sessions (token_hash, space_id, is_admin, role)
  values (encode(digest(v_token, 'sha256'), 'hex'), v_space.id, true, 'gm');

  return jsonb_build_object(
    'space',    to_jsonb(v_space) - 'password_hash' - 'player_password_hash',
    'token',    v_token,
    'is_admin', true,
    'role',     'gm'
  );
end $$;


ALTER FUNCTION public.create_space(p_name text, p_password text, p_player_password text) OWNER TO postgres;

--
-- Name: delete_character(text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.delete_character(p_token text, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space uuid; v_role text;
begin
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role = 'viewer' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  delete from public.characters
   where id = p_id and space_id = v_space
     and (v_role = 'gm' or gm_only = false);
end $$;


ALTER FUNCTION public.delete_character(p_token text, p_id uuid) OWNER TO postgres;

--
-- Name: delete_location(text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.delete_location(p_token text, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space uuid; v_role text;
begin
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role = 'viewer' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  delete from public.locations
   where id = p_id and space_id = v_space
     and (v_role = 'gm' or gm_only = false);
end $$;


ALTER FUNCTION public.delete_location(p_token text, p_id uuid) OWNER TO postgres;

--
-- Name: delete_map(text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.delete_map(p_token text, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space uuid; v_role text;
begin
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role <> 'gm' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  delete from public.maps where id = p_id and space_id = v_space;
end $$;


ALTER FUNCTION public.delete_map(p_token text, p_id uuid) OWNER TO postgres;

--
-- Name: delete_map_pin(text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.delete_map_pin(p_token text, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space uuid; v_role text;
begin
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role = 'viewer' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  delete from public.map_pins p
   where p.id = p_id and p.space_id = v_space
     and (v_role = 'gm' or (
       p.gm_only = false
       and not exists (select 1 from public.maps m
                        where m.id = p.map_id and m.gm_only)
       and not exists (select 1 from public.characters c
                        where c.id = p.character_id and c.gm_only)
       and not exists (select 1 from public.locations l
                        where l.id = p.location_id and l.gm_only)));
end $$;


ALTER FUNCTION public.delete_map_pin(p_token text, p_id uuid) OWNER TO postgres;

--
-- Name: delete_relation(text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.delete_relation(p_token text, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space uuid; v_role text;
begin
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role = 'viewer' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  delete from public.relations r
   where r.id = p_id and r.space_id = v_space
     and (v_role = 'gm' or (r.gm_only = false and not exists (
           select 1 from public.characters ch
            where ch.id in (r.from_character_id, r.to_character_id) and ch.gm_only)));
end $$;


ALTER FUNCTION public.delete_relation(p_token text, p_id uuid) OWNER TO postgres;

--
-- Name: delete_space(text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.delete_space(p_token text, p_password text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space uuid; v_role text;
begin
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role <> 'gm' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not public.app_verify_password(v_space, p_password) then
    raise exception 'WRONG_PASSWORD';
  end if;
  perform set_config('app.event_kind', 'space_delete', true);
  delete from public.relations        where space_id = v_space;
  delete from public.characters       where space_id = v_space;
  delete from public.locations        where space_id = v_space;
  delete from public.timelines        where space_id = v_space;
  delete from public.gm_journal       where space_id = v_space;
  delete from public.tone_and_content where space_id = v_space;
  delete from public.space_sessions   where space_id = v_space;
  delete from public.spaces           where id = v_space;
end $$;


ALTER FUNCTION public.delete_space(p_token text, p_password text) OWNER TO postgres;

--
-- Name: get_characters(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_characters(p_token text) RETURNS SETOF public.characters
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space uuid; v_role text;
begin
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role = 'gm' then
    return query select * from public.characters
      where space_id = v_space order by created_at;
  else
    -- (app_character_row_for_role(c, v_role)).* would call the helper once
    -- PER OUTPUT COLUMN (confirmed via EXPLAIN); LATERAL calls it once per row.
    return query
      select r.* from public.characters c
        cross join lateral public.app_character_row_for_role(c, v_role) r
       where c.space_id = v_space and c.gm_only = false
       order by c.created_at;
  end if;
end $$;


ALTER FUNCTION public.get_characters(p_token text) OWNER TO postgres;

--
-- Name: gm_journal; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.gm_journal (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    space_id uuid NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    wonders jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.gm_journal OWNER TO postgres;

--
-- Name: get_gm_journal(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_gm_journal(p_token text) RETURNS SETOF public.gm_journal
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space uuid; v_role text;
begin
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role <> 'gm' then return; end if;   -- hidden row == missing row
  return query select * from public.gm_journal where space_id = v_space;
end $$;


ALTER FUNCTION public.get_gm_journal(p_token text) OWNER TO postgres;

--
-- Name: get_locations(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_locations(p_token text) RETURNS SETOF public.locations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space uuid; v_role text;
begin
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role = 'gm' then
    return query select * from public.locations
      where space_id = v_space order by created_at;
  else
    return query
      select (jsonb_populate_record(l, '{"gm_notes": null}'::jsonb)).*
        from public.locations l
       where l.space_id = v_space and l.gm_only = false
       order by l.created_at;
  end if;
end $$;


ALTER FUNCTION public.get_locations(p_token text) OWNER TO postgres;

--
-- Name: get_map_pins(text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_map_pins(p_token text, p_map_id uuid) RETURNS SETOF public.map_pins
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space uuid; v_role text; v_map public.maps;
begin
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  select * into v_map from public.maps
    where id = p_map_id and space_id = v_space;
  if not found or (v_role <> 'gm' and v_map.gm_only) then
    raise exception 'NOT_FOUND';
  end if;

  if v_role = 'gm' then
    return query select * from public.map_pins
      where map_id = p_map_id order by created_at;
  else
    return query
      select p.* from public.map_pins p
        left join public.characters c on c.id = p.character_id
        left join public.locations  l on l.id = p.location_id
       where p.map_id = p_map_id and p.gm_only = false
         and coalesce(c.gm_only, false) = false
         and coalesce(l.gm_only, false) = false
       order by p.created_at;
  end if;
end $$;


ALTER FUNCTION public.get_map_pins(p_token text, p_map_id uuid) OWNER TO postgres;

--
-- Name: get_maps(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_maps(p_token text) RETURNS SETOF public.maps
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space uuid; v_role text;
begin
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role = 'gm' then
    return query select * from public.maps
      where space_id = v_space order by created_at;
  else
    return query select * from public.maps
      where space_id = v_space and gm_only = false order by created_at;
  end if;
end $$;


ALTER FUNCTION public.get_maps(p_token text) OWNER TO postgres;

--
-- Name: get_relations(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_relations(p_token text) RETURNS SETOF public.relations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space uuid; v_role text;
begin
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role = 'gm' then
    return query select * from public.relations
      where space_id = v_space order by created_at;
  else
    return query
      select r.* from public.relations r
        join public.characters cf on cf.id = r.from_character_id
        join public.characters ct on ct.id = r.to_character_id
       where r.space_id = v_space and r.gm_only = false
         and cf.gm_only = false and ct.gm_only = false
       order by r.created_at;
  end if;
end $$;


ALTER FUNCTION public.get_relations(p_token text) OWNER TO postgres;

--
-- Name: get_revisions(text, integer, bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_revisions(p_token text, p_limit integer DEFAULT 25, p_before_id bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space uuid; v_role text; v_out jsonb;
begin
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role <> 'gm' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  with ev as (
    select r.event_id,
           max(r.id) as last_id,
           max(r.at) as at,
           min(r.actor_role) as actor_role
      from public.revisions r
     where r.space_id = v_space
     group by r.event_id
    -- Paginate on the event, not the row, so an event is never split
    -- across two pages.
    having p_before_id is null or max(r.id) < p_before_id
     order by max(r.id) desc
     -- Floor of 1 as well as the ceiling of 100: p_limit <= 0 is clamped up
     -- to the smallest valid LIMIT instead of raising a raw Postgres 2201W
     -- (invalid_row_count_in_limit_clause).
     limit greatest(least(coalesce(p_limit, 25), 100), 1)
  )
  select jsonb_agg(
           jsonb_build_object(
             'event_id',   ev.event_id,
             'at',         ev.at,
             'actor_role', ev.actor_role,
             'last_id',    ev.last_id,
             'rows', (
               select jsonb_agg(
                        jsonb_build_object(
                          'table_name', r.table_name,
                          'row_id',     r.row_id,
                          'op',         r.op,
                          'changed',    public.revision_changed_keys(r.before, r.after),
                          'label',      public.revision_label(r.table_name, r.before, r.after)
                        ) order by public.revision_table_rank(r.table_name), r.id)
                 from public.revisions r
                where r.event_id = ev.event_id and r.space_id = v_space
             )
           ) order by ev.last_id desc)
    into v_out
    from ev;

  return coalesce(v_out, '[]'::jsonb);
end $$;


ALTER FUNCTION public.get_revisions(p_token text, p_limit integer, p_before_id bigint) OWNER TO postgres;

--
-- Name: timelines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.timelines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    space_id uuid NOT NULL,
    entries jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    current_year integer,
    current_season text,
    gm_entries jsonb,
    CONSTRAINT timelines_current_season_check CHECK (((current_season = ANY (ARRAY['spring'::text, 'summer'::text, 'autumn'::text, 'winter'::text])) OR (current_season IS NULL)))
);


ALTER TABLE public.timelines OWNER TO postgres;

--
-- Name: get_timeline(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_timeline(p_token text) RETURNS SETOF public.timelines
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space uuid; v_role text;
begin
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role = 'gm' then
    return query select * from public.timelines where space_id = v_space;
  else
    return query
      select (jsonb_populate_record(tl, '{"gm_entries": null}'::jsonb)).*
        from public.timelines tl
       where tl.space_id = v_space;
  end if;
end $$;


ALTER FUNCTION public.get_timeline(p_token text) OWNER TO postgres;

--
-- Name: tone_and_content; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tone_and_content (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    space_id uuid NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.tone_and_content OWNER TO postgres;

--
-- Name: get_tone_and_content(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_tone_and_content(p_token text) RETURNS SETOF public.tone_and_content
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space uuid; v_role text;
begin
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_space is null then return; end if;   -- no session, no row
  -- No role check: every role reads this one, viewers included.
  return query select * from public.tone_and_content where space_id = v_space;
end $$;


ALTER FUNCTION public.get_tone_and_content(p_token text) OWNER TO postgres;

--
-- Name: join_space(text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.join_space(p_invite_code text, p_password text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare
  v_space  public.spaces;
  v_token  text;
  v_code   text := coalesce(p_invite_code, '');
  v_locked timestamptz;
  v_role   text;
begin
  select locked_until into v_locked
    from public.space_login_throttle where invite_code = v_code;
  if v_locked is not null and v_locked > now() then
    raise exception 'TOO_MANY_ATTEMPTS';
  end if;

  select * into v_space from public.spaces where invite_code = v_code;
  if not found then
    perform crypt(coalesce(p_password,''), gen_salt('bf', 12));
    perform public.app_note_login_failure(v_code);
    raise exception 'WRONG_PASSWORD';
  end if;

  if coalesce(p_password, '') = '' then
    perform crypt('', gen_salt('bf', 12));
    if not v_space.public_read then
      perform public.app_note_login_failure(v_code);
      raise exception 'WRONG_PASSWORD';
    end if;
    v_role := 'viewer';
  elsif public.app_verify_password(v_space.id, p_password) then
    v_role := 'gm';
  elsif v_space.player_password_hash is not null
        and v_space.player_password_hash = crypt(p_password, v_space.player_password_hash) then
    v_role := 'player';
  else
    perform public.app_note_login_failure(v_code);
    raise exception 'WRONG_PASSWORD';
  end if;

  delete from public.space_login_throttle where invite_code = v_code;
  v_token := public.app_new_token();
  insert into public.space_sessions (token_hash, space_id, is_admin, role)
  values (encode(digest(v_token, 'sha256'), 'hex'), v_space.id, v_role = 'gm', v_role);

  select * into v_space from public.spaces where id = v_space.id;
  return jsonb_build_object(
    'space',    to_jsonb(v_space) - 'password_hash' - 'player_password_hash',
    'token',    v_token,
    'is_admin', v_role = 'gm',
    'role',     v_role
  );
end $$;


ALTER FUNCTION public.join_space(p_invite_code text, p_password text) OWNER TO postgres;

--
-- Name: map_image_access(text, uuid, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.map_image_access(p_token text, p_map_id uuid, p_write boolean) RETURNS TABLE(o_space uuid, o_path text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space uuid; v_role text; v_map public.maps;
begin
  select s.o_space, s.o_role into v_space, v_role
    from public.app_session_from_token(p_token) s;
  select * into v_map from public.maps
    where id = p_map_id and space_id = v_space;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_write and v_role <> 'gm' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not p_write and v_role <> 'gm' and v_map.gm_only then
    raise exception 'NOT_FOUND';
  end if;
  return query select v_map.space_id, v_map.image_path;
end $$;


ALTER FUNCTION public.map_image_access(p_token text, p_map_id uuid, p_write boolean) OWNER TO postgres;

--
-- Name: move_timeline_entry(text, integer, text, integer, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.move_timeline_entry(p_token text, p_from_year integer, p_from_season text, p_to_year integer, p_to_season text) RETURNS public.timelines
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare
  v_space uuid; v_role text; v_row public.timelines;
  v_moved jsonb; v_target jsonb; v_new jsonb; v_entries jsonb;
  v_latest_year int; v_latest_season text;
begin
  if p_from_season not in ('spring', 'summer', 'autumn', 'winter')
     or p_to_season not in ('spring', 'summer', 'autumn', 'winter') then
    raise exception 'BAD_SEASON' using errcode = '22023';
  end if;
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role = 'viewer' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;

  select * into v_row from public.timelines where space_id = v_space for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  if p_from_year = p_to_year and p_from_season = p_to_season then
    if v_role <> 'gm' then v_row.gm_entries := null; end if;
    return v_row;
  end if;

  v_moved := v_row.entries #> array[p_from_year::text, p_from_season];
  if v_moved is null or not public.season_has_text(v_moved) then
    if v_role <> 'gm' then v_row.gm_entries := null; end if;
    return v_row;
  end if;

  v_target := v_row.entries #> array[p_to_year::text, p_to_season];
  if public.season_has_text(v_target) then
    raise exception 'OCCUPIED';
  end if;

  if jsonb_typeof(v_moved) = 'string' then
    v_moved := jsonb_build_object('body', v_moved #>> '{}');
  end if;
  v_new := v_moved || jsonb_build_object('rev',
    greatest(public.season_rev(v_moved), public.season_rev(v_target)) + 1);

  v_entries := jsonb_set(v_row.entries, array[p_from_year::text],
    (v_row.entries -> p_from_year::text) - p_from_season);
  v_entries := jsonb_set(v_entries, array[p_to_year::text],
    coalesce(v_entries -> p_to_year::text, '{}'::jsonb), true);
  v_entries := jsonb_set(v_entries, array[p_to_year::text, p_to_season], v_new, true);
  select t.o_year, t.o_season into v_latest_year, v_latest_season
    from public.timeline_latest(v_entries) t;

  update public.timelines set
    entries        = v_entries,
    current_year   = v_latest_year,
    current_season = v_latest_season,
    updated_at     = now()
  where space_id = v_space
  returning * into v_row;

  if v_role <> 'gm' then v_row.gm_entries := null; end if;
  return v_row;
end $$;


ALTER FUNCTION public.move_timeline_entry(p_token text, p_from_year integer, p_from_season text, p_to_year integer, p_to_season text) OWNER TO postgres;

--
-- Name: preview_undo_event(text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.preview_undo_event(p_token text, p_event_id uuid, p_expect_event_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $_$
declare
  v_space uuid; v_role text; v_at timestamptz;
  r record; v_rows jsonb := '[]'::jsonb;
  v_current jsonb; v_check jsonb; v_action text; v_changed boolean;
  v_expect_after jsonb; v_group_intact boolean;
begin
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role <> 'gm' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select max(at) into v_at from public.revisions
   where event_id = p_event_id and space_id = v_space;
  if v_at is null then raise exception 'NOT_FOUND'; end if;

  for r in
    select * from public.revisions
     where event_id = p_event_id and space_id = v_space
     order by case op when 'DELETE' then 1 when 'UPDATE' then 2 else 3 end,
              case when op = 'INSERT'
                   then -public.revision_table_rank(table_name)
                   else  public.revision_table_rank(table_name) end,
              id desc
  loop
    v_action := case r.op when 'INSERT' then 'remove'
                          when 'DELETE' then 're-insert'
                          else 'restore' end;

    execute format('select to_jsonb(t) from public.%I t where t.id = $1 and t.space_id = $2', r.table_name)
       into v_current using r.row_id, v_space;

    -- Has the row moved on since this event? Compare against what the
    -- event left behind, ignoring the housekeeping column and the
    -- thumbnail we never snapshot.
    v_changed := r.after is not null
                 and v_current is not null
                 and (v_current - 'updated_at' - 'thumb')
                     is distinct from (r.after - 'updated_at' - 'thumb');

    -- `group_intact`: null unless the caller passed p_expect_event_id (a
    -- plain, non-grouped preview never asks). When it did, true means the
    -- row's CURRENT state still matches the newest event's `after` -- so
    -- every difference from p_event_id's own `after` is accounted for by
    -- the run's own later member edits, never by an outside write. Same
    -- ignore-list as `changed_since` above (updated_at housekeeping column,
    -- and the maps thumbnail this ledger never snapshots).
    v_group_intact := null;
    if p_expect_event_id is not null then
      select after into v_expect_after from public.revisions
       where event_id = p_expect_event_id and space_id = v_space
         and table_name = r.table_name and row_id = r.row_id
       -- Deterministic on purpose: one event can hold two rows for a single
       -- row_id (the first chronicle save on a space is an INSERT plus an
       -- UPDATE sharing one timelines id), and the LATEST snapshot is the one
       -- describing the state the run actually left behind. Unreachable from
       -- today's client, whose groups are solo-UPDATE only, but this RPC is
       -- general-purpose and must not depend on that.
       order by id desc
       limit 1;
      v_group_intact := v_expect_after is not null
                        and v_current is not null
                        and (v_current - 'updated_at' - 'thumb')
                            is not distinct from (v_expect_after - 'updated_at' - 'thumb');
    end if;

    if r.op = 'DELETE' then
      if v_current is not null then
        v_check := jsonb_build_object('ok', false, 'reason', 'exists');
      else
        v_check := public.revision_undo_check(p_event_id, v_space, r.table_name, r.before);
      end if;
    elsif r.op = 'UPDATE' then
      -- Restoring an UPDATE puts `before` back onto a row that must still
      -- exist. But `before` can itself hold an FK the row no longer carries
      -- (e.g. a location deleted in this same event, which nulled this
      -- row's link to it) — skipping that check would preview as safely
      -- restorable and then 23503 when Task 4 actually runs the restore.
      if v_current is null then
        v_check := jsonb_build_object('ok', false, 'reason', 'row_missing');
      else
        v_check := public.revision_undo_check(p_event_id, v_space, r.table_name, r.before);
      end if;
    else
      -- INSERT: undoing removes the row. Nothing it once pointed at
      -- matters to deleting it, so no FK-parent check applies here.
      v_check := jsonb_build_object('ok', v_current is not null,
                                    'reason', case when v_current is null
                                                   then 'row_missing' end);
    end if;

    v_rows := v_rows || jsonb_build_object(
      'table_name',    r.table_name,
      'row_id',        r.row_id,
      'action',        v_action,
      'label',         public.revision_preview_label(p_event_id, v_space, r.table_name, r.before, r.after),
      'changed_since', coalesce(v_changed, false),
      'group_intact',  v_group_intact,
      'unrestorable',  not (v_check->>'ok')::boolean,
      'reason',        v_check->>'reason',
      'before',        r.before,
      'after',         r.after
    );
  end loop;

  return jsonb_build_object('event_id', p_event_id, 'at', v_at, 'rows', v_rows);
end $_$;


ALTER FUNCTION public.preview_undo_event(p_token text, p_event_id uuid, p_expect_event_id uuid) OWNER TO postgres;

--
-- Name: prune_revisions(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.prune_revisions(p_keep_days integer DEFAULT 3650) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_n bigint;
begin
  delete from public.revisions where at < now() - make_interval(days => p_keep_days);
  get diagnostics v_n = row_count;
  return v_n;
end $$;


ALTER FUNCTION public.prune_revisions(p_keep_days integer) OWNER TO postgres;

--
-- Name: revision_changed_keys(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.revision_changed_keys(p_before jsonb, p_after jsonb) RETURNS text[]
    LANGUAGE sql IMMUTABLE
    AS $$
  select coalesce(array_agg(k order by k), '{}'::text[])
    from (
      select key as k from jsonb_object_keys(coalesce(p_after, '{}'::jsonb)) as key
      union
      select key from jsonb_object_keys(coalesce(p_before, '{}'::jsonb)) as key
    ) keys
   where p_before is not null
     and p_after  is not null
     and k <> 'updated_at'
     and (p_before -> k) is distinct from (p_after -> k)
$$;


ALTER FUNCTION public.revision_changed_keys(p_before jsonb, p_after jsonb) OWNER TO postgres;

--
-- Name: revision_label(text, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.revision_label(p_table text, p_before jsonb, p_after jsonb) RETURNS text
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public', 'extensions'
    AS $$
declare
  v jsonb := coalesce(p_after, p_before);
  v_from text; v_to text; v_seasons text[]; v_parts text[];
begin
  if v is null then return null; end if;

  if p_table in ('characters', 'locations', 'maps') then
    return v->>'name';

  elsif p_table = 'relations' then
    select c.name into v_from from public.characters c
     where c.id = (v->>'from_character_id')::uuid;
    select c.name into v_to from public.characters c
     where c.id = (v->>'to_character_id')::uuid;
    -- Falls back to raw ids when an endpoint has since been deleted.
    return coalesce(v_from, v->>'from_character_id') || ' → '
        || coalesce(v_to,   v->>'to_character_id');

  elsif p_table = 'map_pins' then
    if coalesce(v->>'label', '') <> '' then return v->>'label'; end if;
    select c.name into v_from from public.characters c
     where c.id = (v->>'character_id')::uuid;
    if v_from is not null then return v_from; end if;
    select l.name into v_to from public.locations l
     where l.id = (v->>'location_id')::uuid;
    return coalesce(v_to, 'pin');

  elsif p_table = 'timelines' then
    -- Which year:season cells differ, across both strands. Year keys are
    -- the union of both snapshots per strand (like revision_changed_keys) —
    -- picking only one side would hide a year removed entirely in `after`.
    -- Each strand is normalized once: SQL NULL and the JSON `null` literal
    -- that to_jsonb() emits for an unset gm_entries column both collapse to
    -- '{}' before jsonb_object_keys() ever sees them (it raises 22023 on a
    -- bare scalar/null, unlike `->`, which just returns NULL) — and the same
    -- normalized value then feeds the cell comparison below.
    select array_agg(distinct label order by label) into v_seasons
      from (
        select y.key || ':' || s.season as label
          from (select 'entries' as strand union all select 'gm_entries') st
          cross join lateral (
            select coalesce(nullif(p_after ->st.strand, 'null'::jsonb), '{}'::jsonb) as aft,
                   coalesce(nullif(p_before->st.strand, 'null'::jsonb), '{}'::jsonb) as bef
          ) sn
          cross join lateral (
            select key from jsonb_object_keys(sn.aft) as key
            union
            select key from jsonb_object_keys(sn.bef) as key
          ) y(key)
          cross join lateral (values ('spring'),('summer'),('autumn'),('winter')) s(season)
         where (sn.aft->y.key->s.season) is distinct from (sn.bef->y.key->s.season)
      ) diffs;
    return coalesce(array_to_string(v_seasons, ', '), '');

  elsif p_table = 'gm_journal' then
    -- Which parts changed ('notes', 'wonders', or both), treating a missing
    -- side (INSERT/DELETE) as the column defaults so a first save that only
    -- wrote notes is labeled 'notes', not everything.
    v_parts := array[]::text[];
    if coalesce(p_before->>'notes', '')
       is distinct from coalesce(p_after->>'notes', '') then
      v_parts := array_append(v_parts, 'notes');
    end if;
    if coalesce(nullif(p_before->'wonders', 'null'::jsonb), '[]'::jsonb)
       is distinct from coalesce(nullif(p_after->'wonders', 'null'::jsonb), '[]'::jsonb) then
      v_parts := array_append(v_parts, 'wonders');
    end if;
    return array_to_string(v_parts, ', ');

  elsif p_table = 'tone_and_content' then
    -- One column, so this is a constant rather than a diff: it exists to
    -- satisfy describeRevision's non-empty-label guard, and the headline
    -- takes no vars.
    if coalesce(p_before->>'notes', '')
       is distinct from coalesce(p_after->>'notes', '') then
      return 'notes';
    end if;
    return '';
  end if;

  return null;
end $$;


ALTER FUNCTION public.revision_label(p_table text, p_before jsonb, p_after jsonb) OWNER TO postgres;

--
-- Name: revision_merge_timeline(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.revision_merge_timeline(p_before jsonb, p_current jsonb) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public', 'extensions'
    AS $$
declare
  v_out jsonb := p_before;
  v_strand text; v_year text; v_season text;
  v_cell jsonb; v_rev int; v_cur_rev int;
  v_before_strand jsonb; v_current_strand jsonb;
begin
  foreach v_strand in array array['entries', 'gm_entries'] loop
    -- Same normalization as revision_label's timelines branch above, for
    -- the same reason: SQL NULL and the JSON `null` literal that to_jsonb()
    -- emits for an unset gm_entries column both collapse to '{}' before
    -- jsonb_object_keys() ever sees them (it raises 22023 on a bare
    -- scalar/null, unlike `->`, which just returns NULL).
    v_before_strand  := coalesce(nullif(p_before  -> v_strand, 'null'::jsonb), '{}'::jsonb);
    v_current_strand := coalesce(nullif(p_current -> v_strand, 'null'::jsonb), '{}'::jsonb);
    for v_year in select jsonb_object_keys(v_before_strand) loop
      foreach v_season in array array['spring','summer','autumn','winter'] loop
        v_cell := v_before_strand->v_year->v_season;
        if v_cell is not null and jsonb_typeof(v_cell) <> 'null' then
          v_rev     := public.season_rev(v_cell);
          v_cur_rev := public.season_rev(v_current_strand->v_year->v_season);
          if v_cur_rev > v_rev then
            -- Legacy plain-string cells become objects, exactly as the CAS
            -- path normalises them on first write.
            if jsonb_typeof(v_cell) = 'string' then
              v_cell := jsonb_build_object('title', '', 'body', v_cell #>> '{}');
            end if;
            -- +1, not v_cur_rev: see the function-level comment above. An
            -- equal rev (the other branch, implicitly a no-op) means this
            -- season was not touched since the event, so there is no stale
            -- tab to protect against and no bump is needed.
            v_out := jsonb_set(v_out,
                      array[v_strand, v_year, v_season],
                      v_cell || jsonb_build_object('rev', v_cur_rev + 1));
          end if;
        end if;
      end loop;
    end loop;
  end loop;
  return v_out;
end $$;


ALTER FUNCTION public.revision_merge_timeline(p_before jsonb, p_current jsonb) OWNER TO postgres;

--
-- Name: revision_preview_label(uuid, uuid, text, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.revision_preview_label(p_event_id uuid, p_space uuid, p_table text, p_before jsonb, p_after jsonb) RETURNS text
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public', 'extensions'
    AS $$
declare
  v jsonb := coalesce(p_after, p_before);
  v_from text; v_to text; v_from_id uuid; v_to_id uuid;
begin
  if p_table <> 'relations' then
    return public.revision_label(p_table, p_before, p_after);
  end if;
  if v is null then return null; end if;

  v_from_id := (v->>'from_character_id')::uuid;
  v_to_id   := (v->>'to_character_id')::uuid;

  select c.name into v_from from public.characters c where c.id = v_from_id;
  if v_from is null then
    select r.before->>'name' into v_from from public.revisions r
     where r.event_id = p_event_id and r.space_id = p_space
       and r.table_name = 'characters' and r.row_id = v_from_id and r.op = 'DELETE';
  end if;

  select c.name into v_to from public.characters c where c.id = v_to_id;
  if v_to is null then
    select r.before->>'name' into v_to from public.revisions r
     where r.event_id = p_event_id and r.space_id = p_space
       and r.table_name = 'characters' and r.row_id = v_to_id and r.op = 'DELETE';
  end if;

  -- Still falls back to the raw id when truly nothing resolves (the
  -- endpoint was deleted in a separate, earlier event this preview does not
  -- cover).
  return coalesce(v_from, v_from_id::text) || ' → ' || coalesce(v_to, v_to_id::text);
end $$;


ALTER FUNCTION public.revision_preview_label(p_event_id uuid, p_space uuid, p_table text, p_before jsonb, p_after jsonb) OWNER TO postgres;

--
-- Name: revision_table_rank(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.revision_table_rank(p_table text) RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$
  select case p_table
    when 'locations'        then 1
    when 'characters'       then 2
    when 'maps'             then 3
    when 'relations'        then 4
    when 'map_pins'         then 5
    when 'timelines'        then 6
    when 'gm_journal'       then 7
    when 'tone_and_content' then 8
    else 9
  end
$$;


ALTER FUNCTION public.revision_table_rank(p_table text) OWNER TO postgres;

--
-- Name: revision_undo_check(uuid, uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.revision_undo_check(p_event_id uuid, p_space uuid, p_table text, p_row jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_patch jsonb := p_row;
begin
  if p_table = 'relations' then
    if not public.revision_will_exist(p_event_id, p_space, 'characters',
                                       (p_row->>'from_character_id')::uuid)
       or not public.revision_will_exist(p_event_id, p_space, 'characters',
                                          (p_row->>'to_character_id')::uuid) then
      return jsonb_build_object('ok', false, 'reason', 'character_missing');
    end if;

  elsif p_table = 'map_pins' then
    if not public.revision_will_exist(p_event_id, p_space, 'maps',
                                       (p_row->>'map_id')::uuid) then
      return jsonb_build_object('ok', false, 'reason', 'map_missing');
    end if;
    if p_row->>'character_id' is not null
       and not public.revision_will_exist(p_event_id, p_space, 'characters',
                                           (p_row->>'character_id')::uuid) then
      return jsonb_build_object('ok', false, 'reason', 'character_missing');
    end if;
    if p_row->>'location_id' is not null
       and not public.revision_will_exist(p_event_id, p_space, 'locations',
                                           (p_row->>'location_id')::uuid) then
      return jsonb_build_object('ok', false, 'reason', 'location_missing');
    end if;

  elsif p_table = 'characters' then
    if p_row->>'location' is not null
       and not public.revision_will_exist(p_event_id, p_space, 'locations',
                                           (p_row->>'location')::uuid) then
      return jsonb_build_object('ok', true, 'reason', 'location_missing',
                               'patch', jsonb_set(v_patch, '{location}', 'null'::jsonb));
    end if;

  elsif p_table = 'maps' then
    if p_row->>'location_id' is not null
       and not public.revision_will_exist(p_event_id, p_space, 'locations',
                                           (p_row->>'location_id')::uuid) then
      return jsonb_build_object('ok', true, 'reason', 'location_missing',
                               'patch', jsonb_set(v_patch, '{location_id}', 'null'::jsonb));
    end if;
  end if;

  return jsonb_build_object('ok', true, 'patch', v_patch);
end $$;


ALTER FUNCTION public.revision_undo_check(p_event_id uuid, p_space uuid, p_table text, p_row jsonb) OWNER TO postgres;

--
-- Name: revision_will_exist(uuid, uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.revision_will_exist(p_event_id uuid, p_space uuid, p_table text, p_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public', 'extensions'
    AS $_$
declare v_exists boolean;
begin
  if p_id is null then return true; end if;
  execute format('select exists (select 1 from public.%I where id = $1 and space_id = $2)', p_table)
     into v_exists using p_id, p_space;
  if v_exists then return true; end if;
  return exists (
    select 1 from public.revisions
     where event_id = p_event_id and space_id = p_space and op = 'DELETE'
       and table_name = p_table and row_id = p_id);
end $_$;


ALTER FUNCTION public.revision_will_exist(p_event_id uuid, p_space uuid, p_table text, p_id uuid) OWNER TO postgres;

--
-- Name: save_gm_journal(text, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.save_gm_journal(p_token text, p_data jsonb) RETURNS public.gm_journal
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space uuid; v_role text; v_row public.gm_journal;
begin
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role <> 'gm' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;

  insert into public.gm_journal (space_id, notes, wonders, updated_at)
  values (
    v_space,
    coalesce(p_data->>'notes', ''),
    coalesce(p_data->'wonders', '[]'::jsonb),
    now()
  )
  on conflict (space_id) do update set
    notes      = case when p_data ? 'notes'
                      then coalesce(p_data->>'notes', '') else gm_journal.notes end,
    wonders    = case when p_data ? 'wonders'
                      then coalesce(p_data->'wonders', '[]'::jsonb) else gm_journal.wonders end,
    updated_at = now()
  returning * into v_row;
  return v_row;
end $$;


ALTER FUNCTION public.save_gm_journal(p_token text, p_data jsonb) OWNER TO postgres;

--
-- Name: save_gm_timeline(text, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.save_gm_timeline(p_token text, p_data jsonb) RETURNS public.timelines
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space uuid; v_role text; v_row public.timelines;
begin
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role <> 'gm' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  insert into public.timelines (space_id, gm_entries, updated_at)
  values (v_space, coalesce(p_data->'gm_entries', '{}'::jsonb), now())
  on conflict (space_id) do update set
    gm_entries = excluded.gm_entries,
    updated_at = now()
  returning * into v_row;
  return v_row;
end $$;


ALTER FUNCTION public.save_gm_timeline(p_token text, p_data jsonb) OWNER TO postgres;

--
-- Name: save_gm_timeline_entry(text, integer, text, jsonb, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.save_gm_timeline_entry(p_token text, p_year integer, p_season text, p_entry jsonb, p_base_rev integer) RETURNS public.timelines
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare
  v_space uuid; v_role text; v_row public.timelines;
  v_current jsonb; v_new jsonb; v_entries jsonb;
begin
  if p_season not in ('spring', 'summer', 'autumn', 'winter') then
    raise exception 'BAD_SEASON' using errcode = '22023';
  end if;
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role <> 'gm' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;

  insert into public.timelines (space_id, entries)
  values (v_space, '{}'::jsonb)
  on conflict (space_id) do nothing;
  select * into v_row from public.timelines where space_id = v_space for update;

  v_current := coalesce(v_row.gm_entries, '{}'::jsonb) #> array[p_year::text, p_season];
  if public.season_rev(v_current) is distinct from coalesce(p_base_rev, 0) then
    -- errcode par défaut (P0001) exprès : cf. save_timeline_entry.
    raise exception 'CONFLICT'
      using detail = coalesce(v_current, 'null'::jsonb)::text;
  end if;

  v_new := jsonb_build_object('body', coalesce(p_entry->>'body', ''), 'rev', coalesce(p_base_rev, 0) + 1);
  if coalesce(p_entry->>'title', '') <> '' then
    v_new := v_new || jsonb_build_object('title', p_entry->>'title');
  end if;

  v_entries := jsonb_set(coalesce(v_row.gm_entries, '{}'::jsonb), array[p_year::text],
    coalesce(coalesce(v_row.gm_entries, '{}'::jsonb) -> p_year::text, '{}'::jsonb), true);
  v_entries := jsonb_set(v_entries, array[p_year::text, p_season], v_new, true);

  update public.timelines set
    gm_entries = v_entries,
    updated_at = now()
  where space_id = v_space
  returning * into v_row;

  return v_row;
end $$;


ALTER FUNCTION public.save_gm_timeline_entry(p_token text, p_year integer, p_season text, p_entry jsonb, p_base_rev integer) OWNER TO postgres;

--
-- Name: save_timeline(text, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.save_timeline(p_token text, p_data jsonb) RETURNS public.timelines
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space uuid; v_role text; v_row public.timelines;
begin
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role = 'viewer' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  insert into public.timelines (space_id, entries, current_year, current_season, updated_at)
  values (
    v_space,
    coalesce(p_data->'entries', '{}'::jsonb),
    (p_data->>'current_year')::int,
    p_data->>'current_season',
    now()
  )
  on conflict (space_id) do update set
    entries        = excluded.entries,
    current_year   = excluded.current_year,
    current_season = excluded.current_season,
    updated_at     = now()
  returning * into v_row;
  if v_role <> 'gm' then v_row.gm_entries := null; end if;
  return v_row;
end $$;


ALTER FUNCTION public.save_timeline(p_token text, p_data jsonb) OWNER TO postgres;

--
-- Name: save_timeline_entry(text, integer, text, jsonb, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.save_timeline_entry(p_token text, p_year integer, p_season text, p_entry jsonb, p_base_rev integer) RETURNS public.timelines
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare
  v_space uuid; v_role text; v_row public.timelines;
  v_current jsonb; v_new jsonb; v_entries jsonb;
  v_latest_year int; v_latest_season text;
begin
  if p_season not in ('spring', 'summer', 'autumn', 'winter') then
    raise exception 'BAD_SEASON' using errcode = '22023';
  end if;
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role = 'viewer' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;

  insert into public.timelines (space_id, entries)
  values (v_space, '{}'::jsonb)
  on conflict (space_id) do nothing;
  select * into v_row from public.timelines where space_id = v_space for update;

  v_current := v_row.entries #> array[p_year::text, p_season];
  if public.season_rev(v_current) is distinct from coalesce(p_base_rev, 0) then
    -- errcode par défaut (P0001) exprès : 40001 serait rejoué en boucle
    -- par PostgREST (classe « retryable ») et la requête ne répondrait jamais.
    raise exception 'CONFLICT'
      using detail = coalesce(v_current, 'null'::jsonb)::text;
  end if;

  v_new := jsonb_build_object('body', coalesce(p_entry->>'body', ''), 'rev', coalesce(p_base_rev, 0) + 1);
  if coalesce(p_entry->>'title', '') <> '' then
    v_new := v_new || jsonb_build_object('title', p_entry->>'title');
  end if;

  v_entries := jsonb_set(v_row.entries, array[p_year::text],
    coalesce(v_row.entries -> p_year::text, '{}'::jsonb), true);
  v_entries := jsonb_set(v_entries, array[p_year::text, p_season], v_new, true);
  select t.o_year, t.o_season into v_latest_year, v_latest_season
    from public.timeline_latest(v_entries) t;

  update public.timelines set
    entries        = v_entries,
    current_year   = v_latest_year,
    current_season = v_latest_season,
    updated_at     = now()
  where space_id = v_space
  returning * into v_row;

  if v_role <> 'gm' then v_row.gm_entries := null; end if;
  return v_row;
end $$;


ALTER FUNCTION public.save_timeline_entry(p_token text, p_year integer, p_season text, p_entry jsonb, p_base_rev integer) OWNER TO postgres;

--
-- Name: save_tone_and_content(text, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.save_tone_and_content(p_token text, p_data jsonb) RETURNS public.tone_and_content
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space uuid; v_role text; v_row public.tone_and_content;
begin
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role not in ('gm', 'player') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.tone_and_content (space_id, notes, updated_at)
  values (v_space, coalesce(p_data->>'notes', ''), now())
  on conflict (space_id) do update set
    notes      = case when p_data ? 'notes'
                      then coalesce(p_data->>'notes', '')
                      else tone_and_content.notes end,
    updated_at = now()
  returning * into v_row;
  return v_row;
end $$;


ALTER FUNCTION public.save_tone_and_content(p_token text, p_data jsonb) OWNER TO postgres;

--
-- Name: season_has_text(jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.season_has_text(v jsonb) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  select case
    when v is null or jsonb_typeof(v) = 'null' then false
    when jsonb_typeof(v) = 'string' then
      btrim(regexp_replace(regexp_replace(v #>> '{}', '<[^>]*>', ' ', 'g'), '&nbsp;', ' ', 'gi')) <> ''
    else
      coalesce(btrim(v->>'title'), '') <> ''
      or btrim(regexp_replace(regexp_replace(coalesce(v->>'body', ''), '<[^>]*>', ' ', 'g'), '&nbsp;', ' ', 'gi')) <> ''
  end
$$;


ALTER FUNCTION public.season_has_text(v jsonb) OWNER TO postgres;

--
-- Name: season_rev(jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.season_rev(v jsonb) RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$
  select case
    when v is not null and jsonb_typeof(v) = 'object' then coalesce((v->>'rev')::int, 0)
    else 0
  end
$$;


ALTER FUNCTION public.season_rev(v jsonb) OWNER TO postgres;

--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;


ALTER FUNCTION public.set_updated_at() OWNER TO postgres;

--
-- Name: timeline_latest(jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.timeline_latest(p_entries jsonb, OUT o_year integer, OUT o_season text) RETURNS record
    LANGUAGE plpgsql IMMUTABLE
    AS $_$
begin
  select (e.key)::int, s.season into o_year, o_season
  from jsonb_each(coalesce(p_entries, '{}'::jsonb)) e
  cross join lateral (values ('spring', 1), ('summer', 2), ('autumn', 3), ('winter', 4)) s(season, ord)
  where e.key ~ '^-?[0-9]+$'
    and public.season_has_text(e.value -> s.season)
  order by (e.key)::int desc, s.ord desc
  limit 1;
end $_$;


ALTER FUNCTION public.timeline_latest(p_entries jsonb, OUT o_year integer, OUT o_season text) OWNER TO postgres;

--
-- Name: undo_event(text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.undo_event(p_token text, p_event_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $_$
declare
  v_space uuid; v_role text; v_new_event uuid;
  r record; v_rows jsonb := '[]'::jsonb;
  v_current jsonb; v_check jsonb; v_payload jsonb; v_set text;
  v_status text; v_reason text; v_action text;
begin
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role <> 'gm' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  v_new_event := nullif(current_setting('app.event_id', true), '')::uuid;

  if not exists (select 1 from public.revisions
                  where event_id = p_event_id and space_id = v_space) then
    raise exception 'NOT_FOUND';
  end if;

  for r in
    select * from public.revisions
     where event_id = p_event_id and space_id = v_space
     order by case op when 'DELETE' then 1 when 'UPDATE' then 2 else 3 end,
              case when op = 'INSERT'
                   then -public.revision_table_rank(table_name)
                   else  public.revision_table_rank(table_name) end,
              id
  loop
    v_status := 'done';
    v_reason := null;
    v_action := case r.op when 'INSERT' then 'remove'
                          when 'DELETE' then 're-insert'
                          else 'restore' end;

    execute format('select to_jsonb(t) from public.%I t where t.id = $1 and t.space_id = $2', r.table_name)
       into v_current using r.row_id, v_space;

    if r.op = 'DELETE' then
      if v_current is not null then
        v_status := 'skipped'; v_reason := 'exists';
      else
        v_check := public.revision_undo_check(p_event_id, v_space, r.table_name, r.before);
        if not (v_check->>'ok')::boolean then
          v_status := 'skipped'; v_reason := v_check->>'reason';
        else
          v_payload := coalesce(v_check->'patch', r.before);
          v_reason  := v_check->>'reason';   -- e.g. location_missing, nulled
          -- IMPORTANT fix: the pre-checks above model the FK shapes we know
          -- about, but they don't model every unique constraint (e.g.
          -- timelines.space_id). Isolate this row's write in its own
          -- subtransaction so a violation the pre-checks missed skips only
          -- this row instead of aborting every other row's restore. Only the
          -- integrity-constraint class is caught — never `others`, so a
          -- serialization failure or deadlock still propagates to the caller.
          begin
            execute format(
              'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)',
              r.table_name, r.table_name) using v_payload;
          exception when integrity_constraint_violation then
            v_status := 'skipped';
            v_reason := 'constraint_' || sqlstate;
          end;
        end if;
      end if;

    elsif r.op = 'UPDATE' then
      if v_current is null then
        v_status := 'skipped'; v_reason := 'row_missing';
      else
        -- DEVIATION from the task-4 brief: the brief's UPDATE branch
        -- restored `before` blindly, with no FK-parent check. But `before`
        -- can itself hold an FK that a SEPARATE, LATER event has since
        -- deleted (e.g. a character moved off a location, then that
        -- location deleted afterwards) — exactly the case
        -- preview_undo_event already guards against (see its own comment
        -- above). Skipping this check would let a blind restore set a
        -- column to a now-dangling uuid and 23503 the whole transaction,
        -- restoring nothing — not the "best-effort, one row skipped"
        -- contract this function promises everywhere else.
        v_check := public.revision_undo_check(p_event_id, v_space, r.table_name, r.before);
        if not (v_check->>'ok')::boolean then
          v_status := 'skipped'; v_reason := v_check->>'reason';
        else
          v_payload := coalesce(v_check->'patch', r.before);
          v_reason  := v_check->>'reason';   -- e.g. location_missing, nulled
          if r.table_name = 'timelines' then
            v_payload := public.revision_merge_timeline(v_payload, v_current);
          end if;
          select string_agg(format('%I = s.%I', key, key), ', ')
            into v_set
            from jsonb_object_keys(v_payload) as key
           where key <> 'id';
          -- IMPORTANT fix: same per-row subtransaction as the re-insert
          -- branch above — a constraint violation the pre-checks don't
          -- model must skip only this row.
          begin
            execute format(
              'update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) s '
              'where t.id = $2 and t.space_id = $3',
              r.table_name, v_set, r.table_name) using v_payload, r.row_id, v_space;
          exception when integrity_constraint_violation then
            v_status := 'skipped';
            v_reason := 'constraint_' || sqlstate;
          end;
        end if;
      end if;

    else  -- INSERT => remove
      if v_current is null then
        v_status := 'skipped'; v_reason := 'already_gone';
      else
        -- IMPORTANT fix: same per-row subtransaction as the other two
        -- branches, for consistency — a remove is unlikely to violate a
        -- constraint, but it must not be the one branch that can still take
        -- the whole undo down if it ever does.
        begin
          execute format('delete from public.%I where id = $1 and space_id = $2', r.table_name)
            using r.row_id, v_space;
        exception when integrity_constraint_violation then
          v_status := 'skipped';
          v_reason := 'constraint_' || sqlstate;
        end;
      end if;
    end if;

    v_rows := v_rows || jsonb_build_object(
      'table_name', r.table_name,
      'row_id',     r.row_id,
      'action',     v_action,
      'status',     v_status,
      'reason',     v_reason
    );
  end loop;

  return jsonb_build_object('event_id', v_new_event, 'rows', v_rows);
end $_$;


ALTER FUNCTION public.undo_event(p_token text, p_event_id uuid) OWNER TO postgres;

--
-- Name: update_character(text, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_character(p_token text, p_id uuid, p_data jsonb) RETURNS public.characters
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space uuid; v_role text; v_row public.characters;
begin
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role = 'viewer' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if v_role <> 'gm' and (p_data ? 'gm_only' or p_data ? 'gm_notes') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- Column references on the RIGHT of `set` are the row's OLD values: the
  -- instinct/statblock/kind/follower guards therefore test the row's
  -- *current* followerhood, never the one the caller is trying to declare.
  update public.characters set
    name     = coalesce(p_data->>'name', name),
    role     = coalesce(p_data->>'role', role),
    type     = case when v_role = 'gm' then coalesce(p_data->>'type', type) else type end,
    location = case when p_data ? 'location'
                    then (nullif(p_data->>'location',''))::uuid else location end,
    notes    = coalesce(p_data->>'notes', notes),
    traits   = coalesce(p_data->'traits', traits),
    tags     = coalesce(p_data->'tags',   tags),
    dead     = case when p_data ? 'dead'
                    then coalesce((p_data->>'dead')::boolean, false) else dead end,
    -- A non-GM can neither ERASE the GM-held pair (the re-graft) nor WRITE it
    -- (the strip). A non-object payload is coerced to {} first so the re-graft
    -- always fires; a non-GM clear therefore leaves {}, not NULL.
    discovery = case when p_data ? 'discovery' then
                  case when v_role = 'gm' then p_data->'discovery'
                       else ((case when jsonb_typeof(p_data->'discovery') = 'object'
                                   then p_data->'discovery' else '{}'::jsonb end)
                             - 'interesting' - 'useful')
                            || coalesce(jsonb_strip_nulls(jsonb_build_object(
                                 'interesting', discovery->'interesting',
                                 'useful',      discovery->'useful')), '{}'::jsonb)
                  end
                else discovery end,
    instinct = case when p_data ? 'instinct'
                     and (v_role = 'gm'
                          or public.app_character_mechanics_open(type, follower, statblock))
                    then coalesce(p_data->>'instinct', instinct)
                    else instinct end,
    gm_only  = case when p_data ? 'gm_only'
                    then coalesce((p_data->>'gm_only')::boolean, false) else gm_only end,
    gm_notes = case when p_data ? 'gm_notes' then p_data->>'gm_notes' else gm_notes end,
    threat   = case when p_data ? 'threat' then
                 case when v_role <> 'gm'
                       and coalesce(threat ? 'instinct', false)
                       and jsonb_typeof(p_data->'threat') = 'object'
                      then jsonb_set(p_data->'threat', '{instinct}', threat->'instinct')
                      else p_data->'threat' end
               else threat end,
    statblock = case when p_data ? 'statblock'
                      and (v_role = 'gm'
                           or public.app_character_mechanics_open(type, follower, statblock))
                     then p_data->'statblock' else statblock end,
    kind      = case when p_data ? 'kind'
                      and (v_role = 'gm'
                           or public.app_character_mechanics_open(type, follower, statblock))
                     then p_data->>'kind' else kind end,
    follower  = case when p_data ? 'follower'
                      and (v_role = 'gm'
                           or public.app_character_mechanics_open(type, follower, statblock))
                     then p_data->'follower' else follower end,
    updated_at = now()
  where id = p_id and space_id = v_space
    and (v_role = 'gm' or gm_only = false)          -- players: hidden row == missing row
  returning * into v_row;
  if not found then raise exception 'NOT_FOUND'; end if;
  return public.app_character_row_for_role(v_row, v_role);
end $$;


ALTER FUNCTION public.update_character(p_token text, p_id uuid, p_data jsonb) OWNER TO postgres;

--
-- Name: update_location(text, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_location(p_token text, p_id uuid, p_data jsonb) RETURNS public.locations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space uuid; v_role text; v_row public.locations;
begin
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role = 'viewer' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if v_role <> 'gm' and (p_data ? 'gm_only' or p_data ? 'gm_notes') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  update public.locations set
    name        = coalesce(p_data->>'name',  name),
    color       = coalesce(p_data->>'color', color),
    description = case when p_data ? 'description' then coalesce(p_data->>'description','') else description end,
    notes       = case when p_data ? 'notes'       then coalesce(p_data->>'notes','')       else notes end,
    tags        = case when p_data ? 'tags'        then coalesce(p_data->'tags','[]'::jsonb) else tags end,
    steading    = case when p_data ? 'steading'    then p_data->'steading'                   else steading end,
    gm_only     = case when p_data ? 'gm_only'
                       then coalesce((p_data->>'gm_only')::boolean, false) else gm_only end,
    gm_notes    = case when p_data ? 'gm_notes'    then p_data->>'gm_notes' else gm_notes end
  where id = p_id and space_id = v_space
    and (v_role = 'gm' or gm_only = false)
  returning * into v_row;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_role <> 'gm' then v_row.gm_notes := null; end if;
  return v_row;
end $$;


ALTER FUNCTION public.update_location(p_token text, p_id uuid, p_data jsonb) OWNER TO postgres;

--
-- Name: update_map(text, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_map(p_token text, p_id uuid, p_data jsonb) RETURNS public.maps
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space uuid; v_role text; v_row public.maps; v_loc uuid;
begin
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role <> 'gm' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if length(coalesce(p_data->>'thumb', '')) > 200000 then raise exception 'INVALID_INPUT'; end if;
  -- Parité avec create_map : un nom explicitement vide est rejeté (au lieu
  -- d'être silencieusement ignoré par le coalesce ci-dessous).
  if p_data ? 'name' and coalesce(trim(p_data->>'name'), '') = '' then
    raise exception 'INVALID_INPUT';
  end if;

  if p_data ? 'location_id' then
    v_loc := (nullif(p_data->>'location_id',''))::uuid;
    if v_loc is not null and not exists (
         select 1 from public.locations where id = v_loc and space_id = v_space) then
      raise exception 'NOT_FOUND';
    end if;
  end if;

  update public.maps set
    name        = coalesce(nullif(trim(p_data->>'name'), ''), name),
    description = case when p_data ? 'description' then p_data->>'description' else description end,
    location_id = case when p_data ? 'location_id' then v_loc else location_id end,
    thumb       = case when p_data ? 'thumb'       then p_data->>'thumb' else thumb end,
    gm_only     = case when p_data ? 'gm_only'
                       then coalesce((p_data->>'gm_only')::boolean, false) else gm_only end,
    updated_at  = now()
  where id = p_id and space_id = v_space
  returning * into v_row;
  if not found then raise exception 'NOT_FOUND'; end if;
  return v_row;
end $$;


ALTER FUNCTION public.update_map(p_token text, p_id uuid, p_data jsonb) OWNER TO postgres;

--
-- Name: update_map_pin(text, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_map_pin(p_token text, p_id uuid, p_data jsonb) RETURNS public.map_pins
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space uuid; v_role text; v_row public.map_pins;
begin
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role = 'viewer' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if v_role <> 'gm' and p_data ? 'gm_only' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  -- Miroir de create_map_pin : une note libre garde toujours un libellé.
  if p_data ? 'label' and coalesce(trim(p_data->>'label'), '') = '' and exists (
       select 1 from public.map_pins
        where id = p_id and space_id = v_space
          and character_id is null and location_id is null) then
    raise exception 'INVALID_INPUT';
  end if;

  update public.map_pins p set
    x       = coalesce((p_data->>'x')::double precision, x),
    y       = coalesce((p_data->>'y')::double precision, y),
    label   = case when p_data ? 'label' then p_data->>'label' else label end,
    note    = case when p_data ? 'note'  then p_data->>'note'  else note  end,
    gm_only = case when p_data ? 'gm_only'
                   then coalesce((p_data->>'gm_only')::boolean, false) else gm_only end,
    updated_at = now()
  where p.id = p_id and p.space_id = v_space
    and (v_role = 'gm' or (
      p.gm_only = false
      and not exists (select 1 from public.maps m
                       where m.id = p.map_id and m.gm_only)
      and not exists (select 1 from public.characters c
                       where c.id = p.character_id and c.gm_only)
      and not exists (select 1 from public.locations l
                       where l.id = p.location_id and l.gm_only)))
  returning p.* into v_row;
  if not found then raise exception 'NOT_FOUND'; end if;
  return v_row;
end $$;


ALTER FUNCTION public.update_map_pin(p_token text, p_id uuid, p_data jsonb) OWNER TO postgres;

--
-- Name: update_relation(text, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_relation(p_token text, p_id uuid, p_data jsonb) RETURNS public.relations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space uuid; v_role text; v_row public.relations;
begin
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role = 'viewer' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if v_role <> 'gm' and p_data ? 'gm_only' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  update public.relations r set
    relation_type   = coalesce(p_data->>'relation_type', relation_type),
    relation_detail = case when p_data ? 'relation_detail'
                           then p_data->>'relation_detail' else relation_detail end,
    gm_only         = case when p_data ? 'gm_only'
                           then coalesce((p_data->>'gm_only')::boolean, false) else gm_only end
  where r.id = p_id and r.space_id = v_space
    and (v_role = 'gm' or (r.gm_only = false and not exists (
          select 1 from public.characters ch
           where ch.id in (r.from_character_id, r.to_character_id) and ch.gm_only)))
  returning r.* into v_row;
  if not found then raise exception 'NOT_FOUND'; end if;
  return v_row;
end $$;


ALTER FUNCTION public.update_relation(p_token text, p_id uuid, p_data jsonb) OWNER TO postgres;

--
-- Name: update_space_settings(text, text, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_space_settings(p_token text, p_current_password text, p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare v_space uuid; v_role text; v_row public.spaces;
begin
  select o_space, o_role into v_space, v_role
    from public.app_session_from_token(p_token);
  if v_role <> 'gm' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not public.app_verify_password(v_space, p_current_password) then
    raise exception 'WRONG_PASSWORD';
  end if;

  update public.spaces set
    password_hash = case when coalesce(p_data->>'gm_password','') <> ''
        then crypt(p_data->>'gm_password', gen_salt('bf', 12))
        else password_hash end,
    player_password_hash = case when p_data ? 'player_password' then
        case when coalesce(p_data->>'player_password','') = '' then null
             else crypt(p_data->>'player_password', gen_salt('bf', 12)) end
        else player_password_hash end,
    public_read = coalesce((p_data->>'public_read')::boolean, public_read),
    updated_at  = now()
  where id = v_space
  returning * into v_row;

  return to_jsonb(v_row) - 'password_hash' - 'player_password_hash';
end $$;


ALTER FUNCTION public.update_space_settings(p_token text, p_current_password text, p_data jsonb) OWNER TO postgres;

--
-- Name: revisions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.revisions (
    id bigint NOT NULL,
    space_id uuid NOT NULL,
    event_id uuid NOT NULL,
    table_name text NOT NULL,
    row_id uuid NOT NULL,
    op text NOT NULL,
    before jsonb,
    after jsonb,
    actor_role text,
    at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT revisions_op_check CHECK ((op = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))
);


ALTER TABLE public.revisions OWNER TO postgres;

--
-- Name: revisions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.revisions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.revisions_id_seq OWNER TO postgres;

--
-- Name: revisions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.revisions_id_seq OWNED BY public.revisions.id;


--
-- Name: space_login_throttle; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.space_login_throttle (
    invite_code text NOT NULL,
    fail_count integer DEFAULT 0 NOT NULL,
    window_start timestamp with time zone DEFAULT now() NOT NULL,
    locked_until timestamp with time zone
);


ALTER TABLE public.space_login_throttle OWNER TO postgres;

--
-- Name: space_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.space_sessions (
    space_id uuid NOT NULL,
    is_admin boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen timestamp with time zone DEFAULT now() NOT NULL,
    token_hash text NOT NULL,
    role text NOT NULL,
    CONSTRAINT space_sessions_role_check CHECK ((role = ANY (ARRAY['viewer'::text, 'player'::text, 'gm'::text])))
);


ALTER TABLE public.space_sessions OWNER TO postgres;

--
-- Name: spaces; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.spaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    invite_code text NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    player_password_hash text,
    public_read boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY public.spaces REPLICA IDENTITY FULL;


ALTER TABLE public.spaces OWNER TO postgres;

--
-- Name: revisions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.revisions ALTER COLUMN id SET DEFAULT nextval('public.revisions_id_seq'::regclass);


--
-- Name: characters characters_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.characters
    ADD CONSTRAINT characters_pkey PRIMARY KEY (id);


--
-- Name: gm_journal gm_journal_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gm_journal
    ADD CONSTRAINT gm_journal_pkey PRIMARY KEY (id);


--
-- Name: gm_journal gm_journal_space_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gm_journal
    ADD CONSTRAINT gm_journal_space_id_key UNIQUE (space_id);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: map_pins map_pins_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.map_pins
    ADD CONSTRAINT map_pins_pkey PRIMARY KEY (id);


--
-- Name: maps maps_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.maps
    ADD CONSTRAINT maps_pkey PRIMARY KEY (id);


--
-- Name: relations relations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.relations
    ADD CONSTRAINT relations_pkey PRIMARY KEY (id);


--
-- Name: revisions revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.revisions
    ADD CONSTRAINT revisions_pkey PRIMARY KEY (id);


--
-- Name: space_login_throttle space_login_throttle_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.space_login_throttle
    ADD CONSTRAINT space_login_throttle_pkey PRIMARY KEY (invite_code);


--
-- Name: spaces spaces_invite_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.spaces
    ADD CONSTRAINT spaces_invite_code_key UNIQUE (invite_code);


--
-- Name: spaces spaces_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.spaces
    ADD CONSTRAINT spaces_pkey PRIMARY KEY (id);


--
-- Name: timelines timelines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.timelines
    ADD CONSTRAINT timelines_pkey PRIMARY KEY (id);


--
-- Name: timelines timelines_space_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.timelines
    ADD CONSTRAINT timelines_space_id_key UNIQUE (space_id);


--
-- Name: tone_and_content tone_and_content_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tone_and_content
    ADD CONSTRAINT tone_and_content_pkey PRIMARY KEY (id);


--
-- Name: tone_and_content tone_and_content_space_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tone_and_content
    ADD CONSTRAINT tone_and_content_space_id_key UNIQUE (space_id);


--
-- Name: idx_characters_space; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_characters_space ON public.characters USING btree (space_id);


--
-- Name: idx_locations_space; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_locations_space ON public.locations USING btree (space_id);


--
-- Name: idx_relations_from; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_relations_from ON public.relations USING btree (from_character_id);


--
-- Name: idx_relations_space; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_relations_space ON public.relations USING btree (space_id);


--
-- Name: idx_relations_to; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_relations_to ON public.relations USING btree (to_character_id);


--
-- Name: map_pins_map_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX map_pins_map_idx ON public.map_pins USING btree (map_id);


--
-- Name: maps_location_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX maps_location_idx ON public.maps USING btree (location_id);


--
-- Name: maps_space_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX maps_space_idx ON public.maps USING btree (space_id);


--
-- Name: revisions_event_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX revisions_event_idx ON public.revisions USING btree (event_id);


--
-- Name: revisions_row_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX revisions_row_idx ON public.revisions USING btree (space_id, table_name, row_id, id DESC);


--
-- Name: revisions_space_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX revisions_space_id_idx ON public.revisions USING btree (space_id, id DESC);


--
-- Name: space_sessions_space_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX space_sessions_space_idx ON public.space_sessions USING btree (space_id);


--
-- Name: space_sessions_token_hash_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX space_sessions_token_hash_key ON public.space_sessions USING btree (token_hash);


--
-- Name: timelines_space_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX timelines_space_id_idx ON public.timelines USING btree (space_id);


--
-- Name: characters characters_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER characters_set_updated_at BEFORE UPDATE ON public.characters FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: spaces spaces_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER spaces_set_updated_at BEFORE UPDATE ON public.spaces FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: characters trg_broadcast_characters; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_broadcast_characters AFTER INSERT OR DELETE OR UPDATE ON public.characters FOR EACH ROW EXECUTE FUNCTION public.app_broadcast_change();


--
-- Name: gm_journal trg_broadcast_gm_journal; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_broadcast_gm_journal AFTER INSERT OR DELETE OR UPDATE ON public.gm_journal FOR EACH ROW EXECUTE FUNCTION public.app_broadcast_change();


--
-- Name: locations trg_broadcast_locations; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_broadcast_locations AFTER INSERT OR DELETE OR UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.app_broadcast_change();


--
-- Name: map_pins trg_broadcast_map_pins; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_broadcast_map_pins AFTER INSERT OR DELETE OR UPDATE ON public.map_pins FOR EACH ROW EXECUTE FUNCTION public.app_broadcast_change();


--
-- Name: maps trg_broadcast_maps; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_broadcast_maps AFTER INSERT OR DELETE OR UPDATE ON public.maps FOR EACH ROW EXECUTE FUNCTION public.app_broadcast_change();


--
-- Name: relations trg_broadcast_relations; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_broadcast_relations AFTER INSERT OR DELETE OR UPDATE ON public.relations FOR EACH ROW EXECUTE FUNCTION public.app_broadcast_change();


--
-- Name: timelines trg_broadcast_timelines; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_broadcast_timelines AFTER INSERT OR DELETE OR UPDATE ON public.timelines FOR EACH ROW EXECUTE FUNCTION public.app_broadcast_change();


--
-- Name: tone_and_content trg_broadcast_tone_and_content; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_broadcast_tone_and_content AFTER INSERT OR DELETE OR UPDATE ON public.tone_and_content FOR EACH ROW EXECUTE FUNCTION public.app_broadcast_change();


--
-- Name: characters trg_revisions_characters; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_revisions_characters AFTER INSERT OR DELETE OR UPDATE ON public.characters FOR EACH ROW EXECUTE FUNCTION public.app_capture_revision();


--
-- Name: gm_journal trg_revisions_gm_journal; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_revisions_gm_journal AFTER INSERT OR DELETE OR UPDATE ON public.gm_journal FOR EACH ROW EXECUTE FUNCTION public.app_capture_revision();


--
-- Name: locations trg_revisions_locations; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_revisions_locations AFTER INSERT OR DELETE OR UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.app_capture_revision();


--
-- Name: map_pins trg_revisions_map_pins; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_revisions_map_pins AFTER INSERT OR DELETE OR UPDATE ON public.map_pins FOR EACH ROW EXECUTE FUNCTION public.app_capture_revision();


--
-- Name: maps trg_revisions_maps; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_revisions_maps AFTER INSERT OR DELETE OR UPDATE ON public.maps FOR EACH ROW EXECUTE FUNCTION public.app_capture_revision();


--
-- Name: relations trg_revisions_relations; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_revisions_relations AFTER INSERT OR DELETE OR UPDATE ON public.relations FOR EACH ROW EXECUTE FUNCTION public.app_capture_revision();


--
-- Name: timelines trg_revisions_timelines; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_revisions_timelines AFTER INSERT OR DELETE OR UPDATE ON public.timelines FOR EACH ROW EXECUTE FUNCTION public.app_capture_revision();


--
-- Name: tone_and_content trg_revisions_tone_and_content; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_revisions_tone_and_content AFTER INSERT OR DELETE OR UPDATE ON public.tone_and_content FOR EACH ROW EXECUTE FUNCTION public.app_capture_revision();


--
-- Name: characters characters_location_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.characters
    ADD CONSTRAINT characters_location_fkey FOREIGN KEY (location) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: characters characters_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.characters
    ADD CONSTRAINT characters_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE;


--
-- Name: gm_journal gm_journal_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gm_journal
    ADD CONSTRAINT gm_journal_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE;


--
-- Name: locations locations_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE;


--
-- Name: map_pins map_pins_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.map_pins
    ADD CONSTRAINT map_pins_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;


--
-- Name: map_pins map_pins_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.map_pins
    ADD CONSTRAINT map_pins_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: map_pins map_pins_map_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.map_pins
    ADD CONSTRAINT map_pins_map_id_fkey FOREIGN KEY (map_id) REFERENCES public.maps(id) ON DELETE CASCADE;


--
-- Name: map_pins map_pins_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.map_pins
    ADD CONSTRAINT map_pins_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE;


--
-- Name: maps maps_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.maps
    ADD CONSTRAINT maps_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: maps maps_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.maps
    ADD CONSTRAINT maps_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE;


--
-- Name: relations relations_from_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.relations
    ADD CONSTRAINT relations_from_character_id_fkey FOREIGN KEY (from_character_id) REFERENCES public.characters(id) ON DELETE CASCADE;


--
-- Name: relations relations_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.relations
    ADD CONSTRAINT relations_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE;


--
-- Name: relations relations_to_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.relations
    ADD CONSTRAINT relations_to_character_id_fkey FOREIGN KEY (to_character_id) REFERENCES public.characters(id) ON DELETE CASCADE;


--
-- Name: revisions revisions_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.revisions
    ADD CONSTRAINT revisions_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE;


--
-- Name: space_sessions space_sessions_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.space_sessions
    ADD CONSTRAINT space_sessions_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE;


--
-- Name: timelines timelines_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.timelines
    ADD CONSTRAINT timelines_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE;


--
-- Name: tone_and_content tone_and_content_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tone_and_content
    ADD CONSTRAINT tone_and_content_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE;


--
-- Name: characters; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;

--
-- Name: gm_journal; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.gm_journal ENABLE ROW LEVEL SECURITY;

--
-- Name: locations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

--
-- Name: map_pins; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.map_pins ENABLE ROW LEVEL SECURITY;

--
-- Name: maps; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.maps ENABLE ROW LEVEL SECURITY;

--
-- Name: relations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.relations ENABLE ROW LEVEL SECURITY;

--
-- Name: revisions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.revisions ENABLE ROW LEVEL SECURITY;

--
-- Name: space_login_throttle; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.space_login_throttle ENABLE ROW LEVEL SECURITY;

--
-- Name: space_sessions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.space_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: spaces; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;

--
-- Name: timelines; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.timelines ENABLE ROW LEVEL SECURITY;

--
-- Name: tone_and_content; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.tone_and_content ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: postgres
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION app_broadcast_change(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.app_broadcast_change() FROM PUBLIC;


--
-- Name: FUNCTION app_capture_revision(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.app_capture_revision() FROM PUBLIC;


--
-- Name: FUNCTION app_character_mechanics_open(v_type text, v_follower jsonb, v_statblock jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.app_character_mechanics_open(v_type text, v_follower jsonb, v_statblock jsonb) FROM PUBLIC;


--
-- Name: FUNCTION app_character_row_for_role(v_row public.characters, v_role text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.app_character_row_for_role(v_row public.characters, v_role text) FROM PUBLIC;


--
-- Name: FUNCTION app_gen_invite_code(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.app_gen_invite_code() FROM PUBLIC;


--
-- Name: FUNCTION app_is_follower(v_follower jsonb, v_statblock jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.app_is_follower(v_follower jsonb, v_statblock jsonb) FROM PUBLIC;


--
-- Name: FUNCTION app_legacy_hash(p text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.app_legacy_hash(p text) FROM PUBLIC;


--
-- Name: FUNCTION app_new_token(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.app_new_token() FROM PUBLIC;


--
-- Name: FUNCTION app_note_login_failure(p_code text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.app_note_login_failure(p_code text) FROM PUBLIC;


--
-- Name: FUNCTION app_session_from_token(p_token text, OUT o_space uuid, OUT o_role text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.app_session_from_token(p_token text, OUT o_space uuid, OUT o_role text) FROM PUBLIC;


--
-- Name: FUNCTION app_space_from_token(p_token text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.app_space_from_token(p_token text) FROM PUBLIC;


--
-- Name: FUNCTION app_to_base36(n bigint); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.app_to_base36(n bigint) FROM PUBLIC;


--
-- Name: FUNCTION app_verify_password(p_space_id uuid, p_password text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.app_verify_password(p_space_id uuid, p_password text) FROM PUBLIC;


--
-- Name: FUNCTION create_character(p_token text, p_data jsonb); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.create_character(p_token text, p_data jsonb) TO anon;
GRANT ALL ON FUNCTION public.create_character(p_token text, p_data jsonb) TO authenticated;


--
-- Name: FUNCTION create_location(p_token text, p_data jsonb); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.create_location(p_token text, p_data jsonb) TO anon;
GRANT ALL ON FUNCTION public.create_location(p_token text, p_data jsonb) TO authenticated;


--
-- Name: TABLE maps; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.maps TO service_role;


--
-- Name: FUNCTION create_map(p_token text, p_data jsonb); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.create_map(p_token text, p_data jsonb) TO anon;
GRANT ALL ON FUNCTION public.create_map(p_token text, p_data jsonb) TO authenticated;


--
-- Name: TABLE map_pins; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.map_pins TO service_role;


--
-- Name: FUNCTION create_map_pin(p_token text, p_data jsonb); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.create_map_pin(p_token text, p_data jsonb) TO anon;
GRANT ALL ON FUNCTION public.create_map_pin(p_token text, p_data jsonb) TO authenticated;


--
-- Name: FUNCTION create_relation(p_token text, p_data jsonb); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.create_relation(p_token text, p_data jsonb) TO anon;
GRANT ALL ON FUNCTION public.create_relation(p_token text, p_data jsonb) TO authenticated;


--
-- Name: FUNCTION create_space(p_name text, p_password text, p_player_password text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.create_space(p_name text, p_password text, p_player_password text) TO anon;
GRANT ALL ON FUNCTION public.create_space(p_name text, p_password text, p_player_password text) TO authenticated;


--
-- Name: FUNCTION delete_character(p_token text, p_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.delete_character(p_token text, p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.delete_character(p_token text, p_id uuid) TO authenticated;


--
-- Name: FUNCTION delete_location(p_token text, p_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.delete_location(p_token text, p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.delete_location(p_token text, p_id uuid) TO authenticated;


--
-- Name: FUNCTION delete_map(p_token text, p_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.delete_map(p_token text, p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.delete_map(p_token text, p_id uuid) TO authenticated;


--
-- Name: FUNCTION delete_map_pin(p_token text, p_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.delete_map_pin(p_token text, p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.delete_map_pin(p_token text, p_id uuid) TO authenticated;


--
-- Name: FUNCTION delete_relation(p_token text, p_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.delete_relation(p_token text, p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.delete_relation(p_token text, p_id uuid) TO authenticated;


--
-- Name: FUNCTION delete_space(p_token text, p_password text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.delete_space(p_token text, p_password text) TO anon;
GRANT ALL ON FUNCTION public.delete_space(p_token text, p_password text) TO authenticated;


--
-- Name: FUNCTION get_characters(p_token text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_characters(p_token text) TO anon;
GRANT ALL ON FUNCTION public.get_characters(p_token text) TO authenticated;


--
-- Name: FUNCTION get_gm_journal(p_token text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_gm_journal(p_token text) TO anon;
GRANT ALL ON FUNCTION public.get_gm_journal(p_token text) TO authenticated;


--
-- Name: FUNCTION get_locations(p_token text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_locations(p_token text) TO anon;
GRANT ALL ON FUNCTION public.get_locations(p_token text) TO authenticated;


--
-- Name: FUNCTION get_map_pins(p_token text, p_map_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_map_pins(p_token text, p_map_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_map_pins(p_token text, p_map_id uuid) TO authenticated;


--
-- Name: FUNCTION get_maps(p_token text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_maps(p_token text) TO anon;
GRANT ALL ON FUNCTION public.get_maps(p_token text) TO authenticated;


--
-- Name: FUNCTION get_relations(p_token text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_relations(p_token text) TO anon;
GRANT ALL ON FUNCTION public.get_relations(p_token text) TO authenticated;


--
-- Name: FUNCTION get_revisions(p_token text, p_limit integer, p_before_id bigint); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_revisions(p_token text, p_limit integer, p_before_id bigint) TO anon;
GRANT ALL ON FUNCTION public.get_revisions(p_token text, p_limit integer, p_before_id bigint) TO authenticated;


--
-- Name: FUNCTION get_timeline(p_token text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_timeline(p_token text) TO anon;
GRANT ALL ON FUNCTION public.get_timeline(p_token text) TO authenticated;


--
-- Name: FUNCTION get_tone_and_content(p_token text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_tone_and_content(p_token text) TO anon;
GRANT ALL ON FUNCTION public.get_tone_and_content(p_token text) TO authenticated;


--
-- Name: FUNCTION join_space(p_invite_code text, p_password text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.join_space(p_invite_code text, p_password text) TO anon;
GRANT ALL ON FUNCTION public.join_space(p_invite_code text, p_password text) TO authenticated;


--
-- Name: FUNCTION map_image_access(p_token text, p_map_id uuid, p_write boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.map_image_access(p_token text, p_map_id uuid, p_write boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.map_image_access(p_token text, p_map_id uuid, p_write boolean) TO service_role;


--
-- Name: FUNCTION move_timeline_entry(p_token text, p_from_year integer, p_from_season text, p_to_year integer, p_to_season text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.move_timeline_entry(p_token text, p_from_year integer, p_from_season text, p_to_year integer, p_to_season text) TO anon;
GRANT ALL ON FUNCTION public.move_timeline_entry(p_token text, p_from_year integer, p_from_season text, p_to_year integer, p_to_season text) TO authenticated;


--
-- Name: FUNCTION preview_undo_event(p_token text, p_event_id uuid, p_expect_event_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.preview_undo_event(p_token text, p_event_id uuid, p_expect_event_id uuid) TO anon;
GRANT ALL ON FUNCTION public.preview_undo_event(p_token text, p_event_id uuid, p_expect_event_id uuid) TO authenticated;


--
-- Name: FUNCTION prune_revisions(p_keep_days integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.prune_revisions(p_keep_days integer) FROM PUBLIC;


--
-- Name: FUNCTION revision_changed_keys(p_before jsonb, p_after jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.revision_changed_keys(p_before jsonb, p_after jsonb) FROM PUBLIC;


--
-- Name: FUNCTION revision_label(p_table text, p_before jsonb, p_after jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.revision_label(p_table text, p_before jsonb, p_after jsonb) FROM PUBLIC;


--
-- Name: FUNCTION revision_merge_timeline(p_before jsonb, p_current jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.revision_merge_timeline(p_before jsonb, p_current jsonb) FROM PUBLIC;


--
-- Name: FUNCTION revision_preview_label(p_event_id uuid, p_space uuid, p_table text, p_before jsonb, p_after jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.revision_preview_label(p_event_id uuid, p_space uuid, p_table text, p_before jsonb, p_after jsonb) FROM PUBLIC;


--
-- Name: FUNCTION revision_table_rank(p_table text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.revision_table_rank(p_table text) FROM PUBLIC;


--
-- Name: FUNCTION revision_undo_check(p_event_id uuid, p_space uuid, p_table text, p_row jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.revision_undo_check(p_event_id uuid, p_space uuid, p_table text, p_row jsonb) FROM PUBLIC;


--
-- Name: FUNCTION revision_will_exist(p_event_id uuid, p_space uuid, p_table text, p_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.revision_will_exist(p_event_id uuid, p_space uuid, p_table text, p_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION save_gm_journal(p_token text, p_data jsonb); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.save_gm_journal(p_token text, p_data jsonb) TO anon;
GRANT ALL ON FUNCTION public.save_gm_journal(p_token text, p_data jsonb) TO authenticated;


--
-- Name: FUNCTION save_gm_timeline(p_token text, p_data jsonb); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.save_gm_timeline(p_token text, p_data jsonb) TO anon;
GRANT ALL ON FUNCTION public.save_gm_timeline(p_token text, p_data jsonb) TO authenticated;


--
-- Name: FUNCTION save_gm_timeline_entry(p_token text, p_year integer, p_season text, p_entry jsonb, p_base_rev integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.save_gm_timeline_entry(p_token text, p_year integer, p_season text, p_entry jsonb, p_base_rev integer) TO anon;
GRANT ALL ON FUNCTION public.save_gm_timeline_entry(p_token text, p_year integer, p_season text, p_entry jsonb, p_base_rev integer) TO authenticated;


--
-- Name: FUNCTION save_timeline(p_token text, p_data jsonb); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.save_timeline(p_token text, p_data jsonb) TO anon;
GRANT ALL ON FUNCTION public.save_timeline(p_token text, p_data jsonb) TO authenticated;


--
-- Name: FUNCTION save_timeline_entry(p_token text, p_year integer, p_season text, p_entry jsonb, p_base_rev integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.save_timeline_entry(p_token text, p_year integer, p_season text, p_entry jsonb, p_base_rev integer) TO anon;
GRANT ALL ON FUNCTION public.save_timeline_entry(p_token text, p_year integer, p_season text, p_entry jsonb, p_base_rev integer) TO authenticated;


--
-- Name: FUNCTION save_tone_and_content(p_token text, p_data jsonb); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.save_tone_and_content(p_token text, p_data jsonb) TO anon;
GRANT ALL ON FUNCTION public.save_tone_and_content(p_token text, p_data jsonb) TO authenticated;


--
-- Name: FUNCTION season_has_text(v jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.season_has_text(v jsonb) FROM PUBLIC;


--
-- Name: FUNCTION season_rev(v jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.season_rev(v jsonb) FROM PUBLIC;


--
-- Name: FUNCTION timeline_latest(p_entries jsonb, OUT o_year integer, OUT o_season text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.timeline_latest(p_entries jsonb, OUT o_year integer, OUT o_season text) FROM PUBLIC;


--
-- Name: FUNCTION undo_event(p_token text, p_event_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.undo_event(p_token text, p_event_id uuid) TO anon;
GRANT ALL ON FUNCTION public.undo_event(p_token text, p_event_id uuid) TO authenticated;


--
-- Name: FUNCTION update_character(p_token text, p_id uuid, p_data jsonb); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_character(p_token text, p_id uuid, p_data jsonb) TO anon;
GRANT ALL ON FUNCTION public.update_character(p_token text, p_id uuid, p_data jsonb) TO authenticated;


--
-- Name: FUNCTION update_location(p_token text, p_id uuid, p_data jsonb); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_location(p_token text, p_id uuid, p_data jsonb) TO anon;
GRANT ALL ON FUNCTION public.update_location(p_token text, p_id uuid, p_data jsonb) TO authenticated;


--
-- Name: FUNCTION update_map(p_token text, p_id uuid, p_data jsonb); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_map(p_token text, p_id uuid, p_data jsonb) TO anon;
GRANT ALL ON FUNCTION public.update_map(p_token text, p_id uuid, p_data jsonb) TO authenticated;


--
-- Name: FUNCTION update_map_pin(p_token text, p_id uuid, p_data jsonb); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_map_pin(p_token text, p_id uuid, p_data jsonb) TO anon;
GRANT ALL ON FUNCTION public.update_map_pin(p_token text, p_id uuid, p_data jsonb) TO authenticated;


--
-- Name: FUNCTION update_relation(p_token text, p_id uuid, p_data jsonb); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_relation(p_token text, p_id uuid, p_data jsonb) TO anon;
GRANT ALL ON FUNCTION public.update_relation(p_token text, p_id uuid, p_data jsonb) TO authenticated;


--
-- Name: FUNCTION update_space_settings(p_token text, p_current_password text, p_data jsonb); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_space_settings(p_token text, p_current_password text, p_data jsonb) TO anon;
GRANT ALL ON FUNCTION public.update_space_settings(p_token text, p_current_password text, p_data jsonb) TO authenticated;


--
-- PostgreSQL database dump complete
--



--
-- Restore production's privilege posture on a fresh Supabase project.
--
-- pg_dump emits the resulting ACL state, never the operations that produced it.
-- Production's `revoke all on table ... from anon, authenticated` is therefore
-- recorded as *absence* -- and absence cannot counteract Supabase's own
-- ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon, authenticated,
-- which fires as each table above is created. Without this block a fresh
-- project hands anon REFERENCES/TRIGGER/TRUNCATE/MAINTAIN, and RLS does not
-- gate TRUNCATE.
--
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
