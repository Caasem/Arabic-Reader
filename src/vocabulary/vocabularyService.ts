import { Rating } from 'ts-fsrs';
import type { BackupData, BookMeta, DictionaryEntry, VocabularyItem, WordInstance } from '../types';
import { persistenceService } from '../persistence/db';
import { normalize } from '../reader/tokenizer/arabicTokenizer';
import { newId } from '../utils/id';
import { applyReview, freshFsrsFields, GRADE_TO_RATING, scheduler, toFsrsCard, type ReviewGrade } from './fsrs';

export { formatDueIn, type ReviewGrade } from './fsrs';

/** All of one entry's senses joined into one display string. */
export function entryMeaning(entry: DictionaryEntry): string {
  return entry.senses.map((s) => s.gloss).join('; ');
}

/** Every entry's meaning joined -- the "all definitions" card. */
export function combinedMeaning(entries: DictionaryEntry[]): string {
  return entries.map(entryMeaning).join(' | ');
}

/**
 * Word-instance tracking (per book, keyed by normalized surface form) and the
 * saved-vocabulary list. Encounter vs. lookup is deliberate:
 *  - an encounter is recorded once per rendered section for each distinct
 *    word in it ("the learner was exposed to this word");
 *  - a lookup only when the learner opens the dictionary for a word.
 */
export class VocabularyService {
  /** One bulk read and one bulk write for every distinct word in a section. */
  async recordEncounters(bookId: string, surfaceForms: string[], chapterHref?: string): Promise<void> {
    if (surfaceForms.length === 0) return;
    const now = Date.now();
    const byNormalized = new Map<string, string>();
    for (const s of surfaceForms) byNormalized.set(normalize(s), s);
    const normalizedForms = Array.from(byNormalized.keys());

    const existingByForm = await persistenceService.getWordInstancesBulk(bookId, normalizedForms);
    const toWrite: WordInstance[] = normalizedForms.map((normalizedForm) => {
      const existing = existingByForm.get(normalizedForm);
      return existing
        ? { ...existing, encounterCount: existing.encounterCount + 1, lastSeenAt: now }
        : {
            surfaceForm: byNormalized.get(normalizedForm)!,
            normalizedForm,
            bookId,
            chapterHref,
            encounterCount: 1,
            lookupCount: 0,
            firstSeenAt: now,
            lastSeenAt: now,
            saved: false,
          };
    });
    await persistenceService.upsertWordInstancesBulk(toWrite);
  }

  async recordLookup(
    bookId: string,
    surfaceForm: string,
    opts: { chapterHref?: string; sentence?: string; location?: string; lemma?: string; root?: string }
  ): Promise<WordInstance> {
    const normalizedForm = normalize(surfaceForm);
    const now = Date.now();
    const existing = await persistenceService.getWordInstance(bookId, normalizedForm);
    const instance: WordInstance = existing
      ? {
          ...existing,
          lookupCount: existing.lookupCount + 1,
          lastLookupAt: now,
          firstLookupAt: existing.firstLookupAt ?? now,
          sentence: opts.sentence ?? existing.sentence,
          location: opts.location ?? existing.location,
          lemma: opts.lemma ?? existing.lemma,
          root: opts.root ?? existing.root,
        }
      : {
          surfaceForm,
          normalizedForm,
          bookId,
          chapterHref: opts.chapterHref,
          sentence: opts.sentence,
          location: opts.location,
          lemma: opts.lemma,
          root: opts.root,
          encounterCount: 1,
          lookupCount: 1,
          firstSeenAt: now,
          lastSeenAt: now,
          firstLookupAt: now,
          lastLookupAt: now,
          saved: false,
        };
    await persistenceService.upsertWordInstance(instance);
    return instance;
  }

  /** A single entry shows that entry's meaning; several (the popup's main
   * save) show them all joined, with `selectedEntryIndex` left undefined so
   * the Vocabulary tab can narrow it down later. */
  async saveToVocabulary(params: {
    surfaceForm: string;
    entries: DictionaryEntry[];
    lemma?: string;
    root?: string;
    pos?: string;
    book: BookMeta;
    chapterHref?: string;
    sentence?: string;
    location?: string;
    wordInstance?: WordInstance;
  }): Promise<VocabularyItem> {
    const single = params.entries.length === 1;
    const now = Date.now();
    const item: VocabularyItem = {
      id: newId('vocab'),
      surfaceForm: params.surfaceForm,
      lemma: params.lemma,
      root: params.root,
      pos: params.pos,
      meaning: single ? entryMeaning(params.entries[0]) : combinedMeaning(params.entries),
      entries: params.entries,
      selectedEntryIndex: single ? 0 : undefined,
      bookId: params.book.id,
      bookTitle: params.book.title,
      chapterHref: params.chapterHref,
      sentence: params.sentence ?? params.wordInstance?.sentence,
      location: params.location,
      addedAt: now,
      firstLookupAt: params.wordInstance?.firstLookupAt,
      lastLookupAt: params.wordInstance?.lastLookupAt,
      lookupCount: params.wordInstance?.lookupCount ?? 1,
      encounterCount: params.wordInstance?.encounterCount ?? 1,
      mastery: 'new',
      successfulRecalls: 0,
      ...freshFsrsFields(now),
    };
    await persistenceService.saveVocabularyItem(item);
    if (params.wordInstance) {
      await persistenceService.upsertWordInstance({ ...params.wordInstance, saved: true });
    } else {
      await persistenceService.updateWordInstance(item.bookId, normalize(item.surfaceForm), { saved: true });
    }
    return item;
  }

