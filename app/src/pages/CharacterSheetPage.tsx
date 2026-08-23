import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Pencil, X, Check, Trash2, MapPin, Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { RichText } from '@/components/shared/RichText';
import { MembersList } from '@/components/character/MembersList';
import { PromotedRelationsList } from '@/components/character/PromotedRelationsList';
import { RelationsList } from '@/components/character/RelationsList';
import { MovesEditor } from '@/components/character/MovesEditor';
import { Toast } from '@/components/shared/Toast';
import { useAppStore } from '@/stores/appStore';
import { useCharacters } from '@/hooks/useCharacters';
import { useRelations } from '@/hooks/useRelations';
import { FALLBACK_LOCATION_COLOR } from '@/lib/constants';
import { LocationPicker } from '@/components/locations/LocationPicker';
import { PinnedOnMaps } from '@/components/maps/PinnedOnMaps';
import { ChronicleBacklinks } from '@/components/timeline/ChronicleBacklinks';
import {
  buildMentionItems,
  characterMentionId,
  type MentionItem,
} from '@/components/editor/mentionItems';
import { useLocations } from '@/hooks/useLocations';
import { useCanEdit, useIsGm } from '@/hooks/useRole';
import { useT, type TKey } from '@/i18n';
import { resolveGroupMembers } from '@/lib/character/groupMembers';
import { resolvePromotedRelations } from '@/lib/character/promotedRelations';
import { DISCOVERY_KINDS, getDiscoveryKind } from '@/lib/character/discoveryKinds';
import { DISCOVERY_TIERS, discoveryBlockOf } from '@/lib/character/discoveryBlock';
import { DISCOVERY_KIND_ICONS, DISCOVERY_UNFILED_ICON } from '@/components/character/discoveryKindIcons';
import { ArcanumCard } from '@/components/character/ArcanumCard';
import { instinctOf } from '@/lib/character/instinct';
import { changedKeys } from '@/lib/patch';
import { GmBadge } from '@/components/shared/GmBadge';
import { GmNotesCard } from '@/components/shared/GmNotesCard';
import { StampIcon } from '@/components/shared/StampIcon';
import { PLAYBOOK_ICONS } from '@/components/character/playbookIcons';
import { monsterKindIcon } from '@/components/character/monsterKindIcons';
import { MONSTER_KINDS, type MonsterKind } from '@/lib/character/monsterKinds';
import entityCharacterStamp from '@/assets/stonetop/entity-character.png';
import entityGroupStamp from '@/assets/stonetop/entity-group.png';
import menaceStamp from '@/assets/stonetop/menace.png';
import { PLAYBOOKS, parseRole, composeRole, type PlaybookKey } from '@/lib/character/playbooks';
import { THREAT_TYPES, legacyThreatRole, threatTypeName, threatTypeOf } from '@/lib/character/threatTypes';
import { EntityDescriptor } from '@/components/character/EntityDescriptor';
import { StateChip } from '@/components/character/StateChip';
import { TagEditor } from '@/components/character/TagEditor';
import { ThreatSheetCard } from '@/components/character/ThreatSheetCard';
import { emptyThreatSheet, normalizeThreatSheet } from '@/lib/character/threatSheet';
import { StatBlockCard } from '@/components/character/StatBlockCard';
import { FollowerCard } from '@/components/character/FollowerCard';
import {
  DEFAULT_MONSTER_KIND, emptyFollower, emptyStatBlock, followerOf, isFollower,
  isMonster, isMonsterKind, kindWithDefault, normalizeStatBlock, tagsApply,
} from '@/lib/character/statblock';
import type {
  Trait, ThreatSheet, Character, ThreatType, StatBlock, FollowerBlock, CharacterType, DiscoveryBlock,
  ArcTrack,
} from '@/types';

/** Type badge label. A Record and not a ternary chain: the chain was already
 *  four deep and its last arm silently claimed "Threat" for anything it did
 *  not recognise, which is exactly how a fifth type ships mislabelled. */
const TYPE_LABELS: Record<CharacterType, TKey> = {
  PJ: 'character.typePC',
  PNJ: 'character.typeNPC',
  GROUPE: 'character.typeGroup',
  MENACE: 'character.typeThreat',
  DISCOVERY: 'character.typeDiscovery',
};

/** Threat with no sheet created yet: we seed a blank one, never `null`.
    Normalized on the way through — restored revisions can carry the old shape. */
function seedThreat(character: Character): ThreatSheet | null {
  if (character.threat) return normalizeThreatSheet(character.threat);
  return character.type === 'MENACE' ? emptyThreatSheet() : null;
}

/** Normalized stat block; never seeded automatically — the GM adds it
    explicitly ("Add stat block"), unlike the threat sheet. */
function seedStatblock(character: Character): StatBlock | null {
  return character.statblock ? normalizeStatBlock(character.statblock) : null;
}

/**
 * The editable surface of a character sheet, held as ONE object.
 *
 * Field names are the draft's own, not the column names: `roleRest`/`playbook`
 * are the two halves `composeRole` joins into the `role` column, and `gmOnly`/
 * `gmNotes` are camelCase because nothing writes this object to the wire —
 * `handleSave` maps it to the row explicitly, which is where the per-field
 * send/omit guards live.
 */
interface CharacterDraft {
  name: string;
  playbook: PlaybookKey | null;
  threatType: ThreatType | null;
  /** Raw while typing — parsed/composed ONLY on sync-in and save, because
   *  composing on every keystroke ate the trailing space (compose trims). */
  roleRest: string;
  instinct: string;
  location: string | undefined;
  tags: string[];
  notes: string;
  traits: Trait[];
  gmNotes: string;
  gmOnly: boolean;
  dead: boolean;
  threat: ThreatSheet | null;
  statblock: StatBlock | null;
  kind: MonsterKind | null;
  follower: FollowerBlock | null;
  /** The per-kind block, normalised at seed. `null` = the row carries none. */
  discovery: DiscoveryBlock | null;
}

const EMPTY_DRAFT: CharacterDraft = {
  name: '',
  playbook: null,
  threatType: null,
  roleRest: '',
  instinct: '',
  location: undefined,
  tags: [],
  notes: '',
  traits: [],
  gmNotes: '',
  gmOnly: false,
  dead: false,
  threat: null,
  statblock: null,
  kind: null,
  follower: null,
  discovery: null,
};

/** Hydrate the draft from a stored row. Every field is set here — the whole
 *  point of the single object is that there is no second place to forget one. */
function draftFromCharacter(character: Character): CharacterDraft {
  const isPc = character.type === 'PJ';
  const parsed = isPc ? parseRole(character.role || '') : null;
  return {
    name: character.name,
    playbook: parsed?.playbook ?? null,
    // Legacy "Beast · …" prefix: promoted into threat.type on the next save
    // when it maps (beast/faction).
    threatType:
      character.type === 'MENACE'
        ? (character.threat?.type ?? legacyThreatRole(character.role || '').type)
        : null,
    // A MENACE has no role — the field is no longer offered. We still seed the
    // draft from the stored value, because the save sends `role`
    // unconditionally: putting '' here would erase the text on old sheets
    // ("Magical entity (Nearby)"…) at the first save. Hiding a field must
    // never destroy anything.
    // A DISCOVERY's `role` is its KIND, and the picker no longer offers
    // "Unfiled" — so an unfiled row must reach the draft already carrying the
    // default. Without this the select would DISPLAY the first kind while the
    // draft still held '', and saving would quietly leave the row unfiled: the
    // display lie this sheet forbids itself everywhere else. The consequence is
    // deliberate — editing an unfiled discovery files it on the next save.
    // Only for a genuinely EMPTY role. An unrecognised NON-empty value
    // ("Magical entity (Nearby)" on a row re-typed from MENACE, anything a
    // restored revision drags in) is kept verbatim and offered back by the
    // select as a keep-option — the same tolerance `relationTypesForPair`'s
    // `keepId` already provides for a stored relation type that no longer fits.
    // Defaulting it instead DESTROYED the text on the next save, which is
    // exactly what the comment above forbids.
    roleRest: character.type === 'DISCOVERY'
      ? (character.role?.trim() ? character.role : DISCOVERY_KINDS[0].id)
      : parsed ? parsed.rest : character.role || '',
    // Column first, threat.instinct fallback otherwise (restored revision) —
    // promotion to the column happens naturally on the next save.
    instinct: instinctOf(character),
    // The draft speaks the picker's language (undefined = no place); the save
    // translates back to the column's `null` — see handleSave.
    location: character.location ?? undefined,
    tags: character.tags || [],
    notes: character.notes || '',
    traits: character.traits || [],
    gmNotes: character.gm_notes ?? '',
    gmOnly: character.gm_only,
    dead: character.dead ?? false,
    threat: seedThreat(character),
    statblock: seedStatblock(character),
    // Sheet classifications: own columns, falling back to the old form nested
    // in the block, then a per-type default (cf. lib/statblock). The default
    // goes through state and NOT just the display: otherwise the select would
    // show "NPC" while the save sent null.
    kind: kindWithDefault(character),
    // `isFollower` and not `followerOf`: a MENACE is never one, even if the row
    // still carries a follower block (written before the rule, or resurrected
    // by a restore). So we don't seed it — the stored block stays intact,
    // simply inert, and the save won't send it.
    follower: isFollower(character) ? followerOf(character) : null,
    // Normalised at the boundary like threat/statblock: a restored revision can
    // carry a partial or foreign shape, and the draft must not propagate it.
    // A player's copy has interesting/useful already stripped by the server —
    // that is exactly what they should be editing against.
    discovery: discoveryBlockOf(character),
  };
}

