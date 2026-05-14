export function formatRelativeTime(then: Date, now: Date): string {
  const diffMs = now.getTime() - then.getTime();

  // Future or within 10s → "just now"
  if (diffMs < 10_000) {
    return 'just now';
  }

  const diffSeconds = Math.floor(diffMs / 1_000);
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  // diff < 60s → "Xs ago"
  if (diffMinutes < 1) {
    return `${diffSeconds}s ago`;
  }

  // diff < 60min → "Xm ago"
  if (diffHours < 1) {
    return `${diffMinutes}m ago`;
  }

  // diff < 24h → "Xh ago"
  if (diffDays < 1) {
    return `${diffHours}h ago`;
  }

  // diff < 48h → "yesterday"
  if (diffDays < 2) {
    return 'yesterday';
  }

  // diff < 7d → "X days ago"
  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }

  // diff >= 7d → "Mmm D" format
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
