declare module 'virtual:dictionary-data' {
  import type { DictFileName } from '../dictionary/providers/aramorph/dictFileNames';
  const data: Record<DictFileName, string>;
  export default data;
}

declare module 'virtual:vocab-list-data' {
  const tsv: string;
  export default tsv;
}
