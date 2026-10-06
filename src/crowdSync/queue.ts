import { LIMITS, utcDay, type VoteItem } from '../../crowd-server/src/protocol';
import { db } from '../persistence/schema';
import { nextRev } from './state';
import { CLIENT_LIMITS, queueKey, type QueueRow } from './types';

/** What a caller supplies; the revision and the day are added here. */
export type NewVote = Omit<VoteItem, 'rev' | 'day'>;

/**
 * Queues a vote. The revision comes from the device counter, which is written before the vote is queued,
 * and a newer change to the same vote replaces the queued older one (section 7.4). The queue is capped, and
 * when it is full the oldest vote is dropped.
 */
export async function enqueue(vote: NewVote, now = Date.now()): Promise<QueueRow> {
  const rev = await nextRev();
  const item: VoteItem = { ...vote, rev, day: utcDay(now) };
  const row: QueueRow = { key: queueKey(item), rev, createdAt: now, item };
  await db.transaction('rw', db.crowdQueue, async () => {
    await db.crowdQueue.put(row);
    const over = (await db.crowdQueue.count()) - CLIENT_LIMITS.queueCap;
    if (over > 0) {
      const oldest = await db.crowdQueue.orderBy('rev').limit(over).primaryKeys();
      await db.crowdQueue.bulkDelete(oldest);
    }
  });
  return row;
}

/** Drops votes older than the age limit; the server would reject them anyway (section 7.4). */
export async function dropExpired(now = Date.now()): Promise<number> {
  const cutoff = now - CLIENT_LIMITS.queueMaxAgeDays * 86_400_000;
  const old = await db.crowdQueue.filter((r) => r.createdAt < cutoff).primaryKeys();
  await db.crowdQueue.bulkDelete(old);
  return old.length;
}

/** The next batch to send, oldest revision first, within the server's item limit. */
export async function nextBatch(): Promise<QueueRow[]> {
  return db.crowdQueue.orderBy('rev').limit(LIMITS.maxItems).toArray();
}

export const queueSize = (): Promise<number> => db.crowdQueue.count();

export async function removeFromQueue(rows: Pick<QueueRow, 'key' | 'rev'>[]): Promise<void> {
  // Only remove what was sent: if the reader changed the same vote meanwhile, the newer row stays.
  await db.transaction('rw', db.crowdQueue, async () => {
    for (const r of rows) {
      const current = await db.crowdQueue.get(r.key);
      if (current && current.rev === r.rev) await db.crowdQueue.delete(r.key);
    }
  });
}

export async function clearQueue(): Promise<void> {
  await db.crowdQueue.clear();
}
