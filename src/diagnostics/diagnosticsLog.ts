import { readJSON, removeKey, STORAGE_KEYS, writeJSON } from '../utils/storage';

export type DiagnosticLevel = 'error' | 'warn' | 'info';

export interface DiagnosticEntry {
  at: number;
  level: DiagnosticLevel;
  /** Where it happened, e.g. 'reader', 'dictionary', 'window'. */
  source: string;
  message: string;
  detail?: string;
}

/** Older entries are dropped beyond this. */
export const MAX_DIAGNOSTIC_ENTRIES = 100;
const MAX_MESSAGE_CHARS = 500;
const MAX_DETAIL_CHARS = 2000;

const listeners = new Set<() => void>();
let cache: DiagnosticEntry[] | null = null;

function changed(): void {
  cache = null;
  listeners.forEach((listener) => listener());
}

/** Oldest first. Returns the same array until the log changes. */
export function getDiagnostics(): DiagnosticEntry[] {
  if (!cache) {
    const stored = readJSON<unknown>(STORAGE_KEYS.diagnosticsLog);
    cache = Array.isArray(stored) ? (stored as DiagnosticEntry[]) : [];
  }
  return cache;
}

export function subscribeDiagnostics(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function describe(detail: unknown): string | undefined {
  if (detail === undefined || detail === null) return undefined;
  if (detail instanceof Error) return detail.stack || `${detail.name}: ${detail.message}`;
  if (typeof detail === 'string') return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

/**
 * Records a problem for debugging on devices without developer tools. The
 * log stays on this device (localStorage) and is only ever shown or copied
 * from Settings → Diagnostics.
 */
export function logDiagnostic(level: DiagnosticLevel, source: string, message: string, detail?: unknown): void {
  const entry: DiagnosticEntry = { at: Date.now(), level, source, message: message.slice(0, MAX_MESSAGE_CHARS) };
  const text = describe(detail);
  if (text) entry.detail = text.slice(0, MAX_DETAIL_CHARS);
  writeJSON(STORAGE_KEYS.diagnosticsLog, [...getDiagnostics(), entry].slice(-MAX_DIAGNOSTIC_ENTRIES));
  changed();
}

export function clearDiagnostics(): void {
  removeKey(STORAGE_KEYS.diagnosticsLog);
  changed();
}

let installed = false;

/** Logs uncaught errors and unhandled promise rejections. */
export function installGlobalErrorLogging(target: Window = window): void {
  if (installed) return;
  installed = true;
  target.addEventListener('error', (event) => {
    const where = event.filename ? ` (${event.filename}:${event.lineno})` : '';
    logDiagnostic('error', 'window', (event.message || 'Uncaught error') + where, event.error);
  });
  target.addEventListener('unhandledrejection', (event) => {
    logDiagnostic('error', 'promise', `Unhandled rejection: ${errorMessage(event.reason)}`, event.reason);
  });
}

/** Plain text for pasting into a bug report. */
export function formatDiagnosticsReport(info: Record<string, string>, entries: DiagnosticEntry[] = getDiagnostics()): string {
  const lines = Object.entries(info).map(([key, value]) => `${key}: ${value}`);
  lines.push('', `Log (${entries.length} entries, oldest first):`);
  for (const entry of entries) {
    lines.push(`${new Date(entry.at).toISOString()} [${entry.level}] ${entry.source}: ${entry.message}`);
    if (entry.detail) lines.push(...entry.detail.split('\n').map((line) => `    ${line}`));
  }
  return lines.join('\n');
}
