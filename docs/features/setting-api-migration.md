# Setting API Migration

> `dev/done-031` · 2026-05-21 · Migrate the popup form components to Obsidian's native `Setting` API so every field renders as a theme-adaptive `.setting-item` row.

## What it does

The three popup-modal form components — the spell-cast Options panel, its shared Cast-model sub-section, and the Forge sentinel detail form — previously hand-built each field with `createEl`/`createDiv` plus bespoke CSS. They now build their text, textarea, dropdown, and toggle fields with `new Setting(container).setName(...).addX(...)`, the same API the Settings tab already uses.

There is no user-visible behavior change. The forms look like native Obsidian setting rows, so they inherit whatever the active theme applies to `.setting-item` instead of carrying Grimoire's own field styling. Form state, events, keyboard bindings, snapshot shapes, override and session semantics, and submit-enable rules are all identical to before.

A follow-up pass added help text (`setDesc`) to all eleven Settings-tab fields and regrouped two action buttons (the "Create from default" and "Open" Refine buttons) for clearer semantics.

## Design decisions

- **Structure-preserving migration, not a free rewrite.** The `<form>` wrappers and every element a test queries — by tag, by `data-grimoire` attribute, by class — were kept reachable. Rationale: the goal was visual theme compatibility, not a contract change; preserving the DOM contract kept ~90% of the large form test suite green and shrank the blast radius to a handful of genuinely layout-dependent assertions.
- **Two custom widgets stay standalone.** The context-notes pills and the hotkey-capture field are bespoke state machines, not single-value controls; mounting them into a `Setting` row would give no theme benefit (the inner widget DOM is what a theme can't style anyway) and would break pinned ordering tests.
- **The multi-button action row stays custom.** The Cast button must be `type="submit"` to drive the form's submit handler, which `Setting.addButton` does not expose; the row is already theme-neutral via `mod-cta`, so converting it would add cost for no gain.
- **`EffortRow` mounts into a `Setting.controlEl`,** mirroring the proven Settings-tab pattern, keeping its own `.grimoire-effort-row` wrapper unchanged.
- **Inner DOM listeners are kept reachable.** The mock `Setting` controls store an `onChange` callback but do not attach a real DOM listener, while tests fire raw `change`/`input` events on the inner element; so each migrated control keeps a native listener on its inner element rather than routing all wiring through the `.onChange` lambda. This was the highest-risk correctness item.

## Scope

**In:** Options panel, Cast-model section, and Forge sentinel detail field construction; mounting `EffortRow` into a Setting row; removal of CSS that became unused; help text and button regrouping on the Settings tab.

**Out:**
- Any behavior change — explicitly excluded; this is a visual/structural migration only.
- The context-notes pills and hotkey-capture field internals — kept custom because they gain nothing from a Setting wrapper and their ordering is test-pinned.
- The action button row — kept custom because `Setting.addButton` can't produce a submit button.
- The Refine variant selector — left as-is this iteration, awaiting its own pass; its `.grimoire-field-label` class is therefore retained.

## Relationship to existing system

Builds on the `Setting`-based pattern already established by the Settings tab and the Custom Refine section. Touches the same surfaces documented in `options-panel.md`, `forge-cast.md`, `forge-spell-update.md`, and `spell-hotkeys.md`, but changes only how their fields are constructed — none of those features' behavior moved. Two layout-dependent integration assertions (the "Set as default" visibility toggle and the effort-row-before-submit ordering) were honestly rewritten to target the new `.setting-item` structure rather than the old hand-built markup.
