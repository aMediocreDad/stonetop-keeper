/**
 * Pastille d'ÉTAT du nom d'une carte — ce qui a changé pour l'entrée, jamais
 * ce qu'elle EST. Le type a quitté cette place : le tampon de gauche le porte
 * (livret doré pour un PJ, tampon d'entité/bestiaire sinon, prune pour une
 * menace), et répéter « NPC » sur cinq cartes sur neuf ne distinguait rien
 * tout en volant sa largeur au nom — c'est ce qui tronquait les noms longs.
 *
 * Trois tons, tous pris aux jetons existants :
 *   - `muted` : l'entrée a quitté le jeu (décédé, dissous). Encre discrète —
 *     un mort reste de la mémoire de campagne, pas une ligne barrée.
 *   - `gm` : prune, réservé aux états de menace (la fiche de menace est de la
 *     prep de MJ même quand elle est révélée).
 *   - `danger` : rouge sourd, pour la fatalité tombée — le seul état de ces
 *     cartes qui soit vraiment une alarme.
 */
export type StateChipTone = 'muted' | 'gm' | 'danger';

const TONES: Record<StateChipTone, { color: string; border: string; bg: string }> = {
  muted: {
    color: 'var(--text-muted)',
    border: 'var(--border-paper)',
    bg: 'var(--bg-card-alt)',
  },
  gm: {
    color: 'var(--gm-accent)',
    border: 'var(--gm-accent)',
    bg: 'var(--gm-accent-soft)',
  },
  danger: {
    color: 'var(--danger)',
    border: 'var(--danger-border)',
    bg: 'var(--danger-soft)',
  },
};

export function StateChip({
  label,
  tone = 'muted',
  title,
}: {
  label: string;
  tone?: StateChipTone;
  title?: string;
}) {
  const c = TONES[tone];
  return (
    <span
      title={title}
      className="font-body text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-0.5 rounded border flex-shrink-0"
      style={{ color: c.color, borderColor: c.border, backgroundColor: c.bg }}
    >
      {label}
    </span>
  );
}
