# 027 — Effort selector focus ring

> Pitch: `brain/Grimoire - Effort selector focus ring.md`

## Goal & scope

Add a keyboard-only focus decoration to the custom segmented effort control so a Tab-navigating user can see when focus has landed on it — closing the gap between the surrounding native form controls (model select, context-notes input, follow-up textarea, checkboxes) which already show focus styling and the custom segmented control which currently shows nothing.

### In scope

- One CSS rule on `.grimoire-segmented__btn:focus-visible` in `src/main.css`, drawing on Obsidian's accent variable.
- Applies wherever `SegmentedControl` is mounted today — the effort row in the authored-spell options panel, the Refine options panel, and (future) the Forge-update options panel. Same component, same selector, same rule.
- A unit-level CSS-source assertion pinning the rule text (the project precedent for unverifiable-via-computed-style pseudo-classes, see `tests/integration/options-chip-click.spec.ts` scenario f).

### Out of scope

- No animation on the focus ring (pitch: "Do not animate the focus ring in").
- No `:focus` (mouse-click) variant — `:focus-visible` only.
- No changes to other form controls' focus styling (model select, textareas, checkboxes stay untouched).
- No changes to selected-segment styling (`.is-active` background/colour). Selection and focus compose; neither is altered.
- No keyboard interaction-model changes (Tab + arrow behaviour stays exactly as `SegmentedControl#handleArrow` defines it today).
- No theme-specific overrides. Standard `:focus-visible` rule with Obsidian variables — community themes that ignore the accent variable produce a fallback browser ring; no fork-per-theme adaptation.
- No focus-restoration logic across panel re-renders.

## Proposed solution

Add a single CSS rule:

```css
.grimoire-segmented__btn:focus-visible {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 2px;
}
```

Placed in `src/main.css` immediately after the existing `.grimoire-segmented__btn.is-active` block (lines 323–326 of `src/main.css`). The build re-emits `styles.css` from `src/main.css` via esbuild — no hand-edits to `styles.css`.

Why this shape:

- **Why `:focus-visible`, not `:focus`** — the pitch is explicit: mouse clicks must not light the ring. `:focus-visible` is the browser's keyboard-vs-pointer heuristic; clicking a segment will select it without showing the ring, Tab arrival will.
- **Why `outline`, not `box-shadow`** — `outline` does not affect layout (no reflow of adjacent segments), respects `outline-offset` for a small breathing gap, and is the simplest faithful translation of "faint perimeter ring". The existing `.grimoire-segmented__btn` declares `box-shadow: none !important;` (line 311), so `box-shadow` would require fighting that or removing the `!important`; `outline` sidesteps the conflict entirely.
- **Why `--interactive-accent`** — Obsidian's existing accent token, already used by the same class for `.is-active` background (line 324) and by `.cm-line.grimoire-cast-line` / `.grimoire-cast-marker` elsewhere in the file. No new colour authority is introduced.
- **Why per-segment, not per-wrapper** — the focused button is the actual focus target (it's a `<button type="button">` with `tabIndex` managed by `SegmentedControl#applyActive`). The ring frames the focused segment, which is also what the user is about to act on with arrow keys. Wrapping the whole control would require a `:focus-within` rule and would not communicate which segment owns the keyboard.

### Components

| Component | Location | Responsibility (delta) |
|---|---|---|
| `src/main.css` (segmented control rules) | `src/main.css` lines 299–326 | Gains one new rule `.grimoire-segmented__btn:focus-visible { … }` after the `.is-active` rule |
| Build pipeline (esbuild) | `esbuild.config.mjs` | Unchanged — automatically re-emits `styles.css` from `src/main.css` on `npm run build` / `npm run dev` |

No TypeScript changes. `SegmentedControl` already focuses the correct button on Tab arrival and on arrow navigation (via `btn.focus()` in `#handleArrow` and `focusSelected()`); the new rule is purely declarative and triggered by the browser's `:focus-visible` heuristic.

### Interfaces

No new interfaces. The CSS selector `.grimoire-segmented__btn` is the existing seam between `SegmentedControl#buildButtons` (`src/ui/widgets/SegmentedControl.ts:77`) and the stylesheet.

### Data flow

```
User presses Tab → focus advances to .grimoire-segmented__btn[tabIndex=0] (the selected segment)
  → browser's :focus-visible heuristic fires (keyboard origin)
  → new CSS rule paints outline using --interactive-accent
  → on subsequent ArrowRight/ArrowLeft, SegmentedControl#handleArrow moves focus
    to the next segment; :focus-visible follows it; outline tracks the active segment
  → user presses Tab again → focus leaves the control; outline disappears

User clicks a segment with mouse:
  → focus lands on the button (browser default for <button>), but :focus-visible heuristic
    does NOT match (pointer origin), so no outline paints
  → existing .is-active rule still toggles via SegmentedControl#handleClick
```

### Error handling

N/A. CSS rule with no logic — the only failure mode is a community theme overriding `--interactive-accent` to `unset` or `transparent`, in which case the browser's default focus ring (or the rule's effective transparent outline) is the graceful fallback. The pitch accepts this: "community themes that ignore the accent variable will produce a fallback ring, but no fork-per-theme adaptation".

