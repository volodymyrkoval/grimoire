import type { CastLogEvent } from './types';
import type { CastRecord } from './CastRecord';
import { STAGE_PRIORITY } from './stagePriority';

export function foldEvents(events: CastLogEvent[]): CastRecord[] {
  // Group events by castId
  const groups = new Map<string, CastLogEvent[]>();
  for (const event of events) {
    if (!groups.has(event.castId)) {
      groups.set(event.castId, []);
    }
    groups.get(event.castId)!.push(event);
  }

  // Process each group
  const records: CastRecord[] = [];

  for (const [castId, groupEvents] of groups) {
    // Find the casted event — if missing, drop the group
    const castedEvent = groupEvents.find((e) => e.stage === 'casted');
    if (!castedEvent) {
      continue;
    }

    // Start the record from the casted event
    let record: CastRecord = {
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

    // Apply subsequent events in order
    for (const event of groupEvents) {
      if (event.stage === 'casted') {
        // Skip the anchor event, already processed
        continue;
      }

      // Update status only if incoming priority is higher
      const incomingPriority = STAGE_PRIORITY[event.stage];
      const currentPriority = STAGE_PRIORITY[record.status];
      if (incomingPriority > currentPriority) {
        record = { ...record, status: event.stage };
      }

      // Apply fields from the event if absent on the record
      if (event.stage === 'in-progress') {
        if (!record.startedTs) {
          record = { ...record, startedTs: event.ts };
        }
      } else if (event.stage === 'done') {
        if (!record.endedTs) {
          record = { ...record, endedTs: event.ts };
        }
        if (!record.affectedFiles && event.affectedFiles) {
          record = { ...record, affectedFiles: event.affectedFiles };
        }
      } else if (event.stage === 'error') {
        if (!record.endedTs) {
          record = { ...record, endedTs: event.ts };
        }
        if (!record.errorMessage) {
          record = { ...record, errorMessage: event.message };
        }
      }
    }

    records.push(record);
  }

  // Sort reverse-chronological by castedTs (newest first)
  records.sort((a, b) => {
    const timeA = new Date(a.castedTs).getTime();
    const timeB = new Date(b.castedTs).getTime();
    return timeB - timeA;
  });

  return records;
}
