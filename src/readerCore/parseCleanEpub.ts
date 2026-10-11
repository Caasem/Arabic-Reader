import JSZip from 'jszip';
import { isFootnoteLink } from '../reader/footnotes/resolveFootnote';

export type CleanBlock =
  | { t: 'p'; s: string }
  | { t: 'h'; l: number; s: string }
  | { t: 'brk' }
  | { t: 'gap' };

/** A footnote referenced from the text. Its marker sits in a block's text as
 * NOTE_OPEN + index + NOTE_CLOSE (see chapterHtml). */
export interface CleanNote {
  /** What the book shows as the marker, e.g. "1" or "[٣]". */
  label: string;
  /** The note's text; empty when it could not be found. */
  text: string;
}

export interface CleanChapter {
  title: string;
  blocks: CleanBlock[];
  /** The spine file this chapter came from, relative to the package (OPF) directory. */
  href?: string;
  /** Its position in the spine, counting sections without text too (what an epub CFI's step points at). */
  spineIndex?: number;
  notes?: CleanNote[];
}

export const NOTE_OPEN = '\uE000';
export const NOTE_CLOSE = '\uE001';
/** Matches one footnote marker; group 1 is the note index. */
export const NOTE_MARKER = /\uE000(\d+)\uE001/g;

export interface CleanBook {
  title: string;
  chapters: CleanChapter[];
}

const BLOCK_TAGS = new Set(
  'p div section article blockquote li ul ol dl dt dd tr table figure figcaption pre aside header footer main body address'.split(' ')
);
const HEADING = /^h[1-6]$/;
const SKIP_TAGS = new Set('script style head img svg audio video canvas iframe object math nav map noscript'.split(' '));
const SCENE_BREAK = /^[\s*·•‧✦❖◆~\-–—_=]{3,}$/;

const clean = (s: string) =>
  s
    .replace(/[ \t\f\v ​]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/^\s+|\s+$/g, '');

/** Reduces one XHTML section to plain text blocks: paragraphs, headings and
 * spacing only. Styles, images, links and footnote markers are dropped. */
export function extractBlocks(html: string): CleanBlock[] {
  return extractChapter(html, false).blocks;
}

/** A footnote link found in a section, before its note text is known. */
interface PendingNote {
  label: string;
  href: string;
  text: string;
}

/**
 * Like extractBlocks, but with `keepNotes` each footnote reference stays in the
 * text as a marker and its note is collected: same-file notes are read here,
 * notes in other files are left for parseCleanEpub to fill in.
 */
export function extractChapter(html: string, keepNotes = true): { blocks: CleanBlock[]; notes: PendingNote[] } {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks: CleanBlock[] = [];
  const notes: PendingNote[] = [];
  let buf = '';

  const flush = (headLevel?: number) => {
    const txt = clean(buf);
    buf = '';
    if (!txt) {
      blocks.push({ t: 'gap' });
      return;
    }
    blocks.push(headLevel ? { t: 'h', l: headLevel, s: txt.replace(/\n/g, ' ') } : { t: 'p', s: txt });
  };

  const walk = (n: Node) => {
    if (n.nodeType === 3) {
      buf += (n.nodeValue ?? '').replace(/[\r\n]+/g, ' ');
      return;
    }
    if (n.nodeType !== 1) return;
    const el = n as Element;
    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return;
    if (tag === 'br') {
      buf += '\n';
      return;
    }
    if (tag === 'hr') {
      if (buf.trim()) flush();
      blocks.push({ t: 'brk' });
      return;
    }
    if (tag === 'a' && isFootnoteLink(el as HTMLAnchorElement)) {
      if (!keepNotes) return;
      const href = el.getAttribute('href') ?? '';
      const label = clean(el.textContent ?? '').replace(/\s+/g, '') || String(notes.length + 1);
      notes.push({ label, href, text: href.startsWith('#') ? noteText(doc, href.slice(1)) : '' });
      buf += NOTE_OPEN + (notes.length - 1) + NOTE_CLOSE;
      return;
    }
    if (HEADING.test(tag)) {
      if (buf.trim()) flush();
      el.childNodes.forEach(walk);
      if (buf.trim()) flush(Number(tag[1]));
      else buf = '';
      return;
    }
    const isBlock = BLOCK_TAGS.has(tag);
    if (isBlock && buf.trim()) flush();
    el.childNodes.forEach(walk);
    if (isBlock) {
      if (buf.trim()) flush();
      else {
        buf = '';
        // An empty leaf paragraph is deliberate vertical spacing.
        if ((tag === 'p' || tag === 'div') && !el.textContent?.trim() && !el.querySelector('p,div,h1,h2,h3,h4,h5,h6')) {
          blocks.push({ t: 'gap' });
        }
      }
    }
  };

  walk(doc.body ?? doc.documentElement);
  if (buf.trim()) flush();

  // Collapse repeated gaps, trim the edges, and turn "* * *" lines into scene breaks.
  const result: CleanBlock[] = [];
  for (const b of blocks) {
    if (b.t === 'p' && SCENE_BREAK.test(b.s)) {
      result.push({ t: 'brk' });
      continue;
    }
    const last = result[result.length - 1];
    if (b.t === 'gap' && (!last || last.t === 'gap' || last.t === 'brk')) continue;
    result.push(b);
  }
  while (result.length && result[result.length - 1].t === 'gap') result.pop();
  return { blocks: result, notes };
}

