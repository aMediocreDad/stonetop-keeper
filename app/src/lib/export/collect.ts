import { db } from '@/lib/db';
import type { RawCampaignData } from '@/lib/campaign/types';
import type { MapImages } from '@/lib/campaign/vault/write';

/**
 * Fill `RawCampaignData` from the browser.
 *
 * This is the contract's SECOND producer: the MCP Worker's `readAll` in
 * `mcp/src/fetch.ts` builds the same bag from the same RPCs server-side. Having
 * two implementations is what turns `RawCampaignData` from "whatever the Worker
 * happens to fetch" into an interface with a shape worth relying on.
 *
 * Deliberately NOT under `lib/campaign/` — the purity guard there globs
 * `campaign/**` and bans `db` imports, `fetch` and DOM access, because that tree
 * has to run inside a Worker. This module does all three.
 *
 * Everything is role-filtered server-side, so what lands here is exactly what
 * the caller is allowed to see. A player's export simply has no GM layer.
 */
export async function loadRawCampaign(spaceId: string): Promise<RawCampaignData> {
  const [characters, locations, relations, timeline, maps, gmJournal, toneAndContent] =
    await Promise.all([
      db.getSpaceCharacters(spaceId),
      db.getSpaceLocations(spaceId),
      db.getSpaceRelations(spaceId),
      db.getTimeline(spaceId),
      db.getSpaceMaps(spaceId),
      // A non-GM gets an empty result rather than an error; treat a failure the
      // same way, since a missing journal must not fail a whole export.
      db.getGmJournal(spaceId).catch(() => null),
      // Present for every role; a failure must not fail the whole export.
      db.getToneAndContent(spaceId).catch(() => null),
    ]);

  // `get_map_pins` is per map, so pins fan out one call each — spaces hold a
  // handful of maps, not hundreds. Same shape the Worker's `readPins` produces.
  const pinLists = await Promise.all(maps.map((m) => db.getMapPins(spaceId, m.id)));

  return {
    characters,
    locations,
    relations,
    timeline,
    maps,
    mapPins: pinLists.flat(),
    gmJournal,
    toneAndContent,
  };
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

/**
 * The maps that actually have a picture to fetch. Exported because the modal
 * counts against this number: counting all maps instead made the progress line
 * read "0 of 3" and then jump to "1 of 1".
 */
export function mapsWithImages(maps: RawCampaignData['maps']): NonNullable<RawCampaignData['maps']> {
  return (maps ?? []).filter((m) => m.image_path || m.image_data);
}

/**
 * Download each map's image so it can ride in the ZIP.
 *
 * One map's failure must not lose the whole export — a signed URL can expire or
 * an object can be missing — so a failed image is skipped and its map still
 * exports, minus the picture. `onProgress` drives the modal, since this is the
 * slow part.
 */
export async function loadMapImages(
  maps: RawCampaignData['maps'],
  onProgress?: (done: number, total: number) => void,
): Promise<MapImages> {
  const withImages = mapsWithImages(maps);
  const out: MapImages = new Map();
  let done = 0;

  for (const map of withImages) {
    try {
      // The localStorage fallback keeps the whole image as a data URL on the row
      // and has no Storage to fetch from, so decode it here rather than let
      // fetchMapImageBytes throw NO_BACKEND and drop the picture.
      const blob = map.image_data
        ? await (await fetch(map.image_data)).blob()
        : await db.fetchMapImageBytes(map);
      const ext = EXT_BY_TYPE[blob.type] ?? 'jpg';
      out.set(map.id, { bytes: new Uint8Array(await blob.arrayBuffer()), ext });
    } catch {
      // Skipped: the map note still exports with its pin table, just no image.
    }
    done += 1;
    onProgress?.(done, withImages.length);
  }
  return out;
}
