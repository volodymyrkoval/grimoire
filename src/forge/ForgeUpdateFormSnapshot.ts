import type { Effort } from '../domain/settings/Settings';
import type { ModelId } from '../domain/settings/ModelId';
import type { SpellPath } from '../domain/spells/SpellPath';
import type { Provider } from '../domain/settings/Provider';

export interface ForgeUpdateFormSnapshot {
  readonly spellPath: SpellPath;
  readonly spellName: string;
  readonly description: string;
  readonly model: ModelId;
  readonly effort: Effort | null;
  readonly applyCastDirectives: boolean;
  readonly directiveCount: number;
  readonly provider: Provider;
}
