import JSZip from 'jszip';

export interface Chapter {
  title: string;
  /** Body content as XHTML-safe markup (already sanitised). */
  html: string;
}

export interface EpubImage {
  /** Path inside the book's content folder, e.g. `images/img1.png`. */
  path: string;
  data: Blob | Uint8Array;
  type: string;
}

export interface EpubInput {
  title: string;
  author?: string;
  /** BCP 47 code; `ar` when the text is mostly Arabic. */
  language: string;
  rtl: boolean;
  chapters: Chapter[];
  cover?: EpubImage;
  images?: EpubImage[];
}

export const escapeXml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const chapterFile = (i: number) => `chapter-${String(i + 1).padStart(4, '0')}.xhtml`;

/**
 * Writes a minimal EPUB 3 (with an EPUB 2 NCX so older readers still get a table of contents):
 * one XHTML file per chapter, a nav document, and optional images and cover. Every converter in
 * this folder produces chapters and hands them here, so a converted book is an ordinary EPUB.
 */
export async function writeEpub(input: EpubInput): Promise<Blob> {
  if (!input.chapters.length) throw new Error('This file has no text to read.');
  const id = `urn:uuid:${crypto.randomUUID()}`;
  const dir = input.rtl ? 'rtl' : 'ltr';
  const lang = escapeXml(input.language);
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    '<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'
  );

  input.chapters.forEach((chapter, i) => {
    zip.file(
      `OEBPS/${chapterFile(i)}`,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}" dir="${dir}">
<head><meta charset="UTF-8"/><title>${escapeXml(chapter.title)}</title></head>
<body dir="${dir}">
${chapter.html}
</body>
</html>`
    );
  });

  const images = [...(input.images ?? []), ...(input.cover ? [input.cover] : [])];
  for (const image of images) zip.file(`OEBPS/${image.path}`, image.data);

  const navItems = input.chapters.map((c, i) => `<li><a href="${chapterFile(i)}">${escapeXml(c.title)}</a></li>`).join('\n');
  zip.file(
    'OEBPS/nav.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}" dir="${dir}">
<head><meta charset="UTF-8"/><title>${escapeXml(input.title)}</title></head>
<body><nav epub:type="toc" id="toc"><ol>
${navItems}
</ol></nav></body>
</html>`
  );

  const navPoints = input.chapters
    .map((c, i) => `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${escapeXml(c.title)}</text></navLabel><content src="${chapterFile(i)}"/></navPoint>`)
    .join('\n');
  zip.file(
    'OEBPS/toc.ncx',
    `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${id}"/></head>
<docTitle><text>${escapeXml(input.title)}</text></docTitle>
<navMap>
${navPoints}
</navMap></ncx>`
  );

  const manifest = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    ...input.chapters.map((_, i) => `<item id="c${i + 1}" href="${chapterFile(i)}" media-type="application/xhtml+xml"/>`),
    ...(input.images ?? []).map((img, i) => `<item id="img${i + 1}" href="${escapeXml(img.path)}" media-type="${escapeXml(img.type)}"/>`),
    ...(input.cover ? [`<item id="cover-image" href="${escapeXml(input.cover.path)}" media-type="${escapeXml(input.cover.type)}" properties="cover-image"/>`] : []),
  ].join('\n');
  const spine = input.chapters.map((_, i) => `<itemref idref="c${i + 1}"/>`).join('');
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">${id}</dc:identifier>
<dc:title>${escapeXml(input.title)}</dc:title>
${input.author ? `<dc:creator>${escapeXml(input.author)}</dc:creator>` : ''}
<dc:language>${lang}</dc:language>
<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
${input.cover ? '<meta name="cover" content="cover-image"/>' : ''}
</metadata>
<manifest>
${manifest}
</manifest>
<spine toc="ncx" page-progression-direction="${dir}">${spine}</spine>
</package>`
  );

  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE' });
}
