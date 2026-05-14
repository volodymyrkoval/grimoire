export function formatDuration(ms: number): string {
  // Clamp to 0
  if (ms <= 0) {
    return '0.0s';
  }

  // Sub-second: "0.Xs"
  if (ms < 1_000) {
    const tenths = Math.floor(ms / 100);
    return `0.${tenths}s`;
  }

  // Seconds: "Xs"
  if (ms < 60_000) {
    const seconds = Math.floor(ms / 1_000);
    return `${seconds}s`;
  }

  // Minutes: "Xm YYs"
  if (ms < 3_600_000) {
    const totalSeconds = Math.floor(ms / 1_000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }

  // Hours: "Xh YYm"
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}
