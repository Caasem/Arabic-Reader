/**
 * Render-time cutting of an English-language dictionary line (AraMorph, Lane, Hans Wehr, Baranov) into runs, so each
 * run can be set the way it reads: Arabic words in the reading font and their own direction, Lane's source sigla small
 * and faint, Hans Wehr's transliteration muted. Nothing here changes the text itself -- the segments always
 * concatenate back to `text.slice(from, to)` -- so what is copied, saved or searched is untouched.
 */
import { traitsOf } from '../providerTraits';
import { italicPieces, type ItalicSpan } from './laneItalics';

export type SenseKind = 'plain' | 'italic' | 'sigla' | 'translit';
export type SenseStyle = 'plain' | 'lane' | 'hanswehr';

export interface SenseSegment {
  text: string;
  kind: SenseKind;
  /** An Arabic-script run: shown right to left in the reading font. */
  arabic: boolean;
  /** The line's opening Arabic headword (Lane, Hans Wehr only). */
  lead: boolean;
}

const AR = '\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF';
/** Arabic words, joined across spaces and Arabic commas. */
const ARABIC_RUN = new RegExp(`[${AR}]+(?:[ \\u00A0\\u060C\\u061B]+[${AR}]+)*`, 'g');

/** Arabic-script runs of `text` as [start, end) ranges. */
export function arabicRuns(text: string): [number, number][] {
  const out: [number, number][] = [];
  for (const m of text.matchAll(ARABIC_RUN)) out.push([m.index!, m.index! + m[0].length]);
  return out;
}

/** Lane's source abbreviations that are not all capitals. */
const SIGLA_WORDS = new Set([
  'Msb', 'Mgh', 'Az', 'Sgh', 'Akh', 'Lth', 'Fr', 'Zj', 'Ks', 'Kr', 'Sh', 'Sb', 'Ham', 'Ibn', 'Yaaq',
  'IAar', 'IAmb', 'IB', 'IDrd', 'IJ', 'IKt', 'ISd', 'IKh', 'IF', 'AHn', 'AHei', 'AO', 'Nh', 'Th', 'Mtr',
  'Ibd', 'Mj', 'Mṣb', 'Ḥ', 'Mṣ', 'Kh',
]);

function isSiglaToken(t: string): boolean {
  return SIGLA_WORDS.has(t) || /^[A-Z]{1,4}$/.test(t);
}

/** Parenthesised groups that hold nothing but source sigla -- "(S, A, Msb, K,)", "(TA.)", "(K:)" -- as ranges
 * including both brackets. Any other bracket (an Arabic word, a note, an English phrase) is left alone. */
export function siglaRanges(text: string): [number, number][] {
  const out: [number, number][] = [];
  for (const m of text.matchAll(/\(([^()]{1,80})\)/g)) {
    const inner = m[1].replace(/&c\./g, ' ');
    const tokens = inner.split(/[\s,;:.*]+/).filter(Boolean);
    if (tokens.length && tokens.every(isSiglaToken)) out.push([m.index!, m.index! + m[0].length]);
  }
  return out;
}

const LATIN = 'A-Za-z\\u00C0-\\u024F\\u1E00-\\u1EFF\\u02BB-\\u02BF';
const LATIN_WORD = new RegExp(`[${LATIN}]+(?:[\\u2018\\u02BF\\u02BE][${LATIN}]+)*`, 'g');
const DIACRITIC = /[À-ɏḀ-ỿʻ-ʿ]|[‘]/;

/** Hans Wehr's Latin transliteration as ranges: every word carrying a transliteration letter (ā ī ū ḥ ṣ ḍ ṭ ẓ ʿ ʾ ġ ṯ ḵ ǧ ...),
 * plus the plain word that follows the line's opening Arabic word ("حسد ḥasada u") and its conjugation vowels (u, i, a). */
