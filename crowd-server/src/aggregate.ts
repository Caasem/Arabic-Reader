import type { Db } from './db';
import type { ServiceConfig } from './config';
import { sha256Hex } from './crypto';
import { LIMITS, canonicalJson, dayToMs, holdoutBucket, utcDay, type Thresholds } from './protocol';

/** Nightly aggregation (section 8): votes in, ranking files out. Pure reads, no writes. */

export interface WordRanking {
  /** Entry keys, most saved first. The app keeps any entry not listed after these, in dictionary order. */
  entries: string[];
  bestEntry: string;
  /** Meaning order inside an entry, only where the meaning level passed its own thresholds. */
  senses?: Record<string, { order: string[]; best: string }>;
}

export type WordPacks = Record<string, Record<string, WordRanking>>;

export interface RankingFiles {
  /** path -> file text, for example `packs/v1/pooled/ab.json`. */
  files: Record<string, string>;
  stats: WordStat[];
  summary: { pooledWords: number; bookWords: number; votes: number; installs: number };
}

export interface WordStat {
  lemmaKey: string;
  providerId: string;
  picks: number;
  installs: number;
  topShare: number;
  status: 'applied' | 'low' | 'split';
  topEntry: string;
}

interface VoteRow {
  installId: string;
  bookKey: string;
  lemmaKey: string;
  providerId: string;
  entryKey: string;
  senseKey: string | null;
  pos: number;
  weight: number;
  tier: number;
}

/** The weight of one install (section 8.1), plus its tier base when trust tiers are on (section 8.7). */
export function installWeight(firstSeenDay: string, books: number, tier: number, today: string, config: ServiceConfig): number {
  const ageDays = Math.max(0, (dayToMs(today) - dayToMs(firstSeenDay)) / 86_400_000);
  const base = Math.min(1, ageDays / 14) * Math.min(1, books / 2);
  if (!config.trustTiers) return base;
  const tierBase = [config.tierBase.anonymous, config.tierBase.signed, config.tierBase.established, config.tierBase.curator][Math.min(3, Math.max(0, tier))];
  return Math.min(3, base * tierBase);
}

interface Decision {
  ok: boolean;
  order: string[];
  best: string;
  total: number;
  topShare: number;
  status: 'applied' | 'low' | 'split';
}

