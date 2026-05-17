# 024 — Clickable Options Chip

## Goal & scope

Make the `→ options` half of the `↵ cast · → options` hint chip a real click target that opens the options panel — the same action Right arrow performs — without triggering the row's cast handler. Apply a subtle rounded-background visual treatment (accent-tint, stronger on hover) so the element reads as tappable. Covers both `SpellRow` (regular spells) and `SentinelRow` (Refine sentinel, which already receives `showHint: true`). The Forge sentinel row never receives the chip and is out of scope.

**Out of scope:** making `↵ cast` a distinct click target; any animation on the chip; tooltips; changes to keyboard shortcuts; Forge sentinel coverage.

## Todos

- [x] A1: Split `appendRowHint` in `src/ui/components/rowHint.ts` — render `↵ cast · ` as a plain `<span>` and `→ options` as a separate `<span class="grimoire-options-chip">` with `role="button"` and `tabindex="-1"`. Accept an `onOptionsClick: () => void` callback; the chip's click handler calls `event.stopPropagation()` then invokes the callback. Keep the existing single-argument call-sites compiling by making the callback optional (no-op default) — S, junior-dev

- [x] A2: Wire the callback in `SpellList.#buildSpellRows` (`src/ui/components/SpellList.ts`): pass `onOptionsClick: () => this.#emitter.emit("open-options", spell)` when calling `appendRowHint` via `SpellRow.render`. Update `SpellRow.render` signature to accept and forward the optional callback — S, junior-dev

- [x] A3: Wire the callback in `SpellList.#buildSentinelRows`: pass `onOptionsClick: () => this.#emitter.emit("open-refine-options", undefined)` when building a Refine sentinel row (only when `showHint` is already true, i.e. `sentinel.kind === 'refine'`) — S, junior-dev

- [x] A4: Add CSS for `.grimoire-options-chip` in `styles.css`: `border-radius: 3px; padding: 0 3px; background: transparent; cursor: pointer;` with `:hover { background: var(--background-modifier-active-hover); }`. Ensure the rule applies even when the parent row carries `.is-selected` (no suppression needed — accent-tint vars already differ from selection background) — S, junior-dev (4da64fa)

- [x] A5 (integration test — RED first): Add `tests/integration/options-chip-click.spec.ts`. Seam: `SpellList` + real `SpellRow`/`SentinelRow`/`appendRowHint` + `TypedEmitter`. Scenarios: (a) clicking `.grimoire-options-chip` on a spell row emits `open-options` with the correct spell and does NOT emit `cast`; (b) clicking anywhere else on the row emits `cast` and not `open-options`; (c) clicking `.grimoire-options-chip` on the Refine sentinel row emits `open-refine-options` and not `sentinel`; (d) chip element has `role="button"` attribute — M, ui-integration-tester

- [x] A6 (edge cases): Verify via the integration test harness that `stopPropagation` on the chip click does not suppress the chip's own `open-options` emission (i.e., the emitter fires before propagation matters — the test in A5 already covers this, so this is a review note, not a separate todo) — S, junior-dev

## Overall effort summary

S: 4 M: 1 L: 0

## Todos (extension — hover-visibility & mobile)

### Context for this extension

After A1–A6 landed, three follow-on requirements emerged:

1. **Hover-visibility (desktop):** the `→ options` chip should be hidden by default and only appear when the user hovers the spell row. The chip must not consume visual space when the row is idle.
2. **Mobile always-visible:** on touch platforms (Obsidian sets `body.is-mobile`), the chip must stay visible at all times — there is no hover on touch.
3. **Bigger clickable area:** the chip's hit-region must be taller than the text so finger-sized targets are achievable; the visible baseline must stay aligned with the cast-hint text.

The CSS source-of-truth is `src/main.css` (esbuild bundles it into `styles.css` — never edit the bundled file by hand; A4 effectively landed in `src/main.css` despite the original todo wording).

The existing `.spells-row-hint` wrapper (`src/main.css:25–32`) already has `opacity: 0` by default and `opacity: 0.7 !important` when the parent row carries `.is-selected` (`src/main.css:34–37`). The extension layers on top of that mechanism — extend the same wrapper for `:hover` and add a mobile override — rather than introducing a parallel visibility scheme on `.grimoire-options-chip` alone. This keeps the cast-hint and chip visually coupled, matching their structural coupling inside the same `<span class="spells-row-hint">` wrapper in `appendRowHint` (`src/ui/components/rowHint.ts:11–22`).

