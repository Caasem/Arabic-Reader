import type { DictionaryEntry, DictionaryProvider } from '../../../types';
import { normalize } from '../../../reader/tokenizer/arabicTokenizer';
import { aramorphProvider } from '../aramorph/AramorphDictionaryProvider';

interface AlWasitRow {
  id: number;
  /** Raw headword field -- may list more than one homograph separated by
   * `|` (e.g. "همز|همزة"), each a valid lookup key for the same entry. */
  word: string;
  /** `<br>`-separated sub-entries (distinct derived forms/senses sharing
   * this root), plain Arabic text otherwise -- no other markup appears in
   * the source data (verified against the full table before writing this). */
  meanings: string;
}

interface AlWasitData {
  byKey: Map<string, AlWasitRow[]>;
}

/**
 * Optional second Arabic-Arabic dictionary: Al-Muʿjam al-Wasīṭ, sourced from
 * the arabic_lexicons project (see public/alwasit-data/SOURCE-README.md for
 * provenance/licensing notes -- unlike this app's other sources, its status
 * isn't clean-cut public domain, which is why this provider defaults to off
 * and is only ever loaded on demand).
 *
 * Al-Wasit is keyed by root, not surface form (same as the classical
 * dictionaries it draws structure from), so unlike the mock providers this
 * one can't just normalize-and-match the tapped word directly -- it reuses
 * AraMorph's own morphological analysis (already registered as the app's
 * MorphologyProvider) to resolve the surface form to its root/lemma first,
 * then looks *that* up. See the root/lemma extraction work this data source
 * was proposed alongside for why AraMorph can supply this for free.
 */
export class AlWasitDictionaryProvider implements DictionaryProvider {
  id = 'alwasit';
  name = 'Al-Muʿjam al-Wasīṭ (Arabic-Arabic)';

  private dataPromise: Promise<AlWasitData> | null = null;

  /** Parses the ~7.8MB dataset only once, and only the first time this
   * provider is actually used -- see the dynamic import below and its
   * vite.config.ts counterpart for why this must not happen at module load. */
  private async getData(): Promise<AlWasitData> {
    if (!this.dataPromise) {
      this.dataPromise = import('virtual:alwasit-data').then((mod) => parseAlWasitTsv(mod.default));
    }
    return this.dataPromise;
  }

  async lookup(word: string): Promise<DictionaryEntry[]> {
    const { byKey } = await this.getData();

    const keys = new Set<string>([normalize(word)]);
    try {
      const analyses = await aramorphProvider.analyze(word);
      for (const a of analyses) {
        if (a.root) keys.add(normalize(a.root));
        if (a.lemma) keys.add(normalize(a.lemma));
      }
    } catch {
      // AraMorph unavailable -- fall back to matching the raw surface form only.
    }

    const matched = new Map<number, AlWasitRow>();
    for (const key of keys) {
      for (const row of byKey.get(key) ?? []) matched.set(row.id, row);
    }

    return Array.from(matched.values()).map((row) => {
      const headword = row.word.split('|')[0].trim();
      return {
        providerId: this.id,
        providerName: this.name,
        headword,
        root: headword,
        senses: row.meanings
          .split(/<br\s*\/?>/i)
          .map((s) => s.trim())
          .filter(Boolean)
          .map((gloss) => ({ gloss })),
      };
    });
  }
}

function parseAlWasitTsv(raw: string): AlWasitData {
  const byKey = new Map<string, AlWasitRow[]>();
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const tab = line.indexOf('\t');
    if (tab === -1) continue;
    const row: AlWasitRow = { id: i, word: line.slice(0, tab), meanings: line.slice(tab + 1) };
    for (const part of row.word.split('|')) {
      const key = normalize(part.trim());
      if (!key) continue;
      const list = byKey.get(key);
      if (list) list.push(row);
      else byKey.set(key, [row]);
    }
  }
  return { byKey };
}

export const alWasitProvider = new AlWasitDictionaryProvider();
