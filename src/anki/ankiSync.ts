import type { VocabularyItem } from '../types';
import {
  addModelField,
  addNotes,
  createModel,
  deleteNotes,
  ensureDeck,
  getDeckNames,
  getModelFieldNames,
  getModelNames,
  multi,
  updateModelStyling,
  updateModelTemplates,
  type AnkiNote,
} from './ankiConnect';
import { clearAnkiDeletes, pendingAnkiDeletes } from './deletions';
import { CSS, escapeHtml, FIELDS, fieldsHash, NOTE_TYPE, RECOGNISE, toFields, type NoteFields } from './noteType';

export { escapeHtml };

const BATCH_SIZE = 50;
const TAG = 'arabic-reader';

/** What changed on a card after a sync; written back through the vocabulary service. */
export type AnkiLink = Pick<VocabularyItem, 'ankiNoteId' | 'ankiHash' | 'ankiModel' | 'syncedToAnki'>;

export interface AnkiSyncReport {
  added: number;
  updated: number;
  removed: number;
  unchanged: number;
  /** Notes sent by older versions (as "Basic") found again in Anki and linked to their cards. */
  relinked: number;
  /** Of those, how many could not be moved to the Arabic Reader note type and stay "Basic". */
  keptBasic: number;
  failed: number;
}

/** The note type exists with every field the app writes; its look and templates are kept current. */
export async function ensureNoteType(): Promise<void> {
  if (!(await getModelNames()).includes(NOTE_TYPE)) {
    await createModel({ modelName: NOTE_TYPE, inOrderFields: FIELDS, css: CSS, cardTemplates: [RECOGNISE] });
    return;
  }
  const existing = await getModelFieldNames(NOTE_TYPE);
  for (const [index, field] of FIELDS.entries()) if (!existing.includes(field)) await addModelField(NOTE_TYPE, field, index);
  await updateModelStyling(NOTE_TYPE, CSS);
  await updateModelTemplates(NOTE_TYPE, { [RECOGNISE.Name]: { Front: RECOGNISE.Front, Back: RECOGNISE.Back } });
}

/** The two fields older versions sent as an Anki "Basic" note. */
export function basicFields(item: VocabularyItem): { Front: string; Back: string } {
  const back = [item.meaning, item.sentence].filter(Boolean).map((part) => escapeHtml(part!)).join('<br><br>');
  return { Front: escapeHtml(item.surfaceForm), Back: back };
}

const quote = (text: string) => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/**
 * Brings Anki in step with the given cards: adds cards Anki doesn't have, updates notes whose
 * fields changed, finds notes older versions sent as "Basic" (moving them to the Arabic Reader note
 * type where AnkiConnect allows), and, if `removeDeleted`, deletes notes for cards removed in the
 * app. `save` records each card's link to its note.
 */