### Technical notes

- **Why a unit test, not an integration test, despite the UI-stack detection:** happy-dom's `getComputedStyle` does not evaluate `:focus-visible` (or any focus pseudo-class) for elements that have been focused via `element.focus()` — pseudo-class state is not threaded into the cascade in jsdom-class engines. The project already faces this for `:hover` and resolves it via a CSS-source-text assertion (`tests/integration/options-chip-click.spec.ts:285–290`, scenario f). The new test follows that exact pattern — a regex against `src/main.css` content pinning selector + accent variable. Emitting a `**ui-integration-tester**` group here would produce a hollow test (either a vacuous `document.activeElement === btn` check that does not verify the visual fix, or a `getComputedStyle` assertion that is structurally red-for-the-wrong-reason). The Red criterion is therefore a unit-level grep-style CSS assertion.
- **`styles.css` is build output, not source.** `esbuild.config.mjs:16` declares `{ in: 'src/main.css', out: 'styles' }`. Hand-edits to `styles.css` are overwritten by `npm run build` / `npm run dev`. All edits in this plan are to `src/main.css`; `styles.css` regenerates automatically and is not part of any commit in this iteration (it is gitignored or build-time-only — verify in the green phase).
- **Design-patterns considered:** None warranted. Strategy / State / Observer would all be overengineering for a single declarative CSS rule with no runtime logic; applying any of them would violate YAGNI. The pattern decision is "no pattern" — explicit declaration that this is intentionally not abstracted.
- **`!important` discipline:** the existing `.grimoire-segmented__btn` rule uses `!important` on `border`, `box-shadow`, and `background` to defeat Obsidian's default button styling. The new `:focus-visible` rule should NOT use `!important` — `outline` is not in the existing `!important` list, so there is nothing to fight. Adding `!important` would be cargo-culting.
- **Outline width/offset rationale:** `2px solid` matches the visual weight of Obsidian's native form-field focus (the `--background-modifier-border-focus` treatment is roughly a 1–2px outline depending on theme). `outline-offset: 2px` creates a small gap from the segmented control's rounded background so the ring does not visually merge with the `.is-active` accent fill when the focused segment is the selected one.
- **Dependencies:** none new. Uses an Obsidian CSS variable already referenced six times elsewhere in `src/main.css`.

## Todos

### A. Focus ring rule + CSS-source test

#### Section briefing

