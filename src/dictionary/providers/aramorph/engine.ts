/**
 * Buckwalter transliteration + prefix/stem/suffix morphological lookup.
 *
 * Ported line-for-line from this project's Chrome extension (main.js /
 * the standalone reader prototype's app.js) — same algorithm, same table
 * formats, just given TypeScript types and no `window` global. This is the
 * "real" dictionary engine: it needs the AraMorph data files (dictprefixes,
 * dictstems, dictsuffixes, tableab, tableac, tablebc) to actually return
 * anything; see `store.ts` for how those get uploaded and cached.
 */

import { classifyVerbForm } from '../../../verbForms/classifyForm';
import type { VerbFamilyMember } from '../../../types';

// ---------- Buckwalter transliteration ----------
const buck2uni: Record<string, string> = {
  "'": 'ء', '|': 'آ', '>': 'أ', '&': 'ؤ', '<': 'إ',
  '}': 'ئ', A: 'ا', b: 'ب', p: 'ة', t: 'ت',
  v: 'ث', j: 'ج', H: 'ح', x: 'خ', d: 'د',
  '*': 'ذ', r: 'ر', z: 'ز', s: 'س', $: 'ش',
  S: 'ص', D: 'ض', T: 'ط', Z: 'ظ', E: 'ع',
  g: 'غ', _: 'ـ', f: 'ف', q: 'ق', k: 'ك',
  l: 'ل', m: 'م', n: 'ن', h: 'ه', w: 'و',
  Y: 'ى', y: 'ي', F: 'ً', N: 'ٌ', K: 'ٍ',
  a: 'َ', u: 'ُ', i: 'ِ', '~': 'ّ', o: 'ْ',
  '`': 'ٰ', '{': 'ٱ',
};
const harakaat = ['a', 'u', 'i', 'F', 'N', 'K', '~', 'o'];
const diacriticsRegex = new RegExp(`[${harakaat.join('')}]`, 'g');

// Every mapping is one character to one character, so a single pass over the
// word is equivalent to (and much cheaper than) one global replace per letter.
const BUCK_TO_UNI = new Map(Object.entries(buck2uni));
const UNI_TO_BUCK = new Map(Object.entries(buck2uni).map(([buck, uni]) => [uni, buck]));

function mapChars(word: string, table: Map<string, string>): string {
  let out = '';
  for (const ch of word) out += table.get(ch) ?? ch;
  return out;
}

export function detransliterate(word: string): string {
  return word ? mapChars(word, BUCK_TO_UNI) : word;
}

export function transliterate(word: string): string {
  return word ? mapChars(word, UNI_TO_BUCK) : word;
}
function removeDiacriticsBuckwalter(word: string): string {
  return word.replace(diacriticsRegex, '');
}

// ---------- Optimized dict array ----------
export class OptimizedDictArray<T> {
  private map = new Map<string, T[]>();
  get(key: string): T[] {
    return this.map.get(key) || [];
  }
  addItem(key: string, value: T): void {
    if (!this.map.has(key)) this.map.set(key, []);
    this.map.get(key)!.push(value);
  }
  get size(): number {
    return this.map.size;
  }
  values(): IterableIterator<T[]> {
    return this.map.values();
  }
  /** Plain array-of-tuples, not the Map itself or a plain object keyed by
   * dictionary entries -- IndexedDB's structured clone can store a Map
   * directly, but relying on that across every WebView this app targets
   * (see the Android fetch-corruption history) is the kind of assumption
   * worth not making; a plain array serializes identically everywhere. A
   * plain *object* would work too but risks a real Arabic dictionary key
   * colliding with a JS prototype property name (`constructor`, etc). */
  toEntries(): [string, T[]][] {
    return Array.from(this.map.entries());
  }
  static fromEntries<T>(entries: [string, T[]][]): OptimizedDictArray<T> {
    const table = new OptimizedDictArray<T>();
    for (const [key, values] of entries) {
      for (const v of values) table.addItem(key, v);
    }
    return table;
  }
}

