/**
 * Core data model, split by domain. Framework-agnostic (no React or
 * browser-only types), so a future native client can reuse the same shapes.
 */
export type * from './book';
export type * from './dictionary';
export type * from './vocabulary';
export type * from './preferences';
export type * from './sessions';
