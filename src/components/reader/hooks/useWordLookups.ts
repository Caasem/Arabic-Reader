import { useCallback, useRef, useState, type RefObject } from 'react';
import type { BookMeta, WordOcrInfo, DictionaryEntry, DictionaryLookupResult, ReaderPreferences, VocabularyItem, WordInstance } from '../../../types';
import { lookupWord, saveLookup } from '../../../vocabulary/lookupWord';
import { vocabularyService } from '../../../vocabulary';
import { senseText } from '../../../dictionary/senseText';
import { forgetWordPicks, rankByPicks, recordEditSave, recordEntrySave, recordSelectionSave } from '../../../sensePicks';
import type { ReadingSessionTracker } from '../../../reader/session';
import type { TouchWordAction, WordTarget } from '../../../reader/wordInteraction/sectionInteractions';
import type { HostRect } from '../../../reader/wordInteraction/rectInHost';
import type { SavedWords } from './useSavedWords';
import { useTimedMessage } from './useTimedMessage';

export interface LookupState {
  word: string;
  sectionHref?: string;
  x: number;
  y: number;
  /** The tapped word's rect, so the popup can avoid covering it. */
  wordRect?: HostRect;
  result: DictionaryLookupResult | null;
  instance: WordInstance | null;
  saved: boolean;
  loading: boolean;
  /** For a word read from a scanned page: how sure the read is, and the likely corrections. */
  ocr?: WordOcrInfo;
}

export interface TouchToast {
  message: string;
  undo?: { itemId: string; word: string };
}

interface Options {
  book: BookMeta;
  trackerRef: RefObject<ReadingSessionTracker | null>;
  savedWords: SavedWords;
  prefsRef: RefObject<ReaderPreferences>;
  /** Runs as any lookup starts (e.g. to dismiss the hover preview). */
  onLookupStart(): void;
  /** The reader corrected the headword of a word read from a scan (so the fix can be remembered). */
  onWordCorrected?(ocr: WordOcrInfo, word: string): void;
}

function pendingState(target: WordTarget): LookupState {
  return {
    word: target.word,
    sectionHref: target.sectionHref,
    x: target.x,
    y: target.y,
    wordRect: target.rect,
    ocr: target.ocr,
    result: null,
    instance: null,
    saved: false,
    loading: true,
  };
}

/**
 * Everything a word tap can lead to: the full dictionary popup, the compact
 * bubble, quick-save, the edit modal, the quick-add shortcut, and saving or
 * un-saving -- with the book text's saved-word coloring kept in step.
 */
