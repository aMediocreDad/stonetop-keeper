import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { motion } from 'framer-motion';
import { useCharacters } from '@/hooks/useCharacters';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import { useAppStore } from '@/stores/appStore';
import { emptyThreatSheet } from '@/lib/character/threatSheet';
import { useIsGm } from '@/hooks/useRole';
import { useT, type TKey } from '@/i18n';
import { CHARACTER_TYPES, type CharacterType } from '@/types';

interface CharacterFormProps {
  onClose: () => void;
}

const TYPE_LABELS_FULL: Record<CharacterType, TKey> = {
  PJ: 'character.typePCFull',
  PNJ: 'character.typeNPCFull',
  GROUPE: 'character.typeGroupFull',
  MENACE: 'character.typeThreatFull',
  DISCOVERY: 'character.typeDiscoveryFull',
};

/**
 * Création d'une entrée : un nom, un type, et on ouvre la fiche en édition.
 *
 * Volontairement minimal. Le formulaire dupliquait une demi-fiche (rôle,
 * instinct, lieu, tags, traits, notes) que la fiche elle-même sait éditer,
 * en mieux et avec le contexte sous les yeux — et il fallait la maintenir
 * deux fois. Ce qui reste ici, c'est ce qui ne PEUT PAS attendre la fiche :
 * le nom (identité de la ligne) et le type (il gouverne la forme de la fiche
 * et n'est pas modifiable par un joueur ensuite, cf. supabase-statblock.sql).
 */
export function CharacterForm({ onClose }: CharacterFormProps) {
  const t = useT();
  const isGm = useIsGm();
  const session = useAppStore((s) => s.session);
  const { createCharacter } = useCharacters(session?.space.id);
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFocus(true, onClose, panelRef);

  const [name, setName] = useState('');
  const [type, setType] = useState<CharacterType>('PNJ');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !session) return;

    setLoading(true);
    setError('');
    try {
      const character = await createCharacter({
        space_id: session.space.id,
        name: name.trim(),
        role: '',
        instinct: '',
        type,
        notes: '',
        traits: [],
        tags: [],
        // Threats and discoveries are born hidden: UI convention, not a server
        // constraint. Unticking the box later is how the fiction reveals them
        // — the party finding the medallion, the clue finally landing.
        gm_only: type === 'MENACE' || type === 'DISCOVERY',
        dead: false,
        ...(type === 'MENACE' && { threat: emptyThreatSheet() }),
      });
      // `edit: true` : la fiche s'ouvre en édition (elle attend d'avoir
      // hydraté ses brouillons avant de basculer — cf. CharacterSheetPage).
      navigate(`/character/${character.id}`, { state: { edit: true } });
      onClose();
    } catch (err) {
      // La saisie reste dans le formulaire : l'utilisateur doit juste savoir
      // que rien n'a été créé.
      console.error('Error creating character:', err);
      setError(t('common.saveError'));
    } finally {
      setLoading(false);
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
          aria-labelledby="character-form-title"
          tabIndex={-1}
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-lg card-paper p-8 focus:outline-none"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="absolute top-4 right-4 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X size={20} />
          </button>

          <p className="label-overline mb-1">{t('characterForm.overline')}</p>
          <h2
            id="character-form-title"
            className="font-display text-3xl font-bold text-[var(--text-primary)] mb-2 leading-tight"
          >
            {t('characterForm.title')}
          </h2>
          <p className="text-sm font-body text-[var(--text-muted)] mb-6">
            {t('characterForm.hint')}
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Type — en tête : c'est lui qui décide de la forme de la fiche. */}
            <div>
              <label className="label-overline block mb-2">{t('characterForm.typeLabel')}</label>
              {/* Five full names ("Non-Player Character" included) never fit on
                  ONE row of a `max-w-lg` dialog — do not "tidy" this back to a
                  bare `flex gap-2`, which clips, nor to the `overflow-x-auto`
                  it used to be: a row that scrolls hides options behind an edge
                  and puts a scrollbar under a five-way choice the reader has to
                  see whole. Wrapping is the way out neither of those had.

                  Column count is the widest label's problem. At 360px the
                  dialog's content box is ~264px, so two columns would leave
                  ~104px of text room and clip — one column there, two from `sm`
                  (448px of content → ~196px per cell, one line each). Equal
                  cells rather than natural widths, for the same even rhythm
                  DashboardPage.tsx's filter row (~:373-401) argues for. An odd
                  count leaves the last cell empty on purpose: filling it by
                  spanning the last button would read as a primary option, and
                  the five are peers. `whitespace-nowrap` still holds — no
                  breakpoint is narrow enough to break a label mid-phrase. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {CHARACTER_TYPES
                  // MENACE and DISCOVERY are the GM's prep layer: players
                  // never create either. The dashboard still shows their chips
                  // to a player — reading a revealed one is the point.
                  .filter((typ) => (typ !== 'MENACE' && typ !== 'DISCOVERY') || isGm)
                  .map((typ) => (
                    <button
                      key={typ}
                      type="button"
                      onClick={() => setType(typ)}
                      aria-pressed={type === typ}
                      className={`whitespace-nowrap px-3 sm:px-5 py-2.5 rounded-lg text-sm font-medium font-body transition-colors ${
                        type === typ
                          ? 'bg-[var(--accent-primary)] text-[var(--text-inverse)] border border-[var(--accent-primary)]'
                          : 'bg-transparent border border-[var(--border-paper)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-alt)]'
                      }`}
                    >
                      {t(TYPE_LABELS_FULL[typ])}
                    </button>
                  ))}
              </div>
            </div>

            {/* Name */}
            <div>
              <label htmlFor="cf-name" className="label-overline block mb-2">
                {t('characterForm.nameLabel')}
              </label>
              <input
                id="cf-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  type === 'GROUPE'
                    ? t('characterForm.groupNamePlaceholder')
                    : t('characterForm.namePlaceholder')
                }
                required
                autoFocus
                className="field-paper"
              />
            </div>

            {error && (
              <p id="cf-error" role="alert" className="text-sm font-body text-[var(--danger)]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !name.trim()}
              aria-describedby={error ? 'cf-error' : undefined}
              className="btn-ink w-full"
            >
              {loading
                ? t('characterForm.submitting')
                : type === 'GROUPE'
                  ? t('characterForm.groupSubmit')
                  : type === 'MENACE'
                    ? t('characterForm.threatSubmit')
                    : type === 'DISCOVERY'
                      ? t('characterForm.discoverySubmit')
                      : t('characterForm.submit')}
            </button>
          </form>
        </motion.div>
      </div>
    </motion.div>
  );
}
