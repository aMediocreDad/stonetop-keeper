
import { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSpace } from '@/hooks/useSpace';
import { useAppStore } from '@/stores/appStore';
import { useT } from '@/i18n';
import { Modal } from '@/components/shared/Modal';
import { db, ERR_WRONG_PASSWORD } from '@/lib/db';

interface DeleteSpaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  spaceId: string;
  spaceName: string;
}

export function DeleteSpaceModal({ isOpen, onClose, spaceId, spaceName }: DeleteSpaceModalProps) {
  const t = useT();
  const navigate = useNavigate();
  const { deleteSpace } = useSpace();
  const leaveSpace = useAppStore((s) => s.leaveSpace);
  const showToast = useAppStore((s) => s.showToast);

  const [password, setPassword] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Compteurs de l'avertissement — chargés à l'ouverture pour que la modale
  // reste autonome (appelable depuis le header sans données du dashboard).
  const [counts, setCounts] = useState<{
    characters: number;
    relations: number;
    locations: number;
  } | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    Promise.all([
      db.getSpaceCharacters(spaceId),
      db.getSpaceRelations(spaceId),
      db.getSpaceLocations(spaceId),
    ])
      .then(([chars, rels, locs]) => {
        if (alive)
          setCounts({ characters: chars.length, relations: rels.length, locations: locs.length });
      })
      .catch(() => alive && setCounts(null));
    return () => {
      alive = false;
    };
  }, [isOpen, spaceId]);

  const nameMatches = confirmName.trim() === spaceName;
  const canSubmit = password.length > 0 && nameMatches && !loading;

  const reset = () => {
    setPassword('');
    setConfirmName('');
    setError('');
    setLoading(false);
  };

  const handleClose = () => {
    if (loading) return;
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError('');
    try {
      await deleteSpace(spaceId, password);
      // Succès : retirer le grimoire supprimé du switcher (les autres restent),
      // puis rediriger vers un grimoire restant ou l'accueil.
      leaveSpace(spaceId);
      showToast(t('deleteSpace.deleted', { name: spaceName }));
      // Fermer AVANT de naviguer. Si l'appareil détient un autre grimoire, le
      // switcher (et cette modale) restent montés après la redirection — sans
      // reset/onClose ici, la modale restait ouverte avec `loading` à vrai,
      // donc indéfermable (Échap neutralisé, croix désactivée, scrim inerte)
      // ET le piège de focus toujours actif : un vrai keyboard trap.
      reset();
      onClose();
      navigate(useAppStore.getState().session ? '/dashboard' : '/');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === ERR_WRONG_PASSWORD) {
        setError(t('deleteSpace.errorWrongPassword'));
      } else {
        setError(t('deleteSpace.errorGeneric'));
      }
      setLoading(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      dismissible={!loading}
      labelledBy="delete-space-title"
      panelClassName="border-2 [border-color:var(--danger)]"
    >
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle size={16} className="text-[var(--danger)]" aria-hidden />
        <p className="label-overline text-[var(--danger)]">
          {t('deleteSpace.overline')}
        </p>
      </div>
      <h2
        id="delete-space-title"
        className="font-display text-3xl font-bold text-[var(--text-primary)] mb-4 leading-tight"
      >
        {t('deleteSpace.title')}
      </h2>

      {/* Avertissement chiffré */}
      <div className="rounded-md p-4 mb-5 text-sm font-body space-y-1 bg-[var(--danger-soft)] border border-[var(--danger-border)] text-[var(--danger)]">
        <p className="font-semibold">
          {t('deleteSpace.warning', { name: spaceName })}
        </p>
        {counts && (
          <p>
            {t('deleteSpace.warningCounts', {
              characters: counts.characters,
              relations: counts.relations,
              locations: counts.locations,
            })}
          </p>
        )}
        <p className="font-semibold">{t('deleteSpace.warningIrreversible')}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="delete-space-password" className="label-overline block mb-2">
            {t('deleteSpace.passwordLabel')}
          </label>
          <input
            id="delete-space-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('deleteSpace.passwordPlaceholder')}
            className="field-paper"
            autoFocus
            disabled={loading}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'delete-space-error' : undefined}
          />
        </div>

        <div>
          <label htmlFor="delete-space-confirm" className="label-overline block mb-2">
            {t('deleteSpace.confirmNameLabel', { name: spaceName })}
          </label>
          <input
            id="delete-space-confirm"
            type="text"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={spaceName}
            className="field-paper"
            disabled={loading}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {error && (
          <p id="delete-space-error" role="alert" className="text-sm text-[var(--danger)] font-body">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="btn-outline flex-1"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md font-medium font-body bg-[var(--danger)] text-[var(--text-inverse)] hover:bg-[var(--danger-strong)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? t('deleteSpace.submitting') : t('deleteSpace.submit')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
