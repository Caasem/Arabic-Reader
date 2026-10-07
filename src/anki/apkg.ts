import JSZip from 'jszip';
import type { SqlJsStatic } from 'sql.js';
import type { VocabularyItem } from '../types';
import { saveFile, type SaveFileResult } from '../utils/saveFile';
import { CSS, FIELDS, NOTE_TYPE, NOTE_TYPE_ID, RECOGNISE, toFields } from './noteType';

/**
 * Writes an Anki package (.apkg): a zip holding a schema-11 collection (`collection.anki2`, which
 * every current Anki, AnkiDroid and AnkiMobile imports) and an empty media map. Note GUIDs come from
 * card ids and the note type id is fixed, so importing a newer export updates the same notes instead
 * of adding copies.
 */

const SCHEMA = `
CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null, dconf text not null, tags text not null);
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null);
CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);
CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
CREATE INDEX ix_notes_usn on notes (usn);
CREATE INDEX ix_cards_usn on cards (usn);
CREATE INDEX ix_revlog_usn on revlog (usn);
CREATE INDEX ix_cards_nid on cards (nid);
CREATE INDEX ix_cards_sched on cards (did, queue, due);
CREATE INDEX ix_revlog_cid on revlog (cid);
CREATE INDEX ix_notes_csum on notes (csum);
`;

/** A stable positive id from text (FNV-1a, folded into Anki's id range). */
function stableId(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return 1_000_000_000 + (h % 1_000_000_000);
}

/** Anki's sort-field checksum: the first 8 hex digits of SHA-1 of the field with HTML stripped. */
async function checksum(field: string): Promise<number> {
  const text = field.replace(/<[^>]+>/g, '');
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return parseInt(hex.slice(0, 8), 16);
}

const deckJson = (id: number, name: string, mod: number) => ({
  id,
  name,
  mod,
  usn: -1,
  lrnToday: [0, 0],
  revToday: [0, 0],
  newToday: [0, 0],
  timeToday: [0, 0],
  collapsed: false,
  desc: '',
  dyn: 0,
  conf: 1,
  extendNew: 10,
  extendRev: 50,
});

export async function buildApkg(SQL: SqlJsStatic, items: VocabularyItem[], deckName: string): Promise<Blob> {
  const now = Date.now();
  const sec = Math.floor(now / 1000);
  const deckId = stableId(`deck:${deckName}`);
  const db = new SQL.Database();
  try {
    db.run(SCHEMA);
    const model = {
      id: NOTE_TYPE_ID,
      name: NOTE_TYPE,
      type: 0,
      mod: sec,
      usn: -1,
      sortf: 0,
      did: deckId,
      tmpls: [{ name: RECOGNISE.Name, ord: 0, qfmt: RECOGNISE.Front, afmt: RECOGNISE.Back, did: null, bqfmt: '', bafmt: '' }],
      flds: FIELDS.map((name, ord) => ({ name, ord, sticky: false, rtl: name !== 'Meaning' && name !== 'Book' && name !== 'Source', font: 'Arial', size: 20, media: [] })),
      css: CSS,
      latexPre:
        '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n',
      latexPost: '\\end{document}',
      tags: [],
      vers: [],
      req: [[0, 'any', [0]]],
    };
    const conf = {
      activeDecks: [1],
      addToCur: true,
      collapseTime: 1200,
      curDeck: 1,
      curModel: String(NOTE_TYPE_ID),
      dueCounts: true,
      estTimes: true,
      newBury: true,
      newSpread: 0,
      nextPos: items.length + 1,
      sortBackwards: false,
      sortType: 'noteFld',
      timeLim: 0,
    };
    const dconf = {
      1: {
        id: 1,
        name: 'Default',
        mod: 0,
        usn: 0,
        maxTaken: 60,
        autoplay: true,
        timer: 0,
        replayq: true,
        new: { bury: true, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 7], order: 1, perDay: 20, separate: true },
        lapse: { delays: [10], leechAction: 0, leechFails: 8, minInt: 1, mult: 0 },
        rev: { bury: true, ease4: 1.3, fuzz: 0.05, ivlFct: 1, maxIvl: 36500, minSpace: 1, perDay: 100 },
      },
    };
    const decks = { 1: deckJson(1, 'Default', sec), [deckId]: deckJson(deckId, deckName, sec) };
    db.run('INSERT INTO col VALUES (1, ?, ?, ?, 11, 0, 0, 0, ?, ?, ?, ?, ?)', [
      sec,
      now,
      now,
      JSON.stringify(conf),
      JSON.stringify({ [NOTE_TYPE_ID]: model }),
      JSON.stringify(decks),
      JSON.stringify(dconf),
      '{}',
    ]);

    const noteStmt = db.prepare('INSERT INTO notes VALUES (?, ?, ?, ?, -1, ?, ?, ?, ?, 0, ?)');
    const cardStmt = db.prepare('INSERT INTO cards VALUES (?, ?, ?, 0, ?, -1, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?)');
    const usedIds = new Set<number>();
    const uniqueId = (base: number) => {
      let id = base;
      while (usedIds.has(id)) id++;
      usedIds.add(id);
      return id;
    };
    for (const [position, item] of items.entries()) {
      const fields = toFields(item);
      const flds = FIELDS.map((f) => fields[f]).join('\u001f');
      const noteId = uniqueId((item.addedAt || now) + position);
      noteStmt.run([noteId, `ar:${item.id}`, NOTE_TYPE_ID, sec, ' arabic-reader ', flds, fields.Word, await checksum(fields.Word), '']);
      cardStmt.run([uniqueId(noteId + 1), noteId, deckId, sec, position + 1, '']);
    }
    noteStmt.free();
    cardStmt.free();

    const zip = new JSZip();
    zip.file('collection.anki2', db.export());
    zip.file('media', '{}');
    return zip.generateAsync({ type: 'blob', mimeType: 'application/zip', compression: 'DEFLATE' });
  } finally {
    db.close();
  }
}

/** Loads sql.js (and its WebAssembly file) only when an export is made. */
export async function loadSql(): Promise<SqlJsStatic> {
  const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([import('sql.js'), import('sql.js/dist/sql-wasm.wasm?url')]);
  return initSqlJs({ locateFile: () => wasmUrl });
}

/** Builds the .apkg for these cards and saves it (a download, or the share sheet on phones). */
export async function exportApkg(items: VocabularyItem[], deckName: string): Promise<SaveFileResult> {
  const blob = await buildApkg(await loadSql(), items, deckName);
  return saveFile(`${deckName.replace(/[\\/:*?"<>|]+/g, '-') || 'Arabic Reader'}.apkg`, blob, 'application/zip');
}
