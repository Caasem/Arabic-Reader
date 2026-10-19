import type { DeskItem } from '../studyDesk/types';
import { tagOf } from './roles';
import { useArg } from './store';

/** The card's heading: `#2 Grounds`, or `#6 Objection · reader's note`. Null when the item is not an argument item. */
export function useArgumentKind(item: DeskItem): string | null {
  const st = useArg();
  if (!item.argument || !st.book) return null;
  const n = st.nums.get(item.id);
  return `${n ? `#${n} ` : ''}${tagOf(item.argument)}`;
}
