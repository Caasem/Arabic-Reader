declare module 'virtual:dictionary-data' {
  import type { DictFileName } from '../dictionary/providers/aramorph/dictFileNames';
  const data: Record<DictFileName, string>;
  export default data;
  /** Build-time fingerprint of `data` (see aramorph/fingerprint.ts). */
  export const fingerprint: string;
}

declare module 'virtual:vocab-list-data' {
  const tsv: string;
  export default tsv;
}

declare module 'virtual:alwasit-data' {
  const tsv: string;
  export default tsv;
}

/** package.json's `version`, baked in at build time (see the `define` in
 * vite.config.ts) so the running app can show which build it is. */
declare const __APP_VERSION__: string;
