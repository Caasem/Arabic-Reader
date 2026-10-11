import { ITEM_IDS } from './items';

/** Everything the checklist remembers (per device). */
export interface GsState {
  done: string[];
  /** "Hide for good", or switched off in Settings. */
  hidden: boolean;
  /** The card is folded to its title line. */
  collapsed: boolean;
  /** The closing line was dismissed. */
  celebrated: boolean;
  /** Already filled from existing data once. */
  seeded: boolean;
}

export const INITIAL: GsState = { done: [], hidden: false, collapsed: false, celebrated: false, seeded: false };

export function normalise(raw: unknown): GsState {
  if (!raw || typeof raw !== 'object') return INITIAL;
  const r = raw as Partial<GsState>;
  return {
    done: Array.isArray(r.done) ? r.done.filter((id): id is string => ITEM_IDS.includes(id as string)) : [],
    hidden: r.hidden === true,
    collapsed: r.collapsed === true,
    celebrated: r.celebrated === true,
    seeded: r.seeded === true,
  };
}

export const isDone = (s: GsState, id: string): boolean => s.done.includes(id);

/** Ticks an item. The same state back when it is unknown or already ticked. */
export function mark(s: GsState, id: string): GsState {
  if (!ITEM_IDS.includes(id) || isDone(s, id)) return s;
  return { ...s, done: [...s.done, id] };
}

export const count = (s: GsState): number => ITEM_IDS.filter((id) => isDone(s, id)).length;
export const total = (): number => ITEM_IDS.length;
export const allDone = (s: GsState): boolean => count(s) === total();

/** What the Library shows: nothing, the card, or the one-off closing line. */
export type Visibility = 'hidden' | 'card' | 'done';

export function visibility(s: GsState): Visibility {
  if (s.hidden) return 'hidden';
  if (allDone(s)) return s.celebrated ? 'hidden' : 'done';
  return 'card';
}

/** What the databases can prove the person already did. */
export interface SeedCounts {
  /** Saved words (not hand-written cards). */
  savedWords: number;
  /** Highlights that carry a note. */
  notes: number;
  /** Hand-written flashcards (not made from sketch sheets). */
  customCards: number;
  /** Items on a Ḥāshiya desk (a margin card, a capture, anything). */
  deskItems: number;
  /** Ink strokes on pages, non-empty sketch sheets and ink margin cards. */
  drawings: number;
  /** The same, on a PDF page. */
  drawingsElsewhere: number;
}

export function seedFromCounts(c: SeedCounts): string[] {
  const ids: string[] = [];
  const add = (id: string, yes: boolean) => {
    if (yes) ids.push(id);
  };
  add('save-word', c.savedWords > 0);
  add('write-note', c.notes > 0);
  add('make-flashcard', c.customCards > 0);
  add('open-hashiya', c.deskItems > 0);
  add('draw-sketch', c.drawings > 0);
  add('draw-other-source', c.drawingsElsewhere > 0);
  return ids;
}

/** Applies a seed once; later calls change nothing. */
export function applySeed(s: GsState, counts: SeedCounts): GsState {
  if (s.seeded) return s;
  return { ...seedFromCounts(counts).reduce(mark, s), seeded: true };
}

/** "Start over": progress cleared, shown again, and not filled from the database a second time. */
export const startOver = (): GsState => ({ ...INITIAL, seeded: true });
