# 023 — Spell row name wrapping

## Goal & scope

Fix the spell-row layout so the keyboard-hint chip (`↵ cast · → options`) never wraps and the spell name wraps to a second line when it cannot fit on one. The chip stays vertically centred against the (possibly multi-line) name block. Override dot inherits the same vertical centring.

Applies uniformly to:
- `.spells-row` (user-authored spell rows)
- `.sentinel-row` (Forge and Refine sentinel rows — only Refine carries a chip; the chip-specific rules are inert on Forge)

**In scope:** `src/main.css` rule changes for `.spells-row`, `.sentinel-row`, `.spells-row-hint`. Possibly a wrapping span around the name + override-dot if alignment needs an intermediate flex child (decide during implementation — see Components).

**Out of scope (no-gos from the pitch):**
- Truncation / ellipsis on the name
- Max-line-count cap
- Chip text change
- Theme-specific overrides
- Reflow animation
- Font-size shrinking
- Subtitles / breadcrumbs / folder hints
- Row spacing, padding, font-size adjustments
- Override-dot repositioning beyond what vertical centring requires
- Any change to `SpellRow.ts` / `SentinelRow.ts` / `rowHint.ts` behaviour, event wiring, or class names already asserted by existing unit / integration tests

## Complexity: Simple

CSS-only change to one selector group. No new components, no new interfaces, no concurrency, no security surface. One file modified (`src/main.css`); TS files only touched if alignment forces a name-wrapping `<span>` (decided in B1).

## Proposed solution

Three behavioural rules expressed as CSS:

