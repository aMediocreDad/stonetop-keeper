import { useCallback, useState } from 'react';

export type LoadStatus = 'loading' | 'ready' | 'error';

/**
 * Where the data currently on screen came from. `cache` means an IndexedDB
 * snapshot is showing and the network has not answered yet (or failed) — the
 * only signal that separates "instant, possibly stale" from "confirmed fresh".
 */
export type LoadSource = 'cache' | 'network' | null;

/**
 * Statut du chargement initial d'un hook de données : `loading` jusqu'au
 * premier fetch abouti, `error` si celui-ci échoue, `ready` ensuite.
 * Un refetch (ping realtime) qui échoue après un premier succès reste
 * `ready` : des données un peu périmées valent mieux qu'un mur d'erreur
 * en pleine partie. Sans statut, « ça charge », « c'est vide » et « ça a
 * échoué » arrivent tous comme `[]` — les pages mentent (faux notFound,
 * faux grimoire vide) pendant chaque aller-retour réseau.
 */
export function useLoadStatus() {
  const [state, setState] = useState<{ status: LoadStatus; source: LoadSource }>({
    status: 'loading',
    source: null,
  });

  // `source` only ever advances on success: a failed refetch leaves whatever is
  // actually feeding the UI named correctly, rather than relabelling a visible
  // cache snapshot as though the network had confirmed it.
  const settle = useCallback((ok: boolean, source?: Exclude<LoadSource, null>) => {
    setState((prev) => {
      const status: LoadStatus = ok || prev.status === 'ready' ? 'ready' : 'error';
      const nextSource = ok && source ? source : prev.source;
      if (status === prev.status && nextSource === prev.source) return prev;
      return { status, source: nextSource };
    });
  }, []);

  // Repasse en `loading` avant un nouvel essai (bouton « Retry »).
  const reset = useCallback(() => setState({ status: 'loading', source: null }), []);

  return { status: state.status, source: state.source, settle, reset };
}
