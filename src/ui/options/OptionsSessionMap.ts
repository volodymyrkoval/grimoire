import { SpellPath } from '../../domain/spells/SpellPath';
import { Effort } from '../../domain/settings/Settings';
import type { ModelId } from '../../domain/settings/ModelId';

export interface OptionsSessionEntry {
  model: ModelId;
  effort: Effort | null;
  contextNotePaths: readonly string[];
  followUp: string;
  executeOnNote: boolean;
}

/**
 * Session-scoped cache of casting options keyed by spell path.
 * Persists user input across popup reopens within the same session.
 * Cleared when the user clicks Reset or closes the popup.
 */
export class OptionsSessionMap {
  #map = new Map<string, OptionsSessionEntry>();

  get(path: SpellPath): OptionsSessionEntry | undefined {
    return this.#map.get(path);
  }

  put(path: SpellPath, entry: OptionsSessionEntry): void {
    this.#map.set(path, entry);
  }

  delete(path: SpellPath): void {
    this.#map.delete(path);
  }

  clear(): void {
    this.#map.clear();
  }
}
