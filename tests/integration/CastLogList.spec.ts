/**
 * Integration test: CastLogList — component-seam tests.
 *
 * Seam: the boundary between CastLogList (subject) and its real child CastLogRow.
 * Tests that vaultRootAbs is threaded through to each CastLogRow, so that
 * basename rendering and path normalisation work end-to-end.
 */

import { describe, it, expect, vi } from 'vitest';
import type { CastRecord } from '../../src/castLog/CastRecord';
import { CastLogList } from '../../src/ui/components/CastLogList';

const NOW = new Date('2026-05-14T12:00:00Z');

const makeRecord = (overrides: Partial<CastRecord> = {}): CastRecord => ({
  castId: 'cast-list-test',
  status: 'done',
  spellPath: 'Spells/Test.md',
  model: 'claude-opus-4-7',
  effort: null,
  contextNotes: [],
  castedTs: NOW.toISOString(),
  ...overrides,
});

describe('CastLogList', () => {
  describe('A7 — vaultRootAbs threading', () => {
    it('passes vaultRootAbs to each CastLogRow so that basenames are rendered as link text', () => {
      const container = document.createElement('div');
      const openLink = vi.fn();
      // Accept vaultRootAbs as second constructor param (after openLink)
      const list = new CastLogList(container, openLink, '/vault');

      const record = makeRecord({
        // '/vault/Notes/foo.md' is a legacy absolute path; with vaultRootAbs='/vault'
        // it should render as basename 'foo.md'
        affectedFiles: ['/vault/Notes/foo.md'],
      });

      list.render([record], new Set(['cast-list-test']), NOW, () => {});

      const link = container.querySelector('.cast-log-affected-files a') as HTMLAnchorElement | null;
      expect(link).toBeTruthy();
      // If vaultRootAbs was NOT forwarded, the link text would be '/vault/Notes/foo.md'
      // If it WAS forwarded, toDisplayPath strips the prefix → 'Notes/foo.md' → basename → 'foo.md'
      expect(link!.textContent).toBe('foo.md');
    });

    it('without vaultRootAbs (default empty string) renders the full path as link text', () => {
      const container = document.createElement('div');
      const openLink = vi.fn();
      const list = new CastLogList(container, openLink);

      const record = makeRecord({
        affectedFiles: ['Notes/foo.md'],
      });

      list.render([record], new Set(['cast-list-test']), NOW, () => {});

      const link = container.querySelector('.cast-log-affected-files a') as HTMLAnchorElement | null;
      expect(link).toBeTruthy();
      // No vaultRootAbs → full path shown (no basename since vaultRootAbs='')
      expect(link!.textContent).toBe('Notes/foo.md');
    });
  });
});
