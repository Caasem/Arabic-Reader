import { describe, expect, it } from 'vitest';
import { aggregate, buildManifest, decide, installWeight, manifestPayload } from '../src/aggregate';
import { DEFAULT_CONFIG, saveConfig, getConfig } from '../src/config';
import { verifyEd25519 } from '../src/crypto';
import { DEFAULT_THRESHOLDS } from '../src/protocol';
import { freshServer } from './helpers';
import { k, letters, seedInstall, seedReaders, seedVote, testSigner } from './seed';

const th = DEFAULT_THRESHOLDS;
const scores = (o: Record<string, number>) => new Map(Object.entries(o));
const pooledFile = (files: Record<string, string>, lemma = 'lemma1') => {
  const path = Object.keys(files).find((p) => p === `packs/v1/pooled/${k(lemma).slice(0, 2)}.json`);
  return path ? (JSON.parse(files[path]).words as Record<string, Record<string, { entries: string[]; bestEntry: string; senses?: unknown }>>)[k(lemma)] : undefined;
};

describe('decide (section 8.3)', () => {
  it('passes only when picks, installs, share and lead all hold', () => {
    expect(decide(scores({ a: 40, b: 10 }), 12, th)).toMatchObject({ ok: true, best: 'a', order: ['a', 'b'], status: 'applied' });
    expect(decide(scores({ a: 20, b: 5 }), 12, th)).toMatchObject({ ok: false, status: 'low' });
    expect(decide(scores({ a: 40, b: 10 }), 9, th)).toMatchObject({ ok: false, status: 'low' });
    expect(decide(scores({ a: 30, b: 30, c: 30 }), 12, th)).toMatchObject({ ok: false, status: 'split' });
    // 45% against 40%: top share is enough but the lead over the second is under 10 points.
    expect(decide(scores({ a: 45, b: 40, c: 15 }), 12, th)).toMatchObject({ ok: false, status: 'split' });
  });
  it('orders ties the same way every time', () => {
    expect(decide(scores({ b: 20, a: 20 }), 12, { ...th, minLead: 0 }).order).toEqual(['a', 'b']);
  });
  it('handles no votes', () => {
    expect(decide(new Map(), 0, th)).toMatchObject({ ok: false, order: [] });
  });
});

describe('install weight (section 8.1)', () => {
  it('is age over 14 days times books over 2, each capped at 1', () => {
    expect(installWeight('2026-10-06', 5, 0, '2026-10-06', DEFAULT_CONFIG)).toBe(0);
    expect(installWeight('2026-09-29', 2, 0, '2026-10-06', DEFAULT_CONFIG)).toBeCloseTo(0.5);
    expect(installWeight('2026-09-29', 1, 0, '2026-10-06', DEFAULT_CONFIG)).toBeCloseTo(0.25);
    expect(installWeight('2026-01-01', 9, 0, '2026-10-06', DEFAULT_CONFIG)).toBe(1);
  });
  it('applies tier bases only when trust tiers are on, capped at 3', () => {
    const on = { ...DEFAULT_CONFIG, trustTiers: true };
    expect(installWeight('2026-01-01', 9, 0, '2026-10-06', on)).toBeCloseTo(0.3);
    expect(installWeight('2026-01-01', 9, 1, '2026-10-06', on)).toBe(1);
    expect(installWeight('2026-01-01', 9, 3, '2026-10-06', on)).toBe(3);
    expect(installWeight('2026-01-01', 9, 3, '2026-10-06', DEFAULT_CONFIG)).toBe(1);
  });
});

