import type { CastLogEvent, CastedEvent, DoneEvent, ErrorEvent, InProgressEvent } from './types';
import type { CastRecord } from './CastRecord';
import { STAGE_PRIORITY } from './stagePriority';

/**
 * Combines a casted event into an initial CastRecord, extracting all available fields.
 */
function combineCastedRecord(castId: string, castedEvent: CastedEvent): CastRecord {
  return {
    castId,
    status: 'casted',
    spellPath: castedEvent.spellPath,
    model: castedEvent.model,
    effort: castedEvent.effort,
    contextNotes: castedEvent.contextNotes,
    castedTs: castedEvent.ts,
    ...(castedEvent.followUp && { followUp: castedEvent.followUp }),
    ...(castedEvent.executeOnNote !== undefined && {
      executeOnNote: castedEvent.executeOnNote,
    }),
    ...(castedEvent.portalCastId && { portalCastId: castedEvent.portalCastId }),
  };
}

/**
 * Checks if an event's stage has higher priority than the record's current status.
 * Used to prevent older casted events from regressing a record already in done/error state.
 */
function shouldUpdateStatus(
  event: CastLogEvent,
  record: CastRecord,
): boolean {
  const incomingPriority = STAGE_PRIORITY[event.stage];
  const currentPriority = STAGE_PRIORITY[record.status];
  return incomingPriority > currentPriority;
}

/**
 * Merges in-progress event into a record, recording the first start timestamp observed.
 */
function updateForInProgress(record: CastRecord, event: InProgressEvent): CastRecord {
  if (!record.startedTs) {
    return { ...record, startedTs: event.ts };
  }
  return record;
}

/**
 * Merges done event into a record, recording first end timestamp and any newly collected affected files.
 */
function updateForDone(record: CastRecord, event: DoneEvent): CastRecord {
  let updated = record;
  if (!updated.endedTs) {
    updated = { ...updated, endedTs: event.ts };
  }
  if (!updated.affectedFiles && event.affectedFiles) {
    updated = { ...updated, affectedFiles: event.affectedFiles };
  }
  return updated;
}

/**
 * Merges error event into a record, recording first end timestamp and error message.
 */
function updateForError(record: CastRecord, event: ErrorEvent): CastRecord {
  let updated = record;
  if (!updated.endedTs) {
    updated = { ...updated, endedTs: event.ts };
  }
  if (!updated.errorMessage) {
    updated = { ...updated, errorMessage: event.message };
  }
  return updated;
}

/**
 * Applies a single event to an existing record, updating status and fields according to the event type.
 */
function updateRecordWithEvent(
  record: CastRecord,
  event: CastLogEvent,
): CastRecord {
  if (event.stage === 'casted') {
    if (event.portalCastId !== undefined) {
      return { ...record, portalCastId: event.portalCastId };
    }
    return record;
  }

  let updated = record;
  if (shouldUpdateStatus(event, record)) {
    updated = { ...updated, status: event.stage };
  }

  if (event.stage === 'in-progress') {
    updated = updateForInProgress(updated, event);
  } else if (event.stage === 'done') {
    updated = updateForDone(updated, event);
  } else if (event.stage === 'error') {
    updated = updateForError(updated, event);
  }

  return updated;
}

/**
 * Folds all events for a single cast ID into a record.
 * Requires at least one casted event; returns null if the group has no casted event (incomplete log).
 */
function processCastGroup(
  castId: string,
  groupEvents: CastLogEvent[],
): CastRecord | null {
  const castedEvent = groupEvents.find((e) => e.stage === 'casted');
  if (!castedEvent) {
    return null;
  }

  const record = combineCastedRecord(castId, castedEvent);

  // Reduce over the remaining events only — the seed is already applied above.
  const remainingEvents = groupEvents.filter((e) => e !== castedEvent);
  return remainingEvents.reduce(updateRecordWithEvent, record);
}

/**
 * Groups log events by castId, collecting related events (casted, in-progress, done/error) for each cast.
 */
function groupRelatedEvent(events: CastLogEvent[]) {
  return events.reduce((groups, event) => {
    if (!groups.has(event.castId)) {
      groups.set(event.castId, []);
    }
    groups.get(event.castId)!.push(event);
    return groups;
  }, new Map<string, CastLogEvent[]>());
}

/**
 * Processes cast groups into records, filtering out incomplete casts (those lacking a casted event).
 */
function buildRecordsFromGroups(
  groups: Map<string, CastLogEvent[]>,
): CastRecord[] {
  return Array.from(groups)
    .map(([castId, groupEvents]) => processCastGroup(castId, groupEvents))
    .filter((record): record is CastRecord => record !== null);
}

/**
 * Orders records by castedTs descending (most recent first).
 */
function sortByMostRecentFirst(records: CastRecord[]): CastRecord[] {
  return [...records].sort((a, b) => {
    const timeA = new Date(a.castedTs).getTime();
    const timeB = new Date(b.castedTs).getTime();
    return timeB - timeA;
  });
}

/**
 * Transforms a flat stream of cast log events into structured CastRecord objects.
 * Casts events are grouped by castId; within each group, events are folded into a record following
 * their stage priority (casted → in-progress → done/error). Returns records sorted most recent first.
 */
export function foldEvents(events: CastLogEvent[]): CastRecord[] {
  const groups = groupRelatedEvent(events);
  const records = buildRecordsFromGroups(groups);
  return sortByMostRecentFirst(records);
}
