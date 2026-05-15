import { describe, it, expect } from 'vitest';
import { statusBadge } from '../../../src/ui/components/statusBadge';

describe('statusBadge', () => {
  it('returns { label: "Queued", cls: "is-neutral" } for "casted"', () => {
    const result = statusBadge('casted');
    expect(result).toEqual({ label: 'Queued', cls: 'is-neutral' });
  });

  it('returns { label: "Running", cls: "is-neutral" } for "in-progress"', () => {
    const result = statusBadge('in-progress');
    expect(result).toEqual({ label: 'Running', cls: 'is-neutral' });
  });

  it('returns { label: "Done", cls: "is-success" } for "done"', () => {
    const result = statusBadge('done');
    expect(result).toEqual({ label: 'Done', cls: 'is-success' });
  });

  it('returns { label: "Failed", cls: "is-failure" } for "error"', () => {
    const result = statusBadge('error');
    expect(result).toEqual({ label: 'Failed', cls: 'is-failure' });
  });
});
