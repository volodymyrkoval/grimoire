# 005 — Options Panel: per-cast model/effort/context-notes/follow-up override

## Complexity

**Medium.** All domain plumbing already exists and is unit-tested: `OptionsFormState` (reactive, with effort-survival rule), `OptionsSessionMap`, `OptionsSnapshot` + `snapshotEqualsCurrent`, `EffortRow` (handles Haiku no-mount + remount cases), `ContextNotesInput` (pills + dropdown + vault basename search), `SpellOverrideStore` (validates + clamps + schedules save), `resolveSpellOptions` (3-tier with effort survival), `CastDispatcher.dispatch` (single cast path with contextNotes + followUp interpolation). The remaining work is one new UI component (`OptionsPanel`), one event addition (`open-options`), one row decoration (notification dot on `SpellRow`), and one popup wire-up in `CommandPopup` + `main.ts`. No new domain types, no concurrency, no security surface, no cross-module invariants beyond the existing override-store-+-saver contract that already passes unit tests.

The only judgement call this plan defers to the implementer is the exact event-name on `SpellsPanel` and the exact DOM scaffolding inside `OptionsPanel`; everything else (deps, props, signatures, when each side-effect fires) is decided here.

## Goal & scope

Wire the Spell Picker's "Right Arrow on a spell row" so that pressing it slides open an inline options panel containing model selector, effort segmented control, context-notes tag input, follow-up textarea, conditional Set-as-default checkbox, and Cast/Reset buttons. Pre-fill from session → override → defaults. Cast dispatches through the existing `CastDispatcher.dispatch()` with the live panel values. Reset restores the open-time snapshot (model+effort) and clears context notes + follow-up. Set-as-default toggles `SpellOverrideStore` (model+effort only). Add a notification dot to spell rows whose path has a stored override.

### In scope

- New event `open-options` on `SpellEvents` (payload: `Spell`). `SpellsPanel.confirm` is unchanged — `Enter` still emits `cast`. A new path `SpellsPanel.openOptions(index)` (or equivalent) emits `open-options` for the selected spell row.
- `CommandPopup` binds `ArrowRight` in search phase: when `activePanel === spellsPanel` and `selectedIndex` lands on a *spell* row (not a sentinel), forward to `spellsPanel.openOptions(selectedIndex)`. When index lands on a sentinel, the keypress is a no-op (return `false` so platform default runs — same as today). Same for empty filteredSpells.
- New `OptionsPanel` component at `src/ui/options/OptionsPanel.ts`. Mounts: model `<select>`, `EffortRow`, `ContextNotesInput`, follow-up `<textarea>`, Set-as-default `<label><input type="checkbox">`, Cast `<button type="submit">`, Reset `<button type="button">`. Owns its own `KeyboardController`. Consumes deps via constructor (see Interfaces).
- Pre-fill order driven by `resolveSpellOptions()` for tier 1/2/3 of model+effort; context-notes paths and follow-up come from `OptionsSessionMap.get(path)` if any (else empty).
- Open-time snapshot: `{ model, effort }` taken once on mount, used for (a) checkbox visibility test via `snapshotEqualsCurrent` and (b) Reset target.
- Set-as-default checkbox visibility: hidden iff `snapshotEqualsCurrent(snapshot, formState.snapshot())` — re-evaluated on every `formState.onChange()` event. Checking → `overrides.set(spellPath, { model, effort })` immediately + `redrawSpellList()` (so notification dot lights). Unchecking → `overrides.clear(spellPath)` immediately + `redrawSpellList()`.
- Reset button: `formState.setModel(snapshot.model, SUPPORTED_MODELS)` then `formState.setEffort(snapshot.effort)` if non-null, `contextNotesInput.clear()`, `followUpTextarea.value = ''`, `formState.setContextNotePaths([])`, `formState.setFollowUp('')`, `sessionMap.delete(spellPath)`.
- Cast button (and `Enter` from outside textarea/search-input + `Cmd/Ctrl+Enter` always): persist current panel state to `sessionMap.put(spellPath, ...)`, then call `onCast(formState.snapshot())`. The `OptionsPanel` does **not** know about `CastDispatcher`; the popup wires `onCast` to a callback that calls `castDispatcher.dispatch(...)` with the full `CastDispatchInput` (filling in `settings` and `activeFilePath` from `main.ts`). After cast, the dispatcher's injected `close` runs — same behaviour as today.
- Escape (panel open): no new binding. Existing `CommandPopup.close()` override cascade calls `exitDetail()` which destroys the panel (releasing its keys via `kb.unbindAll()`) and re-renders search.
- `SpellRow` constructor gains a third optional argument `hasOverride: boolean`. When true, the row renders a `<span class="grimoire-override-dot">` next to the name. `SpellList.render(spells, selectedIndex)` gains a fourth optional argument `hasOverride: (path: SpellPath) => boolean`. Default `() => false` for backward compatibility.
- `SpellsPanel.mount` accepts `hasOverride` predicate (forwarded from `CommandPopup` from `SpellOverrideStore.has`). On override mutation (set/clear), `CommandPopup` calls `spellsPanel.refreshOverrides()` which re-renders the list at the same selection index.
- `CommandPopup` constructor signature gains three new positional args (last): `overrides: SpellOverrideStore`, `sessionMap: OptionsSessionMap`, and `optionsCastAction: (spell: Spell, snap: OptionsFormSnapshot) => void`. The single-arg `castAction` (from 004) is preserved for the closed-panel `Enter`-from-list path, which already passes empty contextNotes/followUp via `main.ts`.
- `main.ts` constructs the new `OptionsSessionMap` per `onload` (so it survives popup close/re-open within an Obsidian session — see Key design decisions §3), passes the existing `this.overrides` into the popup, and supplies `optionsCastAction` as a closure that calls `dispatcher.dispatch({ spell, model: snap.model, effort: snap.effort, contextNotePaths: snap.contextNotePaths, followUp: snap.followUp, settings: this.data.settings, activeFilePath: this.app.workspace.getActiveFile()?.path ?? null })`.
- One UI integration test file (`tests/integration/options-panel.spec.ts`) at the popup → `OptionsPanel` → `optionsCastAction` seam, plus a focused-component spec at `OptionsPanel`-construct-with-stub-deps level for the per-control behaviour that does not require the popup keyboard.
- Notification-dot behaviour pinned by an integration test: open popup with one spell that has an override + one that does not; assert exactly one row has the dot.

### Out of scope

