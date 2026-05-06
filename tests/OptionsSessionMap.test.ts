import { describe, it, expect } from 'vitest';
import { OptionsSessionMap, OptionsSessionEntry } from '../src/ui/options/OptionsSessionMap';

describe('OptionsSessionMap', () => {
  // (a) put then get returns the entry
  it('put then get returns the entry', () => {
    const map = new OptionsSessionMap();
    const entry: OptionsSessionEntry = {
      model: 'claude-sonnet-4-5',
      effort: 'medium',
      contextNotePaths: [],
      followUp: '',
      executeOnNote: true,
    };

    map.put('spell/test.ts', entry);
    const retrieved = map.get('spell/test.ts');

    expect(retrieved).toEqual(entry);
  });

  // (b) get for a missing key returns undefined
  it('get for a missing key returns undefined', () => {
    const map = new OptionsSessionMap();

    const retrieved = map.get('spell/nonexistent.ts');

    expect(retrieved).toBeUndefined();
  });

  // (c) delete removes the entry; get returns undefined after
  it('delete removes the entry; get returns undefined after', () => {
    const map = new OptionsSessionMap();
    const entry: OptionsSessionEntry = {
      model: 'claude-sonnet-4-5',
      effort: 'low',
      contextNotePaths: [],
      followUp: '',
      executeOnNote: true,
    };

    map.put('spell/test.ts', entry);
    expect(map.get('spell/test.ts')).toEqual(entry);

    map.delete('spell/test.ts');
    expect(map.get('spell/test.ts')).toBeUndefined();
  });

  // (d) clear empties the map; get returns undefined after
  it('clear empties the map; get returns undefined after', () => {
    const map = new OptionsSessionMap();
    const entry1: OptionsSessionEntry = {
      model: 'claude-sonnet-4-5',
      effort: 'medium',
      contextNotePaths: [],
      followUp: '',
      executeOnNote: true,
    };
    const entry2: OptionsSessionEntry = {
      model: 'claude-opus-4-5',
      effort: 'xhigh',
      contextNotePaths: [],
      followUp: '',
      executeOnNote: false,
    };

    map.put('spell/test1.ts', entry1);
    map.put('spell/test2.ts', entry2);
    expect(map.get('spell/test1.ts')).toEqual(entry1);
    expect(map.get('spell/test2.ts')).toEqual(entry2);

    map.clear();
    expect(map.get('spell/test1.ts')).toBeUndefined();
    expect(map.get('spell/test2.ts')).toBeUndefined();
  });

  // (e) put an entry with executeOnNote: false, get it back, assert executeOnNote === false
  it('put and get entry with executeOnNote: false preserves the value', () => {
    const map = new OptionsSessionMap();
    const entry: OptionsSessionEntry = {
      model: 'claude-sonnet-4-5',
      effort: 'medium',
      contextNotePaths: [],
      followUp: '',
      executeOnNote: false,
    };

    map.put('spell/test.ts', entry);
    const retrieved = map.get('spell/test.ts');

    expect(retrieved?.executeOnNote).toBe(false);
  });
});
