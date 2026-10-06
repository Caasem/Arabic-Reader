import type { Db } from '../src/db';
import { generateEd25519, signEd25519 } from '../src/crypto';
import { holdoutBucket } from '../src/protocol';
import type { Signer } from '../src/publish';

/** 0 -> a, 1 -> b, 26 -> ba: digits are not in the key alphabet, so counters are written in letters. */
export const letters = (n: number): string => (n === 0 ? 'a' : n.toString(26).replace(/[0-9a-p]/g, (c) => String.fromCharCode(97 + parseInt(c, 26))));

const pad = (s: string): string => s.toLowerCase().replace(/[^a-z2-7]/g, 'a').padEnd(12, 'a').slice(0, 20);
export const k = pad;

/** An install old enough, and active in enough books, to count at full weight. */
export async function seedInstall(db: Db, id: string, opts: { firstSeenDay?: string; banned?: boolean; tier?: number; lastSeenDay?: string } = {}): Promise<string> {
  const installId = pad(id);
  await db.run(
    `INSERT INTO installs (installId, publicKey, recoveryVerifier, firstSeenDay, lastSeenDay, banned, tier) VALUES (?, 'x', 'x', ?, ?, ?, ?)`,
    [installId, opts.firstSeenDay ?? '2026-08-01', opts.lastSeenDay ?? '2026-10-06', opts.banned ? 1 : 0, opts.tier ?? 0],
  );
  return installId;
}

export interface SeedVote {
  installId: string;
  book?: string;
  lemma?: string;
  provider?: string;
  entry: string;
  sense?: string | null;
  pos?: number;
  saved?: boolean;
  appliedAt?: number;
}

export async function seedVote(db: Db, v: SeedVote): Promise<void> {
  await db.run(
    `INSERT INTO votes (installId, bookKey, lemmaKey, providerId, entryKey, senseKey, source, pos, saved, rev, form, day, appliedAt)
     VALUES (?, ?, ?, ?, ?, ?, 'entry', ?, ?, 1, NULL, '2026-10-05', ?)`,
    [v.installId, pad(v.book ?? 'book1'), pad(v.lemma ?? 'lemma1'), v.provider ?? 'aramorph', pad(v.entry), v.sense ? pad(v.sense) : null, v.pos ?? 1, v.saved === false ? 0 : 1, v.appliedAt ?? Date.UTC(2026, 9, 5)],
  );
}

/** `readers` mature installs; reader i saves the entries `choose(i)` returns for the word. Each also saves a filler in a second book so its weight is 1. */
export async function seedReaders(
  db: Db,
  readers: number,
  choose: (i: number) => string[],
  opts: { book?: string; lemma?: string; provider?: string; pos?: number; prefix?: string } = {},
): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < readers; i++) {
    const id = await seedInstall(db, (opts.prefix ?? 'reader') + letters(i).padStart(4, 'a'));
    ids.push(id);
    for (const entry of choose(i)) await seedVote(db, { installId: id, book: opts.book, lemma: opts.lemma, provider: opts.provider, entry, pos: opts.pos });
    await seedVote(db, { installId: id, book: 'otherbook', lemma: 'fillerword' + (opts.prefix ?? ''), entry: 'filler' });
  }
  return ids;
}

export async function testSigner(): Promise<Signer & { publicKeyRaw: Uint8Array<ArrayBuffer> }> {
  const pair = await generateEd25519();
  return { publicKeyRaw: pair.publicKeyRaw, sign: (m) => signEd25519(pair.privateKey, m) };
}

/** An install id (from the given prefix) whose hold-out bucket is below or at least `percent`. */
export function idWithBucket(below: boolean, percent: number): string {
  for (let i = 0; i < 5000; i++) {
    const id = pad('probe' + letters(i));
    if ((holdoutBucket(id) < percent) === below) return id;
  }
  throw new Error('none found');
}
