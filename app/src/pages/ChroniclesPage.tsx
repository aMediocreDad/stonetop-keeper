import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import { Toast } from '@/components/shared/Toast';
import { ChronicleAnnals } from '@/components/timeline/ChronicleAnnals';
import { WheelTimeline } from '@/components/timeline/WheelTimeline';
import { useAppStore } from '@/stores/appStore';
import { useT } from '@/i18n';

type ChronicleView = 'wheel' | 'annals';
const VIEW_KEY = 'inkstone:chronicles:view';

// Vue par défaut : la roue. Le choix est mémorisé par navigateur.
function initialView(): ChronicleView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'annals' ? 'annals' : 'wheel';
  } catch {
    // stockage bloqué (mode privé) → préférence de session seulement
    return 'wheel';
  }
}

export default function ChroniclesPage() {
  const t = useT();
  const navigate = useNavigate();
  const session = useAppStore((s) => s.session);
  // Lien profond `?year=` (rétroliens des fiches) : positionne la roue ou
  // fait défiler les annales jusqu'à l'année.
  const [searchParams] = useSearchParams();
  const yearParam = parseInt(searchParams.get('year') ?? '', 10);
  const initialYear = Number.isNaN(yearParam) ? undefined : yearParam;

  const [view, setView] = useState<ChronicleView>(initialView);
  const selectView = (v: ChronicleView) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!session) navigate('/');
  }, [session, navigate]);

  if (!session) return null;

  const toggleBtn = (v: ChronicleView, label: string) => (
    <button
      type="button"
      aria-pressed={view === v}
      onClick={() => selectView(v)}
      className={`px-3 py-1.5 text-sm transition-colors ${
        view === v
          ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] font-medium'
          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 w-full max-w-[1600px] mx-auto px-3 sm:px-6 pt-4 sm:pt-6 pb-0 flex flex-col">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 sm:mb-4 flex items-center gap-3"
        >
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 -ml-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0"
            title={t('character.backToGrimoire')}
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <p className="label-overline">{t('chronicles.overline')}</p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[var(--text-primary)] leading-none truncate">
              {t(view === 'wheel' ? 'chronicles.title' : 'chronicles.annalsTitle')}
            </h1>
          </div>

          <div
            className="ml-auto flex flex-shrink-0 rounded-md border border-[var(--border-paper)] overflow-hidden"
            role="group"
            aria-label={t('chronicles.overline')}
          >
            {toggleBtn('wheel', t('chronicles.viewWheel'))}
            {toggleBtn('annals', t('chronicles.viewAnnals'))}
          </div>
        </motion.div>

        {/* min(…, 78dvh) : voir GraphViewPage — un plancher fixe dépasse un
            viewport paysage de téléphone. */}
        <div className="flex-1 card-paper overflow-hidden relative min-h-[min(500px,78dvh)]">
          {view === 'wheel' ? (
            <WheelTimeline spaceId={session.space.id} initialYear={initialYear} />
          ) : (
            <ChronicleAnnals spaceId={session.space.id} initialYear={initialYear} />
          )}
        </div>
      </main>

      {/* Sans lui, les toasts de la page (déplacement refusé, échec de
          sauvegarde) partaient dans le vide — chaque page monte le sien. */}
      <Toast />
    </div>
  );
}