1. **What this section produces** — one new CSS rule appended to the segmented-control block in `src/main.css` (after line 326, the closing brace of `.grimoire-segmented__btn.is-active`), and one new vitest unit test file `tests/segmented-focus-ring.test.ts` that pins the rule text by regex. `styles.css` regenerates on build; no source-side edits to `styles.css`. No TypeScript files change.
2. **Design context the executor needs upfront** — the rule is exactly: `.grimoire-segmented__btn:focus-visible { outline: 2px solid var(--interactive-accent); outline-offset: 2px; }`. Use `:focus-visible`, never `:focus`. Use `outline` + `outline-offset`, not `box-shadow` (the existing `.grimoire-segmented__btn` declares `box-shadow: none !important;` on line 311 — `outline` sidesteps this conflict). Use the Obsidian variable `var(--interactive-accent)`, never a hardcoded colour. Do NOT use `!important` on the new rule. Place the rule immediately after the `.is-active` rule (current line 323–326) so the segmented-control rules stay grouped. Test pattern mirrors `tests/integration/options-chip-click.spec.ts:285–290`: read `src/main.css` via `fs.readFileSync` and assert a regex match.
3. **Cross-section couplings** — None. This is a single-section plan; no other sections exist.
4. **Section-level Red criterion** — `npm test` runs `tests/segmented-focus-ring.test.ts`. The test reads `src/main.css` as text and asserts (a) a rule whose selector is exactly `.grimoire-segmented__btn:focus-visible` exists, (b) its body contains `outline:` with a value built from `var(--interactive-accent)` and a width of at least 1px (the regex permits `1px` or `2px` so a future tweak to width does not break the test for the wrong reason), and (c) the body contains `outline-offset:` with a non-zero px value. Before the rule lands, the regex finds no match and the test is red. After the rule lands, the test is green. `npm run lint` and `npm run arch:check` continue to pass (no TypeScript surface changed). `npm run build` succeeds and re-emits `styles.css` containing the new rule (manual smoke; not asserted by the test).

**junior-dev**

- [x] A1: Add a vitest unit test `tests/segmented-focus-ring.test.ts` that reads `src/main.css` and asserts the focus-visible rule exists with the right shape. Use the helper pattern from `tests/integration/options-chip-click.spec.ts:207–209` (`fs.readFileSync(path.resolve(__dirname, '../src/main.css'), 'utf8')`) — note the relative path is `../src/main.css` because this test lives in `tests/`, not `tests/integration/`. Three assertions in one or three `it` blocks (executor's call — both are fine, single block is leaner):
  - `expect(css).toMatch(/\.grimoire-segmented__btn:focus-visible\s*\{[^}]*outline:\s*[12]px\s+solid\s+var\(--interactive-accent\)[^}]*\}/s)`
  - `expect(css).toMatch(/\.grimoire-segmented__btn:focus-visible\s*\{[^}]*outline-offset:\s*[1-9]\d*px[^}]*\}/s)`
  - Negative: `expect(css).not.toMatch(/\.grimoire-segmented__btn:focus(?!-visible)/)` — guards the pitch's "no plain `:focus`" rabbit hole; if a future executor weakens the rule to `:focus`, this fires.
  Verify the test is red before A2 (rule does not yet exist). — S, junior-dev
- [x] A2: In `src/main.css`, append the rule immediately after the `.grimoire-segmented__btn.is-active` block (after the closing `}` of line 326, before the `/* CastLogPanel */` comment on line 328). Exact rule body:
  ```css
  .grimoire-segmented__btn:focus-visible {
      outline: 2px solid var(--interactive-accent);
      outline-offset: 2px;
  }
  ```
  No `!important`. Match the four-space indentation used throughout `src/main.css`. Run `npm test` — A1's three assertions all pass. Run `npm run lint` and `npm run arch:check` — both pass (TypeScript surface unchanged). — S, junior-dev
- [x] A3: Smoke `npm run build`. Confirm it exits 0 and that the emitted `styles.css` contains the new rule (search for the selector `grimoire-segmented__btn:focus-visible`). Do not commit `styles.css` — it is build output. If `styles.css` is tracked in git but auto-regenerates, that is a pre-existing project condition; do not change tracking behaviour in this iteration. — S, junior-dev

### Overall effort summary

- Total todos: 3 (S:3 M:0 L:0)
- Dev tiers: junior:3 senior:0 lead:0 ui-integration-tester:0
- One section, one tier group (`**junior-dev**`), CSS-only change with a unit-level CSS-source assertion.
