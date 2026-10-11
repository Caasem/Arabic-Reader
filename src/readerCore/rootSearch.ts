import { aramorphProvider } from '../dictionary/providers/aramorph/AramorphDictionaryProvider';
import { normalize, tokenize } from '../reader/tokenizer/arabicTokenizer';
import type { BookModel } from './bookModel';
import { distinctForms, searchForms, type CleanHit } from './cleanSearch';

/** Per book: normalized word -> its dictionary roots. */
const rootsCache = new Map<string, Promise<Map<string, Set<string>>>>();

function rootsOfWords(key: string, model: BookModel): Promise<Map<string, Set<string>>> {
  let cached = rootsCache.get(key);
  if (!cached) {
    cached = (async () => {
      const words = distinctForms(model.texts);
      const analyses = await aramorphProvider.analyzeMany(words);
      const map = new Map<string, Set<string>>();
      for (const w of words) {
        const roots = new Set<string>();
        for (const a of analyses.get(w) ?? []) if (a.root) roots.add(a.root);
        if (roots.size) map.set(w, roots);
      }
      return map;
    })();
    rootsCache.set(key, cached);
    cached.catch(() => rootsCache.delete(key));
  }
  return cached;
}

/** Every word in the book sharing a dictionary root with the query's first word (like Alt+S "Same root"). */
export async function searchSameRoot(
  key: string,
  model: BookModel,
  query: string,
  chapters?: number[]
): Promise<{ hits: CleanHit[]; roots: string[] }> {
  const first = tokenize(query).find((t) => t.isArabic)?.text;
  if (!first) return { hits: [], roots: [] };
  const roots = new Set((await aramorphProvider.analyze(normalize(first))).map((a) => a.root).filter((r): r is string => !!r));
  if (!roots.size) return { hits: [], roots: [] };
  const rootsOf = await rootsOfWords(key, model);
  const forms = new Set<string>([normalize(first)]);
  for (const [word, wordRoots] of rootsOf) for (const r of wordRoots) if (roots.has(r)) forms.add(word);
  return { hits: searchForms(model.texts, forms, chapters), roots: Array.from(roots) };
}
