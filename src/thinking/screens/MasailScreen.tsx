import { useMemo, useState } from 'react';
import { findAnswer, reopenQuestion } from '../actions';
import { masail, oldestOpen, waited, type MasailFilter } from '../masail';
import { goToItem, type OpenBook } from '../nav';
import { isThread } from '../threads';
import { useThinkingData } from '../useThinkingData';
import { Frame, Tabs } from './Frame';
import { MasalaRow } from './MasalaRow';

const EMPTY: Record<MasailFilter, string> = {
  open: 'No open masāʾil. Ask one on a passage while you read.',
  answered: 'No answered masāʾil yet. Use Find the answer on an open one.',
  all: 'No masāʾil yet. Ask one on a passage while you read.',
};

/** Every masʾala: what is still open and for how long, and what answered the rest. */
export function MasailScreen({ onOpenBook }: { onOpenBook?: OpenBook }) {
  const data = useThinkingData();
  const [filter, setFilter] = useState<MasailFilter>('open');
  const open = useMemo(() => masail(data.items, data.byId, 'open'), [data.items, data.byId]);
  const answered = useMemo(() => masail(data.items, data.byId, 'answered'), [data.items, data.byId]);
  const rows = filter === 'open' ? open : filter === 'answered' ? answered : [...open, ...answered];
  const oldest = oldestOpen(data.items, data.byId);

  if (!data.loaded) return <div className="th-screen th-screen--loading" role="status">Loading…</div>;

  return (
    <Frame eyebrow="Masāʾil" title={open.length ? `${open.length} still open` : 'Nothing still open'}>
      {oldest && <p className="th-sub">The oldest has waited {waited(oldest.createdAt)}.</p>}
      <Tabs<MasailFilter>
        value={filter}
        onChange={setFilter}
        tabs={[
          { id: 'open', label: `Open · ${open.length}` },
          { id: 'answered', label: `Answered · ${answered.length}` },
          { id: 'all', label: `All · ${open.length + answered.length}` },
        ]}
      />
      {!rows.length && <p className="th-empty">{EMPTY[filter]}</p>}
      <div className="th-masail">
        {rows.map((q) => (
          <MasalaRow
            key={q.id}
            item={q}
            answer={q.answer ? data.byId.get(q.answer) : undefined}
            threads={data.desks.filter((d) => isThread(d) && q.threads?.includes(d.id))}
            onFind={(item) => void findAnswer(item, onOpenBook)}
            onReopen={(item) => void reopenQuestion(item)}
            onOpen={(item) => void goToItem(item, onOpenBook)}
          />
        ))}
      </div>
    </Frame>
  );
}
