import type { Block } from './docExport';
import type { Desk, DeskItem } from './types';

/** What a format gets: the title, the document's blocks, and (when known) the desk and its items. */
export interface ExportContext {
  title: string;
  blocks: Block[];
  desk?: Desk;
  items?: Map<string, DeskItem>;
}

/** A way to save the desk document as text. Features add theirs here; ExportMenu lists them without knowing them. */
export interface ExportFormat {
  id: string;
  label: string;
  ext: string;
  make(ctx: ExportContext): string;
  savedMessage: string;
}

const formats: ExportFormat[] = [];

/** Adds a format after Markdown in the Export menu (same id replaces). Returns the function that takes it out. */
export function registerExportFormat(f: ExportFormat): () => void {
  const at = formats.findIndex((x) => x.id === f.id);
  if (at >= 0) formats[at] = f;
  else formats.push(f);
  return () => {
    const i = formats.indexOf(f);
    if (i >= 0) formats.splice(i, 1);
  };
}

export const exportFormats = (): ExportFormat[] => formats.slice();
