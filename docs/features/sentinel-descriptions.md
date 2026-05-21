# Sentinel Descriptions

> `dev/done-024` · 2026-05-17 · Add a secondary description line beneath each sentinel row's name in the Spell Picker.

## What it does

Each built-in sentinel row in the Spell Picker now shows a short, always-visible description line under its name. The Forge sentinel reads "Author a new spell from a description" and the Refine sentinel reads "Rewrite the active note." The description is rendered with Obsidian's `--text-faint` colour and `--font-ui-smaller` size tokens, so it stays visually subordinate to the name without any hard-coded colours.

There is no hover toggle and no animation — the line is simply part of the row. The keyboard-hint chip (`↵ cast · → options`) stays vertically centred against the now-taller name-plus-description block via the row's existing `align-items: center` rule, so no layout adjustment was needed.

User-authored spell rows do not get a description line; only the built-in Forge and Refine sentinels carry one.

## Design decisions

- **Always visible, no hover or collapse mode.** The description is a static second line, not a tooltip — the goal is at-a-glance clarity for the two built-in actions, which a hover-reveal would defeat.
- **Theme tokens, not hard-coded styling.** `--text-faint` and `--font-ui-smaller` make the line subordinate while adapting to the active theme.
- **Copy resolved from a small per-kind map.** A local `forge`/`refine` map supplies the text; any sentinel kind not in the map (e.g. a separator) renders no description, keeping the feature scoped to the two built-ins.

## Scope

**In:** A description line on the Forge and Refine sentinel rows, the per-kind copy map, and the `.sentinel-description` CSS rule.

**Out:**
- A description field for user-authored spells — separate concern; only the two built-in sentinels were in scope.
- A tooltip or collapsed/expanded mode — premature; the always-visible line is the chosen design.
- Localisation / i18n — out of scope for this iteration.
- Row padding adjustments — unnecessary; the row grows naturally and the existing centring rule already handles the taller block.
- Icons or glyphs on the description line — not requested.

## Relationship to existing system

Extends the Spell Picker's `SentinelRow` rendering (see `command-popup-ui.md`). Purely additive to that surface — the name, the keyboard-hint chip, and the row's existing layout rules are untouched. A separator sentinel continues to render no description, so the spell-list separator path is unaffected.
