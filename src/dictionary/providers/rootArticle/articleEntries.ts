import type { DictionaryEntry, DictionaryEntrySense } from '../../../types';
import { hansWehrFormLine } from '../../senseFormat/hansWehrForms';
import { splitItalics } from '../../senseFormat/laneItalics';
import { leadForm, unitHead } from '../../subEntries/heads';
import { containsRoot, subEntryKey } from '../../subEntries/keys';
import { traitsOf } from '../../providerTraits';
import { rowToEntry, type RootArticleRow } from './rootArticleData';

/**
 * The adapter from a root article (one TSV row: a root and its `<br>`-separated lines) to the shared entry shape
 * (see DictionaryEntry). How an article is cut is the dictionary's declared `articles` trait:
 *
 * - `words` (Al-Ṣiḥāḥ): a new entry only where a paragraph opens with و + a word of the root; the paragraphs in
 *   between (sayings, quotations, verse tails) and the editor's notes become further senses of an entry.
 * - `lines` (Lane, Hans Wehr): one entry per line. Its headword is the word the line opens with
 *   (read by `unitHead`), the line stays the entry's single sense (`headLength` says how much of it is the
 *   headword, which the popup does not draw twice), the root rides along, and a verb line carries its form.
 * - `forms` (Al-Wasīṭ): one entry per lead form "(كَتَبَ) ..." with the continuations "و- ..." that follow it.
 * - `essay` (Maqāyīs): the article is one entry and its paragraphs are the senses -- the one dictionary with no
 *   per-word entries, since its articles explain a root's core meaning rather than list derived words.
 */
