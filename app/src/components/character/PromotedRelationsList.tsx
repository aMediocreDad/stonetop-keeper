import { useMemo, useState } from 'react';
import { ArrowUpRight, Plus, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useAppStore } from '@/stores/appStore';
import { useRelations } from '@/hooks/useRelations';
import { useCharacters } from '@/hooks/useCharacters';
import { useCanEdit } from '@/hooks/useRole';
import { getDiscoveryKind } from '@/lib/character/discoveryKinds';
import {
  promotedConfigFor,
  resolvePromotedRelations,
  type PromotedGroup,
} from '@/lib/character/promotedRelations';
import { byName, compareNames } from '@/lib/sortByName';
import { useT, type TKey } from '@/i18n';
import type { Character, Relation } from '@/types';

const sortIds = (ids: readonly string[], by: Map<string, Character>) =>
  [...ids].sort((a, b) => compareNames(by.get(a)?.name ?? '', by.get(b)?.name ?? ''));

interface PromotedRelationsListProps {
  characterId: string;
  characters: Character[];
  relations: Relation[];
}

/**
 * The promoted relation lists on a sheet — the discovery counterpart of
 * `MembersList`, and deliberately the same shape: dedicated lists above the
 * generic bonds, which exclude these relations to avoid the duplicate.
 *
 * Each discovery KIND promotes one relation, and the two ends read it
 * differently (see lib/character/promotedRelations):
 *
 *  - OUTGOING — at most one section, the sheet's own kind's, and the only
 *    editable one. Only a DISCOVERY has one, since the `from` end is what
 *    makes the relation promoted. A revelation has none at all: it is
 *    receive-only.
 *  - INCOMING — read-only, and there may be SEVERAL. One NPC can be a clue's
 *    revelation, hold an artifact and be an encounter's subject at once, each
 *    under its own heading. You add from the source, where the direction is
 *    unambiguous; an "add" here would have to invert the row it creates, and
 *    the group roster's history says that is where this kind of list becomes
 *    confusing.
 *
 * HEADINGS COME OFF `group.groupKey`, NEVER off `group.config`. An incoming
 * group merges every kind that shares its heading, and its `config` is
 * whichever of them was seen first — reading `type` or `cap` off it is a lie
 * waiting for the second kind. `cap` is only ever meaningful for the sheet's
 * OWN outgoing config.
 */