1. **Chip is atomic** — `.spells-row-hint` gets `white-space: nowrap` and `flex-shrink: 0`. It cannot break mid-phrase and cannot be squeezed by a long name.
2. **Name accepts wrapping** — the name span (currently the first `createSpan({ text: name })` child of `.spells-row`) gets `min-width: 0` and natural wrapping (`word-break: break-word` if `white-space: normal` alone is insufficient against flex's default no-wrap behaviour). Today nothing forbids wrapping, but the flex parent's `align-items: center` + the chip's flex-grow behaviour produces the priority inversion described in the pitch — `flex-shrink: 0` on the chip is the load-bearing fix.
3. **Vertical centring against multi-line name** — `.spells-row` / `.sentinel-row` already use `align-items: center`. With rule 1 + 2, when the name wraps the row's intrinsic height grows and `align-items: center` keeps the chip centred against the full block. No new rule needed beyond verifying the existing rule is sufficient (B2 verifies; if happy-dom limitations prevent verification, manual matrix in C1 covers it).

If the flex children today are `[name-span, override-dot?, hint-span]` directly under `.spells-row`, `justify-content: space-between` will keep `name | dot | hint` strung across the row with the gap between name and dot, not between dot and hint. The pitch reads "the override dot sits adjacent to the name and inherits the same vertical centring." Confirm current visual: today with `space-between` and three children, browsers distribute the empty space between each pair, which would put the dot floating between name and chip — not adjacent to the name. This is either (a) already wrong today and the pitch tacitly accepts it, or (b) the rendering relies on something else. **B1 inspects the current rendered DOM before deciding** whether to wrap `name + override-dot` in a `.spells-row-name` container (two flex children: `[name-block, hint]`) or leave it alone.

## Components

| Component | Location | Change |
|-----------|----------|--------|
| Spell-row styles | `src/main.css` (lines 6–14, 16–21) | `.spells-row-hint` gains `white-space: nowrap` and `flex-shrink: 0`. The `.spells-row, .sentinel-row` rule is unchanged unless name needs `min-width: 0` on a wrapping container. |
| `SpellRow.ts` (conditional) | `src/ui/components/SpellRow.ts` | **Only if** B1 concludes a name-block wrapper is required for "override dot adjacent to name": wrap the name span and override-dot in a `<div class="spells-row-name">`. Default outcome: no change. |
| `SentinelRow.ts` | `src/ui/components/SentinelRow.ts` | No change. Already uses a single name span + optional hint. |
| `rowHint.ts` | `src/ui/components/rowHint.ts` | No change. Chip text is preserved verbatim. |

## Interfaces

No public API changes. The chip-rendering contract in `rowHint.ts` (single `<span class="spells-row-hint">` with text `↵ cast · → options`) is unchanged. The override-dot contract (`<span class="grimoire-override-dot">` adjacent to the name) is unchanged at the DOM level; only its containing flex parent may change.

## Data flow

CSS only. No runtime data flow change.

## Error handling

None. CSS rules degrade gracefully — if a theme overrides any of the three properties, the row falls back to current behaviour (chip wraps), which is a theme bug per the no-gos clause.

## Technical notes

- **Verification strategy:** happy-dom does not run a real layout engine. Wrapping behaviour (line count, vertical centring) cannot be asserted via DOM measurements; `getBoundingClientRect` returns zero or stub values. The plan therefore splits verification into two layers:
  1. **Structural CSS assertions (automated, B2):** parse `src/main.css` as a string, assert the load-bearing declarations are present on the right selectors (`.spells-row-hint` contains both `white-space: nowrap` and `flex-shrink: 0`; `.spells-row, .sentinel-row` retains `align-items: center`). Cheap, fast, catches regression if someone deletes a property during a future refactor. Lives in `tests/spell-row-name-wrapping.test.ts`.
  2. **Manual visual verification matrix (C1):** since real layout can only be confirmed in a real browser, ship a documented manual checklist covering: short name (single-line, unchanged), long name (wraps, chip stays one line, chip vertically centred), long name with override dot (dot adjacent to name, centred), Refine sentinel with long-name simulation (chip stays one line), Forge sentinel (no chip, layout unaffected), tested across the default Obsidian theme + two popular community themes (Minimal, Things) at default modal width and one narrower theme-adjusted width.
- **Why not snapshot-test the CSS file:** snapshot tests would flag every cosmetic edit (whitespace, ordering) as a regression. Property-presence assertions on specific selectors are more surgical.
- **Why not measure via happy-dom anyway:** even attempts to read `el.offsetHeight` or `getBoundingClientRect` return zero values in happy-dom and would produce green tests that prove nothing — worse than no test.
- **Design pattern note (design-patterns Step 3):** Strategy / Template Method / Factory considered and rejected — this is a CSS-property update with at most one trivial DOM-wrapper introduction. No algorithmic variability, no families of related objects. YAGNI.
- **Design rubric (design-rubric Section 7):** SRP — the chip's "atomic" rule and the name's "wrappable" rule live in their respective selectors; one reason to change each. OCP — adding a new row variant (e.g. a future third sentinel) would inherit the rule automatically via the shared `.spells-row-hint` class. Testability — structural assertions over CSS source give a regression net even without a layout engine. Symmetry — same rules apply to spell rows and sentinel rows uniformly (per pitch).
- **No `--deep` flag, no multi-perspective synthesis.** Single-component change.

## Todos

### A. Investigation & decision

#### Section briefing

**What this section produces:** a one-paragraph decision recorded in the section's commit message (or as a brief code comment in `src/main.css` above the modified block) on whether a `.spells-row-name` wrapping container is needed. Modifies nothing executable in `src/`.

**Design context the executor needs upfront:** From "Proposed solution" — the question is whether today's three flex children (`name`, optional `dot`, `hint`) under `justify-content: space-between` already render the dot adjacent to the name, or whether they distribute the dot into the middle of the row. The pitch says: *"The override dot — the small indicator on spells with persisted overrides — sits adjacent to the name and inherits the same vertical centring. No special treatment needed."* If today's layout already satisfies that, no DOM change. If it doesn't, B1 introduces a `.spells-row-name` flex-row wrapper containing `[name-span, override-dot]`.

**Cross-section couplings:** A1's outcome decides whether B1 is a CSS-only edit or includes a `SpellRow.ts` DOM change. B2's CSS assertions are written against whichever shape A1 selects.

**Section-level Red criterion:** A written decision (plus rationale) exists, captured in plan annotation or commit body, before B1 begins. "Done" = the executor of B1 knows whether to touch `SpellRow.ts`.

**junior-dev**
- [ ] A1: open the popup in a dev build, inspect a spell-row with a persisted override in DevTools, and confirm whether the `.grimoire-override-dot` sits adjacent to the name span or floats in the middle of the row. Record the decision in the B1 commit message body: either "dot already adjacent — CSS-only fix" or "dot floats — introduce `.spells-row-name` wrapper". If the dev build is not readily available, fall back to reasoning from the markup: `.spells-row` is `display: flex` with `justify-content: space-between` and children `[name, dot?, hint]`; with 3 flex children and `space-between`, browsers place items at start, middle, end — so the dot WILL float. In that case, choose the wrapper option. — S, junior-dev

### B. CSS rules + structural assertions

#### Section briefing

**What this section produces:**
- Modifies `src/main.css`: adds `white-space: nowrap` and `flex-shrink: 0` to the `.spells-row-hint` rule (existing block at lines 16–21).
- If A1 selected the wrapper option: also adds a new `.spells-row-name` selector (`display: flex; align-items: center; gap: <existing visual gap>; min-width: 0; flex: 1 1 auto`) and modifies `src/ui/components/SpellRow.ts` to wrap `[name-span, override-dot]` inside a `<div class="spells-row-name">`. The hint span remains a direct child of `.spells-row`.
- Adds `tests/spell-row-name-wrapping.test.ts` asserting structural CSS properties.

**Design context the executor needs upfront:** From "Technical notes": *"parse `src/main.css` as a string, assert the load-bearing declarations are present on the right selectors (`.spells-row-hint` contains both `white-space: nowrap` and `flex-shrink: 0`; `.spells-row, .sentinel-row` retains `align-items: center`)."* From "Proposed solution" rule 1: *"`.spells-row-hint` gets `white-space: nowrap` and `flex-shrink: 0`. It cannot break mid-phrase and cannot be squeezed by a long name."* The chip text in `rowHint.ts` must NOT change — `↵ cast · → options` is the established vocabulary.

**Cross-section couplings:**
- B1 depends on A1: the DOM-wrapper decision dictates whether SpellRow.ts is touched.
- B2 depends on B1: assertions match the selectors B1 produces.
- B3 depends on B1 + B2: existing unit tests (`tests/SpellRow.test.ts`) assert `createSpan` calls on `row.el`; if B1 wraps name + dot inside a new `<div>`, those `createSpan` calls now target the wrapper, not `row.el` directly — the existing tests will break and must be updated to point at the wrapper.

**Section-level Red criterion:** `tests/spell-row-name-wrapping.test.ts` (new) passes asserting: (a) `src/main.css` contains a `.spells-row-hint { ... white-space: nowrap ... flex-shrink: 0 ... }` block (order-agnostic, property-presence only); (b) `.spells-row, .sentinel-row` retains `align-items: center`; (c) if wrapper path: `.spells-row-name` rule exists with `display: flex` and `min-width: 0`. Existing tests (`tests/SpellRow.test.ts`, `tests/SpellList.test.ts`, `tests/SpellsPanel.test.ts`, `tests/integration/options-panel-popup.spec.ts`) all still pass — the override-dot DOM contract is preserved (still `<span class="grimoire-override-dot">`, still findable via `querySelector('.grimoire-override-dot')`).

**junior-dev**
- [ ] B1: apply the CSS + (conditional) DOM change per A1's decision.
  - Always: in `src/main.css`, modify the `.spells-row-hint` rule (currently lines 16–21) to add `white-space: nowrap;` and `flex-shrink: 0;` alongside the existing properties.
  - If A1 = wrapper: add a new rule `.spells-row-name { display: flex; align-items: center; gap: 4px; min-width: 0; flex: 1 1 auto; }` immediately after the `.spells-row, .sentinel-row` block. In `src/ui/components/SpellRow.ts`, refactor `render()` so name span + override-dot live inside `this.el.createDiv({ cls: 'spells-row-name' })` instead of being direct children of `this.el`. The hint span (`appendRowHint(this.el)`) stays as a direct child of `this.el`. The override-dot must remain a `<span class="grimoire-override-dot">` (do not rename or restructure beyond the new parent).
  - Run `npm run lint` and `npm test` — fix any failures in `tests/SpellRow.test.ts` so they target the new wrapper instead of `row.el` directly for `name` and `override-dot` `createSpan` calls. The intent of those tests (dot rendered iff `hasOverride: true`) is preserved; only the assertion target changes.
  - — M, junior-dev

- [ ] B2: add `tests/spell-row-name-wrapping.test.ts`. Read `src/main.css` via Node `fs.readFileSync` (relative to repo root). Use a small regex-based helper or substring extraction to assert:
  1. The `.spells-row-hint` rule body contains both `white-space: nowrap` and `flex-shrink: 0`.
  2. The `.spells-row, .sentinel-row` rule body contains `align-items: center` (regression guard).
  3. **If A1 = wrapper**: a `.spells-row-name` rule exists and contains `display: flex` and `min-width: 0`.
  4. The chip text in `src/ui/components/rowHint.ts` is exactly `↵ cast · → options` (no-go guard against text shortening).

  Each assertion in its own `it()` block. Use string `.includes()` or a minimal selector-extraction helper — do not pull in a CSS parser dependency. — S, junior-dev

- [ ] B3: edge-case guards in the same test file:
  - Empty / minimal spell name (one character) still renders: asserts the unit-test snapshot for `SpellRow` with `name: 'x'` produces a `<span>` with text `'x'` (use existing mock-style assertions from `tests/SpellRow.test.ts` as a pattern). Confirms the CSS change doesn't introduce an accidental `display: none` or min-width that hides short names.
  - Very long spell name (single token, no spaces, 200 chars) still renders the chip element. Assertion: after `SpellRow.render(container, { name: 'A'.repeat(200), path: 'x.md' }, false, false)`, the row contains both a name span with the full 200-char text and a `spells-row-hint` span. This is a DOM-presence check, not a layout check — happy-dom limitation acknowledged. — S, junior-dev

### C. Manual verification matrix

#### Section briefing

**What this section produces:** a documented manual verification checklist appended to the section commit body (or, if preferred, as a short comment block at the top of `tests/spell-row-name-wrapping.test.ts`) listing the visual scenarios that must be checked in a real Obsidian client before `/done`. No source code is modified.

**Design context the executor needs upfront:** From "Technical notes": *"happy-dom does not run a real layout engine ... real layout can only be confirmed in a real browser, ship a documented manual checklist."* The matrix is the verification of record for the actual wrapping behaviour. Themes named in the pitch: "half-dozen popular community themes" — narrow to default + Minimal + Things (the two most-installed community themes) to keep the matrix tractable.

**Cross-section couplings:** C1 depends on B1: the matrix is run against the build produced by B1's changes. If B1's CSS edit fails any matrix row, B1 is re-opened.

**Section-level Red criterion:** the matrix is captured (in commit body or test-file header comment) and every row in it has been ticked off by the executor before C1 is marked done. Each row names: theme, modal width, spell-name length, expected visual outcome.

**junior-dev**
- [ ] C1: capture the manual verification matrix. Format: a markdown table with columns `Theme | Modal width | Name length | Override dot? | Expected | Verified?`. Rows to include at minimum:
  1. Default theme, default width, short name (~20 chars), no dot → single-line row, chip on right, unchanged from before.
  2. Default theme, default width, long name (~80 chars), no dot → name wraps to 2 lines, chip stays one line on right, chip vertically centred.
  3. Default theme, default width, long name, with dot → dot adjacent to name (per A1 decision), chip on right, both vertically centred.
  4. Default theme, default width, very long name (~150 chars) → name wraps to 3+ lines, chip stays one line, row grows to fit (no clamp).
  5. Minimal theme, default width, long name → same expected outcome as row 2.
  6. Things theme, default width, long name → same expected outcome as row 2.
  7. Default theme, narrowed modal (drag or theme-adjusted), medium-long name (~40 chars) that wraps at this width but not at default → wrap behaviour activates correctly.
  8. Refine sentinel row with the longest synthetic name visible to the picker (or any state where the row would wrap) → chip stays one line, sentinel name wraps.
  9. Forge sentinel row → no chip, no regression (single-line, unchanged).

  Record the matrix in the commit body for the C1 commit. Mark each row Verified=yes (with brief note if anything surprising). If any row fails, do NOT mark C1 done — file the failure as a defect against B1 and re-open. — S, junior-dev

## Effort summary

- **Total todos:** 5 (A1, B1, B2, B3, C1)
- **Effort:** S × 4, M × 1, L × 0
- **Dev tiers:** junior-dev × 5, senior-dev × 0, lead-dev × 0
- **UI integration tester:** not used. UI integration tests in this repo run on happy-dom and cannot verify CSS layout (the load-bearing behaviour for this feature). The verification work is split between structural CSS-property assertions (B2/B3, unit-level) and a manual matrix (C1) — neither belongs to the `ui-integration-tester` agent. This decision is explicitly noted in Technical notes.

## Key decisions

1. **CSS-only fix preferred; DOM change is conditional** — only introduce a `.spells-row-name` wrapper if A1 confirms the override-dot floats in the middle of the row today. Default expectation is wrapper-needed (three flex children with `justify-content: space-between` distribute to start/middle/end).
2. **No `ui-integration-tester` tier** — happy-dom can't run layout. Forcing an integration test would produce vacuous green assertions. Manual matrix (C1) is the verification of record; structural CSS-property tests (B2) are the regression net.
3. **Chip text frozen** — `↵ cast · → options` is asserted verbatim by B2.4 as a no-go guard.
4. **Existing unit / integration test contracts preserved** — `<span class="grimoire-override-dot">` remains findable via `querySelector('.grimoire-override-dot')`; only its parent flex container may change.

Next: A1 → junior-dev.