### Key design decisions (extension)

1. **Wrapper-level visibility, chip-level hit-area.** The visibility toggle (hidden/visible) is applied to `.spells-row-hint` (the wrapper holding both `↵ cast` and the chip), reusing the existing opacity mechanism. The enlarged hit-area is applied to `.grimoire-options-chip` only — the cast-hint is non-interactive and doesn't need it. Rationale: matches existing `.is-selected` pattern, avoids splitting the two hint halves into divergent visibility states, and is the minimum surface change.

2. **`opacity` over `visibility` / `display`.** Continue using `opacity` (as the existing `.spells-row-hint` rule does) — keeps the smooth 0.1s transition, preserves layout reservation so the row width doesn't shift on hover, and is one rule line per state. `visibility: hidden` would also work but breaks the existing transition; `display: none` would cause layout jump and is rejected.

3. **CSS-only mobile detection.** Obsidian adds `.is-mobile` to `<body>` on touch platforms. A pure CSS selector `body.is-mobile .spells-row-hint { opacity: 0.7 !important; }` is sufficient — no `Platform.isMobile` JS branching needed. If `.is-mobile` is ever absent on a touch platform (untested, low risk), the chip falls back to hover-only behaviour; not a regression vs. today, where it's always faintly visible.

4. **Hit-area via `padding-block` + negative `margin-block`.** Add `padding-block: 6px` to `.grimoire-options-chip` and compensate with `margin-block: -6px` so the chip's *visual* baseline stays at the same height as the cast-hint text, but its `pointer-events` rectangle extends 6px above and below. Net row height unchanged. Pick 6px (≈ ½ font-size) to land near the 44pt Apple HIG / 48dp Material touch target when combined with the existing line-height.

5. **Selected state remains visible regardless of hover.** The existing `.is-selected` rule (`opacity: 0.7`) is preserved. A keyboard-selected row shows the chip without requiring the mouse, which is the current behaviour and must not regress. Hover on a non-selected row also yields `opacity: 0.7` for visual parity. We do not bump hovered-or-selected to `opacity: 1` — keeping the existing intensity avoids any subjective brightness change.

### Todos (B-series)

#### Section briefing

**What this section produces.** Modifications to `src/main.css` (the source CSS bundled into `styles.css`) covering three new rules on the existing `.spells-row-hint` and `.grimoire-options-chip` selectors. Plus one new scenario block in `tests/integration/options-chip-click.spec.ts` covering hover-visibility, mobile-always-visible, and tap-target geometry.

**Design context the executor needs upfront.** Quoting Key design decisions 1 and 4 verbatim: "The visibility toggle (hidden/visible) is applied to `.spells-row-hint` (the wrapper holding both `↵ cast` and the chip), reusing the existing opacity mechanism. The enlarged hit-area is applied to `.grimoire-options-chip` only." And: "Add `padding-block: 6px` to `.grimoire-options-chip` and compensate with `margin-block: -6px` so the chip's visual baseline stays at the same height as the cast-hint text, but its `pointer-events` rectangle extends 6px above and below." Touch the existing `.spells-row-hint` rule block — do not introduce a new wrapper class. The `!important` on existing `opacity` values must be matched on the new rules so cascade order doesn't accidentally suppress them.

**Cross-section couplings.** B4 depends on B1, B2, B3: the integration test asserts the actual computed styles produced by B1–B3 (via `getComputedStyle` on hover-simulated, hover-absent, and mobile-flagged DOM states). B4 must run after B1–B3 are in place. Within A-section: no coupling — A1–A6 are sealed.

**Section-level Red criterion.** This section is done when (a) on a non-mobile body, a freshly-mounted `.spells-row` has `.spells-row-hint` opacity 0 by default and opacity 0.7 after dispatching `mouseenter` on the row; (b) with `document.body.classList.add('is-mobile')` before mount, `.spells-row-hint` has opacity 0.7 without any hover event; (c) `.grimoire-options-chip` has computed `padding-top` / `padding-bottom` ≥ 6px and negative `margin-top` / `margin-bottom` that cancels it within 1px, asserted via `getComputedStyle`; (d) the existing A5 scenarios (a–d) still pass unchanged.

