import type { BackupData, BookMeta, DictionaryEntry, MasteryLevel, VocabularyItem, WordInstance } from '../types';
import { persistenceService } from '../persistence/db';
import { normalize } from '../reader/tokenizer/arabicTokenizer';
import { fsrs, createEmptyCard, Rating, State, type Card, type Grade } from 'ts-fsrs';

/**
 * FSRS (Free Spaced Repetition Scheduler) — the same algorithm Anki itself
 * defaults to as of Anki 23.10, replacing this app's original v0.5.0
 * Leitner-box scheduler. Default parameters (90% target retention) are
 * used rather than per-user-optimized ones — optimizing FSRS's ~19
 * weights against a specific person's review history is a real technique
 * but needs a meaningful volume of review logs to do well; the library's
 * published defaults are already tuned against a large aggregate dataset
 * and are what most apps ship with out of the box.
 */
const scheduler = fsrs();

/** All of one entry's senses, joined into a single display string -- the
 * unit both the per-entry "+" (DictionaryPopup) and the Vocabulary tab's
 * "switch to this definition" dropdown save/show. */
export function entryMeaning(entry: DictionaryEntry): string {
  return entry.senses.map((s) => s.gloss).join('; ');
}

/** Every entry's meaning joined together -- what a word's card shows when
 * it was saved "as a whole" (the popup's main Add button) or when a reader
 * switches the Vocabulary tab's dropdown back to "All definitions". */
export function combinedMeaning(entries: DictionaryEntry[]): string {
  return entries.map(entryMeaning).join(' | ');
}

export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy';
const GRADE_TO_RATING: Record<ReviewGrade, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

/** Converts this app's flattened VocabularyItem fields to/from ts-fsrs's
 * own Card shape — kept as one small pair of functions rather than
 * changing VocabularyItem's shape to nest a `Card` object, so the rest of
 * the app (export/import, Dexie indexing) doesn't need to know FSRS's
 * internal representation. */
function toFsrsCard(item: VocabularyItem): Card {
  return {
    due: new Date(item.fsrsDue),
    stability: item.fsrsStability,
    difficulty: item.fsrsDifficulty,
    elapsed_days: 0,
    scheduled_days: item.fsrsScheduledDays,
    learning_steps: item.fsrsLearningSteps,
    reps: item.fsrsReps,
    lapses: item.fsrsLapses,
    state: item.fsrsState as State,
    last_review: item.fsrsLastReview ? new Date(item.fsrsLastReview) : undefined,
  };
}

function fromFsrsCard(item: VocabularyItem, card: Card, now: number, grade: ReviewGrade): VocabularyItem {
  const mastery: MasteryLevel =
    card.state === State.New ? 'new' : card.state === State.Review && card.stability >= 90 ? 'mastered' : 'learning';
  return {
    ...item,
    fsrsDue: card.due.getTime(),
    fsrsStability: card.stability,
    fsrsDifficulty: card.difficulty,
    fsrsScheduledDays: card.scheduled_days,
    fsrsLearningSteps: card.learning_steps,
    fsrsReps: card.reps,
    fsrsLapses: card.lapses,
    fsrsState: card.state,
    fsrsLastReview: now,
    mastery,
    successfulRecalls: grade === 'again' ? item.successfulRecalls : item.successfulRecalls + 1,
    lastReviewedAt: now,
  };
}

/** A human-readable "due in ~X" label for the four grading buttons, e.g.
 * "10m", "3d", "2mo" — the standard Anki-style preview so a learner can
 * see what each grade actually commits them to before picking one. */
