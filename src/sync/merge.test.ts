import { describe, expect, it } from 'vitest';
import { applyAll, applyEvent, compareEvents, createLocalEvent, emptyState, isApplied, joinStates, precedes, reduceFrontier } from './merge';
import { recordKey, type SyncEvent, type SyncState } from './types';

// --- helpers -----------------------------------------------------------------

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Order-independent snapshot of a state, for equality checks. */
function canon(s: SyncState): string {
  const sortKeys = <T,>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
  return JSON.stringify({
    prefix: sortKeys(Object.fromEntries(Object.entries(s.applied.prefix).filter(([, v]) => v > 0))),
    extra: sortKeys(s.applied.extra),
    clock: sortKeys(Object.fromEntries(Object.entries(s.clock).filter(([, v]) => v > 0))),
    frontiers: sortKeys(Object.fromEntries(Object.entries(s.frontiers).map(([k, v]) => [k, v.map((e) => e.eventId)]))),
  });
}

function shuffled<T>(items: T[], rand: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Simulate several devices writing and syncing partially, in random order, with gaps. */
function simulate(seed: number, devices = 3, steps = 60): SyncEvent[] {
  const rand = rng(seed);
  const ids = Array.from({ length: devices }, (_, i) => `dev${i}`);
  const replicas = new Map(ids.map((d) => [d, emptyState()]));
  const lastUpdated = new Map(ids.map((d) => [d, 0]));
  const all: SyncEvent[] = [];
  let counter = 0;
  for (let step = 0; step < steps; step++) {
    const d = ids[Math.floor(rand() * ids.length)];
    if (rand() < 0.6 || all.length === 0) {
      const state = replicas.get(d) as SyncState;
      const recordId = `r${Math.floor(rand() * 3)}`;
      const frontier = state.frontiers[recordKey('vocabulary', recordId)] ?? [];
      const resolves = frontier.length > 1 && rand() < 0.5 ? frontier.map((e) => e.eventId) : undefined;
      const e = createLocalEvent(state, d, lastUpdated.get(d) as number, {
        eventId: `e${counter++}`,
        table: 'vocabulary',
        recordId,
        op: rand() < 0.15 ? 'delete' : 'put',
        payload: { n: counter },
        now: 1000 + Math.floor(rand() * 50), // clocks overlap and even run backwards
        resolves,
      });
      lastUpdated.set(d, e.updatedAt);
      all.push(e);
      replicas.set(d, applyEvent(state, e));
    } else {
      // Receive a random subset of everyone's events, out of order, possibly with gaps.
      const got = shuffled(all, rand).filter(() => rand() < 0.4);
      replicas.set(d, applyAll(replicas.get(d) as SyncState, got));
    }
  }
  return all;
}

const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);

// --- unit cases ----------------------------------------------------------------

const ev = (over: Partial<SyncEvent> & Pick<SyncEvent, 'eventId' | 'deviceId' | 'seq'>): SyncEvent => ({
  table: 'vocabulary',
  recordId: 'r',
  op: 'put',
  payload: {},
  updatedAt: 1,
  seen: {},
  ...over,
});

describe('causality', () => {
  it('orders events from one device by seq', () => {
    const a = ev({ eventId: 'a', deviceId: 'A', seq: 1 });
    const b = ev({ eventId: 'b', deviceId: 'A', seq: 2 });
    expect(precedes(a, b)).toBe(true);
    expect(precedes(b, a)).toBe(false);
  });

  it('uses the other device\'s clock across devices, and treats unrelated events as concurrent', () => {
    const a = ev({ eventId: 'a', deviceId: 'A', seq: 1 });
    const seen = ev({ eventId: 'b', deviceId: 'B', seq: 1, seen: { A: 1 } });
    const blind = ev({ eventId: 'c', deviceId: 'B', seq: 2 });
    expect(precedes(a, seen)).toBe(true);
    expect(precedes(a, blind)).toBe(false);
    expect(precedes(blind, a)).toBe(false);
  });
});

