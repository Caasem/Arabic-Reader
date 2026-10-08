// Text recognition for scanned PDF pages, run in Electron's main process only (src/pdf/ocr is the
// renderer side). Two things live here:
//   - the engines the operating system provides: today Windows' built-in one, through a long-lived
//     PowerShell worker (windows-ocr.ps1). To add another (Apple Vision, say) add an entry to
//     `nativeEngines()`; the renderer lists whatever this reports and needs no change.
//   - a plain HTTP post for engines the reader adds by address. Done here because the page's
//     content-security policy (rightly) allows no outside connections.
// Kept free of Electron imports so it can be unit-tested.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn: nodeSpawn } = require('node:child_process');

const REQUEST_TIMEOUT_MS = 30000;
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const MAX_REPLY_BYTES = 5 * 1024 * 1024;

/**
 * @param {{ scriptPath: string, tmpDir?: string, platform?: string, spawn?: typeof nodeSpawn, fetchImpl?: typeof fetch }} options
 */
function createOcrEngines({ scriptPath, tmpDir = os.tmpdir(), platform = process.platform, spawn = nodeSpawn, fetchImpl = globalThis.fetch }) {
  // -- Windows worker ----------------------------------------------------------------------------------------
  let worker = null;
  let starting = null;
  let chain = Promise.resolve();
  let counter = 0;

  function startWorker() {
    if (starting) return starting;
    starting = new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
        stdio: ['pipe', 'pipe', 'ignore'],
        windowsHide: true,
      });
      const state = { child, waiting: [], buffer: '', languages: [] };
      let ready = false;
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        state.buffer += chunk;
        let nl;
        while ((nl = state.buffer.indexOf('\n')) >= 0) {
          const line = state.buffer.slice(0, nl).replace(/^﻿/, '').trim();
          state.buffer = state.buffer.slice(nl + 1);
          if (!line) continue;
          let message;
          try {
            message = JSON.parse(line);
          } catch {
            continue;
          }
          if (message.ready && !ready) {
            ready = true;
            state.languages = Array.isArray(message.languages) ? message.languages : [];
            worker = state;
            resolve(state);
          } else {
            state.waiting.shift()?.(message);
          }
        }
      });
      const fail = (error) => {
        for (const waiter of state.waiting.splice(0)) waiter({ error: 'The text recognition worker stopped.' });
        if (worker === state) worker = null;
        starting = null;
        if (!ready) reject(error);
      };
      child.on('error', fail);
      child.on('exit', () => fail(new Error('The text recognition worker stopped.')));
    });
    return starting;
  }

  function ask(state, line, timeoutMs) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ error: 'Text recognition took too long.' }), timeoutMs);
      state.waiting.push((message) => {
        clearTimeout(timer);
        resolve(message);
      });
      state.child.stdin.write(`${line}\n`);
    });
  }

  async function windowsInfo() {
    if (platform !== 'win32') return null;
    try {
      const state = await startWorker();
      const arabic = state.languages.some((tag) => tag.toLowerCase().startsWith('ar'));
      return {
        id: 'windows',
        name: 'Windows text recognition',
        description: 'Built into Windows. Runs on this computer, offline.',
        languages: state.languages,
        available: true,
        reason: arabic ? undefined : 'Arabic is not installed for text recognition. Add it under Settings → Time & language → Language & region → Arabic → Language options → Optical character recognition.',
      };
    } catch {
      return { id: 'windows', name: 'Windows text recognition', description: 'Built into Windows. Runs on this computer, offline.', languages: [], available: false, reason: 'Windows text recognition could not be started.' };
    }
  }

  async function nativeEngines() {
    const found = await Promise.all([windowsInfo()]);
    return found.filter(Boolean);
  }

  async function recognizeWindows(bytes, language) {
    const state = await startWorker();
    const file = path.join(tmpDir, `arabic-reader-ocr-${process.pid}-${++counter}.png`);
    await fs.writeFile(file, Buffer.from(bytes));
    try {
      const job = chain.then(() => ask(state, `${language}|${file}`, REQUEST_TIMEOUT_MS));
      chain = job.then(() => undefined);
      const reply = await job;
      if (reply.error) throw new Error(reply.error);
      return reply;
    } finally {
      await fs.rm(file, { force: true });
    }
  }

  function checkImage(bytes) {
    if (!bytes || typeof bytes.byteLength !== 'number' || bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('Not a usable image.');
  }

  return {
    /** The operating system's engines: `{ id, name, description, languages, available, reason? }`. */
    list: nativeEngines,

    /** One of those engines reads a PNG. Returns `{ words: [{ text, x, y, w, h }], ms }`, boxes in image pixels. */
    async recognize(id, bytes, language) {
      checkImage(bytes);
      if (typeof language !== 'string' || !/^[A-Za-z0-9-]{2,16}$/.test(language)) throw new Error('Invalid language.');
      if (id === 'windows' && platform === 'win32') return recognizeWindows(bytes, language);
      throw new Error('That text recognition engine is not available here.');
    },

    /** Posts a PNG to an address the reader added and returns its JSON answer, unread by us. */
    async http(url, bytes, language) {
      checkImage(bytes);
      let target;
      try {
        target = new URL(url);
      } catch {
        throw new Error('That address is not valid.');
      }
      if (target.protocol !== 'http:' && target.protocol !== 'https:') throw new Error('Use an http or https address.');
      if (language) target.searchParams.set('lang', String(language).slice(0, 16));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetchImpl(target, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: Buffer.from(bytes), signal: controller.signal });
        if (!response.ok) throw new Error(`The engine answered ${response.status}.`);
        const text = await response.text();
        if (text.length > MAX_REPLY_BYTES) throw new Error('The engine\'s answer was too large.');
        return JSON.parse(text);
      } catch (error) {
        if (error && error.name === 'AbortError') throw new Error('The engine did not answer in time.');
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },

    /** Stops the worker (app quit). */
    dispose() {
      worker?.child.kill();
      worker = null;
      starting = null;
    },
  };
}

module.exports = { createOcrEngines };