- **No context-note or follow-up persistence** in `SpellOverrideStore`. Stays model+effort only. (Pitch is explicit; matches `SpellOverride` shape.)
- **No keyboard shortcut for Cast beyond `Enter` outside textarea/search-input + `Cmd/Ctrl+Enter` always**. No other accelerators.
- **No reordering / pinning / preview of context-notes**.
- **No streaming / in-flight progress UI** in the panel — the existing dispatcher toasts (`Casting '<name>'…`, `Spell cast`, `Cast failed: <msg>`) are sufficient.
- **No Refine sentinel wiring**. Out per pitch.
- **No vault search across note bodies** — `ContextNotesInput` already does basename-only search; that's the contract.
- **No left-arrow to close panel**. Escape (via the existing `close()` override) is the only dismissal — matches the brain spec; matches today's sentinel-detail behaviour. Adds no new binding so we don't accidentally collide with future `<input>` cursor-movement.
- **No animation / slide-in transition**. Layout-only — visual polish is a separate iteration.
- **No per-cast saved follow-up history**. Pitch is explicit.
- **No `Tab` cycling beyond what browser default provides** for the panel's controls. The spec lists a desired Tab order but happy-dom default focus order is already ≈ DOM order, which is what we render. We do **not** add a focus-trap (no `bindTrap` for Tab/Shift+Tab) — the panel is inline within the existing modal, and the modal already focus-traps. Stricter custom Tab order is a follow-up if the default order proves wrong in real Obsidian.
- **No spell scanner refresh on override change** — overrides do not affect which spells the scanner returns; only the dot.
- **Refactoring the frozen domain modules.** `OptionsFormState`, `OptionsSessionMap`, `OptionsSnapshot`, `EffortRow`, `ContextNotesInput`, `SpellOverrideStore`, `resolveSpellOptions`, `CastDispatcher` are unchanged.
- **No ArrowLeft binding to exit the panel.** Avoids colliding with text-cursor movement inside textarea/search input. Brain spec is silent on it; Escape is sufficient.

## Proposed solution

Build outside-in over five sections:

1. **Section A — `SpellEvents` and `SpellsPanel.openOptions`** (scaffolding, no tests): add the event member and a thin `openOptions(index)` method that emits it. No popup wiring yet. This is junior-only so the next section's test compiles.
2. **Section B — `SpellRow` notification dot + `SpellList` predicate** (scaffolding + unit tests): extend the row + list APIs with the `hasOverride` predicate. Default false. Pinned by one focused unit test on `SpellRow` (renders dot on/off) and one on `SpellList` (calls predicate per row).
3. **Section C — `OptionsPanel` component** (the heart of the work; ui-integration-tester first, then senior-dev). This section opens with the integration spec at `OptionsPanel` ↔ `OptionsFormState` ↔ stub deps seam (no popup wiring yet — mount the panel in a fresh container with vi.fn stubs for `onCast`, `onReset`, and a mock `OptionsSessionMap`/`SpellOverrideStore`). Once the spec is RED, senior-dev implements the panel: mount controls, wire reactive update for checkbox visibility, wire Cast/Reset, wire keyboard.
4. **Section D — `CommandPopup` wiring** (senior-dev — Right-Arrow binding, panel mount/destroy, `optionsCastAction` plumbing, dot-refresh on override change). One UI integration test pins the full popup → row → ArrowRight → panel-open → Cast → action seam.
5. **Section E — `main.ts` wiring** (junior-dev — pass deps + closure; one `tests/main.test.ts` extension).

## Components

| Component | Location | Responsibility | Status |
|---|---|---|---|
| `SpellEvents` | `src/ui/SpellEvents.ts` | Add `open-options: Spell` member | MODIFIED |
| `SpellsPanel` | `src/ui/tabs/SpellsPanel.ts` | New `openOptions(index)` method that emits `open-options` for spell rows; no-op for sentinels / out-of-range. Existing `confirm` unchanged. New `refreshOverrides()` re-renders the list at current selection. Existing `mount` accepts an optional `hasOverride: (path: SpellPath) => boolean`. | MODIFIED |
| `SpellList` | `src/ui/components/SpellList.ts` | `render(spells, selectedIndex, hasOverride?)` forwards the predicate to each `SpellRow`. Backward-compatible default `() => false`. | MODIFIED |
| `SpellRow` | `src/ui/components/SpellRow.ts` | Constructor 3rd positional `hasOverride?: boolean = false`. When true, append `<span class="grimoire-override-dot">` after the name span. | MODIFIED |
| `OptionsPanel` (new) | `src/ui/options/OptionsPanel.ts` | Mount/destroy lifecycle; render the seven controls; bind keyboard; reactive checkbox visibility; emit Cast (via `onCast`); reset to snapshot; persist to session on cast; persist to override on checkbox toggle. | NEW |
| `CommandPopup` | `src/ui/CommandPopup.ts` | Bind `ArrowRight` in search phase; on `open-options` event from `SpellsPanel`, switch to detail phase, suspend `#kb`, mount `OptionsPanel`. On panel `onCast`, call `optionsCastAction(spell, snapshot)`. On override mutation, call `spellsPanel.refreshOverrides()`. Constructor gains three new args. | MODIFIED |
| `GrimoirePlugin` | `src/main.ts` | Construct `OptionsSessionMap` per `onload`; pass `this.overrides`, sessionMap, and `optionsCastAction` closure into `CommandPopup`. | MODIFIED |
| Obsidian mock | `tests/__mocks__/obsidian.ts` | No changes — `Workspace`, `App`, `Modal`, `Scope`, etc. are already in place. | UNCHANGED |
| Existing unit tests | `tests/SpellsPanel.test.ts`, `tests/CommandPopup.test.ts`, `tests/main.test.ts` | Updated to thread new args/events. | MODIFIED |
| Existing integration tests | `tests/integration/harness.ts` | Optional `overrides`, `sessionMap`, `optionsCastAction` overrides. Defaults: empty store, fresh map, `vi.fn()`. | MODIFIED |
| New unit tests | `tests/SpellRow.test.ts`, `tests/SpellList.test.ts`, `tests/OptionsPanel.test.ts` | Pin per-component behaviour at the focused-spec level. | NEW |
| New integration tests | `tests/integration/options-panel.spec.ts` | Pin popup → ArrowRight → panel → Cast/Reset/checkbox seam, and notification-dot rendering. | NEW |

## Interfaces

### `SpellEvents` (modified)

```ts
// src/ui/SpellEvents.ts
import type { Spell, Sentinel } from "../domain/spells/Spell";

export type SpellEvents = {
  cast: Spell;
  sentinel: Sentinel;
  "open-options": Spell;
};
```

### `SpellsPanel.openOptions` (new method)

```ts
// src/ui/tabs/SpellsPanel.ts
openOptions(index: number): void {
  if (index < 0 || index >= this.filteredSpells.length) return; // sentinel rows + empty list = no-op
  const spell = this.filteredSpells[index];
  this.events.emit("open-options", spell);
}

refreshOverrides(): void {
  // Re-render at the same selectedIndex with the same filteredSpells list.
  // Caller (CommandPopup) tracks selectedIndex; pass it in.
  this.spellList?.render(this.filteredSpells, this.#lastSelectedIndex, this.#hasOverride);
}
```

`mount(container, hasOverride?)` stores the predicate on a private field and forwards on every `render()`. `filter()` and `mount()` both go through a single `#renderList(initialIndex)` helper so the predicate is applied uniformly.

### `SpellList.render` (modified signature)

```ts
// src/ui/components/SpellList.ts
render(
  spells: Spell[],
  selectedIndex: number,
  hasOverride: (path: SpellPath) => boolean = () => false,
): void
```