export function useWordLookups(options: Options) {
  const { book, trackerRef, savedWords, prefsRef, onLookupStart } = options;
  const [popup, setPopup] = useState<LookupState | null>(null);
  const [bubble, setBubble] = useState<LookupState | null>(null);
  const [editing, setEditing] = useState<LookupState | null>(null);
  const quickAddToast = useTimedMessage<string>(1800);
  const touchToast = useTimedMessage<TouchToast>(3000);
  // The latest resolved lookup, kept after its popup closes, for quick-add.
  const lastLookupRef = useRef<LookupState | null>(null);
  // Bumped when a popup/bubble opens or closes, so a slow lookup can neither
  // overwrite a newer one nor reopen a dismissed one.
  const popupTokenRef = useRef(0);
  const bubbleTokenRef = useRef(0);

  const markSaved = useCallback(
    (word: string, saved: boolean) => {
      savedWords.setSaved(word, saved);
      const update = (state: LookupState | null) => (state && state.word === word ? { ...state, saved } : state);
      setPopup(update);
      setBubble(update);
      lastLookupRef.current = update(lastLookupRef.current);
    },
    [savedWords]
  );

  const resolve = async (target: WordTarget): Promise<LookupState> => {
    const lookup = await lookupWord(book.id, target.word, { chapterHref: target.sectionHref, sentence: target.sentence });
    // Entries the reader saved for this word in this book come first (src/sensePicks).
    const result = prefsRef.current.savedEntriesFirst ? await rankByPicks(book, target.word, lookup.result) : lookup.result;
    return { ...pendingState(target), result, instance: lookup.instance, saved: lookup.saved, loading: false };
  };

  /** Every entry by default; `entry` (optionally trimmed to `gloss`) saves just that one. */
  const save = (state: LookupState, entry?: DictionaryEntry, gloss?: string): Promise<VocabularyItem | undefined> => {
    if (!state.result) return Promise.resolve(undefined);
    const entries = entry && [gloss === undefined ? entry : { ...entry, senses: [{ gloss }] }];
    return saveLookup(
      book,
      { word: state.word, result: state.result, instance: state.instance },
      { entries, describedBy: entry, chapterHref: state.sectionHref }
    );
  };

  async function openPopup(target: WordTarget) {
    onLookupStart();
    trackerRef.current?.recordLookup();
    const token = ++popupTokenRef.current;
    setPopup(pendingState(target));
    const resolved = await resolve(target);
    if (token !== popupTokenRef.current) return;
    setPopup(resolved);
    lastLookupRef.current = resolved;
  }

  function closePopup() {
    popupTokenRef.current++;
    setPopup(null);
  }

  /**
   * The reader corrected the popup's headword (a misread scan, a typo, another form): looks the new word
   * up in the same popup, in the same place, with the same sentence.
   */
  async function editPopupWord(next: string) {
    const current = popup;
    const word = next.trim();
    if (!current || !word || word === current.word) return;
    const ocr = current.ocr ? { ...current.ocr, suspect: false, candidates: [], corrected: true } : undefined;
    const target = { word, sectionHref: current.sectionHref ?? '', x: current.x, y: current.y, rect: current.wordRect, sentence: current.instance?.sentence, ocr } as WordTarget;
    if (current.ocr) options.onWordCorrected?.(current.ocr, word);
    const token = ++popupTokenRef.current;
    setPopup(pendingState(target));
    const resolved = await resolve(target);
    if (token !== popupTokenRef.current) return;
    setPopup(resolved);
    lastLookupRef.current = resolved;
  }

  async function openBubble(target: WordTarget) {
    onLookupStart();
    trackerRef.current?.recordLookup();
    const token = ++bubbleTokenRef.current;
    setBubble(pendingState(target));
    const resolved = await resolve(target);
    if (token !== bubbleTokenRef.current) return;
    setBubble(resolved);
  }

  function closeBubble() {
    bubbleTokenRef.current++;
    setBubble(null);
  }

  /** Saves straight to vocabulary with just a toast -- no popup or bubble. */
  async function quickSave(target: WordTarget) {
    trackerRef.current?.recordLookup();
    const resolved = await resolve(target);
    if (resolved.saved) {
      touchToast.show({ message: `"${target.word}" is already in your vocabulary` });
      return;
    }
    if (!resolved.result?.entries.length) {
      touchToast.show({ message: `No dictionary entry found for "${target.word}"` });
      return;
    }
    const item = await save(resolved);
    markSaved(target.word, true);
    if (item) touchToast.show({ message: `✓ Saved "${target.word}"`, undo: { itemId: item.id, word: target.word } });
  }

  return {
    popup,
    bubble,
    editing,
    quickAddToast: quickAddToast.message,
    touchToast: touchToast.message,

    openPopup,
    closePopup,
    editPopupWord,
    closeBubble,
    closeAll() {
      closePopup();
      closeBubble();
    },

    runTouchAction(action: TouchWordAction, target: WordTarget) {
      if (action === 'bubble') void openBubble(target);
      else if (action === 'openDictionary') void openPopup(target);
      else void quickSave(target);
    },

    async undoQuickSave() {
      const undo = touchToast.message?.undo;
      if (!undo) return;
      touchToast.clear();
      await vocabularyService.removeFromVocabulary(undo.itemId);
      markSaved(undo.word, await vocabularyService.isSaved(book.id, undo.word));
    },

    /** The popup's main button: saves every entry, or removes every card for the word. */
    async togglePopupSave() {
      const current = popup;
      if (!current?.result) return;
      if (current.saved) {
        await vocabularyService.removeAllForWord(book.id, current.word);
        void forgetWordPicks(book, current.word, current.result);
        markSaved(current.word, false);
      } else {
        await save(current);
        markSaved(current.word, true);
      }
    },

    /** Saves one entry as its own card; returns the card's id so the popup's "+" can undo it. */
    async savePopupEntry(entry: DictionaryEntry): Promise<string | null> {
      if (!popup) return null;
      const item = await save(popup, entry);
      void recordEntrySave(book, popup.word, popup.result, entry);
      markSaved(popup.word, true);
      return item?.id ?? null;
    },

    /** The popup's "+" pressed again: removes just that entry's card. */
    async unsavePopupEntry(itemId: string) {
      const word = popup?.word;
      await vocabularyService.removeFromVocabulary(itemId);
      if (word) markSaved(word, await vocabularyService.isSaved(book.id, word));
    },

    /** Saves several entries (e.g. one dictionary's whole section) as one card. */
    async savePopupEntries(entries: DictionaryEntry[]) {
      if (!popup?.result || !entries.length) return;
      await saveLookup(
        book,
        { word: popup.word, result: popup.result, instance: popup.instance },
        { entries, describedBy: entries[0], chapterHref: popup.sectionHref }
      );
      markSaved(popup.word, true);
    },

    /** Saves only the selected part of a long entry as the card's definition. */
    async savePopupSelection(entry: DictionaryEntry, selectedText: string) {
      if (!popup) return;
      await save(popup, entry, selectedText);
      void recordSelectionSave(book, popup.word, popup.result, entry, selectedText);
      markSaved(popup.word, true);
    },

    async saveBubble() {
      if (!bubble?.result || bubble.saved) return;
      await save(bubble);
      markSaved(bubble.word, true);
    },

    expandBubble() {
      if (!bubble) return;
      popupTokenRef.current++;
      setPopup(bubble);
      lastLookupRef.current = bubble;
      closeBubble();
    },

    startEditing() {
      setEditing(popup);
    },

    cancelEditing() {
      setEditing(null);
    },

    /** Edits the word's card, creating the "all entries" card first if it has none. */
    async saveEdit(patch: { meaning: string; sentence: string | undefined; surfaceForm: string }) {
      const target = editing;
      if (!target) return;
      let item: VocabularyItem | undefined;
      // What the edit box started with: the card's own meaning, or the first meaning the app offered.
      let prefilled = '';
      if (target.saved) {
        const existing = await vocabularyService.getForWord(book.id, target.word);
        item = existing.find((i) => i.selectedEntryIndex === undefined) ?? existing[0];
        prefilled = item?.meaning ?? '';
      } else {
        const first = target.result?.entries[0]?.senses[0];
        prefilled = first ? senseText(first) : '';
        item = await save(target);
      }
      if (item) await vocabularyService.updateVocabularyItem(item, patch);
      void recordEditSave(book, target.word, target.result, prefilled, patch.meaning);
      markSaved(target.word, await vocabularyService.isSaved(book.id, target.word));
      if (patch.surfaceForm !== target.word) savedWords.setSaved(patch.surfaceForm, true);
      setEditing(null);
    },

    /**
     * Space with the popup (or bubble) open saves the word, like Save Vocabulary, but never un-saves.
     * Returns true when it took the key, so the reader skips its own Space handling (page turn).
     */
    handleSpaceSave(e: KeyboardEvent): boolean {
      if (!prefsRef.current.spaceSavesWord || e.code !== 'Space' || e.repeat) return false;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;
      // Typing, or a focused button (Space activates it as usual).
      const target = e.target as Element | null;
      if (target?.closest?.('input, textarea, select, button, [role="button"], [contenteditable="true"], [contenteditable=""]')) return false;
      const current = popup ?? bubble;
      if (!current || editing) return false;
      e.preventDefault();
      if (current.loading) {
        touchToast.show({ message: `Still looking up "${current.word}"…` });
        return true;
      }
      if (current.saved) {
        touchToast.show({ message: `"${current.word}" is already in your vocabulary` });
        return true;
      }
      if (!current.result?.entries.length) {
        touchToast.show({ message: 'No dictionary entry to save for this word' });
        return true;
      }
      void save(current).then(
        (item) => {
          markSaved(current.word, true);
          if (item) touchToast.show({ message: `✓ Saved "${current.word}"`, undo: { itemId: item.id, word: current.word } });
        },
        () => touchToast.show({ message: `Could not save "${current.word}"` })
      );
      return true;
    },

    /** Ctrl+Shift+A (opt-in): saves the most recently looked-up word. */
    async handleQuickAddKey(e: KeyboardEvent) {
      if (!prefsRef.current.quickAddShortcutEnabled || !(e.ctrlKey && e.shiftKey && e.code === 'KeyA')) return;
      e.preventDefault();
      const target = lastLookupRef.current;
      if (!target || target.loading) return quickAddToast.show('No word looked up yet — click a word first');
      if (target.saved) return quickAddToast.show(`"${target.word}" is already in your vocabulary`);
      if (!target.result?.entries.length) return quickAddToast.show('No dictionary entry to save for this word');
      await save(target);
      markSaved(target.word, true);
      quickAddToast.show(`"${target.word}" added to vocabulary`);
    },
  };
}
