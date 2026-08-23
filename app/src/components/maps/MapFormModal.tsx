import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { motion } from 'framer-motion';
import { LocationPicker } from '@/components/locations/LocationPicker';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import { useMapsData } from '@/hooks/useMaps';
import { useIsGm } from '@/hooks/useRole';
import { prepareMapImage } from '@/lib/map/imageClient';
import { changedKeys } from '@/lib/patch';
import type { PreparedMapImage } from '@/lib/map/imageClient';
import { useT } from '@/i18n';
import type { CampaignMap } from '@/types';

interface MapFormModalProps {
  spaceId: string;
  /** null = création */
  map: CampaignMap | null;
  onClose: () => void;
}

/**
 * Création/édition d'une carte — même formulaire pour les deux cas (calqué
 * sur SpaceSettingsModal pour l'habillage). L'image est optionnelle en
 * édition (vide = on garde l'image actuelle) mais requise à la création.
 *
 * Si l'upload échoue APRÈS la création de la carte, celle-ci existe déjà
 * (sans image) : on la retient dans `createdMap` pour qu'une nouvelle
 * soumission bascule automatiquement en flux "édition" (update + retry
 * upload) plutôt que de créer un doublon.
 */
export function MapFormModal({ spaceId, map, onClose }: MapFormModalProps) {
  const t = useT();
  const isGm = useIsGm();
  const { createMap, updateMap, uploadImage } = useMapsData(spaceId);
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFocus(true, onClose, panelRef);

  const [name, setName] = useState(map?.name ?? '');
  const [description, setDescription] = useState(map?.description ?? '');
  const [locationId, setLocationId] = useState<string | undefined>(map?.location_id ?? undefined);
  const [gmOnly, setGmOnly] = useState(map?.gm_only ?? false);
  const [file, setFile] = useState<File | null>(null);
  const [createdMap, setCreatedMap] = useState<CampaignMap | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const effectiveMap = map ?? createdMap;
  // The row the form fields were seeded from (mount time — the useState
  // initialisers above read it once), so the save writes only what changed.
  // Not `effectiveMap`: a realtime ping can replace that prop mid-edit, and
  // diffing against someone else's newer value is how we would overwrite them.
  const baselineRef = useRef<CampaignMap | null>(map);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    if (!effectiveMap && !file) {
      setError(t('maps.imageRequired'));
      return;
    }

    setBusy(true);
    setError('');

    let prepared: PreparedMapImage | null = null;
    if (file) {
      try {
        prepared = await prepareMapImage(file);
      } catch (err) {
        const code = err instanceof Error ? err.message : '';
        setError(code === 'IMAGE_TOO_LARGE' ? t('maps.imageTooLarge') : t('maps.imageBadType'));
        setBusy(false);
        return;
      }
    }

    // Tracks which await threw so the catch below can pick the right message —
    // "upload failed" would mislabel a create/update failure otherwise.
    let phase: 'save' | 'upload' = 'save';
    try {
      let target = effectiveMap;
      if (!target) {
        target = await createMap({
          name: name.trim(),
          description: description.trim() || undefined,
          location_id: locationId,
          gm_only: isGm ? gmOnly : undefined,
          thumb: prepared?.thumb,
        });
        setCreatedMap(target);
      } else {
        const payload: Partial<CampaignMap> = {
          name: name.trim(),
          description: description.trim() || null,
          location_id: locationId ?? null,
          ...(isGm && { gm_only: gmOnly }),
          ...(prepared ? { thumb: prepared.thumb } : {}),
        };
        // Only the changed columns: the RPC writes a column when its key is
        // present, so sending the untouched ones overwrites a concurrent edit.
        const patch = changedKeys(baselineRef.current, payload);
        if (Object.keys(patch).length > 0) await updateMap(target.id, patch);
      }

      if (prepared) {
        phase = 'upload';
        await uploadImage(target.id, prepared);
      }

      onClose();
    } catch (err) {
      console.error(`[Maps] ${phase} failed:`, err);
      setError(phase === 'upload' ? t('maps.uploadFailed') : t('maps.saveFailed'));
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
          aria-labelledby="map-form-title"
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
            id="map-form-title"
            className="font-display text-3xl font-bold text-[var(--text-primary)] mb-6 leading-tight"
          >
            {map ? t('maps.editMap') : t('maps.addMap')}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="label-overline block mb-2" htmlFor="map-form-name">
              {t('maps.nameLabel')}
            </label>
            <input
              id="map-form-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('maps.namePlaceholder')}
              className="field-paper"
              autoFocus
              required
            />
          </div>

          <div>
            <label className="label-overline block mb-2" htmlFor="map-form-description">
              {t('maps.descriptionLabel')}
            </label>
            <textarea
              id="map-form-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="field-paper-area"
            />
          </div>

          <div>
            <label className="label-overline block mb-2">{t('maps.locationLabel')}</label>
            <LocationPicker spaceId={spaceId} value={locationId} onChange={setLocationId} />
          </div>

          <div>
            <label className="label-overline block mb-2" htmlFor="map-form-image">
              {t('maps.imageLabel')}
            </label>
            {effectiveMap?.thumb && !file && (
              <img
                src={effectiveMap.thumb}
                alt=""
                className="w-full h-24 object-cover rounded-md mb-2 border border-[var(--border-paper)]"
              />
            )}
            <input
              id="map-form-image"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'map-form-error' : undefined}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError('');
              }}
              required={!effectiveMap}
              className="field-paper h-auto py-2 file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-[var(--bg-card-alt)] file:text-[var(--text-secondary)] file:font-body file:text-sm"
            />
            <p className="text-xs text-[var(--text-muted)] font-body mt-1">
              {t('maps.imageHint')}
            </p>
          </div>

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
            <p id="map-form-error" role="alert" className="text-sm text-[var(--danger)] font-body">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-outline flex-1">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={busy || !name.trim()} className="btn-ink flex-1">
              {busy ? t('maps.uploading') : t('common.save')}
            </button>
          </div>
          </form>
        </motion.div>
      </div>
    </motion.div>
  );
}
