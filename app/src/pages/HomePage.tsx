import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Logo } from '@/components/shared/Logo';
import { CreateSpaceModal } from '@/components/modals/CreateSpaceModal';
import { JoinSpaceModal } from '@/components/modals/JoinSpaceModal';
import { useAppStore } from '@/stores/appStore';
import { useT } from '@/i18n';

// Landing page. Centered hero: logo → overline → title → desc → two CTA cards.
// Footer holds the language toggle + tagline.
export default function HomePage() {
  const t = useT();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const session = useAppStore((s) => s.session);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (session) navigate('/dashboard');
  }, [session, navigate]);

  // Auto-open the join modal when arriving with a `?join=…` param.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (searchParams.get('join')) setShowJoin(true);
  }, [searchParams]);

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-12">
        {/* Une seule respiration : le héros se pose ensemble (0.25s), les
            cartes un souffle après (+0.08s). L'ancienne cascade élément par
            élément mettait ~0.95s à assembler la page — « petit, bref,
            physique », pas un rideau qui se lève. */}
        <div className="max-w-2xl w-full text-center">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="flex justify-center mb-6"
          >
            <Logo size="lg" />
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="label-overline mb-5"
          >
            {t('home.overline')}
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="font-display font-bold text-[var(--text-primary)] text-5xl md:text-7xl mb-5 leading-[1.05] tracking-tight"
          >
            Ink &amp; Stone
          </motion.h1>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="text-[var(--text-secondary)] font-body leading-relaxed max-w-md mx-auto mb-14 space-y-3"
          >
            <p>{t('home.description1')}</p>
            <p className="text-sm text-[var(--text-muted)]">{t('home.description2')}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.08, ease: 'easeOut' }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-2xl mx-auto"
          >
            <ChoiceCard
              title={t('home.create.title')}
              subtitle={t('home.create.subtitle')}
              cta={t('home.create.cta')}
              onClick={() => setShowCreate(true)}
            />
            <ChoiceCard
              title={t('home.join.title')}
              subtitle={t('home.join.subtitle')}
              cta={t('home.join.cta')}
              onClick={() => setShowJoin(true)}
            />
          </motion.div>
        </div>
      </main>

      <footer className="py-8 px-4 sm:px-6 max-w-6xl mx-auto w-full">
        {/* Attribution amont (Ink & Stone / Zephyr-jdr) + graphismes Stonetop
            (Jason Lutes, CC BY 4.0) — voir NOTICE.md. Fork EN-only, ton propre. */}
        <div className="flex flex-col items-center gap-2 text-xs text-[var(--text-muted)]">
          <a
            href="https://inkandstone.space"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--text-primary)] hover:underline transition-colors"
          >
            {t('home.footer.basedOn')}
          </a>
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--text-primary)] hover:underline transition-colors"
          >
            {t('home.footer.assetCredit')}
          </a>
        </div>
      </footer>

      <CreateSpaceModal isOpen={showCreate} onClose={() => setShowCreate(false)} />
      <JoinSpaceModal isOpen={showJoin} onClose={() => setShowJoin(false)} />
    </div>
  );
}

function ChoiceCard({
  title,
  subtitle,
  cta,
  onClick,
}: {
  title: string;
  subtitle: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group text-left card-paper p-7 hover:-translate-y-1 hover:shadow-[0_18px_40px_-22px_rgba(28,22,14,0.25)] transition-[transform,box-shadow] duration-200"
    >
      <h2 className="font-display text-2xl md:text-[1.7rem] font-semibold text-[var(--text-primary)] mb-2 leading-tight">
        {title}
      </h2>
      <p className="text-sm text-[var(--text-secondary)] font-body mb-6 leading-relaxed">
        {subtitle}
      </p>
      <span className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)] font-body">
        {cta}
        <ArrowUpRight
          size={16}
          className="transition-transform group-hover:translate-x-1 group-hover:-translate-y-0.5"
        />
      </span>
    </button>
  );
}
