import { getDesktopOcr } from './desktopBridge';
import type { OcrEngine, OcrEngineStatus, OcrRequest, OcrWord } from './types';
import { parseOcrWords } from './types';
import type { CustomEngine } from './settings';

/** The language tag an engine's list has for `language` (`ar` → `ar-SA`). */
export function languageTagFor(language: string, installed: string[]): string | undefined {
  const base = language.toLowerCase().split('-')[0];
  return installed.find((tag) => tag.toLowerCase() === language.toLowerCase()) ?? installed.find((tag) => tag.toLowerCase().split('-')[0] === base);
}

const bytesOf = async (image: Blob) => new Uint8Array(await image.arrayBuffer());

/** The engines the desktop app's operating system provides. Empty in a browser and on phones. */
export async function loadDesktopEngines(): Promise<OcrEngine[]> {
  const bridge = getDesktopOcr();
  if (!bridge) return [];
  const infos = await bridge.list().catch(() => []);
  return infos.map((info): OcrEngine => {
    const current = async () => (await bridge.list().catch(() => [])).find((i) => i.id === info.id) ?? info;
    return {
      id: `desktop:${info.id}`,
      name: info.name,
      description: info.description,
      kind: 'desktop',
      async status(): Promise<OcrEngineStatus> {
        const now = await current();
        const hasArabic = !!languageTagFor('ar', now.languages);
        return { available: now.available && hasArabic, reason: now.available && hasArabic ? undefined : (now.reason ?? 'Arabic is not available in this engine.') };
      },
      async recognize(request: OcrRequest): Promise<OcrWord[]> {
        const tag = languageTagFor(request.language, (await current()).languages);
        if (!tag) throw new Error(`${info.name} cannot read this language.`);
        return parseOcrWords(await bridge.recognize(info.id, await bytesOf(request.image), tag));
      },
    };
  });
}

/** True for an address on this computer, whose crops never leave it. */
export function isLocalAddress(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
  } catch {
    return false;
  }
}

export interface EndpointDeps {
  fetchImpl?: typeof fetch;
}

/**
 * An engine the reader added by address. The contract: the Reader POSTs a PNG (`Content-Type: image/png`,
 * `?lang=ar`) and the address answers JSON with the words and their boxes in image pixels:
 * `{ "words": [{ "text": "…", "x": 0, "y": 0, "w": 0, "h": 0 }] }` (`{ lines: [{ words }] }` or a bare
 * array of words also work). In the desktop app the post goes through the main process, which the page
 * policy would otherwise block.
 */
export function createEndpointEngine(config: CustomEngine, deps: EndpointDeps = {}): OcrEngine {
  const local = isLocalAddress(config.url);
  return {
    id: config.id,
    name: config.name,
    description: config.url,
    kind: 'custom',
    sendsImagesOffDevice: !local,
    async status() {
      try {
        const url = new URL(config.url);
        return url.protocol === 'http:' || url.protocol === 'https:' ? { available: true } : { available: false, reason: 'Use an http or https address.' };
      } catch {
        return { available: false, reason: 'That address is not valid.' };
      }
    },
    async recognize(request, signal) {
      const desktop = getDesktopOcr();
      if (desktop) return parseOcrWords(await desktop.http(config.url, await bytesOf(request.image), request.language));
      const url = new URL(config.url);
      url.searchParams.set('lang', request.language);
      const response = await (deps.fetchImpl ?? fetch)(url, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: request.image, signal });
      if (!response.ok) throw new Error(`${config.name} answered ${response.status}.`);
      return parseOcrWords(await response.json());
    },
  };
}
