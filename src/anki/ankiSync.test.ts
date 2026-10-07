import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { basicFields, describeReport, syncVocabularyToAnki, type AnkiLink } from './ankiSync';
import { NOTE_TYPE, sentenceWithWord, toFields, fieldsHash } from './noteType';
import { rememberAnkiDeletes } from './deletions';
import type { VocabularyItem } from '../types';

const item = (id: string, surfaceForm: string, meaning: string, extra: Partial<VocabularyItem> = {}) =>
  ({ id, surfaceForm, meaning, entries: [], bookId: 'b', bookTitle: 'Book', ...extra }) as VocabularyItem;

interface FakeNote {
  id: number;
  deck: string;
  model: string;
  fields: Record<string, string>;
  tags: string[];
}

/** An in-memory AnkiConnect: decks, note types and notes, answering the actions the sync uses. */
function fakeAnki(options: { canChangeModel?: boolean } = {}) {
  const state = { decks: ['Default'], models: { Basic: ['Front', 'Back'] } as Record<string, string[]>, notes: [] as FakeNote[], nextId: 1000, calls: [] as string[] };
  const handle = (action: string, params: Record<string, any>): unknown => {
    state.calls.push(action);
    switch (action) {
      case 'version':
        return 6;
      case 'deckNames':
        return state.decks;
      case 'createDeck':
        state.decks.push(params.deck);
        return 1;
      case 'modelNames':
        return Object.keys(state.models);
      case 'modelFieldNames':
        return state.models[params.modelName];
      case 'createModel':
        state.models[params.modelName] = [...params.inOrderFields];
        return {};
      case 'modelFieldAdd':
      case 'updateModelStyling':
      case 'updateModelTemplates':
        return null;
      case 'addNotes':
        return params.notes.map((n: any) => {
          const note = { id: state.nextId++, deck: n.deckName, model: n.modelName, fields: n.fields, tags: n.tags };
          state.notes.push(note);
          return note.id;
        });
      case 'findNotes': {
        const front = /Front:"(.*)"$/.exec(params.query)?.[1];
        return state.notes.filter((n) => n.model === 'Basic' && n.fields.Front === front).map((n) => n.id);
      }
      case 'updateNoteFields': {
        const note = state.notes.find((n) => n.id === params.note.id);
        if (!note) throw new Error('Note was not found: ' + params.note.id);
        note.fields = { ...note.fields, ...params.note.fields };
        return null;
      }
      case 'updateNoteModel': {
        if (!options.canChangeModel) throw new Error('unsupported action');
        const note = state.notes.find((n) => n.id === params.note.id)!;
        note.model = params.note.modelName;
        note.fields = params.note.fields;
        return null;
      }
      case 'deleteNotes':
        state.notes = state.notes.filter((n) => !params.notes.includes(n.id));
        return null;
      default:
        throw new Error(`unexpected action ${action}`);
    }
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const { action, params } = JSON.parse(String(init.body));
      if (action === 'multi') {
        const result = params.actions.map((a: any) => {
          try {
            return { result: handle(a.action, a.params ?? {}), error: null };
          } catch (e) {
            return { result: null, error: (e as Error).message };
          }
        });
        return new Response(JSON.stringify({ result, error: null }));
      }
      try {
        return new Response(JSON.stringify({ result: handle(action, params ?? {}), error: null }));
      } catch (e) {
        return new Response(JSON.stringify({ result: null, error: (e as Error).message }));
      }
    })
  );
  return state;
}

/** Applies saved links back onto the items, as the vocabulary service would. */
function store(items: VocabularyItem[]) {
  return async (target: VocabularyItem, link: AnkiLink) => {
    const i = items.findIndex((x) => x.id === target.id);
    items[i] = { ...items[i], ...link };
  };
}

