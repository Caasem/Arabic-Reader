import { marked } from 'marked';
import type { Chapter } from './epubWriter';
import { bodyToXhtml, splitAtHeadings } from './html';

/** `title:` and `author:` from a leading `---` front-matter block, and the text after it. */
export function readFrontMatter(text: string): { title?: string; author?: string; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { body: text };
  const field = (name: string) => new RegExp(`^${name}:\\s*["']?(.+?)["']?\\s*$`, 'mi').exec(match[1])?.[1];
  return { title: field('title'), author: field('author'), body: text.slice(match[0].length) };
}

/**
 * Markdown → chapters: `#` and `##` headings start chapters (and make the table of contents);
 * emphasis, lists, quotes, tables and links are kept. Images are dropped (local paths can't be
 * resolved and remote ones are never fetched); the count is reported as a warning.
 */
export function markdownToChapters(text: string, fallbackTitle: string): { title: string; author?: string; chapters: Chapter[]; droppedImages: number } {
  const front = readFrontMatter(text);
  const html = marked.parse(front.body, { async: false, gfm: true }) as string;
  const doc = new DOMParser().parseFromString(`<!DOCTYPE html><html><body>${html}</body></html>`, 'text/html');
  const firstHeading = doc.querySelector('h1')?.textContent?.trim();
  const title = front.title || firstHeading || fallbackTitle;
  let droppedImages = 0;
  const chapters = splitAtHeadings(doc, title).map((part) => {
    const heading = part.querySelector('h1, h2')?.textContent?.trim();
    const { html: body, droppedImages: dropped } = bodyToXhtml(part);
    droppedImages += dropped;
    return { title: heading || title, html: body };
  });
  return { title, author: front.author, chapters, droppedImages };
}
