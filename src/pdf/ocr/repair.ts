/**
 * Repairing a misread word from the dictionary. Scans go wrong in a few predictable ways: a dot is
 * lost or added (ب ت ث ن ي), two similar shapes swap (د ذ, ر ز, ف ق), a final ة reads as ه, a thin
 * letter drops out. This makes the likely variants of a read word; the caller keeps those the
 * dictionary recognises.
 */

/** Letters scans confuse, grouped; any member can stand in for another. */
export const CONFUSABLE_GROUPS: readonly string[] = ['بتثني', 'جحخ', 'دذ', 'رز', 'سش', 'صض', 'طظ', 'عغ', 'فق', 'ةه', 'ىي', 'اأإآ', 'وؤ', 'ئيى', 'لا'];

const MARKS = /[ً-ٰٟـ]/g;
/** Letters most often lost from a read (thin strokes). */
const DROPPABLE = 'اليونتمهبر';

export interface Candidate {
  word: string;
  /** Plain words for the popup, e.g. "ه → ة · the usual scan slip". */
  why: string;
  /** Lower is likelier. */
  weight: number;
}

const partnersOf = (letter: string): string[] => CONFUSABLE_GROUPS.filter((g) => g.includes(letter)).flatMap((g) => [...g].filter((c) => c !== letter));

function swapNote(from: string, to: string): string {
  if (from === 'ه' && to === 'ة') return 'ه → ة · the usual scan slip';
  if (from === 'ي' && to === 'ى') return 'ي → ى · final yā’ and alif maqṣūra look alike';
  if (from === 'ى' && to === 'ي') return 'ى → ي · final yā’ and alif maqṣūra look alike';
  if ('بتثني'.includes(from) && 'بتثني'.includes(to)) return `${from} → ${to} · same shape, different dots`;
  return `${from} → ${to} · similar shapes`;
}

/**
 * Every variant within one letter swap, one dropped letter put back, or one stray letter removed;
 * for words of four letters or more, two swaps as well. Not filtered: the caller asks the dictionary.
 */
export function repairVariants(read: string): Candidate[] {
  const word = read.replace(MARKS, '');
  const letters = [...word];
  const out = new Map<string, Candidate>();
  const add = (w: string, why: string, weight: number) => {
    if (w === word || w.length < 2) return;
    const known = out.get(w);
    if (!known || known.weight > weight) out.set(w, { word: w, why, weight });
  };

  letters.forEach((letter, i) => {
    for (const to of partnersOf(letter)) add(letters.slice(0, i).join('') + to + letters.slice(i + 1).join(''), swapNote(letter, to), 1 + (i === letters.length - 1 ? 0 : 0.2));
    // A stray stroke read as a letter.
    add(letters.slice(0, i).join('') + letters.slice(i + 1).join(''), `without the extra ${letter}`, 2.5);
  });
  for (let i = 0; i <= letters.length; i++) {
    for (const extra of DROPPABLE) add(letters.slice(0, i).join('') + extra + letters.slice(i).join(''), `a missing ${extra} put back`, 2 + (i === 0 || i === letters.length ? 0.3 : 0));
  }
  if (letters.length >= 4) {
    letters.forEach((a, i) => {
      for (let j = i + 1; j < letters.length; j++) {
        for (const toA of partnersOf(a)) {
          for (const toB of partnersOf(letters[j])) {
            const next = [...letters];
            next[i] = toA;
            next[j] = toB;
            add(next.join(''), `${a} → ${toA} and ${letters[j]} → ${toB} · similar shapes`, 3);
          }
        }
      }
    });
  }
  return [...out.values()];
}

/** The dictionary's judgement of a batch of words: which are real words. */
export type KnownWords = (words: string[]) => Promise<Set<string>>;
/** How common each word is (1 = most common); words the list lacks are absent. */
export type WordRanks = (words: string[]) => Promise<Map<string, number>>;

/**
 * The likely corrections of a misread word: variants the dictionary knows, the likeliest first (fewest
 * changes, then the commonest word). At most `limit`.
 */
export async function repairCandidates(read: string, known: KnownWords, ranks?: WordRanks, limit = 3): Promise<Candidate[]> {
  const variants = repairVariants(read);
  if (!variants.length) return [];
  const real = await known(variants.map((v) => v.word));
  const hits = variants.filter((v) => real.has(v.word));
  if (!hits.length) return [];
  const rank = ranks ? await ranks(hits.map((h) => h.word)).catch(() => new Map<string, number>()) : new Map<string, number>();
  const score = (c: Candidate) => c.weight + (rank.has(c.word) ? Math.min(rank.get(c.word)! / 20000, 1) - 1 : 0) * 0.9;
  return hits
    .map((c) => ({ ...c, why: rank.has(c.word) && rank.get(c.word)! <= 8000 ? `${c.why} · common word` : c.why }))
    .sort((a, b) => score(a) - score(b))
    .slice(0, limit);
}
