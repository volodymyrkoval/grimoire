import type { CastStatus } from '../../castLog/CastRecord';

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
