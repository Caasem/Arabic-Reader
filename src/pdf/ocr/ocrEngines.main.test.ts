// @vitest-environment node
// The Electron main-process side (electron/ocrEngines.cjs), with a stand-in for the PowerShell worker.
import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

const { createOcrEngines } = createRequire(import.meta.url)('../../../electron/ocrEngines.cjs') as {
  createOcrEngines(options: Record<string, unknown>): {
    list(): Promise<{ id: string; available: boolean; languages: string[]; reason?: string }[]>;
    recognize(id: string, bytes: Uint8Array, language: string): Promise<{ words: { text: string }[] }>;
    http(url: string, bytes: Uint8Array, language: string): Promise<unknown>;
    dispose(): void;
  };
};

/** A worker that says ready with some languages, then answers each request line with one canned reply. */
function fakeSpawn(languages: string[], reply: (line: string) => unknown) {
  return () => {
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter & { setEncoding(): void }; stdin: { write(line: string): void }; kill(): void };
    child.stdout = Object.assign(new EventEmitter(), { setEncoding() {} });
    child.stdin = { write: (line: string) => queueMicrotask(() => child.stdout.emit('data', JSON.stringify(reply(line.trim())) + '\n')) };
    child.kill = () => {};
    queueMicrotask(() => child.stdout.emit('data', JSON.stringify({ ready: true, languages }) + '\n'));
    return child;
  };
}

const png = new Uint8Array([137, 80, 78, 71]);

describe('electron/ocrEngines.cjs', () => {
  it('lists Windows text recognition with its languages, and says when Arabic is missing', async () => {
    const ok = createOcrEngines({ scriptPath: 'x.ps1', platform: 'win32', spawn: fakeSpawn(['en-US', 'ar-SA'], () => ({})) });
    expect(await ok.list()).toMatchObject([{ id: 'windows', available: true, languages: ['en-US', 'ar-SA'], reason: undefined }]);
    const noArabic = createOcrEngines({ scriptPath: 'x.ps1', platform: 'win32', spawn: fakeSpawn(['en-US'], () => ({})) });
    expect((await noArabic.list())[0].reason).toMatch(/Arabic is not installed/);
  });

  it('offers nothing on other systems', async () => {
    const engines = createOcrEngines({ scriptPath: 'x.ps1', platform: 'linux', spawn: () => { throw new Error('never'); } });
    expect(await engines.list()).toEqual([]);
    await expect(engines.recognize('windows', png, 'ar-SA')).rejects.toThrow('not available');
  });

  it('sends the image to the worker as "<language>|<path>" and returns its words', async () => {
    let line = '';
    const engines = createOcrEngines({
      scriptPath: 'x.ps1',
      platform: 'win32',
      spawn: fakeSpawn(['ar-SA'], (l) => {
        line = l;
        return { words: [{ text: 'ذهب', x: 0, y: 0, w: 1, h: 1 }], ms: 5 };
      }),
    });
    const reply = await engines.recognize('windows', png, 'ar-SA');
    expect(reply.words[0].text).toBe('ذهب');
    expect(line).toMatch(/^ar-SA\|.*arabic-reader-ocr-.*\.png$/);
  });

  it('turns a worker error into an exception and refuses bad input', async () => {
    const engines = createOcrEngines({ scriptPath: 'x.ps1', platform: 'win32', spawn: fakeSpawn(['ar-SA'], () => ({ error: 'boom' })) });
    await expect(engines.recognize('windows', png, 'ar-SA')).rejects.toThrow('boom');
    await expect(engines.recognize('windows', new Uint8Array(0), 'ar-SA')).rejects.toThrow('usable image');
    await expect(engines.recognize('windows', png, 'ar|../../x')).rejects.toThrow('Invalid language');
  });

  it('posts to http(s) addresses only, and returns the JSON', async () => {
    const seen: string[] = [];
    const fetchImpl = async (url: URL) => {
      seen.push(String(url));
      return new Response('{"words":[]}', { status: 200 });
    };
    const engines = createOcrEngines({ scriptPath: 'x.ps1', platform: 'linux', fetchImpl });
    expect(await engines.http('http://localhost:9000/ocr', png, 'ar')).toEqual({ words: [] });
    expect(seen).toEqual(['http://localhost:9000/ocr?lang=ar']);
    await expect(engines.http('file:///etc/passwd', png, 'ar')).rejects.toThrow('http or https');
    await expect(engines.http('not a url', png, 'ar')).rejects.toThrow('not valid');
  });
});