Each `SpellRow` is constructed with `hasOverride(spell.path)` as the third arg.

### `SpellRow` (modified constructor)

```ts
// src/ui/components/SpellRow.ts
constructor(container: HTMLElement, spell: Spell, selected: boolean, hasOverride: boolean = false) {
  this.el = container.createDiv({ cls: "spells-row" });
  if (selected) this.el.addClass("is-selected");
  this.el.createSpan({ text: spell.name });
  if (hasOverride) this.el.createSpan({ cls: "grimoire-override-dot" });
}
```

### `OptionsPanel` (new)

```ts
// src/ui/options/OptionsPanel.ts
import type { App, Scope } from "obsidian";
import type { OptionsFormState, OptionsFormSnapshot } from "./OptionsFormState";
import type { OptionsSnapshot } from "./OptionsSnapshot";
import type { OptionsSessionMap } from "./OptionsSessionMap";
import type { SpellOverrideStore } from "../../domain/settings/SpellOverrideStore";
import type { SpellPath } from "../../domain/spells/SpellPath";

export interface OptionsPanelDeps {
  app: App;                              // for ContextNotesInput vault search
  overrides: SpellOverrideStore;         // for Set-as-default checkbox
  sessionMap: OptionsSessionMap;         // for cast persistence + reset deletion
  spellPath: SpellPath;                  // identifies the row this panel is for
  onCast: (snapshot: OptionsFormSnapshot) => void;
  onOverrideChanged: () => void;         // CommandPopup re-renders SpellList
  onBack: () => void;                    // for the back button (mirrors ForgeSentinelDetail)
}

export class OptionsPanel {
  constructor(
    contentEl: HTMLElement,
    scope: Scope,
    formState: OptionsFormState,
    snapshot: OptionsSnapshot,
    deps: OptionsPanelDeps,
  );

  destroy(): void; // unbind keys, detach ContextNotesInput, remove formState listener
}
```

The panel does **not** import `CastDispatcher`, settings, or `Notice`. Same separation as `ForgeSentinelDetail`. `onCast` is a plain callback the popup wires.

### `CommandPopup` (modified constructor signature)

```ts
// src/ui/CommandPopup.ts
export type OptionsCastAction = (spell: Spell, snapshot: OptionsFormSnapshot) => void;

constructor(
  app: App,
  spellTag: string,
  imprintAction: ImprintAction,
  castAction: CastAction,                          // existing — Enter from list, no panel
  defaults: FormDefaults,
  overrides: SpellOverrideStore,                   // NEW
  sessionMap: OptionsSessionMap,                   // NEW
  optionsCastAction: OptionsCastAction,            // NEW — Cast from open panel
);
```

Existing 5-arg call sites in tests are updated to pass the three new args (defaults: empty mock store, fresh session map, `vi.fn()`).

## Data flow

### Open panel (Right-Arrow)

```
ArrowRight (search phase, spells tab, selectedIndex on a spell row)
  → CommandPopup binding → spellsPanel.openOptions(selectedIndex)
  → SpellsPanel emits 'open-options' with the spell
  → CommandPopup handler:
      this.phase = 'detail';
      const resolved = resolveSpellOptions({ spellPath, session, overrides, settings, models });
      const sessionEntry = sessionMap.get(spellPath);
      const formState = new OptionsFormState({
        model: resolved.model,
        effort: resolved.effort,
        contextNotePaths: sessionEntry?.contextNotePaths ?? [],
        followUp: sessionEntry?.followUp ?? '',
      });
      const snapshot: OptionsSnapshot = { model: resolved.model, effort: resolved.effort };
      this.#kb.suspend();
      this.#activeDetail = new OptionsPanel(contentEl, scope, formState, snapshot, deps);
      this.#onDetailBack = exit;
```

### Cast from panel

```
Cast click / Enter / Cmd-Enter
  → OptionsPanel: sessionMap.put(spellPath, { model, effort, contextNotePaths, followUp })
  → onCast(formState.snapshot())
  → CommandPopup: optionsCastAction(spell, snapshot)
  → main.ts closure: dispatcher.dispatch({ spell, ...snapshot, settings, activeFilePath })
  → CastDispatcher: notify('Casting <name>…') + close() + spawn cast
  → close() routes to popup.close() — phase is 'detail' so it runs exitDetail(), then super.close() never fires
                                       (BUT the dispatcher already toasted; the next time
                                        the user reopens, popup is fresh)
```

**Note on close path:** when Cast is invoked from the panel, the dispatcher's injected `close` runs `popup.close()`. The popup is in detail phase, so the override calls `exitDetail()` and returns — the modal stays open, transitioning back to the search phase. This is consistent with the existing forge-cast flow (which also returns to search after submit). The user sees the "Casting …" toast and can immediately cast another spell. If the desired UX is to fully close the modal after panel-cast, the closure in `main.ts` can call `popup.close()` twice (first call exits detail, second fully closes) — but matching forge-cast precedent we do **not** do this; panel-cast leaves the modal open at search.

### Reset

```
Reset click
  → formState.setModel(snapshot.model, SUPPORTED_MODELS) // re-applies effort survival
  → if snapshot.effort != null: formState.setEffort(snapshot.effort)
  → contextNotesInput.clear() (which fires its own onChange to clear formState's paths)
  → followUpTextarea.value = ''; formState.setFollowUp('')
  → sessionMap.delete(spellPath)
  → (formState.onChange listeners fire, checkbox re-evaluates; should now be hidden because matches snapshot)
```

### Set-as-default checkbox

```
checkbox toggle
  → if checked:
       overrides.set(spellPath, { model: formState.snapshot().model, effort: formState.snapshot().effort! })
       deps.onOverrideChanged()  // popup re-renders SpellList; dot lights
    else:
       overrides.clear(spellPath)
       deps.onOverrideChanged()  // dot extinguishes
```

The checkbox is only displayed when the form's effort is non-null (Haiku has no effort to persist; `SpellOverrideStore.set` rejects null-effort models with a console.error). Effort-null is a **second** reason the checkbox stays hidden, in addition to "matches snapshot". Both conditions OR'd.

### Reactive checkbox visibility

```
formState.onChange(() => {
  const current = formState.snapshot();
  const matches = snapshotEqualsCurrent(snapshot, current);
  const effortPersistable = current.effort !== null;
  checkboxLabel.style.display = (!matches && effortPersistable) ? '' : 'none';
  // Also reflect current override state (so the box itself shows checked when stored):
  checkbox.checked = overrides.has(spellPath);
});
```

## Key design decisions

### 1. `OptionsPanel` does not own the cast pipeline — same separation as `ForgeSentinelDetail`

`OptionsPanel` is callback-only. It does not import `CastDispatcher`, `Notice`, or `GrimoireSettings`. The popup wires `onCast` to a closure in `main.ts` that captures the dispatcher and live settings. This is the same pattern 003 (`ImprintAction`) and 004 (`CastAction`) established. **Why:** keeps the panel testable in isolation (no dispatcher mock needed in the focused spec), and keeps `main.ts` as the single composition root.

### 2. Two cast paths through one dispatcher — `castAction` and `optionsCastAction`

