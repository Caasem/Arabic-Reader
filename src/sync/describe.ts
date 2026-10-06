/**
 * A short, readable summary of a synced record, for the Sync activity screen.
 * Pure. Works from the stored payload, so it never needs the record to exist.
 */

export interface RecordSummary {
  /** What it is, e.g. the word or the book title. */
  title: string;
  /** The part that differs between versions, e.g. the meaning or the note. */
  detail?: string;
}

type Payload = Record<string, unknown>;

const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const clip = (s: string, max = 90): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

export const TABLE_LABELS: Record<string, string> = {
  vocabulary: 'Word',
  highlights: 'Highlight',
  bookmarks: 'Bookmark',
  books: 'Book',
  positions: 'Reading position',
  speedReaderPositions: 'Speed Reader position',
  preferences: 'Settings',
  readingSessions: 'Reading session',
  speedReaderSessions: 'Speed Reader session',
  pomodoroSessions: 'Focus session',
};

export function describeRecord(table: string, payload: unknown): RecordSummary {
  const p = (payload && typeof payload === 'object' ? payload : {}) as Payload;
  const pct = (v: unknown) => (typeof v === 'number' ? `${Math.round(v * 100)}%` : '');

  switch (table) {
    case 'vocabulary':
      return { title: text(p.surfaceForm) || 'A word', detail: clip(text(p.meaning)) || undefined };
    case 'highlights':
      return { title: clip(text(p.text)) || 'A highlight', detail: text(p.note) ? `Note: ${clip(text(p.note))}` : undefined };
    case 'bookmarks':
      return { title: text(p.bookTitle) || 'A bookmark', detail: text(p.locationLabel) || undefined };
    case 'books':
      return { title: text(p.title) || 'A book', detail: text(p.author) || undefined };
    case 'positions':
      return { title: 'Where you stopped reading', detail: [pct(p.percent), text(p.chapterLabel)].filter(Boolean).join(' · ') || undefined };
    case 'speedReaderPositions':
      return { title: 'Speed Reader position', detail: typeof p.globalIndex === 'number' ? `Word ${p.globalIndex}` : undefined };
    case 'preferences':
      return { title: 'Your reading settings' };
    default:
      return { title: text(p.bookTitle) || TABLE_LABELS[table] || 'A change' };
  }
}
