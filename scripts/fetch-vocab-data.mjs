#!/usr/bin/env node
/**
 * One-command setup for the Vocabulary Levels feature's data file.
 *
 * The bundled dataset (CAMeL Arabic Frequency Lists, MSA, ~65MB
 * compressed / 228MB raw) is too large to ship inside this project's
 * delivered zip, and manually downloading + unzipping + re-gzipping it by
 * hand is tedious and error-prone (a very easy mistake is renaming the
 * downloaded .zip straight to .gzbin without actually converting it,
 * which produces a file that LOOKS right but isn't gzip data at all —
 * the app then fails with a cryptic "incorrect header check" error).
 *
 * This script does the whole thing in one step, using only Node's
 * built-in `fetch` and `zlib` — no external unzip/gzip tools, no extra
 * npm dependencies, works the same on macOS/Linux/Windows.
 *
 * Usage:  node scripts/fetch-vocab-data.mjs
 *     or: npm run setup:vocab-data
 */

import { mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { gzipSync, gunzipSync, inflateRawSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RELEASE_URL =
  'https://github.com/CAMeL-Lab/Camel_Arabic_Frequency_Lists/releases/download/v1.0/MSA_freq_lists.tsv.zip';
const OUT_PATH = path.join(__dirname, '..', 'public', 'frequency-data', 'MSA_freq_lists.tsv.gzbin');

/**
 * Minimal ZIP reader — just enough to pull one named entry out of a
 * standard (DEFLATE-compressed, non-encrypted, single-disk) archive via
 * its central directory. Good enough for this one known file; not a
 * general-purpose ZIP library.
 */
function extractZipEntry(zipBuf, wantSuffix) {
  // End Of Central Directory record: signature 0x06054b50, search backward
  // from the end (a ZIP comment, if any, sits after it — up to 64KB).
  const EOCD_SIG = 0x06054b50;
  let eocdOffset = -1;
  const searchStart = Math.max(0, zipBuf.length - 65557);
  for (let i = zipBuf.length - 22; i >= searchStart; i--) {
    if (zipBuf.readUInt32LE(i) === EOCD_SIG) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error('Not a valid ZIP file (no End Of Central Directory record found)');

  const cdEntryCount = zipBuf.readUInt16LE(eocdOffset + 10);
  const cdOffset = zipBuf.readUInt32LE(eocdOffset + 16);

  const CD_SIG = 0x02014b50;
  let offset = cdOffset;
  for (let i = 0; i < cdEntryCount; i++) {
    if (zipBuf.readUInt32LE(offset) !== CD_SIG) throw new Error('Malformed ZIP central directory entry');
    const compressionMethod = zipBuf.readUInt16LE(offset + 10);
    const compressedSize = zipBuf.readUInt32LE(offset + 20);
    const uncompressedSize = zipBuf.readUInt32LE(offset + 24);
    const nameLen = zipBuf.readUInt16LE(offset + 28);
    const extraLen = zipBuf.readUInt16LE(offset + 30);
    const commentLen = zipBuf.readUInt16LE(offset + 32);
    const localHeaderOffset = zipBuf.readUInt32LE(offset + 42);
    const name = zipBuf.toString('utf8', offset + 46, offset + 46 + nameLen);

    if (name.endsWith(wantSuffix) && !name.includes('__MACOSX')) {
      // Local file header precedes the actual data; its own name/extra
      // field lengths (not necessarily identical to the central
      // directory's) determine where the data actually starts.
      const LFH_SIG = 0x04034b50;
      if (zipBuf.readUInt32LE(localHeaderOffset) !== LFH_SIG) throw new Error('Malformed ZIP local file header');
      const lfhNameLen = zipBuf.readUInt16LE(localHeaderOffset + 26);
      const lfhExtraLen = zipBuf.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + lfhNameLen + lfhExtraLen;
      const compressed = zipBuf.subarray(dataStart, dataStart + compressedSize);

      let data;
      if (compressionMethod === 0) data = compressed.subarray(0, uncompressedSize); // stored, no compression
      else if (compressionMethod === 8) data = inflateRawSync(compressed); // DEFLATE — the normal case
      else throw new Error(`Unsupported ZIP compression method ${compressionMethod} for "${name}"`);

      if (data.length !== uncompressedSize) {
        throw new Error(
          `Extracted "${name}" is ${data.length} bytes but the ZIP's own central directory says it should be ` +
            `${uncompressedSize} bytes — the download is likely truncated or corrupted. Delete any partial ` +
            'download and re-run this script (check your network connection).'
        );
      }
      return data;
    }

    offset += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`No entry ending in "${wantSuffix}" found in the ZIP archive`);
}

async function main() {
  console.log(`Downloading ${RELEASE_URL} ...`);
  const res = await fetch(RELEASE_URL);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const zipBuf = Buffer.from(await res.arrayBuffer());
  console.log(`Downloaded ${(zipBuf.length / 1e6).toFixed(1)}MB, extracting...`);

  // GitHub always sends Content-Length for release-asset downloads; if the
  // stream got cut short (flaky connection, proxy, timeout) the buffer we
  // actually got will be smaller than what was promised. Catching that here
  // — before we try to parse it as a ZIP — gives a much clearer error than
  // "no End Of Central Directory record found".
  const expectedLen = Number(res.headers.get('content-length') || 0);
  if (expectedLen > 0 && zipBuf.length !== expectedLen) {
    throw new Error(
      `Download is incomplete: got ${zipBuf.length} bytes but the server said to expect ${expectedLen}. ` +
        'This usually means the connection dropped partway through. Re-run this script — if it keeps ' +
        'happening, try a more stable connection.'
    );
  }

  const tsvBuf = extractZipEntry(zipBuf, '.tsv');
  console.log(`Extracted ${(tsvBuf.length / 1e6).toFixed(1)}MB of raw text, compressing for the app...`);

  const gz = gzipSync(tsvBuf, { level: 9 });

  // Verify the gzip we're about to write actually round-trips before it
  // ever touches the real output path — a corrupt write here is exactly
  // what produces the "not valid gzip data" error inside the app later,
  // and it's much better to catch it now than to have it show up as a
  // confusing in-app error after the fact.
  if (gz.length < 2 || gz[0] !== 0x1f || gz[1] !== 0x8b) {
    throw new Error('Internal error: the data we just gzip-compressed does not start with gzip magic bytes.');
  }
  const roundTrip = gunzipSync(gz);
  if (!roundTrip.equals(tsvBuf)) {
    throw new Error('Internal error: re-decompressing the gzip output did not match the extracted data.');
  }

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  // Write to a temp file first and rename into place atomically, so a
  // process interrupted mid-write (Ctrl-C, crash, disk full) can never
  // leave a half-written, invalid file sitting at OUT_PATH for the app to
  // trip over later — the app will always see either the old file (if any)
  // or a complete, verified new one.
  const tmpPath = `${OUT_PATH}.tmp-${process.pid}`;
  try {
    await writeFile(tmpPath, gz);
    await rename(tmpPath, OUT_PATH);
  } catch (err) {
    await unlink(tmpPath).catch(() => {});
    throw err;
  }

  console.log(`Done — wrote ${(gz.length / 1e6).toFixed(1)}MB to ${path.relative(process.cwd(), OUT_PATH)}`);
  console.log('Verified: file starts with gzip magic bytes and decompresses back to the extracted data correctly.');
  console.log('Restart `npm run dev` (or rebuild) and "Enable vocabulary levels" in Settings will work.');
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  console.error(
    '\nNo file was written (or the previous file was left untouched) — it is safe to just re-run ' +
      '`npm run setup:vocab-data` after fixing the issue above.'
  );
  process.exitCode = 1;
});
