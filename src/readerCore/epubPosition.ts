import { spineIndexOfCfi } from '../reader/epub/cfi';
import { readChapterHtml, type CleanChapter } from './parseCleanEpub';

/**
 * Where an epub CFI (a bookmark or reading position saved by the Original layout, before 0.96.0) falls in a clean
 * chapter's text. The CFI's path is walked in the chapter's own XHTML, the letters and digits before that point are
 * counted, and the same count is found in the clean text. Whitespace, punctuation and the clean text's breaks don't
 * move it, so it lands on the same word, give or take a dropped image caption.
 */

/** The point a CFI's in-document path (after the "!") names, or null when the path doesn't fit this document. */
export function pointForCfi(doc: Document, cfi: string): { node: Node; offset: number } | null {
  const inner = /!([^)]*)\)?$/.exec(cfi)?.[1];
  if (!inner) return null;
  // A range (parent,start,end): the start is the parent path plus the start path.
  const [parent, start = ''] = inner.split(',');
  const steps = (parent + start).split('/').filter(Boolean);
  let node: Node = doc.documentElement;
  let offset = 0;
  for (let i = 0; i < steps.length; i++) {
    const m = /^(\d+)(?:\[([^\]]*)\])?(?::(\d+))?/.exec(steps[i]);
    if (!m) return null;
    const n = Number(m[1]);
    const elements = Array.from(node.childNodes).filter((c): c is Element => c.nodeType === Node.ELEMENT_NODE);
    if (n % 2 === 0) {
      const next: Element | null = elements[n / 2 - 1] ?? (m[2] ? doc.getElementById(m[2]) : null);
      if (!next) return null;
      node = next;
    } else {
      // An odd step is the text between element children: (n - 1) / 2 elements come before it.
      if ((n - 1) / 2 > elements.length) return null;
      const before = elements[(n - 1) / 2 - 1] ?? null;
      let run: Node | null = before ? before.nextSibling : node.firstChild;
      let rest = Number(m[3] ?? 0);
      let text: Node | null = null;
      for (; run && run.nodeType !== Node.ELEMENT_NODE; run = run.nextSibling) {
        if (run.nodeType !== Node.TEXT_NODE) continue;
        text = run;
        const length = run.textContent?.length ?? 0;
        if (rest <= length) break;
        rest -= length;
      }
      if (!text) return null;
      node = text;
      offset = Math.min(rest, text.textContent?.length ?? 0);
      break;
    }
  }
  return { node, offset };
}

const COUNTED = /[\p{L}\p{N}]/u;

function countLetters(text: string): number {
  let count = 0;
  for (const ch of text) if (COUNTED.test(ch)) count++;
  return count;
}

/** The offset in `text` with `letters` counted letters before it, starting at `from`. */
function offsetAfterLetters(text: string, letters: number, from: number): number {
  let seen = 0;
  for (let i = from; i < text.length; i++) {
    if (COUNTED.test(text[i])) {
      if (seen === letters) return i;
      seen++;
    }
  }
  return text.length;
}

/**
 * The offset in a clean chapter's text (`text`, as bookModel builds it) of the point a CFI names in the chapter's
 * XHTML (`html`), or null when the CFI doesn't point into this chapter's file or its path doesn't resolve.
 */
export function cleanOffsetForCfi(chapter: CleanChapter, text: string, html: string, cfi: string): number | null {
  if (chapter.spineIndex === undefined || spineIndexOfCfi(cfi) !== chapter.spineIndex) return null;
  const doc = new DOMParser().parseFromString(html, 'application/xhtml+xml');
  const parsed = doc.getElementsByTagName('parsererror').length ? new DOMParser().parseFromString(html, 'text/html') : doc;
  const point = pointForCfi(parsed, cfi);
  const body = parsed.body ?? parsed.getElementsByTagName('body')[0];
  if (!point || !body || !body.contains(point.node)) return null;
  const range = parsed.createRange();
  range.setStart(body, 0);
  range.setEnd(point.node, point.offset);
  // A chapter without a heading starts with its made-up title, which isn't in the file.
  const from = chapter.blocks[0]?.t === 'h' ? 0 : chapter.title.length;
  return offsetAfterLetters(text, countLetters(range.toString()), from);
}

/** `cleanOffsetForCfi`, reading the chapter's file from the book. Null when it can't be placed (or read). */
export async function epubOffsetInChapter(file: Blob | null, chapter: CleanChapter, text: string, cfi: string | undefined): Promise<number | null> {
  if (!file || !cfi || !chapter.href || spineIndexOfCfi(cfi) !== chapter.spineIndex) return null;
  try {
    const html = await readChapterHtml(file, chapter.href);
    return html ? cleanOffsetForCfi(chapter, text, html, cfi) : null;
  } catch {
    return null;
  }
}
