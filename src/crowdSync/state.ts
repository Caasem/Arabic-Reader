import { db } from '../persistence/schema';
import type { CrowdStateRow } from './types';

const EMPTY: CrowdStateRow = { id: 'local', registered: false, seq: 0, maxRev: 0 };

export async function loadState(): Promise<CrowdStateRow> {
  return (await db.crowdState.get('local')) ?? { ...EMPTY };
}

/** Reads, changes and writes the single state row in one transaction, so two flushes cannot overwrite each other. */
export async function updateState(change: (s: CrowdStateRow) => CrowdStateRow | void): Promise<CrowdStateRow> {
  return db.transaction('rw', db.crowdState, async () => {
    const current = (await db.crowdState.get('local')) ?? { ...EMPTY };
    const next = change(current) ?? current;
    await db.crowdState.put(next);
    return next;
  });
}

/** The next revision for a local change. Written before the vote is queued, so a crash cannot reuse it (section 7.4). */
export async function nextRev(): Promise<number> {
  const s = await updateState((row) => {
    row.seq += 1;
  });
  return s.seq;
}
