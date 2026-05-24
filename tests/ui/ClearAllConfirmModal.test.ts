/**
 * Unit tests for ClearAllConfirmModal.
 * These tests verify basic construction.
 * DOM rendering tests are in the integration suite (tests/integration/cast-log-clear-all.spec.ts).
 */

import { describe, it, expect, vi } from 'vitest';
import { App } from '../../tests/__mocks__/obsidian';
import { ClearAllConfirmModal } from '../../src/ui/components/ClearAllConfirmModal';

describe('ClearAllConfirmModal', () => {
  it('can be instantiated with count and callback', () => {
    const onConfirm = vi.fn();
    const modal = new ClearAllConfirmModal(new App() as any, 5, onConfirm);
    expect(modal).toBeDefined();
  });

  it('has contentEl property from Modal base class', () => {
    const modal = new ClearAllConfirmModal(new App() as any, 3, vi.fn());
    expect(modal.contentEl).toBeDefined();
  });
});
