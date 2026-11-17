import { useState } from 'react';
import { getFilesBridge } from '../sync/desktopBridge';
import type { BookMeta } from '../types';
import { inPlaceHash } from './promote';

/**
 * The line on a Library card for a book opened in place: "On this computer" while the file is there; when it is not,
 * "File not found" with Find it… (a file dialog; the chosen file must be the same file) and Remove.
 */
export function InPlaceNote({ book, found, onFound, onRemove }: { book: BookMeta; found: boolean | undefined; onFound(): void; onRemove(): void }) {
  const [hint, setHint] = useState<string | null>(null);
  if (found !== false) return <div className="oip-mark">On this computer</div>;

  async function findIt() {
    const hash = inPlaceHash(book);
    if (!hash) return;
    setHint(null);
    const result = await getFilesBridge()?.locate(hash);
    if (result === 'found') onFound();
    else if (result === 'different') setHint('That is not the same file.');
  }

  return (
    <div className="oip-lost">
      <div className="oip-lost__title">File not found</div>
      {hint && <div className="oip-lost__hint">{hint}</div>}
      <div className="oip-lost__actions">
        <button type="button" className="btn btn--ghost" onClick={() => void findIt()}>
          Find it…
        </button>
        <button type="button" className="btn btn--ghost" onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}
