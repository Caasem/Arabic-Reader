import JSZip from 'jszip';

export type CleanBlock =
  | { t: 'p'; s: string }
  | { t: 'h'; l: number; s: string }
  | { t: 'brk' }
  | { t: 'gap' };

export interface CleanChapter {
  title: string;
  blocks: CleanBlock[];
}

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
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks: CleanBlock[] = [];
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
    if (tag === 'a' && /noteref/.test(el.getAttribute('epub:type') ?? '')) return;
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
  return result;
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

export function chapterTitle(blocks: CleanBlock[], index: number): string {
  const heading = blocks.find((b): b is Extract<CleanBlock, { t: 'h' }> => b.t === 'h');
  return heading ? heading.s : `الفصل ${index + 1}`;
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
  for (const ref of Array.from(opf.querySelectorAll('spine > itemref'))) {
    const href = manifest.get(ref.getAttribute('idref') ?? '');
    if (!href || !/\.(x?html?)$/i.test(href.split('#')[0])) continue;
    let path = href.split('#')[0];
    try {
      path = decodeURIComponent(path);
    } catch {
      // keep the raw path
    }
    const html = await readText(zip, normalizePath(base + path));
    if (!html) continue;
    const blocks = extractBlocks(html);
    if (blocks.some((b) => b.t === 'p' || b.t === 'h')) {
      chapters.push({ title: chapterTitle(blocks, chapters.length), blocks });
    }
  }
  if (!chapters.length) throw new Error('No readable text was found in this book.');

  const title = opf.getElementsByTagNameNS('*', 'title')[0]?.textContent?.trim() ?? '';
  return { title, chapters };
}
