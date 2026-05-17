import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TFile } from 'obsidian';
import { getRefineSentinels, isRefineSentinel } from '../../src/refine/refineSentinelScanner';
import { SENTINEL_FRONTMATTER_KEY, REFINE_SENTINEL_FRONTMATTER_VALUE } from '../../src/refine/refineSentinel';

describe('refineSentinelScanner', () => {
  let app: any;

  beforeEach(() => {
    vi.clearAllMocks();
    app = {
      vault: {
        getMarkdownFiles: vi.fn(() => []),
      },
      metadataCache: {
        getFileCache: vi.fn(() => null),
      },
    };
  });

  describe('isRefineSentinel', () => {
    it('returns true when file has sentinel: refine in frontmatter', () => {
      const file = new TFile('test-refine', 'notes/test-refine.md');
      app.metadataCache.getFileCache.mockReturnValue({
        frontmatter: {
          [SENTINEL_FRONTMATTER_KEY]: REFINE_SENTINEL_FRONTMATTER_VALUE,
        },
      });

      const result = isRefineSentinel(app, file);

      expect(result).toBe(true);
    });

    it('returns false when file has sentinel: forge (wrong value)', () => {
      const file = new TFile('test-forge', 'notes/test-forge.md');
      app.metadataCache.getFileCache.mockReturnValue({
        frontmatter: {
          [SENTINEL_FRONTMATTER_KEY]: 'forge',
        },
      });

      const result = isRefineSentinel(app, file);

      expect(result).toBe(false);
    });

    it('returns false when file has no frontmatter', () => {
      const file = new TFile('test-no-fm', 'notes/test-no-fm.md');
      app.metadataCache.getFileCache.mockReturnValue({});

      const result = isRefineSentinel(app, file);

      expect(result).toBe(false);
    });

    it('returns false when file has no sentinel key in frontmatter', () => {
      const file = new TFile('test-no-sentinel', 'notes/test-no-sentinel.md');
      app.metadataCache.getFileCache.mockReturnValue({
        frontmatter: {
          title: 'Some Title',
        },
      });

      const result = isRefineSentinel(app, file);

      expect(result).toBe(false);
    });

    it('returns false when sentinel value is non-string (e.g. number)', () => {
      const file = new TFile('test-non-string', 'notes/test-non-string.md');
      app.metadataCache.getFileCache.mockReturnValue({
        frontmatter: {
          [SENTINEL_FRONTMATTER_KEY]: 42,
        },
      });

      const result = isRefineSentinel(app, file);

      expect(result).toBe(false);
    });

    it('returns false when file cache is null', () => {
      const file = new TFile('test-no-cache', 'notes/test-no-cache.md');
      app.metadataCache.getFileCache.mockReturnValue(null);

      const result = isRefineSentinel(app, file);

      expect(result).toBe(false);
    });
  });

  describe('getRefineSentinels', () => {
    it('returns empty array for empty vault', () => {
      app.vault.getMarkdownFiles.mockReturnValue([]);

      const result = getRefineSentinels(app);

      expect(result).toEqual([]);
    });

    it('returns one entry for single sentinel-marked file', () => {
      const file = new TFile('my-refine', 'templates/my-refine.md');
      app.vault.getMarkdownFiles.mockReturnValue([file]);
      app.metadataCache.getFileCache.mockReturnValue({
        frontmatter: {
          [SENTINEL_FRONTMATTER_KEY]: REFINE_SENTINEL_FRONTMATTER_VALUE,
        },
      });

      const result = getRefineSentinels(app);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('my-refine');
      expect(result[0].path).toBe('templates/my-refine.md');
    });

    it('excludes files with wrong sentinel value', () => {
      const sentinelFile = new TFile('my-refine', 'templates/my-refine.md');
      const forgeFile = new TFile('my-forge', 'templates/my-forge.md');
      app.vault.getMarkdownFiles.mockReturnValue([sentinelFile, forgeFile]);
      app.metadataCache.getFileCache.mockImplementation((file: any) => {
        if (file.basename === 'my-refine') {
          return {
            frontmatter: {
              [SENTINEL_FRONTMATTER_KEY]: REFINE_SENTINEL_FRONTMATTER_VALUE,
            },
          };
        }
        if (file.basename === 'my-forge') {
          return {
            frontmatter: {
              [SENTINEL_FRONTMATTER_KEY]: 'forge',
            },
          };
        }
        return null;
      });

      const result = getRefineSentinels(app);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('my-refine');
    });

    it('excludes files without frontmatter', () => {
      const sentinelFile = new TFile('my-refine', 'templates/my-refine.md');
      const noFmFile = new TFile('no-fm', 'notes/no-fm.md');
      app.vault.getMarkdownFiles.mockReturnValue([sentinelFile, noFmFile]);
      app.metadataCache.getFileCache.mockImplementation((file: any) => {
        if (file.basename === 'my-refine') {
          return {
            frontmatter: {
              [SENTINEL_FRONTMATTER_KEY]: REFINE_SENTINEL_FRONTMATTER_VALUE,
            },
          };
        }
        return {}; // no frontmatter
      });

      const result = getRefineSentinels(app);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('my-refine');
    });

    it('excludes files with non-string sentinel value', () => {
      const sentinelFile = new TFile('my-refine', 'templates/my-refine.md');
      const nonStringFile = new TFile('bad-sentinel', 'notes/bad-sentinel.md');
      app.vault.getMarkdownFiles.mockReturnValue([sentinelFile, nonStringFile]);
      app.metadataCache.getFileCache.mockImplementation((file: any) => {
        if (file.basename === 'my-refine') {
          return {
            frontmatter: {
              [SENTINEL_FRONTMATTER_KEY]: REFINE_SENTINEL_FRONTMATTER_VALUE,
            },
          };
        }
        if (file.basename === 'bad-sentinel') {
          return {
            frontmatter: {
              [SENTINEL_FRONTMATTER_KEY]: 42,
            },
          };
        }
        return null;
      });

      const result = getRefineSentinels(app);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('my-refine');
    });

    it('sorts multiple sentinel entries by basename (case-insensitive)', () => {
      const fileZ = new TFile('Zebra-refine', 'templates/Zebra-refine.md');
      const fileA = new TFile('apple-refine', 'templates/apple-refine.md');
      const fileM = new TFile('Mango-refine', 'templates/Mango-refine.md');
      app.vault.getMarkdownFiles.mockReturnValue([fileZ, fileA, fileM]);
      app.metadataCache.getFileCache.mockReturnValue({
        frontmatter: {
          [SENTINEL_FRONTMATTER_KEY]: REFINE_SENTINEL_FRONTMATTER_VALUE,
        },
      });

      const result = getRefineSentinels(app);

      expect(result).toHaveLength(3);
      // localeCompare with sensitivity: base treats 'a' and 'A' as equal
      // expected order: apple-refine, Mango-refine, Zebra-refine
      expect(result[0].name).toBe('apple-refine');
      expect(result[1].name).toBe('Mango-refine');
      expect(result[2].name).toBe('Zebra-refine');
    });
  });
});
