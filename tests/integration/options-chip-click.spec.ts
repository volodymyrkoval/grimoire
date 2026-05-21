/**
 * Integration test: SpellList → options-chip click events.
 *
 * Seam: SpellList (parent) + real SpellRow / SentinelRow / appendRowHint + TypedEmitter.
 * No child components are mocked; click events are dispatched directly on DOM elements.
 *
 * Scenarios:
 *   (a) Click .grimoire-options-chip on a spell row → emits open-options with correct spell;
 *       does NOT emit cast.
 *   (b) Click anywhere else on a spell row → emits cast; does NOT emit open-options.
 *   (c) Click .grimoire-options-chip on the Refine sentinel row → emits open-refine-options;
 *       does NOT emit sentinel.
 *   (d) The .grimoire-options-chip element has role="button" attribute.
 *   (e) On a non-mobile body, .spells-row-hint inside a freshly-rendered non-selected
 *       .spells-row has computed opacity '0' by default.
 *   (f) Dispatching mouseenter on .spells-row triggers the :hover opacity-0.7 rule —
 *       asserted via CSS source text because happy-dom does not apply :hover pseudo-class
 *       rules in getComputedStyle.
 *   (g) With document.body.classList.add('is-mobile') set before mount, .spells-row-hint
 *       opacity is '0.7' without any hover event.
 *   (h) .grimoire-options-chip uses align-self: stretch + display: inline-flex for full-height tap target
 *       source — asserted via CSS text because happy-dom returns empty strings for
 *       padding-block / margin-block shorthands in getComputedStyle.
 */

import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SpellList } from '../../src/ui/components/SpellList';
import { TypedEmitter } from '../../src/infra/TypedEmitter';
import type { SpellEvents } from '../../src/domain/spells/SpellEvents';
import type { Spell, Sentinel } from '../../src/domain/spells/Spell';
import { spellPath } from '../../src/domain/spells/SpellPath';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIREBALL: Spell = {
  name: 'Fireball',
  path: spellPath('/spells/fireball.md'),
  executeOnNote: false,
};

const FROST_BOLT: Spell = {
  name: 'Frost Bolt',
  path: spellPath('/spells/frost-bolt.md'),
  executeOnNote: false,
};

const REFINE_SENTINEL: Sentinel = {
  kind: 'refine',
  name: 'Refine',
};

// ---------------------------------------------------------------------------
// Mount helper
// ---------------------------------------------------------------------------

interface Harness {
  container: HTMLElement;
  list: SpellList;
  emitter: TypedEmitter<SpellEvents>;
  castSpy: ReturnType<typeof vi.fn>;
  openOptionsSpy: ReturnType<typeof vi.fn>;
  openRefineOptionsSpy: ReturnType<typeof vi.fn>;
  sentinelSpy: ReturnType<typeof vi.fn>;
}

function mountSpellList(sentinels: Sentinel[] = []): Harness {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const emitter = new TypedEmitter<SpellEvents>();

  const castSpy = vi.fn();
  const openOptionsSpy = vi.fn();
  const openRefineOptionsSpy = vi.fn();
  const sentinelSpy = vi.fn();

  emitter.on('cast', castSpy);
  emitter.on('open-options', openOptionsSpy);
  emitter.on('open-refine-options', openRefineOptionsSpy);
  emitter.on('sentinel', sentinelSpy);

  const list = new SpellList(container, emitter, sentinels);
  list.render([FIREBALL, FROST_BOLT], 0);

  return { container, list, emitter, castSpy, openOptionsSpy, openRefineOptionsSpy, sentinelSpy };
}

// ---------------------------------------------------------------------------
// Helpers for dispatching clicks
// ---------------------------------------------------------------------------

/**
 * Returns the options chip element (.grimoire-options-chip) inside the nth
 * spell row (.spells-row). Rows are 0-indexed.
 */
function optionsChipInSpellRow(container: HTMLElement, rowIndex: number): HTMLElement {
  const rows = Array.from(container.querySelectorAll('.spells-row'));
  const row = rows[rowIndex] as HTMLElement | undefined;
  if (!row) throw new Error(`Spell row at index ${rowIndex} not found (total: ${rows.length})`);
  const chip = row.querySelector('.grimoire-options-chip') as HTMLElement | null;
  if (!chip) throw new Error(`No .grimoire-options-chip found in spell row ${rowIndex}`);
  return chip;
}

