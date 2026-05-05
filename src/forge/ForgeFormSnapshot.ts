import { Effort } from '../domain/settings/Settings';

export interface ForgeFormSnapshot {
  description: string;
  name: string;
  model: string;
  effort: Effort | null;
}
