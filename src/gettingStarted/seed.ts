import { db } from '../persistence/schema';
import type { SeedCounts } from './progress';

/** Counts what the person has already done, from the databases. Best effort: a failure counts as nothing done. */
export async function loadSeedCounts(): Promise<SeedCounts> {
  const [vocab, highlights] = await Promise.all([db.vocabulary.toArray(), db.highlights.toArray()]);
  const counts: SeedCounts = {
    savedWords: vocab.filter((v) => !v.custom).length,
    notes: highlights.filter((h) => !!h.note?.trim()).length,
    customCards: vocab.filter((v) => v.custom && !v.sketch).length,
    deskItems: 0,
    drawings: 0,
    drawingsElsewhere: 0,
  };
  try {
    const { readAll } = await import('../annotate/inkStore');
    const rows = await readAll('strokes');
    const sketches = (await readAll('sketches')) as import('../annotate/types').Sketch[];
    const pageStrokes = rows as import('../annotate/types').InkStroke[];
    const filled = sketches.filter((s) => s.strokes.length || s.nodes.length);
    counts.drawings += pageStrokes.length + filled.length;
    counts.drawingsElsewhere += pageStrokes.filter((s) => s.key.startsWith('pdf:')).length + filled.filter((s) => s.key.startsWith('pdf:')).length;
  } catch {
    // no ink database yet
  }
  try {
    const { readAllItems } = await import('../studyDesk/deskStore');
    const items = await readAllItems();
    counts.deskItems = items.length;
    const inked = items.filter((i) => i.ink);
    counts.drawings += inked.length;
    counts.drawingsElsewhere += inked.filter((i) => i.source?.bookId && i.source.bookId !== i.pin?.bookId).length;
  } catch {
    // no desk database yet
  }
  return counts;
}
