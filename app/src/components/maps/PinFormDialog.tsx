import { useRef, useState } from 'react';
import { X, MapPin as MapPinIcon } from 'lucide-react';
import { CharacterStamp, GroupStamp } from '@/components/shared/entityIcons';
import { StampIcon } from '@/components/shared/StampIcon';
import { motion } from 'framer-motion';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import {
  buildMentionItems,
  characterMentionItem,
  locationMentionItem,
  parseMentionId,
  type MentionItem,
} from '@/components/editor/mentionItems';
import { compareNames } from '@/lib/sortByName';
import { useIsGm } from '@/hooks/useRole';
import { useT } from '@/i18n';
import type { Character, Location, MapPin } from '@/types';

type PinType = 'entity' | 'note';

// Lieu « simple » : même goutte que les épingles note (la bourgade, elle,
// arrive avec son icône spécifique via `locationMentionItem`).
const KIND_ICONS = { character: CharacterStamp, group: GroupStamp, location: MapPinIcon };

/** Icône d'un item : tampon spécifique (livret d'un PJ) sinon celle du kind. */
function ItemIcon({ item, size, className }: { item: MentionItem; size: number; className?: string }) {
  if (item.icon) return <StampIcon src={item.icon} size={size} className={className} />;
  const Icon = KIND_ICONS[item.kind];
  return <Icon size={size} className={className} />;
}

/**
 * Payload remonté au parent (MapViewerPage), qui appelle createPin/updatePin.
 * `gm_only` optionnel à dessein : absent pour les non-MJ, jamais `false` —
 * `create_map_pin`/`update_map_pin` rejettent la simple PRÉSENCE de la clé
 * venant d'un joueur (voir CLAUDE.md / règle serveur).
 */
export interface PinFormSubmitData {
  x: number;
  y: number;
  character_id?: string | null;
  location_id?: string | null;
  label?: string | null;
  note?: string | null;
  gm_only?: boolean;
}

interface PinFormDialogProps {
  characters: Character[];
  locations: Location[];
  /** création : coordonnées du clic ; édition : l'épingle existante */
  pending: { x: number; y: number } | null;
  editing: MapPin | null;
  onSubmit: (data: PinFormSubmitData) => Promise<void>;
  onClose: () => void;
}

/** Item sélectionné reconstruit depuis l'épingle éditée (lien immuable). */
function itemFromPin(pin: MapPin, characters: Character[], locations: Location[]): MentionItem | null {
  if (pin.character_id) {
    const c = characters.find((ch) => ch.id === pin.character_id);
    if (!c) return null;
    return characterMentionItem(c);
  }
  if (pin.location_id) {
    const l = locations.find((loc) => loc.id === pin.location_id);
    if (!l) return null;
    return locationMentionItem(l);
  }
  return null;
}

/**
 * Création/édition d'une épingle — même habillage que MapFormModal. Le type
 * (fiche liée / note libre) est figé à la création : les liens
 * personnage/lieu sont immuables une fois posés (changer le lien = supprimer
 * + recréer l'épingle), donc l'édition ne touche plus que libellé/note/gm_only.
 */
