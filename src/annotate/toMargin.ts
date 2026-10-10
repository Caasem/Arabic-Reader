import type { BookMeta } from '../types';
import { formatCleanLocation, parseCleanLocation } from '../quietReader/location';
import { bookDeskId, listItems, updateItem } from '../studyDesk/deskStore';
import { attachImage } from '../studyDesk/marginImages';
import { formatPdfLocation } from '../studyDesk/pageGeometry';
import { capture } from '../studyDesk/useDesk';
import { addInk, inkBlob } from '../studyDesk/marginInk';
import type { DeskInk } from '../studyDesk/types';
import { borderPoint, contentBox, pathD, r1 } from './geometry';
import { PAPER_COLORS } from './inkUi';
import type { Sketch } from './types';

/**
 * A sketch sent to the margin becomes a study desk item pinned beside the place the sheet belongs to, so it
 * behaves like every other margin card (leader line, document, export):
 * - picture: a card with the sheet as an SVG (sharp at any size, in the card and its large preview); it is drawn
 *   again whenever the sheet changes. Word export turns it into a PNG (docxExport.ts);
 * - outline: a margin note whose lines are the diagram (each arrow's target indented under its node);
 * - node: one node's words as a margin note;
 * - ink: the sheet's handwriting as an ink card (studyDesk/marginInk.tsx), sized to the margin.
 * Each carries `sketchId`, so the card can open its sheet again.
 */
export type SendHow = 'picture' | 'outline' | 'node' | 'ink';

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
    lines.push((depth ? '  '.repeat(depth - 1) + '→ ' : '') + (n.text || (n.image ? '[picture]' : '')));
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

/** A #rrggbb colour mixed with white: `amount` of the colour. */
function mix(hex: string, amount: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(255 + (v - 255) * amount));
  return `rgb(${c.join(' ')})`;
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * A node's words in lines that fit its box (an estimate: an image cannot measure text), the last one ending in
 * "…" when they do not all fit. Words longer than a line are cut.
 */
export function wrapLines(text: string, width: number, size: number, height: number): string[] {
  const per = Math.max(4, Math.floor((width - 16) / (size * 0.55)));
  const max = Math.max(1, Math.floor((height - 8) / (size * 1.3)));
  const lines: string[] = [];
  let line = '';
  for (const word of text.replace(/\s+/g, ' ').trim().split(' ')) {
    const w = word.length > per ? word.slice(0, per - 1) + '…' : word;
    if (!line) line = w;
    else if (line.length + 1 + w.length <= per) line += ' ' + w;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max);
  const last = kept[max - 1];
  kept[max - 1] = (last.length >= per ? last.slice(0, per - 1) : last) + '…';
  return kept;
}

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
    const fill = n.color ? mix(n.color, 0.45) : n.kind === 'quote' ? '#f6ead0' : '#ffffff';
    const stroke = n.kind === 'note' ? '#2e7d74' : n.kind === 'quote' ? '#f6ead0' : '#d9d2c5';
    if (n.image) {
      body += `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="14" fill="#ffffff" stroke="#d9d2c5" stroke-width="1.2"/>`;
      body += `<image href="${esc(n.image)}" x="${n.x + 8}" y="${n.y + 8}" width="${n.w - 16}" height="${Math.max(10, n.h - 16)}" preserveAspectRatio="xMidYMid meet"/>`;
      continue;
    }
    const size = n.kind === 'quote' ? 16 : 14;
    const lines = wrapLines(n.text, n.w, size, n.h);
    const lh = size * 1.3;
    const y0 = n.y + n.h / 2 - ((lines.length - 1) * lh) / 2;
    body += `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="14" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>`;
    body += `<text text-anchor="middle" dominant-baseline="central" direction="${/[؀-ۿ]/.test(n.text) ? 'rtl' : 'ltr'}" font-family="'Noto Naskh Arabic','Segoe UI',Tahoma,sans-serif" font-size="${size}" fill="${n.kind === 'quote' ? '#7d5a14' : '#1c1b19'}">${lines.map((l, i) => `<tspan x="${n.x + n.w / 2}" y="${r1(y0 + i * lh)}">${esc(l)}</tspan>`).join('')}</text>`;
  }
  for (const st of s.strokes) body += `<path d="${pathD(st.pts)}" fill="none" stroke="${PAPER_COLORS[st.color]}" stroke-width="${st.width}" stroke-linecap="round" stroke-linejoin="round"/>`;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${w} ${h}" width="${w}" height="${h}">${body}</svg>`, w, h };
}

