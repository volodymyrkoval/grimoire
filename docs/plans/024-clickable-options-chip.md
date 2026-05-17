# 024 — Clickable Options Chip

## Goal & scope

Make the `→ options` half of the `↵ cast · → options` hint chip a real click target that opens the options panel — the same action Right arrow performs — without triggering the row's cast handler. Apply a subtle rounded-background visual treatment (accent-tint, stronger on hover) so the element reads as tappable. Covers both `SpellRow` (regular spells) and `SentinelRow` (Refine sentinel, which already receives `showHint: true`). The Forge sentinel row never receives the chip and is out of scope.

**Out of scope:** making `↵ cast` a distinct click target; any animation on the chip; tooltips; changes to keyboard shortcuts; Forge sentinel coverage.

## Todos

- [ ] A1: Split `appendRowHint` in `src/ui/components/rowHint.ts` — render `↵ cast · ` as a plain `<span>` and `→ options` as a separate `<span class="grimoire-options-chip">` with `role="button"` and `tabindex="-1"`. Accept an `onOptionsClick: () => void` callback; the chip's click handler calls `event.stopPropagation()` then invokes the callback. Keep the existing single-argument call-sites compiling by making the callback optional (no-op default) — S, junior-dev

- [ ] A2: Wire the callback in `SpellList.#buildSpellRows` (`src/ui/components/SpellList.ts`): pass `onOptionsClick: () => this.#emitter.emit("open-options", spell)` when calling `appendRowHint` via `SpellRow.render`. Update `SpellRow.render` signature to accept and forward the optional callback — S, junior-dev

- [ ] A3: Wire the callback in `SpellList.#buildSentinelRows`: pass `onOptionsClick: () => this.#emitter.emit("open-refine-options", undefined)` when building a Refine sentinel row (only when `showHint` is already true, i.e. `sentinel.kind === 'refine'`) — S, junior-dev

- [ ] A4: Add CSS for `.grimoire-options-chip` in `styles.css`: `border-radius: 3px; padding: 0 3px; background: transparent; cursor: pointer;` with `:hover { background: var(--background-modifier-active-hover); }`. Ensure the rule applies even when the parent row carries `.is-selected` (no suppression needed — accent-tint vars already differ from selection background) — S, junior-dev

- [ ] A5 (integration test — RED first): Add `tests/integration/options-chip-click.spec.ts`. Seam: `SpellList` + real `SpellRow`/`SentinelRow`/`appendRowHint` + `TypedEmitter`. Scenarios: (a) clicking `.grimoire-options-chip` on a spell row emits `open-options` with the correct spell and does NOT emit `cast`; (b) clicking anywhere else on the row emits `cast` and not `open-options`; (c) clicking `.grimoire-options-chip` on the Refine sentinel row emits `open-refine-options` and not `sentinel`; (d) chip element has `role="button"` attribute — M, ui-integration-tester

- [ ] A6 (edge cases): Verify via the integration test harness that `stopPropagation` on the chip click does not suppress the chip's own `open-options` emission (i.e., the emitter fires before propagation matters — the test in A5 already covers this, so this is a review note, not a separate todo) — S, junior-dev

## Overall effort summary

S: 4 M: 1 L: 0