export function PinFormDialog({
  characters,
  locations,
  pending,
  editing,
  onSubmit,
  onClose,
}: PinFormDialogProps) {
  const t = useT();
  const isGm = useIsGm();
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFocus(true, onClose, panelRef);

  const isEdit = editing !== null;
  const coords = editing ?? pending;

  const [pinType, setPinType] = useState<PinType>(() =>
    editing ? (editing.character_id || editing.location_id ? 'entity' : 'note') : 'entity',
  );
  const [query, setQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<MentionItem | null>(() =>
    editing ? itemFromPin(editing, characters, locations) : null,
  );
  const [label, setLabel] = useState(editing?.label ?? '');
  const [note, setNote] = useState(editing?.note ?? '');
  const [gmOnly, setGmOnly] = useState(editing?.gm_only ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const mentionItems = buildMentionItems(characters, locations);
  const q = query.toLowerCase().trim();
  const filteredItems = mentionItems
    .filter((i) => !q || i.label.toLowerCase().includes(q))
    .sort((a, b) => {
      const ap = a.label.toLowerCase().startsWith(q) ? 0 : 1;
      const bp = b.label.toLowerCase().startsWith(q) ? 0 : 1;
      return ap - bp || compareNames(a.label, b.label);
    })
    .slice(0, 8);

  const invalid = pinType === 'entity' ? !isEdit && !selectedItem : !label.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || invalid || !coords) return;

    setBusy(true);
    setError('');
    try {
      const parsed = !isEdit && pinType === 'entity' && selectedItem ? parseMentionId(selectedItem.id) : null;
      await onSubmit({
        x: coords.x,
        y: coords.y,
        ...(!isEdit && pinType === 'entity'
          ? {
              character_id: parsed?.kind === 'character' ? parsed.id : null,
              location_id: parsed?.kind === 'location' ? parsed.id : null,
            }
          : {}),
        label: label.trim() || null,
        note: pinType === 'note' ? note.trim() || null : null,
        ...(isGm && { gm_only: gmOnly }),
      });
      onClose();
    } catch (err) {
      console.error('[Maps] pin save failed:', err);
      setError(t('maps.uploadFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ backgroundColor: 'var(--scrim)' }}
      onClick={onClose}
    >
      <div className="flex min-h-full items-center justify-center p-4">
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="pin-form-title"
          tabIndex={-1}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-md card-paper p-8 focus:outline-none"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            aria-label={t('common.close')}
          >
            <X size={20} />
          </button>

          <p className="label-overline mb-1">{t('maps.overline')}</p>
          <h2
            id="pin-form-title"
            className="font-display text-3xl font-bold text-[var(--text-primary)] mb-6 leading-tight"
          >
            {isEdit ? t('maps.editPin') : t('maps.addPin')}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
          {!isEdit && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPinType('entity')}
                aria-pressed={pinType === 'entity'}
                className={`flex-1 ${pinType === 'entity' ? 'btn-ink' : 'btn-outline'}`}
              >
                {t('maps.pinTypeEntity')}
              </button>
              <button
                type="button"
                onClick={() => setPinType('note')}
                aria-pressed={pinType === 'note'}
                className={`flex-1 ${pinType === 'note' ? 'btn-ink' : 'btn-outline'}`}
              >
                {t('maps.pinTypeNote')}
              </button>
            </div>
          )}

          {pinType === 'entity' && (
            <div>
              <label htmlFor="pin-entity-search" className="label-overline block mb-2">
                {t('maps.pinEntityLabel')}
              </label>

              {isEdit ? (
                // Lien figé en édition — pas de re-sélection possible.
                <div className="field-paper flex items-center gap-2 opacity-70">
                  {selectedItem && <ItemIcon item={selectedItem} size={14} className="flex-shrink-0" />}
                  <span className="truncate text-sm">{selectedItem?.label ?? '—'}</span>
                </div>
              ) : selectedItem ? (
                <div className="field-paper flex items-center gap-2">
                  <ItemIcon item={selectedItem} size={14} className="flex-shrink-0" />
                  <span className="flex-1 truncate text-sm">{selectedItem.label}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedItem(null);
                      setQuery('');
                    }}
                    className="flex-shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    aria-label={t('common.close')}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <input
                    id="pin-entity-search"
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('maps.pinEntityPlaceholder')}
                    className="field-paper"
                    autoFocus
                  />
                  {filteredItems.length > 0 && (
                    <div className="mt-1.5 max-h-40 overflow-y-auto rounded-md border border-[var(--border-paper)] divide-y divide-[var(--border-subtle)]">
                      {filteredItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedItem(item)}
                          className="w-full text-left px-3 py-2 inline-flex items-center gap-2 text-sm font-body text-[var(--text-secondary)] hover:bg-[var(--bg-card-alt)] transition-colors"
                        >
                          <ItemIcon item={item} size={14} className="flex-shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div>
            <label className="label-overline block mb-2" htmlFor="pin-form-label">
              {t('maps.pinLabelLabel')}
            </label>
            <input
              id="pin-form-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="field-paper"
              required={pinType === 'note'}
            />
          </div>

          {pinType === 'note' && (
            <div>
              <label className="label-overline block mb-2" htmlFor="pin-form-note">
                {t('maps.pinNoteLabel')}
              </label>
              <textarea
                id="pin-form-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                className="field-paper-area"
              />
            </div>
          )}

          {isGm && (
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={gmOnly}
                onChange={(e) => setGmOnly(e.target.checked)}
                className="mt-0.5 accent-[var(--accent-primary)]"
              />
              <span className="text-sm font-body font-medium text-[var(--text-primary)]">
                {t('maps.gmOnlyLabel')}
              </span>
            </label>
          )}

          {error && (
            <p id="pin-form-error" role="alert" className="text-sm text-[var(--danger)] font-body">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-outline flex-1">
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={busy || invalid}
              aria-describedby={error ? 'pin-form-error' : undefined}
              className="btn-ink flex-1"
            >
              {busy ? t('maps.uploading') : t('common.save')}
            </button>
          </div>
          </form>
        </motion.div>
      </div>
    </motion.div>
  );
}
