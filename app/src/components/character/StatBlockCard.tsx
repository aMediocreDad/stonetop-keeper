import { useId, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { GmBadge } from '@/components/shared/GmBadge';
import { useIsGm } from '@/hooks/useRole';
import { useT } from '@/i18n';
import type { StatBlock } from '@/types';
import { FieldLine, ReadLine, inputCls } from './statLines';
import { TagEditor } from './TagEditor';

interface StatBlockCardProps {
  value: StatBlock;
  onChange: (next: StatBlock) => void;
  /** Sheet edit mode (text fields). */
  editable: boolean;
  /** True when the sheet is a follower's — its stat block is player-facing. */
  isFollower: boolean;
  /**
   * Tags de la créature (« cunning », « small »…). ÉDITION SEULEMENT : en
   * lecture ils vivent sous le nom de la fiche, dans la ligne de descripteurs,
   * là où une menace montre son type — c'est l'anatomie du livre, où les tags
   * suivent le nom de l'entrée et non ses PV.
   *
   * Absent = pas d'éditeur (rien d'autre que monstre/follower n'a de tags,
   * cf. tagsApply — la même condition qui fait exister ce bloc).
   */
  tags?: { value: string[]; onChange: (next: string[]) => void };
}

/**
 * Fiche de bloc de stats Stonetop (monstre ou follower — même forme).
 * Anatomie du livre : HP/Armor en tête, puis dégâts/qualité
 * spéciale, actions ► . Les PV sont une VALEUR de fiche, pas un compteur :
 * la table ne les suit pas entre les séances, donc il ne reste ici aucun
 * contrôle de jeu — `editable` suffit.
 *
 * Ne porte QUE des stats. La catégorie de bestiaire (`kind`) et la bascule
 * follower classent la fiche : elles vivent sur la carte Informations
 * (CharacterSheetPage). Le coût/loyauté/meneur d'un follower vivent sur
 * FollowerCard — un follower n'a pas forcément de stats, et un monstre
 * statté n'est pas un follower.
 */
export function StatBlockCard({ value, onChange, editable, isFollower, tags }: StatBlockCardProps) {
  const t = useT();
  const isGm = useIsGm();
  const [moveInput, setMoveInput] = useState('');
  // Instance-unique id prefix: two StatBlockCards on one page (e.g. a
  // GROUPE sheet listing several followers) must not collide on
  // `statblock-hp` etc. — ThreatSheetCard sidesteps this by not using
  // ids at all; here `FieldLine`'s `<label htmlFor>` needs one per field.
  const uid = useId();

  const toInt = (raw: string) => Math.max(0, Math.round(Number(raw) || 0));
  const setHp = (raw: string) => onChange({ ...value, hp: toInt(raw) });
  const setArmor = (raw: string) => onChange({ ...value, armor: toInt(raw) });
  const setArmorNote = (armorNote: string) => onChange({ ...value, armorNote });
  const setDamage = (damage: string) => onChange({ ...value, damage });
  const setSpecial = (specialQualities: string) => onChange({ ...value, specialQualities });

  const addMove = () => {
    const text = moveInput.trim();
    if (!text) return;
    onChange({ ...value, moves: [...value.moves, text] });
    setMoveInput('');
  };
  const removeMove = (index: number) =>
    onChange({ ...value, moves: value.moves.filter((_, i) => i !== index) });
  const updateMoveText = (index: number, text: string) =>
    onChange({ ...value, moves: value.moves.map((m, i) => (i === index ? text : m)) });

  const showDamage = editable || value.damage !== '';
  const showSpecial = editable || (value.specialQualities ?? '') !== '';
  const showMoves = editable || value.moves.length > 0;

  return (
    <div className="card-paper p-6">
      {/* Pas de bouton « retirer » : l'existence du bloc appartient aux cases
          Monstre/Follower de la carte Informations (ce sont elles, et elles
          seules, qui décrivent une créature stattée). Deux propriétaires
          pouvaient se contredire à l'écran. */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <h3 className="label-overline">{t('statblock.title')}</h3>
        {/* Un bloc non-follower est prep de MJ : le serveur le nulle pour les
            lecteurs joueur/spectateur (cf. supabase-statblock.sql). Le MJ
            n'avait aucun moyen de savoir quelle moitié de la fiche fuit — la
            pastille le dit, et elle suit l'état local, donc elle disparaît dès
            que la case Follower est cochée. */}
        {isGm && !isFollower && (
          <span title={t('statblock.gmOnlyHint')}>
            <GmBadge />
          </span>
        )}
      </div>

      {/* Tags — ici plutôt que dans une section « TAGS » à part sur la fiche :
          ce sont des stats de jeu, réservées aux monstres et
          aux followers, c'est-à-dire exactement aux fiches qui ont ce bloc.
          Une section propre en faisait une troisième catégorie à côté des
          traits, alors qu'elles décrivent la créature au même titre que ses
          PV. En lecture, elles remontent sous le nom de la fiche. */}
      {editable && tags && (
        <div className="flex items-baseline gap-2 text-sm font-body mb-3">
          <span className="font-semibold text-[var(--text-primary)] shrink-0">
            {t('character.tags')}
          </span>
          <TagEditor value={tags.value} onChange={tags.onChange} />
        </div>
      )}

      {/* Ligne du livre en lecture : HP n · Armor n (note). Les PV ne sont
          plus un compteur — pas de pas à pas, la valeur se lit comme celles
          du livre. */}
      {!editable && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-body mb-3">
          <span>
            <span className="font-semibold text-[var(--text-primary)]">{t('statblock.hp')}</span>{' '}
            <span className="text-[var(--text-secondary)] tabular-nums">{value.hp}</span>
          </span>
          <span>
            <span className="font-semibold text-[var(--text-primary)]">{t('statblock.armor')}</span>{' '}
            <span className="text-[var(--text-secondary)]">
              {value.armor}
              {value.armorNote ? ` (${value.armorNote})` : ''}
            </span>
          </span>
        </div>
      )}

      {/* Édition : hp / armor / armorNote — une FieldLine chacun. */}
      {editable && (
        <div className="mb-3">
          <FieldLine label={t('statblock.hp')} htmlFor={`${uid}-hp`}>
            <input
              id={`${uid}-hp`}
              type="number"
              min={0}
              value={value.hp}
              onChange={(e) => setHp(e.target.value)}
              className={inputCls}
            />
          </FieldLine>
          <FieldLine label={t('statblock.armor')} htmlFor={`${uid}-armor`}>
            <input
              id={`${uid}-armor`}
              type="number"
              min={0}
              value={value.armor}
              onChange={(e) => setArmor(e.target.value)}
              className={inputCls}
            />
          </FieldLine>
          <FieldLine label={t('statblock.armorNote')} htmlFor={`${uid}-armornote`}>
            <input
              id={`${uid}-armornote`}
              type="text"
              value={value.armorNote ?? ''}
              onChange={(e) => setArmorNote(e.target.value)}
              className={inputCls}
            />
          </FieldLine>
        </div>
      )}

      {/* Dégâts — ligne de lecture masquée si vide & hors édition. */}
      {showDamage &&
        (editable ? (
          <FieldLine label={t('statblock.damage')} htmlFor={`${uid}-damage`}>
            <input
              id={`${uid}-damage`}
              type="text"
              value={value.damage}
              onChange={(e) => setDamage(e.target.value)}
              className={inputCls}
            />
          </FieldLine>
        ) : (
          <ReadLine label={t('statblock.damage')}>{value.damage}</ReadLine>
        ))}

      {/* Qualité spéciale — même garde que les dégâts. */}
      {showSpecial &&
        (editable ? (
          <FieldLine label={t('statblock.special')} htmlFor={`${uid}-special`}>
            <input
              id={`${uid}-special`}
              type="text"
              value={value.specialQualities ?? ''}
              onChange={(e) => setSpecial(e.target.value)}
              className={inputCls}
            />
          </FieldLine>
        ) : (
          <ReadLine label={t('statblock.special')}>{value.specialQualities}</ReadLine>
        ))}

      {/* Actions ► — motif gmMoves de ThreatSheetCard, puce du livre. */}
      {showMoves && (
        <div className="mb-4 last:mb-0">
          <h3 className="label-overline mb-2">{t('statblock.moves')}</h3>
          <ul className="space-y-1.5">
            {value.moves.map((move, index) => (
              <li key={index} className="flex items-center gap-2">
                <span aria-hidden className="text-[var(--text-muted)]">
                  ►
                </span>
                {editable ? (
                  <input
                    type="text"
                    value={move}
                    aria-label={`${t('statblock.moves')} ${index + 1}`}
                    onChange={(e) => updateMoveText(index, e.target.value)}
                    className={inputCls}
                  />
                ) : (
                  <span className="text-sm text-[var(--text-secondary)] font-body flex-1">{move}</span>
                )}
                {editable && (
                  <button
                    type="button"
                    onClick={() => removeMove(index)}
                    aria-label={`${t('common.delete')} ${move}`}
                    className="p-2 -m-2 text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"
                  >
                    <X size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>

          {editable && (
            <div className="flex gap-2 mt-3">
              <input
                type="text"
                value={moveInput}
                aria-label={t('statblock.addMove')}
                onChange={(e) => setMoveInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addMove();
                  }
                }}
                placeholder={t('statblock.addMove')}
                className="field-paper text-sm h-9"
              />
              <button
                type="button"
                onClick={addMove}
                aria-label={t('common.add')}
                className="h-9 px-3 border border-[var(--border-paper)] rounded-lg hover:bg-[var(--bg-card-alt)] transition-colors text-[var(--text-secondary)]"
              >
                <Plus size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
