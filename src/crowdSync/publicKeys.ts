/**
 * Where the crowd service lives and which keys may sign its rankings (docs/specs/crowd-sense-ranking.md, 9.5).
 *
 * Both are empty until the service is deployed, and an empty address keeps the whole feature switched off:
 * nothing is fetched or sent, and the Settings switch says it is not available in this build.
 *
 * After deploying (crowd-server/README.md):
 *   - set VITE_CROWD_API to the Worker's address (no trailing slash) when building the app;
 *   - run `node crowd-server/scripts/gen-signing-key.mjs <file>` and paste the printed PUBLIC key below.
 * Keep two keys while rotating: the current one and the next, so a new key can be trusted before it is used.
 */
export const CROWD_API_BASE: string = (import.meta.env?.VITE_CROWD_API as string | undefined) ?? '';

/** Ed25519 public keys, base64url (raw 32 bytes). */
export const TRUSTED_PUBLIC_KEYS: readonly string[] = [];