/**
 * Returns the options chip element inside the sentinel row (.sentinel-row).
 */
function optionsChipInSentinelRow(container: HTMLElement): HTMLElement {
  const row = container.querySelector('.sentinel-row') as HTMLElement | null;
  if (!row) throw new Error('No .sentinel-row found');
  const chip = row.querySelector('.grimoire-options-chip') as HTMLElement | null;
  if (!chip) throw new Error('No .grimoire-options-chip found in sentinel row');
  return chip;
}

/**
 * Returns the spell row element at the given index.
 */
function spellRow(container: HTMLElement, rowIndex: number): HTMLElement {
  const rows = Array.from(container.querySelectorAll('.spells-row'));
  const row = rows[rowIndex] as HTMLElement | undefined;
  if (!row) throw new Error(`Spell row at index ${rowIndex} not found`);
  return row;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SpellList options-chip click integration', () => {
  let h: Harness;

  beforeEach(() => {
    h = mountSpellList([REFINE_SENTINEL]);
  });

  // (a) ------------------------------------------------------------------
  it('(a) clicking .grimoire-options-chip on a spell row emits open-options with the correct spell and does NOT emit cast', () => {
    const chip = optionsChipInSpellRow(h.container, 0);

    chip.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(h.openOptionsSpy).toHaveBeenCalledOnce();
    expect(h.openOptionsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Fireball', path: '/spells/fireball.md' }),
    );
    expect(h.castSpy).not.toHaveBeenCalled();
  });

  it('(a) open-options carries the correct spell for the second row', () => {
    const chip = optionsChipInSpellRow(h.container, 1);

    chip.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(h.openOptionsSpy).toHaveBeenCalledOnce();
    expect(h.openOptionsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Frost Bolt', path: '/spells/frost-bolt.md' }),
    );
    expect(h.castSpy).not.toHaveBeenCalled();
  });

  // (b) ------------------------------------------------------------------
  it('(b) clicking the spell row body (not the chip) emits cast and does NOT emit open-options', () => {
    const row = spellRow(h.container, 0);

    row.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(h.castSpy).toHaveBeenCalledOnce();
    expect(h.castSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Fireball', path: '/spells/fireball.md' }),
    );
    expect(h.openOptionsSpy).not.toHaveBeenCalled();
  });

  // (c) ------------------------------------------------------------------
  it('(c) clicking .grimoire-options-chip on the Refine sentinel row emits open-refine-options and does NOT emit sentinel', () => {
    const chip = optionsChipInSentinelRow(h.container);

    chip.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(h.openRefineOptionsSpy).toHaveBeenCalledOnce();
    expect(h.sentinelSpy).not.toHaveBeenCalled();
  });

  // (d) ------------------------------------------------------------------
  it('(d) .grimoire-options-chip has role="button" attribute', () => {
    const chipInSpellRow = optionsChipInSpellRow(h.container, 0);
    const chipInSentinelRow = optionsChipInSentinelRow(h.container);

    expect(chipInSpellRow.getAttribute('role')).toBe('button');
    expect(chipInSentinelRow.getAttribute('role')).toBe('button');
  });
});

// ---------------------------------------------------------------------------
// CSS source text helper
// ---------------------------------------------------------------------------

/**
 * Returns the raw text of styles.css. Used by scenarios (f) and (h) where
 * happy-dom cannot apply pseudo-class or shorthand computed styles reliably.
 */
function mainCssText(): string {
  return fs.readFileSync(path.resolve(__dirname, '../../styles.css'), 'utf8');
}

// ---------------------------------------------------------------------------
// B-series: SpellList options-chip visibility & hit-area
// ---------------------------------------------------------------------------