export default function CharacterSheetPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();

  const navigate = useNavigate();
  const routerLocation = useLocation();
  const canEdit = useCanEdit();
  const isGm = useIsGm();
  const session = useAppStore((s) => s.session);
  const characters = useAppStore((s) => s.characters);
  const showToast = useAppStore((s) => s.showToast);
  const { status, retry, updateCharacter, deleteCharacter } = useCharacters(session?.space.id);
  const { relations } = useRelations(session?.space.id);
  const { locations } = useLocations(session?.space.id);

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<CharacterDraft>(EMPTY_DRAFT);
  /** Patch one or more draft fields. Everything the editor touches lives in a
   *  single object (same shape as LocationSheetPage): as 16 separate useStates
   *  this was a save that hand-reassembled 16 values and a sync effect that
   *  fired 16 setters — both places a newly added column silently goes missing. */
  const patchDraft = useCallback(
    (patch: Partial<CharacterDraft>) => setDraft((d) => ({ ...d, ...patch })),
    [],
  );
  // Not part of the draft: transient input, discarded on save. Same reason the
  // tag input lives in StatBlockCard rather than here — only the committed
  // list belongs to the entity.
  const [traitInput, setTraitInput] = useState('');
  // Same reasoning, for the consequences chip row below the grid.
  const [consequenceInput, setConsequenceInput] = useState('');
  // Seen-on-entering-edit: distinguishes a `null` that deliberately CLEARS
  // (the editor had a block in front of them and removed it) from a `null`
  // that merely masks a player read — see the guard in handleSave.
  const statblockSeededRef = useRef(false);
  const followerSeededRef = useRef(false);
  // The row the draft was seeded FROM, so the save can send only what changed.
  // Deliberately not the live `character`: a realtime ping mid-edit replaces
  // that identity, and diffing against someone else's newer value would make
  // our untouched field look changed and overwrite them — the exact clobber
  // this is here to stop.
  const baselineRef = useRef<Character | null>(null);
  // "Open me in edit mode", set by the creation form (an entry is born with a
  // name and a type, everything else is filled in here). A REF, not a plain
  // boolean read at render: the switch has to wait for the sync effect to
  // hydrate the draft — otherwise we enter edit mode on empty fields (the
  // effect refuses to run while editing) and the first Save overwrites the
  // row with blanks.
  const editIntentRef = useRef(
    Boolean((routerLocation.state as { edit?: boolean } | null)?.edit),
  );
  const [loading, setLoading] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const character = characters.find((c) => c.id === id);

  // Cibles des mentions @ dans les notes (personnages puis lieux).
  const mentionItems = useMemo<MentionItem[]>(
    () => buildMentionItems(characters, locations),
    [characters, locations],
  );

  // Relations already shown by a PROMOTED list, hidden from the generic bonds
  // so no row appears twice on one sheet. Inert relations stay listed (a
  // `member` between two groups, a `leads-to` whose `from` is not a
  // discovery) — otherwise they would become invisible and impossible to
  // delete.
  const { promotedRelationIds, promoted } = useMemo(() => {
    const ids = new Set<string>();
    if (character?.type === 'GROUPE') {
      for (const id of resolveGroupMembers(characters, relations).membershipRelationIds) ids.add(id);
    }
    const promoted = resolvePromotedRelations(characters, relations);
    // Both ENDS hide it: the discovery shows it under its own kind's heading
    // ("Points to", "Possessed by"…), the target under the incoming one.
    for (const r of relations) {
      if (!promoted.promotedRelationIds.has(r.id)) continue;
      if (r.from_character_id === character?.id || r.to_character_id === character?.id) ids.add(r.id);
    }
    // `ids` is the UNION with group membership — that is what the bonds list
    // excludes; `promoted` rides along for the render condition below.
    return { promotedRelationIds: ids, promoted };
  }, [character, characters, relations]);

  useEffect(() => {
    if (!session) navigate('/');
  }, [session, navigate]);

  useEffect(() => {
    // While editing, never resync: a realtime ping (ANY write in the space —
    // a map pin, a portent checkbox) replaces the identity of `character` and
    // would overwrite the draft mid-keystroke. On leaving edit mode
    // (save/cancel) `isEditing` goes back to false, the effect re-runs and
    // resyncs from the store.
    if (isEditing || !character) return;
    const next = draftFromCharacter(character);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(next);
    // Seen-on-entering-edit, so these track the draft rather than living in it:
    // they distinguish a `null` that deliberately CLEARS (the editor had a
    // block in front of them and removed it) from a `null` that merely masks a
    // player read — see the guards in handleSave.
    statblockSeededRef.current = next.statblock !== null;
    followerSeededRef.current = next.follower !== null;
    baselineRef.current = character;
    // The draft has just been laid down, so switching into edit mode is safe
    // (React batches this setState with the one above, so the next render
    // ALREADY has the values). Once per mount.
    if (editIntentRef.current) {
      editIntentRef.current = false;
      if (canEdit) setIsEditing(true);
    }
  }, [character, isEditing, canEdit]);

  const handleSave = useCallback(async () => {
    if (!character || !id) return;
    setLoading(true);
    try {
      const payload: Partial<Character> = {
        name: draft.name,
        role:
          character.type === 'PJ'
            ? composeRole(draft.playbook, draft.roleRest)
            : draft.roleRest.trim(),
        instinct: draft.instinct.trim(),
        // `?? null` and not the raw draft value: "no location" is `undefined`
        // in the picker, and JSON.stringify DROPS an undefined-valued key on
        // the way to the RPC — which reads key presence as "write this column"
        // (`case when p_data ? 'location'`). Sent bare, clearing the place was
        // a silent no-op: the field emptied, the save succeeded, and the old
        // place came back on the next resync. Same coercion as MapFormModal.
        location: draft.location ?? null,
        tags: draft.tags,
        notes: draft.notes,
        // Cleans up existing traits (stray whitespace, empty entries inherited
        // from old sheets) — adding via the chip is already trimmed, this
        // filter covers restored/legacy data.
        traits: draft.traits.map((tr) => ({ ...tr, label: tr.label.trim() })).filter((tr) => tr.label !== ''),
        // Left play — a campaign fact, not GM prep: sent for every role, like
        // name/role/traits (cf. supabase-deceased.sql). A MENACE has none (the
        // checkbox isn't offered) but the stored value is sent back as-is:
        // hiding a field must never destroy anything, same rule as the threat
        // role above.
        dead: draft.dead,
        // The server rejects gm_only/gm_notes coming from a non-GM (FORBIDDEN
        // as soon as the key is present), so we only include them for the GM.
        ...(isGm && { gm_only: draft.gmOnly, gm_notes: draft.gmNotes }),
        // `threat` is NOT filtered server-side (a player may tick a portent on
        // a revealed threat), so we include it for every role. The type chosen
        // in the MENACE selector is threaded into the block on save.
        ...(draft.threat && {
          threat: {
            ...draft.threat,
            type: character.type === 'MENACE' ? draft.threatType : (draft.threat.type ?? null),
          },
        }),
        // Only send statblock if the editor SAW one on entering edit mode
        // (deliberate removal) or has one locally (add/edit). A blind null (a
        // row masked on the player side) is never sent — otherwise a concurrent
        // follower promotion by the GM would be silently overwritten.
        ...((draft.statblock !== null || statblockSeededRef.current) && { statblock: draft.statblock }),
        // `kind`: only the GM gets the selector, so a player has nothing to
        // write here — except in ONE case, and it matters: on a follower sheet
        // where a pre-migration revision resurrected the old nested `kind`,
        // `draft.kind` holds the value hoisted by kindOf while the `statblock`
        // we send just above no longer carries it. Without this send, a
        // player's save would erase the classification. A player's `null`, on
        // the other hand, is never sent: that would be the blind null of a
        // masked row (same guard as `statblock`).
        ...((isGm || draft.kind !== null) && { kind: draft.kind }),
        // `follower`: same blind-null guard as `statblock` (a player touches
        // loyalty, so they MUST be able to send it, but an unseeded null would
        // overwrite a concurrent follower promotion by the GM).
        ...((draft.follower !== null || followerSeededRef.current) && { follower: draft.follower }),
        // Sent whenever the draft holds a block or the row did. `patch.ts`
        // diffs the outgoing payload, so an untouched block is never sent and
        // cannot be clobbered by a concurrent edit to another field.
        //
        // A PLAYER's payload legitimately lacks interesting/useful (the server
        // stripped them on read) — update_character re-grafts the stored pair
        // for a non-GM writer, so a player marking a track cannot erase the
        // GM's notes. That guarantee is SERVER-side and covers a null payload
        // too, so nothing here has to send `{}` instead of `null` to be safe.
        // See supabase-discovery-block.sql.
        ...((draft.discovery !== null || character.discovery != null) && {
          discovery: draft.discovery,
        }),
      };
      // Only the columns this editor actually changed. The RPC reads key
      // presence as "write this column", so shipping the untouched ones is
      // precisely what overwrites whoever else is editing this sheet.
      // Diffing the PAYLOAD rather than the draft keeps the normalise-on-save
      // behaviour above intact: where the cleanup changes a value the diff
      // sees it, where it doesn't there was nothing to write.
      const patch = changedKeys(baselineRef.current, payload);
      if (Object.keys(patch).length === 0) {
        // An empty write would still bump updated_at and mint a ledger event.
        setIsEditing(false);
        return;
      }
      await updateCharacter(id, patch);
      setIsEditing(false);
    } catch (err) {
      // We stay in edit mode: the draft is intact and the user can retry — but
      // they have to know nothing was saved.
      console.error('Error saving:', err);
      showToast(t('character.saveError'));
    } finally {
      setLoading(false);
    }
  }, [character, id, draft, isGm, updateCharacter, showToast, t]);

  // Confirmation goes through the AlertDialog (ink theme) — no more confirm().
  const handleDelete = useCallback(async () => {
    if (!id) return;
    await deleteCharacter(id);
    navigate('/dashboard');
  }, [id, deleteCharacter, navigate]);

  const removeTrait = (index: number) =>
    setDraft((d) => ({ ...d, traits: d.traits.filter((_, i) => i !== index) }));
  const addTrait = () => {
    const label = traitInput.trim();
    if (label && !draft.traits.some((tr) => tr.label === label)) {
      setDraft((d) => ({ ...d, traits: [...d.traits, { label, checked: false }] }));
      setTraitInput('');
    }
  };
  // A requirement's tick, DISCOVERY only — a PC/NPC/GROUP/MENACE's traits are
  // memorable impressions, not a checklist, so `checked` stays inert for them
  // by design (the chip renders no tick control for them at all, see below).
  // Outside edit mode the tick saves right away — it is play, not a change to
  // the sheet, same semantics as the threat-portent and loyalty ticks above,
  // including their error handling and their accepted snap-back race.
  // `canEdit`-gated here rather than at the render site: the control stays
  // visible to a viewer (so they can still read progress), only the toggle
  // itself is a no-op for them — the same split FollowerCard's loyalty pips
  // already use.
  const toggleTraitChecked = (index: number) => {
    if (!canEdit) return;
    const next = draft.traits.map((tr, i) => (i === index ? { ...tr, checked: !tr.checked } : tr));
    patchDraft({ traits: next });
    if (!isEditing && id) {
      updateCharacter(id, { traits: next }).catch((err) => {
        console.error('Error saving requirement tick:', err);
        showToast(t('common.saveError'));
      });
    }
  };

  // Adding/removing tags lives in StatBlockCard now that they've joined the
  // other stats there — the page only carries the state.

  if (!session) return null;
  if (!character) {
    // Tant que le premier fetch n'a pas abouti, un lien profond ou un refresh
    // arrive ici avec un store vide : afficher notFound serait un mensonge.
    if (status === 'loading') {
      return (
        <div className="min-h-screen flex items-center justify-center" aria-busy="true">
          <p className="text-[var(--text-muted)] font-body">{t('common.loading')}</p>
        </div>
      );
    }
    if (status === 'error') {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4">
          <p className="text-[var(--text-muted)] font-body">{t('common.loadError')}</p>
          <button type="button" onClick={retry} className="btn-outline text-sm">
            {t('common.retry')}
          </button>
        </div>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-[var(--text-muted)] font-body">{t('character.notFound')}</p>
      </div>
    );
  }

  const characterLocation = character.location
    ? locations.find((l) => l.id === character.location)
    : undefined;
  const locationColor = characterLocation?.color ?? FALLBACK_LOCATION_COLOR;
  const locationName = characterLocation?.name;
  // The prefix folded into `role` leaves the field in read mode: a PC's
  // playbook gets its own line ("Lightbearer · Burning Soul" reads better on
  // two). A MENACE has no role at all — its archetype IS its type
  // de menace, qui se rend sous le titre.
  const savedRole = parseRole(character.role || '');
  const playbookName =
    character.type === 'PJ'
      ? (PLAYBOOKS.find((p) => p.key === savedRole.playbook)?.name ?? null)
      : null;
  const roleRest = character.type === 'PJ' ? savedRole.rest : character.role || '';
  // Playbook (PC) for the watermark stamp: from the draft while editing (so it
  // reacts live to typing/the menu), from character.role otherwise.
  const watermarkPlaybook = isEditing ? draft.playbook : savedRole.playbook;

  // LIVE followerhood: reading the saved row would lie mid-edit (Follower
  // ticked, not yet saved). Same shape as `watermarkPlaybook` above. Outside
  // edit mode we read the ROW and not `draft.follower`: the latter is only set
  // after the first paint (it comes from an effect), so the "GM only" chip
  // would flicker on the sheet
  // d'un follower le temps d'une frame.
  // Une MENACE ne peut pas basculer follower (la case ne lui est pas offerte
  // et le SQL refuserait), donc les deux branches valent false pour elle.
  const followerLive = isEditing ? draft.follower != null : isFollower(character);
  // What a player sees: a PC, or a sheet promoted to follower (parity with
  // supabase-statblock.sql). Tout le reste — instinct, bloc de stats — est
  // GM prep, and it is THIS predicate that places the "GM only" chips.
  const playerVisible = character.type === 'PJ' || followerLive;

  // Left play: ONE column, two words depending on the type — deceased for a
  // PC/NPC, disbanded for a GROUP. Same string for the edit checkbox and the
  // read-mode chip: it is the same thing, so it must be said the same way.
  const deadLabel =
    character.type === 'GROUPE' ? t('character.disbanded') : t('character.deceased');

  // A discovery carries none of the sheet's mechanics. Hoisted rather than
  // repeated inline nine times: a guard spelled out at nine call sites is a
  // guard that gets missed at the tenth.
  const isDiscovery = character.type === 'DISCOVERY';
  // Hoisted out of the Information card's IIFE so the Moves subsection — which
  // now renders BELOW the label/field grid rather than as a col-span-2 row
  // inside it — reads the same live values. Both follow the DRAFT's kind, so
  // choosing "Artifact" reveals its fields before any save.
  const discoveryKind = isDiscovery ? getDiscoveryKind(draft.roleRest) : null;
  const discoveryDraftBlock: DiscoveryBlock = draft.discovery ?? {};
  const patchDiscoveryBlock = (next: DiscoveryBlock) =>
    patchDraft({ discovery: Object.keys(next).length ? next : null });
  // Marking a charge or a progress pip is play, not a change to the sheet —
  // same rule as `toggleTraitChecked` above (it saves immediately outside
  // edit mode, with the same accepted snap-back race on a failed write), only
  // the field it patches is the whole `discovery` blob rather than a top-level
  // column. That is safe for a non-GM writer too: update_character re-grafts
  // the stored interesting/useful pair onto any `discovery` patch regardless
  // of who sends it (supabase-discovery-block.sql), so a player's draft — which
  // never carried that GM-held pair to begin with — cannot erase it here.
  const markTrack = (index: number, marked: number) => {
    if (!canEdit) return;
    const tracks = (discoveryDraftBlock.tracks ?? []).map((tr, i) =>
      (i === index ? { ...tr, marked } : tr));
    const next: DiscoveryBlock = { ...discoveryDraftBlock, tracks };
    patchDiscoveryBlock(next);
    if (!isEditing && id) {
      const discovery = Object.keys(next).length ? next : null;
      updateCharacter(id, { discovery }).catch((err) => {
        console.error('Error saving track mark:', err);
        showToast(t('common.saveError'));
      });
    }
  };
  // The back's consequences editor — a SEPARATE array from `traits`
  // (requirements): an arcanum has requirements AND consequences, and they
  // are different lists that happen to share `Trait`'s {label, checked}
  // shape. Same delete-key/null-the-block wiring as Moves/Tracks/Mysteries
  // above.
  const patchConsequences = (consequences: Trait[]) => {
    const next: DiscoveryBlock = { ...discoveryDraftBlock };
    if (consequences.length === 0) delete next.consequences;
    else next.consequences = consequences;
    patchDiscoveryBlock(next);
  };
  /** Tick a consequence from READ mode and save at once — same contract as
   *  `toggleTraitChecked`/`markTrack`: exacting an arcanum's price is play,
   *  not an edit, so making someone open the editor to record it would be
   *  the wrong friction. Patches the DRAFT first (matching every other
   *  read-mode tick in this file), so the card's own `block={draft.discovery}`
   *  reflects the flip on this same render instead of waiting on the write's
   *  round trip. */
  const toggleConsequence = (index: number) => {
    if (!canEdit) return;
    const consequences = (discoveryDraftBlock.consequences ?? []).map((c, i) =>
      (i === index ? { ...c, checked: !c.checked } : c));
    const next: DiscoveryBlock = { ...discoveryDraftBlock, consequences };
    patchDiscoveryBlock(next);
    if (!isEditing && id) {
      const discovery = Object.keys(next).length ? next : null;
      updateCharacter(id, { discovery }).catch((err) => {
        console.error('Error saving consequence tick:', err);
        showToast(t('common.saveError'));
      });
    }
  };
  // LIVE monsterhood: same shape as `followerLive` — reading the saved row
  // would lie while editing, and reading the draft before the first paint
  // would make the selector flicker.
  //
  // `&& !isDiscovery` looks redundant now that isMonster() itself denies
  // discovery monsterhood (lib/statblock) — it is not. The EDIT-MODE branch
  // here reads `draft.kind` directly rather than going through isMonster():
  // draft.kind is seeded by kindWithDefault(), which deliberately still
  // returns the row's stored kind (tolerate-and-ignore, same as the
  // watermark/stat-block guards above). Without this guard, a discovery
  // carrying a stale `kind` (a restored revision, a re-typed row) would flow
  // straight through into `tagsLive` below and reopen the Tags editor this
  // task closed everywhere else.
  const monsterLive = !isDiscovery && (isEditing ? isMonsterKind(draft.kind) : isMonster(character));
  // Tags = game stats: monsters, followers — and an artifact or
  // arcanum, whose game elements the book writes as tags. Read from
  // the DRAFT's kind, not the stored role: choosing "Artifact" in the dropdown
  // must reveal the field in the same breath, the way the Monster checkbox
  // already reveals it.
  const discoveryTagsLive = isDiscovery
    && ['artifact', 'arcanum'].includes(getDiscoveryKind(draft.roleRest) ?? '');
  const tagsLive = discoveryTagsLive || monsterLive || followerLive;

  // READ-MODE card. An artifact and an arcanum ARE cards in the book, so the
  // sheet stops printing them as a notes block and prints the card instead
  // (ArcanumCard). Keyed on the STORED role and not the draft — the opposite
  // of `discoveryTagsLive` above, and deliberately: this branch only exists
  // outside edit mode, where the two are the same value, and edit mode keeps
  // the ordinary field stack (one editing model, no inline-editing surface).
  const discoveryCard: 'artifact' | 'arcanum' | null = (() => {
    if (isEditing || !isDiscovery) return null;
    const kind = getDiscoveryKind(character.role);
    return kind === 'artifact' || kind === 'arcanum' ? kind : null;
  })();

  /**
   * Le stat block suit les deux cases. Dans le livre, un monstre comme un
   * followers have HP and armour, and nothing
   * else does — so those two checkboxes are exactly what decides whether it
   * exists. No more "Add stat block" button or "Remove stat block" link beside
   * it: one owner only, otherwise the two can contradict each other on screen.
   *
   * Unticking both discards the block. That is deliberate and reversible: we
   * are in edit mode (Cancel restores the draft from the store) and the save
   * goes through the Ledger, so an undo brings it back.
   */
  const syncStatblock = (monster: boolean, follower: boolean) =>
    setDraft((d) => ({ ...d, statblock: monster || follower ? (d.statblock ?? emptyStatBlock()) : null }));

  // `npc` leaves the list: it is the "not a monster" value, and the Monster
  // checkbox is what sets it. `faction` — labelled "Group" — leaves for an NPC
  // (a group IS an entity type here) as it does for a GROUP ("Type: Group" on a
  // group says nothing). It stays for a MENACE, where the selector is only a
  // stamp choice and "Group" there means the group glyph.
  // A stored value outside the list (an old row carrying `faction`, or a
  // restored revision) stays OFFERED: removing it would leave a mute select
  // showing blank while re-saving the old value — the display lie this repo
  // forbids itself everywhere else.
  const kindOptions = (() => {
    const list = MONSTER_KINDS.filter(
      (k) => k.key !== 'npc' && (k.key !== 'faction' || character.type === 'MENACE'),
    );
    return draft.kind && !list.some((k) => k.key === draft.kind)
      ? [...list, ...MONSTER_KINDS.filter((k) => k.key === draft.kind)]
      : list;
  })();

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        {/* Sheet Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between gap-4 mb-10 flex-wrap"
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate('/dashboard')}
              className="p-2 -ml-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              title={t('character.backToGrimoire')}
            >
              <ArrowLeft size={22} />
            </button>
            <div className="min-w-0">
              <p className="label-overline mb-1">{t('character.sheetOverline')}</p>
              <div className="flex items-center gap-2 flex-wrap">
                {isEditing ? (
                  <input
                    type="text"
                    value={draft.name}
                    aria-label={t('characterForm.nameLabel')}
                    onChange={(e) => patchDraft({ name: e.target.value })}
                    className="font-display text-3xl md:text-5xl font-bold text-[var(--text-primary)] bg-transparent border-b-2 border-[var(--border-focus)] focus:outline-none pb-1 max-w-full"
                  />
                ) : (
                  // The anti-clipping pb/-mb lives on an inner span: the h1 box keeps
                  // its 1em height (chip centring unchanged) while
                  // que le clip du truncate laisse la place aux descentes de Playfair.
                  <h1 className="font-display text-3xl md:text-5xl font-bold text-[var(--text-primary)] leading-none min-w-0">
                    <span className="block truncate pb-[0.2em] -mb-[0.2em]">{character.name}</span>
                  </h1>
                )}
                <span
                  className={`font-body text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-0.5 rounded border ${
                    character.type === 'PJ'
                      ? 'bg-[var(--accent-primary)] text-[var(--text-inverse)] border-[var(--accent-primary)]'
                      : character.type === 'GROUPE'
                        ? 'bg-[var(--bg-card-alt)] text-[var(--text-secondary)] border-[var(--border-paper)]'
                        : character.type === 'MENACE'
                          ? ''
                          : 'text-[var(--text-muted)] border-[var(--border-paper)]'
                  }`}
                  style={
                    character.type === 'MENACE'
                      ? {
                          color: 'var(--gm-accent)',
                          borderColor: 'var(--gm-accent)',
                          backgroundColor: 'var(--gm-accent-soft)',
                        }
                      : undefined
                  }
                >
                  {t(TYPE_LABELS[character.type])}
                </span>
                {/* La pastille de type reste ICI : sur une fiche elle ne se
                    repeat from card to card, it names the only entry on
                    screen. It is the GRID that lost it. */}
                {character.dead && character.type !== 'MENACE' && !isDiscovery && (
                  <StateChip label={deadLabel} />
                )}
                {character.gm_only && <GmBadge />}
              </div>
              {/* Type de menace : sous le nom, en descripteur du livre — plus
                  as a chip. Three chips in a row ("Threat", its type, "GM")
                  read like a dashboard, whereas the type is a qualification,
                  not a state. */}
              {!isEditing && (
                <EntityDescriptor
                  className="mt-1"
                  items={[
                    character.type === 'MENACE' ? threatTypeName(threatTypeOf(character)) : null,
                    // Les tags rejoignent le type de menace sous le nom —
                    // the anatomy of the book, where "Group, organized, skilled"
                    // follows the entry name. Same line as on the grimoire card,
                    // so a sheet reads the same on both sides.
                    ...(tagsApply(character) ? (character.tags ?? []) : []),
                  ]}
                />
              )}
            </div>
          </div>

          <div className="flex gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="btn-ink"
                >
                  <Check size={16} />
                  {t('common.save')}
                </button>
                <button
                  // La resynchronisation des brouillons repart via l'effet
                  // dedicated layer as soon as `isEditing` goes back to false.
                  onClick={() => setIsEditing(false)}
                  className="btn-outline"
                >
                  <X size={16} />
                  {t('common.cancel')}
                </button>
              </>
            ) : (
              canEdit && (
                <>
                  <button onClick={() => setIsEditing(true)} className="btn-outline">
                    <Pencil size={14} />
                    {t('common.edit')}
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(true)}
                    title={t('common.delete')}
                    aria-label={t('common.delete')}
                    className="p-2.5 border border-[var(--border-paper)] rounded-lg text-[var(--text-muted)] hover:text-[var(--danger)] hover:border-[var(--danger-border)] transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                  <ConfirmDialog
                    open={confirmingDelete}
                    onOpenChange={setConfirmingDelete}
                    title={character.name}
                    description={t('character.deleteConfirm')}
                    confirmLabel={t('common.delete')}
                    destructive
                    onConfirm={() => {
                      setConfirmingDelete(false);
                      handleDelete();
                    }}
                  />
                </>
              )
            )}
          </div>
        </motion.div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-3 space-y-6">
            {/* Informations */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              // z-10: `.card-accent-left` sets `isolation: isolate` (to anchor
              // its ripple at z-index:-1), which makes it a stacking context —
              // so the location picker menu, even at z-30, CANNOT escape over
              // the cards that follow. It is the whole card that has to be
              // raised. It overlaps nothing else, and the header is neither
              // sticky nor fixed.
              className="card-paper card-accent-left p-6 relative z-10"
              style={{ '--card-accent': locationColor } as CSSProperties}
            >
              {/* Watermark stamp: the playbook (PC) or the bestiary/entity
                  category (everything else) — Jason Lutes, CC BY 4.0. Overflow
                  clipping lives on this dedicated layer and NOT on the card: an
                  `overflow-hidden` on the card also cut off the location
                  picker's dropdown. */}
              <div className="absolute inset-0 overflow-hidden rounded-[inherit] pointer-events-none">
                {character.type === 'PJ' && watermarkPlaybook && (
                  <StampIcon
                    src={PLAYBOOK_ICONS[watermarkPlaybook]}
                    size={88}
                    className="absolute -top-3 -right-3"
                    style={{ color: 'var(--text-primary)', opacity: 0.08 }}
                  />
                )}
                {character.type !== 'PJ' && (() => {
                  // A discovery's watermark is its SUBTYPE, live from the draft
                  // so changing the dropdown shows immediately — same rule as
                  // watermarkPlaybook. It never falls through to the bestiary
                  // kind: `kind` is meaningless here, and a row that carries
                  // one (restored revision) must not start claiming to be a
                  // monster the moment it is re-typed.
                  if (isDiscovery) {
                    const kind = getDiscoveryKind(isEditing ? draft.roleRest : character.role);
                    return (
                      <StampIcon
                        src={kind ? DISCOVERY_KIND_ICONS[kind] : DISCOVERY_UNFILED_ICON}
                        size={88}
                        className="absolute -top-3 -right-3"
                        style={{ color: 'var(--text-primary)', opacity: 0.08 }}
                      />
                    );
                  }
                  // Tampon LIVE, comme `watermarkPlaybook` : cocher Monstre ou
                  // changing the category must show immediately, not on
                  // prochain enregistrement.
                  const kindIcon = monsterKindIcon(
                    isEditing ? { ...character, kind: draft.kind, statblock: null } : character,
                  );
                  const src = kindIcon
                    ?? (character.type === 'MENACE' ? menaceStamp
                        : character.type === 'PNJ' ? entityCharacterStamp : entityGroupStamp);
                  const color = character.type === 'MENACE' ? 'var(--gm-accent)' : 'var(--text-primary)';
                  return (
                    <StampIcon src={src} size={88} className="absolute -top-3 -right-3"
                      style={{ color, opacity: character.type === 'MENACE' ? 0.1 : 0.08 }} />
                  );
                })()}
              </div>
              <h3 className="label-overline mb-4">{t('character.informations')}</h3>
              {/* Label/control grid: a label column as wide as the longest of
                  them, and a control column with a MEASURE. The labels lose
                  their colons — the alignment does the separating, and a
                  journal is not a formulaire.
                  32rem, not 1fr: with a free column the `flex-1` inputs
                  (occupation, instinct, the discovery pair) stretched to ~920px
                  on a wide card while the selects and chips stayed intrinsic,
                  so the eye went short, short, VERY LONG, short. A single-line
                  field that wide is also hard to read back. Capping gives every
                  control one right edge and makes the short ones read as
                  deliberate. */}
              <div className="grid grid-cols-[max-content_minmax(0,32rem)] gap-x-4 gap-y-2 items-center text-sm font-body">
                {/* Livret (PJ) : menu qui recompose le champ `role` — voir lib/playbooks. */}
                {character.type === 'PJ' && (
                  <FieldRow label={t('character.playbook')} htmlFor="sheet-playbook">
                    {isEditing ? (
                      <select
                        id="sheet-playbook"
                        value={draft.playbook ?? ''}
                        onChange={(e) =>
                          patchDraft({ playbook: (e.target.value || null) as PlaybookKey | null })
                        }
                        className="field-paper text-sm h-8 pl-2.5 w-auto"
                      >
                        <option value="">{t('characterForm.playbookNone')}</option>
                        {PLAYBOOKS.map((p) => (
                          <option key={p.key} value={p.key}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-[var(--text-secondary)]">{playbookName ?? '—'}</span>
                    )}
                  </FieldRow>
                )}
                {/* Type de menace — voir lib/threatTypes.
                    Edit mode only: in read mode the descriptor line under the
                    title already carries it (EntityDescriptor), a row
                    de fiche ferait doublon. */}
                {character.type === 'MENACE' && isEditing && (
                  <FieldRow label={t('character.threatType')} htmlFor="sheet-threat-type">
                    <select
                      id="sheet-threat-type"
                      value={draft.threatType ?? ''}
                      onChange={(e) => patchDraft({ threatType: (e.target.value || null) as ThreatType | null })}
                      className="field-paper text-sm h-8 pl-2.5 w-auto"
                    >
                      <option value="">{t('character.threatTypeNone')}</option>
                      {THREAT_TYPES.map((tt) => (
                        <option key={tt.key} value={tt.key}>{tt.name}</option>
                      ))}
                    </select>
                  </FieldRow>
                )}
                {/* Monstre / Follower : deux classifications de la FICHE, en
                    their own columns — so offered even without a stat block (a
                    follower can have no stats at all). INDEPENDENT by design,
                    not a three-way choice: the book says "treat them as a
                    follower, monster, AND/OR threat", so a beast-
                    follower (a hunting dog, a tamed ratter) must stay
                    expressible. GM-only for writes: the follower toggle is a
                    one-way trip server-side for a
                    joueur (supabase-statblock.sql, ONE-WAY DOOR).

                    A MENACE keeps "Monster" (the bestiary stamp) but NOT
                    "Follower": a follower accompanies the PCs, a threat sheet
                    is GM prep. The server enforces the same rule
                    (app_character_mechanics_open), and that is what stops a
                    revealed threat from publishing its instinct and stat block
                    to the whole table. */}
                {isGm && isEditing && character.type !== 'PJ' && !isDiscovery && (
                  <FieldRow label={t('statblock.monster')}>
                    <span title={t('statblock.monsterHint')} className="inline-flex">
                      <CheckBox
                        checked={monsterLive}
                        label={t('statblock.monster')}
                        onToggle={() => {
                          const next = !monsterLive;
                          // Unticking makes the category neutral — `npc` for an
                          // NPC (kindWithDefault), nothing at all elsewhere.
                          patchDraft({
                            kind: next
                              ? DEFAULT_MONSTER_KIND
                              : (character.type === 'PNJ' ? 'npc' : null),
                          });
                          syncStatblock(next, draft.follower != null);
                        }}
                      />
                    </span>
                  </FieldRow>
                )}
                {/* Bestiary category: the icon selector the GM wants to see
                    ONLY on a monster. No empty option — the checkbox above is
                    the "none". In read mode the category already renders as a
                    watermark stamp. */}
                {isGm && isEditing && monsterLive && (
                  <FieldRow
                    label={
                      character.type === 'MENACE' ? t('statblock.kind') : t('statblock.kindType')
                    }
                    htmlFor="sheet-kind"
                  >
                    <select
                      id="sheet-kind"
                      value={draft.kind ?? ''}
                      onChange={(e) => patchDraft({ kind: (e.target.value || null) as MonsterKind | null })}
                      className="field-paper text-sm h-8 pl-2.5 w-auto"
                    >
                      {kindOptions.map((k) => (
                        <option key={k.key} value={k.key}>
                          {k.name}
                        </option>
                      ))}
                    </select>
                  </FieldRow>
                )}
                {isGm && isEditing && character.type !== 'PJ'
                  && character.type !== 'MENACE' && !isDiscovery && (
                  <FieldRow label={t('statblock.follower')}>
                    <span title={t('statblock.followerHint')} className="inline-flex">
                      <CheckBox
                        checked={draft.follower != null}
                        label={t('statblock.follower')}
                        onToggle={() => {
                          const next = draft.follower == null;
                          patchDraft({ follower: next ? emptyFollower() : null });
                          syncStatblock(monsterLive, next);
                        }}
                      />
                    </span>
                  </FieldRow>
                )}
                {/* Role — playbook/occupation/role-in-the-group, or a
                    DISCOVERY's SUBTYPE. One column read according to the type,
                    which is what `role` already was: a select here rather than
                    free text because the six kinds are the book's chapter
                    and a typo would file the discovery
                    nowhere. NOT for a MENACE: it has none. The value stored on
                    older sheets is never erased (see how draft.roleRest is
                    seeded). */}
                {isDiscovery ? (
                  <FieldRow label={t('character.discoveryKind')} htmlFor="sheet-discovery-kind">
                    {isEditing ? (
                      <select
                        id="sheet-discovery-kind"
                        // A re-typed row can carry another type's role text
                        // ("Blessed · Initiate") — getDiscoveryKind(), not the
                        // raw draft value: a select whose value matches no
                        // option renders blank while state still holds the old
                        // string, the display lie this repo forbids itself.
                        value={getDiscoveryKind(draft.roleRest) ?? draft.roleRest}
                        onChange={(e) => patchDraft({ roleRest: e.target.value })}
                        className="field-paper text-sm h-8 pl-2.5 w-auto"
                      >
                        {/* No "Unfiled" option, by the owner's call
                            (2026-08-21). Unfiled remains a real STORED state —
                            an MCP write or an old row can still carry `role:
                            ''` — and every read path still renders it (the
                            neutral card stamp, the MCP's bare "Discovery"). It
                            is simply no longer something you can choose. An
                            unfiled row arrives here already seeded with the
                            first kind (see seedDraft), so the select never
                            displays a value the draft does not hold. */}
                        {/* The stored value, when it is not one of the seven.
                            Without it the select renders blank while the draft
                            still holds the text, and the first save writes the
                            blank over it. Same contract as
                            `relationTypesForPair`'s `keepId`. */}
                        {getDiscoveryKind(draft.roleRest) === null && (
                          <option value={draft.roleRest}>{draft.roleRest}</option>
                        )}
                        {DISCOVERY_KINDS.map((k) => (
                          <option key={k.id} value={k.id}>{t(k.labelKey as TKey)}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-[var(--text-secondary)]">
                        {(() => {
                          // "Unfiled" (this key) vs. discoveryKindLabel()'s
                          // "Discovery" is deliberate, not an inconsistency to
                          // fix: this is a LABELLED row ("Kind: Unfiled") where
                          // "Unfiled" answers the label, while the card/MCP
                          // brief render an unlabelled noun phrase
                          // ("(Discovery, Stonetop)") where "Discovery" says
                          // what the entry is.
                          const kind = getDiscoveryKind(character.role);
                          return kind
                            ? t(DISCOVERY_KINDS.find((k) => k.id === kind)!.labelKey as TKey)
                            : t('discovery.unfiled');
                        })()}
                      </span>
                    )}
                  </FieldRow>
                ) : character.type !== 'MENACE' ? (
                  <FieldRow
                    label={
                      character.type === 'PJ'
                        ? t('character.background')
                        : character.type === 'PNJ'
                          ? t('character.occupation')
                          : t('character.groupRole')
                    }
                    htmlFor="sheet-background"
                  >
                    {isEditing ? (
                      <input
                        id="sheet-background"
                        type="text"
                        value={draft.roleRest}
                        onChange={(e) => patchDraft({ roleRest: e.target.value })}
                        placeholder={
                          character.type === 'GROUPE'
                            ? t('characterForm.groupRolePlaceholder')
                            : t('character.rolePlaceholder')
                        }
                        className="flex-1 bg-transparent border-b border-[var(--border-field)] focus:border-[var(--border-focus)] focus:outline-none pb-0.5"
                      />
                    ) : (
                      <span className="text-[var(--text-secondary)]">{roleRest || '—'}</span>
                    )}
                  </FieldRow>
                ) : null}

                {/* Memorable traits — chips, inline just under the occupation
                   . Row visible for NPC/GROUP (even empty, in
                    edit mode, so one can be added) or as soon as any sheet
                    (PC/MENACE included) already carries one — nothing is
                    hidden. A DISCOVERY always shows it, relabelled
                    REQUIREMENTS: an arcanum's front carries "the requirements
                    for unlocking its mysteries", and `Trait` is
                    already {label, checked} — the tickable list the book asks
                    for, with no new storage and no new column in either RPC. */}
                {(character.type === 'PNJ' || character.type === 'GROUPE'
                  || isDiscovery || draft.traits.length > 0) && (
                  <FieldRow label={isDiscovery ? t('character.requirements') : t('character.traits')}>
                    {/* `.tag-pill`, the SAME chip as the tags further down: as
                        bare text separated by a `gap`, two multi-word traits
                        ("big and intimidating", "humourless") read as a single
                        sentence — nothing said where one ended. The input field
                        was already a chip, so the row was also mixing two shapes
                        for one and the same thing. */}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                      {draft.traits.map((trait, index) => (
                        <span key={index} className="tag-pill">
                          {isDiscovery && (
                            <CheckBox
                              checked={trait.checked}
                              label={trait.label}
                              onToggle={() => toggleTraitChecked(index)}
                            />
                          )}
                          {trait.label}
                          {isEditing && (
                            <button
                              onClick={() => removeTrait(index)}
                              aria-label={`${t('common.delete')} ${trait.label}`}
                              className="p-2 -my-2 -ml-1 -mr-3 text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"
                            >
                              <X size={10} />
                            </button>
                          )}
                        </span>
                      ))}
                      {!isEditing && draft.traits.length === 0 && (
                        <span className="text-[var(--text-secondary)]">—</span>
                      )}
                      {isEditing && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--border-field)] text-[0.8125rem] transition-[border-color,box-shadow] duration-150 focus-within:border-[var(--border-focus)] focus-within:shadow-[0_0_0_3px_var(--paper-shadow)]">
                          <input
                            value={traitInput}
                            aria-label={isDiscovery ? t('character.requirements') : t('character.traits')}
                            onChange={(e) => setTraitInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addTrait();
                              }
                            }}
                            placeholder={
                              isDiscovery
                                ? t('character.requirementPlaceholder')
                                : t('character.traitPlaceholder')
                            }
                            className="bg-transparent outline-none w-24 text-[0.8125rem] placeholder:text-[var(--text-muted)]"
                          />
                        </span>
                      )}
                    </div>
                  </FieldRow>
                )}
                {/* The per-kind fields. Each row is gated on the DRAFT's kind,
                    not the stored role: choosing "Arcanum" must reveal the tier
                    in the same breath. */}
                {isDiscovery && (() => {
                  const kind = discoveryKind;
                  const block = discoveryDraftBlock;
                  const patchBlock = (key: keyof DiscoveryBlock, value: string) => {
                    const next: Record<string, unknown> = { ...block };
                    // An emptied field DROPS its key. Storing '' would make the
                    // block non-empty forever and put an empty heading on the
                    // card; normalizeDiscovery treats absence as "unset".
                    if (value === '') delete next[key];
                    else next[key] = value;
                    patchDraft({
                      discovery: Object.keys(next).length ? (next as DiscoveryBlock) : null,
                    });
                  };
                  return (
                    <>
                      {kind === 'arcanum' && (
                        <FieldRow label={t('character.tier')} htmlFor="sheet-discovery-tier">
                          {isEditing ? (
                            <select
                              id="sheet-discovery-tier"
                              value={block.tier ?? 'minor'}
                              onChange={(e) => patchBlock('tier', e.target.value)}
                              className="field-paper text-sm h-8 pl-2.5 w-auto"
                            >
                              {/* No "Unset", by the owner's call (2026-08-21).
                                  An absent tier now READS as minor everywhere
                                  — here and on the card — so the two agree and
                                  nothing displays a value the data denies. */}
                              {DISCOVERY_TIERS.map((tier) => (
                                <option key={tier} value={tier}>{t(`character.tier_${tier}` as TKey)}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-[var(--text-secondary)]">
                              {t(`character.tier_${block.tier ?? 'minor'}` as TKey)}
                            </span>
                          )}
                        </FieldRow>
                      )}

                      {/* The Know Things / Seek Insight pair (
                          435). GM-only in the UI because it is GM-only in the
                          data: app_character_row_for_role strips both keys
                          before a player's browser sees them, and a field that
                          rendered always-empty would advertise that the data
                          exists (same rule as instinct on a non-follower). */}
                      {isGm && (kind === 'clue' || kind === 'artifact') && (
                        <>
                          <FieldRow label={t('character.interesting')} htmlFor="sheet-discovery-interesting">
                            {isEditing ? (
                              <input
                                id="sheet-discovery-interesting"
                                type="text"
                                value={block.interesting ?? ''}
                                onChange={(e) => patchBlock('interesting', e.target.value)}
                                placeholder={t('character.interestingPlaceholder')}
                                className="flex-1 bg-transparent border-b border-[var(--border-field)] focus:border-[var(--border-focus)] focus:outline-none pb-0.5"
                              />
                            ) : (
                              <span className="text-[var(--text-secondary)]">{block.interesting || '—'}</span>
                            )}
                          </FieldRow>
                          <FieldRow label={t('character.useful')} htmlFor="sheet-discovery-useful">
                            {isEditing ? (
                              <input
                                id="sheet-discovery-useful"
                                type="text"
                                value={block.useful ?? ''}
                                onChange={(e) => patchBlock('useful', e.target.value)}
                                placeholder={t('character.usefulPlaceholder')}
                                className="flex-1 bg-transparent border-b border-[var(--border-field)] focus:border-[var(--border-focus)] focus:outline-none pb-0.5"
                              />
                            ) : (
                              <span className="text-[var(--text-secondary)]">{block.useful || '—'}</span>
                            )}
                          </FieldRow>
                        </>
                      )}

                    </>
                  );
                })()}
                {/* Instinct: the column, falling back to threat.instinct on read
                    via instinctOf — see lib/instinct. A player only sees this
                    field on a PC or a follower; for an ordinary non-follower
                    NPC/GROUP/MENACE it stays hidden (including on a revealed
                    threat) — the server already ignores those player writes
                    (task 3), and a field that is visible but inert would reveal
                    that the data exists. */}

                {(isGm || playerVisible) && !isDiscovery && (
                  <FieldRow label={t('character.instinct')} htmlFor="sheet-instinct">
                    {/* The GM had no way to know that THIS row is reserved to
                        them while the rest of the card is public: a chip as soon
                        as it is, and it clears live when the Follower checkbox
                        flips (followerLive). */}
                    {isGm && !playerVisible && (
                      <span title={t('character.instinctGmOnlyHint')} className="shrink-0">
                        <GmBadge />
                      </span>
                    )}
                    {isEditing ? (
                      <>
                        <span className="text-[var(--text-muted)] italic">{t('character.instinctPrefix')}</span>
                        <input
                          id="sheet-instinct"
                          type="text"
                          value={draft.instinct}
                          onChange={(e) => patchDraft({ instinct: e.target.value })}
                          className="flex-1 bg-transparent border-b border-[var(--border-field)] focus:border-[var(--border-focus)] focus:outline-none pb-0.5"
                        />
                      </>
                    ) : (
                      <span className="text-[var(--text-secondary)]">
                        {instinctOf(character) ? `${t('character.instinctPrefix')} ${instinctOf(character)}` : '—'}
                      </span>
                    )}
                  </FieldRow>
                )}

                <FieldRow label={t('character.location')}>
                  {isEditing ? (
                    <div className="flex-1">
                      <LocationPicker
                        spaceId={session?.space.id}
                        value={draft.location}
                        onChange={(location) => patchDraft({ location })}
                        compact
                      />
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                      <MapPin size={12} style={{ color: locationColor }} />
                      {characterLocation ? (
                        <button
                          type="button"
                          onClick={() => navigate(`/location/${characterLocation.id}`)}
                          className="hover:underline underline-offset-2"
                        >
                          {locationName}
                        </button>
                      ) : (
                        locationName || '—'
                      )}
                    </span>
                  )}
                </FieldRow>

                {/* Tags — their home is the stat block (they are game
                    stats). This fallback is for sheets that have NO
                    block: the MCP creates followers with no stats and a restored
                    revision resurrects them, and without it their tags would
                    have nowhere left to be edited. The two never coexist — the
                    `!draft.statblock` is exclusive. */}
                {isEditing && tagsLive && !draft.statblock && (
                  <FieldRow label={t('character.tags')}>
                    <TagEditor value={draft.tags} onChange={(tags) => patchDraft({ tags })} />
                  </FieldRow>
                )}

                {/* Left play — deceased (PC/NPC) or disbanded (GROUP). ONE
                    column read according to the type, like `role`: the chip's
                    label follows the type, the data is the same.

                    Not on a MENACE: its end is already told by its portents and
                    its impending doom, and the card's chip exists precisely to
                    show them. Not GM-only either — that an NPC is dead is a
                    campaign fact, and it is often a player who notes it after
                    the session (the server does not gate it, cf.
                    supabase-deceased.sql).

                    Nothing here outside edit mode: the chip beside the name
                    already says it, as for gm_only.

                    The sheet's two STATE toggles (left play, GM only) share a
                    row under the grid: they do not qualify the entry the way the
                    fields above do, they say what is being done with it.
                    `col-span-2` so they are not clipped by the label column, and
                    a real `gap-x-6` — pressed together they read as
                    "Deceased GM only" in one breath. */}

                {isEditing && (character.type !== 'MENACE' || isGm) && (
                  <div className="col-span-2 flex flex-wrap items-center gap-x-6 gap-y-2 pt-2">
                    {character.type !== 'MENACE' && !isDiscovery && (
                      <label
                        className="inline-flex items-center gap-2 cursor-pointer select-none"
                        title={t('character.deadHint')}
                      >
                        <CheckBox
                          checked={draft.dead}
                          label={deadLabel}
                          onToggle={() => setDraft((d) => ({ ...d, dead: !d.dead }))}
                        />
                        <span className="font-semibold text-[var(--text-primary)]">{deadLabel}</span>
                      </label>
                    )}
                    {isGm && (
                      <label
                        className="inline-flex items-center gap-2 cursor-pointer select-none"
                        title={t('gm.onlyHint')}
                      >
                        <CheckBox
                          checked={draft.gmOnly}
                          label={t('gm.onlyLabel')}
                          accent="var(--gm-accent)"
                          onToggle={() => setDraft((d) => ({ ...d, gmOnly: !d.gmOnly }))}
                        />
                        <span className="font-semibold text-[var(--text-primary)]">
                          {t('gm.onlyLabel')}
                        </span>
                      </label>
                    )}
                  </div>
                )}
              </div>

              {/* Moves — a SUBSECTION under the grid, not a row inside it.
                  It used to be a `col-span-2` block wedged between "Something
                  useful" and "Location", which put its overline at the label
                  column's x (reading as a heading that had fallen into a data
                  row) and split the generic spine — Location, Tags, GM only —
                  away from the type-specific fields above it. Below the grid it
                  is what it actually is: a second section of this card, its
                  overline aligned with INFORMATION at the card's left edge. */}
              {isEditing && isDiscovery
                && (discoveryKind === 'artifact' || discoveryKind === 'arcanum') && (
                <div className="mt-6 pt-5 border-t border-[var(--border-subtle)] space-y-6">
                  <MovesEditor
                    value={discoveryDraftBlock.moves ?? []}
                    onChange={(moves) => {
                      const next: DiscoveryBlock = { ...discoveryDraftBlock };
                      // Same rule as the text fields: an emptied list drops its
                      // key, and an emptied block becomes null.
                      if (moves.length === 0) delete next.moves;
                      else next.moves = moves;
                      patchDiscoveryBlock(next);
                    }}
                    label={t('character.moves')}
                    addLabel={t('character.addMove')}
                  />
                  {/* Beside Moves, not inside it: a track's SHAPE (label, max)
                      is set here; its STATE (marked) is not — that pip strip
                      only exists on the read-mode card, where marking one
                      saves immediately (see `markTrack`). Editing the shape
                      mid-session is rare enough that it can wait for Save. */}
                  <TracksEditor
                    value={discoveryDraftBlock.tracks ?? []}
                    onChange={(tracks) => {
                      const next: DiscoveryBlock = { ...discoveryDraftBlock };
                      if (tracks.length === 0) delete next.tracks;
                      else next.tracks = tracks;
                      patchDiscoveryBlock(next);
                    }}
                  />
                  {/* The back's moves — an arcanum only, an artifact has no
                      second face to fill. Beside the front's MovesEditor, not
                      inside it: the two lists are independent arrays with
                      independent existence conditions. */}
                  {discoveryKind === 'arcanum' && (
                    <MovesEditor
                      value={discoveryDraftBlock.mysteries ?? []}
                      onChange={(mysteries) => {
                        const next: DiscoveryBlock = { ...discoveryDraftBlock };
                        if (mysteries.length === 0) delete next.mysteries;
                        else next.mysteries = mysteries;
                        patchDiscoveryBlock(next);
                      }}
                      label={t('character.mysteries')}
                      addLabel={t('character.addMystery')}
                      showGained
                    />
                  )}
                  {/* The back's own consequences — an arcanum only, same
                      existence condition as its mysteries just above: an
                      artifact has no back face to exact a price from. A
                      SEPARATE array from `traits`/requirements (an arcanum has
                      both) that happens to share `Trait`'s {label, checked}
                      shape, so the row reuses that chip-and-input markup
                      verbatim. Only the SHAPE (the label) is set here — the
                      STATE (checked) is not: ticking one is play, and lives on
                      the read-mode card instead (`ArcanumCard` +
                      `toggleConsequence`), where it saves immediately. */}
                  {discoveryKind === 'arcanum' && (
                    <div className="space-y-1.5">
                      <span className="label-overline block">{t('character.consequences')}</span>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                        {(discoveryDraftBlock.consequences ?? []).map((cons, index) => (
                          <span key={index} className="tag-pill">
                            {cons.label}
                            <button
                              onClick={() => patchConsequences(
                                (discoveryDraftBlock.consequences ?? []).filter((_, i) => i !== index),
                              )}
                              aria-label={`${t('common.delete')} ${cons.label}`}
                              className="p-2 -my-2 -ml-1 -mr-3 text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"
                            >
                              <X size={10} />
                            </button>
                          </span>
                        ))}
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--border-field)] text-[0.8125rem] transition-[border-color,box-shadow] duration-150 focus-within:border-[var(--border-focus)] focus-within:shadow-[0_0_0_3px_var(--paper-shadow)]">
                          <input
                            value={consequenceInput}
                            aria-label={t('character.consequences')}
                            onChange={(e) => setConsequenceInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key !== 'Enter') return;
                              e.preventDefault();
                              const label = consequenceInput.trim();
                              const existing = discoveryDraftBlock.consequences ?? [];
                              // Same dedupe as `addTrait`, the row this one
                              // reuses verbatim: two consequences sharing a
                              // label would also share a CheckBox's
                              // accessible name (it's the label alone).
                              if (!label || existing.some((c) => c.label === label)) return;
                              patchConsequences([...existing, { label, checked: false }]);
                              setConsequenceInput('');
                            }}
                            placeholder={t('character.consequencePlaceholder')}
                            className="bg-transparent outline-none w-24 text-[0.8125rem] placeholder:text-[var(--text-muted)]"
                          />
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Maps this sheet is pinned on — hidden if none. */}
              <PinnedOnMaps characterId={character.id} label={t('maps.pinnedOn')} />

              {/* No "TAGS" section here any more: they are game stats, so
                  they joined the stat block in edit mode — same
                  existence condition (monster or follower) — and the descriptor
                  line under the name in read mode, where a threat already shows
                  its type. A section of their own made them a third category
                  beside the traits, when they describe the creature just as its
                  HP do. `draft.tags` still makes the round trip on save. */}

              {/* Backlinks: chronicle seasons citing this character */}
              <ChronicleBacklinks
                spaceId={session?.space.id}
                mentionId={character ? characterMentionId(character.id) : ''}
              />
            </motion.div>

            {/* Threat sheet (MENACE) — revelation semantics: visible to anyone
                who can see the character; checkboxes live outside edit mode for
                the roles allowed to modify (gm/player), frozen in read mode for
                spectators (viewer). */}
            {character.type === 'MENACE' && draft.threat && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <ThreatSheetCard
                  gmNotes={{ value: draft.gmNotes, onChange: (gmNotes: string) => patchDraft({ gmNotes }), mentionItems }}
                  value={draft.threat}
                  onChange={(next) => {
                    patchDraft({ threat: next });
                    // Outside edit mode a portent/doom tick saves right away —
                    // it is play, not a change to the sheet.
                    if (!isEditing && id) {
                      updateCharacter(id, { threat: next }).catch((err) => {
                        console.error('Error saving threat tick:', err);
                        showToast(t('common.saveError'));
                      });
                    }
                  }}
                  editable={isEditing}
                />
              </motion.div>
            )}

            {/* Notes */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              // The card brings its own paper faces: keeping `card-paper`
              // here would frame paper with paper.
              className={discoveryCard ? '' : 'card-paper p-6'}
            >
              {discoveryCard ? (
                <ArcanumCard
                  name={character.name}
                  kind={discoveryCard}
                  // `discoveryCard` is exactly `tagsApply`'s discovery door
                  // (artifact | arcanum), so the tags are live by construction.
                  tags={draft.tags}
                  block={draft.discovery ?? {}}
                  // From the DRAFT: ticking a requirement on the identity card
                  // above saves immediately and must show on the card at once.
                  requirements={draft.traits}
                  notesHtml={draft.notes}
                  stamp={DISCOVERY_KIND_ICONS[discoveryCard]}
                  onTrackChange={markTrack}
                  onToggleConsequence={toggleConsequence}
                />
              ) : (
                <>
                  <h3 className="label-overline mb-4">{t('character.notes')}</h3>
                  <RichText
                    content={draft.notes}
                    onChange={(notes) => patchDraft({ notes })}
                    editable={canEdit && isEditing}
                    mentionItems={mentionItems}
                  />
                </>
              )}
            </motion.div>

            {/* GM notes — the card hides itself for a non-GM; we avoid
                leaving an empty container here to eat into the space-y. For a
                MENACE they live in the threat card (a single plum card), not
                here. */}
            {isGm && character.type !== 'MENACE' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <GmNotesCard
                  value={draft.gmNotes}
                  onChange={(gmNotes) => patchDraft({ gmNotes })}
                  editable={canEdit && isEditing}
                  mentionItems={mentionItems}
                />
              </motion.div>
            )}
          </div>

          {/* Right column — the stats live here, above the links: this is the
              quick-reference column (who is this, what do they look like in a
              fight, who do they know), not the prose column. On mobile the grid
              falls back to one column, so this stack comes AFTER the notes. */}
          <div className="lg:col-span-2 space-y-6">
            {/* Stat block (NPC/GROUP/MENACE) — for a player the server has
                already nulled `statblock` on sheets they may not see, so keying
                on a non-null draft.statblock is sufficient by construction (no
                extra role guard here). */}
            {character.type !== 'PJ' && !isDiscovery && draft.statblock && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <StatBlockCard
                  value={draft.statblock}
                  editable={isEditing}
                  isFollower={followerLive}
                  onChange={(statblock) => patchDraft({ statblock })}
                  // Same condition as the block's own existence (monster or
                  // follower) — cf. tagsLive/syncStatblock.
                  tags={tagsLive ? { value: draft.tags, onChange: (tags: string[]) => patchDraft({ tags }) } : undefined}
                />
              </motion.div>
            )}

            {/* Follower — a card separate from the stat block: followerhood
                does not depend on stats. No role guard: the server never nulls
                `follower` (it is what makes the sheet public), so its presence
                is already the right condition. We key on `draft.follower` and
                NOT on `character.follower`: the first is seeded via isFollower
                (so never set on a MENACE, even if the row still carries a
                block), the second is the raw shape db.ts hoists for every
                type. */}
            {draft.follower && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <FollowerCard
                  value={draft.follower}
                  editable={isEditing}
                  leaderOptions={characters
                    .filter((c) => c.type === 'PJ')
                    .map((c) => ({ id: c.id, name: c.name }))}
                  onChange={(next) => {
                    patchDraft({ follower: next });
                    // Outside edit mode a loyalty tick saves right away — it is
                    // play, not a change to the sheet (same semantics as the
                    // threat sheet above). `next` is never a blind null here
                    // (derived from `value`, necessarily non-null for the card
                    // to be mounted) — the race with a concurrent realtime write
                    // (snap-back) is accepted, as for the threat.

                    if (!isEditing && id) {
                      updateCharacter(id, { follower: next }).catch((err) => {
                        console.error('Error saving loyalty tick:', err);
                        showToast(t('common.saveError'));
                      });
                    }
                  }}
                />
              </motion.div>
            )}

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="card-paper p-6 sticky top-6"
            >
              {character.type === 'GROUPE' && (
                <MembersList
                  groupId={character.id}
                  characters={characters}
                  relations={relations}
                />
              )}
              {/* The promoted slot: on a discovery always (it can add), and on
                  any sheet a promoted relation points AT — an NPC who is a
                  clue's revelation reads "Clues pointing here" without being a
                  discovery itself. */}
              {(isDiscovery || promoted.incoming.has(character.id)) && (
                <PromotedRelationsList
                  characterId={character.id}
                  characters={characters}
                  relations={relations}
                />
              )}
              <RelationsList
                characterId={character.id}
                characters={characters}
                relations={relations}
                excludeRelationIds={promotedRelationIds}
              />
            </motion.div>
          </div>
        </div>

      </main>

      <Toast />
    </div>
  );
}