export function PromotedRelationsList({
  characterId,
  characters,
  relations,
}: PromotedRelationsListProps) {
  const t = useT();
  const navigate = useNavigate();
  const canEdit = useCanEdit();
  const session = useAppStore((s) => s.session);
  const showToast = useAppStore((s) => s.showToast);
  const { createRelation, deleteRelation } = useRelations(session?.space.id);
  const { createCharacter } = useCharacters(session?.space.id);

  const [showAdd, setShowAdd] = useState(false);
  const [selectedChar, setSelectedChar] = useState('');
  const [newRevelation, setNewRevelation] = useState('');
  const [pendingRemove, setPendingRemove] = useState<{ relation: Relation; name: string } | null>(
    null,
  );

  // Memoised for the same reason MembersList is: the resolver walks the whole
  // space, and this ran on every render (so on every keystroke and every toast
  // elsewhere). The realtime refetches preserve array identity, so it holds.
  const { outgoing, incoming, promotedRelationIds, charById } = useMemo(() => {
    const resolved = resolvePromotedRelations(characters, relations);
    return { ...resolved, charById: new Map(characters.map((c) => [c.id, c])) };
  }, [characters, relations]);

  const self = charById.get(characterId);
  const isDiscovery = self?.type === 'DISCOVERY';
  // The sheet's OWN config decides its outgoing slot — and it is the only
  // config whose `cap` means anything here.
  const config = promotedConfigFor(self?.role);
  const isClue = getDiscoveryKind(self?.role) === 'clue';

  // Both `.get()`s happen INSIDE their memo: done in the component body,
  // `map.get(id) ?? []` mints a new array every render and defeats the memo
  // that depends on it. `sortIds` lives at module scope for the mirror-image
  // reason — a helper declared in the component body is a new identity every
  // render, so exhaustive-deps would want it in both dependency arrays and
  // neither memo would ever hold.
  const outIds = useMemo(
    () => sortIds(outgoing.get(characterId)?.[0]?.otherIds ?? [], charById),
    [outgoing, charById, characterId],
  );
  const inGroups = useMemo<PromotedGroup[]>(
    () =>
      (incoming.get(characterId) ?? []).map((g) => ({
        ...g,
        otherIds: sortIds(g.otherIds, charById),
      })),
    [incoming, charById, characterId],
  );

  /** The relation behind one outgoing row, so it can be removed. Direction is
   *  fixed here — a promoted relation is only ever stored from the discovery
   *  outwards. */
  const promotedRelation = (targetId: string) =>
    relations.find(
      (r) =>
        promotedRelationIds.has(r.id) &&
        r.from_character_id === characterId &&
        r.to_character_id === targetId,
    );

  // Same constraint as RelationsList and MembersList: one relation per pair.
  const availableChars = useMemo(() => {
    const linked = new Set<string>();
    for (const r of relations) {
      if (r.from_character_id === characterId) linked.add(r.to_character_id);
      else if (r.to_character_id === characterId) linked.add(r.from_character_id);
    }
    return characters.filter((c) => c.id !== characterId && !linked.has(c.id)).sort(byName);
  }, [characters, relations, characterId]);

  const handleAdd = async () => {
    if (!selectedChar || !session) return;
    try {
      await createRelation({
        space_id: session.space.id,
        from_character_id: characterId, // the discovery is always the `from`
        to_character_id: selectedChar,
        relation_type: config.type,
        gm_only: false,
      });
      setShowAdd(false);
      setSelectedChar('');
    } catch (err) {
      console.error(err);
      showToast(t('common.saveError'));
    }
  };

  const handleAddNewRevelation = async () => {
    const name = newRevelation.trim();
    if (!name || !session) return;
    try {
      const created = await createCharacter({
        space_id: session.space.id,
        name,
        type: 'DISCOVERY',
        role: 'revelation',
        gm_only: true,
        instinct: '',
        notes: '',
        traits: [],
        tags: [],
        dead: false,
      });
      await createRelation({
        space_id: session.space.id,
        from_character_id: characterId,
        to_character_id: created.id,
        relation_type: config.type,
        gm_only: false,
      });
      setNewRevelation('');
      setShowAdd(false);
    } catch (err) {
      console.error(err);
      showToast(t('common.saveError'));
    }
  };

  const stampRow = (id: string, onRemove?: () => void) => {
    const target = charById.get(id);
    if (!target) return null;
    return (
      <article key={id} className="relative group">
        <button
          onClick={() => navigate(`/character/${id}`)}
          className="relation-stamp w-full"
          title={target.name}
        >
          <div className="min-w-0 text-left pl-1">
            <div className="stamp-name truncate">{target.name}</div>
            {target.role && <div className="stamp-sub truncate">{target.role}</div>}
          </div>
          <ArrowUpRight size={20} className="stamp-arrow" />
        </button>
        {onRemove && canEdit && (
          <div className="absolute -top-2 -right-2 flex gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="w-7 h-7 rounded-full bg-[var(--bg-card)] border border-[var(--border-paper)] text-[var(--text-muted)] hover:text-[var(--danger)] hover:border-[var(--danger-border)] flex items-center justify-center"
              // The ARIA name carries the TARGET, the tooltip does not.
              // LEADS and ENCOUNTER_WITH both have `cap: Infinity`, so a site
              // with two leads rendered two buttons with one accessible name
              // and a screen-reader user could not tell which link they were
              // about to cut — hence `${verb} ${noun}`, the same shape as
              // every other icon-only X in the app (TagEditor, StatBlockCard,
              // MovesEditor). The `title` stays generic on purpose, and not to
              // spare a test: `title={target.name}` on the stamp above is the
              // ROW'S IDENTITY MARKER, and exactly one element per row may
              // claim it. A mouse user hovering this X can already see which
              // row it sits on, so a second title echoing the name buys
              // nothing and costs the invariant. (The sheet's dedup assertions
              // count titles mentioning a target to prove one row appears in
              // exactly one place; they are downstream of that rule, not the
              // reason for it.)
              title={t('character.removePromoted')}
              aria-label={`${t('character.removePromoted')} ${target.name}`}
            >
              <X size={12} />
            </button>
          </div>
        )}
      </article>
    );
  };

  return (
    <>
      {isDiscovery && config.outgoing && (
        <section className="mb-6">
          <h3 className="label-overline mb-4">{t(config.outgoingKey as TKey)}</h3>

          {outIds.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] font-body mb-4">
              {t(config.emptyKey as TKey)}
            </p>
          ) : (
            <div className="space-y-3 mb-4">
              {outIds.map((id) =>
                stampRow(id, () => {
                  const rel = promotedRelation(id);
                  const name = charById.get(id)?.name ?? '';
                  if (rel) setPendingRemove({ relation: rel, name });
                }),
              )}
            </div>
          )}

          {/* The cap gates the ADD CONTROL alone. Rows already stored above it
              still render — see promotedRelations: hiding one would be a
              display lie, and a concurrent client or an MCP write can make it
              happen. */}
          {canEdit &&
            outIds.length < config.cap &&
            (showAdd ? (
              <div className="space-y-3 p-4 card-paper">
                <select
                  value={selectedChar}
                  aria-label={t('character.pickPromoted')}
                  onChange={(e) => setSelectedChar(e.target.value)}
                  className="field-paper text-sm"
                >
                  <option value="">{t('character.pickPromoted')}</option>
                  {availableChars.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.role ? `· ${c.role}` : ''}
                    </option>
                  ))}
                </select>
                {/* A clue cannot point anywhere until its revelation exists, and
                    making one through the dashboard is two round trips away from
                    the sheet you are writing. `gm_only: true` matches what
                    CharacterForm already does for every discovery. */}
                {isClue && (
                  <div className="flex gap-2">
                    <input
                      value={newRevelation}
                      onChange={(e) => setNewRevelation(e.target.value)}
                      placeholder={t('character.newRevelationName')}
                      // Named for what it COLLECTS, matching its visible
                      // placeholder. Naming it after the button beside it gave
                      // two adjacent controls one name.
                      aria-label={t('character.newRevelationName')}
                      className="field-paper text-sm flex-1"
                    />
                    <button
                      onClick={handleAddNewRevelation}
                      disabled={newRevelation.trim() === ''}
                      className="btn-outline disabled:opacity-40"
                    >
                      {t('character.newRevelation')}
                    </button>
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleAdd}
                    disabled={!selectedChar}
                    className="btn-ink flex-1 disabled:opacity-40"
                  >
                    {t('common.add')}
                  </button>
                  <button onClick={() => setShowAdd(false)} className="btn-outline">
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAdd(true)}
                // An empty picker no longer means an empty panel: on a clue the
                // panel also CREATES the revelation, which is exactly the
                // first-run case (a clue alone in a space) that has nothing to
                // pick.
                disabled={availableChars.length === 0 && !isClue}
                // The heading is in the name because "Add" alone is ambiguous
                // once several sections can sit on one sheet — and the visible
                // label leads it, so the accessible name CONTAINS the visible
                // text (WCAG 2.5.3 Label in Name).
                aria-label={`${t('character.addPromoted')} · ${t(config.outgoingKey as TKey)}`}
                className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors font-body disabled:opacity-40"
              >
                <Plus size={14} />
                {t('character.addPromoted')}
              </button>
            ))}
        </section>
      )}

      {/* `groupKey`, not `config`: two incoming groups can share a relation
          type (a clue's and a site's are both `leads-to`) and would collide on
          the React key while both rendering the first one's heading. */}
      {inGroups.map((g) => (
        <section key={g.groupKey} className="mb-6">
          <h3 className="label-overline mb-4">{t(g.groupKey as TKey)}</h3>
          <div className="space-y-3 mb-4">{g.otherIds.map((id) => stampRow(id))}</div>
        </section>
      ))}

      {/* A revelation with nothing pointing at it is the one prep gap worth
          saying out loud: the book asks for "at least one clue, ideally two or
          three". Said once, in the reading voice, as an empty
          state — NOT as a "1 of 3" meter, which would put a progress bar over
          someone's prep. */}
      {isDiscovery && !config.outgoing && inGroups.length === 0 && (
        <section className="mb-6">
          <h3 className="label-overline mb-4">{t(config.incomingKey as TKey)}</h3>
          <p className="text-sm text-[var(--text-muted)] font-body">{t('character.noCluesHere')}</p>
        </section>
      )}

      <ConfirmDialog
        open={!!pendingRemove}
        onOpenChange={(open) => !open && setPendingRemove(null)}
        title={pendingRemove?.name ?? ''}
        description={t('character.removePromotedConfirm')}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={() => {
          if (pendingRemove) {
            deleteRelation(pendingRemove.relation.id).catch((err) => {
              console.error(err);
              showToast(t('common.saveError'));
            });
          }
          setPendingRemove(null);
        }}
      />
    </>
  );
}