interface MorphEntry {
  root: string;
  lemma: string;
  /** Imperfect vowel(s) from the lemma marker (`-u` in `katab-u_1`, `-ui`: either); Form I only. */
  lemmaVowel?: string;
  word: string;
  morph: string;
  def: string;
  pos: string;
  /** A verbal noun the engine made up (see buildHiddenMasdars), never shown. */
  hidden?: boolean;
  /** The root with و and ي the other way round, where scholars or the data
   * differ (`;--- Asw/y`, or a weak verb's last letter); `root` leads. */
  altRoot?: string;
}

// ---------- Table parsers ----------
export function createMorphTableFromText(text: string): OptimizedDictArray<string> {
  const lines = text.split('\n');
  const table = new OptimizedDictArray<string>();
  for (const line of lines) {
    if (line !== '' && line[0] !== ';') {
      const elems = line.split(/\s/);
      table.addItem(elems[0], elems[1]);
    }
  }
  return table;
}

// Field 4 of a dict line is "<gloss> <pos>TAG</pos>" — but the closing tag is
// only ever followed by a space when another line's trailing whitespace runs
// on; at end-of-line (the common case) there's nothing after "</pos>". A
// split on " <pos>|</pos> " (note the required trailing space on the second
// alternative) therefore misses that closing tag at EOL and leaves it stuck
// onto the extracted pos string — e.g. "+hu/POSS_PRON_3MS</pos>" — which is
// exactly the "noise" that leaked into the dictionary popup. Matching the
// whole <pos>...</pos> span directly (regardless of what follows it) avoids
// that: the tag's contents becomes `pos`, and the tag itself is stripped out
// of `def` rather than partially retained.
const POS_TAG = /<pos>([\s\S]*?)<\/pos>/;

// A lemma marker (e.g. `;; katab-u_1`, `;; kAtab_1`) precedes every group of
// stem lines belonging to one specific lexeme -- the actual citation/
// dictionary form, distinct from the root marker (`;--- ktb`) that groups
// every *derived* lexeme sharing those root letters. `_<n>` is a sense
// index (dropped); a trailing `-u`/`-a`/`-i` (Form I only, its imperfect
// vowel isn't predictable from the pattern the way it is for Forms II-X) is
// dropped too, leaving the bare citation-form stem.
const LEMMA_MARKER_RE = /^;;\s*(\S+?)(?:-([uai]{1,2}))?_\d+\s*$/;

// A radical: any letter but a short vowel, long ا, ى or the other marks.
const R = '([^aiuoA~{`FNKY])';
// Verb citation forms whose radicals can be read straight off the letters:
// Forms I-X and the two quadriliteral forms. Weak verbs whose radicals change
// (قالَ, رَمَى) don't match, so they get no root rather than a wrong one.
const VERB_ROOT_PATTERNS = [
  `^${R}a${R}[aiu]${R}$`, // I     katab
  `^${R}a${R}~a${R}$`, // II    kat~ab
  `^${R}A${R}a${R}$`, // III   kAtab
  `^>a${R}o${R}a${R}$`, // IV    >akotab
  `^ta${R}a${R}~a${R}$`, // V     takat~ab
  `^ta${R}A${R}a${R}$`, // VI    takAtab
  `^\\{ino${R}a${R}a${R}$`, // VII   {inokatab
  `^\\{i${R}o[tTd]a${R}a${R}$`, // VIII  {ikotatab
  `^\\{isota${R}o${R}a${R}$`, // X     {isotakotab
  `^${R}a${R}o${R}a${R}$`, // QI    tarojam
  `^ta${R}a${R}o${R}a${R}$`, // QII   tatarojam
].map((p) => new RegExp(p));
// madd: the data's headers write doubled roots with two letters (md).
const DOUBLED_FORM_I = new RegExp(`^${R}a${R}~$`);

/** The root of a verb's citation form (Buckwalter), written the way the data's
 * own root headers write roots (hamza as A, doubled roots with two letters);
 * null when the pattern is unclear. */
export function rootFromVerbLemma(lemma: string): string | null {
  const radicals = [DOUBLED_FORM_I, ...VERB_ROOT_PATTERNS].map((re) => lemma.match(re)).find(Boolean)?.slice(1);
  return radicals ? hamzaAsA(radicals.join('')) : null;
}

