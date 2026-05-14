# Settings Panel

> `dev/done-002` — 2026-05-05 — Adds an Obsidian Settings tab for the seven `GrimoireSettings` fields, wires the plugin to own its hydrated data and a debounced saver, and backfills unit tests across the previously untested PoC modules. *(The tab gained an `Advanced` section with six more fields in `dev/done-011`; see `remote-casting-setup`.)*

## What it does

Users can now open **Settings → Community plugins → Grimoire** and edit the plugin's seven core configuration fields: spell tag, CLI command, binary path, forge output folder, vault mount path, default model, and default effort. Edits write through to the in-memory settings object on every keystroke and persist to disk through a 500 ms debounced saver. The plugin flushes any pending write on unload, so closing Obsidian never loses a change.

The default-effort row is conditional: when the selected model has no effort options (Haiku), the segmented control disappears; when the model has options (Sonnet, Opus), it re-appears with that model's effort levels. The Command Popup also now reads the user-configured spell tag instead of a hardcoded literal, so changing "Spell tag" in settings immediately changes which vault notes the popup considers spells.

Alongside the visible feature, the iteration backfilled characterisation tests across roughly ten previously-uncovered domain, infra, and widget modules — debounced saver, hydration, vault-mount default, spell-override store, options resolver, segmented control, effort row, options form state, session map, snapshot equality. The codebase enters the next iteration test-clean.

## Design decisions

- **No reactive framework, no row abstraction.** Settings rows write directly to `plugin.data.settings.<field>` and call `plugin.save()`. With seven fields and six near-identical text rows at this iteration, a Strategy or store layer would be speculative generality.
- **One `EffortRow` instance, mounted once and reused via `update()`.** The widget already encodes its own four mount/unmount cases; recreating it on every model change would discard that logic and churn DOM identity.
- **Persistence is debounced in exactly one place — the plugin's `DebouncedSaver`.** Rows never call `saveData` directly; they call `plugin.save()`, which schedules. Typing a field never produces multiple writes inside the debounce window.
- **`onunload` flush is the only hard persistence guarantee.** Matches the existing `DebouncedSaver` contract; no other event triggers an immediate write.
- **Effort survival is owned by `EffortRow`, not the settings tab.** When the user picks a model whose options exclude the current effort, the row falls back visually to that model's `defaultEffort` but does not rewrite `data.settings.defaultEffort` — avoiding a write-on-render side effect. Persisted value can be momentarily out of sync with the visible row until the user touches it; flagged as a deferred edge case.
- **Saved unknown `defaultModel` ids are not coerced in `hydrate`.** Pushing model-id validation into the domain layer would mix UI policy with hydration; left to the dropdown as a deferred soft-correction.

## Scope

**In:**

- `GrimoireSettingTab` rendering five text rows + one model dropdown + one conditional effort row.
- Plugin wiring: `data`, `saver`, `overrides`, `addSettingTab`, `onunload` flush, non-async `save()` shim.
- Unit tests covering every `if`/`else` arm in the frozen PoC modules listed above.
- One UI integration test pinning the settings-tab seam: row count, text-input write-through + save, dropdown → effort hide / lazy-remount, effort click → save.
- Obsidian mock additions: `Plugin`, `PluginSettingTab`, `Setting`, `TextInputComponent`, `DropdownComponent`, `Platform`, `FileSystemAdapter`.

**Out:**

- Reset-to-defaults / import / export / inline validation UI — premature; no use case yet.
- Settings UI for `spellOverrides` — separate concern, owned by the future Spell Picker options panel.
- Real-Obsidian end-to-end tests — would require a running vault, far outside this iteration's budget.
- Source changes to the frozen PoC modules — characterisation only; behaviour locks in *as committed*. If a test would force a source change, the source is wrong, not the test, and a follow-up plan is required.
- Soft-correcting unknown saved `defaultModel` ids — deferred until a second use case justifies pushing UI policy into hydration.

## Relationship to existing system

- **Builds on** the previously-committed PoC under `src/domain/settings/`, `src/infra/`, `src/ui/widgets/`, and `src/ui/options/`. Those modules were untested before this iteration; they remain unchanged but are now pinned by tests.
- **Replaces** the placeholder `onunload` (a `console.log`) with a real flush, and replaces the hardcoded `'spell'` literal in the Command Popup constructor with the user-configured `spellTag`.
- **Mirrors** the integration-test harness pattern established by `docs/features/ui-integration-tests.md`: one happy-dom seam test under `tests/integration/`, mocked Obsidian, no real vault.
- **Interacts with** the existing `DebouncedSaver` contract — `save()` schedules, `onunload` flushes — and the `SpellOverrideStore`, which receives the same saver instance so spell overrides and settings coalesce into a single write.

## Behavior changes

- **Plugin unload:** previously logged `"Grimoire plugin unloaded"`; now flushes the debounced saver. Reason: the debounced saver is now the only persistence path, so unload without flush would silently drop pending edits.
- **Command Popup spell tag:** previously hardcoded to the literal `'spell'` in the popup constructor; now passed in from `plugin.data.settings.spellTag`. Reason: the spell tag is a user-configurable setting, so the popup must read it from settings rather than from source.