describe('SpellList options-chip visibility & hit-area', () => {
  let h: Harness;

  /**
   * Why inject CSS here: happy-dom does not auto-load any CSS files — it only
   * processes styles injected into document.head. Without this injection,
   * getComputedStyle returns default browser values ('') for every rule in
   * styles.css. The injection is done once per suite in beforeAll so DOM
   * mutations across individual tests cannot affect the stylesheet.
   *
   * The <style> element is intentionally NOT removed after the suite — it sits
   * in a shared happy-dom document, but all existing suites assert behaviour
   * (events, attributes, DOM structure) rather than computed styles, so the
   * extra stylesheet is invisible to them.
   */
  beforeAll(() => {
    const cssPath = path.resolve(__dirname, '../../styles.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const style = document.createElement('style');
    style.setAttribute('data-grimoire-test', 'main-css');
    style.textContent = css;
    document.head.appendChild(style);
  });

  beforeEach(() => {
    h = mountSpellList([REFINE_SENTINEL]);
  });

  afterEach(() => {
    // Remove 'is-mobile' after every test to prevent cross-test pollution.
    // Scenario (g) adds this class before mount; cleaning up here keeps each
    // test in this suite isolated regardless of execution order.
    document.body.classList.remove('is-mobile');
    h.container.remove();
  });

  // (e) ------------------------------------------------------------------
  it('(e) on a non-mobile body, .spells-row-hint inside a freshly-rendered non-selected .spells-row has computed opacity "0" by default', () => {
    // Confirm the body has no is-mobile class (baseline for this scenario).
    expect(document.body.classList.contains('is-mobile')).toBe(false);

    // mountSpellList renders with selectedIndex=0, so the first row IS selected.
    // Use the second row (index 1) which has no is-selected class.
    const rows = Array.from(h.container.querySelectorAll('.spells-row')) as HTMLElement[];
    const row = rows[1];
    expect(row).toBeDefined();
    expect(row.classList.contains('is-selected')).toBe(false);

    const hint = row.querySelector('.spells-row-hint') as HTMLElement;
    expect(hint).not.toBeNull();

    // happy-dom resolves the injected stylesheet rule `opacity: 0` on
    // .spells-row-hint. No pseudo-classes are involved here, so computed
    // style is reliable.
    expect(getComputedStyle(hint).opacity).toBe('0');
  });

  // (f) ------------------------------------------------------------------
  it('(f) the CSS source contains a :hover rule that sets .spells-row-hint opacity to 0.7', () => {
    /**
     * happy-dom limitation: getComputedStyle does not evaluate :hover
     * pseudo-class rules. Dispatching MouseEvent('mouseenter') on the row
     * therefore leaves the computed opacity unchanged at '0', so a
     * getComputedStyle assertion would always be red for the wrong reason.
     *
     * Pragmatic fallback: assert that styles.css contains the correct
     * :hover rule text. This pins the behaviour contract at the CSS source
     * level — the selector and value are exactly what the browser will apply
     * at runtime. A mutation that removes or renames the rule will fail here.
     */
    const css = mainCssText();

    // The rule block for hover visibility must be present in the CSS source.
    // Matching the selector and the opacity value covers both "rule exists"
    // and "rule has the right value" in a single assertion.
    expect(css).toMatch(/\.spells-row:hover\s+\.spells-row-hint[^}]*opacity:\s*0\.7/s);
  });

  // (g) ------------------------------------------------------------------
  it('(g) with body.is-mobile set before mount, .spells-row-hint opacity is "0.7" without any hover event', () => {
    // Set is-mobile before mounting so the CSS rule
    //   body.is-mobile .spells-row-hint { opacity: 0.7 !important; }
    // is in effect when the component renders. The afterEach removes the class.
    document.body.classList.add('is-mobile');

    // Remount after adding the class so the DOM tree is under body.is-mobile.
    h.container.remove();
    h = mountSpellList([REFINE_SENTINEL]);

    const row = h.container.querySelector('.spells-row') as HTMLElement;
    const hint = row.querySelector('.spells-row-hint') as HTMLElement;
    expect(hint).not.toBeNull();

    // Mobile override is a plain selector (no pseudo-class), so happy-dom
    // resolves it correctly from the injected stylesheet.
    expect(getComputedStyle(hint).opacity).toBe('0.7');
  });

  // (h) ------------------------------------------------------------------
  it('(h) .grimoire-options-chip uses align-self: stretch and display: inline-flex for full-height tap target', () => {
    /**
     * happy-dom limitation: getComputedStyle does not reliably resolve
     * shorthand shims. Asserting the rule via CSS source text is the reliable
     * fallback and still pins the contract.
     *
     * The tap-target mechanism changed from padding-block/margin-block to
     * align-self: stretch + display: inline-flex, which stretches the chip
     * to the full row height without affecting row layout.
     */
    const css = mainCssText();

    // The chip must stretch to full row height.
    expect(css).toMatch(/\.grimoire-options-chip\s*\{[^}]*align-self:\s*stretch/s);

    // The chip must be a flex container so text stays centred within the stretched area.
    expect(css).toMatch(/\.grimoire-options-chip\s*\{[^}]*display:\s*inline-flex/s);
  });
});
