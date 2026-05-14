import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from '../../../src/castLog/format/relativeTime';

describe('formatRelativeTime', () => {
  const baseTime = new Date('2026-05-14T12:00:00Z');

  it('returns "just now" when then >= now (future)', () => {
    const future = new Date('2026-05-14T12:00:01Z');
    expect(formatRelativeTime(future, baseTime)).toBe('just now');
  });

  it('returns "just now" when diff < 10s', () => {
    const then = new Date('2026-05-14T11:59:55Z');
    expect(formatRelativeTime(then, baseTime)).toBe('just now');
  });

  it('returns "Xs ago" format for 10s ≤ diff < 60s', () => {
    const then10s = new Date('2026-05-14T11:59:50Z');
    expect(formatRelativeTime(then10s, baseTime)).toBe('10s ago');

    const then42s = new Date('2026-05-14T11:59:18Z');
    expect(formatRelativeTime(then42s, baseTime)).toBe('42s ago');

    const then59s = new Date('2026-05-14T11:59:01Z');
    expect(formatRelativeTime(then59s, baseTime)).toBe('59s ago');
  });

  it('returns "Xm ago" format for 60s ≤ diff < 60min', () => {
    const then1m = new Date('2026-05-14T11:59:00Z');
    expect(formatRelativeTime(then1m, baseTime)).toBe('1m ago');

    const then3m = new Date('2026-05-14T11:57:00Z');
    expect(formatRelativeTime(then3m, baseTime)).toBe('3m ago');

    const then59m = new Date('2026-05-14T11:01:00Z');
    expect(formatRelativeTime(then59m, baseTime)).toBe('59m ago');
  });

  it('returns "Xh ago" format for 60min ≤ diff < 24h', () => {
    const then1h = new Date('2026-05-14T11:00:00Z');
    expect(formatRelativeTime(then1h, baseTime)).toBe('1h ago');

    const then2h = new Date('2026-05-14T10:00:00Z');
    expect(formatRelativeTime(then2h, baseTime)).toBe('2h ago');

    const then23h = new Date('2026-05-13T13:00:00Z');
    expect(formatRelativeTime(then23h, baseTime)).toBe('23h ago');
  });

  it('returns "yesterday" for 24h ≤ diff < 48h', () => {
    const then24h = new Date('2026-05-13T12:00:00Z');
    expect(formatRelativeTime(then24h, baseTime)).toBe('yesterday');

    const then47h = new Date('2026-05-12T13:00:00Z');
    expect(formatRelativeTime(then47h, baseTime)).toBe('yesterday');
  });

  it('returns "X days ago" format for 48h ≤ diff < 7d', () => {
    const then2d = new Date('2026-05-12T12:00:00Z');
    expect(formatRelativeTime(then2d, baseTime)).toBe('2 days ago');

    const then3d = new Date('2026-05-11T12:00:00Z');
    expect(formatRelativeTime(then3d, baseTime)).toBe('3 days ago');

    const then6d = new Date('2026-05-08T12:00:00Z');
    expect(formatRelativeTime(then6d, baseTime)).toBe('6 days ago');
  });

  it('returns absolute date format "Mmm D" for diff >= 7d', () => {
    const then7d = new Date('2026-05-07T12:00:00Z');
    expect(formatRelativeTime(then7d, baseTime)).toBe('May 7');

    const then30d = new Date('2026-04-14T12:00:00Z');
    expect(formatRelativeTime(then30d, baseTime)).toBe('Apr 14');

    const thenDecember = new Date('2025-12-14T12:00:00Z');
    expect(formatRelativeTime(thenDecember, baseTime)).toBe('Dec 14');
  });

  it('handles edge case: exactly 60s → "1m ago" (lower band wins)', () => {
    const then = new Date('2026-05-14T11:59:00Z');
    expect(formatRelativeTime(then, baseTime)).toBe('1m ago');
  });

  it('handles edge case: exactly 60min → "1h ago" (lower band wins)', () => {
    const then = new Date('2026-05-14T11:00:00Z');
    expect(formatRelativeTime(then, baseTime)).toBe('1h ago');
  });
});
