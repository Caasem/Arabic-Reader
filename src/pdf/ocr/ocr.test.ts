// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { enhancePixels, padRegion } from './crop';
import { createEndpointEngine, isLocalAddress, languageTagFor, loadDesktopEngines } from './engines';
import { chosenOcrEngine, ocrEngines, registerOcrEngine, unregisterOcrEngine } from './registry';
import { DEFAULT_OCR_SETTINGS, getOcrSettings, parseOcrSettings, resetOcrSettingsCache, updateOcrSettings } from './settings';
import { lineOf, pickWord } from './pick';
import { parseOcrWords, type OcrEngine } from './types';

const word = (text: string, x: number, y = 0, w = 50, h = 30) => ({ text, x, y, w, h });

describe('parseOcrWords', () => {
  it('accepts words, lines of words, or a bare array, and drops malformed entries', () => {
    const w = { text: 'كتاب', x: 1, y: 2, w: 3, h: 4 };
    expect(parseOcrWords({ words: [w] })).toEqual([w]);
    expect(parseOcrWords({ lines: [{ words: [w] }, { words: [w] }] })).toHaveLength(2);
    expect(parseOcrWords([w, { text: '', x: 0, y: 0, w: 1, h: 1 }, { text: 'x', x: 'a', y: 0, w: 1, h: 1 }, null])).toEqual([w]);
    expect(parseOcrWords({ words: [{ text: 'a', x: '5', y: '6', w: '7', h: '8' }] })).toEqual([{ text: 'a', x: 5, y: 6, w: 7, h: 8 }]);
    expect(parseOcrWords('nonsense')).toEqual([]);
    expect(parseOcrWords(null)).toEqual([]);
  });
});

describe('picking the tapped word', () => {
  const words = [word('ذهب', 400), word('الولد', 300), word('إلى', 200)];
  it('takes the box under the point, else the nearest, else nothing too far away', () => {
    expect(pickWord(words, { x: 420, y: 10 })?.text).toBe('ذهب');
    expect(pickWord(words, { x: 360, y: 40 })?.text).toBe('الولد');
    expect(pickWord(words, { x: 5000, y: 5 }, 100)).toBeUndefined();
    expect(pickWord([], { x: 0, y: 0 })).toBeUndefined();
  });
  it('gives the line right to left for the popup sentence', () => {
    expect(lineOf([...words, word('بعيد', 100, 200)], words[1])).toBe('ذهب الولد إلى');
  });
});

describe('cropping helpers', () => {
  it('pads a region and keeps it on the page', () => {
    expect(padRegion({ x: 10, y: 10, w: 100, h: 20 }, 0.5, { width: 595, height: 842 })).toEqual({ x: 0, y: 0, w: 160, h: 40 });
    const r = padRegion({ x: 500, y: 800, w: 100, h: 100 }, 0.2, { width: 595, height: 842 });
    expect(r.x + r.w).toBe(595);
    expect(r.y + r.h).toBe(842);
  });
  it('stretches contrast and binarizes', () => {
    const grey = (v: number) => [v, v, v, 255];
    const px = new Uint8ClampedArray([...grey(100), ...grey(110), ...grey(200), ...grey(205)]);
    enhancePixels(px, 'contrast');
    expect(px[0]).toBeLessThan(px[8]);
    const bw = new Uint8ClampedArray([...grey(20), ...grey(30), ...grey(220), ...grey(230)]);
    enhancePixels(bw, 'binarize');
    expect([bw[0], bw[4], bw[8], bw[12]]).toEqual([0, 0, 255, 255]);
    const same = new Uint8ClampedArray(grey(77));
    enhancePixels(same, 'none');
    expect(same[0]).toBe(77);
  });
});