export async function syncVocabularyToAnki(options: {
  deck: string;
  items: VocabularyItem[];
  removeDeleted: boolean;
  save: (item: VocabularyItem, link: AnkiLink) => Promise<unknown>;
  onProgress?: (done: number, total: number) => void;
}): Promise<AnkiSyncReport> {
  const { deck, items, removeDeleted, save, onProgress } = options;
  const report: AnkiSyncReport = { added: 0, updated: 0, removed: 0, unchanged: 0, relinked: 0, keptBasic: 0, failed: 0 };
  if (!(await getDeckNames()).includes(deck)) await ensureDeck(deck);
  await ensureNoteType();

  const total = items.length;
  let done = 0;
  const tick = (n = 1) => onProgress?.((done += n), total);

  // 1. Notes sent by older versions: find them by deck, tag and front.
  const legacy = items.filter((i) => i.syncedToAnki && i.ankiNoteId == null);
  const toAdd: VocabularyItem[] = items.filter((i) => !i.syncedToAnki && i.ankiNoteId == null);
  for (let start = 0; start < legacy.length; start += BATCH_SIZE) {
    const batch = legacy.slice(start, start + BATCH_SIZE);
    const found = await multi(batch.map((i) => ({ action: 'findNotes', params: { query: `deck:${quote(deck)} tag:${TAG} Front:${quote(escapeHtml(i.surfaceForm))}` } })));
    const moves = await multi(
      batch.map((item, n) => {
        const id = (found[n].result as number[] | null)?.[0];
        return id == null
          ? { action: 'version', params: {} }
          : { action: 'updateNoteModel', params: { note: { id, modelName: NOTE_TYPE, fields: toFields(item), tags: [TAG] } } };
      })
    );
    for (const [n, item] of batch.entries()) {
      const id = (found[n].result as number[] | null)?.[0];
      if (id == null) {
        toAdd.push(item); // Deleted in Anki since: send it again.
        continue;
      }
      report.relinked++;
      if (moves[n].error) {
        report.keptBasic++;
        await save(item, { ankiNoteId: id, ankiHash: undefined, ankiModel: 'Basic', syncedToAnki: true });
      } else {
        await save(item, { ankiNoteId: id, ankiHash: fieldsHash(toFields(item)), ankiModel: undefined, syncedToAnki: true });
      }
      tick();
    }
  }

  // 2. Linked notes whose fields changed.
  const linked = items.filter((i) => i.ankiNoteId != null);
  const changed: { item: VocabularyItem; fields: NoteFields | { Front: string; Back: string }; hash: string }[] = [];
  for (const item of linked) {
    const fields = toFields(item);
    const hash = item.ankiModel === 'Basic' ? fieldsHash({ ...fields, Meaning: basicFields(item).Back }) : fieldsHash(fields);
    if (hash === item.ankiHash) {
      report.unchanged++;
      tick();
    } else changed.push({ item, fields: item.ankiModel === 'Basic' ? basicFields(item) : fields, hash });
  }
  for (let start = 0; start < changed.length; start += BATCH_SIZE) {
    const batch = changed.slice(start, start + BATCH_SIZE);
    const results = await multi(batch.map(({ item, fields }) => ({ action: 'updateNoteFields', params: { note: { id: item.ankiNoteId, fields } } })));
    for (const [n, { item, hash }] of batch.entries()) {
      const error = results[n].error;
      if (!error) {
        report.updated++;
        await save(item, { ankiNoteId: item.ankiNoteId, ankiHash: hash, ankiModel: item.ankiModel, syncedToAnki: true });
        tick();
      } else if (/not found|no note/i.test(error)) {
        toAdd.push(item); // Deleted in Anki: send it again.
      } else {
        report.failed++;
        tick();
      }
    }
  }

  // 3. New notes.
  for (let start = 0; start < toAdd.length; start += BATCH_SIZE) {
    const batch = toAdd.slice(start, start + BATCH_SIZE);
    const notes: AnkiNote[] = batch.map((item) => ({
      deckName: deck,
      modelName: NOTE_TYPE,
      fields: toFields(item),
      tags: [TAG],
      options: { allowDuplicate: true, duplicateScope: 'deck' },
    }));
    const ids = await addNotes(notes);
    for (const [n, item] of batch.entries()) {
      const id = ids[n];
      if (id == null) report.failed++;
      else {
        report.added++;
        await save(item, { ankiNoteId: id, ankiHash: fieldsHash(toFields(item)), ankiModel: undefined, syncedToAnki: true });
      }
    }
    tick(batch.length);
  }

  // 4. Notes for cards removed in the app.
  const pending = pendingAnkiDeletes();
  const kept = new Set(items.map((i) => i.ankiNoteId).filter((n): n is number => n != null));
  const removable = pending.filter((id) => !kept.has(id));
  if (removeDeleted && removable.length) {
    await deleteNotes(removable);
    report.removed = removable.length;
  }
  clearAnkiDeletes(pending);
  return report;
}

/** One line for the settings screen. */
export function describeReport(r: AnkiSyncReport, deck: string): string {
  const parts = [`Added ${r.added}`, `updated ${r.updated}`];
  if (r.removed) parts.push(`removed ${r.removed}`);
  parts.push(`unchanged ${r.unchanged}`);
  let text = `${parts.join(', ')} in the "${deck}" deck.`;
  if (r.relinked) text += ` Found ${r.relinked} note${r.relinked === 1 ? '' : 's'} sent by an earlier version.`;
  if (r.keptBasic) text += ` ${r.keptBasic} of them stay as "Basic" notes (update AnkiConnect to convert them).`;
  if (r.failed) text += ` ${r.failed} couldn't be sent; try again.`;
  return text;
}
