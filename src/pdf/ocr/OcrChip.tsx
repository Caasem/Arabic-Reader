import { useEffect, useState } from 'react';
import type { OpenedPdf } from '../pages/pdfjsLoader';
import { pageHasText } from './pageText';
import { useOcrState } from './state';

/** A small chip beside the zoom controls, on scanned pages only: what read the last tap and how it went. */
export function OcrChip({ page, opened }: { page: number; opened: OpenedPdf }) {
  const state = useOcrState();
  const [scanned, setScanned] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void pageHasText(opened, page).then((has) => !cancelled && setScanned(!has));
    return () => {
      cancelled = true;
    };
  }, [opened, page]);
  if (!scanned) return null;
  let label = 'Scanned page · tap a word';
  let tone = '';
  if (state.phase === 'reading') label = `Reading with ${state.engine}…`;
  else if (state.phase === 'done') label = `${state.engine} · ${state.ms} ms`;
  else if (state.phase === 'none' || state.phase === 'error') {
    label = state.message ?? 'Could not read that.';
    tone = ' pdfp-chip--warn';
  }
  return (
    <span className={'pdfp-chip' + tone} role="status" title={state.engine}>
      {label}
    </span>
  );
}
