import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowUpRight, Plus, X, Pencil, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useAppStore } from '@/stores/appStore';
import { useRelations } from '@/hooks/useRelations';
import { useCanEdit, useIsGm } from '@/hooks/useRole';
import { RELATION_TYPES, getRelationType, relationTypesForPair } from '@/lib/constants';
import { byName, compareNames } from '@/lib/sortByName';
import { useT } from '@/i18n';
import { GmBadge } from '@/components/shared/GmBadge';
import { changedKeys } from '@/lib/patch';
import type { Character, Relation } from '@/types';

/** Rang d'un type de relation dans RELATION_TYPES (inconnus en fin). */
const RELATION_TYPE_RANK = new Map(RELATION_TYPES.map((rt, i) => [rt.id, i]));
const relationRank = (id: string) => RELATION_TYPE_RANK.get(id) ?? RELATION_TYPES.length;

interface RelationsListProps {
  characterId: string;
  characters: Character[];
  relations: Relation[];
  /** Relations à ne pas lister ici (ex. appartenances résolues d'une
   *  fiche groupe : le roster Membres les affiche déjà). */
  excludeRelationIds?: ReadonlySet<string>;
}

export function RelationsList({
  characterId,
  characters,
  relations,
  excludeRelationIds,
}: RelationsListProps) {
  const t = useT();
  const navigate = useNavigate();
  const canEdit = useCanEdit();
  const isGm = useIsGm();
  const session = useAppStore((s) => s.session);
  const showToast = useAppStore((s) => s.showToast);
  const { createRelation, updateRelation, deleteRelation } = useRelations(
    session?.space.id
  );

  const [showAdd, setShowAdd] = useState(false);
  const [selectedChar, setSelectedChar] = useState('');
  const [selectedTypeId, setSelectedTypeId] = useState<string>(RELATION_TYPES[0].id);
  const [detail, setDetail] = useState('');
  const [gmOnly, setGmOnly] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTypeId, setEditTypeId] = useState<string>(RELATION_TYPES[0].id);
  const [editDetail, setEditDetail] = useState('');
  const [editGmOnly, setEditGmOnly] = useState(false);
  // The bond the edit fields were seeded from, so the save writes only what
  // changed instead of every column.
  const editBaselineRef = useRef<Relation | null>(null);

  // Relation en attente de confirmation de suppression (AlertDialog thème).
  const [pendingDelete, setPendingDelete] = useState<Relation | null>(null);

  
  const relLabel = (id: string) => {
    const rt = getRelationType(id);
    return rt.labelKey ? (t as (k: string) => string)(rt.labelKey) : rt.label;
  };

  // Index par id : le comparateur de tri appelle getRelatedCharacter deux
  // fois par comparaison — un `characters.find` là-dedans coûtait
  // O(n log n × m) à chaque rendu.
  const charactersById = useMemo(
    () => new Map(characters.map((c) => [c.id, c])),
    [characters],
  );

  const ownType = charactersById.get(characterId)?.type;

  // The ADD picker's pair is (this sheet, whoever is selected). Before a
  // target is chosen the other end is genuinely unknown, so everything is
  // offered — narrowing on an empty select would look like a bug.
  const addTypeOptions = useMemo(
    () => relationTypesForPair(ownType, selectedChar ? charactersById.get(selectedChar)?.type : undefined),
    [ownType, selectedChar, charactersById],
  );

  // Keep the add picker's VALUE inside its own option list. Corrected during
  // render (same pattern as MapViewerPage's image reset) rather than in an
  // effect — lint forbids setState in an effect body here, and the
  // render-time form has no intermediate paint: the select never shows
  // "Leads to" while `selectedTypeId` still says `romance`, which is the
  // value the save would send.
  const [prevAddTypeOptions, setPrevAddTypeOptions] = useState(addTypeOptions);
  if (addTypeOptions !== prevAddTypeOptions) {
    setPrevAddTypeOptions(addTypeOptions);
    if (!addTypeOptions.some((rt) => rt.id === selectedTypeId)) {
      setSelectedTypeId(addTypeOptions[0]?.id ?? RELATION_TYPES[0].id);
    }
  }

  const getRelatedCharacter = (relation: Relation) => {
    const relatedId =
      relation.from_character_id === characterId
        ? relation.to_character_id
        : relation.from_character_id;
    return charactersById.get(relatedId);
  };

  // Regroupées par type (ordre de RELATION_TYPES), puis alphabétique.
  // Mémoïsé : recalculé uniquement quand les données changent réellement —
  // les refetchs realtime préservent désormais l'identité des tableaux.
  const characterRelations = useMemo(() => {
    const related = (relation: Relation) => {
      const relatedId =
        relation.from_character_id === characterId
          ? relation.to_character_id
          : relation.from_character_id;
      return charactersById.get(relatedId);
    };
    return relations
      .filter(
        (r) =>
          (r.from_character_id === characterId || r.to_character_id === characterId) &&
          !excludeRelationIds?.has(r.id)
      )
      .sort(
        (a, b) =>
          relationRank(a.relation_type) - relationRank(b.relation_type) ||
          compareNames(related(a)?.name ?? '', related(b)?.name ?? '')
      );
  }, [relations, charactersById, characterId, excludeRelationIds]);

  const handleAdd = async () => {
    if (!selectedChar || !session) return;
    try {
      await createRelation({
        space_id: session.space.id,
        from_character_id: characterId,
        to_character_id: selectedChar,
        relation_type: selectedTypeId,
        relation_detail: detail.trim() || undefined,
        gm_only: isGm ? gmOnly : false,
      });
      setShowAdd(false);
      setSelectedChar('');
      setDetail('');
      setSelectedTypeId(RELATION_TYPES[0].id);
      setGmOnly(false);
    } catch (err) {
      console.error(err);
      showToast(t('common.saveError'));
    }
  };

  const startEditing = (rel: Relation) => {
    setEditingId(rel.id);
    setEditTypeId(rel.relation_type);
    setEditDetail(rel.relation_detail || '');
    setEditGmOnly(rel.gm_only);
    editBaselineRef.current = rel;
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditDetail('');
    setEditGmOnly(false);
  };

  const saveEditing = async () => {
    if (!editingId) return;
    try {
      const payload: Partial<Relation> = {
        relation_type: editTypeId,
        // `|| null` et non `|| undefined` : JSON.stringify laisse tomber une
        // clé undefined, et le RPC n'écrit la colonne que si la clé est là
        // (`case when p_data ? 'relation_detail'`) — vider une précision se
        // sauvegardait donc en silence et revenait au resync suivant. Même
        // piège que le sélecteur de lieu.
        relation_detail: editDetail.trim() || null,
        // Le serveur rejette gm_only venant d'un non-MJ dès que la clé est
        // présente : on ne l'envoie donc que pour le MJ.
        ...(isGm && { gm_only: editGmOnly }),
      };
      // Seules les colonnes réellement modifiées : deux personnes qui éditent
      // le même lien ne s'écrasent plus l'une l'autre.
      const patch = changedKeys(editBaselineRef.current, payload);
      if (Object.keys(patch).length > 0) await updateRelation(editingId, patch);
      setEditingId(null);
      setEditDetail('');
    } catch (err) {
      console.error(err);
      showToast(t('common.saveError'));
    }
  };

  const availableChars = characters
    .filter((c) => {
      if (c.id === characterId) return false;
      return !relations.some(
        (r) =>
          (r.from_character_id === characterId && r.to_character_id === c.id) ||
          (r.to_character_id === characterId && r.from_character_id === c.id)
      );
    })
    .sort(byName);

  return (
    <section>
      <h3 className="label-overline mb-4">{t('character.relations')}</h3>

      {characterRelations.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] font-body mb-4">
          {t('character.noRelation')}
        </p>
      ) : (
        <div className="space-y-3 mb-4">
          {characterRelations.map((relation) => {
            const target = getRelatedCharacter(relation);
            if (!target) return null;
            const rt = getRelationType(relation.relation_type);
            const labelTr = relLabel(relation.relation_type);
            const subLabel = relation.relation_detail
              ? `${labelTr} · ${relation.relation_detail}`
              : labelTr;
            const isEditing = editingId === relation.id;

            if (isEditing) {
              const editRt = getRelationType(editTypeId);
              const editTypeOptions = relationTypesForPair(
                ownType,
                target.type,
                // The stored value stays offered even if the pair no longer
                // allows it — see relationTypesForPair's docstring.
                editTypeId,
              );
              return (
                <article
                  key={relation.id}
                  className="card-paper card-accent-left p-3 space-y-2 relative overflow-hidden"
                  style={{ '--card-accent': editRt.color } as CSSProperties}
                >
                  <div className="pl-1">
                    <p className="font-display text-base font-semibold text-[var(--text-primary)] mb-2 truncate">
                      {target.name}
                    </p>
                    <select
                      value={editTypeId}
                      aria-label={t('character.editRelation')}
                      onChange={(e) => setEditTypeId(e.target.value)}
                      className="field-paper text-sm h-9 mb-2"
                    >
                      {editTypeOptions.map((rtOpt) => (
                        <option key={rtOpt.id} value={rtOpt.id}>
                          {relLabel(rtOpt.id)}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={editDetail}
                      onChange={(e) => setEditDetail(e.target.value)}
                      placeholder={t('character.relationPrecisionPlaceholder')}
                      aria-label={t('character.relationDetail')}
                      className="field-paper text-sm h-9 mb-2"
                    />
                    {isGm && (
                      <button
                        type="button"
                        onClick={() => setEditGmOnly((v) => !v)}
                        className="flex items-center gap-2 mb-2 text-sm"
                      >
                        <span
                          className={`w-4 h-4 rounded-sm border flex items-center justify-center flex-shrink-0 transition-colors ${
                            editGmOnly
                              ? 'bg-[var(--gm-accent)] border-[var(--gm-accent)]'
                              : 'border-[var(--border-paper)]'
                          }`}
                        >
                          {editGmOnly && (
                            <Check size={10} className="text-[var(--text-inverse)]" strokeWidth={3} />
                          )}
                        </span>
                        <span className="text-[var(--text-secondary)]">
                          {t('gm.relationOnly')}
                        </span>
                      </button>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={saveEditing}
                        className="btn-ink h-9 px-3 text-xs flex-1"
                      >
                        <Check size={13} /> {t('common.save')}
                      </button>
                      <button
                        onClick={cancelEditing}
                        className="btn-outline h-9 px-3 text-xs"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                </article>
              );
            }

            return (
              <article key={relation.id} className="relative group">
                <button
                  onClick={() => navigate(`/character/${target.id}`)}
                  className="relation-stamp w-full"
                  title={`${target.name} — ${subLabel}`}
                >
                  <span
                    aria-hidden
                    className="accent-ripple"
                    style={{ '--card-accent': rt.color } as CSSProperties}
                  />
                  <div className="min-w-0 text-left pl-1">
                    <div className="stamp-name flex items-center gap-2 min-w-0">
                      <span className="truncate">{target.name}</span>
                      {relation.gm_only && (
                        <span className="shrink-0">
                          {/* Fond d'encre : la pastille passe sur sa variante
                              claire, le prune nominal s'y noyait. */}
                          <GmBadge tone="ink" />
                        </span>
                      )}
                    </div>
                    <div className="stamp-sub truncate">{subLabel}</div>
                  </div>
                  <ArrowUpRight size={20} className="stamp-arrow" />
                </button>

                {/* Actions révélées au survol et au focus clavier. Sur écran
                    tactile (pas de survol), elles restent visibles en
                    permanence — sinon elles seraient introuvables. */}
                {canEdit && (
                  <div className="absolute -top-2 -right-2 flex gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditing(relation);
                      }}
                      className="w-7 h-7 rounded-full bg-[var(--bg-card)] border border-[var(--border-paper)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-focus)] flex items-center justify-center"
                      title={t('character.editRelation')}
                      aria-label={t('character.editRelation')}
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDelete(relation);
                      }}
                      className="w-7 h-7 rounded-full bg-[var(--bg-card)] border border-[var(--border-paper)] text-[var(--text-muted)] hover:text-[var(--danger)] hover:border-[var(--danger-border)] flex items-center justify-center"
                      title={t('character.deleteRelation')}
                      aria-label={t('character.deleteRelation')}
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {canEdit &&
        (showAdd ? (
          <div className="space-y-3 p-4 card-paper">
            <select
              value={selectedChar}
              aria-label={t('character.pickCharacter')}
              onChange={(e) => setSelectedChar(e.target.value)}
              className="field-paper text-sm"
            >
              <option value="">{t('character.pickCharacter')}</option>
              {availableChars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.role ? `· ${c.role}` : ''}
                </option>
              ))}
            </select>
            <select
              value={selectedTypeId}
              aria-label={t('character.addRelation')}
              onChange={(e) => setSelectedTypeId(e.target.value)}
              className="field-paper text-sm"
            >
              {addTypeOptions.map((rt) => (
                <option key={rt.id} value={rt.id}>
                  {relLabel(rt.id)}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder={t('character.detailPlaceholder')}
              aria-label={t('character.relationDetail')}
              className="field-paper text-sm"
            />
            {isGm && (
              <button
                type="button"
                onClick={() => setGmOnly((v) => !v)}
                className="flex items-center gap-2 text-sm"
              >
                <span
                  className={`w-4 h-4 rounded-sm border flex items-center justify-center flex-shrink-0 transition-colors ${
                    gmOnly
                      ? 'bg-[var(--gm-accent)] border-[var(--gm-accent)]'
                      : 'border-[var(--border-paper)]'
                  }`}
                >
                  {gmOnly && <Check size={10} className="text-[var(--text-inverse)]" strokeWidth={3} />}
                </span>
                <span className="text-[var(--text-secondary)]">{t('gm.relationOnly')}</span>
              </button>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                disabled={!selectedChar}
                className="btn-ink flex-1 disabled:opacity-40"
              >
                {t('common.add')}
              </button>
              <button
                onClick={() => {
                  setShowAdd(false);
                  setDetail('');
                }}
                className="btn-outline"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAdd(true)}
            disabled={availableChars.length === 0}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors font-body disabled:opacity-40"
          >
            <Plus size={14} />
            {t('character.addRelation')}
          </button>
        ))}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={
          pendingDelete
            ? getRelatedCharacter(pendingDelete)?.name ?? t('character.deleteRelation')
            : ''
        }
        description={t('character.deleteRelationConfirm')}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={() => {
          if (pendingDelete) {
            deleteRelation(pendingDelete.id).catch((err) => {
              console.error(err);
              showToast(t('common.saveError'));
            });
          }
          setPendingDelete(null);
        }}
      />
    </section>
  );
}
