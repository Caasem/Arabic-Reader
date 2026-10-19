import { ROLE_BY_ID, isStep, type ArgItem } from './roles';

export type GapKey = 'nogr' | 'nowar' | 'norep' | 'orphan';

export interface Gap {
  key: GapKey;
  title: string;
  ids: string[];
}

const TITLES: Record<GapKey, string> = {
  nogr: 'Claims with no grounds',
  nowar: 'Steps with no warrant',
  norep: 'Objections with no reply',
  orphan: 'Not attached to anything',
};

const ORDER: GapKey[] = ['nogr', 'nowar', 'norep', 'orphan'];

export const NO_GAPS = 'No gaps: every claim has grounds, every step a warrant, every objection a reply.';

/** What the structure says is missing. Only gaps that have offenders are returned. */
export function gaps(items: readonly ArgItem[]): Gap[] {
  const out: Partial<Record<GapKey, string[]>> = {};
  const add = (key: GapKey, id: string) => (out[key] ??= []).push(id);
  const attached = (id: string, role: string) => items.some((m) => m.role === role && m.for === id);
  for (const n of items) {
    if (ROLE_BY_ID[n.role].needs !== 'also' && !n.for) add('orphan', n.id);
    if (n.role === 'claim' && !items.some((m) => m.for === n.id && (m.role === 'grounds' || m.role === 'claim'))) add('nogr', n.id);
    if (isStep(n) && n.for && !attached(n.id, 'warrant')) add('nowar', n.id);
    if (n.role === 'objection' && !attached(n.id, 'reply')) add('norep', n.id);
  }
  return ORDER.filter((k) => out[k]).map((k) => ({ key: k, title: TITLES[k], ids: out[k]! }));
}

/** The offender to jump to after `current`, cycling. */
export function nextOffender(ids: readonly string[], current: string | null): string | null {
  if (!ids.length) return null;
  const i = current ? ids.indexOf(current) : -1;
  return ids[(i + 1) % ids.length];
}
