import { escapeXml, type Chapter } from './epubWriter';

/** Decoded text plus a warning when some bytes could not be read. */
export interface DecodedText {
  text: string;
  encoding: 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1256';
  lossy: boolean;
}

/**
 * Decodes a plain-text file: UTF-8 (with or without a byte-order mark), UTF-16 by its mark, and
 * Windows-1256 (the old Arabic Windows code page) when the bytes are not valid UTF-8.
 */
export function decodeText(bytes: Uint8Array): DecodedText {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le', lossy: false };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be', lossy: false };
  const body = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(body), encoding: 'utf-8', lossy: false };
  } catch {
    // Not UTF-8. Arabic text from older Windows tools is usually Windows-1256.
  }
  try {
    const text = new TextDecoder('windows-1256').decode(body);
    if (arabicShare(text) > 0.3) return { text, encoding: 'windows-1256', lossy: false };
  } catch {
    // This runtime lacks the legacy decoder.
  }
  return { text: new TextDecoder('utf-8').decode(body), encoding: 'utf-8', lossy: true };
}

/** Share of letters that are Arabic (0..1); spaces, digits and punctuation are not counted. */
export function arabicShare(text: string): number {
  const sample = text.slice(0, 20000);
  const letters = sample.match(/\p{L}/gu)?.length ?? 0;
  if (!letters) return 0;
  const arabic = sample.match(/[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g)?.length ?? 0;
  return arabic / letters;
}

const HEADING_WORDS = /^\s*(?:الباب|الفصل|باب|فصل|كتاب|المقدمة|مقدمة|الخاتمة|خاتمة|تمهيد|chapter|part|introduction|conclusion)(?:\s|[:\-–—.]|$)/i;
const MAX_HEADING_CHARS = 60;
const WORDS_PER_PART = 5000;

/**
 * Splits plain text into chapters. A line starts a chapter when it begins with a heading word
 * (الباب, الفصل, باب, فصل, كتاب, المقدمة, الخاتمة, Chapter …) or is a short line standing alone
 * between blank lines and followed by text. With fewer than two headings found, the text is split
 * every 5,000 words into "Part 1", "Part 2" … instead.
 */
export function splitTextChapters(text: string, fallbackTitle: string): { title: string; chapters: { title: string; paragraphs: string[] }[] } {
  const normalised = text.replace(/\r\n?/g, '\n').replace(/ /g, ' ');
  const blocks = normalised
    .split(/\n\s*\n/)
    .map((b) => b.replace(/^\n+|\n+$/g, ''))
    .filter((b) => b.trim());

  // The first short line is the title.
  let title = fallbackTitle;
  if (blocks.length && !blocks[0].includes('\n') && blocks[0].trim().length <= 120) {
    title = blocks[0].trim();
    blocks.shift();
  }

  const isHeading = (block: string, next: string | undefined) => {
    if (block.includes('\n')) return HEADING_WORDS.test(block.split('\n')[0]) && block.split('\n')[0].length <= MAX_HEADING_CHARS;
    const line = block.trim();
    if (HEADING_WORDS.test(line) && line.length <= MAX_HEADING_CHARS * 2) return true;
    return line.length <= MAX_HEADING_CHARS && !/[.،؛:!?؟]$/.test(line) && !!next && next.trim().length > line.length * 2;
  };

  const headingCount = blocks.filter((b, i) => isHeading(b, blocks[i + 1])).length;
  const chapters: { title: string; paragraphs: string[] }[] = [];
  if (headingCount >= 2) {
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (isHeading(block, blocks[i + 1])) {
        const [first, ...rest] = block.split('\n');
        chapters.push({ title: first.trim(), paragraphs: rest.length ? [rest.join('\n')] : [] });
      } else {
        if (!chapters.length) chapters.push({ title, paragraphs: [] });
        chapters[chapters.length - 1].paragraphs.push(block);
      }
    }
  } else {
    let words = 0;
    for (const block of blocks) {
      if (!chapters.length || words >= WORDS_PER_PART) {
        chapters.push({ title: `Part ${chapters.length + 1}`, paragraphs: [] });
        words = 0;
      }
      chapters[chapters.length - 1].paragraphs.push(block);
      words += block.split(/\s+/).length;
    }
    if (chapters.length === 1) chapters[0].title = title;
  }
  return { title, chapters: chapters.filter((c) => c.paragraphs.length || c.title) };
}

/** Paragraphs as XHTML; single line breaks inside a paragraph are kept (poetry, chains of narration). */
export function paragraphsToHtml(paragraphs: string[]): string {
  return paragraphs.map((p) => `<p>${p.split('\n').map((line) => escapeXml(line.trim())).join('<br/>')}</p>`).join('\n');
}

/** A whole TXT file → chapters ready for the EPUB writer. */
export function textToChapters(text: string, fallbackTitle: string): { title: string; chapters: Chapter[] } {
  const { title, chapters } = splitTextChapters(text, fallbackTitle);
  return {
    title,
    chapters: chapters.map((c) => ({ title: c.title, html: `<h2>${escapeXml(c.title)}</h2>\n${paragraphsToHtml(c.paragraphs)}` })),
  };
}
