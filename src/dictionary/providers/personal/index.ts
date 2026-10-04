import { foldAlefHamza, normalize } from '../../../reader/tokenizer/arabicTokenizer';
import type { PersonalRow } from './parse';

export interface PersonalIndex {
  byKey: Map<string, PersonalRow[]>;
  byFoldedKey: Map<string, PersonalRow[]>;
}

export function buildPersonalIndex(rows: PersonalRow[]): PersonalIndex {
  const byKey = new Map<string, PersonalRow[]>();
  const byFoldedKey = new Map<string, PersonalRow[]>();
  const add = (map: Map<string, PersonalRow[]>, key: string, row: PersonalRow) => {
    const list = map.get(key);
    if (!list) map.set(key, [row]);
    else if (!list.includes(row)) list.push(row);
  };
  for (const row of rows) {
    const key = normalize(row[0]).trim();
    if (!key) continue;
    add(byKey, key, row);
    add(byFoldedKey, foldAlefHamza(key), row);
  }
  return { byKey, byFoldedKey };
}
