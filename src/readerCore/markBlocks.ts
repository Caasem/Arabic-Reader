import { lineBlocks } from './lineBlocks';

/**
 * Highlights and argument marks, drawn as one block per line of words (never one per word span, which is what the browser's
 * own highlight painting gives). The blocks live in the reader's scroll area, behind the text, so they scroll with it and
 * never tint the words; the text's DOM (and the character offsets every saved place depends on) is not touched.
 */
export type MarkStyle = 'underline' | 'wash' | 'marker';

export type MarkTag = 'label' | 'chip' | 'letter' | 'off';

/** Headroom, in px, added above a marked passage's first line for its role label: the label sits inside the highlight, above the words. */
export const TAG_BAND = 12;

export interface BlockSpec {
  key: string;
  /** Classes that colour the block (qr-block--yellow, qr-block--claim ...). */
  cls: string;
  ranges: Range[];
  /** A small label at the upper-left corner of the first line (an argument mark's number and role). */
  tag?: { text: string; ini: string };
}

/** The label element for a block: a dot and text (or the initial, in the letter look), styled by the layer's data-tag. */
export function tagElement(tag: { text: string; ini: string }): HTMLElement {
  const el = document.createElement('span');
  el.className = 'qr-tag';
  el.innerHTML = '<span class="qr-tag__ini"></span><span class="qr-tag__txt"></span>';
  (el.firstChild as HTMLElement).textContent = tag.ini;
  (el.lastChild as HTMLElement).textContent = tag.text;
  return el;
}

const stageOf = (): HTMLElement | null => document.querySelector<HTMLElement>('.qr-stage');

function layerOf(stage: HTMLElement, name: string): HTMLElement {
  let layer = Array.from(stage.children).find((c): c is HTMLElement => c instanceof HTMLElement && c.dataset.layer === name);
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'qr-blocks';
    layer.dataset.layer = name;
    layer.setAttribute('aria-hidden', 'true');
    stage.appendChild(layer);
  }
  return layer;
}

/** Draws `specs` in the layer called `name`, replacing what it held. Wash blocks fill the line spacing so wrapped lines meet. */
export function renderBlocks(name: string, specs: readonly BlockSpec[], style: MarkStyle, tagLook: MarkTag = 'label'): void {
  const stage = stageOf();
  if (!stage) return;
  if (!specs.length) {
    clearBlocks(name);
    return;
  }
  const layer = layerOf(stage, name);
  layer.dataset.style = style;
  layer.dataset.tag = tagLook;
  stage.classList.add('qr-iso');
  const sr = stage.getBoundingClientRect();
  const x0 = sr.left + stage.clientLeft - stage.scrollLeft;
  const y0 = sr.top + stage.clientTop - stage.scrollTop;
  const pitchCache = new Map<Element, number | null>();
  const pitch = (range: Range): number | null => {
    if (style !== 'wash') return null;
    const node = range.startContainer;
    const section = (node instanceof Element ? node : node.parentElement)?.closest('.qr-chapter');
    if (!section) return null;
    if (!pitchCache.has(section)) {
      const px = parseFloat(getComputedStyle(section).lineHeight);
      pitchCache.set(section, Number.isFinite(px) ? px : null);
    }
    return pitchCache.get(section) ?? null;
  };
  const frag = document.createDocumentFragment();
  for (const spec of specs) {
    let tagged = false;
    for (const range of spec.ranges) {
      lineBlocks(Array.from(range.getClientRects()), pitch(range)).forEach((b) => {
        const el = document.createElement('div');
        el.className = `qr-block ${spec.cls}`;
        // The first line of a tagged mark grows upward to make room for its label.
        const band = spec.tag && tagLook !== 'off' && !tagged ? TAG_BAND : 0;
        el.style.cssText = `left:${b.left - x0}px;top:${b.top - y0 - band}px;width:${b.right - b.left}px;height:${b.bottom - b.top + band}px`;
        if (band) el.appendChild(tagElement(spec.tag!));
        tagged = tagged || !!band;
        frag.appendChild(el);
      });
    }
  }
  layer.replaceChildren(frag);
}

export function clearBlocks(name: string): void {
  const stage = stageOf();
  if (!stage) return;
  Array.from(stage.children).forEach((c) => c instanceof HTMLElement && c.dataset.layer === name && c.remove());
  if (!stage.querySelector(':scope > .qr-blocks')) stage.classList.remove('qr-iso');
}

/**
 * Calls `redraw` when the page may have moved the words: a resize, the stage changing size, and on a timer as a safety net
 * (reflow from a font change, a chapter loading). Scrolling needs nothing: the blocks scroll with the text.
 */
export function keepBlocksFresh(redraw: () => void): () => void {
  window.addEventListener('resize', redraw);
  const stage = stageOf();
  const ro = typeof ResizeObserver !== 'undefined' && stage ? new ResizeObserver(redraw) : null;
  if (stage) ro?.observe(stage);
  const id = window.setInterval(redraw, 1200);
  return () => {
    window.removeEventListener('resize', redraw);
    ro?.disconnect();
    window.clearInterval(id);
  };
}
