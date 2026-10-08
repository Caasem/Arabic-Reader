/** One recognised word. The box is in pixels of the image that was sent, origin top-left. */
export interface OcrWord {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OcrRequest {
  /** A PNG. */
  image: Blob;
  width: number;
  height: number;
  /** A language code such as `ar`; an engine maps it to what it calls Arabic. */
  language: string;
  /** Where the reader tapped, in image pixels. Engines that return every word can ignore it; engines that read one word use it. */
  point?: { x: number; y: number };
}

export interface OcrEngineStatus {
  available: boolean;
  /** Shown beside the engine when it is not available, or available with a caveat. */
  reason?: string;
}

/**
 * A text-recognition engine. The pages view asks the chosen one to read a crop of a scanned page and
 * gets words with boxes back; everything else (cropping, picking the tapped word, the dictionary) is
 * the same whichever engine answers. Engines come from three places: the app itself, the desktop app
 * (the OS's own, see electron/ocrEngines.cjs) and addresses the reader adds in Settings.
 */
export interface OcrEngine {
  /** Stable key, saved as the reader's choice. */
  id: string;
  name: string;
  description: string;
  kind: 'app' | 'desktop' | 'custom' | 'ai';
  /** True when a crop of the page leaves this device (an address that is not this computer). */
  sendsImagesOffDevice?: boolean;
  status(): Promise<OcrEngineStatus>;
  recognize(request: OcrRequest, signal?: AbortSignal): Promise<OcrWord[]>;
}

/** Turns an engine's JSON answer into words, accepting the shapes engines commonly give. */
export function parseOcrWords(answer: unknown): OcrWord[] {
  const root = answer as { words?: unknown; lines?: unknown } | unknown[] | null;
  let list: unknown[] = [];
  if (Array.isArray(root)) list = root;
  else if (root && Array.isArray(root.words)) list = root.words;
  else if (root && Array.isArray(root.lines)) list = (root.lines as { words?: unknown[] }[]).flatMap((l) => (Array.isArray(l?.words) ? l.words : []));
  const words: OcrWord[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const w = item as Partial<Record<keyof OcrWord, unknown>>;
    const [x, y, width, height] = [w.x, w.y, w.w, w.h].map(Number);
    if (typeof w.text !== 'string' || !w.text.trim() || ![x, y, width, height].every(Number.isFinite)) continue;
    words.push({ text: w.text, x, y, w: width, h: height });
  }
  return words;
}
