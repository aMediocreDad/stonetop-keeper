import { useState } from 'react';
import type React from 'react';
import { Check, Plus, X } from 'lucide-react';
import { RichText } from '@/components/shared/RichText';
import { GmBadge } from '@/components/shared/GmBadge';
import type { MentionItem } from '@/components/editor/mentionItems';
import { useCanEdit, useIsGm } from '@/hooks/useRole';
import { hasRichText } from '@/lib/character/threatSheet';
import { useT } from '@/i18n';
import type { ThreatPortent, ThreatSheet } from '@/types';

/** Ardoise de notes MJ à fusionner dans la carte (fiche MENACE uniquement). */
export interface ThreatGmNotes {
  value: string;
  onChange: (html: string) => void;
  mentionItems?: MentionItem[];
}

interface ThreatSheetCardProps {
  value: ThreatSheet;
  onChange: (threat: ThreatSheet) => void;
  editable: boolean;
  /**
   * Présent : les notes MJ se rendent en dernière section de la carte (au
   * lieu d'une `GmNotesCard` séparée) — la section s'auto-masque si non-MJ.
   */
  gmNotes?: ThreatGmNotes;
}

/**
 * Case ronde de la carte de menace (fatalité, présages, enjeux).
 *
 * Le filet non coché tenait sur `--border-paper` : sur le lavis prune de la
 * carte, ce filet tombe à ~1,2:1 — invisible à l'œil nu, et sous le 3:1 exigé
 * des contrôles (WCAG 1.4.11). Encre adoucie (~3,7:1) + disque papier : la
 * case se lit comme un creux dans le parchemin, sans crier.
 */
