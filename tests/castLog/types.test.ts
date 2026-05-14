import { describe, it, expect } from 'vitest';
import type { CastLogEvent, CastLogStage } from '../../src/castLog/types';
import { FORGE_SPELL_PATH } from '../../src/castLog/types';

function assertNever(_x: never): never {
  throw new Error('unhandled CastLogEvent stage');
}

function handleEvent(event: CastLogEvent): string {
  switch (event.stage) {
    case 'casted': return 'casted';
    case 'error': return 'error';
    case 'in-progress': return 'in-progress';
    case 'done': return 'done';
    default: return assertNever(event);
  }
}

describe('CastLogEvent', () => {
  it('should construct casted events', () => {
    const event: CastLogEvent = {
      castId: 'test',
      ts: '2025-01-01T00:00:00Z',
      stage: 'casted',
      spellPath: '/test/spell',
      model: 'claude-sonnet-4-5',
      effort: 'medium',
      contextNotes: [],
    };
    expect(event.stage).toBe('casted');
  });

  it('should support error events', () => {
    const event: CastLogEvent = {
      castId: 'test',
      ts: '2025-01-01T00:00:00Z',
      stage: 'error',
      message: 'Test error',
    };
    expect(event.stage).toBe('error');
  });

  it('should support in-progress events', () => {
    const event: CastLogEvent = {
      castId: 'test',
      ts: '2025-01-01T00:00:00Z',
      stage: 'in-progress',
    };
    expect(event.stage).toBe('in-progress');
  });

  it('should support done events', () => {
    const event: CastLogEvent = {
      castId: 'test',
      ts: '2025-01-01T00:00:00Z',
      stage: 'done',
      affectedFiles: ['file1.md'],
    };
    expect(event.stage).toBe('done');
  });

  it('should export FORGE_SPELL_PATH as <forge>', () => {
    expect(FORGE_SPELL_PATH).toBe('<forge>');
  });

  it('switch over stage covers all variants at compile time', () => {
    const event: CastLogEvent = {
      castId: 'test',
      ts: '2025-01-01T00:00:00Z',
      stage: 'casted',
      spellPath: '/test/spell',
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotes: [],
    };
    expect(handleEvent(event)).toBe('casted');
  });

  it('CastedEvent accepts portalCastId as optional', () => {
    const withId: CastedEvent = {
      castId: 'c1',
      ts: '2025-01-01T00:00:00Z',
      stage: 'casted',
      spellPath: '/spell.md',
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotes: [],
      portalCastId: 'srv-1',
    };
    const withoutId: CastedEvent = {
      castId: 'c2',
      ts: '2025-01-01T00:00:00Z',
      stage: 'casted',
      spellPath: '/spell.md',
      model: 'claude-sonnet-4-5',
      effort: null,
      contextNotes: [],
    };
    expect(withId.portalCastId).toBe('srv-1');
    expect(withoutId.portalCastId).toBeUndefined();
  });
});
