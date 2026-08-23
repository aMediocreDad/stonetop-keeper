import { useMemo, useState } from 'react';
import { ArrowUpRight, Plus, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useAppStore } from '@/stores/appStore';
import { useRelations } from '@/hooks/useRelations';
import { useCanEdit } from '@/hooks/useRole';
import { resolveGroupMembers } from '@/lib/character/groupMembers';
import { byName, compareNames } from '@/lib/sortByName';
import { useT } from '@/i18n';
import type { Character, Relation } from '@/types';

interface MembersListProps {
  groupId: string;
  characters: Character[];
  relations: Relation[];
}

/**
 * Roster des membres d'un groupe : les relations `membre` du groupe,
 * présentées comme une liste dédiée (la RelationsList en dessous les
 * exclut pour éviter le doublon). L'ajout crée une relation `membre`.
 */
export function MembersList({ groupId, characters, relations }: MembersListProps) {
  const t = useT();
  const navigate = useNavigate();
  const canEdit = useCanEdit();
  const session = useAppStore((s) => s.session);
  const showToast = useAppStore((s) => s.showToast);
  const { createRelation, deleteRelation } = useRelations(session?.space.id);

  const [showAdd, setShowAdd] = useState(false);
  const [selectedChar, setSelectedChar] = useState('');
  const [pendingRemove, setPendingRemove] = useState<{ relation: Relation; name: string } | null>(
    null,
  );

  // Mémoïsé : resolveGroupMembers parcourt tout le space, et ce pipeline
  // tournait à chaque rendu (donc à chaque frappe/toast ailleurs). Les
  // refetchs realtime préservent désormais l'identité des tableaux, donc ces
  // memos tiennent réellement.
  const { members, membershipRelationIds, charById } = useMemo(() => {
    const resolved = resolveGroupMembers(characters, relations);
    return { ...resolved, charById: new Map(characters.map((c) => [c.id, c])) };
  }, [characters, relations]);

  // Set : deux relations `membre` sur la même paire (possible via clients
  // concurrents) ne doivent pas dupliquer la ligne (et sa clé React).
  const memberIds = useMemo(
    () =>
      [...new Set(members.get(groupId) ?? [])].sort((a, b) =>
        compareNames(charById.get(a)?.name ?? '', charById.get(b)?.name ?? ''),
      ),
    [members, charById, groupId],
  );

  const memberRelation = (memberId: string) =>
    relations.find(
      (r) =>
        membershipRelationIds.has(r.id) &&
        ((r.from_character_id === groupId && r.to_character_id === memberId) ||
          (r.to_character_id === groupId && r.from_character_id === memberId)),
    );

  // Même contrainte que RelationsList : une seule relation par paire.
  const availableChars = useMemo(() => {
    const linked = new Set<string>();
    for (const r of relations) {
      if (r.from_character_id === groupId) linked.add(r.to_character_id);
      else if (r.to_character_id === groupId) linked.add(r.from_character_id);
    }
    return characters
      // DISCOVERY excluded: this picker builds its own candidate list rather
      // than routing through relationTypesForPair (lib/constants.ts), which
      // already refuses `membre` on a discovery pair. A discovery is a thing
      // found, not a member of anything — without this it is the second,
      // unfiltered creation path for `membre` relations.
      .filter((c) => c.id !== groupId && c.type !== 'GROUPE' && c.type !== 'DISCOVERY' && !linked.has(c.id))
      .sort(byName);
  }, [characters, relations, groupId]);

  const handleAdd = async () => {
    if (!selectedChar || !session) return;
    try {
      await createRelation({
        space_id: session.space.id,
        from_character_id: selectedChar,
        to_character_id: groupId,
        relation_type: 'membre',
        gm_only: false,
      });
      setShowAdd(false);
      setSelectedChar('');
    } catch (err) {
      console.error(err);
      showToast(t('common.saveError'));
    }
  };

  return (
    <section className="mb-6">
      <h3 className="label-overline mb-4">{t('character.members')}</h3>

      {memberIds.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] font-body mb-4">
          {t('character.noMembers')}
        </p>
      ) : (
        <div className="space-y-3 mb-4">
          {memberIds.map((mid) => {
            const member = charById.get(mid);
            if (!member) return null;
            const rel = memberRelation(mid);
            return (
              <article key={mid} className="relative group">
                <button
                  onClick={() => navigate(`/character/${mid}`)}
                  className="relation-stamp w-full"
                  title={member.name}
                >
                  <div className="min-w-0 text-left pl-1">
                    <div className="stamp-name truncate">{member.name}</div>
                    {member.role && <div className="stamp-sub truncate">{member.role}</div>}
                  </div>
                  <ArrowUpRight size={20} className="stamp-arrow" />
                </button>
                {rel && canEdit && (
                  <div className="absolute -top-2 -right-2 flex gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingRemove({ relation: rel, name: member.name });
                      }}
                      className="w-7 h-7 rounded-full bg-[var(--bg-card)] border border-[var(--border-paper)] text-[var(--text-muted)] hover:text-[var(--danger)] hover:border-[var(--danger-border)] flex items-center justify-center"
                      title={t('character.removeMember')}
                      aria-label={t('character.removeMember')}
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
              aria-label={t('character.pickMember')}
              onChange={(e) => setSelectedChar(e.target.value)}
              className="field-paper text-sm"
            >
              <option value="">{t('character.pickMember')}</option>
              {availableChars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.role ? `· ${c.role}` : ''}
                </option>
              ))}
            </select>
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
            disabled={availableChars.length === 0}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors font-body disabled:opacity-40"
          >
            <Plus size={14} />
            {t('character.addMember')}
          </button>
        ))}

      <ConfirmDialog
        open={!!pendingRemove}
        onOpenChange={(open) => !open && setPendingRemove(null)}
        title={pendingRemove?.name ?? ''}
        description={t('character.removeMemberConfirm')}
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
    </section>
  );
}
