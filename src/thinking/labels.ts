import type { DeskItem } from '../studyDesk/types';
import { TYPE_LABEL, itemTitle } from '../studyDesk/useDesk';
import { isPassage, isThought, thoughtText } from './passages';

/** What a row says an item is. */
export function kindOf(item: DeskItem): string {
  if (item.type === 'question') return item.answer ? 'Masʾala · answered' : 'Masʾala · open';
  if (isThought(item)) return 'Thought';
  if (isPassage(item)) return 'Passage';
  return TYPE_LABEL[item.type];
}

/** The words a row shows for an item. */
export function wordsOf(item: DeskItem): string {
  return isThought(item) ? thoughtText(item) : itemTitle(item);
}
