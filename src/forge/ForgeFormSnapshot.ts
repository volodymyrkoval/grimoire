import { Effort } from '../domain/settings/Settings';
import type { ModelId } from '../domain/settings/ModelId';
import type { Hotkey } from '../domain/spells/Hotkey';

/** Form state snapshot captured when the user submits the Forge form. */
export interface ForgeFormSnapshot {
  readonly description: string;
  readonly name: string;
  readonly model: ModelId;
  readonly effort: Effort | null;
  readonly executeOnNote: boolean;
  readonly hotkey: Hotkey | null;
}
