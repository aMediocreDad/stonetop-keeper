/**
 * Narrowing a save payload to what the editor actually changed.
 *
 * Every update RPC is a per-key partial update — `case when p_data ? 'col'`
 * decides whether a column is written at all, so an omitted key keeps its
 * value and an explicit null clears it. The sheets have historically sent
 * their whole draft on save, which means two people editing different fields
 * of the same row overwrite each other, and the only defence was a growing
 * set of per-field guards in the save handlers.
 *
 * Diffing the OUTGOING payload (not the draft) against the row the draft was
 * seeded from keeps every normalise-on-save behaviour intact: where cleanup
 * changes a value, the diff sees a change and sends it; where it doesn't,
 * there was nothing to write.
 */

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  const aIsArray = Array.isArray(a);
  if (aIsArray !== Array.isArray(b)) return false;
  if (aIsArray) {
    const av = a as unknown[];
    const bv = b as unknown[];
    // Order-sensitive on purpose: trait and tag order is meaningful on a sheet.
    return av.length === bv.length && av.every((v, i) => deepEqual(v, bv[i]));
  }

  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const aKeys = Object.keys(ao);
  // Key ORDER must not count as a difference: the baseline comes back from
  // Postgres jsonb and the payload is built by the client, so the same value
  // routinely arrives with its keys in a different order.
  return (
    aKeys.length === Object.keys(bo).length &&
    aKeys.every((k) => Object.prototype.hasOwnProperty.call(bo, k) && deepEqual(ao[k], bo[k]))
  );
}

/**
 * Returns the subset of `payload` that differs from `baseline`.
 *
 * - A key absent from `payload`, or present with `undefined`, is never sent:
 *   `JSON.stringify` drops it on the way to the RPC anyway.
 * - A key whose value is `null` where the baseline had a value IS sent, as an
 *   explicit null — key presence is what tells the RPC to clear the column.
 * - A null baseline (no known prior state) sends everything provided.
 */
export function changedKeys<T extends object>(
  baseline: Partial<T> | null | undefined,
  payload: Partial<T>,
): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(payload)) {
    const next = (payload as Record<string, unknown>)[key];
    if (next === undefined) continue;
    if (
      baseline &&
      Object.prototype.hasOwnProperty.call(baseline, key) &&
      deepEqual((baseline as Record<string, unknown>)[key], next)
    ) {
      continue;
    }
    out[key] = next;
  }
  return out as Partial<T>;
}
