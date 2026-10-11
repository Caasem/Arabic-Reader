import { useEffect, useRef } from 'react';
import { refreshReaderTools, registerReaderTool } from '../readerTools';

/**
 * The study desk's tools in the shared tool list (src/readerTools): Margins (on or off, Alt+M), Document (D)
 * and Capture (Alt+X). The dock (reader and PDF pages) and the Focus rail show them.
 */

const IconMargins = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M8 4v16M16 4v16" />
  </svg>
);
const IconDocument = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
    <path d="M14 3v6h6M8 13h8M8 17h5" />
  </svg>
);
const IconCapture = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
  </svg>
);

interface Handlers {
  marginsOn: boolean;
  onToggleMargins(): void;
  onDocument(): void;
  onCapture(): void;
}

export function useDeskTools(h: Handlers): void {
  const ref = useRef(h);
  ref.current = h;
  useEffect(() => {
    const offs = [
      registerReaderTool({ id: 'desk:margins', label: 'Ḥāshiya', title: 'Ḥāshiya (the margins) on and off', keys: 'Alt+M', group: 'desk', order: 0, readers: ['clean', 'pdf'], icon: <IconMargins />, isOn: () => ref.current.marginsOn, run: () => ref.current.onToggleMargins() }),
      registerReaderTool({ id: 'desk:document', label: 'Document', title: 'The desk document', keys: 'D', group: 'desk', order: 1, readers: ['clean', 'pdf'], icon: <IconDocument />, run: () => ref.current.onDocument() }),
      registerReaderTool({ id: 'desk:capture', label: 'Capture', title: 'Capture a region of the page', keys: 'Alt+X', group: 'desk', order: 2, readers: ['clean', 'pdf'], noDock: true, icon: <IconCapture />, run: () => ref.current.onCapture() }),
    ];
    return () => offs.forEach((off) => off());
  }, []);
  useEffect(() => refreshReaderTools(), [h.marginsOn]);
}
