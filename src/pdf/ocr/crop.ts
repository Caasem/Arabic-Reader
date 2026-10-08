import type { PDFPageProxy } from '../pages/pdfjsLoader';
import type { Enhance } from './settings';

/** A rectangle in PDF points, origin top-left of the page as drawn. */
export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Crop {
  image: Blob;
  width: number;
  height: number;
  /** The region actually drawn (padded, kept inside the page). */
  region: Region;
  /** Image pixels per point. */
  scale: number;
  /** White border around the drawing, in pixels, so edge letters are not clipped. */
  margin: number;
}

const MARGIN_PX = 16;
const MAX_SIDE_PX = 6000;

/** Grows a region by `pad` of its size on each side and keeps it inside the page. */
export function padRegion(region: Region, pad: number, page: { width: number; height: number }): Region {
  const x0 = Math.max(0, region.x - region.w * pad);
  const y0 = Math.max(0, region.y - region.h * pad);
  const x1 = Math.min(page.width, region.x + region.w * (1 + pad));
  const y1 = Math.min(page.height, region.y + region.h * (1 + pad));
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/**
 * Grey-scales RGBA pixels in place and, for 'contrast', stretches them so print is dark and paper is white;
 * for 'binarize', cuts them to black and white at Otsu's threshold. Scans are rarely clean: this is
 * what lets an engine tell thin letters from the paper.
 */
export function enhancePixels(px: Uint8ClampedArray, how: Enhance): void {
  if (how === 'none') return;
  const hist = new Uint32Array(256);
  for (let i = 0; i < px.length; i += 4) {
    const g = ((px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000) | 0;
    px[i] = px[i + 1] = px[i + 2] = g;
    hist[g]++;
  }
  const total = px.length / 4;
  if (!total) return;
  if (how === 'contrast') {
    let acc = 0;
    let lo = 0;
    let hi = 255;
    for (let i = 0; i < 256; i++) {
      acc += hist[i];
      if (acc >= total * 0.01) {
        lo = i;
        break;
      }
    }
    acc = 0;
    for (let i = 255; i >= 0; i--) {
      acc += hist[i];
      if (acc >= total * 0.2) {
        hi = i;
        break;
      }
    }
    const span = Math.max(hi - lo, 1);
    for (let i = 0; i < px.length; i += 4) px[i] = px[i + 1] = px[i + 2] = Math.max(0, Math.min(255, ((px[i] - lo) * 255) / span));
    return;
  }
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let weightBack = 0;
  let sumBack = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    weightBack += hist[t];
    if (!weightBack) continue;
    const weightFront = total - weightBack;
    if (!weightFront) break;
    sumBack += t * hist[t];
    const between = weightBack * weightFront * (sumBack / weightBack - (sum - sumBack) / weightFront) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  for (let i = 0; i < px.length; i += 4) px[i] = px[i + 1] = px[i + 2] = px[i] > threshold ? 255 : 0;
}

/** Draws `region` of a page at high resolution as an enhanced PNG, ready for an engine. */
export async function cropPage(page: PDFPageProxy, region: Region, options: { scale: number; pad: number; enhance: Enhance }): Promise<Crop> {
  const base = page.getViewport({ scale: 1 });
  const padded = padRegion(region, options.pad, base);
  if (padded.w < 2 || padded.h < 2) throw new Error('Nothing to read there.');
  const scale = Math.min(options.scale, (MAX_SIDE_PX - MARGIN_PX * 2) / Math.max(padded.w, padded.h));
  const innerW = Math.ceil(padded.w * scale);
  const innerH = Math.ceil(padded.h * scale);

  const inner = document.createElement('canvas');
  inner.width = innerW;
  inner.height = innerH;
  const innerContext = inner.getContext('2d');
  if (!innerContext) throw new Error('Could not draw the page.');
  innerContext.fillStyle = '#fff';
  innerContext.fillRect(0, 0, innerW, innerH);
  await page.render({
    canvasContext: innerContext,
    canvas: inner,
    viewport: page.getViewport({ scale, offsetX: -padded.x * scale, offsetY: -padded.y * scale }),
  }).promise;

  const out = document.createElement('canvas');
  out.width = innerW + MARGIN_PX * 2;
  out.height = innerH + MARGIN_PX * 2;
  const context = out.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Could not draw the page.');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, out.width, out.height);
  context.drawImage(inner, MARGIN_PX, MARGIN_PX);
  if (options.enhance !== 'none') {
    const pixels = context.getImageData(0, 0, out.width, out.height);
    enhancePixels(pixels.data, options.enhance);
    context.putImageData(pixels, 0, 0);
  }
  const image = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
  if (!image) throw new Error('Could not draw the page.');
  return { image, width: out.width, height: out.height, region: padded, scale, margin: MARGIN_PX };
}
