import { useEffect, useRef, useState } from 'react';
import { ChevronDown, MapPin, Plus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocations } from '@/hooks/useLocations';
import { DEFAULT_LOCATION_PALETTE, FALLBACK_LOCATION_COLOR } from '@/lib/constants';
import { byName } from '@/lib/sortByName';
import { useT } from '@/i18n';
import type { Location } from '@/types';


interface LocationPickerProps {
  spaceId: string | undefined;
  value: string | undefined;
  onChange: (id: string | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  /**
   * Hauteur de champ de fiche (h-8) au lieu du champ de formulaire (2,75rem) :
   * sur une fiche, ce sélecteur est une LIGNE parmi des lignes (rôle, instinct)
   * et sa boîte de 44px la faisait deux fois trop haute. Même trio de classes
   * que les autres selects de fiche — pas d'échelle de tailles inventée. À
   * laisser faux dans les formulaires/modales, où le champ est pleine largeur.
   */
  compact?: boolean;
}
export function LocationPicker({
  spaceId,
  value,
  onChange,
  placeholder,
  disabled,
  compact,
}: LocationPickerProps) {
  const t = useT();
  const { locations, createLocation } = useLocations(spaceId);
  const effectivePlaceholder = placeholder ?? t('locations.pickerPlaceholder');

  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const selected: Location | undefined = locations.find((l) => l.id === value);

  // Fermer au clic extérieur
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setShowCreate(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`field-paper flex items-center gap-2 w-full text-left ${
          compact ? 'h-8 pl-2.5 pr-2.5' : ''
        } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <MapPin
          size={14}
          style={{ color: selected?.color ?? FALLBACK_LOCATION_COLOR }}
          className="flex-shrink-0"
        />
        <span
          className={`flex-1 truncate text-sm ${
            selected ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
          }`}
        >
          {selected?.name ?? effectivePlaceholder}

        </span>
        <ChevronDown size={14} className="text-[var(--text-muted)] flex-shrink-0" />
      </button>

      <AnimatePresence>
        {open && !disabled && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute z-30 left-0 right-0 mt-1 card-paper shadow-lg"
          >
            {/* La liste garde son propre clipping (coins arrondis + scroll),
                mais le conteneur n'a PLUS `overflow-hidden` : sinon la palette
                de couleurs du formulaire « créer un lieu » (popover absolu en
                pied de dropdown) serait coupée faute de hauteur. */}
            <div className="max-h-64 overflow-y-auto py-1 rounded-t-xl">
              {/* Option "Sans lieu" */}
              <PickerOption
                color={FALLBACK_LOCATION_COLOR}
                label={t('locations.pickerNone')}
                active={!value}

                onClick={() => {
                  onChange(undefined);
                  setOpen(false);
                }}
              />

              {locations.length > 0 && (
                <div className="my-1 border-t border-[var(--border-subtle)]" />
              )}

              {[...locations].sort(byName).map((loc) => (
                <PickerOption
                  key={loc.id}
                  color={loc.color}
                  label={loc.name}
                  active={loc.id === value}
                  onClick={() => {
                    onChange(loc.id);
                    setOpen(false);
                  }}
                />
              ))}
            </div>

            <div className="border-t border-[var(--border-subtle)] p-1">
              {showCreate ? (
                <CreateLocationInline
                  onCreate={async (data) => {
                    const loc = await createLocation(data);
                    onChange(loc.id);
                    setShowCreate(false);
                    setOpen(false);
                  }}
                  onCancel={() => setShowCreate(false)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="w-full text-left px-3 py-2 rounded text-sm font-body text-[var(--text-secondary)] hover:bg-[var(--bg-card-alt)] inline-flex items-center gap-2 transition-colors"
                >
                  <Plus size={14} />
                  {t('locations.pickerCreateNew')}
                </button>

              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PickerOption({
  color,
  label,
  active,
  onClick,
}: {
  color: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-2 inline-flex items-center gap-2 text-sm font-body transition-colors ${
        active
          ? 'bg-[var(--bg-card-alt)] text-[var(--text-primary)] font-medium'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card-alt)]'
      }`}
    >
      <span
        aria-hidden
        className="w-3 h-3 rounded-sm border border-[var(--border-subtle)] flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="flex-1 truncate">{label}</span>
    </button>
  );
}

function CreateLocationInline({
  onCreate,
  onCancel,
}: {
  onCreate: (data: { name: string; color: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useT();
  // Couleur par défaut tirée au sort dans la palette
  const [color, setColor] = useState<string>(

    () =>
      DEFAULT_LOCATION_PALETTE[
        Math.floor(Math.random() * DEFAULT_LOCATION_PALETTE.length)
      ]
  );
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onCreate({ name: name.trim(), color });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-2 space-y-2">
      <div className="flex items-center gap-2">
        <ColorSwatch value={color} onChange={setColor} />
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onCancel();
            }
          }}
          placeholder={t('locations.addPlaceholder')}
          aria-label={t('locations.addOverline')}
          className="field-paper text-sm h-9 flex-1"
        />
      </div>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={submit}
          disabled={!name.trim() || submitting}
          className="btn-ink flex-1 h-9 text-xs disabled:opacity-40"
        >
          {submitting ? t('characterForm.submitting') : t('locations.createAndSelect')}

        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-9 px-3 border border-[var(--border-paper)] rounded-lg hover:bg-[var(--bg-card-alt)] text-[var(--text-muted)]"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}


function ColorSwatch({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-9 h-9 shrink-0 rounded-lg border border-[var(--border-paper)] hover:border-[var(--border-focus)] transition-colors"
        style={{ backgroundColor: value }}
        title={t('locations.pickColor')}
      />

      {open && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute z-40 top-full left-0 mt-1 card-paper p-2 shadow-lg w-fit"
        >
          {/* w-7 (28px) + gap-1.5 : les pastilles de 20px étaient sous le
              seuil tactile — et c'est un contrôle tapé en pleine séance. */}
          <div className="grid grid-cols-6 gap-1.5">
            {DEFAULT_LOCATION_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                className={`w-7 h-7 rounded border transition-transform hover:scale-110 ${
                  c === value
                    ? 'border-[var(--text-primary)] scale-110'
                    : 'border-[var(--border-subtle)]'
                }`}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-[var(--border-subtle)]">
            <label className="font-body text-xs uppercase tracking-wider text-[var(--text-muted)] block mb-1">
              {t('locations.customColor')}
            </label>

            <input
              type="color"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="w-full h-7 rounded border border-[var(--border-paper)] cursor-pointer"
            />
          </div>
        </motion.div>
      )}
    </div>
  );
}

export { ColorSwatch };
