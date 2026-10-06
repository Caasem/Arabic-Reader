/**
 * AnkiConnect client. A web page calling localhost:8765 is subject to
 * AnkiConnect's own CORS allowlist (`webCorsOriginList`), so the first sync
 * usually fails until the user adds this app's origin there. A blocked
 * request is indistinguishable from Anki not running (both are a failed
 * fetch), so both surface as 'unreachable' and the UI explains the CORS case.
 */

const ANKI_CONNECT_URL = 'http://localhost:8765';
const ANKI_CONNECT_VERSION = 6;

export type AnkiErrorKind = 'unreachable' | 'anki-error';

export class AnkiConnectError extends Error {
  kind: AnkiErrorKind;
  constructor(kind: AnkiErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = 'AnkiConnectError';
  }
}

export interface AnkiNote {
  deckName: string;
  modelName: string;
  fields: Record<string, string>;
  tags: string[];
  options?: { allowDuplicate?: boolean; duplicateScope?: 'deck' | 'collection' };
}

async function request<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(ANKI_CONNECT_URL, {
      method: 'POST',
      body: JSON.stringify({ action, version: ANKI_CONNECT_VERSION, params }),
    });
  } catch {
    throw new AnkiConnectError(
      'unreachable',
      "Couldn't reach Anki. Make sure Anki is open with the AnkiConnect add-on installed, and that this app's " +
        "address has been added to AnkiConnect's webCorsOriginList (see Settings for details)."
    );
  }
  if (!response.ok) {
    throw new AnkiConnectError('unreachable', `AnkiConnect responded with HTTP ${response.status}.`);
  }
  const data = await response.json();
  if (data.error) throw new AnkiConnectError('anki-error', String(data.error));
  return data.result as T;
}

export async function pingAnki(): Promise<boolean> {
  try {
    await request('version');
    return true;
  } catch {
    return false;
  }
}

export async function getDeckNames(): Promise<string[]> {
  return request<string[]>('deckNames');
}

export async function ensureDeck(deck: string): Promise<void> {
  await request('createDeck', { deck });
}

/** Per note: whether Anki would accept it (false for duplicates). */
export async function canAddNotes(notes: AnkiNote[]): Promise<boolean[]> {
  return request<boolean[]>('canAddNotes', { notes });
}

/** Per note: the new note id, or null if that note couldn't be added. */
export async function addNotes(notes: AnkiNote[]): Promise<(number | null)[]> {
  return request<(number | null)[]>('addNotes', { notes });
}

export async function getModelNames(): Promise<string[]> {
  return request<string[]>('modelNames');
}

export async function getModelFieldNames(modelName: string): Promise<string[]> {
  return request<string[]>('modelFieldNames', { modelName });
}

export async function createModel(params: {
  modelName: string;
  inOrderFields: readonly string[];
  css: string;
  cardTemplates: { Name: string; Front: string; Back: string }[];
}): Promise<void> {
  await request('createModel', { ...params, isCloze: false });
}

export async function addModelField(modelName: string, fieldName: string, index: number): Promise<void> {
  await request('modelFieldAdd', { modelName, fieldName, index });
}

export async function updateModelStyling(modelName: string, css: string): Promise<void> {
  await request('updateModelStyling', { model: { name: modelName, css } });
}

export async function updateModelTemplates(modelName: string, templates: Record<string, { Front: string; Back: string }>): Promise<void> {
  await request('updateModelTemplates', { model: { name: modelName, templates } });
}

export async function findNotes(query: string): Promise<number[]> {
  return request<number[]>('findNotes', { query });
}

export interface AnkiNoteInfo {
  noteId: number;
  modelName: string;
  fields: Record<string, { value: string; order: number }>;
  tags: string[];
}

export async function notesInfo(notes: number[]): Promise<(AnkiNoteInfo | Record<string, never>)[]> {
  return request('notesInfo', { notes });
}

export async function deleteNotes(notes: number[]): Promise<void> {
  if (notes.length) await request('deleteNotes', { notes });
}

/** Several actions in one request; each result is its own success or error. */
export async function multi(actions: { action: string; params: Record<string, unknown> }[]): Promise<{ result: unknown; error: string | null }[]> {
  if (!actions.length) return [];
  const results = await request<unknown[]>('multi', { actions: actions.map((a) => ({ ...a, version: ANKI_CONNECT_VERSION })) });
  return results.map((r) =>
    r && typeof r === 'object' && 'error' in (r as object) ? (r as { result: unknown; error: string | null }) : { result: r, error: null }
  );
}
