import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useT } from '@/i18n';
import { Modal } from '@/components/shared/Modal';

interface ConnectLlmModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Hands the member the one-liner that points Claude Code at this grimoire. The
 * token in it is the session token they already hold, so the MCP server needs
 * no credential of its own and the role they joined with decides what Claude
 * sees — a player gets the player's view, with no GM layer.
 *
 * The origin is read from the live location rather than hardcoded, so a
 * self-hosted instance produces its own URL.
 */
export function ConnectLlmModal({ isOpen, onClose }: ConnectLlmModalProps) {
  const t = useT();
  const session = useAppStore((s) => s.session);
  const [copied, setCopied] = useState(false);

  if (!session) return null;

  const endpoint = `${window.location.origin}/mcp`;
  const command = `claude mcp add --transport http stonetop ${endpoint} --header "Authorization: Bearer ${session.token}"`;

  const handleCopy = () => {
    void navigator.clipboard.writeText(command);
    setCopied(true);
  };

  return (
    <Modal open={isOpen} onClose={onClose} labelledBy="connect-llm-title">
      <p className="label-overline mb-1">{t('connectLlm.overline')}</p>
      <h2
        id="connect-llm-title"
        className="font-display text-3xl font-bold text-[var(--text-primary)] mb-4 leading-tight"
      >
        {t('connectLlm.title')}
      </h2>

      <p className="text-sm font-body text-[var(--text-secondary)] mb-5">{t('connectLlm.intro')}</p>

      {/* Le rôle porté par la commande — un jeton joueur donne à Claude la vue
          joueur, sans couche MJ ; le dire ici évite un débogage plus tard. */}
      <p className="text-sm font-body text-[var(--text-secondary)] mb-5">
        {session.role === 'gm'
          ? t('connectLlm.roleGm')
          : session.role === 'player'
            ? t('connectLlm.rolePlayer')
            : t('connectLlm.roleViewer')}
      </p>

      <p className="label-overline mb-2">{t('connectLlm.commandLabel')}</p>
      <pre className="mb-4 max-h-40 overflow-auto rounded border border-[var(--border-paper)] bg-[var(--bg-card-alt)] p-3 text-xs font-mono whitespace-pre-wrap break-all text-[var(--text-primary)]">
        {command}
      </pre>

      <p className="text-xs font-body text-[var(--text-muted)] mb-5">{t('connectLlm.warning')}</p>

      <div className="flex gap-2">
        <button type="button" onClick={handleCopy} className="btn-ink flex-1">
          <span className="inline-flex items-center justify-center gap-2">
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? t('connectLlm.copied') : t('connectLlm.copy')}
          </span>
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-md text-sm font-body text-[var(--text-secondary)] hover:bg-[var(--bg-card-alt)] transition-colors"
        >
          {t('connectLlm.close')}
        </button>
      </div>
    </Modal>
  );
}
