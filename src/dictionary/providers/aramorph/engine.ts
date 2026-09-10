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
const buck2uniPatterns = Object.entries(buck2uni).map(([key, value]) => ({
  pattern: new RegExp(key.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'g'),
  value,
}));

function detransliterate(word: string): string {
  if (!word) return word;
  let result = word;
  for (const p of buck2uniPatterns) result = result.replace(p.pattern, p.value);
  return result;
}
// Reverse of buck2uniPatterns -- built once at module load instead of a
// fresh `new RegExp` per key on every single `transliterate()` call (this
// runs on every `lookup()`, so it was recompiling ~40 regexes per word
// looked up, including every word in a book-vocabulary batch).
const uni2buckPatterns = Object.entries(buck2uni).map(([key, value]) => ({
  pattern: new RegExp(value.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'g'),
  value: key,
}));
function transliterate(word: string): string {
  if (!word) return word;
  let result = word;
  for (const p of uni2buckPatterns) result = result.replace(p.pattern, p.value);
  return result;
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
  word: string;
  morph: string;
  def: string;
  pos: string;
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
const LEMMA_MARKER_RE = /^;;\s*(\S+?)(?:-[uai])?_\d+\s*$/;

export function createDictTable(text: string): OptimizedDictArray<MorphEntry> {
  const lines = text.split('\n');
  const table = new OptimizedDictArray<MorphEntry>();
  let root = '---';
  let lemma = '---';
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
        word: elems[1].trim(),
        morph: (elems[2] || '').trim(),
        def: gloss.split(/;/).join(', '),
        pos: (posMatch?.[1] || '').trim(),
      };
      table.addItem(elems[0], def);
    } else if (line !== '' && line.trim() === ';') {
      root = '---';
      lemma = '---';
    } else if (line !== '' && line.slice(0, 5) === ';--- ') {
      root = line.split(/\s/)[1];
      lemma = '---';
    } else {
      const lemmaMatch = line.match(LEMMA_MARKER_RE);
      if (lemmaMatch) lemma = lemmaMatch[1];
    }
  }
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
}

const CACHE_SIZE = 500;
const CACHE_EXPIRY = 3600000;

export class AramorphEngine {
  private tables: AramorphTables | null = null;
  private lookupCache = new Map<string, { data: AramorphResult[]; timestamp: number }>();

  setTables(tables: AramorphTables): void {
    this.tables = tables;
    this.lookupCache.clear();
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
    const stemMatches = t.dictstems.get(stem);
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
            });
          }
        }
      }
    }
    return data;
  }

  lookup(word: string): AramorphResult[] {
    if (!this.tables) return [];
    const cached = this.lookupCache.get(word);
    if (cached) {
      if (Date.now() - cached.timestamp < CACHE_EXPIRY) return cached.data;
      this.lookupCache.delete(word);
    }

    const processedWord = removeDiacriticsBuckwalter(transliterate(word));
    let data: AramorphResult[] = [];
    for (let i = 0; i < processedWord.length; i++) {
      for (let j = i + 1; j <= processedWord.length; j++) {
        data = data.concat(this.lookupPrefStemSuff(processedWord.slice(0, i), processedWord.slice(i, j), processedWord.slice(j)));
      }
    }

    const seen = new Set<string>();
    data = data.filter((d) => {
      const k = d.word + '|' + d.def;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    if (this.lookupCache.size >= CACHE_SIZE) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [k, e] of this.lookupCache.entries()) {
        if (e.timestamp < oldestTime) {
          oldestTime = e.timestamp;
          oldestKey = k;
        }
      }
      if (oldestKey) this.lookupCache.delete(oldestKey);
    }
    this.lookupCache.set(word, { data, timestamp: Date.now() });
    return data;
  }
}
