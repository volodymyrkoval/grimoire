import type { CastStatus } from '../../castLog/CastRecord';

/**
 * Maps a cast status to a human-readable label and CSS class for styling.
 * @param status The cast status to format.
 * @returns An object with `label` (displayed text) and `cls` (CSS class for color/style).
 */
export function statusBadge(status: CastStatus): { label: string; cls: string } {
  switch (status) {
    case 'casted':
      return { label: 'Queued', cls: 'is-neutral' };
    case 'in-progress':
      return { label: 'Running', cls: 'is-neutral' };
    case 'done':
      return { label: 'Done', cls: 'is-success' };
    case 'error':
      return { label: 'Failed', cls: 'is-failure' };
  }
}
