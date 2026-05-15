# Refine Cast

> `dev/done-019` — 2026-05-15 — Wires the Refine sentinel's Enter trigger (from list and dialog) to the shared cast pipeline. Materializes `refine.md` on plugin load; guards on active markdown note; supplies cast-log `<refine>` sentinel.

## What it does

The Refine sentinel in the Spell Picker now casts against the active note when the user presses Enter — directly from the list or after configuring options in the dialog. The cast follows the same dispatch pipeline as spell casting or forge casting: a `castId` is minted, a cast-log entry is written before spawning, Claude Code is invoked with the hardcoded Refine prompt body (stored at `<vault>/.obsidian/plugins/grimoire/refine.md`), and status transitions through the existing lifecycle. Cast Log shows a `<refine>` row for each Refine cast, just as it does for forge casts.

Model, effort, and context notes come from the persisted Refine defaults set in the Refine OptionsPanel — or overridden in-dialog if the user opened the panel and adjusted the form. The active note's path is passed to Claude Code as the target file; the prompt itself decides what to do with it (no mode detection in the plugin).

Refine requires an open markdown file: if the user presses Enter and no `.md` file is active, a Notice warns `"Refine needs an open note"` and the popup stays open — no `castId`, no log write, no subprocess.

## Design decisions

- **Guard at builder layer, not dispatcher.** The active-note check fires in `refineCastAction`, before any dispatch input is built, so a missing-note never reaches the log. Prevents unwanted `castId` minting and keeps the Notice semantics (popup stays open) distinct from other guards.
- **`popup.dismiss()` after dispatch.** When Refine cast is invoked from the dialog (via `RefineOptionsDetail.onCast`), the closure captures `popup.dismiss()` and calls it after the dispatcher closes the modal — full close, no return-to-search. Mirrors the list-Enter path which also closes fully.
- **`systemPromptFilePath` override field on `CastDispatchInput`.** Rather than hardcode Refine prompt-assembly in the dispatcher, a new optional field lets the builder pass the materialized file path (`refine.md`). Dispatcher uses it directly instead of computing from `spell.path`. Same pattern as forge.
- **`<refine>` sentinel distinct from `REFINE_SENTINEL_PATH`.** The cast-log sentinel is `'<refine>'` (for row identity in Cast Log); the override persistence key is `'<grimoire-sentinel:refine>'` (for model/effort storage). Separate namespaces, no collision, both load-bearing.
- **`optionsFormSnapshotFromRefineDefaults` for list-Enter persistence.** When Enter fires from the spell list (not the dialog), a snapshot is built from the user's persisted Refine defaults + `executeOnNote: true`, then passed to `refineCastAction`. Ensures list-Enter casts carry the same model/effort as the dialog would, without forcing the user to open the panel.

## Scope

**In:**
- `renderRefineSystemPrompt()` in `src/refine/refineTemplate.ts` — pure function returning hardcoded Refine prompt body.
- `RefineMaterializer` class writing `refine.md` to `<pluginDir>` via `DataAdapter`.
- `REFINE_SPELL_PATH = '<refine>'` constant in cast-log types module.
- `refineCastSpell()` factory for the dispatch-input builder.
- `resolveDisplayName` extended to recognize `<refine>` and return `'Refine'`.
- Active-note guard in `refineCastAction` builder closure (guard → `Notice` + bail-out if missing `.md` file).
- `CastDispatchInput.systemPromptFilePath?: string` override field.
- Two trigger paths converging on `refineCastAction`: list-Enter (via `SpellsPanel.confirm` + `'refine-cast'` event) and dialog-Cast (via `RefineOptionsDetail.onCast`).
- `executeOnNote` checkbox hidden in Refine OptionsPanel (`OptionsPanel.render()` receives `showExecuteOnNote: false`).
- Integration tests covering list-Enter, dialog-Cast, and missing-active-note guard.
- Live-spec + drift sweep on three existing feature docs.

**Out:**
- Autonomous modes (Generate / Expand) — deferred; cast requires either `@cast` lines or a follow-up.
- CodeMirror decoration of `@cast` lines.
- Custom Refine Script — prompt is hardcoded in plugin source.
- Re-cast affordance on Refine entries in Cast Log.

## Relationship to existing system

- **Extends `cast-unification` (014).** Both spell casting and Refine casting now flow through the shared `CastDispatcher` with identical `castId` threading and log-record discipline.
- **Mirrors `forge-cast` (016/018) pattern.** Hardcoded system-prompt file (`forge.md` / `refine.md`), builder-layer prompt setup, `systemPromptFilePath` passed to dispatcher, cast-log sentinel for row identity.
- **Extends `refine-note-dialog` (017) foundation.** The dialog now dispatches a cast instead of merely dismissing; `executeOnNote` checkbox is hidden; persisted overrides are used to populate the cast.
- **Composition with `remote-casting`.** Remote Refine casts send `spellPath: '<refine>'` to the portal (alongside `systemPromptFilePath` for local). Portal treats it as a standard file lookup (no special handler).

## Behavior changes

- **Enter on Refine sentinel (from list).** Previously dismissed the modal (no detail, no cast). Now dispatches a Refine cast against the active note (with a Notice if no active `.md` file open).
- **Cast/Mod+Enter inside Refine OptionsPanel.** Previously dismissed the modal only. Now dispatches a Refine cast with form-snapshot values and fully closes the popup.
- **Refine cast-log entry.** Previously did not exist. Now a `<refine>` row appears in Cast Log for each Refine cast, showing model, effort, and status.
- **Plugin `onload` side effects.** In addition to materializing hooks and sweep, `onload` now writes `<pluginDir>/refine.md`. Failures caught and logged; plugin still loads.
