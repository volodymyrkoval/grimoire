function formatSubSecond(ms: number): string {
  const tenths = Math.floor(ms / 100);
  return `0.${tenths}s`;
}

function formatSeconds(ms: number): string {
  const seconds = Math.floor(ms / 1_000);
  return `${seconds}s`;
}

function formatMinutes(ms: number): string {
  const totalSeconds = Math.floor(ms / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function formatHours(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return '0.0s';
  if (ms < 1_000) return formatSubSecond(ms);
  if (ms < 60_000) return formatSeconds(ms);
  if (ms < 3_600_000) return formatMinutes(ms);
  return formatHours(ms);
}
