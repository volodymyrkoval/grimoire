# Clickable Options Chip

> `dev/done-023` — 2026-05-17 — Promotes the `→ options` half of the row hint from decorative text into a real click/tap target with hover-revealed visibility on desktop and always-visible enlarged targets on mobile.

## What it does

In the Spell Picker, every spell row and the Refine sentinel row carry the shared `↵ cast · → options` hint. Until this iteration the hint was a single passive span — purely a keyboard advertisement. Now the `→ options` half is a real, clickable chip: clicking it opens the same options panel that `ArrowRight` opens, and clicking it does *not* fire the row's cast handler. Keyboard bindings are unchanged.

Visibility also changed. On desktop, the hint is hidden by default and reveals itself only when the user hovers the row (or when the row is keyboard-selected, as before). Hovering a non-selected row hides the `↵ cast` half entirely and shows only the `→ options` chip, so the mouse path is unambiguous. On touch platforms (Obsidian sets `body.is-mobile`), the cast hint is hidden and the chip is permanently visible with a larger horizontal padding for finger-sized targets.

The chip itself stretches vertically to the row's full height so its hover background fills the row edge-to-edge, and its hit-rectangle exceeds the visible text both vertically (via `align-self: stretch`) and horizontally (via `padding-inline`).

## Design decisions

- **Split the hint into a wrapper + two children, not two siblings.** `appendRowHint` now emits one `.spells-row-hint` wrapper containing a `.spells-row-hint-cast` span and a `.grimoire-options-chip` span. The wrapper preserves the existing single-line flex behaviour and the existing `.is-selected` / hover opacity rules continue to govern both halves as a unit.
- **Wrapper-level visibility, chip-level hit-area.** The opacity toggle stays on `.spells-row-hint` (reusing the existing transition), and only the chip gets the enlarged tap region. Cast-hint text is non-interactive and does not need it.
- **`opacity` over `visibility`/`display` for the reveal.** Keeps the 0.1 s transition and reserves layout so the row width does not shift on hover.
- **CSS-only mobile detection.** `body.is-mobile` is set by Obsidian on touch platforms; a single selector handles both spell and sentinel rows without JS branching. Falls back to hover-only behaviour if the class is absent — no regression versus prior always-faint state.
- **`stopPropagation` on the chip click.** Prevents the row's cast handler from firing when the chip is the actual click target. The chip's own emission happens before propagation matters.
- **Optional callback, single source of truth.** `appendRowHint` accepts an optional `onOptionsClick`; call sites that do not pass one (e.g. the Forge sentinel, when it ever shows the chip) get an inert chip without divergent code paths.

## Scope

**In:**
- Clickable `→ options` chip on spell rows and the Refine sentinel row.
- Hover-only visibility on desktop; always-visible on `body.is-mobile`.
- Hide `↵ cast` half on hover (non-selected) and on mobile.
- Enlarged hit-area via stretched vertical alignment and 8 px (desktop) / 12 px (mobile) horizontal padding.
- `role="button"` and `tabindex="-1"` on the chip.

**Out:**
- Making `↵ cast` its own click target — *premature; pitch asked only for `→ options` parity with `ArrowRight`*.
- Chip on the Forge sentinel — *Forge does not receive `showHint: true`; out of scope per plan*.
- Animation, tooltip, or keyboard focus on the chip — *no use case yet; chip mirrors the existing keystroke, not a new affordance*.
- Keyboard-shortcut changes — *bindings unchanged by design*.

## Relationship to existing system

- **Extends the shared `appendRowHint` helper introduced in `refine-note-dialog`.** The helper remains the single source of truth for chip vocabulary; both `SpellRow` and `SentinelRow` now thread an optional callback through it.
- **Wires into the same emitter events as `ArrowRight`.** Spell rows emit `open-options` (with the spell); the Refine sentinel emits `open-refine-options` (with `undefined`). The Command Popup routes these to the options panel exactly as it routes the keyboard path — see `command-popup-ui` and `options-panel`.
- **Reuses the existing `.spells-row-hint` opacity mechanism.** The `.is-selected` rule from prior iterations still governs selected rows; the new hover and mobile rules layer on top without replacing it.

## Behavior changes

- **Hint DOM:** previously a single `<span class="spells-row-hint">` with the full text. Now a wrapper span containing a `.spells-row-hint-cast` child and a `.grimoire-options-chip` child (with `role="button"`, `tabindex="-1"`). *Why:* the chip needs to be an independently click-targetable element with its own background.
- **Hint visibility on desktop:** previously always rendered at `opacity: 0` for non-selected rows (effectively invisible). Now the same rule applies *but* row hover reveals it. The `↵ cast` half hides on hover of a non-selected row, leaving only the chip. *Why:* sharpens the click target and avoids visual clutter when the mouse is the input modality.
- **Hint visibility on mobile:** previously identical to desktop. Now `body.is-mobile` forces the chip visible (cast hint hidden) regardless of hover. *Why:* there is no hover on touch.
- **`appendRowHint` signature:** previously `appendRowHint(el)`. Now `appendRowHint(el, onOptionsClick?)`. *Why:* lets call sites route the chip's click to the same handler as the keyboard shortcut without coupling `rowHint` to the emitter.
- **`SpellRow.render` and `SentinelRow.render` signatures:** previously took no callback. Now each accepts an optional trailing `onOptionsClick` and forwards it to `appendRowHint`. *Why:* keeps the row components agnostic of the emitter while still wiring the chip end-to-end.
