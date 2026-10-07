import type { VocabularyItem } from '../types';

/** Written first so spreadsheets read the file as UTF-8 (Arabic would otherwise turn to garbage). */
const BOM = '﻿';

/**
 * One CSV field. Quotes when it holds a comma, quote or line break. A field a spreadsheet would run as a formula
 * (starting with = + - @ or a tab) gets a leading apostrophe, so a saved sentence cannot execute when opened.
 */
export function csvField(value: string | number | undefined): string {
  let text = value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const day = (ms: number | undefined) => (typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : '');

export const VOCABULARY_COLUMNS = ['word', 'meaning', 'root', 'lemma', 'sentence', 'book', 'added', 'mastery', 'due'] as const;

export function vocabularyCsv(items: VocabularyItem[]): string {
  const rows = items.map((v) =>
    [v.surfaceForm, v.meaning, v.root, v.lemma, v.sentence, v.bookTitle, day(v.addedAt), v.mastery, day(v.fsrsDue)].map(csvField).join(','),
  );
  return BOM + [VOCABULARY_COLUMNS.join(','), ...rows].join('\r\n') + '\r\n';
}
