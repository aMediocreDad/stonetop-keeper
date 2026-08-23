import { useEffect, useRef, useState } from 'react';
import { CloudOff } from 'lucide-react';
import { useConnectivity } from '@/hooks/useConnectivity';
import { useT } from '@/i18n';

/**
 * A single quiet line, shown only while the connection is actually gone.
 *
 * Deliberately NOT a "cached" badge on every page: instant local render is the
 * normal path here, not a degraded one, and labelling it would turn the
 * feature into a permanent apology. The marker earns its place only when
 * something is genuinely wrong — the app is readable but writes will not land.
 *
 * `role="status"` rather than `alert`: it is ambient context, not an
 * interruption, so screen readers announce it politely. The region itself
 * stays mounted even while online — a live region inserted together with its
 * content is unreliably announced (VoiceOver notably) — and recovery gets a
 * brief screen-reader-only line, since sighted users see the banner leave but
 * nothing announced "back to normal" otherwise.
 */
export function OfflineNotice() {
  const online = useConnectivity();
  const t = useT();

  const [justRestored, setJustRestored] = useState(false);
  const wasOffline = useRef(false);
  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    setJustRestored(true);
    const id = setTimeout(() => setJustRestored(false), 5000);
    return () => clearTimeout(id);
  }, [online]);

  return (
    <div role="status">
      {!online && (
        <div className="flex items-center justify-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-1.5 text-center">
          <CloudOff size={13} className="shrink-0 text-[var(--text-muted)]" aria-hidden />
          <span className="label-overline text-[var(--text-muted)]">{t('offline.banner')}</span>
        </div>
      )}
      {online && justRestored && <span className="sr-only">{t('offline.restored')}</span>}
    </div>
  );
}
