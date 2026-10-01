import Dexie, { type Table } from 'dexie';
import { newId } from '../utils/id';
import { familyFromFileName, readFontFileInfo } from './fontFile';
import { buildFontFaceCss, cleanFontName, uploadedCssFamily } from './fontStack';

interface StoredFace {
  id: string;
  family: string;
  subfamily: string;
  weight: number;
  italic: boolean;
  fileName: string;
  data: Blob;
  addedAt: number;
}

/** A font the reader uploaded: one picker entry, however many weights. */
export interface UploadedFont {
  family: string;
  cssFamily: string;
  /** e.g. ["Light", "Bold"]. */
  styles: string[];
}

/** Kept apart from the main database: uploaded fonts are often licensed to
 * one person, so they stay on the device and out of backups. */
class FontDB extends Dexie {
  faces!: Table<StoredFace, string>;
  constructor() {
    super('arabic-reader-fonts');
    this.version(1).stores({ faces: 'id, family, addedAt' });
  }
}

export const MAX_FONT_BYTES = 30 * 1024 * 1024;
const STYLE_ID = 'ar-user-fonts';

let db: FontDB | null = null;
let faces: StoredFace[] = [];
const urls = new Map<string, string>();
let css = '';
/** Replaced (never mutated) on each change, so it works as a React snapshot. */
let state: { loaded: boolean; fonts: UploadedFont[] } = { loaded: false, fonts: [] };
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function database(): FontDB {
  db ??= new FontDB();
  return db;
}

function rebuild(): void {
  for (const [id, url] of urls) {
    if (!faces.some((face) => face.id === id)) {
      URL.revokeObjectURL(url);
      urls.delete(id);
    }
  }
  for (const face of faces) if (!urls.has(face.id)) urls.set(face.id, URL.createObjectURL(face.data));

  css = buildFontFaceCss(
    faces.map((face) => ({ cssFamily: uploadedCssFamily(face.family), url: urls.get(face.id)!, weight: face.weight, italic: face.italic }))
  );
  const byFamily = new Map<string, UploadedFont>();
  for (const face of faces) {
    const entry = byFamily.get(face.family) ?? { family: face.family, cssFamily: uploadedCssFamily(face.family), styles: [] };
    entry.styles.push(face.subfamily);
    byFamily.set(face.family, entry);
  }
  state = { loaded: true, fonts: Array.from(byFamily.values()) };

  if (typeof document !== 'undefined') injectUserFonts(document);
  for (const listener of listeners) listener();
}

/** Reads the stored fonts once; later calls share the same load. */
export function loadUserFonts(): Promise<void> {
  loading ??= database()
    .faces.orderBy('addedAt')
    .toArray()
    .then((stored) => {
      faces = stored;
      rebuild();
    })
    .catch(() => {
      // No IndexedDB (private mode etc.): the built-in fonts still work.
      faces = [];
      rebuild();
    });
  return loading;
}

export function userFontsState(): { loaded: boolean; fonts: UploadedFont[] } {
  return state;
}

export function subscribeUserFonts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Adds (or refreshes) the uploaded fonts' @font-face rules in a document.
 * Book sections are separate documents, so each needs its own copy. */
export function injectUserFonts(doc: Document): void {
  let style = doc.getElementById(STYLE_ID);
  if (!css) {
    style?.remove();
    return;
  }
  if (!style) {
    style = doc.createElement('style');
    style.id = STYLE_ID;
    (doc.head ?? doc.documentElement).appendChild(style);
  }
  if (style.textContent !== css) style.textContent = css;
}

/**
 * Stores a font file and returns the picker entry it belongs to. Re-uploading
 * the same weight of a family replaces it. Throws an Error whose message is
 * meant for the reader.
 */
export async function addUserFont(file: File): Promise<UploadedFont> {
  await loadUserFonts();
  if (file.size > MAX_FONT_BYTES) throw new Error(`"${file.name}" is over ${MAX_FONT_BYTES / 1024 / 1024} MB, too big for a font.`);
  const buffer = await file.arrayBuffer();
  try {
    await new FontFace('ar-font-check', buffer.slice(0)).load();
  } catch {
    throw new Error(`"${file.name}" isn't a font this device can use. Try a .ttf, .otf, .woff or .woff2 file.`);
  }

  const info = readFontFileInfo(buffer);
  const face: StoredFace = {
    id: newId('font'),
    family: cleanFontName(info?.family ?? familyFromFileName(file.name)),
    subfamily: info?.subfamily ?? 'Regular',
    weight: info?.weight ?? 400,
    italic: info?.italic ?? false,
    fileName: file.name,
    data: new Blob([buffer], { type: file.type || 'font/ttf' }),
    addedAt: Date.now(),
  };
  const replaced = faces.filter((f) => f.family === face.family && f.weight === face.weight && f.italic === face.italic);
  const store = database().faces;
  try {
    await database().transaction('rw', store, async () => {
      await store.bulkDelete(replaced.map((f) => f.id));
      await store.put(face);
    });
  } catch {
    throw new Error(`Couldn't save "${file.name}" on this device. Storage may be full or blocked.`);
  }
  faces = [...faces.filter((f) => !replaced.includes(f)), face];
  rebuild();
  return state.fonts.find((font) => font.family === face.family)!;
}

/** Deletes every stored weight of an uploaded family from this device. */
export async function removeUserFont(family: string): Promise<void> {
  await loadUserFonts();
  await database().faces.where('family').equals(family).delete();
  faces = faces.filter((face) => face.family !== family);
  rebuild();
}
