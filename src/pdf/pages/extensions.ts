/**
 * Where later PDF features attach to the pages view without editing it: page overlays (highlights,
 * OCR boxes, search hits), a second source of tapped words (OCR of a selected crop, for pages that
 * have no text layer), and extra controls in the header. An extension registers once, when its own
 * module loads, and the reader asks the registry each time it draws.
 */
import type { ComponentType } from 'react';
import type { BookMeta } from '../../types';
import type { OpenedPdf } from './pdfjsLoader';
import type { PointedWord } from './wordAtPoint';

export type { PointedWord };

/** What an extension is told about the page it is working on. */
export interface PdfPageContext {
  book: BookMeta;
  opened: OpenedPdf;
  /** 1-based page number. */
  page: number;
  /** The page as drawn, in CSS pixels. */
  width: number;
  height: number;
}

export interface PdfWordTap extends PdfPageContext {
  /** The page's frame element (position overlays against it). */
  frame: HTMLElement;
  clientX: number;
  clientY: number;
}

export interface PdfPageExtension {
  id: string;
  /** Drawn inside each page frame, above the text layer. The extension decides its own pointer events. */
  Layer?: ComponentType<PdfPageContext>;
  /**
   * Called for a tap the text layer found no word under; return the word (with its on-screen rect) to
   * open it in the dictionary popup, or null. This is where OCR of a selected region plugs in.
   */
  wordAt?(tap: PdfWordTap): Promise<PointedWord | null>;
  /** Extra controls in the pages view's header, before the bookmark (kept mounted, hidden, in Focus). */
  Toolbar?: ComponentType<{ book: BookMeta; page: number; total: number; opened: OpenedPdf }>;
}

const extensions = new Map<string, PdfPageExtension>();

/** Adds (or replaces) an extension; returns a function that removes it. */
export function registerPdfPageExtension(extension: PdfPageExtension): () => void {
  extensions.set(extension.id, extension);
  return () => void extensions.delete(extension.id);
}

export const pdfPageExtensions = (): PdfPageExtension[] => [...extensions.values()];
