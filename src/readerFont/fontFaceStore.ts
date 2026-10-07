import Dexie, { type Table } from 'dexie';
import { getBlobStore, type BlobStore } from '../blobStore';

/** An uploaded font file with its details, as the rest of the font code uses it. */
export interface StoredFace {
  id: string;
  family: string;
  subfamily: string;
  weight: number;
  italic: boolean;
  fileName: string;
  data: Blob;
  addedAt: number;
  /** SHA-256 of the file in the BlobStore. */
  fileHash?: string;
}

/**
 * What the database keeps: the details and a reference to the file, which lives
 * in the BlobStore (namespace `font`, owner = face id). A row written before M1d
 * still has the file inline in `data`; it is moved when the fonts are loaded.
 */
type FaceRow = Omit<StoredFace, 'data'> & { data?: Blob };

/** Kept apart from the main database: uploaded fonts are often licensed to
 * one person, so they stay on the device and out of backups. */
export class FontDB extends Dexie {
  faces!: Table<FaceRow, string>;
  /** `name` is only ever overridden by tests. */
  constructor(name = 'arabic-reader-fonts') {
    super(name);
    this.version(1).stores({ faces: 'id, family, addedAt' });
  }
}

const NS = 'font';

export interface FaceStore {
  /** Every stored face with its file, oldest first. Moves legacy rows into the BlobStore as it goes. */
  load(): Promise<StoredFace[]>;
  /** Stores a face, replacing (and releasing the files of) `replaced`. */
  add(face: StoredFace, replaced: StoredFace[]): Promise<void>;
  /** Removes every face of a family from this device. */
  removeFamily(family: string): Promise<void>;
}

export function createFaceStore(db: FontDB, blobs: () => BlobStore = getBlobStore): FaceStore {
  const toRow = ({ data: _data, ...rest }: StoredFace, fileHash: string): FaceRow => ({ ...rest, fileHash });

  async function readFace(row: FaceRow): Promise<StoredFace | undefined> {
    if (row.data instanceof Blob && !row.fileHash) {
      // Written before M1d. Bytes first, then the one row write that swaps them for a reference.
      try {
        const type = row.data.type;
        const { hash } = await blobs().put(row.data, { ns: NS, owner: row.id, type });
        if (!(await blobs().has(hash))) throw new Error('The stored copy could not be confirmed.');
        await db.faces.put(toRow({ ...row, data: row.data }, hash));
        return { ...row, data: row.data, fileHash: hash };
      } catch (error) {
        console.error(`Font "${row.fileName}" could not be moved to the BlobStore; it keeps working from where it was.`, error);
        return { ...row, data: row.data };
      }
    }
    const data = row.fileHash ? await blobs().get(row.fileHash) : undefined;
    return data ? { ...row, data } : undefined; // bytes gone: the font is skipped, its details stay
  }

  return {
    async load() {
      const rows = await db.faces.orderBy('addedAt').toArray();
      const faces: StoredFace[] = [];
      for (const row of rows) {
        const face = await readFace(row);
        if (face) faces.push(face);
      }
      // References left by a removal that was cut short: nothing is listed for them any more.
      const ids = new Set(rows.map((r) => r.id));
      for await (const ref of blobs().list(NS)) {
        for (const owner of ref.owners) if (!ids.has(owner)) await blobs().unpin(ref.hash, NS, owner);
      }
      return faces;
    },

    async add(face, replaced) {
      const { hash } = await blobs().put(face.data, { ns: NS, owner: face.id, type: face.data.type });
      try {
        await db.transaction('rw', db.faces, async () => {
          await db.faces.bulkDelete(replaced.map((f) => f.id));
          await db.faces.put(toRow(face, hash));
        });
      } catch (error) {
        await blobs().unpin(hash, NS, face.id).catch(() => undefined);
        throw error;
      }
      face.fileHash = hash;
      for (const old of replaced) if (old.fileHash) await blobs().unpin(old.fileHash, NS, old.id);
    },

    async removeFamily(family) {
      const rows = await db.faces.where('family').equals(family).toArray();
      await db.faces.bulkDelete(rows.map((r) => r.id));
      for (const row of rows) if (row.fileHash) await blobs().unpin(row.fileHash, NS, row.id);
    },
  };
}