describe('already-applied test', () => {
  it('does not treat a late event 7 as applied just because 8 arrived first', () => {
    let s = emptyState();
    s = applyAll(s, [ev({ eventId: 'e1', deviceId: 'A', seq: 1, recordId: 'x' })]);
    s = applyEvent(s, ev({ eventId: 'e3', deviceId: 'A', seq: 3, recordId: 'y' }));
    expect(s.applied.prefix.A).toBe(1);
    expect(s.applied.extra.A).toEqual([3]);
    expect(isApplied(s.applied, 'A', 2)).toBe(false);
    s = applyEvent(s, ev({ eventId: 'e2', deviceId: 'A', seq: 2, recordId: 'z' }));
    expect(s.applied.prefix.A).toBe(3);
    expect(s.applied.extra.A).toBeUndefined();
    expect(s.frontiers[recordKey('vocabulary', 'z')]).toHaveLength(1);
  });

  it('ignores a replayed event', () => {
    const e = ev({ eventId: 'e1', deviceId: 'A', seq: 1 });
    const once = applyEvent(emptyState(), e);
    expect(applyEvent(once, e)).toBe(once);
  });
});

describe('frontier', () => {
  it('keeps concurrent events and reduces them deterministically', () => {
    const a = ev({ eventId: 'a', deviceId: 'A', seq: 1, updatedAt: 5 });
    const b = ev({ eventId: 'b', deviceId: 'B', seq: 1, updatedAt: 9 });
    const s = applyAll(emptyState(), [a, b]);
    const f = s.frontiers[recordKey('vocabulary', 'r')];
    expect(f.map((e) => e.eventId)).toEqual(['a', 'b']);
    expect(reduceFrontier(f)?.winner.eventId).toBe('b');
    expect(reduceFrontier(f)?.losers.map((e) => e.eventId)).toEqual(['a']);
  });

  it('breaks full ties on deviceId then eventId', () => {
    const a = ev({ eventId: 'a', deviceId: 'A', seq: 1, updatedAt: 5 });
    const b = ev({ eventId: 'b', deviceId: 'B', seq: 1, updatedAt: 5 });
    expect(compareEvents(a, b)).toBeLessThan(0);
    const c = ev({ eventId: 'c', deviceId: 'A', seq: 2, updatedAt: 5, seen: {} });
    const d = ev({ eventId: 'd', deviceId: 'A', seq: 3, updatedAt: 5 });
    expect(compareEvents(c, d)).toBeLessThan(0);
  });

  it('does not let a late-arriving old event re-enter', () => {
    const old = ev({ eventId: 'old', deviceId: 'A', seq: 1 });
    const next = ev({ eventId: 'next', deviceId: 'B', seq: 1, seen: { A: 1 } });
    const s = applyAll(emptyState(), [next, old]);
    expect(s.frontiers[recordKey('vocabulary', 'r')].map((e) => e.eventId)).toEqual(['next']);
  });

  it('keeps causality transitive when a device has not received an intermediate event', () => {
    // C wrote c1; B saw it and wrote b1; A saw b1 but never received c1 itself.
    const c1 = ev({ eventId: 'c1', deviceId: 'C', seq: 1 });
    const b1 = ev({ eventId: 'b1', deviceId: 'B', seq: 1, seen: { C: 1 } });
    let a = applyEvent(emptyState(), b1);
    const a1 = createLocalEvent(a, 'A', 0, { eventId: 'a1', table: 'vocabulary', recordId: 'r', op: 'put', payload: {}, now: 10 });
    a = applyEvent(a, a1);
    expect(a1.seen.C).toBe(1); // A is causally after c1 even though it never applied it
    a = applyEvent(a, c1); // c1 arrives late
    expect(a.frontiers[recordKey('vocabulary', 'r')].map((e) => e.eventId)).toEqual(['a1']);
  });

  it('a resolution removes events it names even when they are concurrent with it', () => {
    const f1 = ev({ eventId: 'f1', deviceId: 'A', seq: 1 });
    const f2 = ev({ eventId: 'f2', deviceId: 'B', seq: 1 });
    const res = ev({ eventId: 'res', deviceId: 'C', seq: 1, resolves: ['f1', 'f2'] });
    for (const order of [[f1, f2, res], [res, f1, f2], [f2, res, f1]]) {
      const s = applyAll(emptyState(), order);
      expect(s.frontiers[recordKey('vocabulary', 'r')].map((e) => e.eventId)).toEqual(['res']);
    }
  });

  it('ignores a resolves that names an event of a different record', () => {
    const other = ev({ eventId: 'o', deviceId: 'A', seq: 1, recordId: 'other' });
    const res = ev({ eventId: 'res', deviceId: 'B', seq: 1, recordId: 'r', resolves: ['o'] });
    const s = applyAll(emptyState(), [other, res]);
    expect(s.frontiers[recordKey('vocabulary', 'other')].map((e) => e.eventId)).toEqual(['o']);
  });
});

