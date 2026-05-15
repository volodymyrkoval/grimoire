import { Effort } from '../domain/settings/Settings';

/** Form state snapshot captured when the user submits the Forge form. */
export interface ForgeFormSnapshot {
  description: string;
  name: string;
  model: string;
  effort: Effort | null;
  executeOnNote: boolean;
}