const memory = new Map<string, string>();
beforeEach(() => {
  memory.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, v),
    removeItem: (k: string) => void memory.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('noteType', () => {
  it('bolds the saved word in its sentence, ignoring diacritics', () => {
    expect(sentenceWithWord('ذَهَبَ الوَلَدُ إلى المَدرَسةِ', 'الولد')).toBe('ذَهَبَ <b>الوَلَدُ</b> إلى المَدرَسةِ');
    expect(sentenceWithWord('لا كلمة هنا', 'كتاب')).toBe('لا كلمة هنا');
    expect(sentenceWithWord(undefined, 'كتاب')).toBe('');
  });

  it('fills every field, escaping HTML', () => {
    const f = toFields(
      item('v1', 'كتب', 'wrote <v.>', {
        root: 'كتب',
        sentence: 'كتب الطالب',
        entries: [{ providerId: 'aramorph', providerName: 'English', headword: 'كَتَبَ', senses: [{ gloss: 'wrote', pos: 'verb' }] }],
      })
    );
    expect(f).toMatchObject({ Word: 'كتب', Vowelled: 'كَتَبَ', Meaning: 'wrote &lt;v.&gt;', Root: 'كتب', POS: 'verb', Sentence: '<b>كتب</b> الطالب', Source: 'English', ReaderId: 'v1' });
  });
});

describe('syncVocabularyToAnki', () => {
  it('creates the note type and deck, then adds new cards and links them', async () => {
    const anki = fakeAnki();
    const items = [item('a', 'واحد', 'one'), item('b', 'اثنان', 'two')];
    const report = await syncVocabularyToAnki({ deck: 'Arabic', items, removeDeleted: false, save: store(items) });
    expect(report).toMatchObject({ added: 2, updated: 0, unchanged: 0, failed: 0 });
    expect(anki.models[NOTE_TYPE]).toContain('Sentence');
    expect(anki.decks).toContain('Arabic');
    expect(anki.notes.map((n) => [n.deck, n.model, n.fields.Word])).toEqual([
      ['Arabic', NOTE_TYPE, 'واحد'],
      ['Arabic', NOTE_TYPE, 'اثنان'],
    ]);
    expect(items.every((i) => i.ankiNoteId && i.ankiHash && i.syncedToAnki)).toBe(true);
  });

  it('updates only cards whose fields changed', async () => {
    const anki = fakeAnki();
    const items = [item('a', 'واحد', 'one'), item('b', 'اثنان', 'two')];
    await syncVocabularyToAnki({ deck: 'Arabic', items, removeDeleted: false, save: store(items) });
    items[1] = { ...items[1], meaning: 'two (edited)', fsrsReps: 3 };
    items[0] = { ...items[0], fsrsReps: 5 }; // A review alone changes nothing Anki shows.
    const report = await syncVocabularyToAnki({ deck: 'Arabic', items, removeDeleted: false, save: store(items) });
    expect(report).toMatchObject({ added: 0, updated: 1, unchanged: 1 });
    expect(anki.notes.find((n) => n.fields.Word === 'اثنان')!.fields.Meaning).toBe('two (edited)');
  });

  it('sends a card again when its note was deleted in Anki', async () => {
    const anki = fakeAnki();
    const items = [item('a', 'واحد', 'one')];
    await syncVocabularyToAnki({ deck: 'Arabic', items, removeDeleted: false, save: store(items) });
    anki.notes = [];
    items[0] = { ...items[0], meaning: 'one!' };
    const report = await syncVocabularyToAnki({ deck: 'Arabic', items, removeDeleted: false, save: store(items) });
    expect(report).toMatchObject({ added: 1, updated: 0 });
    expect(anki.notes).toHaveLength(1);
  });

  it('finds notes sent by older versions and converts them when AnkiConnect allows', async () => {
    const anki = fakeAnki({ canChangeModel: true });
    const old = item('a', 'واحد', 'one', { syncedToAnki: true });
    anki.notes.push({ id: 7, deck: 'Arabic', model: 'Basic', fields: basicFields(old), tags: ['arabic-reader'] });
    anki.decks.push('Arabic');
    const items = [old];
    const report = await syncVocabularyToAnki({ deck: 'Arabic', items, removeDeleted: false, save: store(items) });
    expect(report).toMatchObject({ added: 0, relinked: 1, keptBasic: 0 });
    expect(items[0]).toMatchObject({ ankiNoteId: 7, ankiModel: undefined });
    expect(anki.notes).toHaveLength(1);
    expect(anki.notes[0].model).toBe(NOTE_TYPE);
  });

  it('keeps an older note as Basic when it cannot be converted, and still updates it', async () => {
    const anki = fakeAnki({ canChangeModel: false });
    const old = item('a', 'واحد', 'one', { syncedToAnki: true });
    anki.notes.push({ id: 7, deck: 'Arabic', model: 'Basic', fields: basicFields(old), tags: ['arabic-reader'] });
    anki.decks.push('Arabic');
    const items = [old];
    const first = await syncVocabularyToAnki({ deck: 'Arabic', items, removeDeleted: false, save: store(items) });
    expect(first).toMatchObject({ relinked: 1, keptBasic: 1 });
    expect(items[0]).toMatchObject({ ankiNoteId: 7, ankiModel: 'Basic' });
    items[0] = { ...items[0], meaning: 'one (edited)' };
    await syncVocabularyToAnki({ deck: 'Arabic', items, removeDeleted: false, save: store(items) });
    expect(anki.notes[0].fields.Back).toBe('one (edited)');
    expect(anki.notes).toHaveLength(1);
  });

  it('deletes notes of removed cards only when asked, and forgets them either way', async () => {
    const anki = fakeAnki();
    const items = [item('a', 'واحد', 'one'), item('b', 'اثنان', 'two')];
    await syncVocabularyToAnki({ deck: 'Arabic', items, removeDeleted: false, save: store(items) });
    rememberAnkiDeletes([items[1]]);
    const kept = await syncVocabularyToAnki({ deck: 'Arabic', items: [items[0]], removeDeleted: false, save: store(items) });
    expect(kept.removed).toBe(0);
    expect(anki.notes).toHaveLength(2);

    rememberAnkiDeletes([items[1]]);
    const removed = await syncVocabularyToAnki({ deck: 'Arabic', items: [items[0]], removeDeleted: true, save: store(items) });
    expect(removed.removed).toBe(1);
    expect(anki.notes.map((n) => n.fields.Word)).toEqual(['واحد']);
    expect(memory.get('anki.pendingDeletes')).toBe('[]');
  });

  it('describes a report in one line', () => {
    expect(describeReport({ added: 2, updated: 1, removed: 0, unchanged: 5, relinked: 0, keptBasic: 0, failed: 0 }, 'Arabic')).toBe(
      'Added 2, updated 1, unchanged 5 in the "Arabic" deck.'
    );
    expect(fieldsHash(toFields(item('a', 'x', 'y')))).toMatch(/^[0-9a-f]{8}$/);
  });
});
