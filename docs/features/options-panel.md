# Options Panel

> `dev/done-005` — Adds a per-spell options panel reachable via `ArrowRight` from a spell row, exposing model / effort / context-notes / follow-up / executeOnNote, plus a "Set as default" checkbox that toggles a persisted per-spell override.

## What it does

From the Spells tab of the Command Popup, pressing `ArrowRight` on a highlighted spell row slides into a detail panel — a form with model select, effort segmented control, context-notes pill input, follow-up textarea, "Execute on active note" checkbox, and (conditionally visible) "Set as default" checkbox plus Cast and Reset buttons.

Pre-fill order is three-tier: **session entry** for this spell (last cast's values, including a fresh override) → **stored override** (model+effort only) → **settings defaults**. The session map lives for the Obsidian process lifetime, so re-opening the popup and re-opening the panel for the same spell pre-fills with the user's last cast values.

Cast button (or `Cmd/Ctrl+Enter`) writes the live values to the session map and dispatches via the same `CastDispatcher` as the Enter-from-list path. Reset restores the open-time snapshot (model+effort + initial executeOnNote), clears context notes / follow-up, and deletes the spell's session entry. The "Set as default" checkbox toggles `SpellOverrideStore.set` / `clear` for the spell's path; it's only shown when the live model/effort have drifted from the open-time snapshot AND the model has effort options (Haiku is rejected by the store). Spell rows whose path has a stored override show a `<span class="grimoire-override-dot">` next to the name.

## Key components

| Component | Location | Responsibility |
|---|---|---|
| `OptionsPanel` | `src/ui/options/OptionsPanel.ts` | Render seven controls, subscribe to `formState.onChange`, wire Cast/Reset/checkbox |
| `OptionsFormState` | `src/ui/options/OptionsFormState.ts` | Reactive holder for `{ model, effort, contextNotePaths, followUp, executeOnNote }`; effort-survival rule on `setModel` |
| `OptionsSessionMap` | `src/ui/options/OptionsSessionMap.ts` | Per-spell `OptionsSessionEntry` storage for the Obsidian process lifetime |
| `SpellOptionsDetail` | `src/ui/components/SpellOptionsDetail.ts` | Resolve via `resolveSpellOptions`, build form state, mount `OptionsPanel` |
| `resolveSpellOptions` | `src/domain/settings/spellOptionsResolver.ts` | 3-tier resolver (session → override → settings) with effort clamping |
| `SpellOverrideStore` | `src/domain/settings/SpellOverrideStore.ts` | Persisted `model+effort` per spell path; rejects Haiku; debounced save |
| `SpellRow` (modified) | `src/ui/components/SpellRow.ts` | Renders override dot when `hasOverride === true` |
| `SpellsPanel.refreshOverrides` | `src/ui/tabs/SpellsPanel.ts` | Re-render the spell list at the same `selectedIndex` after override mutation |
| `CastAction` (callback) | `src/ui/CommandPopup.ts` | `(spell, OptionsFormSnapshot) => void` — popup-side seam; single action for both Enter-from-list and options-panel paths (see `cast-unification`) |

## Data flow

```
ArrowRight in search phase, spells tab, selectedIndex on a spell row:
  → CommandPopup binding → spellsPanel.openOptions(selectedIndex)
  → SpellsPanel emits "open-options" with the spell
  → CommandPopup.renderOptionsPanel(spell):
      phase = 'detail'; kb.suspend(); mount SpellOptionsDetail({ spell, app, overrides, sessionMap, formDefaults, models, onBack, onCast, onOverrideChanged })
      → SpellOptionsDetail builds OptionsFormState from resolveSpellOptions + session entry (or spell.executeOnNote default)
      → SpellOptionsDetail mounts OptionsPanel with snapshot { model: resolved.model, effort: resolved.effort }

User edits form:
  control change → formState.set*() → emit → reactive subscribers update
    EffortRow.update / mount-on-Haiku→Sonnet
    "Set as default" label visibility = (!snapshotMatches && snapshot.effort !== null) ? show : hide
    "Set as default" checkbox.checked = overrides.has(spellPath)

Cast (button click / form submit / Cmd+Enter):
  → sessionMap.put(spellPath, formState.snapshot())
  → deps.onCast(snapshot)
  → CommandPopup.#castAction(spell, snapshot)   // unified action after cast-unification
  → main.ts closure: dispatcher.dispatch({ spell, model, effort, contextNotePaths, followUp, settings, activeFilePath, executeOnNote })

Reset (button click):
  → formState.setModel(snapshot.model, SUPPORTED_MODELS)
  → if (snapshot.effort !== null) formState.setEffort(snapshot.effort)
  → contextNotesInput.clear() + textarea.value = ''
  → formState.setFollowUp(''); formState.setExecuteOnNote(initialExecuteOnNote)
  → sessionMap.delete(spellPath)

"Set as default" toggle:
  checked   → overrides.set(spellPath, { model, effort: effort! })  // Haiku rejected by store
  unchecked → overrides.clear(spellPath)
  both      → deps.onOverrideChanged() → SpellsPanel.refreshOverrides() → dot lights/extinguishes
```

## How to trigger

1. Open the Command Popup, navigate to a spell row.
2. Press `ArrowRight`. The panel replaces the search view (popup phase = `detail`, search keys suspended).
3. Edit any control. Click **Cast** (or `Cmd/Ctrl+Enter`) to dispatch with the live values; click **Reset** to restore the open-time defaults; tick **Set as default** to persist model+effort for this spell; click **← Back** (or Escape) to dismiss without casting.

A spell row keyboard hint reads `↵ cast · → options` to advertise both bindings.

## Edge cases / invariants

- **`ArrowRight` in detail phase or on a sentinel row** — binding returns `false` (no second mount); the keystroke falls through to platform default.
- **`ArrowRight` on empty filtered list** — `openOptions(index)` bounds-check no-ops.
- **Haiku model selected** — `EffortRow` renders no segmented control; "Set as default" stays hidden because `snapshot.effort === null` (effort not persistable).
- **Stored override already matches snapshot** — on first open of a spell with an override, the resolver returns the override values; snapshot matches current → checkbox hidden. Once the user drifts the form, the checkbox appears, already showing `checked: true` (since `overrides.has` is true).
- **Closing without casting (Escape / Back)** — discards live edits; the session map is only written on Cast. Reset is the canonical way to clear a session entry.
- **Cast leaves the modal open** — the dispatcher's injected `close` calls `popup.close()`, which is overridden in detail phase to run `exitDetail()` and return; the modal stays open at the search phase. Same as the forge flow.
- **`refreshOverrides` re-renders the entire list** — there is no per-row mutation API; the existing `SpellList.render` preserves selection via the `selectedIndex` arg.
- **Session map lives per-`onload`** — entries survive popup close/re-open within the same Obsidian process. Restart Obsidian for a clean slate.
- **`SpellOverrideStore.set` rejects null-effort models** — defence in depth; the visibility rule already hides the checkbox when `effort === null`.
- **No `ArrowLeft` to dismiss** — Escape (via `CommandPopup.close()` override → `exitDetail()`) is the only dismissal; ArrowLeft remains available for cursor movement in textareas.