function CheckDot({
  checked,
  label,
  accent = 'ink',
  canEdit,
  onToggle,
}: {
  checked: boolean;
  label: string;
  /** Encre pour les présages/enjeux, prune pour la fatalité imminente. */
  accent?: 'ink' | 'gm';
  canEdit: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      aria-disabled={!canEdit}
      onClick={() => (canEdit ? onToggle() : undefined)}
      className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center flex-shrink-0 transition-colors ${
        checked
          ? accent === 'gm'
            ? 'bg-[var(--gm-accent)] border-[var(--gm-accent)]'
            : 'bg-[var(--accent-primary)] border-[var(--accent-primary)]'
          : 'bg-[var(--bg-card)] border-[var(--text-muted)]'
      } ${canEdit ? 'cursor-pointer hover:border-[var(--border-focus)]' : 'cursor-default'}`}
    >
      {checked && <Check size={10} className="text-[var(--text-inverse)]" strokeWidth={3} />}
    </button>
  );
}

interface ChecklistSectionProps {
  /** ReactNode : les présages composent un sous-titre à plusieurs spans. */
  title: React.ReactNode;
  /** Libellé nu pour l'aria-label de repli des items — jamais le node composé. */
  ariaTitle: string;
  addLabel: string;
  items: ThreatPortent[];
  onItems: (items: ThreatPortent[]) => void;
  editable: boolean;
}

/**
 * Checklist cochable hors édition (cocher = acte de jeu, pas une
 * modification de fiche) — présages et enjeux partagent ce squelette,
 * seuls libellés et données changent. Sauf pour les spectateurs
 * (`viewer`) : le serveur rejette TOUTE écriture de ce rôle (FORBIDDEN),
 * on fige donc les cases en lecture pure plutôt que d'offrir une bascule
 * optimiste qui serait silencieusement refusée.
 */
function ChecklistSection({
  title,
  ariaTitle,
  addLabel,
  items,
  onItems,
  editable,
}: ChecklistSectionProps) {
  const t = useT();
  const canEdit = useCanEdit();
  const [input, setInput] = useState('');

  const add = () => {
    const text = input.trim();
    if (!text) return;
    onItems([...items, { text, done: false }]);
    setInput('');
  };

  return (
    <div className="mb-5">
      <h3 className="label-overline mb-2">{title}</h3>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={index} className="flex items-center gap-3">
            <CheckDot
              checked={item.done}
              label={item.text || ariaTitle}
              canEdit={canEdit}
              onToggle={() =>
                onItems(items.map((p, i) => (i === index ? { ...p, done: !p.done } : p)))
              }
            />
            {editable ? (
              <input
                type="text"
                value={item.text}
                aria-label={`${ariaTitle} ${index + 1}`}
                onChange={(e) =>
                  onItems(items.map((p, i) => (i === index ? { ...p, text: e.target.value } : p)))
                }
                className="flex-1 bg-transparent border-b border-[var(--border-field)] focus:border-[var(--border-focus)] focus:outline-none pb-0.5 text-sm font-body"
              />
            ) : (
              <span className="text-sm text-[var(--text-secondary)] font-body flex-1">
                {item.text}
              </span>
            )}
            {editable && (
              <button
                type="button"
                onClick={() => onItems(items.filter((_, i) => i !== index))}
                aria-label={`${t('common.delete')} ${item.text}`}
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
            value={input}
            aria-label={addLabel}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder={addLabel}
            className="field-paper text-sm h-9"
          />
          <button
            type="button"
            onClick={add}
            aria-label={addLabel}
            className="h-9 px-3 border border-[var(--border-paper)] rounded-lg hover:bg-[var(--bg-card-alt)] transition-colors text-[var(--text-secondary)]"
          >
            <Plus size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Fiche de menace (type `MENACE`) — carte teintée de l'accent MJ, visible à
 * qui peut voir le personnage (sémantique de révélation : un joueur voit la
 * fiche complète d'une menace non masquée). Anatomie du livre, fatalité en
 * tête : la fatalité imminente (prose riche + case « advenue ») ancre le bloc
 * et les présages (checklist, compte à rebours) se nichent dessous, en
 * découlant — puis enjeux (questions cochées quand le jeu y répond), actions
 * MJ — et, sur la page personnage, les notes MJ en dernière section (une
 * seule carte prune). L'instinct n'est plus rendu ici : la fiche personnage
 * le montre pour les quatre types via le FieldRow partagé (voir
 * CharacterSheetPage/lib/instinct).
 */
export function ThreatSheetCard({ value, onChange, editable, gmNotes }: ThreatSheetCardProps) {
  const t = useT();
  const canEdit = useCanEdit();
  const isGm = useIsGm();
  const [moveInput, setMoveInput] = useState('');

  const showPortents = editable || value.portents.length > 0;
  const showDoom = editable || hasRichText(value.impendingDoom.text) || value.impendingDoom.done;
  const showStakes = editable || value.stakes.length > 0;
  const showMoves = editable || value.gmMoves.length > 0;
  const showGmNotes = gmNotes !== undefined && isGm;

  // Fiche entièrement vide hors édition : rien à montrer — sans ce garde,
  // la carte se réduisait à une bande vide (le cadre 9 tranches s'y écrase).
  if (!showPortents && !showDoom && !showStakes && !showMoves && !showGmNotes)
    return null;

  const portentsDone = value.portents.filter((p) => p.done).length;
  // « À nos portes » : compte à rebours épuisé, fatalité pas encore advenue.
  const doomAtHand =
    value.portents.length > 0 && portentsDone === value.portents.length && !value.impendingDoom.done;

  const toggleDoom = () =>
    onChange({ ...value, impendingDoom: { ...value.impendingDoom, done: !value.impendingDoom.done } });

  const addMove = () => {
    const text = moveInput.trim();
    if (!text) return;
    onChange({ ...value, gmMoves: [...value.gmMoves, text] });
    setMoveInput('');
  };
  const removeMove = (index: number) =>
    onChange({ ...value, gmMoves: value.gmMoves.filter((_, i) => i !== index) });
  const updateMoveText = (index: number, text: string) =>
    onChange({ ...value, gmMoves: value.gmMoves.map((m, i) => (i === index ? text : m)) });

  return (
    <div
      className="card-paper card-frame card-frame-box p-6 overflow-hidden"
      style={{ backgroundColor: 'var(--gm-accent-soft)' }}
    >
      {/* Fatalité en tête, présages en dessous — la fatalité s'écrit d'abord,
          les présages en découlent : c'est le compte à
          rebours qui mène à elle, pas une section à côté. */}
      {(showDoom || showPortents) && (
        <div className="mb-5">
          {/* Pas de bordure d'accent latérale (préférence : le moins possible
              d'accents à gauche) — la primauté de la fatalité tient à sa place
              en tête, et le badge « at hand » porte seul l'emphase. */}
          {showDoom && (
            <div data-at-hand={doomAtHand || undefined}>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <CheckDot
                  checked={value.impendingDoom.done}
                  label={t('threat.impendingDoom')}
                  accent="gm"
                  canEdit={canEdit}
                  onToggle={toggleDoom}
                />
                <h3 className="label-overline">{t('threat.impendingDoom')}</h3>
                {doomAtHand && (
                  <span
                    className="font-body text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-0.5 rounded border"
                    style={{
                      color: 'var(--gm-accent)',
                      borderColor: 'var(--gm-accent)',
                      backgroundColor: 'var(--gm-accent-soft)',
                    }}
                  >
                    {t('threat.doomAtHand')}
                  </span>
                )}
              </div>
              {/* Pas de wrapper de taille ici : Tiptap fixe sa propre taille de
                  corps (`text-[0.95rem]`, en rem — insensible aux classes de
                  taille des ancêtres) ; la position en tête porte l'effet
                  d'ancrage. */}
              <RichText
                content={value.impendingDoom.text}
                onChange={(html) =>
                  onChange({ ...value, impendingDoom: { ...value.impendingDoom, text: html } })
                }
                editable={editable}
              />
            </div>
          )}

          {showPortents && (
            // Indentation « nichée » seulement s'il y a une fatalité au-dessus
            // à nicher sous — sinon (fatalité vide hors édition), les présages
            // redeviennent la section de tête, sans retrait orphelin. Retrait
            // seul, sans ligne de liaison (le moins possible d'accents à gauche).
            <div className={showDoom ? 'mt-4 pl-6 [&>div]:mb-0' : '[&>div]:mb-0'}>
              <ChecklistSection
                title={
                  <>
                    <span>{t('threat.portents')}</span>
                    {value.portents.length > 0 && (
                      <span className="normal-case tracking-normal font-normal text-[var(--text-muted)] ml-1.5">
                        ({portentsDone}/{value.portents.length})
                      </span>
                    )}
                  </>
                }
                ariaTitle={t('threat.portents')}
                addLabel={t('threat.addPortent')}
                items={value.portents}
                onItems={(portents) => onChange({ ...value, portents })}
                editable={editable}
              />
            </div>
          )}
        </div>
      )}

      {/* Enjeux : questions ouvertes du livre, cochées quand le jeu y répond. */}
      {showStakes && (
        <ChecklistSection
          title={t('threat.stakes')}
          ariaTitle={t('threat.stakes')}
          addLabel={t('threat.addStake')}
          items={value.stakes}
          onItems={(stakes) => onChange({ ...value, stakes })}
          editable={editable}
        />
      )}

      {/* Actions MJ : liste à puces, sans case à cocher. */}
      {showMoves && (
        <div>
          <h3 className="label-overline mb-2">{t('threat.gmMoves')}</h3>
          <ul className="space-y-1.5">
            {value.gmMoves.map((move, index) => (
              <li key={index} className="flex items-center gap-2">
                <span aria-hidden className="text-[var(--text-muted)]">
                  •
                </span>
                {editable ? (
                  <input
                    type="text"
                    value={move}
                    aria-label={`${t('threat.gmMoves')} ${index + 1}`}
                    onChange={(e) => updateMoveText(index, e.target.value)}
                    className="flex-1 bg-transparent border-b border-[var(--border-field)] focus:border-[var(--border-focus)] focus:outline-none pb-0.5 text-sm font-body"
                  />
                ) : (
                  <span className="text-sm text-[var(--text-secondary)] font-body flex-1">
                    {move}
                  </span>
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
                aria-label={t('threat.addMove')}
                onChange={(e) => setMoveInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addMove();
                  }
                }}
                placeholder={t('threat.addMove')}
                className="field-paper text-sm h-9"
              />
              <button
                type="button"
                onClick={addMove}
                aria-label={t('threat.addMove')}
                className="h-9 px-3 border border-[var(--border-paper)] rounded-lg hover:bg-[var(--bg-card-alt)] transition-colors text-[var(--text-secondary)]"
              >
                <Plus size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Notes MJ fusionnées — évite l'alternance blanc/prune de deux cartes. */}
      {showGmNotes && gmNotes && (
        <div>
          <div className="seal-divider my-5 text-xs" aria-hidden>
            ✦
          </div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="label-overline">{t('gm.notesTitle')}</h3>
            <GmBadge />
          </div>
          <p className="text-xs text-[var(--text-muted)] font-body mb-4">{t('gm.notesHint')}</p>
          <RichText
            content={gmNotes.value}
            onChange={gmNotes.onChange}
            editable={editable}
            mentionItems={gmNotes.mentionItems}
          />
        </div>
      )}
    </div>
  );
}
