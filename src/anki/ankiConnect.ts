/**
 * AnkiConnect client — adapted from this project's own earlier browser
 * extension (`anki.js`/`anki-queue.js` in the project docs), which has a
 * proven working request shape for the AnkiConnect API. That code ran
 * inside a browser extension's content script, though, which has
 * different network permissions than a plain web page — a page calling
 * `fetch('http://localhost:8765', …)` is subject to AnkiConnect's own CORS
 * allowlist (`webCorsOriginList` in its config), so the very first sync
 * attempt from this app will likely be blocked until the user adds this
 * app's origin there. `pingAnki()` is used to detect that case up front
 * and `AnkiConnectError` carries a `kind` so the UI can show the right
 * fix rather than a generic "failed" message.
 */

const ANKI_CONNECT_URL = 'http://localhost:8765';
const ANKI_CONNECT_VERSION = 6;

export type AnkiErrorKind = 'unreachable' | 'cors' | 'anki-error';

export class AnkiConnectError extends Error {
  kind: AnkiErrorKind;
  constructor(kind: AnkiErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = 'AnkiConnectError';
  }
}

async function request<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(ANKI_CONNECT_URL, {
      method: 'POST',
      // AnkiConnect doesn't send CORS headers unless the caller's origin is
      // in its webCorsOriginList — a request from a disallowed origin fails
      // at the fetch() level (TypeError: Failed to fetch), which is
      // indistinguishable here from Anki simply not running. Both surface
      // as 'unreachable' — the Settings UI explains the CORS possibility
      // explicitly rather than pretending to tell them apart.
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
  if (data.error) {
    throw new AnkiConnectError('anki-error', String(data.error));
  }
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

/**
 * Adds a single Basic note. Returns the new note id, or null if
 * AnkiConnect reported the note already exists (e.g. a duplicate front) —
 * treated as a soft success rather than an error, since that's a
 * reasonable outcome for a sync that might run more than once.
 */
export async function addNote(deck: string, front: string, back: string, tags: string[]): Promise<number | null> {
  try {
    return await request<number>('addNote', {
      note: { deckName: deck, modelName: 'Basic', fields: { Front: front, Back: back }, tags },
    });
  } catch (e) {
    if (e instanceof AnkiConnectError && /duplicate/i.test(e.message)) return null;
    throw e;
  }
}
