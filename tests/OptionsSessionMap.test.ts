import { describe, it, expect } from 'vitest';
import { OptionsSessionMap, OptionsSessionEntry } from '../src/ui/options/OptionsSessionMap';
import { modelId } from '../src/domain/settings/ModelId';
import { spellPath } from '../src/domain/spells/SpellPath';

describe('OptionsSessionMap', () => {
  it('put then get returns the entry', () => {
    const map = new OptionsSessionMap();
    const entry: OptionsSessionEntry = {
      model: modelId('claude-sonnet-4-5'),
      effort: 'medium',
      contextNotePaths: [],
      followUp: '',
      executeOnNote: true,
    };

    map.put(spellPath('spell/test.ts'), entry);
    const retrieved = map.get(spellPath('spell/test.ts'));

    expect(retrieved).toEqual(entry);
  });

  it('get for a missing key returns undefined', () => {
    const map = new OptionsSessionMap();

    const retrieved = map.get(spellPath('spell/nonexistent.ts'));

    expect(retrieved).toBeUndefined();
  });

  it('delete removes the entry; get returns undefined after', () => {
    const map = new OptionsSessionMap();
    const entry: OptionsSessionEntry = {
      model: modelId('claude-sonnet-4-5'),
      effort: 'low',
      contextNotePaths: [],
      followUp: '',
      executeOnNote: true,
    };

    map.put(spellPath('spell/test.ts'), entry);
    expect(map.get(spellPath('spell/test.ts'))).toEqual(entry);

    map.delete(spellPath('spell/test.ts'));
    expect(map.get(spellPath('spell/test.ts'))).toBeUndefined();
  });

  it('clear empties the map; get returns undefined after', () => {
    const map = new OptionsSessionMap();
    const entry1: OptionsSessionEntry = {
      model: modelId('claude-sonnet-4-5'),
      effort: 'medium',
      contextNotePaths: [],
      followUp: '',
      executeOnNote: true,
    };
    const entry2: OptionsSessionEntry = {
      model: modelId('claude-opus-4-5'),
      effort: 'xhigh',
      contextNotePaths: [],
      followUp: '',
      executeOnNote: false,
    };

    map.put(spellPath('spell/test1.ts'), entry1);
    map.put(spellPath('spell/test2.ts'), entry2);
    expect(map.get(spellPath('spell/test1.ts'))).toEqual(entry1);
    expect(map.get(spellPath('spell/test2.ts'))).toEqual(entry2);

    map.clear();
    expect(map.get(spellPath('spell/test1.ts'))).toBeUndefined();
    expect(map.get(spellPath('spell/test2.ts'))).toBeUndefined();
  });

  it('put and get entry with executeOnNote: false preserves the value', () => {
    const map = new OptionsSessionMap();
    const entry: OptionsSessionEntry = {
      model: modelId('claude-sonnet-4-5'),
      effort: 'medium',
      contextNotePaths: [],
      followUp: '',
      executeOnNote: false,
    };

    map.put(spellPath('spell/test.ts'), entry);
    const retrieved = map.get(spellPath('spell/test.ts'));

    expect(retrieved?.executeOnNote).toBe(false);
  });
});
