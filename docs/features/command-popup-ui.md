# Command Popup UI

An Obsidian modal (`CommandPopup`) that lets the user search, browse, and activate spells or logs via keyboard-first navigation. Two phases: **search** (list + filter) and **detail** (forge form / options panel / Refine sentinel options).

## User-facing behavior

| Interaction | Effect |
|---|---|
| Open modal | Spells tab active, cursor in search input, first spell selected |
| Type in search | List filters live; if query matches no spells but matches a sentinel name, that sentinel is auto-selected |
| `ArrowDown` / `ArrowUp` | Move selection, wrapping at both ends |
| `Tab` | Cycle Spells → Logs → Spells; clears query and resets index |
| Click tab | Same as Tab, but direct |
| `Enter` on spell row | Cast that spell against the active note (see `live-spells-and-casting`) |
| `ArrowRight` on spell row | Open the options panel for that spell (see `options-panel`) |
| Click on spell row | Same as Enter |
| `Enter` on Forge sentinel | Open Forge form (name/desc/executeOnNote/model/effort, focused on name) |
| `Enter` on Refine sentinel | Close the popup (no detail, no cast) |
| `ArrowRight` on Refine sentinel | Open the options panel (same as authored spell); Cast/Enter inside dismisses the popup without dispatching |
| `Escape` or `close()` in detail | Run `exitDetail()` — destroy active detail, resume keys, return to search |
| Back button click | Same as Escape in detail |
| Submit Forge form | Invoke `imprintAction(snapshot)` then `exitDetail()` |
| Cast from options panel | Invoke `castAction(spell, snapshot)`; dispatcher closes the popup which routes to `exitDetail()` |
| Close modal from search | `super.close()` → `contentEl.empty()` |

## State machine

```
          onOpen()
             │
             ▼
┌────────────────────┐   Enter/click on spell row → castAction(spell, defaultSnapshot), close popup (search→close)
│   SEARCH phase     │   ArrowRight on spell row  → renderOptionsPanel(spell)
│  • #kb active      │   Enter on Forge sentinel  → renderForgeSentinelDetail()
│  • TabBar enabled  │   Enter on Refine sentinel → close popup (no detail route)
│                    │   ArrowRight on Refine sentinel → renderRefineSentinelOptions()
└─────────┬──────────┘
          │
          │   exitDetail()
          ▼  (Escape / Back / close() override / forge submit / panel cast)
┌────────────────────────────────────────────┐
│  DETAIL phase (one of three variants)      │
│  • TabBar disabled                         │
│  • close() override intercepts Escape      │
│                                            │
│  Forge sentinel:  kb.suspend(); FSD owns its own KeyboardController
│  Options panel:   kb.suspend(); OptionsPanel owns its own KeyboardController
│  Refine options:  kb.suspend(); same as spell options panel, but Cast/Enter dismisses without dispatching
└────────────────────────────────────────────┘
```

Detail variants:
- **Forge sentinel** — `renderForgeSentinelDetail`: kb suspended, `ForgeSentinelDetail` mounted (owns model-select ArrowUp/Down). `destroy()` runs in `exitDetail` before `kb.resume()`.
- **Spell options panel** — `renderOptionsPanel`: kb suspended, `SpellOptionsDetail` (which mounts `OptionsPanel`) owns its own keys (Cmd+Enter for Cast). `destroy()` runs in `exitDetail` before `kb.resume()`.
- **Refine sentinel options** — `renderRefineSentinelOptions`: kb suspended, same panel and form as spell options. `onCast` calls `dismiss()` instead of dispatching a cast action.

## Constructor

`CommandPopup` takes a single params object (`CommandPopupParams`): `app`, `spellTag`, `imprintAction`, `castAction` (single callback of shape `(spell, snapshot) => void` — see `cast-unification`), `defaults` (`{ defaultModel, defaultEffort }`), `overrides` (`SpellOverrideStore`), `sessionMap` (`OptionsSessionMap`), `castLogPanelDeps`. All composition is done in `main.ts`; the popup imports neither `CastDispatcher` nor `ForgeImprinter` nor `Notice`.

## Data flow

```
SearchInput → oninput → activePanel.filter(query)
                      → SpellList.render(filteredSpells, selectedIndex, hasOverride)
                      → CommandPopup.#searchQuery / selectedIndex updated

ArrowDown/Up → KeyboardController dispatch → CommandPopup.move(delta)
             → activePanel.move() [modular arithmetic] → updateSelection()
             → SpellList.updateSelection(prev, next) toggles .is-selected

Enter → CommandPopup.confirm() → activePanel.confirm(index)
      → SpellsPanel emits 'cast' (spell row) or 'sentinel' (sentinel row)
      → CommandPopup builds default snapshot from formDefaults + spell.executeOnNote
      → castAction(spell, snapshot)  /  renderSentinelDetail(s)

ArrowRight (search phase, spells tab, spell-row index)
      → spellsPanel.openOptions(selectedIndex)
      → SpellsPanel emits 'open-options'
      → CommandPopup.renderOptionsPanel(spell)

Tab → switchTab(next panel) → clears #searchQuery, selectedIndex=0, panel.reset(), full render()
```

## Key design decisions

- `close()` is overridden: when `phase === 'detail'`, it runs `#onDetailBack` (which is `exitDetail`) and returns early — Obsidian's own escape binding, the Cast Dispatcher's injected `close`, and any internal `close()` call all obey phase navigation.
- Selection memory: `selectedIndex` persists across detail entry/exit. `SearchInput` restores it via `restoreSelection` on re-render.
- `switchTab` does a full `render()` (not just `reattachTabBar`), resetting `#searchQuery` and `selectedIndex`.
- Sentinel `sentinelFocusIndex`: when no spells match and the query string matches a sentinel name, the returned index skips to that sentinel row.
- `ArrowRight` is gated: returns `false` outside search phase, on the Logs panel, or when the index falls on a sentinel — keystroke falls through to platform default.
- `SpellsPanel` is constructed with `hasOverride` set via `setHasOverride(path => overrides.has(path))`; `OptionsPanel` calls back through `onOverrideChanged` to trigger `spellsPanel.refreshOverrides()` after a checkbox toggle so the dot lights/extinguishes.

## Panels

| Panel | `id` | Content | `confirm(index)` | Notes |
|---|---|---|---|---|
| `SpellsPanel` | `spells` | Vault-scanned spells (via `getSpells(app, spellTag)`) + 2 sentinels (Forge, Refine) | spell → `cast` event; sentinel → `sentinel` event | Sentinels always appended after filtered spells. Rows render an override dot when `hasOverride(spell.path)` and a `↵ cast · → options` keyboard hint span. |
| `CastLogPanel` | `logs` | Live folded view of `cast-log-local.jsonl` + `cast-log-remote.jsonl` (see `cast-log-panel`) | `confirm`/`move` are no-ops — keyboard navigation is intentionally absent | Owns refresh + tick coordinators; popup calls `panel.unmount()` from `onClose` |
