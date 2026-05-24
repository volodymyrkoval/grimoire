import { describe, it, expect } from 'vitest';
import { App } from 'obsidian';
import { ClearAllConfirmModal } from '../../../src/ui/components/ClearAllConfirmModal';

describe('ClearAllConfirmModal shell', () => {
  it('constructs without throwing', () => {
    const app = new App();
    const modal = new ClearAllConfirmModal(app as any, 5, () => {});
    expect(modal).toBeDefined();
  });
});
