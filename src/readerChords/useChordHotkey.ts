import { useEffect, useRef } from 'react';

function selectedText(target: EventTarget | null): string {
  const doc = (target as Node | null)?.ownerDocument ?? document;
  return doc.defaultView?.getSelection()?.toString().trim() ?? '';
}

/**
 * Calls `onToggle` on Alt+<key> (`code` is a KeyboardEvent.code such as 'KeyS'), or Shift+Alt+<key> with `shift`.
 * Works while typing too: the chord never types a character. The epub reader
 * renders each section in its own iframe, whose keystrokes never reach the
 * host window, so this also watches the page for iframes and listens in each.
 */
export function useChordHotkey(code: string, enabled: boolean, onToggle: (selection: string) => void, shift = false): void {
  const toggleRef = useRef(onToggle);
  useEffect(() => {
    toggleRef.current = onToggle;
  });

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // e.code, not e.key: with Alt held, Mac layouts report a different character.
      if (e.code !== code || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey !== shift || e.isComposing || e.repeat) return;
      e.preventDefault();
      toggleRef.current(selectedText(e.target));
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
    };
  }, [code, enabled, shift]);
}