describe('engines', () => {
  it('maps a language to the tag an engine lists', () => {
    expect(languageTagFor('ar', ['en-US', 'ar-SA'])).toBe('ar-SA');
    expect(languageTagFor('ar-SA', ['ar-EG', 'ar-SA'])).toBe('ar-SA');
    expect(languageTagFor('ar', ['en-US'])).toBeUndefined();
  });

  it('knows which addresses stay on this computer', () => {
    expect(['http://localhost:8080/ocr', 'http://127.0.0.1/x', 'http://ocr.localhost/x'].every(isLocalAddress)).toBe(true);
    expect(isLocalAddress('https://ocr.example.com/x')).toBe(false);
    expect(isLocalAddress('nonsense')).toBe(false);
  });

  it('posts the PNG to an address the reader added and reads the words back', async () => {
    let seen: { url: string; type: string | null } | null = null;
    const fetchImpl = (async (url: URL, init: RequestInit) => {
      seen = { url: String(url), type: new Headers(init.headers).get('content-type') };
      return new Response(JSON.stringify({ words: [{ text: 'كتاب', x: 1, y: 2, w: 3, h: 4 }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const engine = createEndpointEngine({ id: 'custom:a', name: 'Mine', url: 'http://localhost:9000/ocr' }, { fetchImpl });
    expect(engine.sendsImagesOffDevice).toBe(false);
    expect(await engine.status()).toEqual({ available: true });
    const words = await engine.recognize({ image: new Blob(['x'], { type: 'image/png' }), width: 1, height: 1, language: 'ar' });
    expect(words).toHaveLength(1);
    expect(seen).toEqual({ url: 'http://localhost:9000/ocr?lang=ar', type: 'image/png' });
    expect(createEndpointEngine({ id: 'c', name: 'n', url: 'https://x.example/ocr' }).sendsImagesOffDevice).toBe(true);
    expect((await createEndpointEngine({ id: 'c', name: 'n', url: 'ftp://x' }).status()).available).toBe(false);
  });

  it('reports a failing address as an error', async () => {
    const fetchImpl = (async () => new Response('no', { status: 500 })) as unknown as typeof fetch;
    const engine = createEndpointEngine({ id: 'c', name: 'Mine', url: 'http://localhost:1/x' }, { fetchImpl });
    await expect(engine.recognize({ image: new Blob(['x']), width: 1, height: 1, language: 'ar' })).rejects.toThrow('Mine answered 500');
  });

  it('lists the desktop app\'s engines and reads through its bridge', async () => {
    const calls: unknown[][] = [];
    (globalThis as { window?: unknown }).window = {
      arabicReaderDesktop: {
        ocr: {
          list: async () => [{ id: 'windows', name: 'Windows text recognition', description: 'd', languages: ['en-US', 'ar-SA'], available: true }],
          recognize: async (...args: unknown[]) => {
            calls.push(args);
            return { words: [{ text: 'ذهب', x: 0, y: 0, w: 10, h: 10 }] };
          },
          http: async () => ({ words: [] }),
        },
      },
    };
    try {
      const [engine] = await loadDesktopEngines();
      expect(engine.id).toBe('desktop:windows');
      expect(await engine.status()).toEqual({ available: true, reason: undefined });
      const words = await engine.recognize({ image: new Blob([new Uint8Array([1, 2, 3])]), width: 1, height: 1, language: 'ar' });
      expect(words[0].text).toBe('ذهب');
      expect(calls[0].slice(0, 1)).toEqual(['windows']);
      expect(calls[0][2]).toBe('ar-SA');
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  });
});

describe('registry and settings', () => {
  const fake = (id: string, kind: OcrEngine['kind']): OcrEngine => ({ id, name: id, description: '', kind, status: async () => ({ available: true }), recognize: async () => [] });
  afterEach(() => {
    for (const e of ocrEngines()) unregisterOcrEngine(e.id);
    resetOcrSettingsCache();
  });

  it('defaults to the first engine that is not an added address, and honours the reader\'s choice', () => {
    registerOcrEngine(fake('custom:1', 'custom'));
    registerOcrEngine(fake('desktop:windows', 'desktop'));
    expect(chosenOcrEngine()?.id).toBe('desktop:windows');
    updateOcrSettings({ engineId: 'custom:1' });
    expect(chosenOcrEngine()?.id).toBe('custom:1');
    updateOcrSettings({ engineId: 'gone' });
    expect(chosenOcrEngine()?.id).toBe('desktop:windows');
  });

  it('registers and removes through the returned function', () => {
    const remove = registerOcrEngine(fake('x', 'app'));
    expect(ocrEngines()).toHaveLength(1);
    remove();
    expect(ocrEngines()).toHaveLength(0);
  });

  it('repairs stored settings', () => {
    expect(parseOcrSettings(null)).toEqual(DEFAULT_OCR_SETTINGS);
    expect(parseOcrSettings('{bad')).toEqual(DEFAULT_OCR_SETTINGS);
    const s = parseOcrSettings(JSON.stringify({ scale: 99, pad: -3, stripPt: 'x', enhance: 'weird', custom: [{ id: 'a', name: 'n', url: 'u' }, { id: 1 }], engineId: 5 }));
    expect(s).toMatchObject({ scale: 8, pad: 0, stripPt: 44, enhance: 'contrast', engineId: undefined });
    expect(s.custom).toEqual([{ id: 'a', name: 'n', url: 'u' }]);
    expect(getOcrSettings()).toBeTruthy();
  });
});
