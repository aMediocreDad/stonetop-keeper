import { Copy, Check, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { useT } from '@/i18n';
import { Modal } from '@/components/shared/Modal';

interface SpaceCreatedModalProps {
  isOpen: boolean;
  spaceName: string;
  loginCode: string;
  onClose: () => void;
}

export function SpaceCreatedModal({ isOpen, spaceName, loginCode, onClose }: SpaceCreatedModalProps) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(loginCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal open={isOpen} onClose={onClose} labelledBy="space-created-title">
      <p className="label-overline mb-1">{t('spaceCreated.overline')}</p>
      <h2
        id="space-created-title"
        className="font-display text-3xl font-bold text-[var(--text-primary)] mb-6 leading-tight"
      >
        {t('spaceCreated.title')}
      </h2>

      <div className="space-y-5">
        <div>
          <p className="label-overline mb-2">{t('spaceCreated.nameLabel')}</p>
          <div className="field-paper bg-[var(--bg-card-alt)] cursor-default flex items-center">
            {spaceName}
          </div>
        </div>

        <div>
          <p className="label-overline mb-2">{t('spaceCreated.loginCodeLabel')}</p>
          <div className="flex gap-2">
            <div className="field-paper bg-[var(--bg-card-alt)] flex-1 font-mono cursor-default flex items-center">
              {loginCode}
            </div>
            <button
              onClick={handleCopy}
              className="btn-outline px-4 flex items-center gap-2"
              type="button"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? t('spaceCreated.copied') : t('spaceCreated.copyCode')}
            </button>
          </div>
        </div>

        <div className="rounded-lg border p-4 bg-[var(--warning-soft)] border-[var(--warning-border)]">
          <p className="font-semibold mb-2 font-body text-sm text-[var(--warning)] flex items-center gap-1.5">
            <AlertTriangle size={15} aria-hidden />
            {t('spaceCreated.warningTitle')}
          </p>
          <p className="text-sm text-[var(--text-secondary)] font-body leading-relaxed">
            {t('spaceCreated.warningText')}
          </p>
        </div>

        <button onClick={onClose} className="btn-ink w-full">
          {t('spaceCreated.gotIt')}
        </button>
      </div>
    </Modal>
  );
}
