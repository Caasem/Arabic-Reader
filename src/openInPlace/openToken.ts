import { persistenceService } from '../persistence';
import type { DesktopFilesBridge } from '../sync/desktopBridge';
import type { BookMeta } from '../types';
import { newId } from '../utils/id';

/** What opening needs from outside, so it can be tested without a desktop app, pdf.js or epub.js. */
export interface OpenDeps {
  files: Pick<DesktopFilesBridge, 'describe' | 'read'>;
  /** A PDF's page count, and its title and author when its metadata has real ones. */
  pdfInfo(bytes: Uint8Array): Promise<{ pages: number; title?: string; author?: string }>;
  /** An EPUB's title, author, language and cover. */
  epubInfo(file: Blob): Promise<{ title?: string; author?: string; language?: string; coverDataUrl?: string }>;
}

const stripExt = (name: string) => name.replace(/\.[^.]+$/, '');

/** pdf.js and epub.js, loaded only when a file is opened in place. */
export function defaultOpenDeps(files: OpenDeps['files']): OpenDeps {
  return {
    files,
    async pdfInfo(bytes) {
      const [{ loadPdfDeps }, { readPdfInfo }] = await Promise.all([import('../pdf/import/browser'), import('../pdf/import/convert')]);
      const pdf = await (await loadPdfDeps()).openDocument(bytes);
      try {
        const info = readPdfInfo((await pdf.getMetadata().catch(() => ({ info: undefined }))).info);
        return { pages: pdf.numPages, ...info };
      } finally {
        await pdf.destroy().catch(() => {});
      }
    },
    async epubInfo(file) {
      const { readEpubInfo } = await import('../library/libraryService');
      const { metadata, coverDataUrl } = await readEpubInfo(file);
      return { title: metadata.title, author: metadata.creator, language: metadata.language, coverDataUrl };
    },
  };
}

/**
 * The book for a file the OS or a dialog handed over (a token from the main process): the record that already has this
 * file's hash, else a new one marked `inPlace`. Nothing is copied into the app's storage. A PDF is pages only
 * (`reflow: 'skipped'`); an EPUB keeps its hash in `fileHash`, as a library book does.
 */
export async function openToken(token: string, deps: OpenDeps): Promise<BookMeta> {
  const info = await deps.files.describe(token);
  const isPdf = info.ext === 'pdf';
  if (!isPdf && info.ext !== 'epub') throw new Error(`"${info.name}" can't be opened in place. Add it to the library instead.`);

  const existing = isPdf ? await persistenceService.getBookByPdfOriginalHash(info.hash) : await persistenceService.getBookByFileHash(info.hash);
  if (existing) return existing;

  const bytes = await deps.files.read(token);
  const base = { id: newId('book'), addedAt: Date.now(), sizeBytes: info.size, originalFileName: info.name, inPlace: true } as const;
  let meta: BookMeta;
  if (isPdf) {
    let pdf;
    try {
      pdf = await deps.pdfInfo(bytes);
    } catch (e) {
      throw new Error(e instanceof Error && e.name === 'PasswordException' ? 'This PDF is password-protected.' : 'This PDF could not be opened.');
    }
    meta = { ...base, title: pdf.title || stripExt(info.name), author: pdf.author, format: 'pdf', pdf: { pages: pdf.pages, reflow: 'skipped', originalHash: info.hash } };
  } else {
    const epub = await deps.epubInfo(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/epub+zip' })).catch(() => {
      throw new Error('This EPUB could not be opened.');
    });
    meta = {
      ...base,
      title: epub.title || stripExt(info.name),
      author: epub.author || undefined,
      language: epub.language || undefined,
      coverDataUrl: epub.coverDataUrl,
      format: 'epub',
      fileHash: info.hash,
    };
  }
  await persistenceService.saveBookRecord(meta);
  return meta;
}
