import { useCallback, useRef, useState, type RefObject } from 'react';
import type { BookMeta, DictionaryEntry, DictionaryLookupResult, ReaderPreferences, VocabularyItem, WordInstance } from '../../../types';
import { lookupWord, saveLookup } from '../../../vocabulary/lookupWord';
import { vocabularyService } from '../../../vocabulary';
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
}

function pendingState(target: WordTarget): LookupState {
  return {
    word: target.word,
    sectionHref: target.sectionHref,
    x: target.x,
    y: target.y,
    wordRect: target.rect,
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
export function useWordLookups({ book, trackerRef, savedWords, prefsRef, onLookupStart }: Options) {
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
    return { ...pendingState(target), result: lookup.result, instance: lookup.instance, saved: lookup.saved, loading: false };
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
        markSaved(current.word, false);
      } else {
        await save(current);
        markSaved(current.word, true);
      }
    },

    async savePopupEntry(entry: DictionaryEntry) {
      if (!popup) return;
      await save(popup, entry);
      markSaved(popup.word, true);
    },

    /** Saves only the selected part of a long entry as the card's definition. */
    async savePopupSelection(entry: DictionaryEntry, selectedText: string) {
      if (!popup) return;
      await save(popup, entry, selectedText);
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
      if (target.saved) {
        const existing = await vocabularyService.getForWord(book.id, target.word);
        item = existing.find((i) => i.selectedEntryIndex === undefined) ?? existing[0];
      } else {
        item = await save(target);
      }
      if (item) await vocabularyService.updateVocabularyItem(item, patch);
      markSaved(target.word, await vocabularyService.isSaved(book.id, target.word));
      if (patch.surfaceForm !== target.word) savedWords.setSaved(patch.surfaceForm, true);
      setEditing(null);
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