**junior-dev**

- [x] B1: In `src/main.css`, extend the existing `.spells-row-hint` opacity rule to react to row hover. Add a new rule block immediately after the existing `.spells-row.is-selected .spells-row-hint, .sentinel-row.is-selected .spells-row-hint` rule (around line 37): `.spells-row:hover .spells-row-hint, .sentinel-row:hover .spells-row-hint { opacity: 0.7 !important; }`. Match the `!important` to override the base `opacity: 0`. Do not touch the existing `.is-selected` rule — both rules must coexist so selected-and-hovered rows continue to show the hint — S, junior-dev

- [x] B2: In `src/main.css`, add a mobile override directly after the B1 rule: `body.is-mobile .spells-row-hint { opacity: 0.7 !important; }`. This single selector covers both `.spells-row` and `.sentinel-row` because both contain `.spells-row-hint` as a descendant of `body.is-mobile`. No JS detection needed — Obsidian sets `.is-mobile` on `<body>` on touch platforms. Place this rule after B1 so source order favours the mobile override when both could match — S, junior-dev

- [x] B3: In `src/main.css`, modify the existing `.grimoire-options-chip` rule (currently `border-radius: 3px; padding: 0 3px; background: transparent; cursor: pointer;` at line 39) to enlarge the tap target. Replace the `padding` declaration with two: `padding-inline: 3px; padding-block: 6px;` and add `margin-block: -6px;` on the same rule. The `margin-block: -6px` cancels the vertical padding's contribution to row height, so the visual baseline stays unchanged while the click rectangle grows 6px above and below. Do not touch the existing `:hover` rule — the enlarged hit-area inherits the background-on-hover automatically — S, junior-dev

**ui-integration-tester**

- [x] B4: Extend `tests/integration/options-chip-click.spec.ts` with a new `describe` block: `'SpellList options-chip visibility & hit-area'`. Scenarios: (e) on a non-mobile body, `.spells-row-hint` inside a freshly-rendered non-selected `.spells-row` has computed `opacity` `'0'` by default; (f) dispatching `mouseenter` (bubbling) on `.spells-row` and reading `getComputedStyle(hint).opacity` returns `'0.7'` — note: happy-dom may need a CSS stylesheet to be injected into `document.head` since `src/main.css` is not auto-loaded; load it via `fs.readFileSync` + `<style>` injection in `beforeAll` and document why in a code comment; (g) with `document.body.classList.add('is-mobile')` set *before* mount, `.spells-row-hint` opacity is `'0.7'` without any hover; remove the class in `afterEach` to isolate from other suites; (h) `.grimoire-options-chip` computed `padding-top` and `padding-bottom` each parse to ≥ 6 pixels, and computed `margin-top` and `margin-bottom` each parse to ≤ -6 pixels (negative values), proving the hit-area expansion mechanism is in place. If happy-dom does not compute `:hover` pseudo-class styles reliably, fall back to asserting class-driven equivalents by adding/removing a synthetic `data-hover` and re-test — document the workaround inline. Keep scenarios (a)–(d) untouched — M, ui-integration-tester

### Overall effort summary (extension)

S: 3 M: 1 L: 0

---

## Post-implementation polish

After B1–B4 shipped, the following CSS refinements were applied to match user feedback on hover-only visibility and tap-target sizing:

- **Hide cast hint on hover (non-selected rows):** Added rule `.spells-row:hover:not(.is-selected) .spells-row-hint-cast { display: none; }` so only `→ options` is visible when hovering a non-selected row. Keyboard-selected rows show the full hint.
- **Hide cast hint on mobile:** Added rule `body.is-mobile .spells-row-hint-cast { display: none; }` — on touch, only `→ options` is shown.
- **Full-height chip visual:** Updated `.spells-row-hint` and `.grimoire-options-chip` with `align-self: stretch; display: inline-flex; align-items: center` so the chip background and hover state extend edge-to-edge vertically without changing row height.
- **Bigger tap target on mobile:** Increased mobile chip `padding-inline: 12px` for a more comfortable touch target.

All 660 tests passing; no changes to test expectations (tests were focused on click behaviour, not CSS styling).
Dev tiers: junior: 3 ui-integration-tester: 1
