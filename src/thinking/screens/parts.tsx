import type { ReactNode } from 'react';
import type { DeskItem } from '../../studyDesk/types';
import { kindOf, wordsOf } from '../labels';
import { ago, citeOf, isThought, short } from '../passages';

/** One item as a line in a screen's list: what it is, its words, where it is from, and actions. */
export function ItemLine({ item, lead, acts, sub, dim }: { item: DeskItem; lead?: ReactNode; acts?: ReactNode; sub?: ReactNode; dim?: boolean }) {
  const words = wordsOf(item);
  return (
    <div className={'th-line' + (dim ? ' th-line--dim' : '')}>
      {lead ?? <span className={'th-kind th-kind--' + (item.type === 'question' ? 'q' : isThought(item) ? 'note' : 'passage')}>{kindOf(item)}</span>}
      <div className="th-line__main">
        <p className={item.ar ? 'th-line__text th-ar' : 'th-line__text'} dir="auto">
          {short(words, 220)}
        </p>
        <p className="th-line__meta">
          {citeOf(item) && <bdi>{citeOf(item)}</bdi>}
          {citeOf(item) && ' · '}
          {ago(item.createdAt)}
          {sub}
        </p>
      </div>
      {acts && <div className="th-line__acts">{acts}</div>}
    </div>
  );
}
