import { useT } from '@/i18n';
import { Modal } from '@/components/shared/Modal';
import { StampIcon } from '@/components/shared/StampIcon';
import seasonSpring from '@/assets/stonetop/season-spring.png';
import entityGroup from '@/assets/stonetop/entity-group.png';
import steadingCover from '@/assets/stonetop/steading-cover.png';
import emptyAdventurer from '@/assets/stonetop/empty-adventurer.png';

interface WhatsNewModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Les coins du grimoire présentés au premier passage — clés i18n whatsNew.*.
 *
 * Tampons Stonetop (Jason Lutes, CC BY 4.0) plutôt que des glyphes lucide en
 * pastille ronde : c'était LA première chose qu'un nouvel utilisateur voyait,
 * et elle parlait la langue d'un SaaS générique au lieu de celle du grimoire.
 * Chaque tampon est celui de sa surface : la rosace de saison (la roue des
 * chroniques), les silhouettes réunies (les liens), le médaillon de bourgade
 * dessinée (les cartes), le voyageur au bâton (le compagnon Claude).
 */
const ITEMS = [
  { stamp: seasonSpring, title: 'whatsNew.chroniclesTitle', text: 'whatsNew.chroniclesText' },
  { stamp: entityGroup, title: 'whatsNew.graphTitle', text: 'whatsNew.graphText' },
  { stamp: steadingCover, title: 'whatsNew.mapsTitle', text: 'whatsNew.mapsText' },
  { stamp: emptyAdventurer, title: 'whatsNew.claudeTitle', text: 'whatsNew.claudeText' },
] as const;

export function WhatsNewModal({ isOpen, onClose }: WhatsNewModalProps) {
  const t = useT();

  return (
    // Pas de closeLabel : la croix dit « Close » (défaut), le bouton du bas
    // porte le verbe — deux sorties avec le même intitulé se lisaient comme
    // deux commandes distinctes au lecteur d'écran.
    <Modal open={isOpen} onClose={onClose} labelledBy="whats-new-title">
      <p className="label-overline mb-1">{t('whatsNew.overline')}</p>
      {/* Pas de phrase d'introduction : surligne + titre + intro empilaient
          trois amorces avant le contenu (le tic « Welcome to… » en triple). */}
      <h2
        id="whats-new-title"
        className="font-display text-2xl font-bold text-[var(--text-primary)] mb-6 leading-tight"
      >
        {t('whatsNew.title')}
      </h2>

      <ul className="space-y-5 mb-7">
        {ITEMS.map(({ stamp, title, text }) => (
          <li key={title} className="flex items-start gap-3.5">
            {/* Tampon nu, encre adoucie — pas de pastille-conteneur : le
                motif « icône dans un rond » est exactement l'anti-référence
                SaaS que le système proscrit. */}
            <StampIcon
              src={stamp}
              size={34}
              className="flex-shrink-0 mt-0.5"
              style={{ color: 'var(--text-secondary)' }}
            />
            <div className="min-w-0">
              <p className="font-display font-semibold text-[var(--text-primary)] leading-tight">
                {t(title)}
              </p>
              <p className="text-sm text-[var(--text-secondary)] font-body mt-0.5">{t(text)}</p>
            </div>
          </li>
        ))}
      </ul>

      <button onClick={onClose} className="btn-outline w-full justify-center">
        {t('whatsNew.gotIt')}
      </button>
    </Modal>
  );
}
