import { describe, it, expect } from 'vitest';
import { changedKeys } from '../patch';

/**
 * `changedKeys` narrows a save payload to the columns the editor actually
 * changed, so two people editing DIFFERENT fields of the same row stop
 * clobbering each other. The RPCs are per-key partial updates already
 * (`case when p_data ? 'col'`), so an omitted key keeps its column and an
 * explicit null clears it — this is the client half of that contract.
 */
describe('changedKeys', () => {
  it('omits a key whose value is unchanged', () => {
    const patch = changedKeys({ name: 'Bran' }, { name: 'Bran' });
    expect(patch).toEqual({});
  });

  it('includes a key whose value differs', () => {
    const patch = changedKeys({ name: 'Bran' }, { name: 'Branwen' });
    expect(patch).toEqual({ name: 'Branwen' });
  });

  it('sends an explicit null when a set value is cleared', () => {
    const patch = changedKeys<{ location: string | null }>({ location: 'loc-1' }, { location: null });
    // Key PRESENCE is what the RPC reads as "write this column", so a cleared
    // field must survive the diff as an explicit null rather than vanish.
    expect(patch).toHaveProperty('location', null);
  });

  it('omits a field that is null on both sides', () => {
    // The blind-null case: a player never sees `statblock`, so it reads null
    // on both sides and must not be written back over the GM's value.
    const patch = changedKeys({ statblock: null }, { statblock: null });
    expect(patch).toEqual({});
  });

  it('omits a key the payload does not provide at all', () => {
    const patch = changedKeys<{ name: string; notes: string }>(
      { name: 'Bran', notes: 'old' },
      { name: 'Bran' },
    );
    expect(patch).toEqual({});
  });

  it('treats an undefined payload value as not provided', () => {
    // `relation_detail: text.trim() || undefined` is an existing call shape;
    // JSON.stringify drops it today, so the diff must not resurrect it as a
    // write.
    const patch = changedKeys({ detail: 'old' }, { detail: undefined });
    // `in`, not toEqual: toEqual treats an undefined-valued key as absent, so
    // it would pass without the diff doing anything.
    expect('detail' in patch).toBe(false);
  });

  it('omits an array whose contents are unchanged', () => {
    const patch = changedKeys({ tags: ['a', 'b'] }, { tags: ['a', 'b'] });
    expect(patch).toEqual({});
  });

  it('includes an array whose order changed', () => {
    // Trait order is meaningful on a sheet, so reordering is a real edit.
    const patch = changedKeys({ tags: ['a', 'b'] }, { tags: ['b', 'a'] });
    expect(patch).toEqual({ tags: ['b', 'a'] });
  });

  it('omits a nested object that differs only in key order', () => {
    const patch = changedKeys(
      { threat: { instinct: 'raid', type: 'horde' } },
      { threat: { type: 'horde', instinct: 'raid' } },
    );
    expect(patch).toEqual({});
  });

  it('includes a nested object with a changed leaf', () => {
    const patch = changedKeys(
      { threat: { instinct: 'raid', portents: ['smoke'] } },
      { threat: { instinct: 'raid', portents: ['smoke', 'fire'] } },
    );
    expect(patch).toEqual({ threat: { instinct: 'raid', portents: ['smoke', 'fire'] } });
  });

  it('treats a missing baseline key as a change', () => {
    const patch = changedKeys({}, { name: 'Bran' });
    expect(patch).toEqual({ name: 'Bran' });
  });

  it('sends everything when there is no baseline at all', () => {
    const patch = changedKeys(null, { name: 'Bran', tags: [] });
    expect(patch).toEqual({ name: 'Bran', tags: [] });
  });

  it('distinguishes null from undefined in the baseline', () => {
    // A column that is null server-side, cleared again by the editor, is not
    // a change — but the same payload against an ABSENT baseline key is.
    expect(changedKeys({ gm_notes: null }, { gm_notes: null })).toEqual({});
    expect(changedKeys({}, { gm_notes: null })).toHaveProperty('gm_notes', null);
  });
});