/** A note's text by its id. A bare back-link anchor (`<a id="fn1">1</a>`)
 * stands for the paragraph around it. */
function noteText(doc: Document, id: string): string {
  let target: Element | null = null;
  try {
    target = doc.getElementById(id) ?? doc.querySelector(`a[name="${CSS.escape(id)}"]`);
  } catch {
    target = doc.getElementById(id);
  }
  if (!target) return '';
  if (clean(target.textContent ?? '').length < 6) target = target.closest('p, li, aside, div, section') ?? target;
  return clean(target.textContent ?? '').replace(/\n/g, ' ');
}

const decoder = new TextDecoder('utf-8');

async function readText(zip: JSZip, path: string): Promise<string | null> {
  let file = zip.file(path);
  if (!file) {
    try {
      file = zip.file(decodeURIComponent(path));
    } catch {
      // malformed escape -- treat as missing
    }
  }
  return file ? decoder.decode(await file.async('uint8array')).replace(/^﻿/, '') : null;
}

const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '');

function normalizePath(p: string): string {
  const out: string[] = [];
  for (const segment of p.split('/')) {
    if (segment === '..') out.pop();
    else if (segment !== '.' && segment !== '') out.push(segment);
  }
  return out.join('/');
}

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** Block text without footnote markers. */
export function stripNoteMarkers(text: string): string {
  return text.replace(NOTE_MARKER, '');
}

export function chapterTitle(blocks: CleanBlock[], index: number): string {
  const heading = blocks.find((b): b is Extract<CleanBlock, { t: 'h' }> => b.t === 'h');
  return heading ? stripNoteMarkers(heading.s) : `الفصل ${index + 1}`;
}

/** Reads an EPUB's spine into plain-text chapters. Throws on a file that isn't a valid EPUB. */
export async function parseCleanEpub(file: Blob): Promise<CleanBook> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const container = await readText(zip, 'META-INF/container.xml');
  const opfPath = container
    ? new DOMParser().parseFromString(container, 'text/xml').querySelector('rootfile')?.getAttribute('full-path')
    : null;
  const opfText = opfPath ? await readText(zip, opfPath) : null;
  if (!opfPath || !opfText) throw new Error('This is not a valid EPUB file.');

  const opf = new DOMParser().parseFromString(opfText, 'text/xml');
  const base = dirOf(opfPath);
  const manifest = new Map<string, string>();
  opf.querySelectorAll('manifest > item').forEach((item) => {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href) manifest.set(id, href);
  });

  const chapters: CleanChapter[] = [];
  const otherFiles = new Map<string, Promise<Document | null>>();
  const loadDoc = (path: string) => {
    let doc = otherFiles.get(path);
    if (!doc) {
      doc = readText(zip, path).then((html) => (html ? new DOMParser().parseFromString(html, 'text/html') : null));
      otherFiles.set(path, doc);
    }
    return doc;
  };
  const spineRefs = Array.from(opf.querySelectorAll('spine > itemref'));
  for (let spineIndex = 0; spineIndex < spineRefs.length; spineIndex++) {
    const href = manifest.get(spineRefs[spineIndex].getAttribute('idref') ?? '');
    if (!href || !/\.(x?html?)$/i.test(href.split('#')[0])) continue;
    let path = href.split('#')[0];
    try {
      path = decodeURIComponent(path);
    } catch {
      // keep the raw path
    }
    const html = await readText(zip, normalizePath(base + path));
    if (!html) continue;
    const { blocks, notes } = extractChapter(html);
    if (!blocks.some((b) => b.t === 'p' || b.t === 'h')) continue;
    // Notes kept in another file (a shared endnotes section, typically).
    for (const note of notes) {
      if (note.text || note.href.startsWith('#')) continue;
      const [file, id] = note.href.split('#');
      const doc = await loadDoc(normalizePath(base + dirOf(path) + safeDecode(file)));
      if (doc) note.text = id ? noteText(doc, id) : clean(doc.body?.textContent ?? '');
    }
    chapters.push({
      title: chapterTitle(blocks, chapters.length),
      blocks,
      href: path,
      spineIndex,
      notes: notes.map(({ label, text }) => ({ label, text })),
    });
  }
  if (!chapters.length) throw new Error('No readable text was found in this book.');

  const title = opf.getElementsByTagNameNS('*', 'title')[0]?.textContent?.trim() ?? '';
  return { title, chapters };
}
