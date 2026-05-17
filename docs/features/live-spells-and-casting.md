# Live Spells and Casting

> `dev/done-004` — Replaces the placeholder spell-detail flow with real casting: pressing `Enter` (or clicking) on a spell row dispatches the spell's contents as a system prompt against the active note, using the user's settings defaults.

## What it does

The Spells tab of the Command Popup is now populated by scanning the vault: any markdown file tagged `<spellTag>` (configurable in settings) is a spell. Activating a spell row (mouse click or `Enter` on the highlighted row) closes the popup and casts that spell against the currently-active note via the Claude Code CLI. Toasts surface progress: `Casting '<name>'…` immediately, `Spell cast` on success, `Cast failed: <msg>` on failure. With no active note open, the user sees `Open a note to cast against` and the popup dismisses (assuming the spell is note-bound — see `spell-execute-on-note`).

This iteration removed the previous placeholder spell-detail view (`<h2>` + Back button) entirely. The `cast` event replaced the old `detail` event on `SpellsPanel`. Per-spell options (model, effort, context notes, follow-up) come from the options panel — see `options-panel`.

## Key components

| Component | Location | Responsibility |
|---|---|---|
| `CastDispatcher` | `src/cast/CastDispatcher.ts` | Build user prompt, conditional bail when no active note, notify, invoke caster |
| `Caster` (interface) + `LocalCaster` / `RemoteCaster` | `src/execution/`, `src/cast/local/`, `src/cast/portal/` | Mode-specific execution; see `cast-unification` |
| `CastRunner` + `CastSpawner` + `buildCastArgs` | `src/cast/local/` | Compose CLI binary + args, spawn subprocess (used internally by `LocalCaster`) |
| `getSpells` | `src/infra/spellScanner.ts` | Scan `app.vault.getMarkdownFiles()`, filter by tag, read `executeOnNote` from frontmatter. (Moved from `domain/spells/` to `infra/` in `audit-002-rework` — it imports `obsidian` and cannot sit in the pure domain layer.) |
| `SpellsPanel` | `src/ui/tabs/SpellsPanel.ts` | Hold scanned spells; emit `cast` on `confirm(index)` for spell-row indices |
| `CastAction` (callback) | `src/ui/CommandPopup.ts` | `(spell: Spell, snapshot: OptionsFormSnapshot) => void` — popup-side seam (single action after `cast-unification`); the popup itself builds the default snapshot for Enter-from-list |

## Data flow

```
main.ts.onload → "Open Grimoire" command callback fires:
  closeRef = { close: () => {} }
  dispatcher = new CastDispatcher({ notify: msg => new Notice(msg),
                                    close: () => closeRef.close(),
                                    caster: () => createCaster(this.data.settings),
                                    logWriter: <local or remote CastLogStore, picked by executionMode> })
  popup = new CommandPopup({ ..., castAction: (spell, snap) => dispatcher.dispatch({
      spell,
      model: snap.model,
      effort: snap.effort,
      contextNotePaths: snap.contextNotePaths,
      followUp: snap.followUp,
      settings,
      activeFilePath: app.workspace.getActiveFile()?.path ?? null,
      executeOnNote: snap.executeOnNote,
  }) })
  closeRef.close = () => popup.close()
  popup.open()

CommandPopup (Spells tab):
  Enter or click on a spell row
  → SpellsPanel.confirm(index) emits "cast" with the Spell
  → CommandPopup builds default snapshot { model: defaults.defaultModel, effort: defaults.defaultEffort,
                                           contextNotePaths: [], followUp: '', executeOnNote: spell.executeOnNote }
  → this.#castAction(spell, snapshot)
  → dispatcher.dispatch(input)
      ├── if (executeOnNote && activeFilePath === null) → notify "Open a note to cast against" + close + return
      ├── castId = generateId()                    // see cast-log-foundation
      ├── logWriter.recordCasted({ castId, … })    // fire-and-forget
      ├── userPrompt = "Execute this spell against the note at `<vaultMountPath>/<activeFilePath>`."
      │                (when executeOnNote=false: "Proceed with the execution according to the instructions")
      ├── notify `Casting '<spell.name>'…`         // remote: `'…' on portal…`
      ├── close()                                   // dismisses popup
      └── caster.cast({ castId, spellPath, modelId, effort, userPrompt, systemPromptFile, vaultMountPath }, callbacks)
            // LocalCaster spawns claude via CastRunner; RemoteCaster POSTs via RemoteCastTransport — see cast-unification
            → onAccepted({})        → local: notify "Spell cast"
            → onAccepted({ jobId }) → remote: second recordCasted with portalCastId (no toast)
            → onFailure(msg)        → logWriter.recordError({ castId, message }) + notify `Cast failed: <msg>` (local) or msg (remote)
```

The settings closure dereferences `this.data.settings` and `this.app.workspace.getActiveFile()` on every cast — settings edits and active-file changes both take effect on the next dispatch with no popup re-open.

## How to trigger

1. Open the Command Popup (Obsidian command "Open Grimoire").
2. The Spells tab lists every vault note tagged `<spellTag>` (frontmatter `tags` or inline). Type to filter, `ArrowUp`/`ArrowDown` to navigate.
3. `Enter` (or click the row) dispatches that spell against the currently-active note.

## Edge cases / invariants

- **No active note** — when the spell is note-bound (`executeOnNote === true`, the default), dispatcher toasts `Open a note to cast against` and calls `close()`; runner is never invoked. Note-free spells (`executeOnNote === false`) skip this guard.
- **Active-file resolution** — happens at confirm time inside the closure (`getActiveFile()?.path ?? null`), not at popup-open. The user can switch notes after opening the popup; the cast targets whatever is active when they press Enter.
- **`vaultMountPath === ""`** — `buildCastArgs` skips `--add-dir`; `CastSpawner` falls back to process cwd. Cast may still succeed if Claude resolves the file.
- **`defaultEffort === null`** (Haiku) — `buildCastArgs` omits `--effort`.
- **Spawn failure** (binary missing, ENOENT, EACCES) — routed through `CastSpawner` → `CastRunner.onCastError` → `Cast failed: <message>` toast.
- **Always uses settings defaults** — the Enter-from-list path builds a snapshot inside `CommandPopup` using `defaults.defaultModel` / `defaults.defaultEffort`. Per-spell stored overrides apply only when the user opens the options panel (see `options-panel`).
- **Empty `contextNotePaths` and `followUp`** — both seeded as `[]` and `""` in the Enter-from-list snapshot; the options panel populates them when used.
- **Spell list is read-once at popup open** — `getSpells` runs in the `SpellsPanel` constructor. A vault edit during an open popup will read stale until the popup is reopened.
- **Popup teardown is dispatcher-driven** — `dispatcher.dispatch` calls its injected `close` (which routes to `popup.close()`); the popup's own `close()` override returns early in detail phase but in `search` phase it calls `super.close()` and the modal closes normally.
