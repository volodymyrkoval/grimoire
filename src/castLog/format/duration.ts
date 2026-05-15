/**
 * Formats sub-second durations as tenths of a second (e.g. "0.3s").
 */
function formatSubSecond(ms: number): string {
  const tenths = Math.floor(ms / 100);
  return `0.${tenths}s`;
}

/**
 * Formats durations under 1 minute as whole seconds (e.g. "42s").
 */
function formatSeconds(ms: number): string {
  const seconds = Math.floor(ms / 1_000);
  return `${seconds}s`;
}

/**
 * Formats durations under 1 hour as minutes:seconds (e.g. "2m 45s").
 */
function formatMinutes(ms: number): string {
  const totalSeconds = Math.floor(ms / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

/**
 * Formats durations 1 hour or more as hours:minutes (e.g. "3h 15m").
 */
function formatHours(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

/**
 * Formats duration in milliseconds as human-readable string.
 * Adjusts precision based on magnitude: sub-second (0.Xs), seconds (Xs), minutes (Xm YYs), or hours (Xh YYm).
 */
export function formatDuration(ms: number): string {
  if (ms <= 0) return '0.0s';
  if (ms < 1_000) return formatSubSecond(ms);
  if (ms < 60_000) return formatSeconds(ms);
  if (ms < 3_600_000) return formatMinutes(ms);
  return formatHours(ms);
}
