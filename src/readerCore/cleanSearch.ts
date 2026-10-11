import { normalize, normalizeForSearch, tokenize } from '../reader/tokenizer/arabicTokenizer';

/** One match in the clean text, already split for display. */
export interface CleanHit {
  chapter: number;
  start: number;
  end: number;
  before: string;
  match: string;
  after: string;
}

export type CleanMatch = 'phrase' | 'word' | 'root';

const CONTEXT = 48;
export const MAX_HITS = 300;

function hit(text: string, chapter: number, start: number, end: number): CleanHit {
  const from = Math.max(0, start - CONTEXT);
  const to = Math.min(text.length, end + CONTEXT);
  return {
    chapter,
    start,
    end,
    before: (from > 0 ? '…' : '') + text.slice(from, start),
    match: text.slice(start, end),
    after: text.slice(end, to) + (to < text.length ? '…' : ''),
  };
}

/**
 * Diacritic- and alef-insensitive search over chapter texts. 'phrase': the
 * query as one run. 'word': every query word somewhere in the same paragraph
 * (pointing at the first), like the epub reader's "Any word". `paragraphs`
 * gives each chapter's paragraph boundaries for 'word'.
 */
export function searchTexts(
  texts: string[],
  query: string,
  match: Exclude<CleanMatch, 'root'>,
  options: { chapters?: number[]; paragraphs?: number[][] } = {}
): CleanHit[] {
  const { normalized: needle } = normalizeForSearch(query.trim());
  if (!needle) return [];
  const words = needle.split(/\s+/).filter(Boolean);
  const hits: CleanHit[] = [];
  const chapters = options.chapters ?? texts.map((_, i) => i);
  for (const chapter of chapters) {
    const text = texts[chapter] ?? '';
    const { normalized, toOriginal } = normalizeForSearch(text);
    const original = (n: number) => (n < toOriginal.length ? toOriginal[n] : text.length);
    if (match === 'word') {
      const bounds = options.paragraphs?.[chapter] ?? [0, text.length];
      for (let p = 0; p < bounds.length - 1 && hits.length < MAX_HITS; p++) {
        const [from, to] = [bounds[p], bounds[p + 1]];
        const slice = normalizeForSearch(text.slice(from, to));
        const first = slice.normalized.indexOf(words[0]);
        if (first === -1 || !words.every((w) => slice.normalized.includes(w))) continue;
        const start = from + slice.toOriginal[first];
        const endN = first + words[0].length;
        const end = from + (endN < slice.toOriginal.length ? slice.toOriginal[endN] : to - from);
        hits.push(hit(text, chapter, start, end));
      }
      continue;
    }
    for (let from = 0; hits.length < MAX_HITS; ) {
      const idx = normalized.indexOf(needle, from);
      if (idx === -1) break;
      from = idx + needle.length;
      hits.push(hit(text, chapter, original(idx), original(from)));
    }
    if (hits.length >= MAX_HITS) break;
  }
  return hits;
}

/** Every Arabic word in the texts whose normalized form is in `forms`. */
export function searchForms(texts: string[], forms: ReadonlySet<string>, chapters?: number[]): CleanHit[] {
  const hits: CleanHit[] = [];
  for (const chapter of chapters ?? texts.map((_, i) => i)) {
    const text = texts[chapter] ?? '';
    for (const token of tokenize(text)) {
      if (!token.isArabic || !forms.has(normalize(token.text))) continue;
      hits.push(hit(text, chapter, token.start, token.end));
      if (hits.length >= MAX_HITS) return hits;
    }
  }
  return hits;
}

/** The distinct normalized Arabic words in the texts (what a root search analyzes). */
export function distinctForms(texts: string[]): string[] {
  const forms = new Set<string>();
  for (const text of texts) for (const token of tokenize(text)) if (token.isArabic) forms.add(normalize(token.text));
  return Array.from(forms);
}
