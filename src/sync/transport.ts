/**
 * Where the synced files live. The engine only ever creates new files and
 * deletes its own, so a transport needs no locking: implementations map onto a
 * plain folder (Electron fs, Android's file picker, ...).
 *
 * Paths are relative, forward-slashed, `<deviceId>/<file>`.
 */
export interface SyncTransport {
  /** Every file path in the synced folder. */
  list(): Promise<string[]>;
  read(path: string): Promise<string>;
  /** Create a file. Must fail if it already exists: files are immutable. */
  write(path: string, text: string): Promise<void>;
  remove(path: string): Promise<void>;
}

/** In-memory transport, shared between engines in tests to stand in for a cloud folder. */
export function memoryTransport(files: Map<string, string> = new Map()): SyncTransport & { files: Map<string, string> } {
  return {
    files,
    list: async () => [...files.keys()].sort(),
    read: async (path) => {
      const text = files.get(path);
      if (text === undefined) throw new Error(`No such file: ${path}`);
      return text;
    },
    write: async (path, text) => {
      if (files.has(path)) throw new Error(`File already exists: ${path}`);
      files.set(path, text);
    },
    remove: async (path) => void files.delete(path),
  };
}
