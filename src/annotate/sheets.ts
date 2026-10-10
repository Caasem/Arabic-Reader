import { parseCleanLocation } from '../quietReader/location';
import type { Sketch, SketchScope } from './types';

/**
 * Which sketch sheets belong where (SketchPanel's tabs). A sheet is kept with the place it was started at (a PDF
 * page, or a passage of a chapter) unless its scope says more: a range of pages (PDF) or chapters (reader), or
 * the whole book. Every sheet that covers the place on screen is a tab there; closed (hidden) sheets are left
 * out of the tabs and stay in All sheets.
 */

/** Where the reader is: a PDF page, or the passage of a chapter on screen in the quiet reader. */
export type Place = { kind: 'pdf'; page: number } | { kind: 'clean'; chapter: number; start: number; end: number };

export const placeKey = (p: Place): string => (p.kind === 'pdf' ? `pdf:${p.page}` : `clean:${p.chapter}`);
/** The page or chapter a place is on. */
const unitOf = (p: Place): number => (p.kind === 'pdf' ? p.page : p.chapter);
/** The page or chapter a sheet was started on. */
export function sheetUnit(s: Pick<Sketch, 'key'>): number {
  return Number(s.key.split(':')[1]) || 0;
}
const sameKind = (s: Pick<Sketch, 'key'>, p: Place) => s.key.startsWith(p.kind === 'pdf' ? 'pdf:' : 'clean:');

export const scopeOf = (s: Pick<Sketch, 'scope'>): SketchScope => s.scope ?? { kind: 'place' };

/** Whether the sheet belongs to the place on screen. */
export function covers(s: Pick<Sketch, 'key' | 'location' | 'scope'>, p: Place): boolean {
  if (!sameKind(s, p)) return false;
  const scope = scopeOf(s);
  if (scope.kind === 'book') return true;
  if (scope.kind === 'range') return unitOf(p) >= scope.from && unitOf(p) <= scope.to;
  if (p.kind === 'pdf') return s.key === placeKey(p);
  if (s.key !== placeKey(p)) return false;
  // A passage: started inside what is on screen, or a little before it and still in view.
  const at = parseCleanLocation(s.location);
  return !!at && ((at.start >= p.start && at.start <= p.end) || (at.start < p.start && at.end >= p.start));
}

const byOrder = (a: Sketch, b: Sketch) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt);

/** The tabs at a place: the sheets covering it, not closed, in their order. */
export function tabsAt(sketches: readonly Sketch[], p: Place): Sketch[] {
  return sketches.filter((s) => !s.hidden && covers(s, p)).sort(byOrder);
}

/** A sheet's name: its own, or "Sheet n" by its place among the tabs. */
export function sheetName(s: Pick<Sketch, 'title'>, index: number): string {
  return s.title?.trim() || `Sheet ${index + 1}`;
}

/** A name for a new sheet at a place: the next "Sheet n" not taken there. */
export function nextTitle(tabs: readonly Pick<Sketch, 'title'>[]): string {
  const taken = new Set(tabs.map((t, i) => sheetName(t, i)));
  let n = tabs.length + 1;
  while (taken.has(`Sheet ${n}`)) n++;
  return `Sheet ${n}`;
}

/** Words for a sheet's scope, for its tab and the list of all sheets. */
export function scopeLabel(s: Pick<Sketch, 'key' | 'scope'>): string {
  const scope = scopeOf(s);
  const pdf = s.key.startsWith('pdf:');
  if (scope.kind === 'book') return 'Whole book';
  if (scope.kind === 'range') return pdf ? `Pages ${scope.from}–${scope.to}` : `Chapters ${scope.from + 1}–${scope.to + 1}`;
  return pdf ? `Page ${sheetUnit(s)}` : `Chapter ${sheetUnit(s) + 1}`;
}

/** The scope a range for this place would have, clamped so it always includes the sheet's own page or chapter. */
export function rangeScope(s: Pick<Sketch, 'key'>, from: number, to: number): SketchScope {
  const own = sheetUnit(s);
  const a = Math.min(from, to, own);
  const b = Math.max(from, to, own);
  return { kind: 'range', from: Math.max(0, a), to: b };
}

// --- the tab last used at each place, per book (this device) ---------------------------------------------
const TAB_KEY = 'arabic-reader:sketch-tabs';

function readTabs(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(TAB_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

export function rememberTab(bookId: string, p: Place, sketchId: string): void {
  try {
    const all = readTabs();
    all[`${bookId}|${placeKey(p)}`] = sketchId;
    localStorage.setItem(TAB_KEY, JSON.stringify(all));
  } catch {
    // Remembering the tab is a nicety.
  }
}

export function recallTab(bookId: string, p: Place): string | undefined {
  return readTabs()[`${bookId}|${placeKey(p)}`];
}
