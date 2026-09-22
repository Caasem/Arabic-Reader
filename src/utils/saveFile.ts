export type SaveFileResult = 'downloaded' | 'shared' | 'cancelled';

function isNativeApp(): boolean {
  const capacitor = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!capacitor?.isNativePlatform?.();
}

/**
 * Hands a generated file to the user. In a browser (and Electron) that's an
 * ordinary download. Android/iOS WebViews ignore `<a download>`, so inside
 * the native apps the file goes through the system share sheet instead, when
 * the WebView supports sharing files.
 */
export async function saveFile(filename: string, content: Blob | string, mimeType = 'application/octet-stream'): Promise<SaveFileResult> {
  const blob = typeof content === 'string' ? new Blob([content], { type: mimeType }) : content;

  if (isNativeApp()) {
    const file = new File([blob], filename, { type: blob.type || mimeType });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return 'shared';
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
        throw e;
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking synchronously can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
