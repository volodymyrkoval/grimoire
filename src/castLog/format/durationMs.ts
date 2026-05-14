import type { CastRecord } from '../CastRecord';

/**
 * Calculates the duration in milliseconds for a cast record.
 * For completed casts, uses endedTs; for in-flight, uses the current time.
 */
export function durationMs(record: CastRecord, now: Date): number {
  const endTime = record.endedTs ? Date.parse(record.endedTs) : now.getTime();
  const startTime = Date.parse(record.castedTs);
  return endTime - startTime;
}
