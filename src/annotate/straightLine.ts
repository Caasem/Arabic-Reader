/**
 * Straight lines for ink: hold Shift, or draw and hold still, and the stroke becomes a straight line from where it
 * started to the pen. Pure geometry and timing; each drawing path feeds it its pointer events.
 */

export type Pt = readonly [number, number];

/** Within this many degrees of level or plumb, a line snaps exactly level or plumb. */
export const SNAP_DEG = 5;
/** How long the pen must stay still to snap straight, and how far it may wander meanwhile (CSS px). */
export const HOLD_MS = 500;
export const HOLD_TOLERANCE_PX = 4;
/** A hold only straightens a stroke that has gone at least this far from its start (CSS px). */
export const HOLD_MIN_LENGTH_PX = 8;

/** The end of a straight line from `start` toward `current`, snapped exactly level or plumb when close to it. */
export function straighten(start: Pt, current: Pt, opts: { snapDeg?: number } = {}): [number, number] {
  const snap = opts.snapDeg ?? SNAP_DEG;
  const dx = current[0] - start[0];
  const dy = current[1] - start[1];
  if (!dx && !dy) return [current[0], current[1]];
  // Angle from the horizontal axis, folded to 0..90 (direction does not matter, so RTL strokes snap the same).
  const deg = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
  if (deg <= snap) return [current[0], start[1]];
  if (deg >= 90 - snap) return [start[0], current[1]];
  return [current[0], current[1]];
}

export interface HoldDetector {
  /** Feeds a pointer position at time t (ms); true on the call where the hold is first recognised. */
  move(x: number, y: number, t: number): boolean;
  /** Asks, with no new movement, whether the pointer has now been still long enough (true once per hold). */
  check(t: number): boolean;
  reset(): void;
}

/** Says when the pointer has stayed within `tolerancePx` of one spot for `ms`. Fires once, until reset. */
export function createHoldDetector(opts: { ms?: number; tolerancePx?: number } = {}): HoldDetector {
  const ms = opts.ms ?? HOLD_MS;
  const tol = opts.tolerancePx ?? HOLD_TOLERANCE_PX;
  let anchor: Pt | null = null;
  let since = 0;
  let fired = false;
  const check = (t: number): boolean => {
    if (!anchor || fired || t - since < ms) return false;
    fired = true;
    return true;
  };
  return {
    move(x, y, t) {
      if (!anchor || Math.hypot(x - anchor[0], y - anchor[1]) > tol) {
        anchor = [x, y];
        since = t;
        fired = false;
        return false;
      }
      return check(t);
    },
    check,
    reset() {
      anchor = null;
      fired = false;
    },
  };
}

export interface StraightTracker {
  /** True once the stroke has been straightened (by Shift or a hold); it stays straight until the pen lifts. */
  readonly straight: boolean;
  /** Begins a stroke at this screen point. */
  start(x: number, y: number): void;
  /** A pointer position (screen px) and whether Shift is down. */
  move(x: number, y: number, shift?: boolean): void;
  /** Ends the stroke: clears timers and key listeners. */
  stop(): void;
}

/**
 * Follows one stroke and decides when it is straight. `onStraight` is called when it becomes straight by itself (a
 * hold, or Shift pressed with no pointer movement), so the caller can redraw the live line.
 */
export function createStraightTracker(opts: { onStraight: () => void; ms?: number; tolerancePx?: number; minLengthPx?: number; now?: () => number }): StraightTracker {
  const ms = opts.ms ?? HOLD_MS;
  const minLen = opts.minLengthPx ?? HOLD_MIN_LENGTH_PX;
  const now = opts.now ?? (() => performance.now());
  const hold = createHoldDetector({ ms, tolerancePx: opts.tolerancePx });
  let origin: Pt | null = null;
  let at: Pt | null = null;
  let straight = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let listening = false;

  const make = (): void => {
    if (straight) return;
    straight = true;
    clearTimeout(timer);
    opts.onStraight();
  };
  const long = (): boolean => !!origin && !!at && Math.hypot(at[0] - origin[0], at[1] - origin[1]) >= minLen;
  const arm = (): void => {
    clearTimeout(timer);
    if (straight) return;
    timer = setTimeout(() => {
      if (hold.check(now()) && long()) make();
    }, ms + 5);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Shift' && origin) make();
  };
  const unlisten = (): void => {
    if (listening && typeof window !== 'undefined') window.removeEventListener('keydown', onKey, true);
    listening = false;
  };

  return {
    get straight() {
      return straight;
    },
    start(x, y) {
      unlisten();
      origin = at = [x, y];
      straight = false;
      hold.reset();
      hold.move(x, y, now());
      if (typeof window !== 'undefined') {
        window.addEventListener('keydown', onKey, true);
        listening = true;
      }
      arm();
    },
    move(x, y, shift) {
      if (!origin) return;
      at = [x, y];
      if (shift) make();
      if (straight) return;
      if (hold.move(x, y, now()) && long()) make();
      else arm();
    },
    stop() {
      clearTimeout(timer);
      unlisten();
      hold.reset();
      origin = at = null;
      straight = false;
    },
  };
}

/** The two points of a straightened stroke: its start and the (snapped) end, both with the stroke's average pressure. */
export function straightPoints(pts: readonly (readonly number[])[], end: Pt): [number, number, number][] {
  const first = pts[0];
  const avg = pts.reduce((s, p) => s + (p[2] ?? 0.5), 0) / pts.length;
  const p = Math.round(avg * 100) / 100;
  const e = straighten([first[0], first[1]], end);
  return [
    [first[0], first[1], p],
    [Math.round(e[0] * 1000) / 1000, Math.round(e[1] * 1000) / 1000, p],
  ];
}
