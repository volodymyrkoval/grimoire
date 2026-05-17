import { Effort } from '../domain/settings/Settings';
import type { ModelId } from '../domain/settings/ModelId';

/** Form state snapshot captured when the user submits the Forge form. */
export interface ForgeFormSnapshot {
  description: string;
  name: string;
  model: ModelId;
  effort: Effort | null;
  executeOnNote: boolean;
}
