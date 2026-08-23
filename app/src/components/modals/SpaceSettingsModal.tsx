import { useEffect, useState } from 'react';
import { useSpace } from '@/hooks/useSpace';
import { useAppStore } from '@/stores/appStore';
import { useT } from '@/i18n';
import { Modal } from '@/components/shared/Modal';
import { ERR_FORBIDDEN, ERR_WRONG_PASSWORD } from '@/lib/db';

interface SpaceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Réglages du grimoire actif (mots de passe MJ/joueur, lecture publique) —
// GM-only, monté depuis le SpaceSwitcher aux côtés de DeleteSpaceModal.
export function SpaceSettingsModal({ isOpen, onClose }: SpaceSettingsModalProps) {
  const t = useT();
  const session = useAppStore((s) => s.session);
  const updateSessionSpace = useAppStore((s) => s.updateSessionSpace);
  const showToast = useAppStore((s) => s.showToast);
  const { updateSpaceSettings } = useSpace();

  const [currentPassword, setCurrentPassword] = useState('');
  const [gmPassword, setGmPassword] = useState('');
  const [playerPassword, setPlayerPassword] = useState('');
  const [playerPasswordDirty, setPlayerPasswordDirty] = useState(false);
  const [publicRead, setPublicRead] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Réinitialise le formulaire à chaque ouverture — les mots de passe ne
  // doivent pas persister d'une session de la modale à l'autre, et
  // `publicRead` doit refléter l'état courant du space actif.
  useEffect(() => {
    if (!isOpen) return;
    /* eslint-disable react-hooks/set-state-in-effect -- resetting a form on
       (re)open, not synchronizing with an external system */
    setCurrentPassword('');
    setGmPassword('');
    setPlayerPassword('');
    setPlayerPasswordDirty(false);
    setPublicRead(session?.space.public_read ?? false);
    setError('');
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [isOpen, session]);

  const canSubmit = currentPassword.trim().length > 0 && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError('');

    // Ne construire que les champs effectivement modifiés : un mot de passe
    // MJ vide signifie "conserver l'actuel" (cf. placeholder), tandis qu'un
    // mot de passe joueur vide N'est envoyé QUE si le champ a été touché
    // (sinon on ne sait pas s'il existait déjà côté serveur — le hash ne
    // quitte jamais celui-ci).
    const patch: { gm_password?: string; player_password?: string; public_read?: boolean } = {
      public_read: publicRead,
    };
    if (gmPassword.trim()) patch.gm_password = gmPassword;
    if (playerPasswordDirty) patch.player_password = playerPassword;

    try {
      await updateSpaceSettings(currentPassword, patch);
      showToast(t('spaceSettings.saved'));
      updateSessionSpace({ public_read: publicRead });
      onClose();
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === ERR_WRONG_PASSWORD) setError(t('spaceSettings.errorWrongPassword'));
      else if (code === ERR_FORBIDDEN) setError(t('errors.forbidden'));
      else setError(t('spaceSettings.errorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={isOpen} onClose={onClose} labelledBy="space-settings-title">
      <p className="label-overline mb-1">{t('spaceSettings.overline')}</p>
      <h2
        id="space-settings-title"
        className="font-display text-3xl font-bold text-[var(--text-primary)] mb-6 leading-tight"
      >
        {t('spaceSettings.title')}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="space-settings-current" className="label-overline block mb-2">
            {t('spaceSettings.currentPasswordLabel')}
          </label>
          <input
            id="space-settings-current"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="field-paper"
            autoFocus
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'space-settings-error' : undefined}
          />
        </div>

        <div>
          <label htmlFor="space-settings-gm" className="label-overline block mb-2">
            {t('spaceSettings.gmPasswordLabel')}
          </label>
          <input
            id="space-settings-gm"
            type="password"
            value={gmPassword}
            onChange={(e) => setGmPassword(e.target.value)}
            placeholder={t('spaceSettings.gmPasswordPlaceholder')}
            className="field-paper"
          />
        </div>

        <div>
          <label htmlFor="space-settings-player" className="label-overline block mb-2">
            {t('spaceSettings.playerPasswordLabel')}
          </label>
          <input
            id="space-settings-player"
            type="password"
            value={playerPassword}
            onChange={(e) => {
              setPlayerPassword(e.target.value);
              setPlayerPasswordDirty(true);
            }}
            placeholder={t('spaceSettings.playerPasswordPlaceholder')}
            className="field-paper"
          />
        </div>

        <label className="flex items-start gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={publicRead}
            onChange={(e) => setPublicRead(e.target.checked)}
            className="mt-0.5 accent-[var(--accent-primary)]"
          />
          <span className="text-sm font-body">
            <span className="font-medium text-[var(--text-primary)]">
              {t('spaceSettings.publicReadLabel')}
            </span>{' '}
            <span className="text-xs text-[var(--text-muted)]">
              — {t('spaceSettings.publicReadHint')}
            </span>
          </span>
        </label>

        {error && (
          <p id="space-settings-error" role="alert" className="text-sm text-[var(--danger)] font-body">
            {error}
          </p>
        )}

        <button type="submit" disabled={!canSubmit} className="btn-ink w-full">
          {loading ? t('spaceSettings.saving') : t('spaceSettings.save')}
        </button>
      </form>
    </Modal>
  );
}
