import type { BookVocabWord, VocabTier } from '../types';
import { TIER_LABELS } from './rarity';

const TIER_ORDER: VocabTier[] = ['beginner', 'intermediate', 'advanced', 'unlisted'];

/**
 * Builds a plain-text word list, grouped under tier headings, for whichever
 * words are passed in — the caller decides what "currently shown" means
 * (e.g. the panel's active tier filter, or the full set for an "export
 * everything" action), so this stays a pure formatting function.
 */
export function formatVocabularyExport(bookTitle: string, words: BookVocabWord[]): string {
  const byTier = new Map<VocabTier, BookVocabWord[]>();
  for (const w of words) {
    const list = byTier.get(w.rarity.tier) ?? [];
    list.push(w);
    byTier.set(w.rarity.tier, list);
  }

  const lines: string[] = [`${bookTitle} — Vocabulary`, ''];
  let wroteAny = false;
  for (const tier of TIER_ORDER) {
    const list = byTier.get(tier);
    if (!list || !list.length) continue;
    wroteAny = true;
    lines.push(`## ${TIER_LABELS[tier]}${tier === 'unlisted' ? ' (not in frequency list)' : ''}`, '');
    for (const w of list) {
      lines.push(`${w.word}\t(${w.count}×)`);
    }
    lines.push('');
  }
  if (!wroteAny) lines.push('(no words to export)');
  return lines.join('\n');
}

export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