`Enter` from the spell list (no panel) keeps the existing 004 `castAction` path: `main.ts` builds `CastDispatchInput` with empty `contextNotePaths` and empty `followUp`, using `resolveSpellOptions()` for model+effort (so persisted overrides still take effect on Enter-from-list). Cast from the open panel uses `optionsCastAction` with the form snapshot. **Why a second action instead of unifying through a single shape:** the popup callbacks are trivial; bundling the model/effort/contextNotes/followUp resolution into a single action would push that logic into `CommandPopup`, which currently knows nothing about settings or overrides. Two narrow actions keep the popup unaware of resolution policy.

### 3. `OptionsSessionMap` lives per-`onload`, not per-popup-instance

The brain spec says session entries "survive panel close/re-open within same popup session". The popup is a `Modal` — it's destroyed when closed. To survive across popup re-opens within the same Obsidian process, the map is constructed in `main.ts.onload()` and passed in. **Trade-off:** session entries also survive across multiple invocations of the "Open Grimoire" command — closing and re-opening the picker still pre-fills from the last cast. This is the documented intent of "session" (an Obsidian process); if the user wants a clean slate they restart Obsidian. Documented in this plan only.

### 4. Right-Arrow does not collide with `SegmentedControl`'s ArrowLeft/ArrowRight

The `SegmentedControl` registers `ArrowRight` / `ArrowLeft` *as DOM listeners on its own buttons*, not on the popup `Scope`. `CommandPopup`'s ArrowRight binding is on `this.scope`. They cannot collide because the popup's `Scope` registration only fires when an Obsidian-managed key dispatch routes through it; once focus is inside the panel's segmented buttons, those buttons handle ArrowLeft/ArrowRight via their own listeners and `e.preventDefault()` stops propagation. **Verification:** the integration test exercises ArrowRight from the spell list (panel closed, popup scope active) and segmented-control left/right (panel open, focus on a button) separately and asserts neither triggers the other.

The popup's ArrowRight binding is also gated: when `phase !== 'search'`, return `false` so the binding is inert during detail phase.

### 5. ArrowLeft is **not** wired to dismiss the panel

Brain spec is silent. The fields inside the panel (textarea, search input) use ArrowLeft for cursor movement; binding it on the popup `Scope` would trigger only when focus is *outside* the textarea/search input — but there is no obvious "outside" focus state in this layout (everything is focusable). Escape handles dismissal cleanly via the existing `close()` override. Adding ArrowLeft is a follow-up if user-test reveals a need.

### 6. The notification dot is rendered by `SpellRow`, not painted on later by `SpellList`

Single-render path keeps DOM ownership clean: `SpellRow` is the only thing that mutates its own children; `SpellList.render` rebuilds rows from scratch on override change. Avoids the bug class where a half-updated DOM keeps a stale dot. The Chromium hover-reflow workaround in `SpellList.render` already runs after every re-render.

### 7. `refreshOverrides()` re-renders the entire list, not just the affected row

There is no per-row mutation API on `SpellList` today. Adding one would be premature — the list has at most ≈ 50 rows in practice and re-render is cheap. **Why call out:** the integration test asserts the dot appears/disappears after checkbox toggle; the implementation is "re-render the list at the same selectedIndex". The existing `SpellList.render` already preserves selection via the `selectedIndex` arg.

### 8. Reset clears `sessionMap.delete(spellPath)` but does not collapse the panel

After Reset, the next Cast will write a **fresh** session entry from the snapshot (same model+effort as before) plus empty contextNotes/followUp — so behaviourally Reset followed by Cast is the same as opening a fresh panel and casting. Documented because users may expect Reset to also close the panel; it does not (matches the spec wording).

### 9. The panel's Back button (or Escape) does **not** persist anything

Closing without casting discards live edits. The session map is only written on Cast. **Why:** the brain spec describes session entries as "survives panel close/re-open within same popup session" — but the spec also says Reset *clears* the session entry, implying the canonical way to discard work is to Reset before closing. Persisting on close would leak un-committed edits into the next open. The spec is ambiguous here; we choose "Cast persists, Close discards" because it matches user mental model of "commit on action, abandon on dismiss".

### 10. The Set-as-default checkbox starts checked iff `overrides.has(spellPath)`

When the panel opens, the visible state of the checkbox itself reflects whether a stored override exists for this path. Combined with the visibility rule (hidden iff snapshot matches current), this means: on first open of a spell with no override, checkbox is hidden. On first open of a spell *with* an override (stored model/effort), the snapshot will already match the stored values → checkbox is hidden. The checkbox only appears when the user has *changed* the live values away from the snapshot — which is the spec's intent. The `checked` state then reflects the current store state, which on first appearance is `false` (the user is about to opt-in by checking). After checking, store is updated; if user then drifts the live values back to match the *new* override, the checkbox disappears again (now correctly representing "live matches stored").

## Error handling

- **Right-Arrow on a sentinel row or empty list:** `openOptions(index)` no-ops via the bounds check. Test pinned in Section A.
- **Right-Arrow when phase is `detail`:** binding gated; returns `false`. Test pinned in Section D.
- **`SpellOverrideStore.set` for Haiku (null-effort model):** the store already logs a console.error and does not write. The panel's checkbox visibility rule hides the checkbox when `effort === null`, so the user cannot reach this code path through the UI. Defence in depth: the panel never calls `overrides.set` when `formState.snapshot().effort === null`. Section C todo pins this.
- **`activeFilePath === null` at cast time:** the `CastDispatcher` already toasts `'Open a note to cast against'` and calls `close()`. Same path for both `castAction` and `optionsCastAction`. No new handling needed.
- **Model in resolved snapshot is unknown:** `resolveSpellOptions` already falls back to `models[0]` with effort survival. `OptionsFormState.setModel` does the same. The form state initializer trusts the resolver's output.
- **`ContextNotesInput` cleared while dropdown was open:** `clear()` already clears `pillPaths`, dropdown HTML, and search-input value. Reset path uses `clear()`. Pinned by ContextNotesInput's existing tests.
- **DebouncedSaver failure:** out of scope — existing contract. The store schedules; if save fails, that's a separate concern surfaced through the saver's own error path.
- **Multiple rapid checkbox toggles:** each toggle calls `overrides.set` or `overrides.clear` synchronously and `saver.schedule()` debounces. No race. Last write wins inside the 500 ms window.
- **User opens panel for spell A, then via some path opens panel for spell B without closing A:** this cannot happen — opening a panel transitions to detail phase, ArrowRight is gated to search phase only. To open panel for B, user must Escape A first.

## Technical notes

### Skill: `design-rubric` — Section 7 self-critique

