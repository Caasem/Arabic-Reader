import { readString, writeString } from '../utils/storage';

/** The tab meaning every dictionary. */
export const ALL = 'all';

/** The dictionary tab last chosen (a plain provider id, or 'all'). The key string predates the registry and must not change. */
const TAB_KEY = 'dictionaryPage.lastTab';

export function readTab(): string {
  return readString(TAB_KEY) ?? ALL;
}

/** Not remembered this time if storage is unavailable. */
export function rememberTab(id: string): void {
  writeString(TAB_KEY, id);
}
