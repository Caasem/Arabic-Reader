import { readString, writeString } from '../../utils/storage';

/** An engine the reader added by address (see endpointEngine.ts for what it must answer). */
export interface CustomEngine {
  id: string;
  name: string;
  url: string;
}

export type Enhance = 'none' | 'contrast' | 'binarize';

export interface OcrSettings {
  /** The chosen engine; unset means the first one the app finds. */
  engineId?: string;
  custom: CustomEngine[];
  /** Pixels per PDF point when a crop is drawn (4 is about 290 dpi). */
  scale: number;
  /** Extra room around the tapped line, as a share of its size. */
  pad: number;
  /** Height of the strip read around a tap, in PDF points. */
  stripPt: number;
  enhance: Enhance;
  /** When the first read is not a word, ask this engine too; the dictionary decides between the answers. */
  fallbackId?: string;
  /** The reader's own Anthropic key, kept on this device only, and the model to use. */
  claudeKey?: string;
  claudeModel?: string;
}

export const DEFAULT_OCR_SETTINGS: OcrSettings = { custom: [], scale: 4, pad: 0.15, stripPt: 44, enhance: 'contrast' };

const KEY = 'arabic-reader:pdfOcr';
const listeners = new Set<() => void>();
let cache: OcrSettings | null = null;

const num = (v: unknown, fallback: number, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);

/** Reads whatever is stored, repairing anything odd. */
export function parseOcrSettings(raw: string | null): OcrSettings {
  let stored: Partial<OcrSettings> = {};
  try {
    stored = raw ? (JSON.parse(raw) as Partial<OcrSettings>) : {};
  } catch {
    stored = {};
  }
  const custom = Array.isArray(stored.custom)
    ? stored.custom.filter((c): c is CustomEngine => !!c && typeof c.id === 'string' && typeof c.name === 'string' && typeof c.url === 'string')
    : [];
  return {
    engineId: typeof stored.engineId === 'string' ? stored.engineId : undefined,
    custom,
    scale: num(stored.scale, DEFAULT_OCR_SETTINGS.scale, 1, 8),
    pad: num(stored.pad, DEFAULT_OCR_SETTINGS.pad, 0, 1),
    stripPt: num(stored.stripPt, DEFAULT_OCR_SETTINGS.stripPt, 10, 400),
    enhance: stored.enhance === 'none' || stored.enhance === 'binarize' ? stored.enhance : 'contrast',
    fallbackId: typeof stored.fallbackId === 'string' ? stored.fallbackId : undefined,
    claudeKey: typeof stored.claudeKey === 'string' && stored.claudeKey.trim() ? stored.claudeKey.trim() : undefined,
    claudeModel: typeof stored.claudeModel === 'string' ? stored.claudeModel : undefined,
  };
}

export function getOcrSettings(): OcrSettings {
  return (cache ??= parseOcrSettings(readString(KEY)));
}

export function updateOcrSettings(patch: Partial<OcrSettings>): OcrSettings {
  cache = { ...getOcrSettings(), ...patch };
  writeString(KEY, JSON.stringify(cache));
  for (const listener of listeners) listener();
  return cache;
}

export function subscribeOcrSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** For tests. */
export function resetOcrSettingsCache(): void {
  cache = null;
}
