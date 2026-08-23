import { useNavigate, useLocation } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { Logo } from '@/components/shared/Logo';
import { SpaceSwitcher } from '@/components/layout/SpaceSwitcher';
import { useAppStore } from '@/stores/appStore';
import { useT } from '@/i18n';

export function Header() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const session = useAppStore((s) => s.session);
  const leaveSpace = useAppStore((s) => s.leaveSpace);
  const isAppPage = location.pathname !== '/';

  // "Leave" the current grimoire: drop its token. If this device still holds
  // others, fall back to one (the store re-points `session`); otherwise sign out.
  const handleLogout = () => {
    if (!session) return;
    leaveSpace(session.space.id);
    navigate(useAppStore.getState().session ? '/dashboard' : '/');
  };

  return (
    <header className="relative">
      <div className="px-4 sm:px-6 h-20 sm:h-24 md:h-28 lg:h-32 flex items-center justify-between max-w-6xl mx-auto gap-2">
        <button
          onClick={() => navigate(session ? '/dashboard' : '/')}
          className="hover:opacity-80 transition-opacity flex-shrink-0"
          aria-label={t('header.home')}
        >
          <Logo size="sm" />
        </button>

        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          {isAppPage && session && (
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <SpaceSwitcher />
              <button
                onClick={handleLogout}
                title={t('header.leave')}
                aria-label={t('header.leave')}
                className="ml-0.5 p-2.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0"
              >
                <LogOut size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
      {/* Frise de nœuds « Book II » en tête de page (Jason Lutes, CC BY 4.0). */}
      <div
        aria-hidden="true"
        className="band-knot absolute bottom-0 left-0 right-0 text-[var(--border-paper)]"
      />
    </header>
  );
}
