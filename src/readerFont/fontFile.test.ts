import { describe, expect, it } from 'vitest';
import { familyFromFileName, readFontFileInfo } from './fontFile';

type NameRecord = { platform: number; language: number; id: number; text: string };

function utf16be(text: string): number[] {
  return Array.from(text).flatMap((ch) => [ch.charCodeAt(0) >> 8, ch.charCodeAt(0) & 0xff]);
}

/** A minimal sfnt holding just a `name` table and, optionally, an `OS/2` table. */
function fakeFont(names: NameRecord[], os2?: { weight: number; italic: boolean }, tag = 0x00010000): ArrayBuffer {
  const strings: number[] = [];
  const records = names.map((n) => {
    const bytes = n.platform === 1 ? Array.from(n.text, (c) => c.charCodeAt(0)) : utf16be(n.text);
    const record = { ...n, length: bytes.length, offset: strings.length };
    strings.push(...bytes);
    return record;
  });
  const name: number[] = [];
  const u16 = (out: number[], v: number) => out.push(v >> 8, v & 0xff);
  u16(name, 0);
  u16(name, records.length);
  u16(name, 6 + records.length * 12);
  for (const r of records) [r.platform, r.platform === 3 ? 1 : 0, r.language, r.id, r.length, r.offset].forEach((v) => u16(name, v));
  name.push(...strings);

  const os2Bytes: number[] = [];
  if (os2) {
    for (let i = 0; i < 78; i++) os2Bytes.push(0);
    os2Bytes[4] = os2.weight >> 8;
    os2Bytes[5] = os2.weight & 0xff;
    os2Bytes[63] = os2.italic ? 1 : 0;
  }

  const tables = [{ tag: 'name', data: name }, ...(os2 ? [{ tag: 'OS/2', data: os2Bytes }] : [])];
  const header = 12 + tables.length * 16;
  const out = new Uint8Array(header + tables.reduce((sum, t) => sum + t.data.length, 0));
  const view = new DataView(out.buffer);
  view.setUint32(0, tag);
  view.setUint16(4, tables.length);
  let offset = header;
  tables.forEach((t, i) => {
    const record = 12 + i * 16;
    for (let c = 0; c < 4; c++) view.setUint8(record + c, t.tag.charCodeAt(c));
    view.setUint32(record + 8, offset);
    view.setUint32(record + 12, t.data.length);
    out.set(t.data, offset);
    offset += t.data.length;
  });
  return out.buffer;
}

describe('readFontFileInfo', () => {
  it('reads family, style, weight and italic from the Windows names and OS/2', () => {
    const font = fakeFont(
      [
        { platform: 3, language: 0x409, id: 1, text: 'Lotus Linotype' },
        { platform: 3, language: 0x409, id: 2, text: 'Light' },
      ],
      { weight: 300, italic: false }
    );
    expect(readFontFileInfo(font)).toEqual({ family: 'Lotus Linotype', subfamily: 'Light', weight: 300, italic: false });
  });

  it('prefers the typographic family over the legacy one, and English over other languages', () => {
    const font = fakeFont(
      [
        { platform: 3, language: 0x401, id: 16, text: 'أميري' },
        { platform: 3, language: 0x409, id: 16, text: 'Amiri' },
        { platform: 3, language: 0x409, id: 1, text: 'Amiri SemiBold' },
        { platform: 3, language: 0x409, id: 17, text: 'SemiBold Italic' },
      ],
      { weight: 600, italic: true }
    );
    expect(readFontFileInfo(font)).toEqual({ family: 'Amiri', subfamily: 'SemiBold Italic', weight: 600, italic: true });
  });

  it('falls back to Mac names, the style name for italics, and normal weight without OS/2', () => {
    const font = fakeFont(
      [
        { platform: 1, language: 0, id: 1, text: 'Old Naskh' },
        { platform: 1, language: 0, id: 2, text: 'Italic' },
      ],
      undefined,
      0x4f54544f
    );
    expect(readFontFileInfo(font)).toEqual({ family: 'Old Naskh', subfamily: 'Italic', weight: 400, italic: true });
  });

  it('scales 1-9 weights up to CSS weights', () => {
    const font = fakeFont([{ platform: 3, language: 0x409, id: 1, text: 'X' }], { weight: 7, italic: false });
    expect(readFontFileInfo(font)?.weight).toBe(700);
  });

  it('returns null for files it cannot read', () => {
    const woff2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0, 0, 0, 0, 0]).buffer;
    expect(readFontFileInfo(woff2)).toBeNull();
    expect(readFontFileInfo(new ArrayBuffer(3))).toBeNull();
    expect(readFontFileInfo(fakeFont([]))).toBeNull();
  });
});

describe('familyFromFileName', () => {
  it('turns a file name into something readable', () => {
    expect(familyFromFileName('alfont_com_Lotus-Light.ttf')).toBe('alfont com Lotus Light');
    expect(familyFromFileName('.woff2')).toBe('Uploaded font');
  });
});
