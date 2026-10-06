import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { DictionaryEntry, DictionaryLookupResult } from '../types';
import { persistenceService } from '../persistence/db';
import { bookKey, entryKey, lemmaKey, senseKey } from './keys';
import { forgetWordPicks, rankByPicks, recordEditSave, recordEntrySave, recordSelectionSave } from './recordSaves';

const book = { title: 'الأيام', author: 'طه حسين', language: 'ar' };
const form2: DictionaryEntry = { providerId: 'aramorph', providerName: 'AraMorph', headword: 'كَتَّبَ', root: 'كتب', verbForm: 'II', senses: [{ gloss: 'to make someone write' }] };
const form1: DictionaryEntry = {
  providerId: 'aramorph',
  providerName: 'AraMorph',
  headword: 'كَتَبَ',
  root: 'كتب',
  verbForm: 'I',
  senses: [{ gloss: 'to decree, to prescribe' }, { gloss: 'to write down, to note' }, { gloss: 'to write' }],
};
const other: DictionaryEntry = { providerId: 'baranov', providerName: 'Baranov', headword: 'كَتَبَ', root: 'كتب', verbForm: 'I', senses: [{ gloss: 'писать' }] };
const result: DictionaryLookupResult = { word: 'كتبت', entries: [form2, form1, other], morphology: [{ surfaceForm: 'كتبت', lemma: 'كَتَبَ', pos: 'verb' }] };
const keys = { bookKey: bookKey(book), lemmaKey: lemmaKey('كَتَبَ', 'verb') };

describe('recording and applying the reader\'s saves', () => {
  it('an entry save puts that entry first the next time the word is looked up', async () => {
    expect((await rankByPicks(book, 'كتبت', result)).entries[0]).toBe(form2);
    await recordEntrySave(book, 'كتبت', result, form1);
    const ranked = await rankByPicks(book, 'كتبت', result);
    expect(ranked.entries.map((e) => e.verbForm)).toEqual(['I', 'II', 'I']);
    expect(ranked.entries.map((e) => e.providerId)).toEqual(['aramorph', 'aramorph', 'baranov']);
    const row = (await persistenceService.getSensePicks(keys.bookKey, keys.lemmaKey))[0];
    expect(row).toMatchObject({ providerId: 'aramorph', entryKey: entryKey(form1), source: 'entry' });
    expect(row.senseKey).toBeUndefined();
  });

  it('is kept per book: another book still shows the dictionary order', async () => {
    expect((await rankByPicks({ title: 'كتاب آخر' }, 'كتبت', result)).entries[0]).toBe(form2);
  });

  it('a saved selection that sits inside one meaning also moves that meaning first', async () => {
    await recordSelectionSave(book, 'كتبت', result, form1, 'write down');
    const ranked = await rankByPicks(book, 'كتبت', result);
    expect(ranked.entries[0].senses[0].gloss).toBe('to write down, to note');
    const row = (await persistenceService.getSensePicks(keys.bookKey, keys.lemmaKey)).find((r) => r.entryKey === entryKey(form1));
    expect(row).toMatchObject({ source: 'selection', senseKey: senseKey('aramorph', 'كَتَبَ', form1.senses[1]) });
  });

  it('a selection that fits no single meaning stays an entry-level save', async () => {
    await recordSelectionSave(book, 'كتبت', result, form1, 'to');
    const row = (await persistenceService.getSensePicks(keys.bookKey, keys.lemmaKey)).find((r) => r.entryKey === entryKey(form1));
    expect(row?.senseKey).toBeUndefined();
  });

  it('an edit counts only when the reader changed what the app prefilled', async () => {
    await forgetWordPicks(book, 'كتبت', result);
    await recordEditSave(book, 'كتبت', result, 'to make someone write', 'to make someone write');
    expect(await persistenceService.getSensePicks(keys.bookKey, keys.lemmaKey)).toEqual([]);
    await recordEditSave(book, 'كتبت', result, 'to make someone write', 'to write down, to note');
    const rows = await persistenceService.getSensePicks(keys.bookKey, keys.lemmaKey);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entryKey: entryKey(form1), source: 'edit', senseKey: senseKey('aramorph', 'كَتَبَ', form1.senses[1]) });
  });

  it('an edit that matches nothing is not a signal', async () => {
    await forgetWordPicks(book, 'كتبت', result);
    await recordEditSave(book, 'كتبت', result, 'to make someone write', 'my own wording');
    expect(await persistenceService.getSensePicks(keys.bookKey, keys.lemmaKey)).toEqual([]);
  });

  it('removing the saved word takes back every pick for it', async () => {
    await recordEntrySave(book, 'كتبت', result, form1);
    await recordEntrySave(book, 'كتبت', result, other);
    expect(await persistenceService.getSensePicks(keys.bookKey, keys.lemmaKey)).toHaveLength(2);
    await forgetWordPicks(book, 'كتبت', result);
    expect(await persistenceService.getSensePicks(keys.bookKey, keys.lemmaKey)).toEqual([]);
    expect((await rankByPicks(book, 'كتبت', result)).entries[0]).toBe(form2);
  });

  it('does nothing without a book title or a result, and never throws', async () => {
    await recordEntrySave({ title: '' }, 'كتبت', result, form1);
    await recordEntrySave(book, 'كتبت', null, form1);
    await forgetWordPicks({ title: '' }, 'كتبت', result);
    expect(await persistenceService.getSensePicks(keys.bookKey, keys.lemmaKey)).toEqual([]);
    expect(await rankByPicks({ title: '' }, 'كتبت', result)).toBe(result);
  });
});
