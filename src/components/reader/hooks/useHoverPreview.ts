import { useCallback, useEffect, useRef, useState } from 'react';
import { dictionaryManager } from '../../../dictionary/DictionaryManager';
import { anchorOf, rectInHost } from '../../../reader/wordInteraction/rectInHost';

/** Long enough that a pointer passing over text doesn't flash a preview per word. */
const HOVER_PREVIEW_DELAY_MS = 200;
const HOVER_PREVIEW_MAX_CHARS = 42;

export interface HoverPreviewState {
  x: number;
  y: number;
  gloss: string;
}

/** The condensed translation shown while hovering a word (opt-in). */
export function useHoverPreview() {
  const [preview, setPreview] = useState<HoverPreviewState | null>(null);
  const timerRef = useRef<number | null>(null);
  // Bumped on every new hover or dismissal, so a slow lookup for a word the
  // pointer already left never shows up.
  const tokenRef = useRef(0);

  const cancelTimer = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const dismiss = useCallback(() => {
    cancelTimer();
    tokenRef.current++;
    setPreview(null);
  }, []);

  const schedule = useCallback((word: string, element: HTMLElement) => {
    cancelTimer();
    const token = ++tokenRef.current;
    timerRef.current = window.setTimeout(async () => {
      const { x, y } = anchorOf(rectInHost(element));
      const result = await dictionaryManager.lookup(word);
      if (token !== tokenRef.current) return;
      const gloss = result.entries[0]?.senses[0]?.gloss;
      if (!gloss) return; // nothing found: stay silent rather than show an empty pill
      setPreview({
        x,
        y,
        gloss: gloss.length > HOVER_PREVIEW_MAX_CHARS ? gloss.slice(0, HOVER_PREVIEW_MAX_CHARS - 1) + '…' : gloss,
      });
    }, HOVER_PREVIEW_DELAY_MS);
  }, []);

  useEffect(() => cancelTimer, []);

  return { preview, schedule, dismiss };
}