- **Is the responsibility line for `OptionsPanel` one sentence?** Yes: "Render the options form, react to formState, persist on Cast, persist override on checkbox, restore snapshot on Reset." That's five clauses but one cohesive *form lifecycle* responsibility. Splitting further (e.g. a `CheckboxController` class) would be premature — the checkbox logic is 5 lines.
- **Component count vs feature size.** Six modified + one new. The new component is the only non-trivial structural addition; everything else is delta.
- **Could a unit test fully exercise `OptionsPanel` without the popup?** Yes — the `OptionsPanel.test.ts` focused spec mounts with stub deps, no `CommandPopup`. Confirmed by spec design in Section C.
- **Dependency direction.** `OptionsPanel` depends on `OptionsFormState`, `ContextNotesInput`, `EffortRow`, `SpellOverrideStore`, `OptionsSessionMap`, and the `App`/`Scope` types from `obsidian`. None of those depend on `OptionsPanel`. `CommandPopup` depends on `OptionsPanel` (one-way). Clean.
- **Hidden coupling.** The reactive checkbox listener reads `overrides.has(spellPath)` on every formState change, so it observes external mutation through the store. This is intentional — checkbox state must reflect stored truth, not local cache. If the store later supports a change-listener API, this can switch from "poll on form change" to "subscribe to store change". Not worth introducing now (single observer, predictable timing).
- **Test seam location.** Two seams pinned: (a) `OptionsPanel` ↔ `OptionsFormState`/`stub deps` (focused spec); (b) `CommandPopup` ↔ `OptionsPanel` ↔ `optionsCastAction` (integration spec). The second seam is the user-visible contract. The first is the component-internal contract.
- **Open-closed.** Adding a new control later (e.g. "context-notes max" slider) means modifying `OptionsPanel`. Acceptable — the panel is the form, and the form's content is the feature. Extracting a `Field` strategy interface would be speculative generality (see design-patterns notes).

### Skill: `design-patterns` — patterns considered

- **Strategy** for the seven controls — *rejected*: each control has a different shape and lifecycle (model is a `<select>`; effort is a remountable widget; context-notes is a stateful component; checkbox is a simple input). Forcing a `Field { mount, getValue, setValue }` interface obscures more than it reveals. YAGNI.
- **Observer / event emitter** for formState — *already used*: `OptionsFormState.onChange` is a simple observer. Re-used here for checkbox visibility + (optional) future field re-renders. No new pattern needed.
- **Command** for Cast/Reset — *rejected*: two concrete actions, no need for queuing/undo/composition. Direct method calls are clearest.
- **Builder** for `OptionsFormState` initial snapshot — *rejected*: the snapshot is a four-field object literal; a builder would be ceremony.
- **Mediator** between formState and the checkbox / Reset / Cast paths — *not needed*: each path is short and reads formState directly. Introducing a mediator would centralize logic that's already trivially distributed.
- **Template Method** for ForgeSentinelDetail vs OptionsPanel (both have onBack, KeyboardController, mount form) — *rejected*: extracting a `DetailComponent` base is premature with two instances. If a third lands, revisit.

### Other notes

- The existing `KeyboardController.suspend()` / `resume()` pattern from `ForgeSentinelDetail` applies to `OptionsPanel` identically. The popup must call `optionsPanel.destroy()` before `kb.resume()` so panel-owned bindings are released before popup keys re-register.
- The integration spec for ArrowRight needs to assert that ArrowRight on the *first sentinel row* (Forge) is a no-op. Fuzzy filter and sentinel arrangement from the existing harness already provide this scenario.
- `ContextNotesInput.detach()` must be called from `OptionsPanel.destroy()` — the existing `clear()` does not detach DOM listeners.
- The Cast button should be a `<button type="submit">` inside a `<form>` so the browser's native Enter-submits-form behaviour fires when focus is on a non-textarea input. Cmd/Ctrl+Enter is wired explicitly via `KeyboardController.bind(['Mod'], 'Enter', ...)`. Plain Enter is *not* bound on the scope — we let the form's submit handler fire (which is suppressed inside textarea by default; what we want).
- Selector for the existing harness: `.options-panel` (CSS class on the root `<form>` element). Tests use this to detect detail phase for the options panel specifically.
- The `harness.ts` updates: add `optionsCastAction?: OptionsCastAction`, `overrides?: SpellOverrideStore`, `sessionMap?: OptionsSessionMap` options (defaults: `vi.fn()`, fresh empty `SpellOverrideStore`-equivalent stub, fresh `OptionsSessionMap`). Add `pressArrowRight()`, `clickCast()`, `clickReset()`, `toggleSetAsDefault()`, `getOverrideDots()` helpers.

### Deferred edge cases (user-explicit; not implemented this iteration)

None deferred — every applicable edge case is decided above. The scope of this feature is well-defined and the brain spec already enumerated the non-obvious dimensions; no clarifying questions remained open.

## Todos

### A. SpellEvents and SpellsPanel.openOptions

#### Section briefing

**What this section produces:** modifies `src/ui/SpellEvents.ts` to add `"open-options": Spell`. Modifies `src/ui/tabs/SpellsPanel.ts` to add an `openOptions(index: number): void` method that emits the event for spell-row indices and no-ops for sentinel-row indices and out-of-range. No test coverage at integration level yet — pinned by one focused unit-test addition.

**Design context the executor needs upfront:** see Interfaces → `SpellsPanel.openOptions`. The bounds check is `index < 0 || index >= this.filteredSpells.length`. Sentinel rows live at `this.filteredSpells.length + i`, so they fall outside this bound and are correctly no-op'd. Confirm class shape against `src/ui/tabs/SpellsPanel.ts` lines 40–48 — the existing `confirm` method shows the analogous spell-vs-sentinel discrimination pattern.

**Cross-section couplings:**
- A1 produces the type member `"open-options": Spell` consumed by C and D (panel mount + popup wiring).
- A2 produces `openOptions(index)` consumed by D2 (popup ArrowRight binding).

**Section-level Red criterion:** the unit test in `tests/SpellsPanel.test.ts` for `openOptions` passes: emits `open-options` once per spell-row index, does not emit for any sentinel-row index, does not emit for out-of-range index. TypeScript compiles with the new event member referenced in a hand-written `panel.events.on("open-options", …)` line.

**junior-dev**

- [x] A1: add `"open-options": Spell` to `SpellEvents` in `src/ui/SpellEvents.ts` — S, junior-dev (29ee6d0)
- [x] A2: add `openOptions(index: number): void` to `SpellsPanel`. Bounds-check `index < 0 || index >= this.filteredSpells.length`; if in range emit `open-options` with `this.filteredSpells[index]`; else no-op. Add a unit test in `tests/SpellsPanel.test.ts` covering: in-range emits once with the correct spell; out-of-range no-op; sentinel-row index no-op. — S, junior-dev (29ee6d0)

### B. SpellRow notification dot + SpellList predicate

#### Section briefing

**What this section produces:** modifies `src/ui/components/SpellRow.ts` to accept a fourth constructor arg `hasOverride: boolean = false` and render a `<span class="grimoire-override-dot">` when true. Modifies `src/ui/components/SpellList.ts` so `render(spells, selectedIndex, hasOverride?)` accepts an optional predicate and forwards `hasOverride(spell.path)` to each `SpellRow`. Modifies `SpellsPanel.mount(container, hasOverride?)` to thread the predicate through to `SpellList.render`. Adds focused unit tests for both components.