// The same verb forms with a weak last radical, written ى or ا in the citation
// form (banaY, badA): only the first two radicals can be read off the letters.
const W = '(?:aY|A)';
const WEAK_LAST_PATTERNS = [
  `^${R}a${R}${W}$`, // I     banaY, badA
  `^${R}a${R}~${W}$`, // II    Dar~aY
  `^${R}A${R}${W}$`, // III   lAqaY
  `^>a${R}o${R}${W}$`, // IV    >abodaY
  `^ta${R}a${R}~${W}$`, // V     talaq~aY
  `^ta${R}A${R}${W}$`, // VI    tanAdaY
  `^\\{ino${R}a${R}${W}$`, // VII   {inotahaY
  `^\\{i${R}o[tTd]a${R}${W}$`, // VIII  {iqotaDaY
  `^\\{isota${R}o${R}${W}$`, // X     {isotadoEaY
].map((p) => new RegExp(p));

const hamzaAsA = (radicals: string) => radicals.replace(/[>&<}|']/g, 'A');

/**
 * A verb with a weak last radical: its first two radicals, and the last one as
 * the citation form suggests (ى usually ي, ا usually و). Only a Form I verb
 * shows the real letter (see weakLetterOf): derived forms turn it into ي
 * whatever it was (أَبْدَى, يُبْدِي from بدو).
 */
export function weakVerbRadicals(lemma: string): { first: string; guess: 'w' | 'y'; formI: boolean } | null {
  for (const [i, re] of WEAK_LAST_PATTERNS.entries()) {
    const m = lemma.match(re);
    if (m) return { first: hamzaAsA(m[1] + m[2]), guess: lemma.endsWith('Y') ? 'y' : 'w', formI: i === 0 };
  }
  return null;
}

/** Which weak letter a Form I stem shows: banay-/yaboniy -> y, daEaw-/yadoEuw -> w. */
export function weakLetterOf(stem: string): 'w' | 'y' | null {
  if (/(?:ay|iy)$/.test(stem)) return 'y';
  if (/(?:aw|uw)$/.test(stem)) return 'w';
  return null;
}

/**
 * A root header, which may give two spellings where the data notes a dispute:
 * `Asw/y` (asw or asy), `nw/yf` (nwf or nyf), `$fh/w`, `Dwr/Dyr`. The first
 * spelling is listed first; a bare header (`ktb`) has no alternative.
 */
export function parseRootHeader(token: string): { root: string; altRoot?: string } {
  const slash = token.indexOf('/');
  if (slash < 0) return { root: token };
  const left = token.slice(0, slash);
  const right = token.slice(slash + 1);
  if (left.length >= 3 && right.length >= 3) return { root: left, altRoot: right };
  return { root: left + right.slice(1), altRoot: left.slice(0, -1) + right };
}

export function createDictTable(text: string): OptimizedDictArray<MorphEntry> {
  const lines = text.split('\n');
  const table = new OptimizedDictArray<MorphEntry>();
  let root = '---';
  let altRoot: string | undefined;
  let lemma = '---';
  let lemmaVowel: string | undefined;
  // About 13,600 stems sit in groups with no `;--- root` header: lone `;`
  // lines split some roots' blocks, and some roots never got a header. When
  // such a group has a verb, its root comes from the verb (rootFromVerbLemma)
  // and goes to every stem in the group.
  //
  // Where و and ي are in doubt -- a weak verb's last radical (بَنَى), or a
  // header that gives both (`nfw/y`) -- the root leads with the letter a Form I
  // verb in the group shows: its stems (بَنَيْتُ, يَبْنِي) and its marked
  // present-tense vowel (badA-u: يَبْدُو). Failing that, a rootless weak verb
  // takes the spelling the data files a root under elsewhere, then the
  // citation form's hint. The other letter is kept as altRoot and searched too.
  const headerRoots = new Set<string>();
  for (const m of text.matchAll(/^;--- (\S+)/gm)) {
    const h = parseRootHeader(m[1]);
    headerRoots.add(h.root);
    if (h.altRoot) headerRoots.add(h.altRoot);
  }
  let group: MorphEntry[] = [];
  let inferredRoot: string | null = null;
  let weak: { first: string; guess: 'w' | 'y'; formI: boolean } | null = null;
  // Votes per Form I weak verb; a verb follows its own, everything else the group's.
  const lemmaVotes = new Map<string, { w: number; y: number }>();
  const leading = (v: { w: number; y: number } | undefined) => (!v ? null : v.y > v.w ? 'y' : v.w > v.y ? 'w' : null);
  const endGroup = () => {
    const total = { w: 0, y: 0 };
    for (const v of lemmaVotes.values()) {
      total.w += v.w;
      total.y += v.y;
    }
    const shown = leading(total);
    let alt: string | undefined;
    if (!inferredRoot && weak) {
      const other = weak.guess === 'y' ? 'w' : 'y';
      const filed = headerRoots.has(weak.first + weak.guess) ? weak.guess : headerRoots.has(weak.first + other) ? other : null;
      const last = shown ?? filed ?? weak.guess;
      inferredRoot = weak.first + last;
      alt = weak.first + (last === 'y' ? 'w' : 'y');
    }
    for (const e of group) {
      if (e.root === '---') {
        if (!inferredRoot) continue;
        e.root = inferredRoot;
        if (alt) e.altRoot = alt;
      } else if (e.altRoot) {
        // A disputed header (`nfw/y`): lead with the spelling the verb shows --
        // نَفَى (يَنْفِي) under nfy, نَفا (يَنْفُو) under nfw.
        const letter = leading(lemmaVotes.get(e.lemma)) ?? shown;
        const i = Array.from(e.root).findIndex((c, k) => c !== e.altRoot![k]);
        if (letter && e.altRoot[i] === letter && e.root[i] !== letter) [e.root, e.altRoot] = [e.altRoot, e.root];
      }
    }
    group = [];
    inferredRoot = null;
    weak = null;
    lemmaVotes.clear();
  };
  for (const line of lines) {
    if (line !== '' && line[0] !== ';') {
      const elems = line.split(/\s/);
      if (elems[1] === undefined) continue;
      const meta = elems.slice(3).join(' ');
      const posMatch = meta.match(POS_TAG);
      const gloss = meta.replace(POS_TAG, '').trim();
      const def: MorphEntry = {
        root,
        lemma,
        lemmaVowel,
        word: elems[1].trim(),
        morph: (elems[2] || '').trim(),
        def: gloss.split(/;/).join(', '),
        pos: (posMatch?.[1] || '').trim(),
        ...(altRoot ? { altRoot } : {}),
      };
      table.addItem(elems[0], def);
      group.push(def);
      const isVerb = /^(PV|IV)/.test(def.morph);
      const weakVerb = isVerb && lemma !== '---' ? weakVerbRadicals(lemma) : null;
      if (weakVerb?.formI) {
        let v = lemmaVotes.get(lemma);
        if (!v) {
          v = { w: lemmaVowel === 'u' ? 1 : 0, y: lemmaVowel === 'i' ? 1 : 0 };
          lemmaVotes.set(lemma, v);
        }
        const letter = weakLetterOf(def.word);
        if (letter) v[letter]++;
      }
      if (root === '---' && !inferredRoot && def.morph.startsWith('PV') && lemma !== '---') {
        inferredRoot = rootFromVerbLemma(lemma);
        // A Form I weak verb replaces a derived one: only it shows the letter.
        if (!inferredRoot && weakVerb && (!weak || (weakVerb.formI && !weak.formI))) weak = weakVerb;
      }
    } else if (line !== '' && line.trim() === ';') {
      endGroup();
      root = '---';
      altRoot = undefined;
      lemma = '---';
      lemmaVowel = undefined;
    } else if (line !== '' && line.slice(0, 5) === ';--- ') {
      endGroup();
      ({ root, altRoot } = parseRootHeader(line.split(/\s/)[1]));
      lemma = '---';
      lemmaVowel = undefined;
    } else {
      const lemmaMatch = line.match(LEMMA_MARKER_RE);
      if (lemmaMatch) {
        lemma = lemmaMatch[1];
        lemmaVowel = lemmaMatch[2];
      }
    }
  }
  endGroup();
  return table;
}

export interface AramorphTables {
  dictstems: OptimizedDictArray<MorphEntry>;
  dictprefs: OptimizedDictArray<MorphEntry>;
  dictsuffs: OptimizedDictArray<MorphEntry>;
  tableab: OptimizedDictArray<string>;
  tablebc: OptimizedDictArray<string>;
  tableac: OptimizedDictArray<string>;
}

/** Plain-data mirror of `AramorphTables`, safe to hand to IndexedDB (see
 * store.ts's parsed-table cache) or `postMessage` -- an `OptimizedDictArray`
 * itself is a class instance wrapping a Map, not something either of those
 * can round-trip reliably on their own. */
export interface SerializedAramorphTables {
  dictstems: [string, MorphEntry[]][];
  dictprefs: [string, MorphEntry[]][];
  dictsuffs: [string, MorphEntry[]][];
  tableab: [string, string[]][];
  tablebc: [string, string[]][];
  tableac: [string, string[]][];
}

export function serializeTables(tables: AramorphTables): SerializedAramorphTables {
  return {
    dictstems: tables.dictstems.toEntries(),
    dictprefs: tables.dictprefs.toEntries(),
    dictsuffs: tables.dictsuffs.toEntries(),
    tableab: tables.tableab.toEntries(),
    tablebc: tables.tablebc.toEntries(),
    tableac: tables.tableac.toEntries(),
  };
}

export function deserializeTables(data: SerializedAramorphTables): AramorphTables {
  return {
    dictstems: OptimizedDictArray.fromEntries(data.dictstems),
    dictprefs: OptimizedDictArray.fromEntries(data.dictprefs),
    dictsuffs: OptimizedDictArray.fromEntries(data.dictsuffs),
    tableab: OptimizedDictArray.fromEntries(data.tableab),
    tablebc: OptimizedDictArray.fromEntries(data.tablebc),
    tableac: OptimizedDictArray.fromEntries(data.tableac),
  };
}

function verbFormOf(stem: { lemma: string; lemmaVowel?: string; morph: string }): { verbForm?: string; imperfectVowel?: string } {
  if (stem.lemma === '---' || !VERB_STEM_RE.test(stem.morph)) return {};
  const verbForm = classifyVerbForm(stem.lemma);
  if (!verbForm) return {};
  return { verbForm, imperfectVowel: verbForm === 'I' ? stem.lemmaVowel : undefined };
}

export interface AramorphResult {
  root: string;
  /** The stem's own citation/dictionary form (e.g. كاتَبَ for a matched
   * كاتَبْتُهُ) -- distinct from `root`, which is just the bare consonant
   * skeleton (كتب) shared by every word derived from it. '---' when the
   * matched stem had no lemma marker in the source data. */
  lemma: string;
  word: string;
  def: string;
  pos: string;
  morph: string;
  /** Verb form I-X of the matched stem's lexeme (see src/verbForms); verbs only. */
  verbForm?: string;
  /** Form I only: the imperfect vowel(s) the dictionary marks (`u`, `a`, `i`). */
  imperfectVowel?: string;
  /** Matched a made-up verbal noun: use it for the root, don't show it. Its
   * `lemma` and `def` are the verb's. */
  hidden?: boolean;
  /** Another spelling of `root` (و and ي swapped) where scholars or the data differ; `root` leads. */
  altRoot?: string;
}

// Form V تَفَعَّلَ and Form VI تَفاعَلَ verbs, whose verbal nouns are تَفَعُّل and
// تَفاعُل. The last letter must be a plain consonant: weak or hamzated endings
// change the noun's spelling.
const LAST = "[^aiuoFNK~AY`{wy'>&<}|]";
const ANY = "[^aiuoFNK~AY`{]";
const FORM_V_RE = new RegExp(`^ta(${ANY})a(${ANY})~a(${LAST})$`);
const FORM_VI_RE = new RegExp(`^ta(${ANY})A(${ANY})a(${LAST})$`);

/**
 * AraMorph lists many Form V/VI verbs without their verbal noun (تَحاسَدَ but
 * no تَحاسُد), so "the" + that noun matches nothing and the root dictionaries
 * get no root. Make each missing noun as a hidden stem: it lets the word
 * resolve to its root, but it's never shown, in case the made-up noun is wrong.
 */
export function buildHiddenMasdars(dictstems: OptimizedDictArray<MorphEntry>): OptimizedDictArray<MorphEntry> {
  const nouns = new Set<string>();
  for (const group of dictstems.values()) {
    for (const e of group) if (e.morph.startsWith('N')) nouns.add(removeDiacriticsBuckwalter(e.word) + '|' + e.root);
  }
  const hidden = new OptimizedDictArray<MorphEntry>();
  const made = new Set<string>();
  for (const group of dictstems.values()) {
    for (const e of group) {
      if (e.morph !== 'PV' || e.root === '---' || e.lemma === '---') continue;
      const m = e.lemma.match(FORM_V_RE) ?? e.lemma.match(FORM_VI_RE);
      if (!m) continue;
      const word = FORM_V_RE.test(e.lemma) ? `ta${m[1]}a${m[2]}~u${m[3]}` : `ta${m[1]}A${m[2]}u${m[3]}`;
      const key = removeDiacriticsBuckwalter(word);
      if (nouns.has(key + '|' + e.root) || made.has(key + '|' + e.lemma)) continue;
      made.add(key + '|' + e.lemma);
      hidden.addItem(key, { root: e.root, lemma: e.lemma, word, morph: 'N', def: e.def, pos: '', hidden: true, ...(e.altRoot ? { altRoot: e.altRoot } : {}) });
    }
  }
  return hidden;
}

const VERB_STEM_RE = /^(PV|IV|CV)/;

const CACHE_SIZE = 500;
const CACHE_EXPIRY = 3600000;

export class AramorphEngine {
  private tables: AramorphTables | null = null;
  /** Kept apart from `tables` so the cached parse never stores them. */
  private hiddenStems = new OptimizedDictArray<MorphEntry>();
  private lookupCache = new Map<string, { data: AramorphResult[]; timestamp: number }>();

  setTables(tables: AramorphTables): void {
    this.tables = tables;
    this.hiddenStems = buildHiddenMasdars(tables.dictstems);
    this.lookupCache.clear();
    this.familyIndex = null;
  }

  /** Root (Buckwalter) -> the dictionary's verbs for it, built on first use. */
  private familyIndex: Map<string, VerbFamilyMember[]> | null = null;

  /**
   * Every verb the dictionary lists for a root, in dictionary order, one per
   * lexeme and sense (the first perfect stem of each `;; lemma` group).
   */
  verbFamily(root: string): VerbFamilyMember[] {
    if (!this.tables) return [];
    if (!this.familyIndex) {
      const index = new Map<string, VerbFamilyMember[]>();
      const seen = new Set<string>();
      for (const group of this.tables.dictstems.values()) {
        for (const e of group) {
          if (e.morph !== 'PV' || e.root === '---' || e.lemma === '---') continue;
          const key = e.root + '|' + e.lemma + '|' + e.def;
          if (seen.has(key)) continue;
          seen.add(key);
          const form = classifyVerbForm(e.lemma);
          const member: VerbFamilyMember = {
            lemma: detransliterate(e.lemma),
            form,
            imperfectVowel: form === 'I' ? e.lemmaVowel : undefined,
            gloss: e.def,
          };
          const list = index.get(e.root);
          if (list) list.push(member);
          else index.set(e.root, [member]);
        }
      }
      this.familyIndex = index;
    }
    return this.familyIndex.get(root) ?? [];
  }

  get isReady(): boolean {
    return !!this.tables;
  }

  /** Word counts per table -- purely for on-device diagnostics (see the
   * Settings "Test dictionary lookup" button): distinguishes "no tables
   * loaded at all" from "tables loaded but empty/corrupted", which look
   * identical from `isReady` alone. */
  get tableSizes(): Record<keyof AramorphTables, number> | null {
    if (!this.tables) return null;
    return {
      dictstems: this.tables.dictstems.size,
      dictprefs: this.tables.dictprefs.size,
      dictsuffs: this.tables.dictsuffs.size,
      tableab: this.tables.tableab.size,
      tablebc: this.tables.tablebc.size,
      tableac: this.tables.tableac.size,
    };
  }

  private isObeysGrammar(prefMorph: string, stemMorph: string, suffMorph: string): boolean {
    const t = this.tables!;
    return (
      t.tableab.get(prefMorph).indexOf(stemMorph) !== -1 &&
      t.tablebc.get(stemMorph).indexOf(suffMorph) !== -1 &&
      t.tableac.get(prefMorph).indexOf(suffMorph) !== -1
    );
  }

  private lookupPrefStemSuff(pref: string, stem: string, suff: string): AramorphResult[] {
    const t = this.tables!;
    const prefMatches = t.dictprefs.get(pref);
    const stemMatches = [...t.dictstems.get(stem), ...this.hiddenStems.get(stem)];
    const suffMatches = t.dictsuffs.get(suff);
    const data: AramorphResult[] = [];
    const bracketify = (word: string, space: number): string => {
      if (word && word[0] !== '[') {
        if (space === 1) return ' [' + word + ']';
        if (space === 2) return '[' + word + '] ';
        return '[' + word + ']';
      }
      return '';
    };
    for (const p of prefMatches) {
      for (const s of stemMatches) {
        for (const su of suffMatches) {
          if (this.isObeysGrammar(p.morph, s.morph, su.morph)) {
            data.push({
              root: detransliterate(s.root),
              lemma: detransliterate(s.lemma),
              word: [detransliterate(p.word), detransliterate(s.word), detransliterate(su.word)].join(''),
              def: [bracketify(p.def, 2), s.def, bracketify(su.def, 1)].join(''),
              pos: [p.pos, s.pos, su.pos].filter(Boolean).join(', '),
              morph: [p.morph, s.morph, su.morph].join(', '),
              ...verbFormOf(s),
              ...(s.hidden ? { hidden: true } : {}),
              ...(s.altRoot ? { altRoot: detransliterate(s.altRoot) } : {}),
            });
          }
        }
      }
    }
    return data;
  }

  /** Every prefix/stem/suffix split of a diacritic-free Buckwalter word. */
  private allSplits(processedWord: string): AramorphResult[] {
    const candidates: AramorphResult[] = [];
    for (let i = 0; i < processedWord.length; i++) {
      for (let j = i + 1; j <= processedWord.length; j++) {
        for (const r of this.lookupPrefStemSuff(processedWord.slice(0, i), processedWord.slice(i, j), processedWord.slice(j))) {
          candidates.push(r);
        }
      }
    }
    return candidates;
  }

  lookup(word: string): AramorphResult[] {
    if (!this.tables) return [];
    const cached = this.lookupCache.get(word);
    if (cached) {
      this.lookupCache.delete(word);
      if (Date.now() - cached.timestamp < CACHE_EXPIRY) {
        this.lookupCache.set(word, cached); // re-insert: Map order doubles as LRU order
        return cached.data;
      }
    }

    const processedWord = removeDiacriticsBuckwalter(transliterate(word));
    let candidates = this.allSplits(processedWord);
    // AraMorph lists some verbs without their verbal noun (e.g. تَحاسَدَ but no
    // تَحاسُد), so "the" + that noun matches nothing it shows. Retry without the
    // article (and any و/ف/ب/ك/ل before it) to at least show the verb.
    if (!candidates.some((c) => !c.hidden)) {
      const bare = processedWord.replace(/^[wf]?[bkl]?Al(?=.{2})/, '');
      if (bare !== processedWord) candidates = candidates.concat(this.allSplits(bare));
    }

    const seen = new Set<string>();
    const data = candidates.filter((d) => {
      const k = d.word + '|' + d.def;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    if (this.lookupCache.size >= CACHE_SIZE) this.lookupCache.delete(this.lookupCache.keys().next().value!);
    this.lookupCache.set(word, { data, timestamp: Date.now() });
    return data;
  }
}
