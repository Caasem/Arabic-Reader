import { useEffect, useRef, useState } from 'react';
import { dictionaryManager } from '../dictionary';
import { FloatingCard } from '../floatingCard';
import { getReaderMarks, subscribeReaderSelection, type MarkCapture } from '../readerChords';
import { isCleanLocation } from '../quietReader/location';
import type { BookMeta, VocabularyItem } from '../types';
import { combinedMeaning, entryMeaning, vocabularyService } from '../vocabulary/vocabularyService';

/** A selection this short is the word to ask about; a longer one is the sentence it came from. */
const WORD_MAX_CHARS = 40;
const WORD_MAX_WORDS = 3;

const isShort = (text: string) => text.length <= WORD_MAX_CHARS && text.split(/\s+/).filter(Boolean).length <= WORD_MAX_WORDS;

interface Form {
  front: string;
  back: string;
  sentence: string;
  root: string;
  pos: string;
}

const EMPTY: Form = { front: '', back: '', sentence: '', root: '', pos: '' };

/** What a selection fills in: a short one is the front, a long one is the sentence. */
function fromCapture(capture: MarkCapture): Partial<Form> {
  return isShort(capture.text) ? { front: capture.text, sentence: capture.sentence ?? '' } : { sentence: capture.text };
}

/** The Alt+F card: writes a flashcard of your own, and stays open so cards can be built from the page as you read. */
export function FlashCard({ book, onClose }: { book: BookMeta; onClose(): void }) {
  const marks = getReaderMarks();
  const [capture, setCapture] = useState<MarkCapture | null>(() => marks?.captureSelection() ?? null);
  const [form, setForm] = useState<Form>(() => {
    const first = marks?.captureSelection();
    return first ? { ...EMPTY, ...fromCapture(first) } : EMPTY;
  });
  const touched = useRef<Partial<Record<keyof Form, boolean>>>({});
  const [editing, setEditing] = useState<VocabularyItem | null>(null);
  const [duplicate, setDuplicate] = useState<VocabularyItem | null>(null);
  const [status, setStatus] = useState<'saved' | 'failed' | 'nomatch' | null>(null);
  const [filling, setFilling] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => (form.front ? backRef.current : frontRef.current)?.focus(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Selecting something in the book fills the fields you haven't typed in; clicking into this card clears the
  // selection, which must not lose it.
  useEffect(
    () =>
      subscribeReaderSelection(() => {
        const next = marks?.captureSelection();
        if (!next) return;
        setCapture(next);
        setStatus(null);
        const fill = fromCapture(next);
        setForm((f) => {
          const merged = { ...f };
          for (const key of Object.keys(fill) as (keyof Form)[]) if (!touched.current[key] && !editing) merged[key] = fill[key] ?? '';
          return merged;
        });
      }),
    [marks, editing]
  );

  // Is there already a card for this front?
  const front = form.front.trim();
  useEffect(() => {
    if (!front || editing) return void setDuplicate(null);
    let stale = false;
    const timer = window.setTimeout(() => {
      void vocabularyService.getForWord(book.id, front).then((items) => !stale && setDuplicate(items[0] ?? null));
    }, 250);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [front, book.id, editing]);

  function set(key: keyof Form, value: string) {
    touched.current[key] = true;
    setForm((f) => ({ ...f, [key]: value }));
    setStatus(null);
    setConfirmDiscard(false);
  }

  function edit(item: VocabularyItem) {
    setEditing(item);
    setDuplicate(null);
    setForm({ front: item.surfaceForm, back: item.meaning, sentence: item.sentence ?? '', root: item.root ?? '', pos: item.pos ?? '' });
    touched.current = { front: true, back: true, sentence: true, root: true, pos: true };
    backRef.current?.focus();
  }

  async function fillMeaning() {
    if (!front) return;
    setFilling(true);
    try {
      const result = await dictionaryManager.lookup(front);
      const entry = result.entries.find((e) => e.providerId === 'aramorph') ?? result.entries[0];
      if (!entry) return setStatus('nomatch');
      const meaning = result.entries.length > 1 ? combinedMeaning(result.entries.slice(0, 2)) : entryMeaning(entry);
      setForm((f) => ({
        ...f,
        back: meaning,
        root: f.root || (result.morphology?.[0]?.root ?? entry.root ?? ''),
        pos: f.pos || (entry.senses[0]?.pos ?? ''),
      }));
      touched.current.back = true;
      setStatus(null);
      backRef.current?.focus();
    } catch {
      setStatus('nomatch');
    } finally {
      setFilling(false);
    }
  }

  const canSave = !!front && !!form.back.trim();

  async function save() {
    if (!canSave) return;
    try {
      const sentence = form.sentence.trim() || undefined;
      const root = form.root.trim() || undefined;
      const pos = form.pos.trim() || undefined;
      if (editing) {
        await vocabularyService.updateVocabularyItem(editing, { surfaceForm: front, meaning: form.back.trim(), sentence, root, pos });
      } else {
        const place = capture ?? marks?.capturePage() ?? null;
        await vocabularyService.saveCustomCard({
          front,
          back: form.back.trim(),
          sentence,
          root,
          pos,
          book,
          chapterHref: place ? (isCleanLocation(place.location) ? place.location : place.chapterHref) : undefined,
          location: place?.location,
        });
      }
      marks?.wordSaved(front);
      setStatus('saved');
      setForm(EMPTY);
      touched.current = {};
      setCapture(null);
      setEditing(null);
      setDuplicate(null);
      setConfirmDiscard(false);
      frontRef.current?.focus();
    } catch {
      setStatus('failed');
    }
  }

  // Escape never throws away typed text without asking.
  const escapeRef = useRef<() => void>(() => {});
  useEffect(() => {
    escapeRef.current = () => {
      const dirty = Object.values(form).some((v) => v.trim()) && Object.values(touched.current).some(Boolean);
      if (dirty && !confirmDiscard) setConfirmDiscard(true);
      else onClose();
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && escapeRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onFieldKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void save();
    }
  };

  return (
    <FloatingCard
      label="Flashcard"
      keyHint="Alt F"
      posKey="flashCard.floatingPos"
      defaultPos={(width) => ({ x: window.innerWidth - width - 24, y: 150 })}
      onClose={onClose}
    >
      <div className="fcard__stack">
        <label className="fcard__field">
          Front
          <input
            ref={frontRef}
            className="fcard__input fcard__input--ar"
            dir="auto"
            placeholder="The word or phrase"
            value={form.front}
            onChange={(e) => set('front', e.target.value)}
            onKeyDown={onFieldKey}
          />
        </label>
        {duplicate && (
          <p className="fcard__hint">
            Already a card for this word.{' '}
            <button type="button" className="fcard__link" onClick={() => edit(duplicate)}>
              Edit it
            </button>
          </p>
        )}
        {editing && <p className="fcard__hint">Editing an existing card.</p>}
        <label className="fcard__field">
          Back
          <textarea
            ref={backRef}
            className="fcard__input"
            dir="auto"
            rows={3}
            placeholder="The meaning, or any answer"
            value={form.back}
            onChange={(e) => set('back', e.target.value)}
            onKeyDown={onFieldKey}
          />
        </label>
        <div className="fcard__row">
          <button type="button" className="fcard__btn" disabled={!front || filling} onClick={() => void fillMeaning()}>
            {filling ? 'Looking up…' : 'Fill meaning'}
          </button>
        </div>
        <label className="fcard__field">
          Sentence (optional)
          <textarea
            className="fcard__input"
            dir="auto"
            rows={2}
            value={form.sentence}
            onChange={(e) => set('sentence', e.target.value)}
            onKeyDown={onFieldKey}
          />
        </label>
        <div className="fcard__row">
          <label className="fcard__field fcard__grow">
            Root
            <input className="fcard__input" dir="auto" value={form.root} onChange={(e) => set('root', e.target.value)} onKeyDown={onFieldKey} />
          </label>
          <label className="fcard__field fcard__grow">
            Part of speech
            <input className="fcard__input" value={form.pos} onChange={(e) => set('pos', e.target.value)} onKeyDown={onFieldKey} />
          </label>
        </div>
        <div className="fcard__row">
          <span className="fcard__spacer" />
          <button type="button" className="fcard__btn fcard__btn--primary" disabled={!canSave} onClick={() => void save()}>
            {editing ? 'Update card' : 'Add card'}
          </button>
        </div>
        <p className={'fcard__hint' + (status === 'saved' ? ' fcard__hint--ok' : '')} role="status">
          {confirmDiscard
            ? 'Press Esc again to discard this card.'
            : status === 'saved'
              ? 'Card added. Select a word to start another.'
              : status === 'failed'
                ? 'Could not save the card.'
                : status === 'nomatch'
                  ? 'No dictionary entry found for that.'
                  : 'Ctrl+Enter saves. Alt+F or Esc closes.'}
        </p>
      </div>
    </FloatingCard>
  );
}