  async removeFromVocabulary(id: string): Promise<void> {
    const item = await persistenceService.getVocabularyItem(id);
    await persistenceService.deleteVocabularyItem(id);
    if (item) await this.syncSavedFlag(item.bookId, item.surfaceForm);
  }

  /** Patches a saved word's editable fields. */
  async updateVocabularyItem(
    item: VocabularyItem,
    patch: Partial<Pick<VocabularyItem, 'meaning' | 'sentence' | 'selectedEntryIndex' | 'root' | 'pos' | 'surfaceForm'>>
  ): Promise<VocabularyItem> {
    const updated = { ...item, ...patch };
    await persistenceService.saveVocabularyItem(updated);
    if (updated.surfaceForm !== item.surfaceForm) {
      await this.syncSavedFlag(item.bookId, item.surfaceForm);
      await this.syncSavedFlag(updated.bookId, updated.surfaceForm);
    }
    return updated;
  }

  /** Shows one specific entry (`entryIndex`), or every entry combined. */
  async selectVocabularyEntry(item: VocabularyItem, entryIndex?: number): Promise<VocabularyItem> {
    const entry = entryIndex !== undefined ? item.entries[entryIndex] : undefined;
    return this.updateVocabularyItem(item, {
      selectedEntryIndex: entryIndex,
      meaning: entry ? entryMeaning(entry) : combinedMeaning(item.entries),
      root: entry ? entry.root : item.entries.find((e) => e.root)?.root,
      pos: entry ? entry.senses[0]?.pos : undefined,
    });
  }

  /** Adds one independently-scheduled card per entry; leaves the original. */
  async splitIntoSeparateCards(item: VocabularyItem): Promise<VocabularyItem[]> {
    const created: VocabularyItem[] = [];
    for (const entry of item.entries) {
      const now = Date.now();
      const copy: VocabularyItem = {
        ...item,
        id: newId('vocab'),
        entries: [entry],
        meaning: entryMeaning(entry),
        selectedEntryIndex: 0,
        root: entry.root,
        pos: entry.senses[0]?.pos,
        addedAt: now,
        mastery: 'new',
        successfulRecalls: 0,
        lastReviewedAt: undefined,
        fsrsLastReview: undefined,
        syncedToAnki: false,
        ...freshFsrsFields(now),
      };
      await persistenceService.saveVocabularyItem(copy);
      created.push(copy);
    }
    return created;
  }

  async markSyncedToAnki(item: VocabularyItem): Promise<VocabularyItem> {
    const updated = { ...item, syncedToAnki: true };
    await persistenceService.saveVocabularyItem(updated);
    return updated;
  }

  async list(): Promise<VocabularyItem[]> {
    return persistenceService.getVocabulary();
  }

  async listForBook(bookId: string): Promise<VocabularyItem[]> {
    return persistenceService.getVocabularyForBook(bookId);
  }

  async isSaved(bookId: string, surfaceForm: string): Promise<boolean> {
    return persistenceService.isSaved(surfaceForm, bookId);
  }

  /** Every card for this word in this book (a word can have several). */
  async getForWord(bookId: string, surfaceForm: string): Promise<VocabularyItem[]> {
    return persistenceService.getVocabularyForWord(bookId, surfaceForm);
  }

  /** Un-saves a word entirely: every card for it in this book. */
  async removeAllForWord(bookId: string, surfaceForm: string): Promise<void> {
    const items = await this.getForWord(bookId, surfaceForm);
    await Promise.all(items.map((i) => persistenceService.deleteVocabularyItem(i.id)));
    await this.syncSavedFlag(bookId, surfaceForm);
  }

  /** Keeps WordInstance.saved (which feeds the Dashboard's known-word rate)
   * in step with whether any card for the word still exists. */
  private async syncSavedFlag(bookId: string, surfaceForm: string): Promise<void> {
    const saved = await persistenceService.isSaved(surfaceForm, bookId);
    await persistenceService.updateWordInstance(bookId, normalize(surfaceForm), { saved });
  }

  // -------------------------------------------------------------------
  // Spaced-repetition review
  // -------------------------------------------------------------------

  async getDueForReview(): Promise<VocabularyItem[]> {
    return persistenceService.getDueVocabulary(Date.now());
  }

  /** What each grade would schedule, without committing anything. */
  previewGrades(item: VocabularyItem, now: number = Date.now()): Record<ReviewGrade, { dueAt: number }> {
    const log = scheduler.repeat(toFsrsCard(item), new Date(now));
    return {
      again: { dueAt: log[Rating.Again].card.due.getTime() },
      hard: { dueAt: log[Rating.Hard].card.due.getTime() },
      good: { dueAt: log[Rating.Good].card.due.getTime() },
      easy: { dueAt: log[Rating.Easy].card.due.getTime() },
    };
  }

  async recordReviewResult(item: VocabularyItem, grade: ReviewGrade): Promise<VocabularyItem> {
    const now = Date.now();
    const log = scheduler.repeat(toFsrsCard(item), new Date(now));
    const updated = applyReview(item, log[GRADE_TO_RATING[grade]].card, now, grade);
    await persistenceService.saveVocabularyItem(updated);
    return updated;
  }

  // -------------------------------------------------------------------
  // Backup / restore
  // -------------------------------------------------------------------

  async exportBackup(): Promise<BackupData> {
    return persistenceService.exportBackup();
  }

  async importBackup(data: BackupData): Promise<{ vocabulary: number; wordInstances: number; highlights: number }> {
    return persistenceService.importBackup(data);
  }
}

export const vocabularyService = new VocabularyService();
