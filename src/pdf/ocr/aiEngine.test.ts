// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createClaudeEngine } from './aiEngine';
import { chosenOcrEngine, ocrEngines, registerOcrEngine, unregisterOcrEngine } from './registry';
import { resetOcrSettingsCache, updateOcrSettings } from './settings';
import type { OcrEngine, OcrRequest } from './types';

const request: OcrRequest = { image: new Blob(['x']), width: 400, height: 100, language: 'ar', point: { x: 200, y: 50 } };

describe('Claude vision engine', () => {
  beforeEach(() => {
    localStorage.clear();
    resetOcrSettingsCache();
  });

  it('is unavailable until the reader adds a key', async () => {
    expect(await createClaudeEngine().status()).toMatchObject({ available: false });
    updateOcrSettings({ claudeKey: 'sk-ant-test-key-1234567890' });
    expect(await createClaudeEngine().status()).toEqual({ available: true });
  });

  it('sends the marked crop with the reader\'s key and returns the one word on the dot', async () => {
    updateOcrSettings({ claudeKey: 'sk-ant-test-key-1234567890', claudeModel: 'claude-sonnet-5-5' });
    let seen: { url: string; headers: Headers; body: { model: string; messages: { content: { type: string }[] }[] } } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, headers: new Headers(init.headers), body: JSON.parse(String(init.body)) };
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'المدرسة\n' }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const engine = createClaudeEngine({ fetchImpl, mark: async () => 'BASE64' });
    const words = await engine.recognize(request);
    expect(words).toHaveLength(1);
    expect(words[0].text).toBe('المدرسة');
    // The word is boxed around the dot, so picking the tapped word finds it.
    expect(words[0].x).toBeLessThan(200);
    expect(words[0].x + words[0].w).toBeGreaterThan(200);
    expect(seen!.url).toBe('https://api.anthropic.com/v1/messages');
    expect(seen!.headers.get('x-api-key')).toBe('sk-ant-test-key-1234567890');
    expect(seen!.headers.get('anthropic-dangerous-direct-browser-access')).toBe('true');
    expect(seen!.body.model).toBe('claude-sonnet-5-5');
    expect(seen!.body.messages[0].content.map((c) => c.type)).toEqual(['image', 'text']);
    expect(engine.sendsImagesOffDevice).toBe(true);
  });

  it('explains a rejected key, a rate limit and other failures in plain words', async () => {
    updateOcrSettings({ claudeKey: 'sk-ant-test-key-1234567890' });
    const answer = (status: number) => createClaudeEngine({ fetchImpl: (async () => new Response('{}', { status })) as unknown as typeof fetch, mark: async () => 'x' });
    await expect(answer(401).recognize(request)).rejects.toThrow('did not accept the API key');
    await expect(answer(429).recognize(request)).rejects.toThrow('too many requests');
    await expect(answer(500).recognize(request)).rejects.toThrow('answered 500');
  });

  it('refuses to run without a key', async () => {
    await expect(createClaudeEngine({ mark: async () => 'x' }).recognize(request)).rejects.toThrow('API key');
  });
});

describe('the default engine', () => {
  const fake = (id: string, kind: OcrEngine['kind']): OcrEngine => ({ id, name: id, description: '', kind, status: async () => ({ available: true }), recognize: async () => [] });
  afterEach(() => {
    for (const e of ocrEngines()) unregisterOcrEngine(e.id);
    resetOcrSettingsCache();
  });
  it('is never an AI engine, which only runs once the reader chooses it', () => {
    registerOcrEngine(fake('ai:claude', 'ai'));
    expect(chosenOcrEngine()).toBeUndefined();
    registerOcrEngine(fake('desktop:windows', 'desktop'));
    expect(chosenOcrEngine()?.id).toBe('desktop:windows');
    updateOcrSettings({ engineId: 'ai:claude' });
    expect(chosenOcrEngine()?.id).toBe('ai:claude');
  });
});
