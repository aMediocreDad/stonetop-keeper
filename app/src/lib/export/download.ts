import type { Zippable } from 'fflate';
import type { Space, SpaceRole } from '@/types';
import { loadMapImages, loadRawCampaign, mapsWithImages } from './collect';

/**
 * Build the vault ZIP and hand it to the browser.
 *
 * `fflate` and the whole vault layer are imported lazily inside the function:
 * exporting is a once-in-a-while act, and neither belongs in the bundle every
 * reader downloads to look at a character sheet. Same discipline as the lazy
 * TipTap split.
 */

export interface ExportProgress {
  stage: 'reading' | 'images' | 'writing' | 'done';
  done?: number;
  total?: number;
}

/** Long enough for any browser to have taken the blob, short enough that the
 *  memory is not held for the session. */
const REVOKE_DELAY_MS = 1_000;

function stamp(iso: string): string {
  return iso.slice(0, 10);
}

/** Windows forbids these outright, and a slash would nest the download. */
function safeFileName(name: string): string {
  return (name || 'grimoire').replace(/[/\\:*?"<>|]/g, '-').trim();
}

export async function downloadVault(
  space: Space,
  role: SpaceRole,
  appVersion: string,
  onProgress?: (p: ExportProgress) => void,
): Promise<void> {
  onProgress?.({ stage: 'reading' });
  const raw = await loadRawCampaign(space.id);

  // Count against the maps that HAVE a picture, which is what the loader reports.
  const pending = mapsWithImages(raw.maps).length;
  if (pending) onProgress?.({ stage: 'images', done: 0, total: pending });
  const images = await loadMapImages(raw.maps, (done, total) =>
    onProgress?.({ stage: 'images', done, total }),
  );

  onProgress?.({ stage: 'writing' });
  const [{ writeVault }, { zipSync, strToU8 }] = await Promise.all([
    import('@/lib/campaign/vault/write'),
    import('fflate'),
  ]);

  const exportedAt = new Date().toISOString();
  const files = writeVault(
    raw,
    {
      formatVersion: 1,
      exportedAt,
      appVersion,
      // Id and name only — the invite code is a way IN to the space, and this
      // file is made to be handed around.
      space: { id: space.id, name: space.name },
      role,
    },
    images,
  );

  // Per entry, because the two kinds of content are nothing alike: notes are
  // text and compress well, map images are ALREADY compressed and deflating them
  // buys nothing at all. Measured on 16 MB of image bytes: 360 ms at level 6 vs
  // 50 ms at level 0, for the same output size to the byte. That time is blocked
  // main thread — the modal cannot even paint its own "working" line — and a
  // phone at the table is several times slower than the machine that measured it.
  const entries: Zippable = {};
  for (const f of files) {
    entries[f.path] =
      typeof f.content === 'string' ? [strToU8(f.content), { level: 6 }] : [f.content, { level: 0 }];
  }

  const zipped = zipSync(entries);
  // Copy into a fresh buffer: fflate may hand back a view onto a larger pooled
  // ArrayBuffer, and Blob would then capture the whole thing.
  const blob = new Blob([new Uint8Array(zipped)], { type: 'application/zip' });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFileName(space.name)} — ${stamp(exportedAt)}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // NOT in this task. WebKit — which is every browser on iOS, and this app is
  // used at the table on a phone — frees an object URL eagerly, so revoking in
  // the same tick as the click can abort the download and save a 0-byte file.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);

  onProgress?.({ stage: 'done' });
}
