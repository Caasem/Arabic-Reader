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
  modelName: 'Basic';
  fields: { Front: string; Back: string };
  tags: string[];
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
