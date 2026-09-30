import { useEffect, useRef } from 'react';

/** Marks the search box so a plain Latin "d" typed inside it closes the panel
 * (Arabic-only search never needs one) instead of being typed. */
export const SEARCH_INPUT_ATTR = 'data-dict-search-input';

const TYPING = 'input, textarea, select, [contenteditable="true"]';

function selectedText(target: EventTarget | null): string {
  const doc = (target as Node | null)?.ownerDocument ?? document;
  return doc.defaultView?.getSelection()?.toString().trim() ?? '';
}

/**
 * Calls `onToggle` when D is pressed (no modifiers, not while typing in a
 * field). The epub reader renders each section in its own iframe, whose
 * keystrokes never reach the host window, so this also watches the page for
 * iframes and listens inside each one.
 */
export function useSearchHotkey(enabled: boolean, onToggle: (selection: string) => void): void {
  const toggleRef = useRef(onToggle);
  useEffect(() => {
    toggleRef.current = onToggle;
  });

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'd' && e.key !== 'D') return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing || e.repeat) return;
      const target = e.target as HTMLElement | null;
      const inSearchBox = target?.hasAttribute?.(SEARCH_INPUT_ATTR);
      if (!inSearchBox && target?.closest?.(TYPING)) return;
      e.preventDefault();
      toggleRef.current(inSearchBox ? '' : selectedText(target));
    };

    const attached = new WeakSet<Document>();
    const attach = (frame: HTMLIFrameElement) => {
      try {
        const doc = frame.contentDocument;
        if (!doc || attached.has(doc)) return;
        attached.add(doc);
        doc.addEventListener('keydown', onKeyDown);
      } catch {
        // Cross-origin frame: nothing to listen to.
      }
    };
    const watch = (frame: HTMLIFrameElement) => {
      attach(frame);
      // epub.js swaps in a fresh document for every section.
      frame.addEventListener('load', () => attach(frame));
    };

    window.addEventListener('keydown', onKeyDown);
    document.querySelectorAll('iframe').forEach(watch);
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (node instanceof HTMLIFrameElement) watch(node);
          else if (node instanceof HTMLElement) node.querySelectorAll('iframe').forEach(watch);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      observer.disconnect();
      // Listeners inside iframes die with their documents.
    };
  }, [enabled]);
}
