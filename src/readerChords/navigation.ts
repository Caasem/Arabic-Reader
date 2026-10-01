type Navigator = (cfi: string) => void;

let current: Navigator | null = null;

/** The epub reader registers itself while it is mounted. Returns an unregister function. */
export function registerBookNavigator(navigate: Navigator): () => void {
  current = navigate;
  return () => {
    if (current === navigate) current = null;
  };
}

/** Jumps the open epub reader to a CFI. False when no reader can (e.g. Clean Reader). */
export function goToBookLocation(cfi: string): boolean {
  if (!current) return false;
  current(cfi);
  return true;
}
