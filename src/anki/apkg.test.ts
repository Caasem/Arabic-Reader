import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import { buildApkg } from './apkg';
import { NOTE_TYPE, NOTE_TYPE_ID } from './noteType';
import type { VocabularyItem } from '../types';

const require = createRequire(import.meta.url);
const wasmFile = readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'));
const wasmBinary = wasmFile.buffer.slice(wasmFile.byteOffset, wasmFile.byteOffset + wasmFile.byteLength) as ArrayBuffer;

const item = (id: string, surfaceForm: string, meaning: string) =>
  ({ id, surfaceForm, meaning, entries: [], bookId: 'b', bookTitle: 'Book', addedAt: 1_700_000_000_000 }) as unknown as VocabularyItem;

describe('buildApkg', () => {
  it('writes a schema-11 collection with the note type, the deck, and one note and card per word', async () => {
    const SQL = await initSqlJs({ wasmBinary });
    const blob = await buildApkg(SQL, [item('v1', 'كتاب', 'book'), item('v2', 'قلم', 'pen')], 'Arabic Vocabulary');
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(await zip.file('media')!.async('string')).toBe('{}');
    const db = new SQL.Database(await zip.file('collection.anki2')!.async('uint8array'));

    const [col] = db.exec('SELECT ver, models, decks FROM col')[0].values;
    expect(col[0]).toBe(11);
    const models = JSON.parse(col[1] as string);
    expect(models[NOTE_TYPE_ID].name).toBe(NOTE_TYPE);
    expect(models[NOTE_TYPE_ID].flds.map((f: { name: string }) => f.name)).toContain('Sentence');
    const decks = Object.values(JSON.parse(col[2] as string)) as { name: string; id: number }[];
    const deck = decks.find((d) => d.name === 'Arabic Vocabulary')!;
    expect(deck).toBeTruthy();

    const notes = db.exec('SELECT guid, mid, flds, sfld, csum FROM notes ORDER BY id')[0].values;
    expect(notes.map((n) => n[0])).toEqual(['ar:v1', 'ar:v2']);
    expect(notes[0][1]).toBe(NOTE_TYPE_ID);
    expect((notes[0][2] as string).split('\u001f')[0]).toBe('كتاب');
    expect(notes[0][3]).toBe('كتاب');
    expect(typeof notes[0][4]).toBe('number');

    const cards = db.exec('SELECT nid, did, ord, type, queue, due FROM cards ORDER BY due')[0].values;
    expect(cards).toHaveLength(2);
    expect(cards.map((c) => [c[1], c[2], c[3], c[4], c[5]])).toEqual([
      [deck.id, 0, 0, 0, 1],
      [deck.id, 0, 0, 0, 2],
    ]);
    db.close();
  });

  it('gives the same note the same GUID in every export, so re-importing updates it', async () => {
    const SQL = await initSqlJs({ wasmBinary });
    const guid = async () => {
      const zip = await JSZip.loadAsync(await (await buildApkg(SQL, [item('v1', 'كتاب', 'book')], 'D')).arrayBuffer());
      const db = new SQL.Database(await zip.file('collection.anki2')!.async('uint8array'));
      const value = db.exec('SELECT guid FROM notes')[0].values[0][0];
      db.close();
      return value;
    };
    expect(await guid()).toBe(await guid());
  });
});
