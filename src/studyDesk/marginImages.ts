import { getBlobStore } from '../blobStore';
import { updateItem } from './deskStore';
import type { DeskItem } from './types';

/**
 * Images in the margins: pasted into a margin note, or dropped on a margin or a note. The bytes go to the
 * BlobStore (namespace "desk", owner = the item) and the item keeps the hash, as region capture does.
 */

/** The first image file in a paste or a drop, if any. */
export function imageIn(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const f of Array.from(data.files ?? [])) if (/^image\//.test(f.type)) return f;
  for (const it of Array.from(data.items ?? [])) {
    if (it.kind === 'file' && /^image\//.test(it.type)) {
      const f = it.getAsFile();
      if (f) return f;
    }
  }
  return null;
}

/** A drag that carries files (their types are only readable on drop). */
export const carriesFiles = (data: DataTransfer | null): boolean => !!data && Array.from(data.types ?? []).includes('Files');

/** Puts an image on an item, replacing one it had. A plain margin note becomes a screenshot item. */
export async function attachImage(item: DeskItem, image: Blob): Promise<void> {
  const store = getBlobStore();
  const ref = await store.put(image, { ns: 'desk', owner: item.id, type: image.type || 'image/png' });
  if (item.imageHash && item.imageHash !== ref.hash) await store.unpin(item.imageHash, 'desk', item.id).catch(() => undefined);
  await updateItem(item.id, { imageHash: ref.hash, ...(item.type === 'line' ? { type: 'capture' as const } : {}) });
}
