import type { BookMeta } from '../types';
import { formatCleanLocation, parseCleanLocation } from '../quietReader/location';
import { bookDeskId, listItems } from '../studyDesk/deskStore';
import { attachImage } from '../studyDesk/marginImages';
import { formatPdfLocation } from '../studyDesk/pageGeometry';
import { capture } from '../studyDesk/useDesk';
import { borderPoint, contentBox, pathD } from './geometry';
import { PAPER_COLORS } from './inkUi';
import type { Sketch } from './types';

/**
 * A sketch sent to the margin becomes a study desk item pinned beside the place the sheet belongs to, so it
 * behaves like every other margin card (leader line, document, export):
 * - picture: a screenshot card of the sheet; it is drawn again whenever the sheet changes;
 * - outline: a margin note whose lines are the diagram (each arrow's target indented under its node);
 * - node: one node's words as a margin note.
 * Each carries `sketchId`, so the card can open its sheet again.
 */
export type SendHow = 'picture' | 'outline' | 'node';

/** The diagram as lines of text: roots first, each arrow's target indented under it with "→". */
export function sketchOutline(s: Pick<Sketch, 'nodes' | 'edges' | 'strokes'>): string {
  const kids = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const e of s.edges) {
    if (!kids.has(e.a)) kids.set(e.a, []);
    kids.get(e.a)!.push(e.b);
    hasParent.add(e.b);
  }
  const lines: string[] = [];
  const seen = new Set<string>();
  const walk = (id: string, depth: number) => {
    const n = s.nodes.find((x) => x.id === id);
    if (!n || seen.has(id)) return;
    seen.add(id);
    lines.push((depth ? '  '.repeat(depth - 1) + '→ ' : '') + n.text);
    for (const k of kids.get(id) ?? []) walk(k, depth + 1);
  };
  for (const n of s.nodes) if (!hasParent.has(n.id)) walk(n.id, 0);
  // Nodes only reached through a loop.
  for (const n of s.nodes) walk(n.id, 0);
  if (s.strokes.length) lines.push(`(+ ${s.strokes.length} handwritten mark${s.strokes.length === 1 ? '' : 's'} on the sheet)`);
  return lines.join('\n');
}

/** Where the card sits: the sheet's PDF page (near its top) or the first line of the passage it was started on. */
export function sketchPin(s: Pick<Sketch, 'key' | 'location'>): string | null {
  if (s.key.startsWith('pdf:')) {
    const page = Number(s.key.slice(4));
    return Number.isInteger(page) && page > 0 ? formatPdfLocation(page, 0, 0.1, 1, 0) : null;
  }
  const at = parseCleanLocation(s.location);
  return at ? formatCleanLocation({ chapter: at.chapter, start: at.start, end: at.start + 1 }) : null;
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The sheet as a standalone SVG on paper (fixed colours, as an image cannot read the theme). */
export function sketchSvg(s: Pick<Sketch, 'nodes' | 'edges' | 'strokes'>): { svg: string; w: number; h: number } {
  const box = contentBox(s.strokes, s.nodes) ?? { x: 0, y: 0, w: 200, h: 120 };
  const pad = 20;
  const x0 = box.x - pad;
  const y0 = box.y - pad;
  const w = Math.max(160, box.w + pad * 2);
  const h = Math.max(100, box.h + pad * 2);
  let body = `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#fffdf8"/>`;
  body += `<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#6b6560"/></marker></defs>`;
  for (const e of s.edges) {
    const a = s.nodes.find((n) => n.id === e.a);
    const b = s.nodes.find((n) => n.id === e.b);
    if (!a || !b) continue;
    const p1 = borderPoint(a, b, 2);
    const p2 = borderPoint(b, a, e.dir ? 4 : 2);
    body += `<path d="M${p1[0]} ${p1[1]}L${p2[0]} ${p2[1]}" fill="none" stroke="#6b6560" stroke-width="1.6"${e.dir ? ' marker-end="url(#a)"' : ''}/>`;
  }
  for (const n of s.nodes) {
    const fill = n.kind === 'quote' ? '#f6ead0' : '#ffffff';
    const stroke = n.kind === 'note' ? '#2e7d74' : n.kind === 'quote' ? '#f6ead0' : '#d9d2c5';
    const text = n.text.length > 40 ? n.text.slice(0, 38) + '…' : n.text;
    body += `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="14" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>`;
    body += `<text x="${n.x + n.w / 2}" y="${n.y + n.h / 2}" text-anchor="middle" dominant-baseline="central" font-family="'Noto Naskh Arabic','Segoe UI',Tahoma,sans-serif" font-size="${n.kind === 'quote' ? 16 : 14}" fill="${n.kind === 'quote' ? '#7d5a14' : '#1c1b19'}">${esc(text)}</text>`;
  }
  for (const st of s.strokes) body += `<path d="${pathD(st.pts)}" fill="none" stroke="${PAPER_COLORS[st.color]}" stroke-width="${st.width}" stroke-linecap="round" stroke-linejoin="round"/>`;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${w} ${h}" width="${w}" height="${h}">${body}</svg>`, w, h };
}

/** The sheet as a PNG, at most 1000 pixels wide. */
export async function sketchPng(s: Sketch): Promise<Blob> {
  const { svg, w, h } = sketchSvg(s);
  const scale = Math.min(2, 1000 / w);
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No image'))), 'image/png'));
}

export async function sendSketchToMargin(book: BookMeta, sketch: Sketch, how: SendHow, nodeId?: string | null): Promise<void> {
  const location = sketchPin(sketch);
  if (!location) throw new Error('No place for this sheet');
  const base = {
    text: '',
    fromMargin: true,
    inInbox: false,
    pin: { bookId: book.id, location, side: 'right' as const },
    source: { bookId: book.id, bookTitle: book.title, location },
    sketchId: sketch.id,
  };
  const deskId = bookDeskId(book.id);
  if (how === 'picture') await capture(book, deskId, { ...base, type: 'capture', body: '' }, await sketchPng(sketch));
  else if (how === 'outline') await capture(book, deskId, { ...base, type: 'line', body: sketchOutline(sketch) });
  else {
    const node = sketch.nodes.find((n) => n.id === nodeId);
    if (!node) throw new Error('Select a node first');
    await capture(book, deskId, { ...base, type: 'line', body: node.text });
  }
}

/** Draws again every picture card of this sheet (outlines and single nodes are notes of their own and stay). */
export async function refreshSketchCards(sketch: Sketch): Promise<void> {
  const cards = (await listItems()).filter((i) => i.sketchId === sketch.id && i.type === 'capture');
  if (!cards.length) return;
  const png = await sketchPng(sketch);
  for (const c of cards) await attachImage(c, png);
}
