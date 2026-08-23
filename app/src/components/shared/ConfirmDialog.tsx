import { Modal } from '@/components/shared/Modal';
import { useT } from '@/i18n';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  /** Action irréversible : bouton de confirmation en encre rouge. */
  destructive?: boolean;
}

/**
 * Confirmation thème « Encre & Pierre » — remplace les confirm() natifs.
 * Contrôlé par le parent : `open` + `onOpenChange(false)` à la fermeture.
 * Bâti sur `Modal` (rôle alertdialog, piège à focus, Échap, retour du focus).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  destructive = false,
}: ConfirmDialogProps) {
  const t = useT();

  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      role="alertdialog"
      showClose={false}
      labelledBy="confirm-dialog-title"
      describedBy="confirm-dialog-description"
      panelClassName={destructive ? 'border-2 [border-color:var(--danger)]' : ''}
    >
      <h2
        id="confirm-dialog-title"
        className="font-display text-2xl font-bold text-[var(--text-primary)] mb-2 leading-tight"
      >
        {title}
      </h2>
      <p
        id="confirm-dialog-description"
        className="font-body text-sm text-[var(--text-muted)] mb-6"
      >
        {description}
      </p>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="btn-outline flex-1"
          autoFocus
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          className={
            destructive
              ? 'flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-md font-medium font-body bg-[var(--danger)] text-[var(--text-inverse)] hover:bg-[var(--danger-strong)] transition-colors'
              : 'btn-ink flex-1'
          }
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
