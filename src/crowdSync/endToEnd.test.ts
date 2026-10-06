import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DictionaryEntry, DictionaryLookupResult } from '../types';
import { handleAdmin } from '../../crowd-server/src/admin';
import { bookKey, entryKey, lemmaKey } from '../sensePicks/keys';
import { forgetWordPicks, rankByPicks, recordEntrySave } from '../sensePicks/recordSaves';
import { persistenceService } from '../persistence/db';
import { db } from '../persistence/schema';
import { fetchPack, refreshManifest } from './packStore';
import { flushQueue } from './sender';
import { loadState, updateState } from './state';
import { resetLocal, seedServerReader, setSharing, startService, type TestService } from './testkit';

// Sending is driven by hand in these tests.
vi.mock('./scheduler', () => ({ requestFlush: () => {}, startCrowdSync: () => () => {} }));

const book = { title: 'الأيام', author: 'طه حسين', language: 'ar' };
const WORD = 'كتبت';
const entry = (headword: string, glosses: string[], verbForm: string, providerId = 'aramorph'): DictionaryEntry => ({
  providerId,
  providerName: providerId,
  headword,
  root: 'كتب',
  verbForm,
  senses: glosses.map((gloss) => ({ gloss })),
});
const form2 = entry('كَتَّبَ', ['to make someone write'], 'II');
const form1 = entry('كَتَبَ', ['to write', 'to note'], 'I');
const result = (): DictionaryLookupResult => ({ word: WORD, entries: [form2, form1], morphology: [{ surfaceForm: WORD, lemma: 'كَتَبَ', pos: 'verb' }] });
const keys = { bookKey: bookKey(book), lemmaKey: lemmaKey('كَتَبَ', 'verb') };
const order = async (r = result()) => (await rankByPicks(book, WORD, r)).entries.map((e) => e.verbForm);

let svc: TestService;

async function seedCrowd(favourite: DictionaryEntry, readers = 35) {
  for (let i = 0; i < readers; i++) {
    await seedServerReader(
      svc.db,
      'reader' + String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26)) + 'aaaaaaaaaaa',
      [{ ...keys, providerId: favourite.providerId, entryKey: entryKey(favourite) }],
      { bookKey: keys.bookKey, lemmaKey: 'fillerfillerfiller', entryKey: 'fillerfillerfiller' },
    );
  }
}

async function waitForPack(path: string) {
  for (let i = 0; i < 50 && !(await db.crowdPacks.get(path)); i++) await new Promise((r) => setTimeout(r, 10));
}

beforeEach(async () => {
  await resetLocal();
  svc = await startService();
  vi.stubGlobal('fetch', svc.fetchImpl);
  setSharing(true);
});

