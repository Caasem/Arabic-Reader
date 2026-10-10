import { useSyncExternalStore, type ReactNode } from 'react';

/**
 * One list of reader tools, shared by every place that shows them: the quiet reader's dock, the PDF pages'
 * top bar and the Focus tool rail (FocusHost). A feature registers its tools once, when it mounts, instead
 * of finding its own way into each reader's chrome.
 */
export type ReaderKind = 'clean' | 'pdf';
/** Groups keep their order everywhere: reading tools, then the study desk, then ink. */
export type ToolGroup = 'read' | 'desk' | 'ink';

export interface ReaderTool {
  id: string;
  label: string;
  /** Tooltip; the key is added to it. */
  title?: string;
  /** The key that does the same, shown in the rail ("Alt+W", "D"). */
  keys?: string;
  group: ToolGroup;
  /** Order inside its group. */
  order: number;
  readers: ReaderKind[];
  icon: ReactNode;
  /** Left out of the quiet reader's dock, which has little room (still in the PDF bar and the Focus rail). */
  noDock?: boolean;
  /** A switch (Margins, Write) says whether it is on. */
  isOn?(): boolean;
  run(): void;
}

const GROUPS: ToolGroup[] = ['read', 'desk', 'ink'];
const tools = new Map<string, ReaderTool>();
let version = 0;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** Tells every tool bar to draw again (a switch changed). */
export function refreshReaderTools(): void {
  version++;
  listeners.forEach((l) => l());
}

/** Adds (or replaces) a tool; returns a function that removes it. */
export function registerReaderTool(tool: ReaderTool): () => void {
  tools.set(tool.id, tool);
  refreshReaderTools();
  return () => {
    if (tools.get(tool.id) === tool) {
      tools.delete(tool.id);
      refreshReaderTools();
    }
  };
}

export function readerTools(reader: ReaderKind, groups: readonly ToolGroup[] = GROUPS): ReaderTool[] {
  return [...tools.values()]
    .filter((t) => t.readers.includes(reader) && groups.includes(t.group))
    .sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || a.order - b.order);
}

/** The tools for a reader, kept up to date. */
export function useReaderTools(reader: ReaderKind, groups?: readonly ToolGroup[]): ReaderTool[] {
  useSyncExternalStore(subscribe, () => version);
  return readerTools(reader, groups);
}

export const toolTitle = (t: ReaderTool): string => (t.title ?? t.label) + (t.keys ? ` (${t.keys})` : '');