function FieldRow({
  label,
  htmlFor,
  children,
}: {
  label: string;
  /**
   * Id of the edit field to associate. Without it the label stays a <span> —
   * reserved for composite children (LocationPicker) that a <label> cannot
   * point at; any child with a single control must supply it, otherwise the
   * field has no accessible name.
   */
  htmlFor?: string;
  children: React.ReactNode;
}) {
  // `contents`: the row makes no box of its own, its two children fall
  // straight into the parent's grid. That is what puts ALL the controls on a
  // single column — with `flex` per row, each one started where its own label
  // ended and the card went down a staircase ("Type", "Role", "Instinct",
  // "Location" all began at a different x).
  const labelCls = 'font-semibold text-[var(--text-primary)] py-1';
  return (
    <div className="contents">
      {htmlFor ? (
        <label htmlFor={htmlFor} className={labelCls}>
          {label}
        </label>
      ) : (
        <span className={labelCls}>{label}</span>
      )}
      <div className="flex items-center gap-2 min-w-0">{children}</div>
    </div>
  );
}

/**
 * Ink checkbox for the Information card — three classifications share it
 * (Monster, Follower, GM only), hence the extraction. `aria-pressed` rather
 * than a real checkbox: it is the pattern already in place, and the tests
 * ciblent `getByRole('button', { name })`.
 *
 * Exported so `MovesEditor` can reuse it for the back's `gained` checkbox
 * instead of copying it — two ink checkboxes drifting apart is exactly what
 * this doc comment exists to warn against.
 */
