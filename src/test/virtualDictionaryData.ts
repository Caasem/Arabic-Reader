import type { DictFileName } from '../dictionary/providers/aramorph/dictFileNames';

/** Unit-test stand-in for `virtual:dictionary-data` (see vitest.config.ts). */
const data: Record<DictFileName, string> = {
  dictprefixes: '',
  dictstems: '',
  dictsuffixes: '',
  tableab: '',
  tableac: '',
  tablebc: '',
};
export default data;
export const fingerprint = 'test';
