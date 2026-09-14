import JSZip from 'jszip';
import type { ShamelaPgeContent } from './types';

interface EpubMetadata {
  title: string;
  author?: string;
  language?: string;
}

/**
 * Builds a valid EPUB 2.0 file from Shamela pages.
 * Uses JSZip to create the archive.
 */
export class EpubBuilder {
  private pages: ShamelaPgeContent[] = [];
  private metadata: EpubMetadata;

  constructor(metadata: EpubMetadata) {
    this.metadata = metadata;
  }

  addPage(page: ShamelaPgeContent): void {
    this.pages.push(page);
  }

  addPages(pages: ShamelaPgeContent[]): void {
    this.pages.push(...pages);
  }

  async build(): Promise<Blob> {
    if (this.pages.length === 0) {
      throw new Error('No pages to build EPUB from');
    }

    const zip = new JSZip();

    // 1. mimetype (must be first, uncompressed, exactly 20 bytes)
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

    // 2. META-INF/container.xml
    zip.folder('META-INF')?.file('container.xml', this.generateContainer());

    // 3. OEBPS structure
    const oebps = zip.folder('OEBPS');
    if (!oebps) throw new Error('Failed to create OEBPS folder');

    // Generate content pages
    for (let i = 0; i < this.pages.length; i++) {
      const xhtml = this.pageToXhtml(this.pages[i], i);
      oebps.file(`page_${String(i).padStart(5, '0')}.xhtml`, xhtml);
    }

    // 4. Generate content.opf (package metadata and manifest)
    oebps.file('content.opf', this.generateContentOpf());

    // 5. Generate toc.ncx (table of contents)
    oebps.file('toc.ncx', this.generateTocNcx());

    // Generate the blob
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  }

  private pageToXhtml(page: ShamelaPgeContent, index: number): string {
    // Sanitize and wrap page content in proper XHTML
    const sanitized = this.sanitizeHtml(page.nass);
    const pageNum = page.pageNum || index + 1;

    return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ar" lang="ar" dir="rtl">
<head>
  <meta charset="utf-8"/>
  <title>Page ${pageNum}</title>
  <style>
    body { direction: rtl; font-family: serif; margin: 1em; line-height: 1.6; }
    .page-content { text-align: justify; }
    .page-footer { text-align: center; margin-top: 2em; font-size: 0.9em; color: #999; }
  </style>
</head>
<body>
  <div class="page-content">${sanitized}</div>
  <div class="page-footer">ص. ${pageNum}</div>
</body>
</html>`;
  }

  private sanitizeHtml(html: string): string {
    // Basic HTML sanitization: remove script tags and event handlers
    let sanitized = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
      .replace(/on\w+\s*=\s*[^\s>]*/gi, '');

    // Ensure basic structure
    if (!sanitized.trim()) {
      sanitized = '<p></p>';
    }

    return sanitized;
  }

  private generateContainer(): string {
    return `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  }

  private generateContentOpf(): string {
    const now = new Date().toISOString();
    const pages = this.pages;

    // Generate manifest entries
    let manifest = '';
    for (let i = 0; i < pages.length; i++) {
      const fileName = `page_${String(i).padStart(5, '0')}.xhtml`;
      manifest += `    <item id="page${i}" href="${fileName}" media-type="application/xhtml+xml"/>\n`;
    }
    manifest += `    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`;

    // Generate spine entries
    let spine = '';
    for (let i = 0; i < pages.length; i++) {
      spine += `    <itemref idref="page${i}"/>\n`;
    }

    const author = this.metadata.author || 'Unknown Author';
    const language = this.metadata.language || 'ar';

    return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="uuid" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${this.escapeXml(this.metadata.title)}</dc:title>
    <dc:creator>${this.escapeXml(author)}</dc:creator>
    <dc:language>${language}</dc:language>
    <dc:date>${now}</dc:date>
    <dc:identifier id="uuid">urn:uuid:${this.generateUUID()}</dc:identifier>
  </metadata>
  <manifest>
${manifest}
  </manifest>
  <spine toc="ncx">
${spine}
  </spine>
</package>`;
  }

  private generateTocNcx(): string {
    let navPoints = '';
    for (let i = 0; i < this.pages.length; i++) {
      const pageNum = this.pages[i].pageNum || i + 1;
      navPoints += `    <navPoint id="navPoint${i}" playOrder="${i}">
      <navLabel><text>ص. ${pageNum}</text></navLabel>
      <content src="page_${String(i).padStart(5, '0')}.xhtml"/>
    </navPoint>\n`;
    }

    return `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${this.generateUUID()}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${this.escapeXml(this.metadata.title)}</text></docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`;
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private generateUUID(): string {
    // Simple UUID v4-like generation
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
