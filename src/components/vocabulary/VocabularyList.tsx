import { useEffect, useMemo, useState } from 'react';
import { vocabularyService, entryMeaning } from '../../vocabulary/vocabularyService';
import { BackupControls } from '../shared/BackupControls';
import { IconSearch, IconTrash, IconEdit, IconCheck, IconClose } from '../shared/icons';
import type { VocabularyItem } from '../../types';
import './VocabularyList.css';

interface EditDraft {
  meaning: string;
  sentence: string;
}

export function VocabularyList() {
  const [items, setItems] = useState<VocabularyItem[] | null>(null);
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);

  useEffect(() => {
    vocabularyService.list().then(setItems);
  }, []);

  const filtered = useMemo(() => {
    if (!items) return null;
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      [item.surfaceForm, item.meaning, item.sentence, item.bookTitle, item.lemma, item.root]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q))
    );
  }, [items, query]);

  function startEdit(item: VocabularyItem) {
    setEditingId(item.id);
    setDraft({ meaning: item.meaning, sentence: item.sentence ?? '' });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  async function saveEdit(item: VocabularyItem) {
    if (!draft) return;
    const updated = await vocabularyService.updateVocabularyItem(item, {
      meaning: draft.meaning.trim(),
      sentence: draft.sentence.trim() || undefined,
    });
    setItems((prev) => prev?.map((i) => (i.id === updated.id ? updated : i)) ?? prev);
    setEditingId(null);
    setDraft(null);
  }

  async function handleRemove(id: string) {
    await vocabularyService.removeFromVocabulary(id);
    setItems((prev) => prev?.filter((i) => i.id !== id) ?? prev);
    if (editingId === id) cancelEdit();
  }

  /** The "which definition" dropdown, shown only for a word saved with more
   * than one distinct entry -- either narrows the card down to one specific
   * entry, or back to every entry combined ("All definitions"). */
  async function handleSelectEntry(item: VocabularyItem, value: string) {
    const entryIndex = value === 'all' ? undefined : Number(value);
    const updated = await vocabularyService.selectVocabularyEntry(item, entryIndex);
    setItems((prev) => prev?.map((i) => (i.id === updated.id ? updated : i)) ?? prev);
  }

  /** "Add them all to the list" -- materializes every entry on this card as
   * its own separate, independently-reviewable card. Purely additive: the
   * original combined (or single-entry) card is left exactly as it was. */
  async function handleSplitAll(item: VocabularyItem) {
    const created = await vocabularyService.splitIntoSeparateCards(item);
    setItems((prev) => (prev ? [...created, ...prev] : prev));
  }

  return (
    <div className="vocab">
      <header className="vocab__header">
        <div className="vocab__header-row">
          <div>
            <h1>Vocabulary</h1>
            <p className="vocab__subtitle">Words you've chosen to learn, saved from your reading.</p>
          </div>
          <BackupControls compact />
        </div>

        {items !== null && items.length > 0 && (
          <div className="vocab__search">
            <IconSearch size={15} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search saved words, meanings, sentences…"
              aria-label="Search vocabulary"
            />
            {query && (
              <button className="vocab__search-clear" onClick={() => setQuery('')} aria-label="Clear search">
                <IconClose size={12} />
              </button>
            )}
          </div>
        )}
      </header>

      {items === null ? (
        <div className="vocab__empty">Loading…</div>
      ) : items.length === 0 ? (
        <div className="vocab__empty">
          <p>No saved words yet.</p>
          <p className="vocab__empty-sub">Tap a word while reading, then “Add to vocabulary” to build your list here.</p>
        </div>
      ) : filtered && filtered.length === 0 ? (
        <div className="vocab__empty">
          <p>No words match “{query}”.</p>
        </div>
      ) : (
        <div className="vocab__list">
          {filtered!.map((item) => {
            const isEditing = editingId === item.id;
            return (
              <div className="vocab-card" key={item.id}>
                <div className="vocab-card__top">
                  <div className="vocab-card__word">{item.surfaceForm}</div>
                  <div className="vocab-card__actions">
                    {!isEditing && (
                      <button className="vocab-card__icon-btn" onClick={() => startEdit(item)} aria-label="Edit" title="Edit">
                        <IconEdit size={14} />
                      </button>
                    )}
                    <button
                      className="vocab-card__icon-btn vocab-card__icon-btn--danger"
                      onClick={() => handleRemove(item.id)}
                      aria-label="Remove from vocabulary"
                      title="Remove"
                    >
                      <IconTrash size={14} />
                    </button>
                  </div>
                </div>

                {isEditing && draft ? (
                  <div className="vocab-card__edit">
                    <input
                      className="vocab-card__edit-meaning"
                      value={draft.meaning}
                      onChange={(e) => setDraft({ ...draft, meaning: e.target.value })}
                      placeholder="Meaning"
                      dir="ltr"
                      autoFocus
                    />
                    <textarea
                      className="vocab-card__edit-sentence"
                      value={draft.sentence}
                      onChange={(e) => setDraft({ ...draft, sentence: e.target.value })}
                      placeholder="Sentence it appeared in (optional)"
                      rows={2}
                    />
                    <div className="vocab-card__edit-actions">
                      <button className="vocab-card__edit-save" onClick={() => saveEdit(item)}>
                        <IconCheck size={12} /> Save
                      </button>
                      <button className="vocab-card__edit-cancel" onClick={cancelEdit}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="vocab-card__meaning">{item.meaning}</div>
                    {item.sentence && <div className="vocab-card__sentence">“{item.sentence}”</div>}
                    {item.entries.length > 1 && (
                      <div className="vocab-card__definitions">
                        <select
                          className="vocab-card__definitions-select"
                          value={item.selectedEntryIndex ?? 'all'}
                          onChange={(e) => handleSelectEntry(item, e.target.value)}
                          aria-label="Which definition to show"
                        >
                          <option value="all">All definitions ({item.entries.length})</option>
                          {item.entries.map((entry, i) => (
                            <option key={i} value={i}>
                              {entry.headword} — {entryMeaning(entry).slice(0, 40)}
                            </option>
                          ))}
                        </select>
                        <button className="vocab-card__definitions-split" onClick={() => handleSplitAll(item)}>
                          Add them all as separate cards
                        </button>
                      </div>
                    )}
                  </>
                )}

                <div className="vocab-card__meta">
                  <span>{item.bookTitle}</span>
                  <span className="vocab-card__dot">·</span>
                  <span className="vocab-card__mastery">{item.mastery}</span>
                </div>
                <div className="vocab-card__stats">
                  {item.encounterCount} encounter{item.encounterCount === 1 ? '' : 's'} · {item.lookupCount} lookup
                  {item.lookupCount === 1 ? '' : 's'}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
