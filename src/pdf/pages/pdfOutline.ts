import { useEffect, useState } from 'react';
import type { OpenedPdf } from './pdfjsLoader';

/** An entry of the PDF's own table of contents (its outline), with the page it opens. */
export interface PdfOutlineEntry {
  title: string;
  /** 1-based. */
  page: number;
  /** 0 for top-level entries. */
  depth: number;
}

interface OutlineNode {
  title: string;
  dest: string | unknown[] | null;
  items?: OutlineNode[];
}

const MAX_DEPTH = 2;

/** The outline flattened in reading order, entries without a page in this document left out. */
export async function pdfOutline(opened: OpenedPdf): Promise<PdfOutlineEntry[]> {
  const { doc } = opened;
  const outline = ((await doc.getOutline().catch(() => null)) ?? []) as OutlineNode[];
  const out: PdfOutlineEntry[] = [];
  const pageOf = async (dest: OutlineNode['dest']): Promise<number | null> => {
    try {
      const explicit = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
      const ref = Array.isArray(explicit) ? explicit[0] : null;
      if (ref === null || ref === undefined) return null;
      const index = typeof ref === 'number' ? ref : await doc.getPageIndex(ref as Parameters<typeof doc.getPageIndex>[0]);
      return index + 1;
    } catch {
      return null;
    }
  };
  const walk = async (nodes: OutlineNode[], depth: number) => {
    for (const node of nodes) {
      const page = await pageOf(node.dest);
      const title = node.title?.trim();
      if (page && title) out.push({ title, page, depth });
      if (node.items?.length && depth < MAX_DEPTH) await walk(node.items, depth + 1);
    }
  };
  await walk(outline, 0);
  return out;
}

export function usePdfOutline(opened: OpenedPdf | null): PdfOutlineEntry[] {
  const [state, setState] = useState<{ doc: object; entries: PdfOutlineEntry[] } | null>(null);
  useEffect(() => {
    if (!opened) return;
    let stale = false;
    void pdfOutline(opened).then((entries) => !stale && setState({ doc: opened.doc, entries }));
    return () => {
      stale = true;
    };
  }, [opened]);
  return state && opened && state.doc === opened.doc ? state.entries : [];
}

/** The outline entry the reader is in: the last one starting at or before `page`. */
export function outlineEntryAt(entries: readonly PdfOutlineEntry[], page: number): PdfOutlineEntry | null {
  let found: PdfOutlineEntry | null = null;
  for (const e of entries) if (e.page <= page) found = e;
  return found;
}
