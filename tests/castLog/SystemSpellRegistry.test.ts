import { describe, it, expect } from 'vitest';
import { SystemSpellRegistry } from '../../src/castLog/SystemSpellRegistry';

describe('SystemSpellRegistry', () => {
  it('describe returns undefined for an unregistered path', () => {
    const registry = new SystemSpellRegistry();
    expect(registry.describe('any-path')).toBeUndefined();
  });

  it('register then describe returns the registered meta', () => {
    const registry = new SystemSpellRegistry();
    registry.register('<forge>', { label: 'Forge' });
    expect(registry.describe('<forge>')).toEqual({ label: 'Forge' });
  });

  it('describe returns meta with optional description when provided', () => {
    const registry = new SystemSpellRegistry();
    registry.register('<refine>', { label: 'Refine', description: 'Refines the active note' });
    expect(registry.describe('<refine>')).toEqual({
      label: 'Refine',
      description: 'Refines the active note',
    });
  });

  it('isSystemSpell returns false before registration', () => {
    const registry = new SystemSpellRegistry();
    expect(registry.isSystemSpell('<forge>')).toBe(false);
  });

  it('isSystemSpell returns true after registration', () => {
    const registry = new SystemSpellRegistry();
    registry.register('<forge>', { label: 'Forge' });
    expect(registry.isSystemSpell('<forge>')).toBe(true);
  });

  it('register with duplicate path overwrites the existing meta', () => {
    const registry = new SystemSpellRegistry();
    registry.register('<forge>', { label: 'Forge' });
    registry.register('<forge>', { label: 'Forge (updated)' });
    expect(registry.describe('<forge>')).toEqual({ label: 'Forge (updated)' });
  });

  it('multiple registrations are independent — each path maps to its own meta', () => {
    const registry = new SystemSpellRegistry();
    registry.register('<forge>', { label: 'Forge' });
    registry.register('<refine>', { label: 'Refine' });
    registry.register('<forge:update>', { label: 'Forge (update)' });

    expect(registry.describe('<forge>')).toEqual({ label: 'Forge' });
    expect(registry.describe('<refine>')).toEqual({ label: 'Refine' });
    expect(registry.describe('<forge:update>')).toEqual({ label: 'Forge (update)' });
  });
});
