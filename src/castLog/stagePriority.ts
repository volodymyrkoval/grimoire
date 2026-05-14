import type { CastLogStage } from './types';

export const STAGE_PRIORITY: Record<CastLogStage, number> = {
  casted: 0,
  'in-progress': 1,
  done: 2,
  error: 2,
};

export function isTerminal(stage: CastLogStage): boolean {
  return stage === 'done' || stage === 'error';
}
