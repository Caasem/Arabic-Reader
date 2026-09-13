declare module 'virtual:dictionary-data' {
  import type { DictFileName } from '../dictionary/providers/aramorph/dictFileNames';
  const data: Record<DictFileName, string>;
  export default data;
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
 * vite.config.ts) so the running app can show which build a reader has --
 * see the Library notice that displays it. */
declare const __APP_VERSION__: string;