/** The sheet as an SVG file: what picture cards show. */
export function sketchSvgBlob(s: Pick<Sketch, 'nodes' | 'edges' | 'strokes'>): Blob {
  return new Blob([sketchSvg(s).svg], { type: 'image/svg+xml' });
}

/**
 * How many pixels per sheet pixel a PNG of a w×h sheet gets: never below 2 (sharp on high-density screens),
 * and as much as fits 4096 pixels on the long side, so a large sheet keeps its fine lines and small writing.
 */
export function pngScale(w: number, h: number): number {
  return Math.max(2, Math.min(4, 4096 / Math.max(w, h, 1)));
}

/** Any SVG image as a PNG (for Word, which takes no SVG), at `pngScale`. */
export async function svgToPng(svg: Blob): Promise<Blob> {
  const url = URL.createObjectURL(svg);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth || 800;
    const h = img.naturalHeight || 600;
    const scale = pngScale(w, h);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No image'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The sheet as a PNG (export), sharp at `pngScale`. */
export function sketchPng(s: Sketch): Promise<Blob> {
  return svgToPng(sketchSvgBlob(s));
}

/** A margin card's width for handwriting: the sheet's strokes, scaled down to fit it if wider. */
const INK_CARD_W = 240;

/** The sheet's freehand strokes as an ink card's ink, scaled to fit a margin card. */
export function sketchInk(s: Pick<Sketch, 'strokes'>): DeskInk | null {
  const box = contentBox(s.strokes, []);
  if (!box) return null;
  const k = Math.min(1, INK_CARD_W / Math.max(1, box.w + 16));
  let ink: DeskInk | undefined;
  for (const st of s.strokes)
    ink = addInk(ink, { color: st.color, width: r1(st.width * k), pts: st.pts.map(([x, y, p]) => [r1((x - box.x) * k), r1((y - box.y) * k), p]) }, INK_CARD_W);
  return ink ?? null;
}

export async function sendSketchToMargin(book: BookMeta, sketch: Sketch, how: SendHow, nodeId?: string | null, name?: string): Promise<void> {
  const location = sketchPin(sketch);
  if (!location) throw new Error('No place for this sheet');
  const base = {
    text: '',
    fromMargin: true,
    inInbox: false,
    pin: { bookId: book.id, location, side: 'right' as const },
    source: { bookId: book.id, bookTitle: book.title, location },
    sketchId: sketch.id,
    ...(name ? { sketchTitle: name } : {}),
  };
  const deskId = bookDeskId(book.id);
  if (how === 'ink') {
    const ink = sketchInk(sketch);
    if (!ink) throw new Error('Only handwriting makes an ink card: draw in Freehand first');
    await capture(book, deskId, { ...base, type: 'line', body: '', ink }, inkBlob(ink));
    return;
  }
  if (how === 'picture') await capture(book, deskId, { ...base, type: 'capture', body: '' }, sketchSvgBlob(sketch));
  else if (how === 'outline') await capture(book, deskId, { ...base, type: 'line', body: sketchOutline(sketch) });
  else {
    const node = sketch.nodes.find((n) => n.id === nodeId);
    if (!node) throw new Error('Select a node first');
    await capture(book, deskId, { ...base, type: 'line', body: node.text });
  }
}

/**
 * Draws again every picture card of this sheet (outlines, single nodes and ink cards are cards of their own and
 * stay), and gives every card from it the sheet's name.
 */
export async function refreshSketchCards(sketch: Sketch, name = sketch.title): Promise<void> {
  const cards = (await listItems()).filter((i) => i.sketchId === sketch.id);
  if (!cards.length) return;
  const svg = sketchSvgBlob(sketch);
  for (const c of cards) {
    if (c.type === 'capture') await attachImage(c, svg);
    if (name && c.sketchTitle !== name) await updateItem(c.id, { sketchTitle: name });
  }
}
