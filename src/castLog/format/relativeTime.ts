/**
 * Formats a difference in seconds.
 */
function formatSecondsDiff(diffSeconds: number): string {
  return `${diffSeconds}s ago`;
}

/**
 * Formats a difference in minutes.
 */
function formatMinutesDiff(diffMinutes: number): string {
  return `${diffMinutes}m ago`;
}

/**
 * Formats a difference in hours.
 */
function formatHoursDiff(diffHours: number): string {
  return `${diffHours}h ago`;
}

/**
 * Formats a difference in days (e.g. "3 days ago").
 */
function formatDaysDiff(diffDays: number): string {
  return `${diffDays} days ago`;
}

/**
 * Formats a date as absolute form (e.g. "Mar 15") when relative context is too old.
 */
function formatAbsoluteDate(then: Date): string {
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Formats a timestamp as relative to now (e.g. "5m ago", "yesterday", "Mar 15").
 * Switches to absolute date format for events older than a week.
 */
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
