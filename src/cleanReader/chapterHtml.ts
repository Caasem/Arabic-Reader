import type { CleanChapter } from './parseCleanEpub';

const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

/** A chapter as escaped HTML (text is always escaped, so it is safe to inject). */
export function chapterHtml(chapter: CleanChapter): string {
  let blocks = chapter.blocks;
  let html = '';
  const first = blocks[0];
  if (first?.t === 'h') {
    html += `<h1 class="clean-reader__title">${escapeHtml(first.s)}</h1>`;
    blocks = blocks.slice(1);
  } else {
    html += `<h1 class="clean-reader__title">${escapeHtml(chapter.title)}</h1>`;
  }
  for (const b of blocks) {
    if (b.t === 'h') {
      const level = Math.min(b.l + 1, 3);
      html += `<h${level}>${escapeHtml(b.s)}</h${level}>`;
    } else if (b.t === 'p') html += `<p>${escapeHtml(b.s)}</p>`;
    else if (b.t === 'brk') html += '<div class="clean-reader__break">* * *</div>';
    else html += '<div class="clean-reader__gap"></div>';
  }
  return html;
}
