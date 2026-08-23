import { beforeEach, describe, expect, it } from 'vitest';
import { db, ERR_LEDGER_UNAVAILABLE } from '@/lib/db';
import { useAppStore } from '@/stores/appStore';

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({ session: null, sessions: {}, characters: [], relations: [], locations: [] });
});

describe('ledger in the localStorage fallback', () => {
  it('refuses all three calls instead of faking a history', async () => {
    const gm = await db.createSpace('Test', 'gm-pw');
    useAppStore.setState({ session: gm });

    await expect(db.getRevisions()).rejects.toThrow(ERR_LEDGER_UNAVAILABLE);
    await expect(db.previewUndoEvent('00000000-0000-0000-0000-000000000000'))
      .rejects.toThrow(ERR_LEDGER_UNAVAILABLE);
    await expect(db.undoEvent('00000000-0000-0000-0000-000000000000'))
      .rejects.toThrow(ERR_LEDGER_UNAVAILABLE);
  });
});