export function articleEntries(row: RootArticleRow, provider: { id: string; name: string }): DictionaryEntry[] {
  switch (traitsOf(provider.id).articles) {
    case 'lines':
      return lineEntries(row, provider);
    case 'words':
      return wordEntries(row, provider);
    case 'forms':
      return formEntries(row, provider);
    default:
      return [{ ...rowToEntry(row, provider), language: traitsOf(provider.id).language }];
  }
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
/** A verb form number (Lane's, Hans Wehr's) as the Roman numeral the popup shows; none past X, which AraMorph does not number. */
export const romanForm = (n: number | undefined): string | undefined => (n && n >= 1 && n <= 10 ? ROMAN[n] : undefined);

const EDGE_PUNCT = /^[↓([«]+|[،,.:;؛)\]»]+$/g;

function rootOf(row: RootArticleRow): string {
  return row.word.split('|')[0].trim();
}

function articleLines(row: RootArticleRow) {
  return row.meanings
    .split(/<br\s*\/?>/i)
    .map(splitItalics)
    .filter((s) => s.text);
}

function lineEntries(row: RootArticleRow, provider: { id: string; name: string }): DictionaryEntry[] {
  return articleLines(row).map((line, i) => groupEntry([line], i, row, provider));
}

/** An editor's note the extraction moved to the article's end: "(٢) قوله ...". */
const FOOTNOTE_RE = /^\s*(\([٠-٩0-9]+\))/;

/** Whether a paragraph opens with و + a word of the root ("وقَلَبْتُ", "والمُنْقَلَبُ") -- not "وقولهم:", "وقال". */
export function opensNewWord(text: string, root: string): boolean {
  const key = subEntryKey(text.trim().split(/\s+/)[0] ?? '');
  if (key.length < 3 || !key.startsWith('و')) return false;
  return containsRoot(key.slice(1), root);
}

/**
 * Al-Ṣiḥāḥ: a new entry only where a paragraph opens with و + a word of the root. Every other paragraph (a
 * saying, a quotation, the tail of a verse) joins the entry before it, and each editor's note joins the entry
 * whose text cites its number, else the last one. The article's first paragraph always opens the first entry.
 */
function wordEntries(row: RootArticleRow, provider: { id: string; name: string }): DictionaryEntry[] {
  const root = rootOf(row);
  type Line = ReturnType<typeof articleLines>[number];
  const groups: Line[][] = [];
  const notes: { mark: string; line: Line }[] = [];
  for (const line of articleLines(row)) {
    const note = line.text.match(FOOTNOTE_RE);
    if (note && groups.length) notes.push({ mark: note[1], line });
    else if (!groups.length || opensNewWord(line.text, root)) groups.push([line]);
    else groups[groups.length - 1].push(line);
  }
  for (const { mark, line } of notes) {
    const citing = groups.find((g) => g.some((l) => l.text.includes(mark))) ?? groups[groups.length - 1];
    citing.push(line);
  }
  return groups.map((lines, i) => groupEntry(lines, i, row, provider));
}

/** One entry from consecutive lines of an article: its head read from the first, each line one sense. */
function groupEntry(lines: { text: string; spans: [number, number][] }[], i: number, row: RootArticleRow, provider: { id: string; name: string }): DictionaryEntry {
  const root = rootOf(row);
  const language = traitsOf(provider.id).language;
  const senses: DictionaryEntrySense[] = lines.map((l) => (l.spans.length ? { gloss: l.text, italics: l.spans } : { gloss: l.text }));
  const line = lines[0];
  const head = unitHead(provider.id, line.text, root, i);
  // The text the headword is: Lane's and Hans Wehr's whole Arabic opening, Al-Ṣiḥāḥ's first word.
  const raw = head?.head || (head?.word ? line.text.trimStart().split(/\s+/)[0] : '');
  // How much of the first sense is the headword, which an English dictionary's heading row draws instead.
  // An Arabic dictionary reads as running text: its entries keep their opening word in the text (see entryList).
  const headLength = raw && language === 'en' ? line.text.length - line.text.trimStart().length + raw.length : 0;
  const headword = raw.trim().replace(EDGE_PUNCT, '') || root;
  const formLine = hansWehrFormLine(line.text);
  // Hans Wehr's opening verb paragraph (form 0) is Form I's.
  const form = formLine ? formLine.forms[0] : head?.verbForm === 0 ? 1 : head?.verbForm;
  const verbForm = romanForm(form);
  return {
    providerId: provider.id,
    providerName: provider.name,
    headword,
    language,
    articleKey: String(row.id),
    ...(headLength ? { headLength } : {}),
    root,
    ...(verbForm ? { verbForm } : {}),
    senses,
  };
}

/** A continuation of the lead form before it: "و- السقاءَ ونحوه: خرزَه". */
const CONTINUATION_RE = /^\s*و\s*-/;

/**
 * Al-Wasīṭ's own meanings field separates senses with <br>, but one <br> block can still run several sub-senses
 * together, each introduced by "و-" (classical notation for "and also:") -- "تحَرّكَ. و- القلبُ: نَبَضَ. و- العِرْقُ: هاجَ..."
 * is three. Splitting on that marker too (kept, not stripped, to stay faithful to the source) gives short senses.
 */
export function wasitSenses(meanings: string): string[] {
  return meanings
    .split(/<br\s*\/?>/i)
    .flatMap((block) => block.split(/(?=\sو-\s)/))
    .map((s) => s.trim())
    .filter(Boolean);
}

function formEntries(row: RootArticleRow, provider: { id: string; name: string }): DictionaryEntry[] {
  const root = rootOf(row);
  const language = traitsOf(provider.id).language;
  const groups: string[][] = [];
  for (const gloss of wasitSenses(row.meanings)) {
    if (!groups.length || !CONTINUATION_RE.test(gloss)) groups.push([gloss]);
    else groups[groups.length - 1].push(gloss);
  }
  return groups.map((glosses) => ({
    providerId: provider.id,
    providerName: provider.name,
    headword: leadForm(glosses[0])?.trim() || root,
    language,
    articleKey: String(row.id),
    root,
    senses: glosses.map((gloss) => ({ gloss })),
  }));
}
