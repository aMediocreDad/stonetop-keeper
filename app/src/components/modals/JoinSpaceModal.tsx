import { useState, useEffect } from 'react';
import { useSpace } from '@/hooks/useSpace';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useT } from '@/i18n';
import { Modal } from '@/components/shared/Modal';

interface JoinSpaceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function JoinSpaceModal({ isOpen, onClose }: JoinSpaceModalProps) {
  const t = useT();
  const [searchParams] = useSearchParams();
  const [inviteCode, setInviteCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { joinSpace } = useSpace();
  const navigate = useNavigate();

  // Pre-fill invite code from URL (sync param → state UI modifiable)
  useEffect(() => {
    const joinCode = searchParams.get('join');
    if (joinCode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInviteCode(joinCode);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) {
      setError(t('joinSpace.errorRequired'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      await joinSpace(inviteCode.trim(), password);
      navigate('/dashboard');
      onClose();
    } catch (err) {
      // Map stable error codes thrown by db.joinSpace → localised label.
      const code = err instanceof Error ? err.message : '';
      if (code === 'WRONG_PASSWORD')      setError(t('joinSpace.errorWrongPassword'));
      else if (code === 'SPACE_NOT_FOUND') setError(t('joinSpace.errorInvalid'));
      else                                setError(t('joinSpace.errorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={isOpen} onClose={onClose} labelledBy="join-space-title">
      <p className="label-overline mb-1">{t('joinSpace.overline')}</p>
      <h2
        id="join-space-title"
        className="font-display text-3xl font-bold text-[var(--text-primary)] mb-6 leading-tight"
      >
        {t('joinSpace.title')}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="join-space-code" className="label-overline block mb-2">
            {t('joinSpace.codeLabel')}
          </label>
          <input
            id="join-space-code"
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder={t('joinSpace.codePlaceholder')}
            className="field-paper"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'join-space-error' : undefined}
          />
        </div>

        <div>
          <label htmlFor="join-space-password" className="label-overline block mb-2">
            {t('joinSpace.passwordLabel')}
          </label>
          <input
            id="join-space-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('joinSpace.passwordPlaceholder')}
            className="field-paper"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'join-space-error' : undefined}
          />
          <p className="text-xs text-[var(--text-muted)] mt-1.5">
            {t('joinSpace.passwordOptionalHint')}
          </p>
        </div>

        {error && (
          <p id="join-space-error" role="alert" className="text-sm text-[var(--danger)] font-body">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className="btn-ink w-full">
          {loading ? t('joinSpace.submitting') : t('joinSpace.submit')}
        </button>
      </form>
    </Modal>
  );
}
