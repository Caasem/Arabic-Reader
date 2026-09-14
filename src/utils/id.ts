/** A prefixed unique id, e.g. `vocab_3f2a…`. Uses `crypto.randomUUID` where
 * available (secure contexts), otherwise a timestamp + random fallback. */
export function newId(prefix: string): string {
  const unique =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  return `${prefix}_${unique}`;
}
