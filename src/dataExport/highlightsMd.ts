import type { Highlight } from '../types';

/** Markdown for reading: a heading per book, each highlight as a quote with its note under it. */
export function highlightsMarkdown(highlights: Highlight[]): string {
  const byBook = new Map<string, { title: string; items: Highlight[] }>();
  for (const h of highlights) {
    const entry = byBook.get(h.bookId) ?? { title: h.bookTitle || h.bookId, items: [] };
    entry.items.push(h);
    byBook.set(h.bookId, entry);
  }
  if (byBook.size === 0) return '# Highlights\n\nNo highlights yet.\n';
  const sections = [...byBook.values()]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map(({ title, items }) => {
      const lines = items
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((h) => {
          const where = h.chapterLabel ? ` (${h.chapterLabel})` : '';
          const quote = h.text.split(/\r?\n/).map((l) => `> ${l}`).join('\n');
          return `${quote}\n\n*${h.color}${where}*${h.note ? `\n\n**Note:** ${h.note.replace(/\r?\n/g, ' ')}` : ''}\n`;
        });
      return `## ${title.replace(/\r?\n/g, ' ')}\n\n${lines.join('\n')}`;
    });
  return `# Highlights\n\n${sections.join('\n')}`;
}
