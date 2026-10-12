/**
 * Lane's Lexicon marks its English meanings in italics; the rest of a line is Arabic quotation and source
 * notes. scripts/extract-lexicon-data.py keeps those spans in lane.tsv as a private-use pair that occurs in
 * no other shipped data. They never travel further than here: a sense's `gloss` is always marker-free
 * (so search, copy, flashcards, vocabulary, sense picks and the sub-entry index never see them) and the
 * spans ride along as ranges of that clean text -- see DictionaryEntrySense.italics.
 */
export const ITALIC_OPEN = '';
export const ITALIC_CLOSE = '';

const MARKERS_RE = /[]/g;

/** Text with the italic markers removed. */
export function stripItalics(text: string): string {
  return text.replace(MARKERS_RE, '');
}

/** A [start, end) range of a gloss's characters. */
export type ItalicSpan = [number, number];

/** A marked line as the clean text, trimmed, and where the italics fall in it. */
export function splitItalics(marked: string): { text: string; spans: ItalicSpan[] } {
  if (!marked.includes(ITALIC_OPEN)) return { text: marked.trim(), spans: [] };
  let text = '';
  const spans: ItalicSpan[] = [];
  let open = -1;
  for (const ch of marked) {
    if (ch === ITALIC_OPEN) open = text.length;
    else if (ch === ITALIC_CLOSE) {
      if (open >= 0 && text.length > open) spans.push([open, text.length]);
      open = -1;
    } else text += ch;
  }
  const lead = text.length - text.trimStart().length;
  const trimmed = text.trim();
  const out: ItalicSpan[] = [];
  for (const [a, b] of spans) {
    const s = Math.max(a - lead, 0);
    const e = Math.min(b - lead, trimmed.length);
    if (e > s) out.push([s, e]);
  }
  return { text: trimmed, spans: out };
}

/** The pieces of `text.slice(from, to)` cut at the italic spans (offsets relative to the whole text). */
export function italicPieces(text: string, spans: ItalicSpan[] | undefined, from = 0, to = text.length): { text: string; italic: boolean }[] {
  const pieces: { text: string; italic: boolean }[] = [];
  let at = from;
  for (const [a, b] of spans ?? []) {
    const s = Math.max(a, from);
    const e = Math.min(b, to);
    if (e <= s) continue;
    if (s > at) pieces.push({ text: text.slice(at, s), italic: false });
    pieces.push({ text: text.slice(s, e), italic: true });
    at = e;
  }
  if (at < to) pieces.push({ text: text.slice(at, to), italic: false });
  return pieces;
}
