/**
 * The one place that decides whether anything may leave this device or be fetched from the crowd host
 * (docs/specs/crowd-sense-ranking.md, section 10.2). Every network function in this folder goes through
 * `crowdFetch`, which refuses when sharing is off, so nothing can slip past a forgotten check.
 */

/** The wording shown when a reader turns sharing on. */
export const CONSENT_TEXT =
  'Help improve meanings for everyone. When you save a word from the dictionary popup, we receive which book, which word and which dictionary entry you saved (and which meaning, if you saved only part of an entry), linked to a random ID for this app install, not your name or email. We see your network address when you connect but do not keep it with your saves. Saves are combined with others to order entries and meanings in this app and are never sold or given to anyone else. Our hosting provider runs the server and can see network addresses and the stored saves. You can delete what you shared any time.';

export interface ConsentSource {
  /** Reads the current setting; called every time, never cached. */
  isSharingOn(): boolean;
  /** Where the service lives. Empty means this build has no crowd service. */
  apiBase: string;
}

let source: ConsentSource = { isSharingOn: () => false, apiBase: '' };

/** The app wires the live preference and the build's API address in once, at start. */
export function configureConsent(next: ConsentSource): void {
  source = next;
}

export const isSharingOn = (): boolean => source.isSharingOn() && source.apiBase !== '';
export const apiBase = (): string => source.apiBase.replace(/\/+$/, '');

export class ConsentError extends Error {
  constructor() {
    super('sharing is off');
  }
}

/**
 * `fetch`, but only while sharing is on and a service address exists. The one exception is a reader's own explicit
 * request to delete what they shared, which must work even after they switched sharing off.
 */
export async function crowdFetch(path: string, init?: RequestInit, fetchImpl: typeof fetch = fetch, opts: { userAction?: boolean } = {}): Promise<Response> {
  const allowed = opts.userAction ? source.apiBase !== '' : isSharingOn();
  if (!allowed) throw new ConsentError();
  return fetchImpl(apiBase() + path, init);
}
