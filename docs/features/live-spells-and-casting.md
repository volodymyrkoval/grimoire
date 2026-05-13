# Live Spells and Casting

> `dev/done-004` — Replaces the placeholder spell-detail flow with real casting: pressing `Enter` (or clicking) on a spell row dispatches the spell's contents as a system prompt against the active note, using the user's settings defaults.

## What it does

The Spells tab of the Command Popup is now populated by scanning the vault: any markdown file tagged `<spellTag>` (configurable in settings) is a spell. Activating a spell row (mouse click or `Enter` on the highlighted row) closes the popup and casts that spell against the currently-active note via the Claude Code CLI. Toasts surface progress: `Casting '<name>'…` immediately, `Spell cast` on success, `Cast failed: <msg>` on failure. With no active note open, the user sees `Open a note to cast against` and the popup dismisses (assuming the spell is note-bound — see `spell-execute-on-note`).

This iteration removed the previous placeholder spell-detail view (`<h2>` + Back button) entirely. The `cast` event replaced the old `detail` event on `SpellsPanel`. Per-spell options (model, effort, context notes, follow-up) come from the options panel — see `options-panel`.

## Key components

| Component | Location | Responsibility |
|---|---|---|
| `CastDispatcher` | `src/cast/CastDispatcher.ts` | Build user prompt, conditional bail when no active note, notify, spawn cast |
| `CastRunner` + `CastSpawner` + `buildCastArgs` | `src/cast/` | Compose CLI binary + args, spawn subprocess, route exit/error |
| `getSpells` | `src/domain/spells/spellScanner.ts` | Scan `app.vault.getMarkdownFiles()`, filter by tag, read `executeOnNote` from frontmatter |
| `SpellsPanel` | `src/ui/tabs/SpellsPanel.ts` | Hold scanned spells; emit `cast` on `confirm(index)` for spell-row indices |
| `CastAction` (callback) | `src/ui/CommandPopup.ts` | `(spell: Spell) => void` — popup-side seam, wired in `main.ts` |

## Data flow

```
main.ts.onload → "Open Grimoire" command callback fires:
  closeRef = { close: () => {} }
  dispatcher = new CastDispatcher({ notify: msg => new Notice(msg),
                                    close: () => closeRef.close(),
                                    castRunner: new CastRunner(),
                                    castLogStore: this.castLogStore })
  popup = new CommandPopup({ ..., castAction: spell => dispatcher.dispatch({
      spell,
      model: settings.defaultModel,
      effort: settings.defaultEffort,
      contextNotePaths: [],
      followUp: '',
      settings,
      activeFilePath: app.workspace.getActiveFile()?.path ?? null,
      executeOnNote: spell.executeOnNote,
  }) })
  closeRef.close = () => popup.close()
  popup.open()

CommandPopup (Spells tab):
  Enter or click on a spell row
  → SpellsPanel.confirm(index) emits "cast" with the Spell
  → CommandPopup constructor handler: this.#castAction(spell)
  → dispatcher.dispatch(input)
      ├── if (executeOnNote && activeFilePath === null) → notify "Open a note to cast against" + close + return
      ├── castId = generateId()                    // see cast-log-foundation
      ├── castLogStore.recordCasted({ castId, … }) // fire-and-forget
      ├── userPrompt = "Execute this spell against the note at `<vaultMountPath>/<activeFilePath>`."
      │                (when executeOnNote=false: "Proceed with the execution according to the instructions")
      ├── notify `Casting '<spell.name>'…`
      ├── close()                                   // dismisses popup
      └── runner.run({ systemPromptFile: `<vaultMountPath>/<spell.path>`, userPrompt, modelId, effort, castId, ... })
            → claude --system-prompt-file <path> -p <userPrompt> --model <id> [--effort …] [--add-dir …]
            → env includes CAST_ID
            → exit 0  → notify "Spell cast"
            → exit !=0 / spawn error → castLogStore.recordError({ castId, message }) + notify "Cast failed: <msg>"
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
- **Always uses settings defaults** — the Enter-from-list path passes `settings.defaultModel` / `settings.defaultEffort` directly. Per-spell stored overrides apply only when the user opens the options panel (see `options-panel`).
- **Empty `contextNotePaths` and `followUp`** — both passed as `[]` and `""` from the Enter-from-list path; the options panel populates them when used.
- **Spell list is read-once at popup open** — `getSpells` runs in the `SpellsPanel` constructor. A vault edit during an open popup will read stale until the popup is reopened.
- **Popup teardown is dispatcher-driven** — `dispatcher.dispatch` calls its injected `close` (which routes to `popup.close()`); the popup's own `close()` override returns early in detail phase but in `search` phase it calls `super.close()` and the modal closes normally.
