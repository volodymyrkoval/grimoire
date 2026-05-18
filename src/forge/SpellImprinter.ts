import type { GrimoireSettings } from '../domain/settings/Settings';

/**
 * DIP seam for create/update Forge pipelines. Either implementation must honestly satisfy
 * the `imprint` contract — no `NotImplemented` throws, no callers needing `instanceof`.
 */
export interface SpellImprinter<Snapshot> {
  imprint(snapshot: Snapshot, settings: GrimoireSettings, close: () => void): void;
}
