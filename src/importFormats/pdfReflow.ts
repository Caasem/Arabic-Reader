import { escapeXml, type Chapter } from './epubWriter';

/** One piece of text as the PDF draws it. Coordinates are PDF points; y grows upward. */
export interface TextRun {
  str: string;
  /** Left edge. */
  x: number;
  /** Baseline. */
  y: number;
  width: number;
  size: number;
}

export interface PageText {
  width: number;
  height: number;
  runs: TextRun[];
}

/** A line of text on a page, runs already joined in reading order. */
export interface Line {
  text: string;
  x0: number;
  x1: number;
  y: number;
  size: number;
  /** The line has a wide gap inside it: two verse halves, or table cells. */
  wideGap: boolean;
}

type Block =
  | { kind: 'p'; lines: Line[]; fresh: boolean }
  | { kind: 'poem'; lines: Line[]; fresh: boolean }
  | { kind: 'h'; text: string; size: number }
  | { kind: 'note'; lines: Line[] };

const PRESENTATION_FORMS = /[ﭐ-﷿ﹰ-﻿]+/g;
const INVISIBLE = /[‎‏‪-‮⁦-⁩­﻿]/g;
const TERMINAL = /[.!?؟۔…:»"”)\]]\s*$/;
const WIDE_GAP = '  ';

/** Presentation forms (the shaped glyph codes some PDFs hold) back to plain letters; tatweel and bidi marks dropped. */
export function normalizeArabic(text: string): string {
  return text.replace(PRESENTATION_FORMS, (m) => m.normalize('NFKC')).replace(INVISIBLE, '').replace(/ـ/g, '');
}

const median = (values: number[]): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const percentile = (values: number[], p: number): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
};

/** Groups a page's runs into lines (top to bottom) and joins each line in reading order. */
export function pageToLines(page: PageText, rtl: boolean): Line[] {
  const runs = page.runs.filter((r) => r.str.trim() !== '');
  runs.sort((a, b) => b.y - a.y || a.x - b.x);
  const groups: { y: number; runs: TextRun[] }[] = [];
  for (const run of runs) {
    const group = groups.find((g) => Math.abs(g.y - run.y) <= 0.5 * Math.max(run.size, g.runs[0].size));
    if (group) group.runs.push(run);
    else groups.push({ y: run.y, runs: [run] });
  }
  groups.sort((a, b) => b.y - a.y);

  return groups.map((group) => {
    const ordered = [...group.runs].sort((a, b) => (rtl ? b.x + b.width - (a.x + a.width) : a.x - b.x));
    let text = '';
    let wideGap = false;
    ordered.forEach((run, i) => {
      if (i > 0) {
        const prev = ordered[i - 1];
        const gap = rtl ? prev.x - (run.x + run.width) : run.x - (prev.x + prev.width);
        const size = Math.max(run.size, prev.size);
        if (gap >= 3 * size) {
          text += WIDE_GAP;
          wideGap = true;
        } else if (gap > 0.12 * size && !/\s$/.test(text) && !/^\s/.test(run.str)) {
          text += ' ';
        }
      }
      text += run.str;
    });
    const longest = group.runs.reduce((a, b) => (b.str.length > a.str.length ? b : a));
    return {
      text: normalizeArabic(text).replace(/[ \t]+/g, ' ').trim(),
      x0: Math.min(...group.runs.map((r) => r.x)),
      x1: Math.max(...group.runs.map((r) => r.x + r.width)),
      y: group.y,
      size: longest.size,
      wideGap,
    };
  }).filter((l) => l.text);
}

const pageNumberOnly = /^[\s\-–—()[\]|]*[0-9٠-٩۰-۹]{1,4}[\s\-–—()[\]|]*$/;
const headerKey = (text: string) => text.replace(/[0-9٠-٩۰-۹]+/g, '#').replace(/\s+/g, '');

