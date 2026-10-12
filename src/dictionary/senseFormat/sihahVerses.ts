/**
 * Verses in Al-Ṣiḥāḥ, found in a sense line for display only (the gloss is never changed).
 *
 * The editors set a quotation off like this: "قال الشاعر (١) : <first half> * <second half> * prose resumes". A star ends
 * each hemistich; the quotation can open the next line instead ("قال الراجز:" at the end of one line, the verse at
 * the start of the next). Verses with no stars (about a third) have no end we can trust and are left as prose, as are
 * stretches that look like prose (a colon, a full stop, or more than MAX_WORDS words between stars).
 */

export interface VerseHemistich {
  /** Character range of the hemistich's words, without its star. */
  start: number;
  end: number;
  /** Where the hemistich's star and the space after it end (the next one starts there). */
  next: number;
}

export interface Verse {
  hemistichs: VerseHemistich[];
}

const MAX_WORDS = 12;
const NOTE = '(?:\\([\\u0660-\\u0669\\d]{1,3}\\)\\s*)';
const SAID = '(?:و?قال|و?قول|و?أنشد|و?أنشدني|و?يقول)';
/** "قال الشاعر" / "قال الراجز", with an optional note mark, "يصف بعيرا", and colon. */
const GENERIC_INTRO = new RegExp(`${SAID}\\s+(?:الشاعر|الراجز|الرجز)\\s*${NOTE}?(?:يصف\\s+\\S+\\s*)?:?\\s*`, 'g');
/** "قال لبيد:" / "وقال امرؤ القيس:" -- a named speaker, only with the colon. */
const NAMED_INTRO = new RegExp(`${SAID}\\s+(?:[^\\s:*]+\\s+){0,3}?[^\\s:*]+\\s*${NOTE}?:\\s*`, 'g');
/** A line that ends by announcing a quotation, so the next line is the verse. */
const ENDS_WITH_INTRO = new RegExp(`(?:^|\\s)${SAID}\\s+(?:[^\\s:*]+\\s+){0,3}?[^\\s:*]+\\s*${NOTE}?:\\s*$`);

const NOTE_AT_END = /\([٠-٩\d]{1,3}\)[.،]?$/;
/** Words that open the commentary after a verse ("أي", "يعني", "ويقال" ...). */
const PROSE_OPENERS = new Set(['أي', 'يعني', 'يعنى', 'ويقال', 'يقال', 'وقال', 'قال', 'ويروى', 'يروى', 'وروى', 'تقول', 'يقول', 'ومنه', 'وقولهم', 'قولهم', 'وقوله', 'قوله', 'يريد', 'أراد', 'وأراد', 'وهو', 'وهي', 'ويروي', 'والجمع', 'وقد', 'وكذلك', 'وتقول', 'وذلك']);
/** Of those, the ones that cannot sit inside a hemistich at all. */
const STRONG_OPENERS = new Set(['أي', 'يعني', 'يعنى', 'ويقال', 'يقال', 'وقال', 'قال', 'ويروى', 'يروى', 'وروى', 'تقول', 'يقول', 'يريد', 'أراد', 'وأراد', 'وكذلك', 'وتقول']);
/** Quotations that are not verse: the Qur'an and hadith. */
const NOT_VERSE_SPEAKER = /الله|تعالى|رسول|النبي|الحديث/;

function looksLikeVerse(segment: string): boolean {
  const words = segment.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > MAX_WORDS) return false;
  if (/^\(.*\)$/.test(segment.trim())) return false;
  if (segment.includes(' - ') || /[،,]/.test(segment)) return false;
  return !/[:.؟]/.test(segment.replace(/\([٠-٩\d]{1,3}\)/g, ''));
}

