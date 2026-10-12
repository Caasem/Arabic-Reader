import type { DictionaryEntry, DictionaryEntrySense } from '../../../types';
import { hansWehrFormLine } from '../../senseFormat/hansWehrForms';
import { splitItalics } from '../../senseFormat/laneItalics';
import { leadForm, unitHead } from '../../subEntries/heads';
import { traitsOf } from '../../providerTraits';
import { rowToEntry, type RootArticleRow } from './rootArticleData';

/**
 * The adapter from a root article (one TSV row: a root and its `<br>`-separated lines) to the shared entry shape
 * (see DictionaryEntry). How an article is cut is the dictionary's declared `articles` trait:
 *
 * - `lines` (Lane, Hans Wehr, Al-Ṣiḥāḥ): one entry per line. Its headword is the word the line opens with
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

function lineEntries(row: RootArticleRow, provider: { id: string; name: string }): DictionaryEntry[] {
  const root = rootOf(row);
  const language = traitsOf(provider.id).language;
  const lines = row.meanings
    .split(/<br\s*\/?>/i)
    .map(splitItalics)
    .filter((s) => s.text);
  return lines.map((line, i) => {
    const head = unitHead(provider.id, line.text, root, i);
    // The text the headword is: Lane's and Hans Wehr's whole Arabic opening, Al-Ṣiḥāḥ's first word.
    const raw = head?.head || (head?.word ? line.text.trimStart().split(/\s+/)[0] : '');
    const headLength = raw ? line.text.length - line.text.trimStart().length + raw.length : 0;
    const headword = raw.trim().replace(EDGE_PUNCT, '') || root;
    const formLine = hansWehrFormLine(line.text);
    // Hans Wehr's opening verb paragraph (form 0) is Form I's.
    const form = formLine ? formLine.forms[0] : head?.verbForm === 0 ? 1 : head?.verbForm;
    const verbForm = romanForm(form);
    const sense: DictionaryEntrySense = line.spans.length ? { gloss: line.text, italics: line.spans } : { gloss: line.text };
    return {
      providerId: provider.id,
      providerName: provider.name,
      headword,
      language,
      articleKey: String(row.id),
      ...(headLength ? { headLength } : {}),
      root,
      ...(verbForm ? { verbForm } : {}),
      senses: [sense],
    };
  });
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
