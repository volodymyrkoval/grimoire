import { describe, it, expect } from 'vitest';
import { formatDuration } from '../../../src/castLog/format/duration';

describe('formatDuration', () => {
  it('returns "0.0s" for ms <= 0', () => {
    expect(formatDuration(0)).toBe('0.0s');
    expect(formatDuration(-100)).toBe('0.0s');
  });

  it('formats sub-second durations as "0.Xs" for ms < 1000', () => {
    expect(formatDuration(100)).toBe('0.1s');
    expect(formatDuration(400)).toBe('0.4s');
    expect(formatDuration(900)).toBe('0.9s');
  });

  it('formats seconds as "Xs" for 1000 ≤ ms < 60000', () => {
    expect(formatDuration(1000)).toBe('1s');
    expect(formatDuration(12000)).toBe('12s');
    expect(formatDuration(59000)).toBe('59s');
  });

  it('formats minutes as "Xm YYs" for 60000 ≤ ms < 3600000', () => {
    expect(formatDuration(60000)).toBe('1m 00s');
    expect(formatDuration(75000)).toBe('1m 15s');
    expect(formatDuration(125000)).toBe('2m 05s');
    expect(formatDuration(3599000)).toBe('59m 59s');
  });

  it('formats hours as "Xh YYm" for ms >= 3600000', () => {
    expect(formatDuration(3600000)).toBe('1h 00m');
    expect(formatDuration(3660000)).toBe('1h 01m');
    expect(formatDuration(7320000)).toBe('2h 02m');
    expect(formatDuration(14400000)).toBe('4h 00m');
  });

  it('rounds down (floors) intermediate values', () => {
    expect(formatDuration(1500)).toBe('1s');
    expect(formatDuration(61500)).toBe('1m 01s');
    expect(formatDuration(3661500)).toBe('1h 01m');
  });

  it('handles large durations (many hours)', () => {
    expect(formatDuration(86400000)).toBe('24h 00m');
    expect(formatDuration(90000000)).toBe('25h 00m');
  });

  it('handles edge case: exactly 1000ms → "1s"', () => {
    expect(formatDuration(1000)).toBe('1s');
  });

  it('handles edge case: exactly 60000ms → "1m 00s"', () => {
    expect(formatDuration(60000)).toBe('1m 00s');
  });

  it('handles edge case: exactly 3600000ms → "1h 00m"', () => {
    expect(formatDuration(3600000)).toBe('1h 00m');
  });
});
