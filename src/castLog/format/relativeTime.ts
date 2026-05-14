function formatSecondsDiff(diffSeconds: number): string {
  return `${diffSeconds}s ago`;
}

function formatMinutesDiff(diffMinutes: number): string {
  return `${diffMinutes}m ago`;
}

function formatHoursDiff(diffHours: number): string {
  return `${diffHours}h ago`;
}

function formatDaysDiff(diffDays: number): string {
  return `${diffDays} days ago`;
}

function formatAbsoluteDate(then: Date): string {
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatRelativeTime(then: Date, now: Date): string {
  const diffMs = now.getTime() - then.getTime();

  if (diffMs < 10_000) return 'just now';

  const diffSeconds = Math.floor(diffMs / 1_000);
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMinutes < 1) return formatSecondsDiff(diffSeconds);
  if (diffHours < 1) return formatMinutesDiff(diffMinutes);
  if (diffDays < 1) return formatHoursDiff(diffHours);
  if (diffDays < 2) return 'yesterday';
  if (diffDays < 7) return formatDaysDiff(diffDays);
  return formatAbsoluteDate(then);
}
