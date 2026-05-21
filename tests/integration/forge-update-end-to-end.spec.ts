import { describe, it, expect, vi, afterEach } from 'vitest';
import { ForgeUpdateImprinter } from '../../src/forge/ForgeUpdateImprinter';
import { FORGE_UPDATE_SPELL_PATH } from '../../src/domain/spells/SystemSpellPaths';
import type { CastInput, CastCallbacks } from '../../src/execution/Caster';
import type { SpellContentReader } from '../../src/forge/SpellContentReader';
import type { SpellPath } from '../../src/domain/spells/SpellPath';
import type { GrimoireSettings } from '../../src/domain/settings/Settings';
import { modelId } from '../../src/domain/settings/ModelId';
import { createPopupHarness } from './harness';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('forge-update end-to-end', () => {
  it('full flow: popup → forge dialog → submit → cast dispatched with forge-update sentinel', async () => {
    // Stubbed Caster
    const castFn = vi.fn((input: CastInput, cbs: CastCallbacks) => {
      cbs.onAccepted({});
    });

    // Stubbed CastEventSink
    const recordCastedFn = vi.fn().mockResolvedValue(undefined);
    const stubLogWriter = {
      recordCasted: recordCastedFn,
      recordError: vi.fn().mockResolvedValue(undefined),
    };

    // SpellContentReader: returns body with @cast lines so directive-count is non-trivial
    const spellContentReader: SpellContentReader = {
      read: vi.fn<(path: SpellPath) => Promise<string>>().mockResolvedValue(
        '@cast tighten the intro section\n@cast remove redundancy\nSome existing spell content.',
      ),
    };

    // Real ForgeUpdateImprinter with stubbed deps
    const updateImprinter = new ForgeUpdateImprinter({
      notify: vi.fn(),
      caster: () => ({ cast: castFn }),
      logWriter: () => stubLogWriter,
      forgeUpdateSpellPaths: () => ({
        absForCaster: '/vault/.obsidian/plugins/grimoire/forge-update.md',
        vaultRelForPortal: '.obsidian/plugins/grimoire/forge-update.md',
      }),
    });

    const fakeSettings: GrimoireSettings = {
      executionMode: 'local',
      portalHost: '',
      vaultMountPath: '/vault',
      binaryPath: '/usr/bin/claude',
      cliCommand: 'claude',
      forgeOutputFolder: 'Spells/',
      defaultModel: modelId('claude-sonnet-4-5'),
      defaultEffort: null,
      portalPort: '',
      portalPath: '',
      portalAuthUser: '',
      portalAuthPassword: '',
      spellTag: 'spell',
      activeRefinePath: null,
    };

    // forgeUpdateAction closure wiring imprinter
    const closeFn = vi.fn();
    const forgeUpdateAction = (_spell: unknown, snapshot: any) => {
      updateImprinter.imprint(snapshot, fakeSettings, closeFn);
    };

    // Create harness with forge-update deps
    const h = createPopupHarness({ forgeUpdateAction, spellContentReader });

    // Step 1: Open options for first spell (Banishment Hex, /spells/banishment.md)
    h.pressKey('ArrowRight');
    expect(h.contentEl.querySelector('.grimoire-forge-btn')).not.toBeNull();

    // Step 2: Click Forge button
    const forgeBtn = h.contentEl.querySelector('.grimoire-forge-btn');
    forgeBtn?.dispatchEvent(new Event('click'));

    // Wait for async read + dialog mount
    await vi.waitFor(() => {
      expect(h.contentEl.querySelector('form.forge-sentinel-form')).not.toBeNull();
    });

    // Verify update-mode dialog: no name input (static display instead)
    const form = h.contentEl.querySelector('form.forge-sentinel-form') as HTMLFormElement;
    expect(form.querySelector('input[type="text"]')).toBeNull();
    const textarea = form.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.placeholder).toBe('What to change, e.g. Handle code blocks too');

    // Step 3: Fill description and submit
    textarea.value = 'Tighten the structure and remove redundancy';
    textarea.dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit'));

    // Step 4: Assert caster.cast called correctly
    expect(castFn).toHaveBeenCalledOnce();
    const castInput = castFn.mock.calls[0][0] as CastInput;
    expect(castInput.systemPromptFile).toContain('forge-update.md');
    expect(castInput.userPrompt).toContain('Tighten the structure and remove redundancy');
    expect(castInput.executeOnNote).toBe(true);
    expect(castInput.activeFilePath).toBe('/spells/banishment.md');

    // Step 5: Assert log writer called with FORGE_UPDATE_SPELL_PATH
    expect(recordCastedFn).toHaveBeenCalledWith(
      expect.objectContaining({ spellPath: FORGE_UPDATE_SPELL_PATH }),
    );
  });
});