/** Applies the thresholds of section 8.3 to the scores of one word in one dictionary. */
export function decide(scores: Map<string, number>, installs: number, th: Thresholds): Decision {
  const ranked = [...scores.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const total = ranked.reduce((n, [, v]) => n + v, 0);
  if (ranked.length === 0) return { ok: false, order: [], best: '', total: 0, topShare: 0, status: 'low' };
  const topShare = ranked[0][1] / total;
  const lead = (ranked[0][1] - (ranked[1]?.[1] ?? 0)) / total;
  const enough = total >= th.minPicks && installs >= th.minInstalls;
  const clear = topShare >= th.minShare && lead >= th.minLead;
  return {
    ok: enough && clear,
    order: ranked.map(([k]) => k),
    best: ranked[0][0],
    total,
    topShare,
    status: !enough ? 'low' : clear ? 'applied' : 'split',
  };
}

const bump = <K>(m: Map<K, number>, k: K, by: number) => m.set(k, (m.get(k) ?? 0) + by);

export async function aggregate(db: Db, now: number, config: ServiceConfig): Promise<RankingFiles> {
  const th = config.thresholds;
  const today = utcDay(now);

  // Weights: age and distinct books (8.1).
  const books = new Map<string, number>();
  for (const r of await db.all<{ installId: string; n: number }>(`SELECT installId, COUNT(DISTINCT bookKey) AS n FROM votes WHERE saved = 1 GROUP BY installId`)) books.set(r.installId, r.n);
  const installs = await db.all<{ installId: string; firstSeenDay: string; tier: number }>(`SELECT installId, firstSeenDay, tier FROM installs WHERE banned = 0`);
  const weightOf = new Map<string, { weight: number; tier: number }>();
  for (const i of installs) weightOf.set(i.installId, { weight: installWeight(i.firstSeenDay, books.get(i.installId) ?? 0, i.tier, today, config), tier: i.tier });

  const denyBook = new Set(config.deny.bookKeys);
  const denyLemma = new Set(config.deny.lemmaKeys);
  const raw = await db.all<Omit<VoteRow, 'weight' | 'tier'>>(
    `SELECT installId, bookKey, lemmaKey, providerId, entryKey, senseKey, pos FROM votes WHERE saved = 1`,
  );
  const votes: VoteRow[] = [];
  for (const v of raw) {
    const w = weightOf.get(v.installId);
    if (!w || w.weight <= 0 || denyBook.has(v.bookKey) || denyLemma.has(v.lemmaKey) || !config.providers.includes(v.providerId)) continue;
    votes.push({ ...v, weight: w.weight, tier: w.tier });
  }

  // An install's weight for a word in a dictionary is split across the entries it saved (8.2),
  // and a save from the first position shown counts a little less, except for hold-out installs.
  const savedCount = new Map<string, number>();
  const cell = (v: VoteRow) => `${v.installId}|${v.bookKey}|${v.lemmaKey}|${v.providerId}`;
  for (const v of votes) bump(savedCount, cell(v), 1);
  const weighted = votes.map((v) => {
    const holdout = holdoutBucket(v.installId) < config.holdoutPercent;
    const bias = !holdout && v.pos === 0 ? 1 - th.firstPositionDiscount : 1;
    return { v, w: (v.weight * bias) / (savedCount.get(cell(v)) ?? 1) };
  });

  // Pooled over all books, and per book.
  interface Group {
    scores: Map<string, number>;
    installs: Set<string>;
    senses: Map<string, Map<string, number>>;
    senseInstalls: Map<string, Set<string>>;
  }
  const group = (): Group => ({ scores: new Map(), installs: new Set(), senses: new Map(), senseInstalls: new Map() });
  const pooled = new Map<string, Group>();
  const perBook = new Map<string, Group>();
  const bookInstalls = new Map<string, Set<string>>();
  const add = (map: Map<string, Group>, key: string, v: VoteRow, w: number) => {
    const g = map.get(key) ?? group();
    map.set(key, g);
    bump(g.scores, v.entryKey, w);
    g.installs.add(v.installId);
    if (v.senseKey) {
      const m = g.senses.get(v.entryKey) ?? new Map<string, number>();
      g.senses.set(v.entryKey, m);
      bump(m, v.senseKey, w);
      const si = g.senseInstalls.get(v.entryKey) ?? new Set<string>();
      g.senseInstalls.set(v.entryKey, si);
      si.add(v.installId);
    }
  };
  for (const { v, w } of weighted) {
    add(pooled, `${v.lemmaKey}|${v.providerId}`, v, w);
    add(perBook, `${v.bookKey}|${v.lemmaKey}|${v.providerId}`, v, w);
    const bi = bookInstalls.get(v.bookKey) ?? new Set<string>();
    bookInstalls.set(v.bookKey, bi);
    bi.add(v.installId);
  }

  const sensesOf = (g: Group): WordRanking['senses'] | undefined => {
    const out: NonNullable<WordRanking['senses']> = {};
    for (const [entry, scores] of g.senses) {
      const d = decide(scores, g.senseInstalls.get(entry)?.size ?? 0, th);
      if (d.ok) out[entry] = { order: d.order, best: d.best };
    }
    return Object.keys(out).length ? out : undefined;
  };

  const pooledWords = new Map<string, WordRanking>(); // key lemma|provider
  const stats: WordStat[] = [];
  for (const [key, g] of pooled) {
    const [lemmaKey, providerId] = key.split('|');
    const d = decide(g.scores, g.installs.size, th);
    stats.push({ lemmaKey, providerId, picks: d.total, installs: g.installs.size, topShare: d.topShare, status: d.status, topEntry: d.best });
    if (d.ok) pooledWords.set(key, { entries: d.order, bestEntry: d.best, ...(sensesOf(g) ? { senses: sensesOf(g) } : {}) });
  }

  // Per book, smoothed towards the pooled ranking (8.2), only for books with enough readers.
  const bookWords = new Map<string, WordPacks>();
  for (const [key, g] of perBook) {
    const [bookKey, lemmaKey, providerId] = key.split('|');
    if ((bookInstalls.get(bookKey)?.size ?? 0) < th.minBookContributors) continue;
    const pooledGroup = pooled.get(`${lemmaKey}|${providerId}`)!;
    const pooledDecision = decide(pooledGroup.scores, pooledGroup.installs.size, th);
    if (!pooledDecision.ok) continue; // the thresholds are on the pooled counts (8.3)
    const nBook = [...g.scores.values()].reduce((a, b) => a + b, 0);
    const smoothed = new Map<string, number>();
    for (const entry of new Set([...g.scores.keys(), ...pooledGroup.scores.keys()])) {
      const share = (pooledGroup.scores.get(entry) ?? 0) / pooledDecision.total;
      smoothed.set(entry, ((g.scores.get(entry) ?? 0) + th.smoothingK * share) / (nBook + th.smoothingK));
    }
    const ranked = [...smoothed.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    const topShare = ranked[0][1] / ranked.reduce((n, [, v]) => n + v, 0);
    const lead = (ranked[0][1] - (ranked[1]?.[1] ?? 0)) / ranked.reduce((n, [, v]) => n + v, 0);
    if (topShare < th.minShare || lead < th.minLead) continue;
    const packs = bookWords.get(bookKey) ?? {};
    bookWords.set(bookKey, packs);
    (packs[lemmaKey] ??= {})[providerId] = { entries: ranked.map(([k]) => k), bestEntry: ranked[0][0], ...(sensesOf(g) ? { senses: sensesOf(g) } : {}) };
  }

  // Files.
  const files: Record<string, string> = {};
  const shards = new Map<string, WordPacks>();
  for (const [key, ranking] of pooledWords) {
    const [lemmaKey, providerId] = key.split('|');
    const shard = lemmaKey.slice(0, 2);
    const words = shards.get(shard) ?? {};
    shards.set(shard, words);
    (words[lemmaKey] ??= {})[providerId] = ranking;
  }
  for (const [shard, words] of shards) files[`packs/v1/pooled/${shard}.json`] = canonicalJson({ formatVersion: 1, shard, words });
  for (const [bookKey, words] of bookWords) files[`packs/v1/book/${bookKey}.json`] = canonicalJson({ formatVersion: 1, bookKey, words });

  return {
    files,
    stats: stats.sort((a, b) => b.picks - a.picks),
    summary: { pooledWords: pooledWords.size, bookWords: [...bookWords.values()].reduce((n, w) => n + Object.keys(w).length, 0), votes: votes.length, installs: weightOf.size },
  };
}

export interface Manifest {
  formatVersion: 1;
  sequence: number;
  generatedAt: string;
  expiresAt: string;
  enabled: boolean;
  minAppVersion: string;
  thresholds: Thresholds;
  deny: ServiceConfig['deny'];
  packs: Record<string, string>;
  signature?: string;
}

/** The manifest body: freshness fields, the deny list and a hash of every file (sections 9.2 and 9.4). */
export async function buildManifest(files: Record<string, string>, config: ServiceConfig, sequence: number, now: number): Promise<Manifest> {
  const packs: Record<string, string> = {};
  for (const [path, text] of Object.entries(files)) packs[path.replace(/^packs\/v1\//, '').replace(/\.json$/, '')] = 'sha256-' + (await sha256Hex(text));
  return {
    formatVersion: 1,
    sequence,
    generatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + LIMITS.manifestTtlDays * 86_400_000).toISOString(),
    enabled: config.enabled,
    minAppVersion: config.minAppVersion,
    thresholds: config.thresholds,
    deny: config.deny,
    packs,
  };
}

/** What the signature covers: the manifest without the signature field. */
export const manifestPayload = (m: Manifest): string => {
  const { signature: _s, ...rest } = m;
  return canonicalJson(rest);
};
