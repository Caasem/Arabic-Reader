/**
 * Which keys may sign the pack manifest (ADR 0007, docs/specs/data-architecture.md D6).
 *
 * Nothing is fetched until a pack host is configured as well (`VITE_PACKS_BASE_URL`); until then this feature is dormant.
 *
 * Two keys, as ADR 0007 asks: the one that signs today, and the next one, trusted ahead of time so that a
 * rotation needs no app release. Their private halves are kept by the maintainer, outside the repository.
 *
 * To change them: run `node scripts/packs/gen-key.mjs <private-key-file>` (keep that file offline, never in the repo)
 * and paste the printed PUBLIC key below. Keep two keys while rotating, the current one and the next, so a new key
 * is trusted before it signs anything.
 */
export const TRUSTED_PACK_KEYS: readonly string[] = [
  // current (generated 2026-10-07)
  'BFLfPQKKb2sdH2EYSxQ-3e5P1p3mJFMYRTc9gzPUil3a_IjXAYPJ6fcEfBQnbwFkXY2oaJ_cJrITMV0KJyfa5js',
  // next, for rotation (generated 2026-10-07)
  'BODGGjPdN5tRHM8theFUyQvPMg2IIAaSKzd_CPtZGcGPx5BJtJMffZ4CM7RLu3YWQwPEulXOfPcmIoL4ceZsVyQ',
];
