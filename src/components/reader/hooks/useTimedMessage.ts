import { useCallback, useEffect, useRef, useState } from 'react';

/** A value (e.g. a toast) that clears itself after `durationMs`. */
export function useTimedMessage<T>(durationMs: number) {
  const [message, setMessage] = useState<T | null>(null);
  const timerRef = useRef<number | null>(null);

  const cancelTimer = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const show = useCallback(
    (value: T) => {
      cancelTimer();
      setMessage(value);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setMessage(null);
      }, durationMs);
    },
    [durationMs]
  );

  const clear = useCallback(() => {
    cancelTimer();
    setMessage(null);
  }, []);

  useEffect(() => cancelTimer, []);

  return { message, show, clear };
}
