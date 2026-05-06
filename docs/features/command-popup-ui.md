# Command Popup UI

An Obsidian modal (`CommandPopup`) that lets the user search, browse, and activate spells or logs via keyboard-first navigation. Two phases: **search** (list + filter) and **detail** (spell/sentinel form).

## User-facing behavior

| Interaction | Effect |
|---|---|
| Open modal | Spells tab active, cursor in search input, first spell selected |
| Type in search | List filters live; if query matches no spells but matches a sentinel name, that sentinel is auto-selected |
| `ArrowDown` / `ArrowUp` | Move selection, wrapping at both ends |
| `Tab` | Cycle Spells → Logs → Spells; clears query and resets index |
| Click tab | Same as Tab, but direct |
| `Enter` on spell row | Open spell detail (`<h2>` + Back button) |
| `Enter` on Forge sentinel | Open Forge form (name/desc/model fields, focused on name) |
| `Enter` on Refine sentinel | Open generic detail (`<h2>` + `<p>Type: refine`) |
| `Escape` or `close()` in detail | Return to search; modal stays open |
| Back button click | Same as Escape in detail |
| Submit Forge form | Exit detail, return to search |
| Close modal from search | `contentEl.empty()` |

## State machine

```
          onOpen()
             │
             ▼
┌────────────────────┐   Enter/click spell or sentinel
│   SEARCH phase     │─────────────────────────────────────────────┐
│  • kb active       │                                             │
│  • TabBar enabled  │◀────────────────────────────────────────────┤
└────────────────────┘   exitDetail()                              │
                         (Escape / Back / close() override)        │
                                                ┌──────────────────▼──────────────────┐
                                                │  DETAIL phase                        │
                                                │  • kb.suspend() [Forge only]         │
                                                │  • TabBar disabled                   │
                                                │  • close() override intercepts Escape│
                                                └─────────────────────────────────────┘
```

Detail variants:
- **Spell detail** — `renderDetail`: kb suspended, `<h2>` + Back button.
- **Forge sentinel** — `renderForgeSentinelDetail`: kb suspended, `ForgeSentinelDetail` mounted (owns its own `KeyboardController` for model-select ArrowUp/Down). `destroy()` must be called before `kb.resume()` so forge keys don't race popup keys.
- **Generic sentinel** (Refine) — `renderGenericSentinelDetail`: kb **not** suspended, `<h2>` + `<p>Type: …` + Back button.

## Data flow

```
SearchInput → oninput → SpellsPanel.filter(query)
                      → SpellList.render(filteredSpells, selectedIndex)
                      → CommandPopup.#searchQuery / selectedIndex updated

ArrowDown/Up → KeyboardController dispatch → CommandPopup.move(delta)
             → activePanel.move() [modular arithmetic] → updateSelection()
             → SpellList.updateSelection(prev, next) toggles .is-selected

Enter → CommandPopup.confirm() → activePanel.confirm(index)
      → SpellsPanel emits 'detail' or 'sentinel' event
      → CommandPopup.renderDetail / renderSentinelDetail

Tab → switchTab(next panel) → clears #searchQuery, selectedIndex=0, panel.reset(), full render()
```

## Key design decisions

- `close()` is overridden: when `phase === 'detail'`, it runs `#onDetailBack` and returns early — Obsidian's own escape binding and any internal `close()` call both obey phase navigation.
- Selection memory: `selectedIndex` persists across detail entry/exit. `SearchInput` restores it via `restoreSelection` on re-render.
- `switchTab` does a full `render()` (not just `reattachTabBar`), resetting `#searchQuery` and `selectedIndex`.
- Sentinel `sentinelFocusIndex`: when no spells match and the query string matches a sentinel name, the returned index skips to that sentinel row.

## Panels

| Panel | `id` | Content | `confirm(index)` | Notes |
|---|---|---|---|---|
| `SpellsPanel` | `spells` | 10 hardcoded spells + 2 sentinels (Forge, Refine) | spell → `detail` event; sentinel → `sentinel` event | Sentinels always appended after filtered spells |
| `LogsPanel` | `logs` | Hardcoded logs | `toggleExpand(index)` | No sentinel rows; selection always resets to 0 after filter |
