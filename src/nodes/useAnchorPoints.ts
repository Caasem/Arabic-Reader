import { useCallback, useEffect, useState } from 'react';
import { cleanToScreen, pdfToScreen, type Point } from './anchor';
import { chapterEl, cleanEm, findCleanStage, findPdfStage, inColumn, pdfFrame, wordCorner, type ReaderStage } from './anchorDom';
import type { NodeKid } from './types';

const findStage = (): ReaderStage | null => {
  const clean = findCleanStage();
  if (clean) return { el: clean, kind: 'clean' };
  const pdf = findPdfStage();
  return pdf ? { el: pdf, kind: 'pdf' } : null;
};

const NONE = new Map<string, Point>();
const sameStage = (a: ReaderStage | null, b: ReaderStage | null) => a?.el === b?.el;

/**
 * Where the reader is on screen, and where each top-level node's dot is in it. The quiet reader and the PDF pages
 * come and go (a PDF's own pages replace the quiet reader), so the stage is looked for now and then; the dots are
 * measured again whenever the text can have moved: scrolling, turning a page, resizing, re-rendering.
 * Points are relative to the stage's top-left corner. A node whose word (or page) is not on screen has no point.
 */
export function useAnchorPoints(roots: NodeKid[]): { stage: ReaderStage | null; frame: DOMRect | null; points: Map<string, Point> } {
  const [stage, setStage] = useState<ReaderStage | null>(findStage);
  const [frame, setFrame] = useState<DOMRect | null>(null);
  const [points, setPoints] = useState<Map<string, Point>>(new Map());

  useEffect(() => {
    const look = (s: ReaderStage | null) => {
      if (s?.el.isConnected) return s;
      const found = findStage();
      return sameStage(s, found) ? s : found;
    };
    const t = window.setInterval(() => setStage(look), 250);
    return () => window.clearInterval(t);
  }, []);

  const measure = useCallback(() => {
    if (!stage?.el.isConnected) return;
    const box = stage.el.getBoundingClientRect();
    setFrame((f) => (f && f.left === box.left && f.top === box.top && f.width === box.width && f.height === box.height ? f : box));
    const em = stage.kind === 'clean' ? cleanEm(stage.el) : 0;
    const next = new Map<string, Point>();
    for (const r of roots) {
      const a = r.node.anchor;
      if (!a) continue;
      let p: Point | null = null;
      if (a.kind === 'clean' && stage.kind === 'clean') {
        const section = chapterEl(stage.el, a.chapter);
        const corner = section && wordCorner(section, a.offset);
        if (corner && inColumn(stage.el, corner)) p = cleanToScreen(a, corner, em);
      } else if (a.kind === 'pdf' && stage.kind === 'pdf') {
        const rect = pdfFrame(stage.el, a.page);
        if (rect) p = pdfToScreen(a, rect);
      }
      if (p) next.set(r.node.id, { x: p.x - box.left, y: p.y - box.top });
    }
    setPoints((old) => {
      if (old.size === next.size && [...next].every(([id, p]) => old.get(id)?.x === p.x && old.get(id)?.y === p.y)) return old;
      return next;
    });
  }, [stage, roots]);

  useEffect(() => {
    if (!stage) return;
    let raf = 0;
    const soon = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    soon();
    document.addEventListener('scroll', soon, true);
    window.addEventListener('resize', soon);
    const ro = new ResizeObserver(soon);
    ro.observe(stage.el);
    const text = stage.el.querySelector('.qr-text');
    if (text) ro.observe(text);
    const mo = new MutationObserver(soon);
    mo.observe(stage.el, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    void document.fonts?.ready.then(soon);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('scroll', soon, true);
      window.removeEventListener('resize', soon);
      ro.disconnect();
      mo.disconnect();
    };
  }, [stage, measure]);

  // With no reader showing, there is nothing to place against.
  return stage ? { stage, frame, points } : { stage: null, frame: null, points: NONE };
}
