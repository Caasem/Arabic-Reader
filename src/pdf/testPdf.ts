/**
 * A tiny PDF writer for tests (unit tests and the e2e spec build their fixtures with it, so no PDF
 * file is committed and no copyrighted text is needed). It draws text with one non-embedded font
 * whose `ToUnicode` map carries the real characters, which is all a text extractor reads. Not used
 * by the app itself.
 */

export interface PdfTestLine {
  text: string;
  /** Left edge in points; for `rtl` lines the right edge. */
  x: number;
  /** Baseline, in points from the bottom of the page. */
  y: number;
  size?: number;
  /** Arabic line. By default it is written in visual order (reversed), as real producers do. */
  rtl?: boolean;
  /** `logical` writes the characters as given: how a faulty producer ends up with reversed text. */
  order?: 'visual' | 'logical';
}

export interface PdfTestPage {
  lines?: PdfTestLine[];
  /** Draw a full-page image and no text (a scanned page). */
  image?: boolean;
}

export const PAGE_WIDTH = 595;
export const PAGE_HEIGHT = 842;
const GLYPH_ADVANCE = 0.5; // of the font size, set through /Widths

const hex4 = (code: number) => code.toString(16).padStart(4, '0');

/** Width of a line as the writer sets it, so tests can place right-aligned and centred lines. */
export const lineWidth = (text: string, size = 12): number => [...text].length * size * GLYPH_ADVANCE;

export function makePdf(pages: PdfTestPage[], options: { encrypted?: boolean; title?: string } = {}): Uint8Array {
  // One byte code per distinct character, from 33 up (32 is the space).
  const codes = new Map<string, number>([[' ', 32]]);
  for (const page of pages) {
    for (const line of page.lines ?? []) {
      for (const ch of line.text) {
        if (!codes.has(ch)) codes.set(ch, 33 + codes.size - 1);
      }
    }
  }
  if (codes.size > 223) throw new Error('Too many distinct characters for the one-byte test font.');

  const entries = [...codes.entries()];
  const chunks: string[] = [];
  for (let i = 0; i < entries.length; i += 100) {
    const part = entries.slice(i, i + 100).map(([ch, code]) => `<${code.toString(16).padStart(2, '0')}> <${[...ch].map((c) => hex4(c.codePointAt(0)!)).join('')}>`);
    chunks.push(`${part.length} beginbfchar\n${part.join('\n')}\nendbfchar`);
  }
  const cmap = `/CIDInit /ProcSet findresource begin 12 dict begin begincmap
/CMapName /Adobe-Identity-UCS def /CMapType 2 def
1 begincodespacerange <00> <FF> endcodespacerange
${chunks.join('\n')}
endcmap CMapName currentdict /CMap defineresource pop end end`;

  const lastChar = Math.max(...codes.values());
  const widths = Array.from({ length: lastChar - 31 }, () => GLYPH_ADVANCE * 1000).join(' ');

  const objects: string[] = [];
  const add = (body: string) => objects.push(body) && objects.length;
  const catalog = add('<< /Type /Catalog /Pages 2 0 R >>');
  add(''); // pages, filled below
  add(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /FirstChar 32 /LastChar ${lastChar} /Widths [${widths}] /ToUnicode 4 0 R >>`);
  add(`<< /Length ${cmap.length} >>\nstream\n${cmap}\nendstream`);
  add('<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 1 >>\nstream\n\x80\nendstream');

  const kids: number[] = [];
  for (const page of pages) {
    const ops: string[] = [];
    if (page.image) ops.push(`q ${PAGE_WIDTH} 0 0 ${PAGE_HEIGHT} 0 0 cm /Im0 Do Q`);
    for (const line of page.lines ?? []) {
      const size = line.size ?? 12;
      const visual = line.rtl && line.order !== 'logical' ? [...line.text].reverse() : [...line.text];
      const x = line.rtl ? line.x - lineWidth(line.text, size) : line.x;
      const bytes = visual.map((ch) => codes.get(ch)!.toString(16).padStart(2, '0')).join('');
      ops.push(`BT /F1 ${size} Tf ${x.toFixed(2)} ${line.y.toFixed(2)} Td <${bytes}> Tj ET`);
    }
    const content = ops.join('\n');
    const contentId = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const pageId = add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R >> /XObject << /Im0 5 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    kids.push(pageId);
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;

  let encryptRef = '';
  if (options.encrypted) {
    // A standard-security-handler dictionary with a user password set: the empty password fails its check.
    const id = add(`<< /Filter /Standard /V 1 /R 2 /O <${'ab'.repeat(32)}> /U <${'cd'.repeat(32)}> /P -4 >>`);
    encryptRef = ` /Encrypt ${id} 0 R /ID [<${'01'.repeat(16)}> <${'01'.repeat(16)}>]`;
  }
  let infoRef = '';
  if (options.title) {
    const id = add(`<< /Title <FEFF${[...options.title].map((c) => hex4(c.charCodeAt(0))).join('')}> >>`);
    infoRef = ` /Info ${id} 0 R`;
  }

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R${encryptRef}${infoRef} >>\nstartxref\n${xref}\n%%EOF\n`;
  // Latin-1 bytes: the image byte above 0x7f must stay one byte.
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}

/** A small Arabic text PDF for e2e tests: one chapter heading and two paragraphs on each of three pages, drawn right to left. */
export function sampleArabicBookPdf(): Uint8Array {
  const sentences = [
    'ذهب الولد الصغير إلى المدرسة في الصباح الباكر مع أخيه الكبير وكان الطريق طويلا بين البيوت القديمة والأشجار العالية.',
    'رجع الولد إلى البيت بعد الظهر وجلس مع أمه في الحديقة الجميلة وحكى لها قصة الكتاب الجديد.',
  ];
  const wrap = (text: string) => {
    const out: string[] = [];
    let line = '';
    for (const word of text.split(' ')) {
      if (line && line.length + word.length + 1 > 56) {
        out.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    return [...out, line];
  };
  const pages = ['الفصل الأول', 'الفصل الثاني', 'الفصل الثالث'].map((title) => {
    const lines: PdfTestLine[] = [{ text: title, x: 540, y: 720, size: 22, rtl: true }];
    let y = 680;
    for (const sentence of sentences) {
      wrap(sentence).forEach((text, i) => lines.push({ text, x: i === 0 ? 516 : 540, y: (y -= 18), rtl: true }));
      y -= 14;
    }
    return { lines };
  });
  return makePdf(pages, { title: 'كتاب القراءة' });
}