export function formatDueIn(dueMs: number, now: number = Date.now()): string {
  const diffMs = dueMs - now;
  if (diffMs <= 60_000) return '<1m';
  const minutes = diffMs / 60_000;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)}d`;
  const months = days / 30;
  if (months < 12) return `${Math.round(months)}mo`;
  return `${Math.round(days / 365)}y`;
}

/**
 * Tracks encounter/lookup counts for word instances (per book, keyed by
 * normalized surface form) and manages the saved-vocabulary list.
 *
 * Encounter vs. lookup is an intentional, load-bearing distinction:
 *  - recordEncounter() fires once per rendered section for each distinct
 *    word that appears in it (not once per DOM node) — "the learner was
 *    exposed to this word".
 *  - recordLookup() fires only when the learner actually opens the
 *    dictionary popup for a word — "the learner actively looked this up".
 */
export class VocabularyService {
  async recordEncounter(bookId: string, surfaceForm: string, chapterHref?: string): Promise<WordInstance> {
    const normalized = normalize(surfaceForm);
    const now = Date.now();
    const existing = await persistenceService.getWordInstance(bookId, normalized);
    const instance: WordInstance = existing
      ? { ...existing, encounterCount: existing.encounterCount + 1, lastSeenAt: now }
      : {
          surfaceForm,
          normalizedForm: normalized,
          bookId,
          chapterHref,
          encounterCount: 1,
          lookupCount: 0,
          firstSeenAt: now,
          lastSeenAt: now,
          saved: false,
        };
    await persistenceService.upsertWordInstance(instance);
    return instance;
  }

  /**
   * Batch form of recordEncounter — call once per rendered section with
   * every distinct word it contains, instead of once per word.
   *
   * A section commonly has a few hundred distinct words, and the original
   * per-word recordEncounter() did a `get` then a `put` (two IndexedDB
   * round-trips) for each one, all fired concurrently on every page turn —
   * hundreds of overlapping transactions competing for the main thread on
   * every single page turn or scroll, which is exactly the kind of thing
   * that shows up as general reading jank. This does the same read-merge-
   * write logic but as one bulk read and one bulk write.
   */
  async recordEncounters(bookId: string, surfaceForms: string[], chapterHref?: string): Promise<void> {
    if (surfaceForms.length === 0) return;
    const now = Date.now();
    // surfaceForms may contain forms that normalize to the same key
    // (rare, but tokenization can occasionally produce near-duplicates) —
    // dedupe on the normalized form so each key is merged/written once.
    const byNormalized = new Map<string, string>();
    for (const s of surfaceForms) byNormalized.set(normalize(s), s);
    const normalizedForms = Array.from(byNormalized.keys());

    const existingByForm = await persistenceService.getWordInstancesBulk(bookId, normalizedForms);
    const toWrite: WordInstance[] = normalizedForms.map((normalized) => {
      const surfaceForm = byNormalized.get(normalized)!;
      const existing = existingByForm.get(normalized);
      return existing
        ? { ...existing, encounterCount: existing.encounterCount + 1, lastSeenAt: now }
        : {
            surfaceForm,
            normalizedForm: normalized,
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
    const normalized = normalize(surfaceForm);
    const now = Date.now();
    const existing = await persistenceService.getWordInstance(bookId, normalized);
    const instance: WordInstance = existing
      ? {
          ...existing,
          lookupCount: existing.lookupCount + 1,
          lastLookupAt: now,
          firstLookupAt: existing.firstLookupAt ?? now,
          sentence: opts.sentence ?? existing.sentence,
          paragraph: existing.paragraph,
          location: opts.location ?? existing.location,
          lemma: opts.lemma ?? existing.lemma,
          root: opts.root ?? existing.root,
        }
      : {
          surfaceForm,
          normalizedForm: normalized,
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
    // A single entry (the per-entry "+" in DictionaryPopup, or any word that
    // only ever had one) just shows that entry's own meaning. More than one
    // -- the popup's main "+ Add to vocabulary" button, which saves every
    // entry the lookup found -- shows all of them joined, since there's no
    // way to know which one the reader actually meant; `selectedEntryIndex`
    // stays undefined for this "combined" case (see the Vocabulary tab's
    // dropdown, which lets a reader narrow it down later).
    const meaning = params.entries.length === 1 ? entryMeaning(params.entries[0]) : combinedMeaning(params.entries);
    const selectedEntryIndex = params.entries.length === 1 ? 0 : undefined;
    const now = Date.now();
    const freshCard = createEmptyCard(new Date(now));
    const item: VocabularyItem = {
      id: 'vocab_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      surfaceForm: params.surfaceForm,
      lemma: params.lemma,
      root: params.root,
      pos: params.pos,
      meaning,
      entries: params.entries,
      selectedEntryIndex,
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
      mastery: 'new' as MasteryLevel,
      successfulRecalls: 0,
      // A fresh FSRS card, due immediately so it shows up in the very next
      // review session rather than waiting for its first scheduled interval.
      fsrsDue: now,
      fsrsStability: freshCard.stability,
      fsrsDifficulty: freshCard.difficulty,
      fsrsScheduledDays: freshCard.scheduled_days,
      fsrsLearningSteps: freshCard.learning_steps,
      fsrsReps: freshCard.reps,
      fsrsLapses: freshCard.lapses,
      fsrsState: freshCard.state,
    };
    await persistenceService.saveVocabularyItem(item);
    if (params.wordInstance) {
      await persistenceService.upsertWordInstance({ ...params.wordInstance, saved: true });
    }
    return item;
  }

  async removeFromVocabulary(id: string): Promise<void> {
    await persistenceService.deleteVocabularyItem(id);
  }

  /** Patches a saved word's own editable fields (meaning / sentence — the
   * two a learner would reasonably want to correct or personalize after
   * saving — plus which entry it's currently showing) and persists the
   * result. Kept generic over `VocabularyItem` so it can't drift out of
   * sync with the type, but callers should really only ever pass
   * `meaning`/`sentence`/`selectedEntryIndex`/`root`/`pos`. */
  async updateVocabularyItem(
    item: VocabularyItem,
    patch: Partial<Pick<VocabularyItem, 'meaning' | 'sentence' | 'selectedEntryIndex' | 'root' | 'pos' | 'surfaceForm'>>
  ): Promise<VocabularyItem> {
    const updated = { ...item, ...patch };
    await persistenceService.saveVocabularyItem(updated);
    return updated;
  }

  /** Switches a saved word's shown definition to one specific entry
   * (`entryIndex` into `item.entries`), or back to every entry combined
   * (`entryIndex` omitted) -- the Vocabulary tab's "change definition"
   * dropdown for a word that has more than one distinct entry. */
  async selectVocabularyEntry(item: VocabularyItem, entryIndex?: number): Promise<VocabularyItem> {
    const entry = entryIndex !== undefined ? item.entries[entryIndex] : undefined;
    return this.updateVocabularyItem(item, {
      selectedEntryIndex: entryIndex,
      meaning: entry ? entryMeaning(entry) : combinedMeaning(item.entries),
      root: entry ? entry.root : item.entries.find((e) => e.root)?.root,
      pos: entry ? entry.senses[0]?.pos : undefined,
    });
  }

  /** Splits an "all definitions" card into one separate card per entry, so
   * each can be reviewed (and scheduled by FSRS) independently instead of
   * testing an ambiguous combined meaning. Does not touch or remove the
   * original card -- purely additive, per "add them all to the list". */
  async splitIntoSeparateCards(item: VocabularyItem): Promise<VocabularyItem[]> {
    const created: VocabularyItem[] = [];
    for (const entry of item.entries) {
      const now = Date.now();
      const freshCard = createEmptyCard(new Date(now));
      const copy: VocabularyItem = {
        ...item,
        id: 'vocab_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        entries: [entry],
        meaning: entryMeaning(entry),
        selectedEntryIndex: 0,
        root: entry.root,
        pos: entry.senses[0]?.pos,
        addedAt: now,
        mastery: 'new' as MasteryLevel,
        successfulRecalls: 0,
        lastReviewedAt: undefined,
        syncedToAnki: false,
        fsrsDue: now,
        fsrsStability: freshCard.stability,
        fsrsDifficulty: freshCard.difficulty,
        fsrsScheduledDays: freshCard.scheduled_days,
        fsrsLearningSteps: freshCard.learning_steps,
        fsrsReps: freshCard.reps,
        fsrsLapses: freshCard.lapses,
        fsrsState: freshCard.state,
      };
      await persistenceService.saveVocabularyItem(copy);
      created.push(copy);
    }
    return created;
  }

  async setMastery(item: VocabularyItem, mastery: MasteryLevel): Promise<VocabularyItem> {
    const updated = { ...item, mastery, lastReviewedAt: Date.now() };
    await persistenceService.saveVocabularyItem(updated);
    return updated;
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

  /** Every saved card for this exact word in this book -- a word can have
   * more than one (the popup's "all entries" card plus any per-entry ones),
   * so "un-save this word" (the popup's ✓ Vocabulary toggle) means removing
   * all of them, not picking one. */
  async getForWord(bookId: string, surfaceForm: string): Promise<VocabularyItem[]> {
    const items = await persistenceService.getVocabularyForBook(bookId);
    return items.filter((i) => i.surfaceForm === surfaceForm);
  }

  /** Un-saves a word entirely (every card for it in this book) -- the
   * popup's ✓ Vocabulary → Save Vocabulary toggle. */
  async removeAllForWord(bookId: string, surfaceForm: string): Promise<void> {
    const items = await this.getForWord(bookId, surfaceForm);
    await Promise.all(items.map((i) => persistenceService.deleteVocabularyItem(i.id)));
  }

  // -------------------------------------------------------------------
  // Spaced-repetition review
  // -------------------------------------------------------------------

  async getDueForReview(): Promise<VocabularyItem[]> {
    return persistenceService.getDueVocabulary(Date.now());
  }

  async countDueForReview(): Promise<number> {
    return (await this.getDueForReview()).length;
  }

  /** Computes what each of the four grades (Again/Hard/Good/Easy) would
   * schedule this card to, without committing anything — used to show the
   * "10m / 1d / 3d / 7d"-style preview on the Review screen's buttons, the
   * same way Anki does, so a learner can see what each grade actually
   * commits them to before picking one. */
  previewGrades(item: VocabularyItem, now: number = Date.now()): Record<ReviewGrade, { dueAt: number }> {
    const recordLog = scheduler.repeat(toFsrsCard(item), new Date(now));
    return {
      again: { dueAt: recordLog[Rating.Again].card.due.getTime() },
      hard: { dueAt: recordLog[Rating.Hard].card.due.getTime() },
      good: { dueAt: recordLog[Rating.Good].card.due.getTime() },
      easy: { dueAt: recordLog[Rating.Easy].card.due.getTime() },
    };
  }

  /** Records the outcome of one review card and reschedules it via FSRS. */
  async recordReviewResult(item: VocabularyItem, grade: ReviewGrade): Promise<VocabularyItem> {
    const now = Date.now();
    const recordLog = scheduler.repeat(toFsrsCard(item), new Date(now));
    const resultCard = recordLog[GRADE_TO_RATING[grade]].card;
    const updated = fromFsrsCard(item, resultCard, now, grade);
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