export function translitRanges(text: string): [number, number][] {
  const out: [number, number][] = [];
  for (const m of text.matchAll(LATIN_WORD)) {
    if (DIACRITIC.test(m[0])) out.push([m.index!, m.index! + m[0].length]);
  }
  const lead = leadRun(text);
  if (lead) {
    const after = new RegExp(`^[ \u00A0]+(${LATIN_WORD.source})((?:[ \u00A0]+[aui](?![${LATIN}]))*)`).exec(text.slice(lead[1]));
    if (after) {
      const start = lead[1] + after[0].indexOf(after[1]);
      out.push([start, lead[1] + after[0].length]);
    }
  }
  return mergeRanges(out);
}

/** Sorted ranges with overlapping ones joined. */
function mergeRanges(ranges: [number, number][]): [number, number][] {
  const sorted = [...ranges].sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** The opening Arabic run of the text (only whitespace before it), or null. */
export function leadRun(text: string): [number, number] | null {
  const first = arabicRuns(text)[0];
  if (!first) return null;
  return /^\s*$/.test(text.slice(0, first[0])) ? first : null;
}

function within(a: number, b: number, ranges: [number, number][]): boolean {
  return ranges.some(([s, e]) => a >= s && b <= e);
}

/**
 * `text.slice(from, to)` cut into segments. `style` picks which extra marks apply (Lane: sigla; Hans Wehr:
 * transliteration; both: the opening Arabic headword as `lead`, unless `lead` is false, e.g. when the matched
 * headword was already drawn separately). `spans` are Lane's italic ranges of the whole text.
 */
export function senseSegments(
  text: string,
  { style = 'plain', spans, from = 0, to = text.length, lead = true }: { style?: SenseStyle; spans?: ItalicSpan[]; from?: number; to?: number; lead?: boolean } = {},
): SenseSegment[] {
  const slice = text.slice(from, to);
  if (!slice) return [];
  const shift = (rs: [number, number][]): [number, number][] => rs.map(([a, b]) => [a + from, b + from]);
  const sigla = style === 'lane' ? shift(siglaRanges(slice)) : [];
  // Read on the whole line too, so a line drawn without its opening headword keeps the transliteration that follows it.
  const wholeTranslit = style === 'hanswehr' && from > 0 ? translitRanges(text).filter(([a, b]) => b > from && a < to).map(([a, b]): [number, number] => [Math.max(a, from), Math.min(b, to)]) : [];
  const translit = style === 'hanswehr' ? mergeRanges([...shift(translitRanges(slice)), ...wholeTranslit]) : [];
  const leadAt = style !== 'plain' && lead ? leadRun(slice) : null;
  const leadRange: [number, number] | null = leadAt ? [leadAt[0] + from, leadAt[1] + from] : null;

  const cuts = new Set<number>([from, to]);
  // Italic piece boundaries, then every other mark's.
  let at = from;
  for (const p of italicPieces(text, spans, from, to)) {
    at += p.text.length;
    cuts.add(at);
  }
  for (const [a, b] of [...sigla, ...translit, ...arabicRuns(slice).map(([x, y]): [number, number] => [x + from, y + from])]) {
    cuts.add(a);
    cuts.add(b);
  }
  const italicRanges: [number, number][] = [];
  at = from;
  for (const p of italicPieces(text, spans, from, to)) {
    if (p.italic) italicRanges.push([at, at + p.text.length]);
    at += p.text.length;
  }
  const arabic = arabicRuns(slice).map(([x, y]): [number, number] => [x + from, y + from]);

  const points = [...cuts].filter((c) => c >= from && c <= to).sort((x, y) => x - y);
  const out: SenseSegment[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (b <= a) continue;
    const kind: SenseKind = within(a, b, italicRanges) ? 'italic' : within(a, b, sigla) ? 'sigla' : within(a, b, translit) ? 'translit' : 'plain';
    const isAr = within(a, b, arabic);
    out.push({ text: text.slice(a, b), kind, arabic: isAr, lead: isAr && !!leadRange && within(a, b, [leadRange]) });
  }
  return out;
}

/** The style a provider's lines get. */
export function senseStyleFor(providerId: string): SenseStyle {
  return traitsOf(providerId).senseStyle;
}
