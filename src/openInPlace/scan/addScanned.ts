export interface AddSummary {
  added: number;
  /** Already in the library. */
  duplicates: number;
  /** One message per file that could not be added. */
  failed: string[];
}

export interface AddDeps {
  /** The bytes of a found file, from the main process. */
  read(path: string): Promise<Uint8Array>;
  /** The ordinary import. Throws a duplicate error for a book the library already has. */
  importFile(file: File): Promise<unknown>;
  isDuplicate(error: unknown): boolean;
}

const nameOf = (path: string) => path.split(/[\\/]/).pop() ?? path;

/** Adds the chosen scan results to the library one by one, the ordinary way, and counts how it went. */
export async function addScanned(paths: string[], deps: AddDeps, onStep?: (done: number, total: number, name: string) => void): Promise<AddSummary> {
  const summary: AddSummary = { added: 0, duplicates: 0, failed: [] };
  for (const [i, path] of paths.entries()) {
    const name = nameOf(path);
    onStep?.(i, paths.length, name);
    try {
      const bytes = await deps.read(path);
      await deps.importFile(new File([bytes as Uint8Array<ArrayBuffer>], name));
      summary.added++;
    } catch (e) {
      if (deps.isDuplicate(e)) summary.duplicates++;
      else summary.failed.push(`${name}: ${e instanceof Error ? e.message : 'could not be added.'}`);
    }
  }
  return summary;
}

/** One plain sentence for the end of an add. */
export function describeAdd(s: AddSummary): string {
  const parts: string[] = [];
  if (s.added) parts.push(`Added ${s.added} ${s.added === 1 ? 'book' : 'books'}`);
  if (s.duplicates) parts.push(`${s.duplicates} already in your library`);
  if (s.failed.length) parts.push(`${s.failed.length} could not be added`);
  return parts.length ? parts.join(', ') + '.' : 'Nothing was added.';
}
