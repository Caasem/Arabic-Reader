import JSZip from 'jszip';
import type { Block, Run } from './docExport';
import type { DeskItem } from './types';
import { itemTitle, looksArabic } from './useDesk';

/**
 * The desk document as a Word file (.docx), written directly as Office Open XML: paragraphs, one heading
 * level, lists, quotations, bold and italic, Arabic paragraphs right to left, screenshots as pictures and
 * quotes with their citation. Loaded only when the reader exports (DeskDocument imports it on demand).
 */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Para {
  runs: Run[];
  /** Points (half-points in the XML). */
  size?: number;
  bold?: boolean;
  italic?: boolean;
  /** Left (start) indent in twips. */
  indent?: number;
  /** A rule at the start edge (quotations). */
  rule?: boolean;
  spaceAfter?: number;
  color?: string;
}

function runXml(r: Run, p: Para, rtl: boolean): string {
  const props = [
    `<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Traditional Arabic"/>`,
    r.b || p.bold ? '<w:b/><w:bCs/>' : '',
    r.i || p.italic ? '<w:i/><w:iCs/>' : '',
    r.u ? '<w:u w:val="single"/>' : '',
    p.color ? `<w:color w:val="${p.color}"/>` : '',
    // Arabic reads larger at the same size; the complex-script size is set a step up.
    p.size ? `<w:sz w:val="${p.size * 2}"/><w:szCs w:val="${Math.round(p.size * 2.3)}"/>` : '<w:szCs w:val="26"/>',
    rtl ? '<w:rtl/>' : '',
  ].join('');
  return r.text
    .split('\n')
    .map((part, i) => `${i ? '<w:r><w:br/></w:r>' : ''}<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${esc(part)}</w:t></w:r>`)
    .join('');
}

function paraXml(p: Para): string {
  const text = p.runs.map((r) => r.text).join('');
  const rtl = looksArabic(text);
  const pPr = [
    rtl ? '<w:bidi/>' : '',
    p.rule ? '<w:pBdr><w:left w:val="single" w:sz="18" w:space="10" w:color="A07850"/></w:pBdr>' : '',
    `<w:spacing w:after="${p.spaceAfter ?? 160}"/>`,
    p.indent ? `<w:ind w:left="${p.indent}"/>` : '',
  ].join('');
  return `<w:p><w:pPr>${pPr}</w:pPr>${p.runs.map((r) => runXml(r, p, rtl)).join('')}</w:p>`;
}

interface Picture {
  rid: string;
  file: string;
  data: Blob;
  /** EMU (914400 per inch). */
  cx: number;
  cy: number;
}

function pictureXml(pic: Picture, n: number): string {
  return (
    `<w:p><w:pPr><w:spacing w:after="80"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${pic.cx}" cy="${pic.cy}"/><wp:docPr id="${n}" name="Picture ${n}"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>` +
    `<pic:nvPicPr><pic:cNvPr id="${n}" name="${pic.file}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${pic.rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${pic.cx}" cy="${pic.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
  );
}

/** Word takes PNG and JPEG: an SVG (a sketch sheet's card) is drawn into a PNG first, in the browser. */
async function wordImage(blob: Blob | undefined): Promise<Blob | undefined> {
  if (!blob || blob.type !== 'image/svg+xml') return blob;
  if (typeof document === 'undefined') return undefined;
  const { svgToPng } = await import('../annotate/toMargin');
  return svgToPng(blob).catch(() => undefined);
}

const MAX_WIDTH_EMU = 5486400; // 6 inches, the text width of a letter or A4 page with normal margins

async function sizeOf(blob: Blob): Promise<{ w: number; h: number }> {
  try {
    const bmp = await createImageBitmap(blob);
    const size = { w: bmp.width, h: bmp.height };
    bmp.close();
    return size;
  } catch {
    return { w: 800, h: 600 };
  }
}

/**
 * Builds the .docx. `image` returns a screenshot's bytes (from the BlobStore); a missing one is skipped.
 */
export async function toDocx(title: string, blocks: Block[], image: (hash: string) => Promise<Blob | undefined>): Promise<Blob> {
  const body: string[] = [];
  const pictures: Picture[] = [];
  const cite = (c: string) => (c ? paraXml({ runs: [{ text: `— ${c}` }], size: 10, color: '7A7266', indent: 360, spaceAfter: 200 }) : '');

  body.push(paraXml({ runs: [{ text: title }], size: 22, bold: true, spaceAfter: 240 }));
  for (const b of blocks) {
    if (b.kind === 'heading') body.push(paraXml({ runs: b.runs, size: 15, bold: true, spaceAfter: 120 }));
    else if (b.kind === 'para') body.push(paraXml({ runs: b.runs }));
    else if (b.kind === 'quote') body.push(paraXml({ runs: b.runs, italic: true, rule: true, indent: 360 }));
    else if (b.kind === 'list') b.items.forEach((runs, i) => body.push(paraXml({ runs: [{ text: b.ordered ? `${i + 1}.\t` : '•\t' }, ...runs], indent: 360, spaceAfter: 60 })));
    else body.push(...(await itemXml(b.item, b.cite)));
  }

  async function itemXml(item: DeskItem, c: string): Promise<string[]> {
    const t = itemTitle(item);
    const bodyText = (item.text ? item.body ?? '' : (item.body ?? '').split('\n').slice(1).join('\n')).trim();
    const out: string[] = [];
    if (item.type === 'quote') {
      out.push(paraXml({ runs: [{ text: t }], size: looksArabic(t) ? 14 : 12, rule: true, indent: 360, spaceAfter: 60 }));
      out.push(cite(c));
    } else if (item.type === 'question') out.push(paraXml({ runs: [{ text: 'Question: ', b: true }, { text: t }] }));
    else if (item.type === 'concept' || item.type === 'card') out.push(paraXml({ runs: [{ text: t, b: true }, ...(bodyText ? [{ text: ` — ${bodyText}` }] : [])] }));
    else if (!(item.type === 'capture' && /^Region of page \d+$/.test(t))) out.push(paraXml({ runs: [{ text: t }] }));
    if (item.imageHash) {
      const data = await wordImage(await image(item.imageHash));
      if (data) {
        const { w, h } = await sizeOf(data);
        const cx = Math.min(MAX_WIDTH_EMU, w * 9525);
        const n = pictures.length + 1;
        const pic = { rid: `rIdImg${n}`, file: `image${n}.${data.type === 'image/jpeg' ? 'jpeg' : 'png'}`, data, cx, cy: Math.round((cx * h) / Math.max(1, w)) };
        pictures.push(pic);
        out.push(pictureXml(pic, n));
        if (item.type === 'capture') out.push(cite(c));
      }
    }
    if (bodyText && item.type !== 'concept' && item.type !== 'card') out.push(paraXml({ runs: [{ text: bodyText }] }));
    return out.filter(Boolean);
  }

  const document =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
    `xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
    `xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body.join('')}` +
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
      `<Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
  );
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      pictures.map((p) => `<Relationship Id="${p.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${p.file}"/>`).join('') +
      `</Relationships>`
  );
  zip.file('word/document.xml', document);
  for (const p of pictures) zip.file(`word/media/${p.file}`, p.data);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
