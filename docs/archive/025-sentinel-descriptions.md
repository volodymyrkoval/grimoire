# Plan 025 — sentinel-descriptions

## Goal & scope

Add a secondary description line beneath each sentinel row's name in the Spell Picker.

- Forge sentinel: "Author a new spell from a description"
- Refine sentinel: "Rewrite the active note"

The description is always visible (no hover toggle, no animation). It uses Obsidian's `--text-faint` / `--font-ui-smaller` tokens so it is visually subordinate without hard-coded colours. The keyboard-hint chip (`↵ cast · → options`) stays vertically centred against the now-taller name+description block via the existing `align-items: center` rule on `.sentinel-row`.

**Out of scope:**
- Description field for user-authored spells
- Tooltip or collapsed/expanded mode for the description
- i18n / localisation
- Any vertical padding adjustment to compensate for taller rows
- Description on the Forge button inside the options panel (per `forge-spell-update` pitch)
- Icons or glyphs on the description line

---

## Todos

### ui-integration-tester

- [x] A1: Write red integration tests in `tests/integration/sentinel-descriptions.spec.ts` — seam is `SpellList` + real `SentinelRow`. Three scenarios: (a) Forge sentinel row contains `.sentinel-description` with text "Author a new spell from a description"; (b) Refine sentinel row contains `.sentinel-description` with text "Rewrite the active note"; (c) a user-authored spell row rendered via `SpellList` does NOT contain `.sentinel-description`. — S, ui-integration-tester

### junior-dev

- [x] A2: Add `#appendDescription(text: string): void` to `SentinelRow` (in `src/ui/components/SentinelRow.ts`). It calls `this.el.createDiv({ cls: 'sentinel-description', text })`. Call it from `render()` after `#appendName()`, passing the sentinel-specific copy resolved by a local `const DESCRIPTIONS: Record<'forge' | 'refine', string>` map defined at the top of the file. Skip (no call) when `sentinel.kind` is not in the map (e.g. `'separator'`). — S, junior-dev

- [x] A3: Add `.sentinel-description` CSS rule to `src/main.css`. Use `font-size: var(--font-ui-smaller)` and `color: var(--text-faint)`. No margin, no padding beyond what the row provides — the row grows naturally to accommodate the second line. — S, junior-dev

- [x] A4: Confirm `.sentinel-row` `align-items: center` in `src/main.css` still vertically centres the hint chip against the taller block. The existing rule already sets `align-items: center` on `.sentinel-row` and the hint uses `align-self: stretch`, so no CSS change should be needed — verify by reading the current rule; add an inline comment if the centring is non-obvious. — S, junior-dev

- [x] A5: Edge case — sentinel with `kind: 'separator'` renders no description element. Verify by reading `SpellList.#buildSentinelRows`: separators are not currently wired to `SentinelRow.render` (they use a different path or are excluded). Confirm the guard in A2 covers this and add a unit test in `tests/SentinelRow.test.ts` (or the closest existing unit test file) asserting no `.sentinel-description` is emitted for a separator sentinel. — S, junior-dev

---

## Effort summary

S: 5   M: 0   L: 0

## Dev tiers

junior: 4   senior: 0   lead: 0   ui-integration-tester: 1

reviewed @ 618f28b
