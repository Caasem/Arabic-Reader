/** Dashboard-local formatting helpers — durations here can span hours
 * (a week/month/all-time total), unlike the Speed Reader's own
 * formatDuration (tuned for single-session, sub-hour spans), so this is a
 * deliberately separate, small function rather than stretching that one to
 * cover a case it wasn't written for. */
export function formatHours(ms: number): string {
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function formatCount(n: number): string {
  return n.toLocaleString();
}
