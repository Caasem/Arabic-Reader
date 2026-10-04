import { NOTE_MARKER, type CleanChapter } from './parseCleanEpub';

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

interface Options {
  /** Render footnote markers as buttons (data-note = the note's index). Off: markers are dropped. */
  notes?: boolean;
}

/** A block's text with its footnote markers rendered (or dropped). */
function inlineHtml(text: string, chapter: CleanChapter, notes: boolean): string {
  return escapeHtml(text).replace(NOTE_MARKER, (_, index: string) => {
    if (!notes) return '';
    const label = escapeHtml(chapter.notes?.[Number(index)]?.label ?? String(Number(index) + 1));
    return `<sup class="clean-reader__noteref" data-no-wrap=""><button type="button" data-note="${index}" aria-label="Note ${label}">${label}</button></sup>`;
  });
}

/** A chapter as escaped HTML (text is always escaped, so it is safe to inject). */
export function chapterHtml(chapter: CleanChapter, { notes = false }: Options = {}): string {
  let blocks = chapter.blocks;
  let html = '';
  const first = blocks[0];
  if (first?.t === 'h') {
    html += `<h1 class="clean-reader__title">${inlineHtml(first.s, chapter, notes)}</h1>`;
    blocks = blocks.slice(1);
  } else {
    html += `<h1 class="clean-reader__title">${escapeHtml(chapter.title)}</h1>`;
  }
  for (const b of blocks) {
    if (b.t === 'h') {
      const level = Math.min(b.l + 1, 3);
      html += `<h${level}>${inlineHtml(b.s, chapter, notes)}</h${level}>`;
    } else if (b.t === 'p') html += `<p>${inlineHtml(b.s, chapter, notes)}</p>`;
    else if (b.t === 'brk') html += '<div class="clean-reader__break">* * *</div>';
    else html += '<div class="clean-reader__gap"></div>';
  }
  return html;
}

/**
 * The chapter's text exactly as the DOM from chapterHtml(chapter, { notes })
 * reports it in `textContent`, so a character offset found by searching this
 * string points at the same character in the rendered page.
 */
export function chapterText(chapter: CleanChapter, { notes = false }: Options = {}): string {
  const inline = (text: string) =>
    text.replace(NOTE_MARKER, (_, index: string) => (notes ? (chapter.notes?.[Number(index)]?.label ?? String(Number(index) + 1)) : ''));
  let blocks = chapter.blocks;
  let text = '';
  const first = blocks[0];
  if (first?.t === 'h') {
    text += inline(first.s);
    blocks = blocks.slice(1);
  } else {
    text += chapter.title;
  }
  for (const b of blocks) {
    if (b.t === 'h' || b.t === 'p') text += inline(b.s);
    else if (b.t === 'brk') text += '* * *';
  }
  return text;
}