**Design context the executor needs upfront:** see Interfaces → `SpellList.render` and `SpellRow`. The default predicate is `() => false` to keep all existing call sites passing. From Key design decisions §6: "The notification dot is rendered by `SpellRow`, not painted on later by `SpellList`" — do not add a paint-on method to `SpellList`; the dot is rendered at row construction time only.

**Cross-section couplings:**
- B2 (SpellList signature) is consumed by D5 (popup constructs the predicate from `overrides.has`).
- B3 (SpellsPanel.mount signature) is consumed by D5.
- B4 (`refreshOverrides`) is consumed by D6 (popup calls it after checkbox toggle).

**Section-level Red criterion:** the SpellRow unit test verifies that constructing with `hasOverride: true` yields a child `<span class="grimoire-override-dot">` and `hasOverride: false` (or omitted) does not. The SpellList unit test verifies that calling `render(spells, 0, path => path === firstPath)` yields exactly one `.grimoire-override-dot` in the rendered DOM. The SpellsPanel test verifies the predicate forwards through to the rendered list.

**junior-dev**

- [x] B1: extend `SpellRow` constructor with `hasOverride: boolean = false` (4th positional arg). When true, append `<span class="grimoire-override-dot">` to `this.el` after the name span. Add unit test in `tests/SpellRow.test.ts`: constructing with true renders the dot; with false does not. — S, junior-dev
- [x] B2: extend `SpellList.render(spells, selectedIndex, hasOverride?)` with the optional predicate (default `() => false`). Pass `hasOverride(spell.path)` as the 4th arg of each `SpellRow` constructor call in the existing `spellRows = spells.map(...)` block. Add unit test in `tests/SpellList.test.ts`: render with a predicate that returns true for one path → exactly one `.grimoire-override-dot` in the rendered list. — S, junior-dev
- [x] B3: extend `SpellsPanel.mount(container, hasOverride?)` with optional predicate; store on a private field `#hasOverride` (default `() => false`). Forward to `spellList.render` from both `mount` and `filter`. Update the existing `tests/SpellsPanel.test.ts` setup to optionally pass the predicate. — S, junior-dev
- [x] B4: add `SpellsPanel.refreshOverrides(): void` that re-renders the list at the current selectedIndex (track the latest `selectedIndex` passed into `render`/`filter` on a private field). Unit test: call refreshOverrides after changing a stored predicate value → list re-renders with the new dot state. — S, junior-dev

### C. OptionsPanel component (focused integration test owns Red)

#### Section briefing

**What this section produces:** new file `src/ui/options/OptionsPanel.ts` exporting `OptionsPanel` class with the constructor signature in Interfaces → `OptionsPanel`. New file `tests/integration/options-panel.spec.ts` with the focused-component spec at the panel ↔ formState ↔ stub-deps seam (it does **not** mount a `CommandPopup` — that is Section D). New file `tests/OptionsPanel.test.ts` for unit-level focused tests of internal control wiring (mirrors `tests/integration/forge-sentinel-detail.spec.ts` plus a focused unit spec).

**Design context the executor needs upfront:** see Interfaces → `OptionsPanel`, Data flow → all four flows (Open / Cast / Reset / Set-as-default), and Key design decisions §1, §8, §9, §10. From §1: panel is callback-only, does not import `CastDispatcher` or settings. From §8: Reset clears `sessionMap.delete(spellPath)`. From §9: closing without casting discards edits. From §10: checkbox's `checked` reflects `overrides.has(spellPath)`; visibility hides when (a) snapshot matches current OR (b) `formState.snapshot().effort === null`. From Key design decisions §4: ArrowLeft is **not** wired; ArrowRight collision is avoided because SegmentedControl's listeners are on its own buttons. From Error handling: the panel never calls `overrides.set` when `effort === null` (defence in depth on top of the visibility rule).

