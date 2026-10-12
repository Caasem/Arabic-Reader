import { stripItalics } from '../senseFormat/laneItalics';
import { hansWehrFormLine } from '../senseFormat/hansWehrForms';
import { articleVariants, containsRoot, subEntryKey } from './keys';

/** What a dictionary sub-entry (one line of a root article) is about: the word(s) it opens with. */
export interface SubEntryHead {
  /** The opening text to colour, exactly as written at the start of the line (empty when only `keys` apply). */
  head: string;
  /** The headword's keys (see subEntryKey): as written and without the article. */
  keys: string[];
  /** The headword as written, vowels and all (Lane, Al-Wasīṭ, Al-Ṣiḥāḥ): tells homographs apart (see vowelsAgree). */
  word?: string;
  /** Weaker keys, used only when nothing matches `keys`: a verb without its object pronoun (Lane's حَسَدَهُ). */
  looseKeys: string[];
  /**
   * A verb sub-entry: the verb form it is about (1-15, Lane's numbers), or 0 when it covers every form of
   * the root (Hans Wehr's opening verb paragraph). A Hans Wehr derived-form line ("VI to envy each other") has
   * its form here (the first, for "V and XII").
   */
  verbForm?: number;
  /** A pointer to another place ("look up alphabetically") -- highlighted, but not where the word is filed. */
  crossRef?: boolean;
}

/** Dictionaries whose lines open with a headword this module can read. */
const HEADED = new Set(['alwasit', 'alsihah', 'almaqayis', 'lane', 'hanswehr']);
export const hasSubEntryHeads = (providerId: string): boolean => HEADED.has(providerId);
/** Dictionaries whose lines are sub-entries worth indexing -- Maqāyīs articles are essays opening with the root only. */
const INDEXED = new Set(['alwasit', 'alsihah', 'lane', 'hanswehr']);
export const hasSubEntryIndex = (providerId: string): boolean => INDEXED.has(providerId);

const ARABIC_WORD_RE = /^[؀-ۿ]*[ء-ي][؀-ۿ]*$/;
/** Punctuation that can cling to either end of a word in the running text. */
const EDGE_PUNCT_RE = /^[↓([«]+|[،,.:;؛)\]»]+$/g;

/** The words a line opens with, up to the first one that is not Arabic, and that run's raw length. */
function leadingRun(text: string): { words: string[]; end: number } {
  const words: string[] = [];
  const re = /\S+/g;
  let end = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const word = m[0].replace(EDGE_PUNCT_RE, '');
    if (!ARABIC_WORD_RE.test(word)) break;
    words.push(word);
    end = m.index + m[0].length;
    // A word ending in punctuation ends the headword (أَفِقٌ : see ...).
    if (word !== m[0] && /[،,.:;؛]$/.test(m[0])) break;
  }
  return { words, end };
}

/** Of a multi-word run, the word the line is filed for: the first holding the root's letters (else the first). */
function pickHeadword(words: string[], root?: string): string | undefined {
  if (words.length <= 1 || !root) return words[0];
  return words.find((w) => containsRoot(subEntryKey(w), root)) ?? words[0];
}

const OBJECT_SUFFIXES = ['هما', 'هم', 'هن', 'ها', 'ه'];
function withoutObject(key: string): string[] {
  for (const s of OBJECT_SUFFIXES) if (key.endsWith(s) && key.length - s.length >= 3) return [key.slice(0, -s.length)];
  return [];
}

function keysOf(word: string | undefined): string[] {
  const key = word ? subEntryKey(word) : '';
  return key ? [...new Set(articleVariants(key))] : [];
}

/**
 * Lane: the vocalized headword opens the line, then English -- `حَسَدٌ Envy; …`. A number after it marks a
 * verb paragraph by form (`حَسَدَهُ عَلَى الشَّىْءِ 1 , (S, K,) aor. …`, `تَحَاسَدُوا 6 They envied …`).
 */
function laneHead(unit: string, root?: string): SubEntryHead | null {
  const { words, end } = leadingRun(unit);
  if (!words.length) return null;
  // Quadriliteral paragraphs ("Q. 1") are left without a form: AraMorph has no number for them.
  const form = /^\s*(\d{1,2})(?=[\s,.;:]|$)/.exec(unit.slice(end));
  const verbForm = form && +form[1] >= 1 && +form[1] <= 15 ? +form[1] : undefined;
  const word = pickHeadword(words, root);
  const keys = keysOf(word);
  return {
    head: unit.slice(0, end),
    keys,
    word,
    looseKeys: verbForm ? keys.flatMap(withoutObject) : [],
    ...(verbForm ? { verbForm } : {}),
  };
}

