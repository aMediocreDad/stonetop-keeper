import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { localDb } from '@/lib/mockDb';
import { useAppStore } from '@/stores/appStore';

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({ session: null, sessions: {}, characters: [], relations: [], locations: [], maps: [] });
});

async function gmSpace() {
  const gm = await db.createSpace('Test', 'gm-pw', 'player-pw');
  useAppStore.setState({ session: gm });
  return gm;
}

describe('maps CRUD (local fallback)', () => {
  it('creates, updates, lists and deletes maps', async () => {
    const gm = await gmSpace();
    const map = await db.createMap({ space_id: gm.space.id, name: 'Overland', gm_only: false });
    expect(map.id).toBeTruthy();
    const renamed = await db.updateMap(map.id, { name: 'The Wildlands' });
    expect(renamed.name).toBe('The Wildlands');
    expect((await db.getSpaceMaps(gm.space.id)).length).toBe(1);
    await db.deleteMap(map.id);
    expect((await db.getSpaceMaps(gm.space.id)).length).toBe(0);
  });

  it('updateMapPin persists changes and deleteMapPin removes the pin', async () => {
    const gm = await gmSpace();
    const map = await db.createMap({ space_id: gm.space.id, name: 'M', gm_only: false });
    const pin = await db.createMapPin({
      map_id: map.id, space_id: gm.space.id, x: 0.1, y: 0.2,
      label: 'Camp', gm_only: false,
    });

    await db.updateMapPin(pin.id, { x: 0.4, y: 0.6, label: 'Moved camp' });
    const [afterUpdate] = await db.getMapPins(gm.space.id, map.id);
    expect(afterUpdate.x).toBe(0.4);
    expect(afterUpdate.y).toBe(0.6);
    expect(afterUpdate.label).toBe('Moved camp');

    await db.deleteMapPin(pin.id);
    expect((await db.getMapPins(gm.space.id, map.id)).length).toBe(0);
  });

  it('deleting a map cascades its pins; deleting a linked entity cascades entity pins', async () => {
    const gm = await gmSpace();
    const map = await db.createMap({ space_id: gm.space.id, name: 'M', gm_only: false });
    const char = await db.createCharacter({
      space_id: gm.space.id, name: 'Anna', role: '', instinct: '', type: 'PNJ',
      notes: '', traits: [], tags: [], gm_only: false, dead: false,
    });
    await db.createMapPin({
      map_id: map.id, space_id: gm.space.id, x: 0.5, y: 0.5,
      character_id: char.id, gm_only: false,
    });
    await db.createMapPin({
      map_id: map.id, space_id: gm.space.id, x: 0.1, y: 0.9,
      label: 'Old ruin', note: 'crumbled', gm_only: false,
    });
    expect((await db.getMapPins(gm.space.id, map.id)).length).toBe(2);
    await db.deleteCharacter(char.id);
    expect((await db.getMapPins(gm.space.id, map.id)).length).toBe(1);
    await db.deleteMap(map.id);
    expect(localDb.getMapPins(map.id).length).toBe(0);
  });

  it('deleting a location unlinks maps (set null) and removes its pins', async () => {
    const gm = await gmSpace();
    const loc = await db.createLocation({ space_id: gm.space.id, name: 'Deephold', color: '#888', gm_only: false });
    const map = await db.createMap({ space_id: gm.space.id, name: 'M', location_id: loc.id, gm_only: false });
    await db.createMapPin({
      map_id: map.id, space_id: gm.space.id, x: 0.2, y: 0.2,
      location_id: loc.id, gm_only: false,
    });
    await db.deleteLocation(loc.id);
    expect((await db.getSpaceMaps(gm.space.id))[0].location_id ?? null).toBeNull();
    expect((await db.getMapPins(gm.space.id, map.id)).length).toBe(0);
  });

  it('deleting a space (local fallback) cascades its maps and pins', async () => {
    const gm = await gmSpace();
    const map = await db.createMap({ space_id: gm.space.id, name: 'M', gm_only: false });
    await db.createMapPin({
      map_id: map.id, space_id: gm.space.id, x: 0.3, y: 0.3,
      label: 'Camp', gm_only: false,
    });
    await db.deleteSpace(gm.space.id, 'gm-pw');
    expect(localDb.getSpaceMaps(gm.space.id).length).toBe(0);
    expect(localDb.getMapPins(map.id).length).toBe(0);
  });
});

describe('maps role filtering (local parity)', () => {
  it('players never see gm_only maps, gm_only pins, or pins on hidden entities', async () => {
    const gm = await gmSpace();
    const secretMap = await db.createMap({ space_id: gm.space.id, name: 'Secret', gm_only: true });
    const openMap = await db.createMap({ space_id: gm.space.id, name: 'Open', gm_only: false });
    const hiddenChar = await db.createCharacter({
      space_id: gm.space.id, name: 'Lurker', role: '', instinct: '', type: 'MENACE',
      notes: '', traits: [], tags: [], gm_only: true, dead: false,
    });
    await db.createMapPin({
      map_id: openMap.id, space_id: gm.space.id, x: 0.5, y: 0.5,
      character_id: hiddenChar.id, gm_only: false,
    });
    await db.createMapPin({
      map_id: openMap.id, space_id: gm.space.id, x: 0.6, y: 0.6,
      label: 'GM note', gm_only: true,
    });
    await db.createMapPin({
      map_id: openMap.id, space_id: gm.space.id, x: 0.7, y: 0.7,
      label: 'Village', gm_only: false,
    });

    expect((await db.getSpaceMaps(gm.space.id)).length).toBe(2);
    expect((await db.getMapPins(gm.space.id, openMap.id)).length).toBe(3);

    const player = await db.joinSpace(gm.space.invite_code, 'player-pw');
    useAppStore.setState({ session: player });
    const maps = await db.getSpaceMaps(gm.space.id);
    expect(maps.length).toBe(1);
    expect(maps[0].id).toBe(openMap.id);
    const pins = await db.getMapPins(gm.space.id, openMap.id);
    expect(pins.length).toBe(1);
    expect(pins[0].label).toBe('Village');
    await expect(db.getMapPins(gm.space.id, secretMap.id)).rejects.toThrow('NOT_FOUND');
  });
});

describe('map image (local fallback)', () => {
  it('uploadMapImage stores the data-URL + dimensions; getMapImageUrl returns it', async () => {
    const gm = await gmSpace();
    const map = await db.createMap({ space_id: gm.space.id, name: 'M', gm_only: false });
    const updated = await db.uploadMapImage(map.id, {
      blob: new Blob(['x'], { type: 'image/webp' }),
      width: 4000,
      height: 3000,
      dataUrl: 'data:image/webp;base64,AAAA',
    });
    expect(updated.image_width).toBe(4000);
    expect(updated.image_path).toBeTruthy();
    expect(await db.getMapImageUrl(updated)).toBe('data:image/webp;base64,AAAA');
  });

  it('deleteMapImage clears image fields', async () => {
    const gm = await gmSpace();
    const map = await db.createMap({ space_id: gm.space.id, name: 'M', gm_only: false });
    await db.uploadMapImage(map.id, {
      blob: new Blob(['x'], { type: 'image/webp' }),
      width: 10, height: 10, dataUrl: 'data:image/webp;base64,AAAA',
    });
    await db.deleteMapImage(map.id);
    const after = (await db.getSpaceMaps(gm.space.id))[0];
    expect(after.image_path ?? null).toBeNull();
    expect(await db.getMapImageUrl(after)).toBeNull();
  });
});
