import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { IconBookmark, IconFocus, IconLevels, IconList, IconSearch, IconTimer, IconWords } from '../quietReader/icons';
import { refreshReaderTools, registerReaderTool, type ReaderKind } from './tools';

/**
 * The reading tools at the front of the dock, the same in every reader and in this order. Each reader says
 * which of them it has and what they do; the dock (Dock.tsx) draws whatever is registered, so the order
 * never differs between the reader and the PDF pages.
 */
export type ReadToolId = 'contents' | 'search' | 'marks' | 'words' | 'display' | 'levels' | 'timer' | 'focus';

interface ReadToolDef {
  id: ReadToolId;
  label: string;
  title: string;
  icon: ReactNode;
  keys?: string;
  ariaLabel?: string;
  cluster?: boolean;
  noRail?: boolean;
}

export const READ_TOOLS: readonly ReadToolDef[] = [
  { id: 'contents', label: 'Contents', title: 'Contents', icon: <IconList /> },
  { id: 'search', label: 'Search', title: 'Search this book, your library or the dictionary', icon: <IconSearch /> },
  { id: 'marks', label: 'Marks', title: 'Bookmarks and highlights', icon: <IconBookmark /> },
  { id: 'words', label: 'Words', title: 'Words saved from this book', icon: <IconWords /> },
  {
    id: 'display',
    label: 'Display',
    title: 'Font and display',
    cluster: true,
    icon: (
      <span className="qr-dock__aa" aria-hidden="true">
        Aa
      </span>
    ),
  },
  { id: 'levels', label: 'Levels', title: 'Vocab levels for this book', icon: <IconLevels />, cluster: true },
  { id: 'timer', label: 'Timer', title: 'Pomodoro', ariaLabel: 'Pomodoro timer', icon: <IconTimer /> },
  { id: 'focus', label: 'Focus', title: 'Focus: just the text (Esc to leave)', keys: 'F', icon: <IconFocus />, noRail: true },
];

export const readToolId = (id: ReadToolId): string => `read:${id}`;

export interface ReadToolsApi {
  /** The tools this reader has (in any order; the dock keeps READ_TOOLS' order). */
  has: readonly ReadToolId[];
  isOn(id: ReadToolId): boolean;
  run(id: ReadToolId): void;
  /** The timer's countdown while one runs, else null. */
  timer?: string | null;
  /** Tooltips that differ in this reader ("Zoom and display" for PDF pages). */
  titles?: Partial<Record<ReadToolId, string>>;
}

/**
 * Registers a reader's reading tools while it is open. `api` may change on every render: the tools read it
 * through a ref, and the dock is told to draw again when what it shows (on, countdown) changes.
 */
export function useReadTools(reader: ReaderKind, api: ReadToolsApi): void {
  const ref = useRef(api);
  useLayoutEffect(() => {
    ref.current = api;
  });
  const has = api.has.join(' ');
  const titles = JSON.stringify(api.titles ?? {});
  useEffect(() => {
    const offs = READ_TOOLS.filter((t) => has.split(' ').includes(t.id)).map((t, order) =>
      registerReaderTool({
        id: readToolId(t.id),
        label: t.label,
        title: (JSON.parse(titles) as Partial<Record<ReadToolId, string>>)[t.id] ?? t.title,
        keys: t.keys,
        ariaLabel: t.ariaLabel,
        cluster: t.cluster,
        noRail: t.noRail,
        group: 'read',
        order,
        readers: [reader],
        icon: t.icon,
        isOn: t.id === 'focus' ? undefined : () => ref.current.isOn(t.id),
        live: t.id === 'timer' ? () => ref.current.timer ?? null : undefined,
        run: () => ref.current.run(t.id),
      })
    );
    return () => offs.forEach((off) => off());
  }, [reader, has, titles]);

  const shown = api.has.map((id) => (api.isOn(id) ? id : '')).join(' ') + '|' + (api.timer ?? '');
  useEffect(() => refreshReaderTools(), [shown]);
}
