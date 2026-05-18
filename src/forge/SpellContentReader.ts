import type { SpellPath } from '../domain/spells/SpellPath';

/**
 * DIP seam for reading spell file content. Keeps DetailPanelRouter.renderForgeUpdate
 * free of direct obsidian imports for the directive-counting read.
 */
export interface SpellContentReader {
  read(path: SpellPath): Promise<string>;
}
