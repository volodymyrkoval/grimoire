/** Metadata describing a system-managed spell in the cast log. */
export interface SystemSpellMeta {
  readonly label: string;
  readonly description?: string;
}

/**
 * Registry of system spells (e.g. Forge, Refine) keyed by their sentinel path.
 * Populated at composition root; consumed by display-name resolution to avoid
 * hardcoded sentinel checks in the rendering layer (Open/Closed Principle).
 */
export class SystemSpellRegistry {
  readonly #map = new Map<string, SystemSpellMeta>();

  /** Registers or overwrites a system spell entry. */
  register(path: string, meta: SystemSpellMeta): void {
    this.#map.set(path, meta);
  }

  /** Returns the meta for a registered path, or undefined if not registered. */
  describe(path: string): SystemSpellMeta | undefined {
    return this.#map.get(path);
  }

  /** Returns true when the path has been registered as a system spell. */
  isSystemSpell(path: string): boolean {
    return this.#map.has(path);
  }
}
