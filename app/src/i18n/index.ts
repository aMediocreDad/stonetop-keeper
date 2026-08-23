import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { en, type Dict } from './en';

// English-only fork. `Lang` is retained because it still keys the Stonetop
// steading seed content in the data layer (see `useSteading`); the UI itself
// no longer offers a language toggle and always renders English.
export type Lang = 'en' | 'fr';

type Path<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : T[K] extends object
      ? Path<T[K], `${P}${K}.`>
      : never;
}[keyof T & string];

export type TKey = Path<Dict>;

interface Ctx {
  lang: Lang;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<Ctx | null>(null);

function resolve(dict: Dict, key: string): string {
  const parts = key.split('.');
  let cur: unknown = dict;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return key;
    }
  }
  return typeof cur === 'string' ? cur : key;
}

function format(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const t = useCallback(
    (key: TKey, vars?: Record<string, string | number>) => format(resolve(en, key), vars),
    []
  );

  const value = useMemo<Ctx>(() => ({ lang: 'en', t }), [t]);

  return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <LanguageProvider>');
  return ctx;
}

export function useT() {
  return useI18n().t;
}
