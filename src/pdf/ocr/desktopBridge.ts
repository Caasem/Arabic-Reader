import type { DesktopOcrBridge } from '../../sync/desktopBridge';

/** The desktop app's text-recognition bridge (electron/preload.cjs), absent in a browser and on phones. */
export const getDesktopOcr = (): DesktopOcrBridge | undefined => (typeof window === 'undefined' ? undefined : window.arabicReaderDesktop?.ocr);
