import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Plus, LogIn, Check, Trash2, Settings, ScrollText, Terminal, Download } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { CreateSpaceModal } from '@/components/modals/CreateSpaceModal';
import { JoinSpaceModal } from '@/components/modals/JoinSpaceModal';
import { DeleteSpaceModal } from '@/components/modals/DeleteSpaceModal';
import { SpaceSettingsModal } from '@/components/modals/SpaceSettingsModal';
import { ConnectLlmModal } from '@/components/modals/ConnectLlmModal';
import { ExportVaultModal } from '@/components/modals/ExportVaultModal';
import { useCanConnectLlm, useCanExport, useIsGm } from '@/hooks/useRole';
import { isSupabaseConfigured } from '@/lib/db';
import { useT } from '@/i18n';

// Header dropdown: hop between every grimoire this device holds a token for
// (the Zustand `sessions` map), or create/join another. Switching just
// re-points the active session — the per-space token authorises the new space
// and the data hooks reload (keyed on space id). No server round-trip.
export function SpaceSwitcher() {
  const t = useT();
  const navigate = useNavigate();
  const session = useAppStore((s) => s.session);
  const sessions = useAppStore((s) => s.sessions);
  const switchSpace = useAppStore((s) => s.switchSpace);
  const isGm = useIsGm();
  const canExport = useCanExport();
  const canConnectLlm = useCanConnectLlm();
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Escape ferme et rend le focus au déclencheur — sans ça, la seule sortie
  // clavier était de tabuler à l'aveugle hors du menu, qui restait ouvert.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open]);

  if (!session) return null;

  const spaces = Object.values(sessions).map((s) => s.space);

  const switchTo = (spaceId: string) => {
    setOpen(false);
    if (spaceId === session.space.id) return;
    switchSpace(spaceId);
    navigate('/dashboard');
  };

  const itemCls =
    'w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm font-body ' +
    'text-[var(--text-primary)] hover:bg-[var(--bg-card-alt)] transition-colors';

  return (
    <div className="relative" ref={ref}>
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 bg-[var(--accent-primary)] rounded-full min-w-0"
      >
        {/* Point papier, pas un vert de statut : la palette n'a AUCUN vert,
            et « connecté » n'est pas une information que ce point portait. */}
        <div className="w-1.5 h-1.5 rounded-full bg-[var(--text-inverse)] opacity-80 flex-shrink-0" />
        <span className="text-[var(--text-inverse)] text-xs font-medium font-body truncate max-w-[100px] sm:max-w-[180px]">
          {session.space.name}
        </span>
        <ChevronDown size={12} className="text-[var(--text-inverse)] flex-shrink-0" />
      </button>

      {open && (
        // Popup ordinaire, PAS role="menu" : ce rôle contracte la navigation
        // aux flèches (roving tabindex, Home/End) que ces boutons n'implémentent
        // pas — les lecteurs d'écran passaient en mode application et
        // interceptaient des flèches qui ne faisaient rien. Des boutons
        // tabulables ordinaires sont honnêtes et fonctionnels.
        <div className="absolute right-0 mt-2 w-60 card-paper p-1.5 z-50 shadow-[0_18px_40px_-22px_rgba(28,22,14,0.45)]">
          <div className="max-h-64 overflow-auto">
            {spaces.map((s) => (
              <button key={s.id} onClick={() => switchTo(s.id)} className={itemCls}>
                <span className="truncate flex-1">{s.name}</span>
                {s.id === session.space.id && (
                  <Check size={14} className="flex-shrink-0 text-[var(--accent-primary)]" />
                )}
              </button>
            ))}
          </div>
          <div className="h-px bg-[var(--border-paper)] my-1.5" />
          <button
            onClick={() => {
              setOpen(false);
              setShowCreate(true);
            }}
            className={itemCls}
          >
            <Plus size={14} className="flex-shrink-0" />
            <span className="truncate">{t('home.create.title')}</span>
          </button>
          <button
            onClick={() => {
              setOpen(false);
              setShowJoin(true);
            }}
            className={itemCls}
          >
            <LogIn size={14} className="flex-shrink-0" />
            <span className="truncate">{t('home.join.title')}</span>
          </button>

          {/* Players and the GM, not viewers: the token they already hold
              decides what Claude sees, so a player connecting gets the player's
              view — but the command embeds that live token, and a read-only
              visitor is a guest, not an operator.
              Supabase-only — the localStorage fallback has no server session
              token for an MCP client to present. */}
          {canConnectLlm && isSupabaseConfigured() && (
            <>
              <div className="h-px bg-[var(--border-paper)] my-1.5" />
              <button
                onClick={() => {
                  setOpen(false);
                  setShowConnect(true);
                }}
                className={itemCls}
              >
                <Terminal size={14} className="flex-shrink-0" />
                <span className="truncate">{t('connectLlm.menuLabel')}</span>
              </button>
            </>
          )}

          {/* Players and the GM, at their own role — the export is built from
              the reads they already have, so a player gets a complete vault of
              the player's view. A viewer is excluded: reading the grimoire in
              the app is what a visitor is for; leaving with a copy of it is not.
              NOT gated on Supabase, unlike Connect above: that one needs a
              server session token to hand an MCP client, whereas an export is
              just the data this device can already read. It works off the
              localStorage fallback too — where there is no session, and so no
              role to demote. */}
          {canExport && (
            <>
              <div className="h-px bg-[var(--border-paper)] my-1.5" />
              <button
                onClick={() => {
                  setOpen(false);
                  setShowExport(true);
                }}
                className={itemCls}
              >
                <Download size={14} className="flex-shrink-0" />
                <span className="truncate">{t('exportVault.menuLabel')}</span>
              </button>
            </>
          )}

          {/* GM-only: grimoire settings (passwords, public read) and deletion —
              the server enforces this now, but the UI shouldn't offer either
              to players/viewers. */}
          {isGm && (
            <>
              <div className="h-px bg-[var(--border-paper)] my-1.5" />
              {isSupabaseConfigured() && (
                <button
                  onClick={() => {
                    setOpen(false);
                    navigate('/ledger');
                  }}
                  className={itemCls}
                >
                  <ScrollText size={14} className="flex-shrink-0" />
                  <span className="truncate">{t('ledger.menuLabel')}</span>
                </button>
              )}
              <button
                onClick={() => {
                  setOpen(false);
                  setShowSettings(true);
                }}
                className={itemCls}
              >
                <Settings size={14} className="flex-shrink-0" />
                <span className="truncate">{t('spaceSettings.menuLabel')}</span>
              </button>
            </>
          )}

          {isGm && (
            <>
              <div className="h-px bg-[var(--border-paper)] my-1.5" />
              <button
                onClick={() => {
                  setOpen(false);
                  setShowDelete(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm font-body text-[var(--danger)] hover:bg-[var(--danger-soft)] transition-colors"
              >
                <Trash2 size={14} className="flex-shrink-0" />
                <span className="truncate">{t('deleteSpace.button')}</span>
              </button>
            </>
          )}
        </div>
      )}

      <CreateSpaceModal isOpen={showCreate} onClose={() => setShowCreate(false)} />
      <JoinSpaceModal isOpen={showJoin} onClose={() => setShowJoin(false)} />
      <SpaceSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
      <ConnectLlmModal isOpen={showConnect} onClose={() => setShowConnect(false)} />
      <ExportVaultModal isOpen={showExport} onClose={() => setShowExport(false)} />
      <DeleteSpaceModal
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        spaceId={session.space.id}
        spaceName={session.space.name}
      />
    </div>
  );
}