/** A Hans Wehr verb paragraph: the perfect, an optional (root), its transliteration ending in -a, then the imperfect vowel. */
const HW_VERB_RE = /^\s*(?:\([^)]*\)\s*)?[^\s()]*[aā]\s+[uai](?:\s|,|$)/;

/**
 * Hans Wehr: the unvocalized word, then its transliteration -- `حسود pl. حسد ḥusud envious`. The root's
 * opening paragraph (`كتب kataba u (katb …) to write … II to make write …`) holds every verb form.
 */
function hansWehrHead(unit: string, root?: string): SubEntryHead | null {
  const formLine = hansWehrFormLine(unit);
  if (formLine) return { head: '', keys: [], looseKeys: [], verbForm: formLine.forms[0] };
  const { words, end } = leadingRun(unit);
  if (!words.length) return null;
  const rest = unit.slice(end);
  return {
    head: unit.slice(0, end),
    keys: keysOf(pickHeadword(words, root)),
    looseKeys: [],
    ...(HW_VERB_RE.test(rest) ? { verbForm: 0 } : {}),
    ...(/^[^a-z]{0,40}look up alphabetically/.test(rest) ? { crossRef: true } : {}),
  };
}

/** Al-Wasīṭ and Maqāyīs open a sense with its citation form in parentheses: "(كَتَبَ) الكتابَ …", "(أَكْتَبَهُ): …". */
const LEAD_FORM_RE = /^\s*\(([^()]+)\)/;

/** The citation form a sense opens with, or null for a continuation sense ("و- السقاءَ: …"). */
export function leadForm(gloss: string): string | null {
  return LEAD_FORM_RE.exec(gloss)?.[1] ?? null;
}

function parenHead(unit: string): SubEntryHead | null {
  const lead = leadForm(unit);
  if (!lead) return null;
  const keys = keysOf(lead);
  return keys.length ? { head: '', keys, word: lead, looseKeys: keys.flatMap(withoutObject) } : null;
}

/**
 * Al-Ṣiḥāḥ has no parentheses: each line opens with its headword, usually after a conjunction --
 * "واسْتَوْفى حقّه وتَوَفَّاهُ بمعنًى", "والوَفاةُ: الموتُ". The spellings that first word can stand for: as written,
 * without the leading "و", and without the article "ال" (after the "و" too).
 */
export function openingKeys(gloss: string): string[] {
  const first = subEntryKey(gloss.trim().split(/\s+/)[0] ?? '');
  if (!first) return [];
  const withoutWaw = first.length > 2 && first.startsWith('و') ? first.slice(1) : first;
  const keys = new Set([first, withoutWaw]);
  for (const k of [first, withoutWaw]) if (k.length > 3 && k.startsWith('ال')) keys.add(k.slice(2));
  return [...keys];
}

function sihahHead(unit: string): SubEntryHead | null {
  const keys = openingKeys(unit);
  return keys.length ? { head: '', keys, word: unit.trim().split(/\s+/)[0], looseKeys: [] } : null;
}

/**
 * The headword a line of a root article opens with, read per dictionary; null when it opens with none
 * (a continuation, an editor's note). `root` (the article's) picks the headword out of a multi-word opening.
 */
export function unitHead(providerId: string, unit: string, root?: string, index = 0): SubEntryHead | null {
  switch (providerId) {
    case 'lane':
      return laneHead(stripItalics(unit), root);
    case 'hanswehr':
      return hansWehrHead(unit, root);
    case 'alsihah':
      return sihahHead(unit);
    case 'alwasit':
      return parenHead(unit);
    case 'almaqayis':
      return index === 0 ? parenHead(unit) : null;
    default:
      return null;
  }
}

/**
 * A line of a plain-list dictionary (Lane, Hans Wehr) split into its opening headword, which the popup
 * colours when the line matches, and the rest; null when there is no headword run to colour.
 */
export function matchedHead(providerId: string, gloss: string, root?: string): [string, string] | null {
  const head = unitHead(providerId, gloss, root)?.head;
  return head ? [head, gloss.slice(head.length)] : null;
}
