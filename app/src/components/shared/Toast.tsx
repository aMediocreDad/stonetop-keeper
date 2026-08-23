import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from '@/stores/appStore';

export function Toast() {
  const toast = useAppStore((s) => s.toast);

  return (
    // La région live est TOUJOURS montée, vide entre deux toasts : une région
    // insérée en même temps que son contenu est annoncée de façon aléatoire
    // (VoiceOver/Safari notamment). Le motif fiable est une région persistante
    // qu'on remplit. `pointer-events-none` : le conteneur fixe ne doit jamais
    // intercepter un tap sous lui.
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-[100] pointer-events-none"
    >
      <AnimatePresence>
        {toast?.visible && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            // Ombre d'encre, pas le shadow-lg noir pur de Tailwind : le
            // composant le plus fréquent de l'app était le seul revenu aux
            // défauts. Durée alignée sur la règle ~0.2s du système.
            className="px-6 py-3 bg-[var(--accent-primary)] text-[var(--text-inverse)] rounded-full shadow-[0_8px_24px_-8px_rgba(28,22,14,0.45)] font-body text-sm font-medium whitespace-nowrap"
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