export function CheckBox({
  checked,
  onToggle,
  label,
  accent = 'var(--accent-primary)',
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  accent?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      aria-label={label}
      className="w-4 h-4 rounded-sm border flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer"
      style={
        checked
          ? { backgroundColor: accent, borderColor: accent }
          : { borderColor: 'var(--border-paper)' }
      }
    >
      {checked && <Check size={10} className="text-[var(--text-inverse)]" strokeWidth={3} />}
    </button>
  );
}

/**
 * Edit-mode list editor for an arcanum/artifact's tracks — the Red Scepter's
 * charges (max 3) or its progress row (max 4). Sibling of
 * MovesEditor: a label input, a max input, and a remove button, nothing more.
 * The PIPS themselves are not editable here — this sets the shape (label,
 * max), not the state (marked); marking one is play, and lives on the
 * read-mode card instead (`ArcanumCard` + `markTrack`), where it saves
 * immediately.
 */
function TracksEditor({
  value,
  onChange,
}: {
  value: ArcTrack[];
  onChange: (tracks: ArcTrack[]) => void;
}) {
  const t = useT();

  const patch = (index: number, key: 'label' | 'max', raw: string) => {
    const tracks = value.map((tr, i) => {
      if (i !== index) return tr;
      if (key === 'label') return { ...tr, label: raw };
      return { ...tr, max: Math.max(0, Math.round(Number(raw)) || 0) };
    });
    onChange(tracks);
  };

  return (
    <div className="space-y-3">
      <span className="label-overline block">{t('character.tracks')}</span>

      {value.map((track, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            value={track.label}
            onChange={(e) => patch(index, 'label', e.target.value)}
            placeholder={t('character.trackLabelPlaceholder')}
            aria-label={`${t('character.trackLabel')} ${index + 1}`}
            className="field-paper text-sm flex-1"
          />
          <input
            type="number"
            min={0}
            value={track.max}
            onChange={(e) => patch(index, 'max', e.target.value)}
            aria-label={`${t('character.trackMax')} ${index + 1}`}
            className="field-paper text-sm w-20"
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
            // Same fallback-name shape as MovesEditor's delete button: a fresh,
            // unlabelled row must not read as a bare "Delete".
            aria-label={`${t('common.delete')} ${track.label || t('character.trackFallbackName')}`}
            className="w-7 h-7 rounded-full bg-[var(--bg-card)] border border-[var(--border-paper)] text-[var(--text-muted)] hover:text-[var(--danger)] hover:border-[var(--danger-border)] flex items-center justify-center flex-shrink-0"
          >
            <X size={12} />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...value, { label: '', max: 0, marked: 0 }])}
        className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors font-body"
      >
        <Plus size={14} />
        {t('character.addTrack')}
      </button>
    </div>
  );
}