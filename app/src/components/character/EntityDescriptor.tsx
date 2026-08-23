/**
 * La ligne de descripteurs du livre : sous le nom d'une entrée de bestiaire,
 * en italique et séparée par des virgules — « Group, organized, skilled »
 * (Livre II, Barrier Pass). On y met ce qui QUALIFIE l'entrée d'un mot : le
 * type de menace, puis ses tags.
 *
 * Serif (la voix de lecture, pas la voix de l'interface) : c'est du contenu,
 * pas de la chrome. `--text-secondary` et non `--text-faint`, qui est réservé
 * au décor — cette ligne porte du sens.
 */
export function EntityDescriptor({
  items,
  className = '',
}: {
  items: Array<string | null | undefined>;
  className?: string;
}) {
  const parts = items.filter((it): it is string => !!it && it.trim() !== '');
  if (parts.length === 0) return null;
  return (
    <p className={`text-sm italic text-[var(--text-secondary)] leading-snug ${className}`}>
      {parts.join(', ')}
    </p>
  );
}
