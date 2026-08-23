import { useState } from 'react';
import { useSpace } from '@/hooks/useSpace';
import { useNavigate } from 'react-router-dom';
import { useT } from '@/i18n';
import { Modal } from '@/components/shared/Modal';
import { SpaceCreatedModal } from './SpaceCreatedModal';

interface CreateSpaceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateSpaceModal({ isOpen, onClose }: CreateSpaceModalProps) {
  const t = useT();
  const [name, setName] = useState('');
  const [gmPassword, setGmPassword] = useState('');
  const [playerPassword, setPlayerPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [createdSpace, setCreatedSpace] = useState<Awaited<ReturnType<ReturnType<typeof useSpace>['createSpace']>> | null>(null);
  const { createSpace, enterSpace } = useSpace();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !gmPassword.trim()) {
      setError(t('createSpace.errorRequired'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const session = await createSpace(name.trim(), gmPassword, playerPassword.trim() || undefined);
      setCreatedSpace(session);
    } catch (err) {
      void err;
      setError(t('createSpace.errorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  // Called when the user acknowledges the login code modal — only THEN we enter the space.
  const handleSuccessClose = () => {
    if (!createdSpace) return;
    const session = createdSpace;
    setCreatedSpace(null);
    onClose();
    enterSpace(session);
    navigate('/dashboard');
  };

  return (
    <>
      {/* Une seule modale (et un seul piège à focus) à la fois : le formulaire
          se referme quand la confirmation de création prend le relais. */}
      <Modal open={isOpen && !createdSpace} onClose={onClose} labelledBy="create-space-title">
        <p className="label-overline mb-1">{t('createSpace.overline')}</p>
        <h2
          id="create-space-title"
          className="font-display text-3xl font-bold text-[var(--text-primary)] mb-6 leading-tight"
        >
          {t('createSpace.title')}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="create-space-name" className="label-overline block mb-2">
              {t('createSpace.nameLabel')}
            </label>
            <input
              id="create-space-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('createSpace.namePlaceholder')}
              className="field-paper"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'create-space-error' : undefined}
            />
          </div>

          <div>
            <label htmlFor="create-space-gm" className="label-overline block mb-2">
              {t('createSpace.gmPasswordLabel')}
            </label>
            <input
              id="create-space-gm"
              type="password"
              value={gmPassword}
              onChange={(e) => setGmPassword(e.target.value)}
              className="field-paper"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'create-space-error' : undefined}
            />
            <p className="text-xs text-[var(--text-muted)] mt-1.5">
              {t('createSpace.gmPasswordHint')}
            </p>
          </div>

          <div>
            <label htmlFor="create-space-player" className="label-overline block mb-2">
              {t('createSpace.playerPasswordLabel')}
            </label>
            <input
              id="create-space-player"
              type="password"
              value={playerPassword}
              onChange={(e) => setPlayerPassword(e.target.value)}
              className="field-paper"
            />
            <p className="text-xs text-[var(--text-muted)] mt-1.5">
              {t('createSpace.playerPasswordHint')}
            </p>
          </div>

          {error && (
            <p id="create-space-error" role="alert" className="text-sm text-[var(--danger)] font-body">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="btn-ink w-full">
            {loading ? t('createSpace.submitting') : t('createSpace.submit')}
          </button>
        </form>
      </Modal>

      {createdSpace && (
        <SpaceCreatedModal
          isOpen={!!createdSpace}
          spaceName={createdSpace.space.name}
          loginCode={createdSpace.space.invite_code}
          onClose={handleSuccessClose}
        />
      )}
    </>
  );
}
