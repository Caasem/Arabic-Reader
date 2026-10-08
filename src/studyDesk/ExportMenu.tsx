import { useEffect, useRef, useState } from 'react';
import { getBlobStore } from '../blobStore';
import { saveFile } from '../utils/saveFile';
import { exportFileName, toMarkdown, toPlainText, type Block } from './docExport';

interface Props {
  title: string;
  /** The document as it is now (saved first by the caller). */
  blocks(): Block[];
  onToast(m: string): void;
}

/** Copy the desk document as text, or save it as Markdown or Word (docExport.ts, docxExport.ts). */
export function ExportMenu({ title, blocks, onToast }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  async function run(kind: 'copy' | 'md' | 'docx') {
    setOpen(false);
    setBusy(true);
    try {
      const b = blocks();
      if (kind === 'copy') {
        await navigator.clipboard.writeText(toPlainText(title, b));
        onToast('Copied as text');
      } else if (kind === 'md') {
        const r = await saveFile(exportFileName(title, 'md'), toMarkdown(title, b), 'text/markdown');
        if (r !== 'cancelled') onToast('Saved as Markdown');
      } else {
        const { toDocx } = await import('./docxExport');
        const blob = await toDocx(title, b, (hash) => getBlobStore().get(hash));
        const r = await saveFile(exportFileName(title, 'docx'), blob);
        if (r !== 'cancelled') onToast('Saved as a Word document');
      }
    } catch {
      onToast(kind === 'copy' ? 'Could not copy: the clipboard is not available here' : 'Could not save the file');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sd-export" ref={ref}>
      <button type="button" className="sd-pill" aria-haspopup="menu" aria-expanded={open} disabled={busy} onClick={() => setOpen((v) => !v)}>
        {busy ? 'Exporting…' : 'Export'}
      </button>
      {open && (
        <div className="sd-export__menu" role="menu" aria-label="Export">
          <button type="button" role="menuitem" onClick={() => void run('copy')}>
            Copy as text
          </button>
          <button type="button" role="menuitem" onClick={() => void run('md')}>
            Save as Markdown <span>.md</span>
          </button>
          <button type="button" role="menuitem" onClick={() => void run('docx')}>
            Save as Word <span>.docx</span>
          </button>
          <p>Quotes and screenshots keep their source. Hidden items are left out.</p>
        </div>
      )}
    </div>
  );
}
