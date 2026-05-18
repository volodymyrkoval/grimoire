/**
 * Regression: keyboard navigation must survive the
 *   Spell Options → Forge update → Escape → search
 * detail-to-detail handoff.
 *
 * Root cause (debugger): DetailPanelRouter.renderSpellOptions's onForgeUpdate
 * callback calls exit() then mounts the Forge update dialog, but the outgoing
 * OptionsDetail is never destroy()'d. Its OptionsPanel.KeyboardController
 * bindings (Mod+Enter, ArrowDown/ArrowUp from ModelSelect) stay registered on
 * the shared Modal.scope, leaking past the Forge dialog's lifetime.
 *
 * The structural assertion below directly captures the invariant being
 * violated: when CommandPopup transitions out of a detail panel, that
 * detail's destroy() MUST be invoked exactly once before the next phase
 * (search or another detail) takes over keyboard ownership.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { Notice } from 'obsidian';
import { OptionsDetail } from '../../src/ui/components/OptionsDetail';
import { createPopupHarness } from './harness';
import type { SpellContentReader } from '../../src/forge/SpellContentReader';
import type { SpellPath } from '../../src/domain/spells/SpellPath';

afterEach(() => {
  document.body.innerHTML = '';
  Notice.instances.length = 0;
  vi.restoreAllMocks();
});

describe('OptionsDetail teardown on detail-to-detail transition', () => {
  it('clicking Forge from Spell Options destroys the OptionsDetail exactly once before mounting the Forge update dialog', async () => {
    const destroySpy = vi.spyOn(OptionsDetail.prototype, 'destroy');

    const spellContentReader: SpellContentReader = {
      read: vi.fn<(path: SpellPath) => Promise<string>>().mockResolvedValue(''),
    };
    const h = createPopupHarness({ spellContentReader });

    // Open Spell Options for the first spell (Banishment Hex, alphabetical index 0).
    h.pressKey('ArrowRight');
    expect(h.contentEl.querySelector('form.options-panel')).not.toBeNull();
    expect(destroySpy).not.toHaveBeenCalled();

    // Click the Forge button → onForgeUpdate → exit() then renderForgeUpdate.
    const forgeBtn = h.contentEl.querySelector(
      '.grimoire-forge-update-row button',
    ) as HTMLButtonElement | null;
    if (!forgeBtn) throw new Error('Forge button not found');
    forgeBtn.dispatchEvent(new Event('click'));

    // Wait for renderForgeUpdate's async read + mount.
    await vi.waitFor(() => {
      expect(h.contentEl.querySelector('form.forge-sentinel-form')).not.toBeNull();
    });

    // Invariant: the outgoing OptionsDetail must have been destroyed exactly once.
    // Currently fails because #exitDetail does not destroy the active detail —
    // only DetailPhase.interceptClose does, and that path isn't taken here.
    expect(destroySpy).toHaveBeenCalledTimes(1);
  });
});
