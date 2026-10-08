/** A band of rows (and the columns with ink in it) holding one line of text. */
export interface LineBand {
  top: number;
  /** Exclusive. */
  bottom: number;
  left: number;
  /** Exclusive. */
  right: number;
}

/** Otsu's threshold of 8-bit grey values: a pixel below it is ink. */
export function inkThreshold(gray: Uint8ClampedArray): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let weightBack = 0;
  let sumBack = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    weightBack += hist[t];
    if (!weightBack) continue;
    const weightFront = total - weightBack;
    if (!weightFront) break;
    sumBack += t * hist[t];
    const between = weightBack * weightFront * (sumBack / weightBack - (sum - sumBack) / weightFront) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold + 1;
}

/**
 * The line of text at height `y` in a grey image: the run of rows with ink that contains `y`, or else the
 * nearest run. Found from how much ink each row holds, which suits printed lines that do not touch. Null
 * when the image has no ink.
 */
export function findLine(gray: Uint8ClampedArray, width: number, height: number, y: number): LineBand | null {
  const threshold = inkThreshold(gray);
  const rows = new Uint32Array(height);
  for (let r = 0; r < height; r++) {
    let count = 0;
    for (let c = 0; c < width; c++) if (gray[r * width + c] < threshold) count++;
    rows[r] = count;
  }
  const peak = Math.max(...rows);
  if (peak === 0) return null;
  const floor = Math.max(1, peak * 0.04);
  const runs: [number, number][] = [];
  let open = -1;
  for (let r = 0; r <= height; r++) {
    const inked = r < height && rows[r] >= floor;
    if (inked && open < 0) open = r;
    if (!inked && open >= 0) {
      runs.push([open, r]);
      open = -1;
    }
  }
  // Bridge small gaps inside a line (the dots above letters sit apart from the body).
  const gap = Math.max(2, Math.round(height * 0.02));
  const merged: [number, number][] = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && run[0] - last[1] <= gap) last[1] = run[1];
    else merged.push([...run]);
  }
  if (!merged.length) return null;
  const distance = (run: [number, number]) => (y >= run[0] && y < run[1] ? 0 : Math.min(Math.abs(y - run[0]), Math.abs(y - run[1])));
  const [top, bottom] = merged.reduce((best, run) => (distance(run) < distance(best) ? run : best));

  // The extent of the line: columns holding real strokes, not the odd speck of scan noise.
  const minInk = Math.max(3, Math.round((bottom - top) * 0.1));
  let left = width;
  let right = 0;
  for (let c = 0; c < width; c++) {
    let count = 0;
    for (let r = top; r < bottom; r++) if (gray[r * width + c] < threshold) count++;
    if (count >= minInk) {
      if (c < left) left = c;
      right = c + 1;
    }
  }
  return right > left ? { top, bottom, left, right } : null;
}

/**
 * Where the `count` words of a line are, left to right, from the gaps in its ink: the `count - 1` widest
 * gaps between runs of stroke-bearing columns are the spaces between words. Null when the ink has fewer
 * runs than words (letters touching across a space), so the caller can fall back to another estimate.
 */
export function wordSegments(gray: Uint8ClampedArray, width: number, band: LineBand, count: number): { left: number; right: number }[] | null {
  if (count <= 1) return [{ left: band.left, right: band.right }];
  const threshold = inkThreshold(gray);
  const minInk = Math.max(3, Math.round((band.bottom - band.top) * 0.1));
  const runs: { left: number; right: number }[] = [];
  let open = -1;
  for (let c = band.left; c <= band.right; c++) {
    let count2 = 0;
    if (c < band.right) for (let r = band.top; r < band.bottom; r++) if (gray[r * width + c] < threshold) count2++;
    const on = count2 >= minInk;
    if (on && open < 0) open = c;
    if (!on && open >= 0) {
      runs.push({ left: open, right: c });
      open = -1;
    }
  }
  if (runs.length < count) return null;
  const gaps = runs.slice(1).map((run, i) => ({ at: i, size: run.left - runs[i].right }));
  const cuts = new Set(
    [...gaps]
      .sort((a, b) => b.size - a.size)
      .slice(0, count - 1)
      .map((g) => g.at)
  );
  const segments: { left: number; right: number }[] = [];
  let start = runs[0].left;
  runs.forEach((run, i) => {
    if (cuts.has(i)) {
      segments.push({ left: start, right: run.right });
      start = runs[i + 1].left;
    }
  });
  segments.push({ left: start, right: runs[runs.length - 1].right });
  return segments;
}
