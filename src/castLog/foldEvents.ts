import type { CastLogEvent, CastedEvent, DoneEvent, ErrorEvent, InProgressEvent } from './types';
import type { CastRecord } from './CastRecord';
import { STAGE_PRIORITY } from './stagePriority';

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
  };
}

function shouldUpdateStatus(
  event: CastLogEvent,
  record: CastRecord,
): boolean {
  const incomingPriority = STAGE_PRIORITY[event.stage];
  const currentPriority = STAGE_PRIORITY[record.status];
  return incomingPriority > currentPriority;
}

function updateForInProgress(record: CastRecord, event: InProgressEvent): CastRecord {
  if (!record.startedTs) {
    return { ...record, startedTs: event.ts };
  }
  return record;
}

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

function updateRecordWithEvent(
  record: CastRecord,
  event: CastLogEvent,
): CastRecord {
  if (event.stage === 'casted') {
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

function processCastGroup(
  castId: string,
  groupEvents: CastLogEvent[],
): CastRecord | null {
  const castedEvent = groupEvents.find((e) => e.stage === 'casted');
  if (!castedEvent) {
    return null;
  }

  const record = combineCastedRecord(castId, castedEvent);

  return groupEvents.reduce(updateRecordWithEvent, record);
}

function groupRelatedEvent(events: CastLogEvent[]) {
  return events.reduce((groups, event) => {
    if (!groups.has(event.castId)) {
      groups.set(event.castId, []);
    }
    groups.get(event.castId)!.push(event);
    return groups;
  }, new Map<string, CastLogEvent[]>());
}

function buildRecordsFromGroups(
  groups: Map<string, CastLogEvent[]>,
): CastRecord[] {
  return Array.from(groups)
    .map(([castId, groupEvents]) => processCastGroup(castId, groupEvents))
    .filter((record): record is CastRecord => record !== null);
}

function sortByMostRecentFirst(records: CastRecord[]): CastRecord[] {
  return [...records].sort((a, b) => {
    const timeA = new Date(a.castedTs).getTime();
    const timeB = new Date(b.castedTs).getTime();
    return timeB - timeA;
  });
}

export function foldEvents(events: CastLogEvent[]): CastRecord[] {
  const groups = groupRelatedEvent(events);
  const records = buildRecordsFromGroups(groups);
  return sortByMostRecentFirst(records);
}