describe('from one reader\'s save to another reader\'s popup (phase 1 exit test)', () => {
  it('a save travels device to server to ranking file and changes the order on another device', async () => {
    await seedCrowd(form1);
    // Reader A saves the second entry; the vote is queued and sent.
    await recordEntrySave(book, WORD, result(), form1);
    expect((await flushQueue()).status).toBe('sent');
    const sent = await svc.db.all<{ entryKey: string; saved: number; pos: number; source: string }>(`SELECT entryKey, saved, pos, source FROM votes WHERE installId = ?`, [(await loadState()).installId]);
    expect(sent).toEqual([{ entryKey: entryKey(form1), saved: 1, pos: 1, source: 'entry' }]);

    // Overnight: the server aggregates and publishes.
    await svc.publish();

    // Reader B is a different device: no saves of their own.
    await resetLocal();
    setSharing(true);
    expect(await order()).toEqual(['II', 'I']); // before anything is downloaded: dictionary order
    expect(await refreshManifest({ fetchImpl: svc.fetchImpl, keys: [svc.publicKey] })).toBe('updated');
    const path = `pooled/${keys.lemmaKey.slice(0, 2)}`;
    expect(await order()).toEqual(['II', 'I']); // listed but not downloaded yet: this lookup does not wait for the network
    await waitForPack(path);
    expect(await order()).toEqual(['I', 'II']); // the crowd's favourite is first
  });

  it('the reader\'s own saved entry always comes first for them, ahead of the crowd', async () => {
    await seedCrowd(form1);
    await svc.publish();
    await refreshManifest({ fetchImpl: svc.fetchImpl, keys: [svc.publicKey] });
    await fetchPack(`pooled/${keys.lemmaKey.slice(0, 2)}`, { fetchImpl: svc.fetchImpl });
    expect(await order()).toEqual(['I', 'II']);
    await persistenceService.setSensePick({ ...keys, providerId: 'aramorph', entryKey: entryKey(form2), source: 'entry' });
    expect(await order()).toEqual(['II', 'I']);
  });

  it('with sharing off the order is the dictionary\'s, even with a ranking cached', async () => {
    await seedCrowd(form1);
    await svc.publish();
    await refreshManifest({ fetchImpl: svc.fetchImpl, keys: [svc.publicKey] });
    await fetchPack(`pooled/${keys.lemmaKey.slice(0, 2)}`, { fetchImpl: svc.fetchImpl });
    setSharing(false);
    expect(await order()).toEqual(['II', 'I']);
  });

  it('installs in the hold-out group always see dictionary order', async () => {
    await seedCrowd(form1);
    await svc.publish();
    await refreshManifest({ fetchImpl: svc.fetchImpl, keys: [svc.publicKey] });
    await fetchPack(`pooled/${keys.lemmaKey.slice(0, 2)}`, { fetchImpl: svc.fetchImpl });
    await updateState((s) => {
      s.installId = 'someinstallidsomeinstallid';
      s.manifest!.holdoutPercent = 100;
    });
    expect(await order()).toEqual(['II', 'I']);
    await updateState((s) => {
      s.manifest!.holdoutPercent = 0;
    });
    expect(await order()).toEqual(['I', 'II']);
  });

  it('the kill switch reaches the app in the next manifest and the order goes back', async () => {
    await seedCrowd(form1);
    await svc.publish();
    await refreshManifest({ fetchImpl: svc.fetchImpl, keys: [svc.publicKey] });
    await fetchPack(`pooled/${keys.lemmaKey.slice(0, 2)}`, { fetchImpl: svc.fetchImpl });
    expect(await order()).toEqual(['I', 'II']);
    const token = 'testkit-admin-token-123';
    expect((await handleAdmin({ ...svc.services, adminToken: token }, 'POST', '/kill', 'Bearer ' + token, JSON.stringify({ enabled: false }))).status).toBe(200);
    expect(await refreshManifest({ fetchImpl: svc.fetchImpl, keys: [svc.publicKey] })).toBe('updated');
    expect(await order()).toEqual(['II', 'I']);
  });

  it('a denied word keeps dictionary order', async () => {
    await seedCrowd(form1);
    const token = 'testkit-admin-token-123';
    await handleAdmin({ ...svc.services, adminToken: token }, 'POST', '/deny', 'Bearer ' + token, JSON.stringify({ lemmaKeys: [keys.lemmaKey] }));
    await svc.publish();
    await refreshManifest({ fetchImpl: svc.fetchImpl, keys: [svc.publicKey] });
    await fetchPack(`pooled/${keys.lemmaKey.slice(0, 2)}`, { fetchImpl: svc.fetchImpl });
    expect(await order()).toEqual(['II', 'I']);
  });

  it('too few readers means no ranking, so nothing changes', async () => {
    await seedCrowd(form1, 6);
    await svc.publish();
    await refreshManifest({ fetchImpl: svc.fetchImpl, keys: [svc.publicKey] });
    expect(await order()).toEqual(['II', 'I']);
  });
});

describe('un-saving takes the vote back', () => {
  it('removing the saved word retracts the vote on the server and drops the local pick', async () => {
    await recordEntrySave(book, WORD, result(), form1);
    await flushQueue();
    await forgetWordPicks(book, WORD, result());
    expect(await persistenceService.getSensePicks(keys.bookKey, keys.lemmaKey)).toEqual([]);
    await flushQueue();
    const rows = await svc.db.all<{ saved: number; rev: number }>(`SELECT saved, rev FROM votes`);
    expect(rows).toEqual([{ saved: 0, rev: 2 }]);
  });

  it('a dictionary the reader loaded themselves is never shared', async () => {
    await recordEntrySave(book, WORD, result(), entry('كَتَبَ', ['my own'], 'I', 'personal'));
    expect(await db.crowdQueue.count()).toBe(0);
  });
});
