import { unzlibSync } from 'fflate';
import type { Chapter, EpubImage } from './epubWriter';
import { bodyToXhtml } from './html';

export class ProtectedBookError extends Error {
  constructor() {
    super('This Kindle book is protected (DRM). Arabic Reader can only open books without DRM.');
    this.name = 'ProtectedBookError';
  }
}

interface FoliateSection {
  createDocument(): Promise<Document>;
}
interface FoliateTocItem {
  label: string;
  href: string;
  subitems?: FoliateTocItem[];
}
interface FoliateBook {
  sections: FoliateSection[];
  toc?: FoliateTocItem[];
  metadata: { title?: string; author?: string[]; language?: string };
  getCover(): Promise<Blob | undefined>;
  resolveHref(href: string): { index: number } | Promise<{ index: number } | undefined> | undefined;
  mobi: { headers: { palmdoc: { encryption: number } } };
}

const IMAGE_TYPES: Record<string, string> = { '\x89PNG': 'image/png', '\xff\xd8\xff': 'image/jpeg', GIF8: 'image/gif' };

function sniffImageType(bytes: Uint8Array): { type: string; ext: string } {
  const head = String.fromCharCode(...bytes.subarray(0, 4));
  for (const [magic, type] of Object.entries(IMAGE_TYPES)) if (head.startsWith(magic)) return { type, ext: type.split('/')[1] };
  return { type: 'image/jpeg', ext: 'jpg' };
}

/**
 * MOBI and AZW3 (KF8) → chapters, using foliate-js's parser (MIT). Each section of the book
 * becomes a chapter, titled from the book's table of contents where it has an entry. Images inside
 * the book are kept; nothing is fetched. DRM-protected files are refused.
 */
export async function mobiToChapters(file: Blob): Promise<{ title?: string; author?: string; language?: string; chapters: Chapter[]; images: EpubImage[]; cover?: EpubImage }> {
  // Loaded only when a Kindle file is imported.
  const { MOBI } = (await import('foliate-js/mobi.js')) as unknown as { MOBI: new (o: { unzlib: (a: Uint8Array) => Uint8Array }) => { open(f: Blob): Promise<FoliateBook> } };
  const book = await new MOBI({ unzlib: unzlibSync }).open(file);
  if (book.mobi?.headers?.palmdoc?.encryption) throw new ProtectedBookError();

  // Chapter titles from the table of contents: the first entry that lands in each section.
  const titles = new Map<number, string>();
  const walk = async (items: FoliateTocItem[] = []) => {
    for (const item of items) {
      try {
        const index = (await book.resolveHref(item.href))?.index;
        if (index != null && index >= 0 && !titles.has(index) && item.label.trim()) titles.set(index, item.label.trim());
      } catch {
        // An entry pointing nowhere is skipped.
      }
      await walk(item.subitems);
    }
  };
  await walk(book.toc);

  const images: EpubImage[] = [];
  const imagePaths = new Map<string, string>();
  const chapters: Chapter[] = [];
  for (let i = 0; i < book.sections.length; i++) {
    const doc = await book.sections[i].createDocument();
    // Section images are blob: URLs made by the parser; copy their bytes into the new book.
    for (const img of Array.from(doc.querySelectorAll('img[src^="blob:"]'))) {
      const src = img.getAttribute('src')!;
      let path = imagePaths.get(src);
      if (!path) {
        const bytes = new Uint8Array(await (await fetch(src)).arrayBuffer());
        const { type, ext } = sniffImageType(bytes);
        path = `images/img${images.length + 1}.${ext}`;
        images.push({ path, data: bytes, type });
        imagePaths.set(src, path);
      }
      img.setAttribute('src', path);
    }
    const { html } = bodyToXhtml(doc, (src) => src.startsWith('images/'));
    if (!html.replace(/<[^>]+>/g, '').trim() && !/<img/.test(html)) continue;
    chapters.push({ title: titles.get(i) ?? `Part ${chapters.length + 1}`, html });
  }

  let cover: EpubImage | undefined;
  const coverBlob = await book.getCover().catch(() => undefined);
  if (coverBlob) {
    const bytes = new Uint8Array(await coverBlob.arrayBuffer());
    const { type, ext } = sniffImageType(bytes);
    cover = { path: `images/cover.${ext}`, data: bytes, type };
  }

  return { title: book.metadata.title, author: book.metadata.author?.join(', ') || undefined, language: book.metadata.language, chapters, images, cover };
}