/** Drops page numbers and the running header/footer that repeats on at least half of the pages. */
export function removeRunningHeads(pages: { page: PageText; lines: Line[] }[]): Line[][] {
  const margin = (p: PageText, l: Line) => l.y > p.height * 0.88 || l.y < p.height * 0.1;
  const counts = new Map<string, number>();
  for (const { page, lines } of pages) {
    const keys = new Set(lines.filter((l) => margin(page, l)).map((l) => headerKey(l.text)));
    for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const needed = pages.length >= 3 ? Math.max(2, Math.ceil(pages.length / 2)) : Infinity;
  return pages.map(({ page, lines }) =>
    lines.filter((l) => !(margin(page, l) && (pageNumberOnly.test(l.text) || (counts.get(headerKey(l.text)) ?? 0) >= needed)))
  );
}

interface Layout {
  rtl: boolean;
  bodySize: number;
  colWidth: number;
  /** Where full-width lines start (the right edge for RTL). */
  edge: number;
  leading: number;
}

function measure(pages: { page: PageText; lines: Line[] }[], rtl: boolean): Layout {
  const all = pages.flatMap((p) => p.lines);
  const bySize = new Map<number, number>();
  for (const l of all) {
    const key = Math.round(l.size * 2) / 2;
    bySize.set(key, (bySize.get(key) ?? 0) + l.text.length);
  }
  const bodySize = [...bySize.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 12;
  const body = all.filter((l) => Math.abs(l.size - bodySize) <= 0.75);
  const colWidth = percentile(body.map((l) => l.x1 - l.x0), 0.9);
  const full = body.filter((l) => l.x1 - l.x0 >= colWidth * 0.9);
  const edge = median(full.map((l) => (rtl ? l.x1 : l.x0)));
  const gaps: number[] = [];
  for (const p of pages) {
    const lines = p.lines.filter((l) => Math.abs(l.size - bodySize) <= 0.75);
    for (let i = 1; i < lines.length; i++) {
      const g = lines[i - 1].y - lines[i].y;
      if (g > 0 && g < bodySize * 3) gaps.push(g);
    }
  }
  return { rtl, bodySize, colWidth, edge, leading: median(gaps) || bodySize * 1.4 };
}

const isHeading = (l: Line, layout: Layout) => l.size >= layout.bodySize * 1.2 && l.text.length <= 120 && !l.wideGap;
const isNote = (l: Line, layout: Layout) => l.size <= layout.bodySize * 0.85;

function looksLikePoem(lines: Line[], layout: Layout, pageWidth: number): boolean {
  if (lines.length < 2) return false;
  if (lines.every((l) => l.wideGap)) return true;
  const widths = lines.map((l) => l.x1 - l.x0);
  const short = widths.every((w) => w < layout.colWidth * 0.8);
  if (!short) return false;
  const centred = lines.every((l) => Math.abs((l.x0 + l.x1) / 2 - pageWidth / 2) < pageWidth * 0.04);
  const regular = lines.length >= 3 && Math.max(...widths) - Math.min(...widths) <= layout.colWidth * 0.25;
  return centred || regular;
}

function pageBlocks(page: PageText, lines: Line[], layout: Layout): Block[] {
  const blocks: Block[] = [];
  let group: Line[] = [];
  let fresh = false;
  let forceFresh = false;
  const indented = (l: Line) => (layout.rtl ? l.x1 < layout.edge - layout.bodySize : l.x0 > layout.edge + layout.bodySize);
  const flush = () => {
    if (!group.length) return;
    if (group.every((l) => isNote(l, layout))) {
      blocks.push({ kind: 'note', lines: group });
    } else if (looksLikePoem(group, layout, page.width)) {
      blocks.push({ kind: 'poem', lines: group, fresh });
    } else {
      // Prose: a short line that ends a sentence also ends the paragraph.
      let current: Line[] = [];
      let first = fresh;
      for (const l of group) {
        current.push(l);
        if (l.x1 - l.x0 < layout.colWidth * 0.8 && TERMINAL.test(l.text) && l !== group[group.length - 1]) {
          blocks.push({ kind: 'p', lines: current, fresh: first });
          current = [];
          first = true;
        }
      }
      if (current.length) blocks.push({ kind: 'p', lines: current, fresh: first });
    }
    group = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isHeading(line, layout)) {
      flush();
      const last = blocks[blocks.length - 1];
      const prev = lines[i - 1];
      // Neighbouring heading lines of one size are one heading.
      if (last?.kind === 'h' && prev && isHeading(prev, layout) && Math.abs(last.size - line.size) < 1 && prev.y - line.y < line.size * 2.2) {
        last.text += ` ${line.text}`;
      } else {
        blocks.push({ kind: 'h', text: line.text, size: line.size });
      }
      forceFresh = true;
      continue;
    }
    const prev = group[group.length - 1];
    if (prev) {
      const spaced = prev.y - line.y > layout.leading * 1.45;
      const sizeChange = isNote(prev, layout) !== isNote(line, layout);
      // A first-line indent starts a paragraph; short centred or staggered lines are verse, not indents.
      const indentBreak = indented(line) && !looksLikeVerseStep(prev, line) && (line.x1 - line.x0 >= layout.colWidth * 0.6 || TERMINAL.test(prev.text));
      if (indentBreak || spaced || sizeChange) {
        flush();
        forceFresh = true;
      }
    }
    if (!group.length) {
      fresh = forceFresh || indented(line);
      forceFresh = false;
    }
    group.push(line);
  }
  flush();
  return blocks;
}

/** Verse lines are often staggered; their indentation is not a new paragraph. */
const looksLikeVerseStep = (prev: Line, line: Line) => prev.wideGap && line.wideGap;

function joinLines(lines: Line[]): string {
  let text = '';
  for (const { text: raw } of lines) {
    if (!text) {
      text = raw;
    } else if (/[A-Za-z]-$/.test(text) && /^[a-z]/.test(raw)) {
      text = text.slice(0, -1) + raw; // a hyphenated Latin word
    } else {
      text += ` ${raw}`;
    }
  }
  return text;
}

const blockHtml = (b: Block): string => {
  switch (b.kind) {
    case 'p':
      return `<p>${escapeXml(joinLines(b.lines))}</p>`;
    case 'poem':
      return `<p>${b.lines.map((l) => escapeXml(l.text)).join('<br/>')}</p>`;
    case 'note':
      return `<p><small>${escapeXml(joinLines(b.lines))}</small></p>`;
    case 'h':
      return '';
  }
};

const WORDS_PER_PART = 5000;

export interface Reflowed {
  chapters: Chapter[];
  /** A short heading-like first line, offered as the book title when the PDF names none. */
  firstHeading?: string;
}

/**
 * PDF pages → chapters. Lines come from position, headings from font size (the largest size tier
 * starts a chapter), running heads are dropped, line breaks inside a paragraph are joined, and
 * short regular or centred lines stay as verse. With fewer than two chapter headings the text is
 * cut every 5,000 words into "Part 1", "Part 2" …
 */
export function reflowPages(pages: PageText[], rtl: boolean, fallbackTitle: string): Reflowed {
  const withLines = pages.map((page) => ({ page, lines: pageToLines(page, rtl) })).filter((p) => p.lines.length);
  const cleaned = removeRunningHeads(withLines);
  const kept = withLines.map((p, i) => ({ page: p.page, lines: cleaned[i] })).filter((p) => p.lines.length);
  if (!kept.length) return { chapters: [] };
  const layout = measure(kept, rtl);

  // Page blocks, with a paragraph that runs over a page break rejoined and footnotes held back until it ends.
  const blocks: Block[] = [];
  let pendingNotes: Block[] = [];
  for (const { page, lines } of kept) {
    for (const block of pageBlocks(page, lines, layout)) {
      if (block.kind === 'note') {
        pendingNotes.push(block);
        continue;
      }
      const last = blocks[blocks.length - 1];
      const open =
        last?.kind === 'p' &&
        block.kind === 'p' &&
        !block.fresh &&
        last.lines[last.lines.length - 1].x1 - last.lines[last.lines.length - 1].x0 >= layout.colWidth * 0.8 &&
        !TERMINAL.test(last.lines[last.lines.length - 1].text);
      if (open) {
        last.lines.push(...block.lines);
        continue;
      }
      blocks.push(...pendingNotes);
      pendingNotes = [];
      blocks.push(block);
    }
  }
  blocks.push(...pendingNotes);

  // Heading tiers: the largest is a chapter; smaller ones are sub-headings inside it.
  const headingSizes = [...new Set(blocks.filter((b) => b.kind === 'h').map((b) => Math.round(b.size)))].sort((a, b) => b - a);
  const chapterSize = headingSizes[0];
  const chapterCount = blocks.filter((b) => b.kind === 'h' && Math.round(b.size) === chapterSize).length;
  const firstHeading = blocks.find((b) => b.kind === 'h')?.text;

  const chapters: Chapter[] = [];
  const open = (title: string) => chapters.push({ title, html: '' });
  const append = (html: string) => {
    if (!chapters.length) open(fallbackTitle);
    const c = chapters[chapters.length - 1];
    c.html += (c.html ? '\n' : '') + html;
  };

  if (chapterCount >= 2) {
    for (const block of blocks) {
      if (block.kind === 'h') {
        if (Math.round(block.size) === chapterSize) {
          open(block.text);
          append(`<h2>${escapeXml(block.text)}</h2>`);
        } else {
          append(`<h3>${escapeXml(block.text)}</h3>`);
        }
      } else {
        append(blockHtml(block));
      }
    }
  } else {
    let words = 0;
    for (const block of blocks) {
      if (block.kind === 'h') {
        if (!chapters.length) open('Part 1');
        append(`<h2>${escapeXml(block.text)}</h2>`);
        continue;
      }
      if (!chapters.length || words >= WORDS_PER_PART) {
        open(`Part ${chapters.length + 1}`);
        words = 0;
      }
      append(blockHtml(block));
      words += block.lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
    }
    if (chapters.length === 1) chapters[0].title = firstHeading ?? fallbackTitle;
  }
  return { chapters: chapters.filter((c) => c.html), firstHeading };
}
