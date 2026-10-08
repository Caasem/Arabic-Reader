/**
 * "Share as card": draws one highlight as a square image, on this device, and
 * hands it to the system share sheet or saves it. Nothing is uploaded.
 */
import { HIGHLIGHT_FILL } from '../../theme/tokens';
import type { Highlight } from '../../types';
import { saveFile, type SaveFileResult } from '../../utils/saveFile';

const SIZE = 1080;
const PAD = 110;
const ARABIC = '"Noto Naskh Arabic", "Amiri", "Traditional Arabic", serif';
const LATIN = 'Georgia, "Times New Roman", serif';

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** Biggest font size (down to a floor) at which the quote fits the card. */
function fitQuote(ctx: CanvasRenderingContext2D, text: string, width: number, height: number): { size: number; lines: string[] } {
  for (let size = 76; size >= 30; size -= 4) {
    ctx.font = `700 ${size}px ${ARABIC}`;
    const lines = wrap(ctx, text, width);
    if (lines.length * size * 1.75 <= height) return { size, lines };
  }
  ctx.font = `700 30px ${ARABIC}`;
  const lines = wrap(ctx, text, width);
  const max = Math.floor(height / (30 * 1.75));
  return { size: 30, lines: lines.length > max ? [...lines.slice(0, max - 1), `${lines[max - 1]} …`] : lines };
}

export async function renderQuoteCard(highlight: Highlight): Promise<Blob> {
  try {
    await document.fonts.load(`700 60px ${ARABIC}`, highlight.text);
  } catch {
    // Falls back to whatever Arabic font the system has.
  }
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This device cannot draw the card.');

  ctx.fillStyle = '#1f1d1a';
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.fillStyle = HIGHLIGHT_FILL[highlight.color] ?? HIGHLIGHT_FILL.yellow;
  ctx.font = `400 220px ${LATIN}`;
  ctx.textBaseline = 'top';
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.fillText('”', PAD - 10, 40);

  const width = SIZE - PAD * 2;
  const { size, lines } = fitQuote(ctx, highlight.text, width, SIZE - 520);
  const lineHeight = size * 1.75;
  let y = 280;
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  for (const line of lines) {
    // The highlighter stroke under each line, then the words over it.
    ctx.font = `700 ${size}px ${ARABIC}`;
    const w = Math.min(ctx.measureText(line).width, width);
    ctx.fillStyle = 'rgba(201, 150, 58, 0.38)';
    ctx.fillRect(SIZE - PAD - w - 8, y + size * 0.95, w + 16, size * 0.42);
    ctx.fillStyle = '#f3ecdf';
    ctx.fillText(line, SIZE - PAD, y + size * 1.25);
    y += lineHeight;
  }

  ctx.fillStyle = '#cfc4b2';
  ctx.font = `400 38px ${ARABIC}`;
  const source = [highlight.bookTitle, highlight.chapterLabel].filter(Boolean).join(' · ');
  ctx.fillText(source, SIZE - PAD, SIZE - PAD);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the image.'))), 'image/png'));
}

/** The system share sheet when it takes images, otherwise a download. */
export async function shareQuoteCard(highlight: Highlight): Promise<SaveFileResult> {
  const blob = await renderQuoteCard(highlight);
  const name = `${(highlight.bookTitle || 'highlight').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60)}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    }
  }
  return saveFile(name, blob, 'image/png');
}
