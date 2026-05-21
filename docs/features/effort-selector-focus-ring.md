# Effort Selector Focus Ring

> `dev/done-025` · 2026-05-17 · Add a keyboard-only focus ring to the custom segmented effort control so Tab-navigating users can see when focus lands on it.

## What it does

The segmented effort control (the custom Low/Medium/High-style selector) previously showed no focus styling, unlike the native form controls around it — model select, context-notes input, follow-up textarea, checkboxes — which all light up on keyboard focus. A Tab-navigating user could land on the effort control and see nothing.

Now, when keyboard focus arrives on a segment, the browser paints a 2px accent outline around that segment, drawn from Obsidian's `--interactive-accent` variable. As arrow keys move focus between segments, the outline follows. Clicking a segment with the mouse still selects it without showing the ring — only keyboard arrival triggers the decoration.

The fix is a single CSS rule on `.grimoire-segmented__btn:focus-visible`; no TypeScript changed. It applies everywhere the segmented control is mounted — the authored-spell options panel, the Refine options panel, and the Forge-update options panel.

## Design decisions

- **`:focus-visible`, not `:focus`.** Mouse clicks must not light the ring; `:focus-visible` is the browser's keyboard-vs-pointer heuristic, so a click selects without the outline while a Tab arrival shows it.
- **`outline`, not `box-shadow`.** Outline does not affect layout (no reflow of adjacent segments) and sidesteps a conflict — the existing segment rule already declares `box-shadow: none !important`, which a box-shadow ring would have to fight.
- **`--interactive-accent`,** the token the control already uses for its active-segment background, so no new colour authority is introduced.
- **Per-segment, not per-wrapper.** The focused button is the actual focus target the user is about to act on with arrow keys; framing the whole control would not communicate which segment owns the keyboard.
- **Verified by a CSS-source unit test, not an integration test.** happy-dom's `getComputedStyle` does not evaluate `:focus-visible`, so an integration test would be hollow; the project precedent is a regex assertion against the CSS source pinning the selector and accent variable.

## Scope

**In:** One `:focus-visible` CSS rule on the segmented-control button, plus a unit test pinning its shape.

**Out:**
- Animating the ring in — explicitly excluded by the pitch.
- A `:focus` (mouse) variant — only keyboard-origin focus should show the ring.
- Changes to other controls' focus styling or to selected-segment styling — selection and focus compose; neither is altered.
- Keyboard interaction-model changes — Tab and arrow behaviour are unchanged.
- Theme-specific overrides or focus-restoration across re-renders — a community theme that drops the accent variable falls back to the browser's default ring, which the pitch accepts.

## Relationship to existing system

Purely additive styling on the `SegmentedControl` widget, which already focuses the correct button on Tab arrival and arrow navigation. No behavior, markup, or keyboard logic changed — the rule is declarative and triggered by the browser. The rule lives in `src/main.css`; the built `styles.css` is re-emitted from it by esbuild.
