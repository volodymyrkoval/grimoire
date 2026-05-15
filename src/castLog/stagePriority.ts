import type { CastLogStage } from './types';

/**
 * Priority ranking for cast log stages: higher priority prevents status regression.
 * casted (0) < in-progress (1) < done/error (2).
 * Used to fold events while preventing older events from downgrading a record's status.
 */
export const STAGE_PRIORITY: Record<CastLogStage, number> = {
  casted: 0,
  'in-progress': 1,
  done: 2,
  error: 2,
};

/**
 * Checks if a stage is terminal (cast has finished or failed).
 */
export function isTerminal(stage: CastLogStage): boolean {
  return stage === 'done' || stage === 'error';
}