**Cross-section couplings:**
- C0 depends on B1/B2/B3 only indirectly (the spec doesn't mount SpellList; it mounts the panel directly).
- C2 depends on A1: the `open-options` event must compile so the integration test can later be re-used in Section D against a real popup, but C0 itself stubs deps.
- C0 owns the Red criterion that C1–C7 must satisfy.

**Section-level Red criterion:** `tests/integration/options-panel.spec.ts` covers, with vi.fn stubs and a happy-dom container:
1. Mount panel with `formState` initialised to model/effort/empty contextNotes/empty followUp; assert all seven controls render (`<select>`, segmented buttons, pill container + search input, textarea, Cast button, Reset button; checkbox label exists but is `display: none`).
2. Change the model select → checkbox label becomes visible (formState now diverges from snapshot).
3. Click Reset → formState model+effort match snapshot; checkbox label hidden again; sessionMap.delete called with the spellPath.
4. Type in followUp + add a context-note pill → click Cast → onCast invoked with snapshot containing model, effort, the pill path, and the typed text; sessionMap.put invoked with the same snapshot.
5. Toggle checkbox checked → overrides.set called once with `{ model, effort }` from formState; onOverrideChanged called once.
6. Toggle checkbox unchecked → overrides.clear called once; onOverrideChanged called once.
7. Mount with a Haiku model (effortOptions=null) → effort row not rendered; checkbox label hidden even when model differs from snapshot (because effort is null → not persistable).
8. Cmd+Enter from outside textarea → Cast fires (uses scope dispatch).
9. Calling `panel.destroy()` → `formState.onChange` listener is removed (verify by mutating formState and asserting no DOM updates), `KeyboardController.unbindAll()` runs (no Mod+Enter dispatch leaks), `ContextNotesInput.detach()` was called.

These are the only acceptance gates for senior-dev to call this section done.

**ui-integration-tester**

- [x] C0: integration test: write `tests/integration/options-panel.spec.ts` covering the nine assertions above. Use vi.fn for `onCast`, `onOverrideChanged`, `onBack`. Construct a real `OptionsFormState`, real `OptionsSessionMap`, real `SpellOverrideStore` (with stub `DebouncedSaver` whose `schedule` is a vi.fn). Mount panel against a `document.createElement('div')` and a `new Scope()`. — M, ui-integration-tester

**senior-dev**

- [x] C1: create `src/ui/options/OptionsPanel.ts` skeleton: class with constructor signature from Interfaces; private fields for `#kb: KeyboardController`, `#formState`, `#snapshot`, `#deps`, `#contextNotesInput`, `#effortRow`, `#unsubscribe: () => void`, `#root: HTMLElement`. Build a `<form class="options-panel">` and append all seven controls in DOM order (model select, effort row container, context-notes container, follow-up textarea, checkbox label, Cast button, Reset button). Implement `destroy()` that calls `#kb.unbindAll()`, `#unsubscribe()`, and `#contextNotesInput.detach()`. — M, senior-dev
- [x] C2: wire model `<select>`: populate from `SUPPORTED_MODELS` (mirror `ForgeSentinelDetail.buildModelSelect`); set initial value to `formState.snapshot().model`; on change call `formState.setModel(newId, SUPPORTED_MODELS)`. ArrowDown/ArrowUp on model select bound via `#kb.bind` (mirror `ForgeSentinelDetail.bindModelKeys` lines 47–59). — S, senior-dev
- [x] C3: wire `EffortRow`: instantiate with `models: SUPPORTED_MODELS, modelId: snap.model, effort: snap.effort, onChange: e => formState.setEffort(e)` and mount into the container. Subscribe to `formState.onChange` to call `effortRow.update(snapshot.model, snapshot.effort)` when model changes. — S, senior-dev
- [x] C4: wire `ContextNotesInput`: instantiate with `app: deps.app, onChange: paths => formState.setContextNotePaths(paths)`; mount into container. If formState's initial `contextNotePaths` is non-empty, call `addPaths(initialPaths)` after mount. — S, senior-dev
- [x] C5: wire follow-up `<textarea>`: bind `input` event to `formState.setFollowUp(textarea.value)`; set initial `textarea.value = snap.followUp`. — S, senior-dev
- [x] C6: wire Set-as-default checkbox visibility + state: subscribe via `formState.onChange` to recompute `(matches = snapshotEqualsCurrent(snapshot, current))` and `(effortPersistable = current.effort !== null)`; set `checkboxLabel.style.display = (!matches && effortPersistable) ? '' : 'none'`. Set `checkbox.checked = overrides.has(spellPath)` on every change. On checkbox toggle: if checked, call `overrides.set(spellPath, { model: current.model, effort: current.effort! })`; if unchecked, `overrides.clear(spellPath)`. After either, call `deps.onOverrideChanged()`. Trigger initial visibility computation by calling the listener once after subscription. — M, senior-dev
- [x] C7: wire Cast (button click + `Cmd+Enter` via `#kb.bind(['Mod'], 'Enter', ...)` + form submit on plain Enter outside textarea). On cast: `sessionMap.put(spellPath, current); deps.onCast(current)`. Wire Reset (button click): `formState.setModel(snapshot.model, SUPPORTED_MODELS); if (snapshot.effort !== null) formState.setEffort(snapshot.effort); contextNotesInput.clear(); textarea.value = ''; formState.setFollowUp(''); sessionMap.delete(spellPath)`. (Note: ContextNotesInput.clear already calls onChange which calls formState.setContextNotePaths([]), so do not duplicate.) Add a Back button at the top of the form like ForgeSentinelDetail; `onClick → deps.onBack()`. — M, senior-dev

### D. CommandPopup wiring

#### Section briefing

**What this section produces:** modifies `src/ui/CommandPopup.ts` to (a) accept three new constructor args (`overrides: SpellOverrideStore, sessionMap: OptionsSessionMap, optionsCastAction: OptionsCastAction`), (b) bind ArrowRight in search phase, (c) handle the `open-options` event by mounting `OptionsPanel` in detail phase, (d) thread the `hasOverride` predicate from `overrides.has` into `SpellsPanel.mount`, (e) re-render the spell list on override change. Also modifies `tests/integration/harness.ts` to expose the new options. Adds one integration spec at `tests/integration/options-panel-popup.spec.ts` covering the popup-level seam (distinct from C0 which covers the panel in isolation).

**Design context the executor needs upfront:** see Interfaces → `CommandPopup` constructor, Data flow → Open panel and Cast from panel, and Key design decisions §2 (two cast paths), §4 (ArrowRight gating to search phase only), §7 (`refreshOverrides` re-renders entire list). From Error handling: ArrowRight binding must `return false` when phase !== 'search' so the binding is inert during detail phase. From Data flow → Cast from panel: when the dispatcher's injected `close` runs `popup.close()`, the override calls `exitDetail()` and returns; modal stays open at search.

**Cross-section couplings:**
- D2 depends on A2: ArrowRight binding calls `spellsPanel.openOptions(this.selectedIndex)`.
- D3 depends on A1: the `open-options` event handler is registered via `panel.events.on("open-options", ...)`.
- D4 depends on C: instantiates `OptionsFormState` + `OptionsSnapshot` + `OptionsPanel`, calls `resolveSpellOptions` (existing function, no new deps).
- D5 depends on B2/B3: forwards `path => overrides.has(path)` predicate into `SpellsPanel.mount`.
- D6 depends on B4: calls `spellsPanel.refreshOverrides()` from the `onOverrideChanged` callback handed to `OptionsPanel`.
- D7 depends on C0 (defines the Red contract for the popup-level integration).

**Section-level Red criterion:** `tests/integration/options-panel-popup.spec.ts` covers:
1. Open popup; press ArrowRight on first spell row → `.options-panel` form is in the DOM; phase is detail.
2. Press ArrowRight on a sentinel row (navigate via ArrowDown past spells) → no `.options-panel`; still in search phase.
3. Open panel, click Cast → `optionsCastAction` invoked once with the spell and a snapshot containing the live model/effort/contextNotes/followUp.
4. Open panel for spell A, change model, check Set-as-default → `overrides.set` called; then close panel (Escape) → re-open panel for spell A → checkbox shown checked (because store now has override) but visibility re-computes once the user changes anything; opening alone should match snapshot from the *new* override → checkbox initially hidden, dot now lights on the spell row in the search view (assert by closing panel and counting `.grimoire-override-dot`).
5. Pre-loaded `SpellOverrideStore` with one override → on popup open, that spell row has exactly one `.grimoire-override-dot`.
6. Press ArrowRight while phase === detail → no-op (no second panel mount, no panel destroyed).

**senior-dev**

- [x] D1: extend `CommandPopup` constructor to accept three new positional args after `defaults`: `overrides: SpellOverrideStore`, `sessionMap: OptionsSessionMap`, `optionsCastAction: OptionsCastAction`. Export `OptionsCastAction` type. Store as private fields. Update `tests/integration/harness.ts` to accept and forward `overrides?`, `sessionMap?`, `optionsCastAction?` options (defaults: a stub `SpellOverrideStore` constructed with `{ data: { spellOverrides: {} } as any, saver: { schedule: vi.fn() } as any }`, fresh `new OptionsSessionMap()`, `vi.fn()`). Update existing `tests/CommandPopup.test.ts` and any other 5-arg call sites. — S, senior-dev (a59a82b)
- [x] D2: in `CommandPopup.bindKeys`, register `ArrowRight` with handler: if `this.phase !== 'search'` or `this.activePanel !== this.panels[0]` (the spells panel) → return `false`. Else call `(this.panels[0] as SpellsPanel).openOptions(this.selectedIndex)` and return `true`. — S, senior-dev (a59a82b)
- [x] D3: in the `SpellsPanel` constructor inside `CommandPopup`, register a handler for `open-options`: call a new private method `renderOptionsPanel(spell)`. — S, senior-dev (a59a82b)
- [x] D4: implement `renderOptionsPanel(spell: Spell)`. Set `this.phase = 'detail'`, `reattachTabBar()`, `this.#kb.suspend()`. Compute `resolved = resolveSpellOptions({ spellPath: spell.path, session: this.#sessionMap, overrides: this.#overrides, settings: { defaultModel: this.#formDefaults.defaultModel, defaultEffort: this.#formDefaults.defaultEffort, ...rest } as GrimoireSettings, models: SUPPORTED_MODELS })`. **Note:** `CommandPopup` does not currently hold full `GrimoireSettings`. Pass only the two fields the resolver actually reads: extend `FormDefaults` is one option, but cleaner: pass the full `GrimoireSettings` as part of `FormDefaults` rename. Concrete call: extend `FormDefaults` to be `{ defaultModel, defaultEffort }` (unchanged) and call resolver with `settings: { ...defaults, spellTag: '', cliCommand: '', binaryPath: '', forgeOutputFolder: '', vaultMountPath: '' } as GrimoireSettings` since the resolver only reads `defaultModel` + `defaultEffort` and is unchanged this iteration. Construct `OptionsFormState` with `{ model: resolved.model, effort: resolved.effort, contextNotePaths: this.#sessionMap.get(spell.path)?.contextNotePaths ?? [], followUp: this.#sessionMap.get(spell.path)?.followUp ?? '' }`. Construct `OptionsSnapshot { model: resolved.model, effort: resolved.effort }`. Mount `new OptionsPanel(this.contentEl, this.scope, formState, snapshot, deps)` where `deps.app = this.app, deps.overrides = this.#overrides, deps.sessionMap = this.#sessionMap, deps.spellPath = spell.path, deps.onCast = snap => { this.#optionsCastAction(spell, snap); }, deps.onOverrideChanged = () => (this.panels[0] as SpellsPanel).refreshOverrides(), deps.onBack = () => this.exitDetail()`. Set `this.#activeDetail = panel; this.#onDetailBack = () => this.exitDetail()`. — M, senior-dev (a59a82b)
- [x] D5: in `CommandPopup.render` (or wherever `SpellsPanel.mount(container)` is called — currently inside `SearchInput`'s renderer; the panel's mount is invoked through `TabPanel.mount`), thread `hasOverride: path => this.#overrides.has(path)` through to `SpellsPanel.mount`. This requires extending `TabPanel.mount`'s signature or having `SpellsPanel` capture the predicate at construction time. Simpler path: set the predicate via a setter `spellsPanel.setHasOverride(predicate)` immediately after construction, and `SpellsPanel.mount` reads from the field. Implement the setter in B3 (extend B3 to add a setter if not already present). — S, senior-dev (a59a82b)
- [x] D6: in the `onOverrideChanged` deps callback (D4), call `(this.panels[0] as SpellsPanel).refreshOverrides()` so the dot updates immediately after checkbox toggle. — S, senior-dev (a59a82b)

**ui-integration-tester**

- [ ] D7: integration test: write `tests/integration/options-panel-popup.spec.ts` covering the six assertions above (popup-level seam). Use the updated harness with `optionsCastAction: vi.fn()` and a pre-loaded `SpellOverrideStore` for the dot test. — M, ui-integration-tester

### E. main.ts wiring

#### Section briefing

**What this section produces:** modifies `src/main.ts` to (a) construct `OptionsSessionMap` once per `onload`, (b) build an `optionsCastAction` closure that calls `dispatcher.dispatch(...)` with the snapshot's contextNotePaths and followUp, (c) pass `this.overrides`, the sessionMap, and the closure into `CommandPopup`. Updates `tests/main.test.ts` to pin the wiring.

**Design context the executor needs upfront:** see Key design decisions §3 (sessionMap per-`onload` lifetime). The existing `onload` already constructs `dispatcher` per command invocation — the new closure simply uses the same dispatcher. From Data flow → Cast from panel: the snapshot's `contextNotePaths` and `followUp` are forwarded directly into `CastDispatchInput`.

**Cross-section couplings:**
- E1 depends on D1: the new constructor args must exist.
- E2 depends on C7: the snapshot shape passed to `optionsCastAction` is `OptionsFormSnapshot`.

**Section-level Red criterion:** `tests/main.test.ts` extension verifies that calling the `open-command-popup` callback constructs a `CommandPopup` whose 6th, 7th, and 8th args are the plugin's `overrides`, a fresh `OptionsSessionMap`, and a function. Invoking that function with a `Spell` and a stub snapshot must call `dispatcher.dispatch` with the matching shape: `{ spell, model: snap.model, effort: snap.effort, contextNotePaths: snap.contextNotePaths, followUp: snap.followUp, settings: this.data.settings, activeFilePath: this.app.workspace.getActiveFile()?.path ?? null }`.

**junior-dev**

- [ ] E1: in `src/main.ts.onload`, construct `const sessionMap = new OptionsSessionMap();` after the `overrides` field is initialised. Pass `this.overrides`, `sessionMap`, and a new `optionsCastAction` closure into the `CommandPopup` constructor. The closure: `(spell, snap) => dispatcher.dispatch({ spell, model: snap.model, effort: snap.effort, contextNotePaths: snap.contextNotePaths, followUp: snap.followUp, settings: this.data.settings, activeFilePath: this.app.workspace.getActiveFile()?.path ?? null })`. — S, junior-dev
- [ ] E2: extend `tests/main.test.ts` to assert the wiring: spy `CommandPopup` constructor, invoke the open-command-popup callback, assert the 6th arg is `plugin.overrides`, the 7th is an `OptionsSessionMap` instance, and the 8th is a function; invoke that function with a stub spell + snapshot and assert `dispatcher.dispatch` (spy via `CastRunner` mock or spawner mock — mirror the existing 004 test pattern in `tests/main.test.ts`) receives the merged input. — S, junior-dev

## Effort summary

- Total: 17 todos
- S: 12 · M: 5 · L: 0
- Tier mix: ui-integration-tester: 2 · junior-dev: 7 · senior-dev: 8 · lead-dev: 0
- Section breakdown: A (2 junior) · B (4 junior) · C (1 tester + 7 senior) · D (6 senior + 1 tester) · E (2 junior)
- Dispatch order per section follows the standard ui-integration-tester → junior-dev → senior-dev → lead-dev rule. Section C opens with the tester (C0) so senior-dev (C1–C7) implements against a green Red criterion. Section D opens with the senior-dev wiring (D1–D6) and ends with the tester (D7) since the popup-level integration relies on the panel being already implemented.

## Edge cases pinned by todos

| Edge case | Pinned by |
|---|---|
| Right-Arrow on sentinel row | A2 unit test (no-op), D7 integration test |
| Right-Arrow on empty filteredSpells | A2 unit test (out-of-range no-op) |
| Right-Arrow during detail phase | D7 integration test (no second mount) |
| Haiku model — no effort row, no checkbox | C0 assertion #7 |
| Cast with empty contextNotes + empty followUp | C0 assertion #4 (verify snapshot fields) + spell-cast.spec.ts existing |
| Reset clears session entry | C0 assertion #3 |
| Checkbox toggle persists & re-renders dots | C0 assertions #5,#6 + D7 assertion #4 |
| Pre-loaded override → dot on first render | D7 assertion #5 |
| Cmd+Enter from outside textarea | C0 assertion #8 |
| panel.destroy() releases listeners + keys | C0 assertion #9 |
| Reopen after override stored → snapshot matches store, checkbox hidden | D7 assertion #4 |
