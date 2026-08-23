import { useEffect, useState } from 'react';

/**
 * Renvoie `value` répercutée seulement après `delay` ms sans nouveau
 * changement. Sert à ne pas relancer un traitement coûteux à chaque frappe —
 * ici la reconstruction complète du graphe Sigma (kill + new Sigma + relance
 * de la simulation d3) déclenchée par la recherche du GraphViewPage.
 */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
