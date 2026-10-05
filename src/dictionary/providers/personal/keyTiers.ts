import { normalize } from '../../../reader/tokenizer/arabicTokenizer';
import { weakLastRadicalVariants } from '../alwasit/lookupKeys';

interface AnalysisLike {
  root?: string;
  lemma?: string;
}

/** Lookup keys grouped best-first: the word itself, its dictionary forms, then its roots. */
export function keyTiers(word: string, analyses: AnalysisLike[]): string[][] {
  const seen = new Set<string>();
  const tier = (keys: string[]) => keys.filter((k) => k && !seen.has(k) && seen.add(k));
  const lemmas = analyses.flatMap((a) => (a.lemma ? [normalize(a.lemma)] : []));
  const roots = analyses.flatMap((a) => {
    if (!a.root || a.root === '---') return [];
    const root = normalize(a.root);
    return [root, ...weakLastRadicalVariants(root)];
  });
  return [tier([normalize(word)]), tier(lemmas), tier(roots)];
}