describe('createLocalEvent', () => {
  it('numbers events from 1, keeps updatedAt strictly increasing across a backwards clock, and excludes itself from seen', () => {
    let s = emptyState();
    const first = createLocalEvent(s, 'A', 0, { eventId: 'e1', table: 't', recordId: 'r', op: 'put', payload: 1, now: 500 });
    s = applyEvent(s, first);
    const second = createLocalEvent(s, 'A', first.updatedAt, { eventId: 'e2', table: 't', recordId: 'r', op: 'put', payload: 2, now: 100 });
    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
    expect(second.updatedAt).toBe(501);
    expect(second.seen.A).toBeUndefined();
  });
});

// --- properties -----------------------------------------------------------------

describe('convergence properties (60 random multi-device histories)', () => {
  it('any apply order, with duplicates, gives the same state', () => {
    for (const seed of SEEDS) {
      const events = simulate(seed);
      const rand = rng(seed * 7919);
      const expected = canon(applyAll(emptyState(), events));
      for (let trial = 0; trial < 5; trial++) {
        const order = shuffled([...events, ...events.filter(() => rand() < 0.3)], rand);
        expect(canon(applyAll(emptyState(), order)), `seed ${seed}`).toBe(expected);
      }
    }
  });

  it('every record\'s visible winner is the same whatever the arrival order', () => {
    for (const seed of SEEDS) {
      const events = simulate(seed);
      const rand = rng(seed * 104729);
      const winners = (s: SyncState) => Object.fromEntries(Object.entries(s.frontiers).map(([k, f]) => [k, reduceFrontier(f)?.winner.eventId]));
      const expected = winners(applyAll(emptyState(), events));
      expect(winners(applyAll(emptyState(), shuffled(events, rand))), `seed ${seed}`).toEqual(expected);
    }
  });

  it('joining partial states equals applying everything, and join is commutative, associative and idempotent', () => {
    for (const seed of SEEDS) {
      const events = simulate(seed);
      const rand = rng(seed * 31337);
      const parts: SyncEvent[][] = [[], [], []];
      for (const e of events) parts[Math.floor(rand() * 3)].push(e);
      const [a, b, c] = parts.map((p) => applyAll(emptyState(), shuffled(p, rand)));
      const full = canon(applyAll(emptyState(), events));
      expect(canon(joinStates(joinStates(a, b), c)), `seed ${seed} join`).toBe(full);
      expect(canon(joinStates(a, b)), `seed ${seed} commutative`).toBe(canon(joinStates(b, a)));
      expect(canon(joinStates(joinStates(a, b), c)), `seed ${seed} associative`).toBe(canon(joinStates(a, joinStates(b, c))));
      expect(canon(joinStates(a, a)), `seed ${seed} idempotent`).toBe(canon(a));
    }
  });

  it('replaying events after a join changes nothing (restored files cannot be replayed as new)', () => {
    for (const seed of SEEDS) {
      const events = simulate(seed);
      const joined = joinStates(applyAll(emptyState(), events.slice(0, events.length >> 1)), applyAll(emptyState(), events.slice(events.length >> 1)));
      expect(canon(applyAll(joined, events)), `seed ${seed}`).toBe(canon(joined));
    }
  });

  it('a state restored from a snapshot then fed the remaining events matches the full history', () => {
    for (const seed of SEEDS) {
      const events = simulate(seed);
      const rand = rng(seed * 65537);
      const cut = Math.floor(rand() * events.length);
      const snapshot = applyAll(emptyState(), shuffled(events.slice(0, cut), rand));
      const resumed = applyAll(JSON.parse(JSON.stringify(snapshot)) as SyncState, shuffled(events, rand));
      expect(canon(resumed), `seed ${seed}`).toBe(canon(applyAll(emptyState(), events)));
    }
  });
});
