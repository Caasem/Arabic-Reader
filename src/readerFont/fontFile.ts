/** What a font file says about itself, read from its own `name` and `OS/2` tables. */
export interface FontFileInfo {
  /** e.g. "Lotus Linotype" -- several weights of one font share it. */
  family: string;
  /** e.g. "Light", "Bold Italic". */
  subfamily: string;
  /** CSS weight, 100-900. */
  weight: number;
  italic: boolean;
}

const SFNT_TAGS = new Set([0x00010000, 0x4f54544f /* OTTO */, 0x74727565 /* true */]);
const TTC_TAG = 0x74746366; // ttcf

/**
 * Reads the names and weight of a TrueType/OpenType file (or the first font
 * of a collection). Returns null for anything else -- WOFF and WOFF2 compress
 * these tables, so callers fall back to the file name for them.
 */
export function readFontFileInfo(buffer: ArrayBuffer): FontFileInfo | null {
  try {
    const view = new DataView(buffer);
    let start = 0;
    if (view.getUint32(0) === TTC_TAG) start = view.getUint32(12);
    if (!SFNT_TAGS.has(view.getUint32(start))) return null;

    const tables = readTableDirectory(view, start);
    const nameTable = tables.get('name');
    if (!nameTable) return null;
    const names = readNames(view, nameTable);
    const family = names.get(16) || names.get(1);
    if (!family) return null;
    const subfamily = names.get(17) || names.get(2) || 'Regular';

    let weight = 400;
    let italic = /italic|oblique/i.test(subfamily);
    const os2 = tables.get('OS/2');
    if (os2 && os2.length >= 64) {
      weight = normalizeWeight(view.getUint16(os2.offset + 4));
      italic = (view.getUint16(os2.offset + 62) & 1) === 1;
    }
    return { family: family.trim(), subfamily: subfamily.trim(), weight, italic };
  } catch {
    return null;
  }
}

/** "alfont_com_Lotus-Light.ttf" -> "alfont com Lotus Light". */
export function familyFromFileName(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return stem || 'Uploaded font';
}

function readTableDirectory(view: DataView, start: number): Map<string, { offset: number; length: number }> {
  const count = view.getUint16(start + 4);
  const tables = new Map<string, { offset: number; length: number }>();
  for (let i = 0; i < count; i++) {
    const record = start + 12 + i * 16;
    const tag = String.fromCharCode(
      view.getUint8(record),
      view.getUint8(record + 1),
      view.getUint8(record + 2),
      view.getUint8(record + 3)
    );
    const offset = view.getUint32(record + 8);
    const length = view.getUint32(record + 12);
    if (offset + length <= view.byteLength) tables.set(tag, { offset, length });
  }
  return tables;
}

/** The best record per name id: Windows English first, then any Windows or
 * Unicode record, then Mac Roman. */
function readNames(view: DataView, table: { offset: number; length: number }): Map<number, string> {
  const count = view.getUint16(table.offset + 2);
  const stringsAt = table.offset + view.getUint16(table.offset + 4);
  const best = new Map<number, { rank: number; text: string }>();
  for (let i = 0; i < count; i++) {
    const record = table.offset + 6 + i * 12;
    const platform = view.getUint16(record);
    const language = view.getUint16(record + 4);
    const nameId = view.getUint16(record + 6);
    const length = view.getUint16(record + 8);
    const at = stringsAt + view.getUint16(record + 10);
    if (at + length > view.byteLength) continue;

    const rank = platform === 3 ? (language === 0x409 ? 0 : 1) : platform === 0 ? 2 : platform === 1 && language === 0 ? 3 : -1;
    if (rank < 0 || (best.get(nameId)?.rank ?? Infinity) <= rank) continue;
    const bytes = new Uint8Array(view.buffer, view.byteOffset + at, length);
    const text = platform === 1 ? String.fromCharCode(...bytes) : decodeUtf16Be(bytes);
    if (text.trim()) best.set(nameId, { rank, text });
  }
  return new Map(Array.from(best, ([id, { text }]) => [id, text]));
}

function decodeUtf16Be(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) text += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
  return text;
}

/** Some old fonts use a 1-9 scale; CSS wants 100-900. */
function normalizeWeight(raw: number): number {
  const weight = raw > 0 && raw < 10 ? raw * 100 : raw;
  return Math.min(900, Math.max(100, Math.round(weight / 100) * 100 || 400));
}
