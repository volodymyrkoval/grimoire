import { SpellPath } from '../../domain/spells/SpellPath';
import { Effort } from '../../domain/settings/Settings';

export interface OptionsSessionEntry {
  model: string;
  effort: Effort | null;
  contextNotePaths: readonly string[];
  followUp: string;
}

export class OptionsSessionMap {
  private map = new Map<string, OptionsSessionEntry>();

  get(path: SpellPath): OptionsSessionEntry | undefined {
    return this.map.get(path);
  }

  put(path: SpellPath, entry: OptionsSessionEntry): void {
    this.map.set(path, entry);
  }

  delete(path: SpellPath): void {
    this.map.delete(path);
  }

  clear(): void {
    this.map.clear();
  }
}
