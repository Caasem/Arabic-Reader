/** What a jump knows besides its location, so a reader that can't use the location itself (the clean text reader, given an epub CFI) can still find the place. */
export interface LocationHint {
  /** The section file the place is in. */
  href?: string;
  /** The text at the place (a search match, a saved word). */
  text?: string;
  /** Text just before it, to pick the right one of several matches. */
  before?: string;
  /** The sentence it's in (a saved word's context). */
  sentence?: string;
}

/** Returns false when it can't go there. */
type Navigator = (location: string, hint?: LocationHint) => boolean | void;

let current: Navigator | null = null;

/** The open reader registers itself while it is mounted. Returns an unregister function. */
export function registerBookNavigator(navigate: Navigator): () => void {
  current = navigate;
  return () => {
    if (current === navigate) current = null;
  };
}

/** Jumps the open reader to a location (an epub CFI or a clean-text place). False when no reader can (e.g. the old Clean Reader). */
export function goToBookLocation(location: string, hint?: LocationHint): boolean {
  if (!current) return false;
  return current(location, hint) !== false;
}
