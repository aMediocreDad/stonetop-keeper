// =====================================================================
// Supabase client (singleton). Returns `null` when env vars are missing,
// in which case the app falls back to localStorage (see `db.ts`).
// =====================================================================
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null | undefined;

/** Lazy singleton. `null` means "not configured → use the localStorage fallback". */
export function getSupabase(): SupabaseClient | null {
  if (_client !== undefined) return _client;

  // Accept several common naming conventions for env vars:
  //  - Vite-native:        VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
  //  - Next.js-style copy: VITE_NEXT_PUBLIC_SUPABASE_URL / VITE_NEXT_PUBLIC_SUPABASE_ANON_KEY
  //  - New Supabase keys:  VITE_NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (sb_publishable_*)
  const env = import.meta.env as Record<string, string | undefined>;
  const url =
    env.VITE_SUPABASE_URL ??
    env.VITE_NEXT_PUBLIC_SUPABASE_URL;
  const key =
    env.VITE_SUPABASE_ANON_KEY ??
    env.VITE_NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    env.VITE_NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    _client = null;
    return null;
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 5 } },
  });
  return _client;
}

export function isSupabaseConfigured(): boolean {
  return getSupabase() !== null;
}

// ----------------------------------------------------------------------
// Tiny password hash (good enough for the "lock between friends" use-case).
// NOT a security boundary against a determined attacker — see README.
// ----------------------------------------------------------------------
const SALT = 'inkstone-salt-2024';

export function hashPassword(password: string): string {
  let h = 0;
  for (let i = 0; i < password.length; i++) h = ((h << 5) - h + password.charCodeAt(i)) | 0;
  for (let i = 0; i < SALT.length; i++)     h = ((h << 5) - h + SALT.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).padStart(16, '0');
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

export function generateInviteCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const pick = () => chars[Math.floor(Math.random() * 26)];
  return `${pick()}${pick()}-${pick()}${pick()}${pick()}`;
}