describe('pooled ranking', () => {
  it('ranks entries by weighted saves and publishes a word that passes', async () => {
    const s = await freshServer();
    await seedReaders(s.db, 32, (i) => (i < 24 ? ['formI'] : ['formII']));
    const { files, stats } = await aggregate(s.db, s.clock.now, await getConfig(s.db));
    const word = pooledFile(files)!.aramorph;
    expect(word.bestEntry).toBe(k('formI'));
    expect(word.entries).toEqual([k('formI'), k('formII')]);
    expect(stats.find((x) => x.lemmaKey === k('lemma1'))).toMatchObject({ status: 'applied', installs: 32 });
  });

  it('publishes nothing for a word with too few readers or a split vote', async () => {
    const s = await freshServer();
    await seedReaders(s.db, 6, () => ['formI'], { lemma: 'few', prefix: 'few' });
    await seedReaders(s.db, 30, (i) => ['a', 'b', 'c'][i % 3].split(','), { lemma: 'split', prefix: 'spl' });
    const { files } = await aggregate(s.db, s.clock.now, await getConfig(s.db));
    expect(pooledFile(files, 'few')).toBeUndefined();
    expect(pooledFile(files, 'split')).toBeUndefined();
  });

  it('splits an install\'s weight across the entries it saved, so saving everything adds no more than saving one', async () => {
    const s = await freshServer();
    // 12 readers: eight save only "a", four save "a" and "b". Without splitting, b would be 4 and a 12.
    await seedReaders(s.db, 12, (i) => (i < 8 ? ['a'] : ['a', 'b']));
    const { stats } = await aggregate(s.db, s.clock.now, await getConfig(s.db));
    const st = stats.find((x) => x.lemmaKey === k('lemma1'))!;
    expect(st.picks).toBeCloseTo(12 * 1 * 0.75 /* pos 1 is not first; no discount */ / 0.75, 5);
    expect(st.topShare).toBeCloseTo((8 + 4 * 0.5) / 12, 5);
  });

  it('counts a save from the first position a little less, but not for hold-out installs', async () => {
    const s = await freshServer();
    await saveConfig(s.db, { holdoutPercent: 0 });
    await seedReaders(s.db, 12, () => ['a'], { pos: 0, prefix: 'p0' });
    const first = (await aggregate(s.db, s.clock.now, await getConfig(s.db))).stats.find((x) => x.lemmaKey === k('lemma1'))!;
    expect(first.picks).toBeCloseTo(12 * 0.75, 5);
    await saveConfig(s.db, { holdoutPercent: 100 });
    const second = (await aggregate(s.db, s.clock.now, await getConfig(s.db))).stats.find((x) => x.lemmaKey === k('lemma1'))!;
    expect(second.picks).toBeCloseTo(12, 5);
  });

  it('ignores banned installs, brand-new installs, un-saves, denied words and unknown dictionaries', async () => {
    const s = await freshServer();
    await seedReaders(s.db, 32, () => ['a']);
    const banned = await seedInstall(s.db, 'banned');
    const fresh = await seedInstall(s.db, 'fresh', { firstSeenDay: '2026-10-06' });
    const gone = await seedInstall(s.db, 'gone');
    for (const id of [banned, fresh]) for (let i = 0; i < 30; i++) await seedVote(s.db, { installId: id, book: 'b' + letters(i % 2), lemma: 'lemma1', entry: 'evil' + letters(i) });
    await s.db.run(`UPDATE installs SET banned = 1 WHERE installId = ?`, [banned]);
    await seedVote(s.db, { installId: gone, entry: 'a', saved: false });
    await seedVote(s.db, { installId: gone, entry: 'x', provider: 'personal' });
    const { files } = await aggregate(s.db, s.clock.now, await getConfig(s.db));
    expect(pooledFile(files)!.aramorph.entries).toEqual([k('a')]);
    const denied = await aggregate(s.db, s.clock.now, { ...(await getConfig(s.db)), deny: { bookKeys: [], lemmaKeys: [k('lemma1')] } });
    expect(pooledFile(denied.files)).toBeUndefined();
    const deniedBook = await aggregate(s.db, s.clock.now, { ...(await getConfig(s.db)), deny: { bookKeys: [k('book1')], lemmaKeys: [] } });
    expect(pooledFile(deniedBook.files)).toBeUndefined();
  });

  it('adds a meaning order inside an entry only where the meaning level passes its own thresholds', async () => {
    const s = await freshServer();
    const ids = await seedReaders(s.db, 32, () => ['formI']);
    for (let i = 0; i < 32; i++) await s.db.run(`UPDATE votes SET senseKey = ? WHERE installId = ? AND entryKey = ?`, [k(i < 24 ? 'senseA' : 'senseB'), ids[i], k('formI')]);
    const { files } = await aggregate(s.db, s.clock.now, await getConfig(s.db));
    const word = pooledFile(files)!.aramorph as { senses?: Record<string, { order: string[]; best: string }> };
    expect(word.senses?.[k('formI')]).toEqual({ order: [k('senseA'), k('senseB')], best: k('senseA') });
  });
});

describe('per-book ranking (section 8.2)', () => {
  it('only exists for a book with enough readers, and leans on the pooled ranking', async () => {
    const s = await freshServer();
    // 40 readers across other books say "a"; 22 readers of book "x" split a little towards "b".
    await seedReaders(s.db, 40, () => ['a'], { book: 'elsewhere', prefix: 'el' });
    await seedReaders(s.db, 22, (i) => (i < 9 ? ['a'] : ['b']), { book: 'x', prefix: 'bx' });
    const { files } = await aggregate(s.db, s.clock.now, await getConfig(s.db));
    const book = JSON.parse(files[`packs/v1/book/${k('x')}.json`]).words[k('lemma1')].aramorph;
    expect(book.entries[0]).toBe(k('a')); // pooled prior keeps "a" ahead although the book itself leans to "b"
    const small = await freshServer();
    await seedReaders(small.db, 40, () => ['a'], { book: 'elsewhere', prefix: 'el' });
    await seedReaders(small.db, 5, () => ['b'], { book: 'tiny', prefix: 'ti' });
    expect(Object.keys((await aggregate(small.db, small.clock.now, await getConfig(small.db))).files)).not.toContain(`packs/v1/book/${k('tiny')}.json`);
  });
});

describe('manifest (sections 9.2 and 9.4)', () => {
  it('lists a hash of every file, expires in seven days and verifies with the public key', async () => {
    const s = await freshServer();
    await seedReaders(s.db, 32, () => ['a']);
    const config = await getConfig(s.db);
    const { files } = await aggregate(s.db, s.clock.now, config);
    const signer = await testSigner();
    const m = await buildManifest(files, config, 7, s.clock.now);
    m.signature = await signer.sign(manifestPayload(m));
    expect(m.sequence).toBe(7);
    expect(Date.parse(m.expiresAt) - Date.parse(m.generatedAt)).toBe(7 * 86_400_000);
    expect(Object.keys(m.packs)).toContain(`pooled/${k('lemma1').slice(0, 2)}`);
    expect(Object.values(m.packs).every((h) => /^sha256-[0-9a-f]{64}$/.test(h))).toBe(true);
    expect(await verifyEd25519(signer.publicKeyRaw, m.signature, manifestPayload(m))).toBe(true);
    expect(await verifyEd25519(signer.publicKeyRaw, m.signature, manifestPayload({ ...m, enabled: false }))).toBe(false);
  });
});