/** The star-ended segments that start at `from`, as hemistichs. */
function segmentsFrom(gloss: string, from: number): VerseHemistich[] {
  const out: VerseHemistich[] = [];
  let pos = from;
  for (;;) {
    const star = gloss.indexOf('*', pos);
    if (star === -1) break;
    let raw = gloss.slice(pos, star);
    // "(321 - صحاح - 6)" is the printed edition's page mark, not verse.
    const page = /^\s*\(\d+\s*-[^)]*\)/.exec(raw);
    const skip = page ? page[0].length : 0;
    raw = raw.slice(skip);
    if (!looksLikeVerse(raw)) break;
    const lead = skip + raw.length - raw.trimStart().length;
    const body = raw.trim();
    let next = star + 1;
    while (next < gloss.length && /\s/.test(gloss[next])) next++;
    out.push({ start: pos + lead, end: pos + lead + body.length, next });
    pos = next;
  }
  if (out.length === 1) {
    const second = unendedSecondHalf(gloss, out[0]);
    if (second) out.push(second);
    else if (!standsAlone(gloss, out[0])) return [];
  }
  // Two halves of one line are about as long as each other; a far shorter or longer "half" is commentary.
  if (out.length >= 2) {
    const n = (h: VerseHemistich) => gloss.slice(h.start, h.end).split(/\s+/).length;
    if (Math.abs(n(out[0]) - n(out[1])) > 3 || n(out[1]) > 2 * n(out[0]) + 1 || 2 * n(out[1]) + 1 < n(out[0])) return [];
  }
  return out;
}

/** A single star-ended half is a whole verse (rajaz) when the line ends there or commentary ("وكذا: ...") follows at once. */
function standsAlone(gloss: string, h: VerseHemistich): boolean {
  const rest = gloss.slice(h.next).trim();
  return rest === '' || /^\S+(\s+\S+){0,2}:/.test(rest);
}

/**
 * Most verses close only the first half with a star: "A * B" and then prose. B is about as long as A; we take it only
 * when something ends it within that reach: a footnote mark "(١)", a dash, or a word that opens commentary.
 */
function unendedSecondHalf(gloss: string, first: VerseHemistich): VerseHemistich | null {
  const reach = Math.min(MAX_WORDS, gloss.slice(first.start, first.end).split(/\s+/).length + 3);
  const re = /\S+/g;
  re.lastIndex = first.next;
  let count = 0;
  let last = -1;
  for (let m = re.exec(gloss); m && count < reach; m = re.exec(gloss), count++) {
    const w = m[0];
    if (/[،,]/.test(w)) return null;
    const stop = w === '-' || w === '*' || /[:.؟]/.test(w.replace(NOTE_AT_END, '')) || STRONG_OPENERS.has(w) || (count >= 2 && PROSE_OPENERS.has(w));
    if (stop) return count >= 2 && last > 0 ? { start: first.next, end: last, next: last } : null;
    last = m.index + w.length;
    if (NOTE_AT_END.test(w)) return count >= 1 ? { start: first.next, end: last, next: last } : null;
  }
  return null;
}

/** Verses in one sense line. `prevGloss` is the line before it: when that ends by announcing a quotation, this line opens with the verse. */
export function findVerses(gloss: string, prevGloss?: string): Verse[] {
  const starts: number[] = [];
  const prevEnd = prevGloss && ENDS_WITH_INTRO.exec(prevGloss.trim());
  if (prevEnd && !NOT_VERSE_SPEAKER.test(prevEnd[0])) starts.push(0);
  for (const re of [GENERIC_INTRO, NAMED_INTRO]) {
    re.lastIndex = 0;
    for (let m = re.exec(gloss); m; m = re.exec(gloss)) if (!NOT_VERSE_SPEAKER.test(m[0])) starts.push(m.index + m[0].length);
  }
  starts.sort((a, b) => a - b);

  const verses: Verse[] = [];
  let covered = 0;
  for (const from of starts) {
    if (from < covered) continue;
    const segs = segmentsFrom(gloss, from);
    if (!segs.length) continue;
    verses.push({ hemistichs: segs });
    covered = segs[segs.length - 1].next;
  }
  return verses;
}

/** A verse's hemistichs paired into lines: two halves to a line, a last odd one alone. */
export function verseLines(verse: Verse): VerseHemistich[][] {
  const lines: VerseHemistich[][] = [];
  for (let i = 0; i < verse.hemistichs.length; i += 2) lines.push(verse.hemistichs.slice(i, i + 2));
  return lines;
}
