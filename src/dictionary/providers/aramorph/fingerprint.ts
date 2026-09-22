/**
 * Identifies "this exact AraMorph dataset" so a cached parse can be reused:
 * each file's length plus an FNV-1a hash of its text. Shared by the worker
 * (for custom uploads) and vite.config.ts (the bundled dataset is fingerprinted
 * once at build time instead of on every app launch). Deliberately free of
 * DOM types so the Node-side Vite config can import it.
 */
export const DICT_FILE_ORDER = ['dictprefixes', 'dictstems', 'dictsuffixes', 'tableab', 'tableac', 'tablebc'] as const;

export type DictTexts = Record<(typeof DICT_FILE_ORDER)[number], string>;

function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function fingerprintDictTexts(texts: DictTexts): string {
  return DICT_FILE_ORDER.map((name) => `${name}:${texts[name].length}:${fnv1a(texts[name])}`).join('|');
}
