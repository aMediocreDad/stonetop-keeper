import { useState } from 'react';
import { Download } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useT } from '@/i18n';
import { Modal } from '@/components/shared/Modal';
import { useCanExport } from '@/hooks/useRole';
import { downloadVault, type ExportProgress } from '@/lib/export/download';

interface ExportVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Stamped into the manifest as `app.version`. It is the **vault format writer's**
 * version, not the app package's — it tells a future importer which writer
 * produced the file, which is what actually matters when reading one back.
 * Bump it when the vault format changes, not when the app ships.
 */
const VAULT_WRITER_VERSION = '1.0.0';

/**
 * Downloads the grimoire as an Obsidian-shaped Markdown vault.
 *
 * Offered to players and the GM, at their own role: the export is built from the
 * same role-filtered reads the app already uses, so a player gets a complete
 * vault of what players can see. The role is stated up front rather than
 * discovered later, and recorded in the file's manifest.
 *
 * Viewers are refused here as well as in the menu, so an entry point added later
 * cannot reopen the affordance by forgetting the check.
 */
export function ExportVaultModal({ isOpen, onClose }: ExportVaultModalProps) {
  const t = useT();
  const canExport = useCanExport();
  const session = useAppStore((s) => s.session);
  // Counts come from the store the app has already loaded — mounting the loader
  // hooks here would refetch the space just to print two numbers.
  const characters = useAppStore((s) => s.characters);
  const locations = useAppStore((s) => s.locations);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  if (!session || !canExport) return null;
  const busy = progress !== null && progress.stage !== 'done';

  // Only two roles reach this line now — a viewer never renders the modal.
  const roleLine = session.role === 'gm' ? t('exportVault.roleGm') : t('exportVault.rolePlayer');

  const stageLine = () => {
    if (!progress) return '';
    if (progress.stage === 'reading') return t('exportVault.stageReading');
    if (progress.stage === 'images') {
      return t('exportVault.stageImages', { done: progress.done ?? 0, total: progress.total ?? 0 });
    }
    if (progress.stage === 'writing') return t('exportVault.stageWriting');
    return '';
  };

  // A failure from a previous attempt is not news the next time the modal opens.
  const handleClose = () => {
    setFailed(null);
    onClose();
  };

  const handleExport = async () => {
    setFailed(null);
    setProgress({ stage: 'reading' });
    try {
      await downloadVault(session.space, session.role, VAULT_WRITER_VERSION, setProgress);
      onClose();
    } catch (err) {
      // Never swallow this. A bare `catch {}` here once turned a real crash —
      // an old threat sheet whose `stakes` were still an HTML string — into
      // "please try again" with a silent console, which is undebuggable for
      // whoever hits it. The reason goes to the console AND onto the screen.
      console.error('[export] vault build failed', err);
      setFailed(err instanceof Error ? err.message : String(err));
    } finally {
      setProgress(null);
    }
  };

  return (
    <Modal open={isOpen} onClose={busy ? () => {} : handleClose} labelledBy="export-vault-title">
      <p className="label-overline mb-1">{t('exportVault.overline')}</p>
      <h2
        id="export-vault-title"
        className="font-display text-3xl font-bold text-[var(--text-primary)] mb-4 leading-tight"
      >
        {t('exportVault.title')}
      </h2>

      <p className="text-sm font-body text-[var(--text-secondary)] mb-5">{t('exportVault.intro')}</p>
      <p className="text-sm font-body text-[var(--text-secondary)] mb-5">{roleLine}</p>

      <p className="label-overline mb-2">{t('exportVault.contents')}</p>
      {/* Label-and-count rather than "1 characters" — no pluralisation to get
          wrong, and it reads as a manifest, which is what it is. */}
      <ul className="mb-5 space-y-1 text-sm font-body text-[var(--text-secondary)]">
        <li>
          {t('exportVault.countCharacters')}: {characters.length}
        </li>
        <li>
          {t('exportVault.countLocations')}: {locations.length}
        </li>
      </ul>

      <p className="text-xs font-body text-[var(--text-muted)] mb-5">{t('exportVault.obsidian')}</p>

      {busy && (
        <p
          className="text-sm font-body text-[var(--text-secondary)] mb-4"
          role="status"
          aria-live="polite"
        >
          {stageLine()}
        </p>
      )}
      {failed && (
        <div className="mb-4" role="alert">
          <p className="text-sm font-body text-[var(--text-danger)]">{t('exportVault.error')}</p>
          <p className="mt-1 text-xs font-mono break-words text-[var(--text-muted)]">{failed}</p>
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={handleExport} disabled={busy} className="btn-ink flex-1">
          <span className="inline-flex items-center justify-center gap-2">
            <Download size={14} />
            {busy ? t('exportVault.working') : t('exportVault.action')}
          </span>
        </button>
        <button
          type="button"
          onClick={handleClose}
          disabled={busy}
          className="px-4 py-2 rounded-md text-sm font-body text-[var(--text-secondary)] hover:bg-[var(--bg-card-alt)] transition-colors"
        >
          {t('exportVault.close')}
        </button>
      </div>
    </Modal>
  );
}
