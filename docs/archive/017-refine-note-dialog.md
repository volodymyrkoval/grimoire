# 017 — Refine Note dialog

**Complexity:** Medium
**Source pitch:** `brain/Grimoire - Refine Note dialog.md`

## Goal & scope

Make the Refine sentinel in the Spell Picker behave like a real spell row at the **dialog-gathering** level only. Concretely, in this iteration:

1. Refine sentinel renders the same hint chips as a spell row (`↵ cast · → options`) — same copy, same selector, same rendering helper.
2. `Right` on the highlighted Refine sentinel opens the existing `OptionsPanel` (via `SpellOptionsDetail`) — same shape, same fields, same keyboard, same snapshot semantics, same set-as-default rule.
3. Per-Refine overrides (`model`, `effort`) persist in the existing `SpellOverrideStore` map under a single reserved synthetic `SpellPath` constant.
4. `Enter` on the Refine sentinel closes the popup. `Enter`/`Cast` inside the Refine Options panel closes the popup. Neither writes to disk, dispatches a cast, generates a `castId`, or invokes Claude Code.

That is the entire scope. Everything outside this list is explicitly deferred.

### Out of scope (echoed from pitch — guardrails)

- **No casting.** No `CastDispatcher.dispatch`, no `castAction` invocation, no `castId`, no cast-record write, no log-store touch.
- **No mode detection.** The dialog does not read the active note, count words, or look for `@cast` lines.
- **No `@cast` parsing or directive grouping.** The follow-up textarea collects text only.
- **No CodeMirror inline-marker styling.** Editor decoration of `@cast` lines is a future phase.
- **No prompt-body work.** No Refine prompt is written, loaded, or referenced.
- **No fork of the Options panel.** `OptionsPanel` and `SpellOptionsDetail` are reused unchanged in shape — only the `onCast` callback and the synthetic `Spell`-shaped input differ.
- **No Refine-specific chip vocabulary.** Hint chips render the existing `↵ cast · → options` text verbatim; no rewording for the Refine context.
- **No second snapshot comparison point.** Set-as-default checkbox visibility uses the existing `snapshotEqualsCurrent(snap, current)` rule — snapshot captured at panel open is the only comparison.
- **No override-dot on the Refine sentinel row.** Pitch is silent; current `SpellList` only renders dots on `SpellRow`. Adding a sentinel-dot would extend `SentinelRow` for a single use case — defer.
- **No new keyboard surface.** Tab/Arrow/Escape inside the panel work exactly as they do for an authored spell, governed by the existing `OptionsPanel` + `KeyboardController` plumbing.
- **No live-spec rewrite of the cast pipeline.** `docs/features/options-panel.md` and `docs/features/command-popup-ui.md` are updated only where the new Refine path adds a row to the existing tables.

## Proposed solution

Five sequenced sections, outside-in.

1. **Section A — Shared chip helper + Refine sentinel chip rendering.** Extract the `↵ cast · → options` chip into a single function `appendRowHint(el)` so `SpellRow` and `SentinelRow` (Refine variant only) draw it from one source. No behavior change for `SpellRow`; `SentinelRow` learns to render the chip when its sentinel is `refine`.
2. **Section B — Reserved synthetic SpellPath for Refine.** Add `REFINE_SENTINEL_PATH: SpellPath` constant in `src/domain/spells/Spell.ts` (alongside `EXECUTE_ON_NOTE_KEY`) and a tiny factory `refineSentinelSpell()` returning a synthetic `Spell` shape `{ name: 'Refine', path: REFINE_SENTINEL_PATH, executeOnNote: false }` for `SpellOptionsDetail` consumption. Pure data — no UI.
3. **Section C — `SpellsPanel`: Right opens Refine, Enter dismisses.** Add an `open-refine-options` event (no payload) to `SpellEvents`. Extend `SpellsPanel.openOptions(index)` so a sentinel-index whose sentinel is Refine emits `open-refine-options` instead of no-op. Extend `SpellsPanel.confirm(index)` so a Refine sentinel-index emits a new `dismiss-refine` event (no payload) instead of `sentinel`.
4. **Section D — `CommandPopup`: route the two new events.** Wire `open-refine-options` → `#renderRefineOptionsPanel(): void` which mounts `SpellOptionsDetail` against `refineSentinelSpell()` with `onCast: () => this.close()`. Wire `dismiss-refine` → `this.close()`. Existing `sentinel` event handler (`#renderSentinelDetail`) becomes Forge-only after Refine is removed from its set; `#renderGenericSentinelDetail` becomes dead code and is deleted in the same change.
5. **Section E — Update the two integration specs that pinned the old Refine behavior** (`tests/integration/sentinel-detail.spec.ts` `D4`, `D5`) to assert the new behavior, and update the live-specs (`docs/features/command-popup-ui.md`, `docs/features/options-panel.md`).

The order is: A unblocks no one (pure helper, additive). B is independent. C needs the `SpellEvents` member from B's adjacent file but is otherwise standalone. D consumes A (chip helper used in section A only), B (synthetic `Spell`), and C (events). E is doc + test fix-up after the wiring lands.

## Components

| Component | Location | Responsibility | Status |
|---|---|---|---|
| `appendRowHint` (new) | `src/ui/components/rowHint.ts` (new) | Pure: `(el: HTMLElement) => void`. Appends `<span class="spells-row-hint">↵ cast · → options</span>`. Single source of truth for chip vocabulary. | NEW |
| `SpellRow` | `src/ui/components/SpellRow.ts` | Replace inline `createSpan({ cls: "spells-row-hint", text: "↵ cast · → options" })` with `appendRowHint(this.el)`. Behavior unchanged. | MODIFIED |
| `SentinelRow` | `src/ui/components/SentinelRow.ts` | Accept optional 4th positional arg `showHint: boolean = false`. When true, call `appendRowHint(this.el)` after the name span. | MODIFIED |
| `SpellList` | `src/ui/components/SpellList.ts` | When constructing `SentinelRow` for a sentinel with `kind === 'refine'`, pass `showHint: true`. Forge stays `false` to preserve current behavior. | MODIFIED |
| `Spell.ts` | `src/domain/spells/Spell.ts` | Export `REFINE_SENTINEL_PATH: SpellPath` constant (`spellPath('<grimoire-sentinel:refine>')`) and `refineSentinelSpell(): Spell` factory. Pure data — no Obsidian deps. | MODIFIED |
| `SpellEvents` | `src/domain/spells/SpellEvents.ts` | Add two members: `"open-refine-options": void` and `"dismiss-refine": void`. | MODIFIED |
| `SpellsPanel` | `src/ui/tabs/SpellsPanel.ts` | `openOptions(index)`: when index falls on the Refine sentinel row, emit `open-refine-options`. `confirm(index)`: when index falls on the Refine sentinel row, emit `dismiss-refine` (instead of `sentinel`). Forge sentinel paths unchanged. | MODIFIED |
| `CommandPopup` | `src/ui/CommandPopup.ts` | Register handlers for `open-refine-options` (→ `#renderRefineOptionsPanel`) and `dismiss-refine` (→ `this.close()` from search phase). Add `#renderRefineOptionsPanel(): void` that mounts `SpellOptionsDetail` against `refineSentinelSpell()` with `onCast: () => this.close()`. Delete `#renderGenericSentinelDetail` and the `if (sentinel.kind === "forge")` branch in `#renderSentinelDetail` (forge becomes the only sentinel that routes through `#renderSentinelDetail`; rename to `#renderForgeSentinelDetail` callsite or simplify). | MODIFIED |
| `SpellOptionsDetail` | `src/ui/components/SpellOptionsDetail.ts` | UNCHANGED. Already accepts `Spell` via params; the synthetic `refineSentinelSpell()` satisfies the type. | UNCHANGED |
| `OptionsPanel` | `src/ui/options/OptionsPanel.ts` | UNCHANGED. The `executeOnNote` checkbox renders for the Refine panel too — pitch does not exclude it; it is part of the existing pattern the user already knows. | UNCHANGED |
| `OptionsSessionMap` | `src/ui/options/OptionsSessionMap.ts` | UNCHANGED. Uses `SpellPath` keys; the synthetic Refine path is a valid key. | UNCHANGED |
| `SpellOverrideStore` | `src/domain/settings/SpellOverrideStore.ts` | UNCHANGED. The synthetic Refine path is stored under the same `spellOverrides` map; existing model/effort validation applies. | UNCHANGED |
| `resolveSpellOptions` | `src/domain/settings/spellOptionsResolver.ts` | UNCHANGED. Tier cascade (session → overrides → settings) works for the synthetic path the same as for any vault path. | UNCHANGED |

## Interfaces

### `appendRowHint`

```ts
// src/ui/components/rowHint.ts
export function appendRowHint(el: HTMLElement): void {
  el.createSpan({ cls: 'spells-row-hint', text: '↵ cast · → options' });
}
```

Single source of truth for chip vocabulary. No options, no variants — that is the point.

### `SentinelRow.render` (modified signature)

```ts
// src/ui/components/SentinelRow.ts
render(container: HTMLElement, sentinel: Sentinel, selected: boolean, showHint: boolean = false): void
```

When `showHint` is `true`, calls `appendRowHint(this.el)` after `#appendName`. Default `false` preserves Forge sentinel rendering exactly as today.

### `Spell.ts` additions

```ts
// src/domain/spells/Spell.ts
import { spellPath, type SpellPath } from './SpellPath';

/** Synthetic SpellPath reserved for the built-in Refine sentinel.
 *  Angle-bracketed prefix is impossible in real vault paths, preventing collision. */
export const REFINE_SENTINEL_PATH: SpellPath = spellPath('<grimoire-sentinel:refine>');

/** Synthetic Spell-shaped object for routing the Refine sentinel through
 *  SpellOptionsDetail without forking it. executeOnNote=false is a placeholder —
 *  the Refine cast pipeline is deferred; nothing reads this value in this iteration. */
export function refineSentinelSpell(): Spell {
  return {
    name: 'Refine',
    path: REFINE_SENTINEL_PATH,
    executeOnNote: false,
  };
}
```

Both exports live in `Spell.ts` (alongside `EXECUTE_ON_NOTE_KEY`) so the synthetic identity is co-located with the `Spell` type itself.

### `SpellEvents` (modified)

```ts
// src/domain/spells/SpellEvents.ts
export type SpellEvents = {
  cast: Spell;
  sentinel: Sentinel;
  "open-options": Spell;
  "open-refine-options": void;
  "dismiss-refine": void;
};
```

Two new no-payload events so the popup can route Refine actions without conflating them with the spell-row paths or with the Forge sentinel.

### `SpellsPanel` (behavioral changes — signatures unchanged)

`openOptions(index)`: today it bounds-checks `index >= filteredSpells.length` and no-ops for sentinels. New behavior:

```ts
openOptions(index: number): void {
  if (index < 0) return;
  if (index < this.#filteredSpells.length) {
    this.events.emit('open-options', this.#filteredSpells[index]);
    return;
  }
  const sentinel = SENTINELS[index - this.#filteredSpells.length];
  if (sentinel?.kind === 'refine') {
    this.events.emit('open-refine-options');
  }
}
```

`confirm(index)`: today the sentinel branch emits `'sentinel'` for any sentinel. New behavior:

```ts
confirm(index: number): void {
  if (index < this.#filteredSpells.length) {
    const spell = this.#filteredSpells[index];
    if (spell) this.events.emit('cast', spell);
    return;
  }
  const sentinel = SENTINELS[index - this.#filteredSpells.length];
  if (!sentinel) return;
  if (sentinel.kind === 'refine') {
    this.events.emit('dismiss-refine');
    return;
  }
  this.events.emit('sentinel', sentinel);
}
```

### `CommandPopup` (event wiring)

In `#createSpellsPanel`, register two more handlers:

```ts
panel.events.on('open-refine-options', () => this.#renderRefineOptionsPanel());
panel.events.on('dismiss-refine', () => this.close());
```

Add:

```ts
#renderRefineOptionsPanel(): void {
  this.#reattachTabBar();
  const exit = (): void => this.#exitDetail();
  const detail = new SpellOptionsDetail();
  detail.render({
    contentEl: this.contentEl,
    scope: this.scope,
    spell: refineSentinelSpell(),
    app: this.app,
    overrides: this.#overrides,
    sessionMap: this.#sessionMap,
    formDefaults: this.#formDefaults,
    models: SUPPORTED_MODELS,
    onBack: exit,
    onCast: () => this.close(),
    onOverrideChanged: () => this.#spellsPanel.refreshOverrides(),
  });
  this.#enterDetail(detail, exit, { suspendKb: true });
}
```

Delete `#renderGenericSentinelDetail`. Simplify `#renderSentinelDetail` so only Forge routes through it (or inline the Forge call in the `'sentinel'` event handler — the cleanest option).

## Data flow

### Open Refine Options panel (Right Arrow on Refine row)

```
ArrowRight (search phase, spells tab, selectedIndex on Refine sentinel row)
  → SearchPhase.handleArrowRight (existing)
  → spellsPanel.openOptions(11)
  → SpellsPanel: index falls on Refine sentinel → emit 'open-refine-options'
  → CommandPopup.#renderRefineOptionsPanel()
  → SpellOptionsDetail.render({ spell: refineSentinelSpell(), onCast: () => this.close(), ... })
    ├─ resolveSpellOptions resolves model/effort via session→override→settings
    │   keyed on REFINE_SENTINEL_PATH
    ├─ OptionsFormState built from resolved values + sessionMap entry (if any)
    │   for contextNotePaths/followUp
    └─ OptionsPanel mounted with snapshot { model, effort } captured at open
  → CommandPopup.#enterDetail(detail, exit, { suspendKb: true })
```

### Cast/Enter inside Refine Options panel — dismiss only (no dispatch)

```
Cast click / Mod+Enter / form submit in Refine panel
  → OptionsPanel: sessionMap.put(REFINE_SENTINEL_PATH, current)   ← session entry persists
  → deps.onCast(current)
  → CommandPopup: this.close()
  → close() override sees phase === 'detail' → interceptClose() runs onDetailBack → exitDetail()
  → modal stays open, transitions back to search phase

  ⚠️ But the pitch says "Enter inside the configured dialog closes the popup." — meaning
  the WHOLE modal must dismiss, not exit detail back to search.
  ⇒ onCast must call super.close() semantics: bypass the detail-intercept.
  ⇒ We add CommandPopup.dismiss(): void that calls super.close() unconditionally
    (bypassing the override) and SpellOptionsDetail's onCast for Refine wires to dismiss().
```

This is the one subtle wrinkle. It is documented as Key design decision §3 below.

### Enter on Refine sentinel — dismiss only

```
Enter (search phase, selectedIndex on Refine sentinel row)
  → SearchPhase.handleEnter → activePanel.confirm(index)
  → SpellsPanel.confirm: Refine sentinel branch → emit 'dismiss-refine'
  → CommandPopup: this.close()
  → phase === 'search' → close() override does not intercept → super.close() runs
  → modal fully dismissed
```

From search phase, `this.close()` is sufficient — `interceptClose()` returns `false` for `SearchPhase` and `super.close()` runs.

### Persistence of per-Refine overrides

```
checkbox toggle in Refine Options panel
  → CastModelSection.#bindSetAsDefault: if checked, overrides.set(REFINE_SENTINEL_PATH, {model, effort})
  → SpellOverrideStore validates + clamps + schedules save (existing pipeline)
  → onOverrideChanged → spellsPanel.refreshOverrides() (no-op effect for Refine because
    SpellList only paints dots on spell rows, not sentinels — by design this iteration)
  → DebouncedSaver flushes → plugin data persisted to disk under
    spellOverrides["<grimoire-sentinel:refine>"] = { model, effort }
```

Re-opening Refine on a later popup-open reads via `resolveSpellOptions` → tier 2 (override) → snapshot matches stored values → checkbox starts hidden (snapshot equals current). Same UX as authored spells.

## Key design decisions

### 1. Reserved synthetic SpellPath uses an angle-bracket prefix that is path-impossible

`'<grimoire-sentinel:refine>'`. The `<` and `>` characters are illegal in vault file paths on Windows and conventionally avoided on macOS/Linux. `SpellPath` is a branded `string`, so the value is opaque to the type system; collision protection is by lexical convention. Co-located with `Spell.ts` so future sentinels (if any) follow the same naming scheme without re-deriving it.

**Trade-off considered:** a `Symbol`-keyed parallel structure for sentinel overrides was rejected — it would split persistence (current `Record<string, SpellOverride>` is JSON-serialised) and require a separate save/load path. The pitch is explicit: "persist under a reserved synthetic key in the existing per-spell override map". Honor it.

### 2. The chip helper is a pure function, not a component or strategy

`appendRowHint(el)` is six lines of HTML. Wrapping it in a class or strategy interface would be ceremony. The single-source-of-truth rule (pitch: "drawn by the same rendering. No Refine-specific chip vocabulary") is enforced by the function's existence: any change to chip text changes both rows. A future iteration that wants per-row-kind chips can grow the function's signature without rewriting callers.

### 3. `CommandPopup.dismiss()` exists to bypass the close-override intercept for panel-cast on Refine

The pitch is explicit: "Enter inside the configured dialog closes the popup." Today, panel-cast on an authored spell calls `castAction → dispatcher.dispatch → dispatcher.close() → popup.close() → interceptClose() → exitDetail()` — the modal stays open and returns to search. This is correct for an authored-spell cast (the dispatcher already toasted; user can cast again). For Refine in this iteration, there is no dispatcher, no toast, no second cast; the user interaction is finished and the modal should fully dismiss.

Add a thin public method `dismiss()` to `CommandPopup` that calls `super.close()` directly. The Refine `onCast` callback wires to `dismiss()` rather than `close()`. The override remains in place for the authored-spell path (untouched) and for the Back button (Escape from Refine panel must still go back to search via the override — the user dismissed the panel, not the modal).

**Why not just call `super.close()` from inside `#renderRefineOptionsPanel`?** The `onCast` lambda is created in `CommandPopup` which has access to `this`, but `super` is not available outside the class via lexical scope. A bound `dismiss()` method exposes the capability cleanly.

**Why not always dismiss on panel-cast (and remove the existing exit-to-search behavior)?** The authored-spell behavior is pinned by `tests/integration/options-panel-popup.spec.ts` `A6` and by the existing integration tests on `tests/integration/spell-cast.spec.ts`. The pitch only changes Refine. Keep the divergence narrow: authored spells exit to search; Refine dismisses. The divergence lives in the `onCast` callback, not in the popup's close logic.

### 4. `Enter` on the Refine sentinel emits `dismiss-refine`, not `sentinel`

Routing Refine through the existing `sentinel` event would require `#renderSentinelDetail` to branch on `kind` again — exactly what the existing `#renderGenericSentinelDetail` already does, and which is being deleted. A separate event makes the new behavior obvious at the emitter (single grep), and the dead `#renderGenericSentinelDetail` goes away in the same commit.

### 5. `executeOnNote` on the Refine synthetic spell is `false` — a placeholder, not a contract

The Refine cast pipeline is deferred. In this iteration, nothing reads `executeOnNote` from the Refine snapshot — the `onCast` callback discards the snapshot entirely (just calls `dismiss()`). The `OptionsPanel` will still render the executeOnNote checkbox, which is harmless: it persists into `OptionsSessionMap` like any other field. When the cast pipeline lands in a future phase, that phase will decide whether Refine respects `executeOnNote` semantically — at which point this default is revisited. Documented here to make the intent explicit; not a forever decision.

### 6. The Refine row does not get an override-dot

Pitch is silent on it. `SpellList` paints dots only on `SpellRow` (via `hasOverride(spell.path)`). Adding a dot to `SentinelRow` would extend the predicate to accept sentinel keys and would extend `SpellList.render` and `SpellsPanel.mount` API surface for one use case. Defer until a future iteration explicitly asks for it.

### 7. Hint chips ship verbatim — `↵ cast · → options` — even on Refine where Enter does not cast

Pitch is firm: "Do not introduce Refine-specific labels for `↵` or `→` even where the verb might seem to want a tweak; the chip vocabulary is shared across the picker and stays that way." Honor it. The chip is a stable visual; the verb mismatch ("cast" vs. "dismiss") is intentional consistency, not a bug.

### 8. Forge sentinel chip rendering stays unchanged (no chip)

Pitch only asks for chips on Refine. Adding chips to Forge would change a UI that has shipped and been tested at the integration level (`tests/integration/sentinel-detail.spec.ts`, `tests/integration/forge-cast.spec.ts`). Out of scope. The `showHint` arg defaults to `false`; `SpellList` only sets it `true` for Refine.

## Error handling

- **Right-Arrow on Refine while phase === detail:** existing `SearchPhase`/`DetailPhase` gating already covers this; `DetailPhase.handleArrowRight()` returns `false`. No new code path.
- **Enter on Refine while phase === detail:** same. `DetailPhase.handleEnter()` returns `false`.
- **`SpellOverrideStore.set` for Haiku (null-effort):** existing store rejects with console.error; existing `CastModelSection` checkbox-visibility rule hides the checkbox when `snapshot.effort === null`. Both layers cover this for Refine the same way they do for authored spells. No new code path.
- **`activeFilePath === null` at Refine cast time:** N/A this iteration — Refine cast is not dispatched. Future phase concern.
- **Stale Refine override referring to an unknown model:** existing `resolveSpellOptions` falls back to `models[0]` with effort survival; existing `OptionsFormState.setModel` falls back the same way. Refine inherits this. No new code path.
- **Multiple rapid `dismiss()` calls:** Modal's own `close()` is idempotent (checks `containerEl.parentElement`). `dismiss()` calls `super.close()` once per invocation; double-invocation is a no-op on the second call.
- **`open-refine-options` emitted while panel already open:** `SearchPhase.handleArrowRight` only fires in search phase; panel-open transitions to detail phase; second ArrowRight while in detail returns `false`. No re-entrancy.
- **Refine sentinel removed from SENTINELS list (future change):** the `openOptions`/`confirm` branches use `sentinel?.kind === 'refine'` — if the sentinel is gone, the branch is skipped, no event emitted, popup behavior is unchanged. Defensive against future refactors.

## Technical notes

### Skill: `design-rubric` — Section 7 self-critique

- **Q: Does each new component have one reason to change?**
  - `appendRowHint`: changes only if the chip vocabulary changes — by design, the single source of truth.
  - `REFINE_SENTINEL_PATH` / `refineSentinelSpell()`: change only if the synthetic-key shape changes.
  - `#renderRefineOptionsPanel`: changes only if the Refine-panel routing changes (e.g. when the cast pipeline lands).
  - `dismiss()`: changes only if the dismissal semantics change (currently: "bypass intercept, fully close").
  Yes for each.
- **Q: Are dependencies pointed away from volatility?** Yes. `Spell.ts` (stable) gets a constant + factory; `SpellEvents.ts` (stable, additive) gets two members; `SpellsPanel` (modified for new behavior) depends on `Spell.ts` and `SpellEvents` — both upstream of it. `CommandPopup` depends on `SpellOptionsDetail` (existing, stable) and the new `Spell.ts` exports.
- **Q: Is the interface small enough that mocking it is cheap?** `appendRowHint` is a pure function — trivially testable. `dismiss()` is a no-arg method. `refineSentinelSpell()` is a pure factory. The two new events are no-payload — assertable with `vi.spyOn(panel.events, 'emit')`.
- **Q: Are we creating abstractions that have only one implementation?** `appendRowHint` is a function, not an interface — no premature polymorphism. `refineSentinelSpell` is one factory; if a second sentinel becomes spell-shaped, the pattern generalizes naturally.
- **Q: What is the worst-case test for each public seam?**
  - `appendRowHint`: assert appended span's class and text.
  - `SentinelRow` chip rendering: construct with `showHint: true` for `kind: 'refine'`; assert chip span exists.
  - `SpellsPanel.openOptions(refineIndex)`: spy on `events.emit`; assert `'open-refine-options'` fires once with no payload.
  - `SpellsPanel.confirm(refineIndex)`: spy on `events.emit`; assert `'dismiss-refine'` fires (and `'sentinel'` does not).
  - `CommandPopup` Refine routing: integration test — Right on Refine row mounts `.options-panel`; Cast click calls `super.close()` (modal removed from DOM).
  - `dismiss()`: unit test — calling `dismiss()` from detail phase fully closes the modal (no intercept).
- **Q: Is there any temporal coupling left?** No. The `open-refine-options` handler is registered at popup construction; `dismiss()` is callable at any time; the synthetic `Spell` is constructed fresh per panel-open.
- **Q: Could we cut any of this and still ship?** The chip helper extraction (Section A) is a refactor — chip rendering on Refine could be done inline. Extracting saves duplicating the literal and enforces the pitch's "drawn by the same rendering" rule mechanically. Worth keeping. The `dismiss()` method is essential — the close-override otherwise breaks the dismiss-on-cast contract for Refine. Cannot cut.

### Skill: `design-patterns` — patterns considered

- **Strategy** for sentinel rendering (`Forge` vs `Refine` row appearance) — *rejected*: two cases, one variable (chip on/off), trivially handled by an optional boolean. Strategy would be ceremony.
- **Factory method** for `refineSentinelSpell()` — *applied*. A free function (not a class static) because `Spell` is an interface, not a class. Mirrors `optionsFormSnapshotFromDefaults`.
- **Value object** for `REFINE_SENTINEL_PATH` — *applied implicitly*. A branded-string constant; equality and identity are the same; immutable by language.
- **Observer / event emitter** for `open-refine-options` and `dismiss-refine` — *already used*. Reuses the existing `TypedEmitter<SpellEvents>` pattern. No new pattern.
- **State pattern** extension to `PopupPhase` for a "Refine-detail" sub-state — *rejected*. The phase distinction is `search` vs `detail`; the Refine panel is just another `detail` instance, indistinguishable from the authored-spell panel at the phase level. The `onCast` callback variation is data, not state.
- **Template Method** between authored-spell and Refine panel rendering — *rejected*. Two callers of `SpellOptionsDetail.render` that pass slightly different params is not a hierarchy; it is two configurations. Pulling them up into a base method would obscure the divergence (the `onCast` semantics) the design wants to make obvious.
- **Command** for `dismiss-refine` — *rejected*. A single no-arg event with a single handler is not Command. Direct method invocation via the emitter is clearer.

### Other notes

- The two new `SpellEvents` members (`open-refine-options`, `dismiss-refine`) are deliberately void-payload to make the seam narrow. If a future iteration needs to distinguish multiple sentinels with options panels, payload becomes a discriminated union — additive change.
- `SpellOptionsDetail` consumes `Spell` via `params.spell.path` (for the resolver, sessionMap, override store) and `params.spell.executeOnNote` (for `OptionsFormState` initial value). Both fields are present on the synthetic. No widening of `SpellOptionsDetail` interface required.
- The pitch's "Enter inside the configured dialog closes the popup" is the only behavior in this iteration that diverges from the authored-spell options-panel cast flow (which exits to search). Locating the divergence in the `onCast` lambda (passed to `SpellOptionsDetail`) keeps `SpellOptionsDetail`, `OptionsPanel`, `CastModelSection`, and `OptionsFormState` all unchanged. This is the single-judgment-call moment of the iteration.
- `tests/integration/sentinel-detail.spec.ts` `D4` and `D5` pin behavior the new feature explicitly changes (Enter on Refine no longer renders the generic detail; close from Refine detail no longer routes through `interceptClose` because there is no Refine detail in the old shape any more). They are updated in scope, not removed: replaced with assertions that Enter on Refine fully closes the modal (no DOM, popup gone) and that Right on Refine mounts `.options-panel`.
- `docs/features/command-popup-ui.md` rows for "Enter on Refine sentinel" and "ArrowRight on Refine sentinel" are updated; the state diagram's "Generic sentinel" branch is removed.
- `docs/features/options-panel.md` (assumed extant — verify in Section E) gets a sentence on the Refine variant: same panel, `onCast` dismisses instead of dispatching.
- After Section D lands, `#renderGenericSentinelDetail` is dead code and is deleted in the same commit. This is a behavior-preserving deletion: the only caller (Refine via `#renderSentinelDetail`) no longer exists.
- The new file `src/ui/components/rowHint.ts` is a six-line pure function. It does not warrant a class. Co-located in `src/ui/components/` so it lives next to its callers.

### Deferred edge cases (user-explicit; not implemented this iteration)

The pitch and the orchestrator's framing did not surface a list of edge cases requiring user clarification — the pitch is itself the edge-case enumeration ("rabbit holes", "no-gos"). No `AskUserQuestion` was invoked. Nothing deferred beyond the explicit out-of-scope list above.

## Perspective synthesis

Not invoked — Medium complexity, single-feature, all surfaces already exist. No 4-perspective sweep warranted. The pitch itself enumerates the design tensions and resolves them ("rabbit holes" + "no-gos"); the planner's job is to honor that resolution.

---

## Todos

### A. Shared chip helper + Refine sentinel chip rendering

#### Section briefing

**What this section produces:** new file `src/ui/components/rowHint.ts` exporting `appendRowHint(el)`. Modified `src/ui/components/SpellRow.ts` so its `#appendHint()` calls `appendRowHint`. Modified `src/ui/components/SentinelRow.ts` so it accepts an optional 4th positional `showHint: boolean = false` and calls `appendRowHint` when `true`. Modified `src/ui/components/SpellList.ts` so the Refine sentinel is constructed with `showHint: true`.

**Design context the executor needs upfront:** see Interfaces → `appendRowHint` and `SentinelRow.render`, and Key design decision §2 (the function is the single source of truth for chip vocabulary; do not parameterize copy or class). Pitch guardrail: chip text is exactly `↵ cast · → options` — no alternative copy for Refine (Key design decision §7). Forge sentinel does not get the chip (Key design decision §8) — `SpellList` only passes `showHint: true` for `kind === 'refine'`.

**Cross-section couplings:**
- A2 (`SentinelRow.showHint`) is consumed by A4 (`SpellList` passes the flag for Refine).
- None of this section depends on B/C/D — pure additive UI plumbing.

**Section-level Red criterion:** unit tests in `tests/SpellRow.test.ts` and `tests/SentinelRow.test.ts` and `tests/SpellList.test.ts` simultaneously assert: (a) `SpellRow` renders exactly one `.spells-row-hint` span containing `↵ cast · → options` (existing test should keep passing); (b) `SentinelRow` with `showHint: true` renders exactly one `.spells-row-hint` span with the same text; with `showHint: false` (or omitted), renders zero such spans; (c) after `SpellList.render(spells, 0)`, the Forge sentinel row contains zero `.spells-row-hint` spans and the Refine sentinel row contains exactly one. `npm run lint` and `npm test` green.

**junior-dev**
- [x] A1: create `src/ui/components/rowHint.ts` exporting `appendRowHint(el: HTMLElement): void` per Interfaces. Add a unit test in `tests/rowHint.test.ts` asserting it appends one `<span class="spells-row-hint">` with text `↵ cast · → options` — S, junior-dev
- [x] A2: modify `src/ui/components/SpellRow.ts` `#appendHint()` to call `appendRowHint(this.el)` instead of inlining the `createSpan(...)` call. Existing `tests/SpellRow.test.ts` "renders the keyboard hint span with the correct text" assertion must still pass without modification — S, junior-dev
- [x] A3: modify `src/ui/components/SentinelRow.ts` `render(container, sentinel, selected, showHint = false)` — append `appendRowHint(this.el)` after `#appendName` only when `showHint` is true. Add unit tests in `tests/SentinelRow.test.ts`: (a) `showHint: true` for any sentinel → exactly one `.spells-row-hint` child; (b) `showHint: false` (or omitted) → zero `.spells-row-hint` children; (c) the chip text matches `↵ cast · → options` — S, junior-dev
- [x] A4: modify `src/ui/components/SpellList.ts` `#buildSentinelRows` to pass `showHint: sentinel.kind === 'refine'` as the 4th arg of `row.render(...)`. Add a unit test in `tests/SpellList.test.ts`: render with the default `[Forge, Refine]` sentinels; assert the rendered DOM has exactly one `.spells-row-hint` inside `.sentinels-section`, and that it lives inside the Refine row (the second `.sentinel-row`) — S, junior-dev

### B. Reserved synthetic SpellPath + Refine spell factory

#### Section briefing

**What this section produces:** modified `src/domain/spells/Spell.ts` adding `REFINE_SENTINEL_PATH: SpellPath` constant and `refineSentinelSpell(): Spell` factory function. Pure data; no Obsidian deps; no behavior change to the existing `Spell` interface or `Sentinel` type or `isSentinel` guard.

**Design context the executor needs upfront:** see Interfaces → `Spell.ts` additions, and Key design decision §1 (angle-bracket prefix `<grimoire-sentinel:refine>` is path-impossible on Windows, conventionally avoided elsewhere — collision protection is by lexical convention, not type). Key design decision §5: `executeOnNote: false` is a documented placeholder — nothing reads it in this iteration; future cast-pipeline phase decides Refine semantics.

**Cross-section couplings:**
- B1 produces `REFINE_SENTINEL_PATH` consumed by C1 (SpellsPanel branches on Refine — actually no, C1 uses `sentinel.kind === 'refine'`, not the path). Path is consumed by D2 (`#renderRefineOptionsPanel` passes `refineSentinelSpell()` whose path is `REFINE_SENTINEL_PATH`).
- B2 produces `refineSentinelSpell()` consumed by D2.

**Section-level Red criterion:** unit tests in `tests/Spell.test.ts` (or new `tests/refineSentinelSpell.test.ts` if `tests/Spell.test.ts` already exists and the test would be off-topic) assert: (a) `REFINE_SENTINEL_PATH` equals the literal `'<grimoire-sentinel:refine>'` (cast through `spellPath`); (b) `refineSentinelSpell()` returns `{ name: 'Refine', path: REFINE_SENTINEL_PATH, executeOnNote: false }`; (c) two consecutive calls return objects with the same `path` reference (constant identity). `npm test` green.

**junior-dev**
- [x] B1: in `src/domain/spells/Spell.ts`, export `REFINE_SENTINEL_PATH: SpellPath = spellPath('<grimoire-sentinel:refine>');`. Import `spellPath` from `./SpellPath`. Add a JSDoc explaining it is the reserved synthetic key for the Refine sentinel's per-spell overrides. Add a failing unit test first in `tests/Spell.test.ts` asserting the constant value — S, junior-dev
- [x] B2: in the same file, export `refineSentinelSpell(): Spell` returning `{ name: 'Refine', path: REFINE_SENTINEL_PATH, executeOnNote: false }`. JSDoc states it is a synthetic spell-shaped object for routing the Refine sentinel through `SpellOptionsDetail` without forking it; `executeOnNote: false` is a placeholder per Key design decision §5. Add a unit test asserting the returned shape and that `path === REFINE_SENTINEL_PATH` — S, junior-dev

### C. SpellsPanel: Right opens Refine, Enter dismisses

#### Section briefing

**What this section produces:** modified `src/domain/spells/SpellEvents.ts` adding two members: `"open-refine-options": void` and `"dismiss-refine": void`. Modified `src/ui/tabs/SpellsPanel.ts` so that `openOptions(index)` emits `'open-refine-options'` for the Refine sentinel index (still no-op for Forge sentinel and out-of-range), and `confirm(index)` emits `'dismiss-refine'` for the Refine sentinel index (still emits `'sentinel'` for Forge and `'cast'` for spell rows). Existing `'cast'` and `'sentinel'` and `'open-options'` paths are unchanged for spell rows and Forge.

**Design context the executor needs upfront:** see Interfaces → `SpellsPanel` (the literal new code is in this plan). The Refine sentinel lives at `SENTINELS[1]` (Forge is `[0]`); index check is `sentinel?.kind === 'refine'`, not by index position — sentinel order may shift in future and the kind check is robust. Key design decision §4: separate event for Refine dismissal makes the new behavior obvious at the emitter (`grep emit\\(.dismiss-refine` finds one site). The two new events are deliberately void-payload (Key design decision §3 → "Other notes").

**Cross-section couplings:**
- C1 (SpellEvents members) is consumed by C2/C3 (SpellsPanel emits) and by D1 (CommandPopup registers handlers). C1 must land first in this section.
- C2 (`openOptions` Refine branch) is reached from `SearchPhase.handleArrowRight → spellsPanel.openOptions(selectedIndex)` — already wired; `SearchPhase` does not need modification because the gate `selectedIndex >= spellsPanel.length` is `>= 12`, and Refine is at index 11 (within bounds). Verify by re-reading `src/ui/popup/SearchPhase.ts:51-60`; if any current test pins `openOptions` not being called for index 11, it must be updated in this section — see C2 acceptance.
- C3 (`confirm` Refine branch) is reached from `SearchPhase.handleEnter → activePanel.confirm(selectedIndex)` — already wired. Existing `tests/SpellsPanel.test.ts` "confirm sentinel" assertions must be updated in scope (C3 acceptance) to reflect that Refine no longer emits `'sentinel'`.

**Section-level Red criterion:** unit tests in `tests/SpellsPanel.test.ts` simultaneously assert: (a) `openOptions(11)` (Refine sentinel index) emits `'open-refine-options'` exactly once with no payload, and emits no other event; (b) `openOptions(10)` (Forge sentinel index) emits no event (still a no-op for Forge); (c) `openOptions(<0|>=12)` emits no event; (d) `openOptions(0..9)` (spell rows) still emits `'open-options'` with the correct spell — existing tests stay green; (e) `confirm(11)` emits `'dismiss-refine'` exactly once with no payload; (f) `confirm(10)` (Forge) emits `'sentinel'` exactly once with the Forge sentinel — existing test stays green; (g) `confirm(0..9)` emits `'cast'` with the correct spell — existing tests stay green. TypeScript compiles with the new event members referenced in test code via `vi.spyOn(panel.events, 'emit')`.

**junior-dev**
- [x] C1: in `src/domain/spells/SpellEvents.ts`, add `"open-refine-options": void;` and `"dismiss-refine": void;` to the `SpellEvents` type. JSDoc on the type says these fire when the Refine sentinel is activated via Right (open options) or Enter/click (dismiss popup). No test needed for the type alone — TypeScript compilation is the test — S, junior-dev
- [x] C2: in `src/ui/tabs/SpellsPanel.ts` `openOptions(index)`, after the existing in-range spell-row branch, add: if the index falls on the sentinel block and the resolved sentinel has `kind === 'refine'`, emit `'open-refine-options'`; otherwise no-op. Use `SENTINELS[index - this.#filteredSpells.length]` to resolve. Add a unit test in `tests/SpellsPanel.test.ts` (in the existing `describe('SpellsPanel.openOptions', ...)` block) asserting: (a) `openOptions(forgeIndex)` (10) emits nothing — pin existing no-op for Forge; (b) `openOptions(refineIndex)` (11) emits `'open-refine-options'` once. Existing tests in this block must remain green — S, junior-dev
- [x] C3: in `src/ui/tabs/SpellsPanel.ts` `confirm(index)`, in the sentinel branch, before `events.emit('sentinel', sentinel)`, add: if `sentinel.kind === 'refine'`, emit `'dismiss-refine'` and return. Forge keeps emitting `'sentinel'`. Update the existing `tests/SpellsPanel.test.ts` confirm-sentinel test for Refine (search the file for "Refine" in confirm assertions) to assert `'dismiss-refine'` is emitted, not `'sentinel'`. Add a fresh assertion that Forge `confirm` still emits `'sentinel'` with the Forge sentinel — S, junior-dev

### D. CommandPopup: route the Refine events; delete dead generic-sentinel path

#### Section briefing

**What this section produces:** modified `src/ui/CommandPopup.ts`. Adds `dismiss(): void` public method that calls `super.close()` directly, bypassing the `close()` override. In `#createSpellsPanel`, registers `panel.events.on('open-refine-options', ...)` → new `#renderRefineOptionsPanel()` private method, and `panel.events.on('dismiss-refine', ...)` → `this.close()`. Adds `#renderRefineOptionsPanel()` that mounts `SpellOptionsDetail` with `spell: refineSentinelSpell()` and `onCast: () => this.dismiss()`. Deletes `#renderGenericSentinelDetail` (now unreachable). Simplifies `#renderSentinelDetail` to handle only Forge (or inlines it into the `'sentinel'` event handler — pick the lighter form, document choice in commit message).

**Design context the executor needs upfront:** see Interfaces → `CommandPopup` (event wiring), Data flow → all three flows (Open Refine panel, Cast inside Refine panel = dismiss, Enter on Refine = dismiss). Key design decision §3 is the load-bearing one — `dismiss()` exists specifically because the close-override would otherwise intercept the panel-cast and exit to search instead of fully closing. The authored-spell `castAction` path is **unchanged** — it still calls `this.close()` and goes through the override (exit-to-search). Only the Refine panel's `onCast` wires to `dismiss()`. Key design decision §5: pass `executeOnNote: false` via the synthetic spell — `OptionsPanel` will render the executeOnNote checkbox (harmless placeholder this iteration). Pitch guardrail: do not fork `OptionsPanel` or `SpellOptionsDetail` — reuse them as-is.

**Cross-section couplings:**
- D1 (`dismiss()` method) is consumed by D2 (the `onCast` lambda in `#renderRefineOptionsPanel` calls `this.dismiss()`).
- D2 (`#renderRefineOptionsPanel`) consumes B2 (`refineSentinelSpell()`) and reaches the panel via the existing `SpellOptionsDetail` API (unchanged).
- D3 (event wiring for `'open-refine-options'` and `'dismiss-refine'`) consumes C1 (the events exist) and registers handlers in `#createSpellsPanel`.
- D4 (delete `#renderGenericSentinelDetail`, simplify `#renderSentinelDetail`) is enabled by C3 (Refine no longer emits `'sentinel'`, so the generic branch is unreachable).
- D5 (the integration test) depends on D1–D4. The `**ui-integration-tester**` group below owns the section's Red criterion.

**Section-level Red criterion:** integration test `tests/integration/refine-options-panel.spec.ts` covers, against the standard popup harness:
1. Navigate to the Refine sentinel (e.g. ArrowUp from index 0 → 11). Press `ArrowRight`. Assert `form.options-panel` is mounted in the modal contentEl. Assert no `<h2>Refine</h2>` (generic-detail signature) is present.
2. From within the Refine Options panel, click the Cast button (or submit the form). Assert: `castAction` (spied via harness) was **not** called; `imprintAction` was **not** called; the modal's `containerEl.parentElement` is null (modal fully closed — `super.close()` ran).
3. From within the Refine Options panel, click the Back button. Assert: the modal is still open (`containerEl.parentElement` is truthy); `form.options-panel` is gone; the search input is restored.
4. Navigate to the Refine sentinel. Press `Enter`. Assert: the modal is fully closed (`containerEl.parentElement` is null); `castAction`/`imprintAction` not called; no `form.options-panel` was ever mounted.
5. Toggle Set-as-default in the Refine Options panel after changing the model: assert `overrides.has(REFINE_SENTINEL_PATH)` is `true`; un-toggle: assert it returns to `false`. (Uses `SpellOverrideStore` from the harness — pre-loaded empty.)
6. Re-open Refine Options panel after step 5 (cast + reopen path is hard because cast dismisses the modal — instead: open Refine, set override on, click Back, navigate to Refine again, press ArrowRight). Assert the model select shows the overridden model and the Set-as-default checkbox label is initially hidden (snapshot equals current per `snapshotEqualsCurrent`).

Additionally, all six existing integration specs in `tests/integration/` that exercise the popup must remain green except the two intentionally updated by this iteration (`tests/integration/sentinel-detail.spec.ts` D4/D5 — see Section E).

`npm run lint`, `npm test`, `npm run test:integration` all green at section close.

**ui-integration-tester**
- [x] D5: integration test: write `tests/integration/refine-options-panel.spec.ts` covering the six assertions above. Use the existing `createPopupHarness` (the harness already accepts `castAction`, `imprintAction`, `overrides` overrides — verify via `tests/integration/harness.ts`). For modal-fully-closed assertion, check `h.modal.containerEl.parentElement === null` after `super.close()` (mirrors the assertion style in `tests/integration/sentinel-detail.spec.ts` D5). For Refine override persistence, query the `overrides` instance passed in via the harness — M, ui-integration-tester

**senior-dev**
- [x] D1: in `src/ui/CommandPopup.ts`, add a public method `dismiss(): void { super.close(); }`. JSDoc explains it bypasses the close-override intercept for paths that need to fully dismiss the modal regardless of phase (today: only the Refine Options panel's Cast). Add a unit test in `tests/CommandPopup.test.ts` (new `describe('dismiss', ...)` block) asserting: from detail phase, calling `popup.dismiss()` causes `popup.containerEl.parentElement` to become `null` (modal removed); `interceptClose` on `DetailPhase` is **not** called (spy on the phase or assert via DOM state) — S, senior-dev (5ee1ca4)
- [x] D2: in `src/ui/CommandPopup.ts`, add private method `#renderRefineOptionsPanel(): void` per Interfaces. It mirrors the existing `#renderOptionsPanel(spell)` exactly, except: (a) `spell: refineSentinelSpell()` instead of the spell parameter; (b) `onCast: () => this.dismiss()` instead of `(snap) => this.#castAction(spell, snap)`. Reuse `SpellOptionsDetail`, `SUPPORTED_MODELS`, `this.#overrides`, `this.#sessionMap`, `this.#formDefaults`, `this.#enterDetail(detail, exit, { suspendKb: true })` — the existing infrastructure. Imports `refineSentinelSpell` from `../domain/spells/Spell`. No tests added in this todo — D5 covers the seam — S, senior-dev (ee4b6bb)
- [x] D3: in `#createSpellsPanel`, register two new event handlers: `panel.events.on('open-refine-options', () => this.#renderRefineOptionsPanel());` and `panel.events.on('dismiss-refine', () => this.close());`. Place them adjacent to the existing `'sentinel'` handler. The `'sentinel'` handler stays — Forge still routes through it. No tests added in this todo — D5 covers the seam — S, senior-dev (ee4b6bb)
- [x] D4: in `src/ui/CommandPopup.ts`, delete `#renderGenericSentinelDetail` entirely. Simplify `#renderSentinelDetail`: since the only remaining sentinel that routes through it is Forge, replace its body with the contents of `#renderForgeSentinelDetail` and delete the old `#renderForgeSentinelDetail` (or inline `#renderSentinelDetail` into the `'sentinel'` event handler — pick the form that minimizes diff and document the choice in commit message). Verify `npm run lint` passes (no unused-private-method warnings) and `npm test` + `npm run test:integration` are green except for `sentinel-detail.spec.ts` D4/D5 (those are updated in Section E). Document in the commit body that the generic-sentinel path is dead-code-deleted because the only caller (Refine via `#renderSentinelDetail`) was rerouted to `#renderRefineOptionsPanel` in D3 — M, senior-dev (eacd564)

### E. Update integration specs and live-specs that pinned the old Refine behavior

#### Section briefing

**What this section produces:** modified `tests/integration/sentinel-detail.spec.ts` — replace the two tests pinning the old Refine generic-detail behavior (D4 and D5) with two new tests pinning the new Refine behavior (Enter dismisses; ArrowRight opens Options panel — though the latter is already covered by D5 in Section D, so the integration spec for sentinel-detail can be reduced to a single Refine test for "Enter dismisses"). Modified `docs/features/command-popup-ui.md` — update the user-facing-behavior table rows for "Enter on Refine sentinel" and add "ArrowRight on Refine sentinel"; update the state-diagram detail-variants list to remove "Generic sentinel" and add "Refine sentinel options panel". Modified `docs/features/options-panel.md` — add a one-paragraph note on the Refine variant if the file is structurally amenable (verify file contents during the todo; if it does not exist, skip — `feature-documenter` will write it during a future `/spec` run).

**Design context the executor needs upfront:** Section D's behavior changes mean two existing integration tests (`tests/integration/sentinel-detail.spec.ts` D4, D5) now describe behavior that no longer exists. Updating them is in scope (Technical notes "Other notes" — they pin behavior the new feature explicitly changes). Live-spec drift on `docs/features/command-popup-ui.md` is in scope per the standard "Context management" trigger (changed user-facing behavior).

**Cross-section couplings:**
- E1 depends on D1–D4: the new Refine behavior must be live before its tests can pass.
- E2/E3 depend on D1–D4 the same way.

**Section-level Red criterion:** `npm run test:integration` is green (D4/D5 in `sentinel-detail.spec.ts` no longer fail because they now describe the new behavior). `docs/features/command-popup-ui.md` "User-facing behavior" table contains the two updated/new rows for Refine. Manual read-through confirms no doc still references "generic sentinel detail" or `<h2>Refine</h2>`. `npm run lint` green.

**junior-dev**
- [x] E1: edit `tests/integration/sentinel-detail.spec.ts`. Delete or rewrite tests `D4` and `D5` so that: (a) the test that previously asserted Enter on Refine renders `<h2>Refine</h2>` now asserts Enter on Refine fully closes the modal (`h.modal.containerEl.parentElement === null`) and `castAction` was not called; (b) the test that previously asserted close-from-Refine-detail routes through `interceptClose` is deleted (the scenario it pinned no longer exists — Refine no longer enters the generic-detail state). Keep tests `D2` and `D3` (Forge) unchanged. Run `npm run test:integration` and confirm green — S, junior-dev
- [x] E2: edit `docs/features/command-popup-ui.md` "User-facing behavior" table: change the row "`Enter` on Refine sentinel | Open generic detail (`<h2>` + `<p>Type: refine`)" to "`Enter` on Refine sentinel | Close the popup (no detail, no cast)". Add a new row "`ArrowRight` on Refine sentinel | Open the same options panel as for an authored spell (see `options-panel`); `Cast`/`Enter` inside dismisses the popup without dispatching". Update the state-diagram code block: remove the "Generic sentinel" detail-variant from the bottom box; add a "Refine sentinel options panel: kb.suspend(); SpellOptionsDetail mounted with onCast=dismiss()" line; remove the `Enter on Refine sentinel → renderGenericSentinelDetail(s)` arrow and replace with `Enter on Refine sentinel → close()` and `ArrowRight on Refine sentinel → renderRefineOptionsPanel()`. Update the Detail variants bullet list at the bottom of the doc to drop "Generic sentinel (Refine)" and add "Refine sentinel options panel" — S, junior-dev
- [x] E3: read `docs/features/options-panel.md` (if present); if it exists, add a one-paragraph subsection "Refine sentinel variant" stating: same panel, same fields, same keyboard, same snapshot semantics; differs only in (a) input is a synthetic `Spell` with `path = REFINE_SENTINEL_PATH`, and (b) `onCast` dismisses the popup rather than dispatching a cast. Cross-link to `command-popup-ui.md`. If the file does not exist, skip this todo — leave it for `feature-documenter` to address in a future `/spec` run; mark the todo done with a one-line commit message noting the deferral — S, junior-dev

## Overall effort summary

- **Total todos:** 14 (1 ui-integration-tester, 10 junior-dev, 3 senior-dev)
- **Effort distribution:** S × 13, M × 1
- **Tier distribution:** ui-integration-tester × 1, junior-dev × 10, senior-dev × 3, lead-dev × 0
- **Dominant tier:** junior-dev (~71%). Junior-dev handles the chip helper extraction (Section A), the synthetic-spell additions (Section B), the SpellsPanel event additions (Section C), and the docs/test fix-ups (Section E). Senior-dev owns the three CommandPopup changes that involve subtle judgment: introducing `dismiss()` (Key design decision §3) and the dead-code-deletion of `#renderGenericSentinelDetail` while preserving Forge behavior. The single ui-integration-tester todo (D5) owns the section-D Red criterion at the popup-level seam where the new Refine behavior is observable end-to-end.

## Dispatch

Section order: A → B → C → D → E. Within Section D, dispatch order is **ui-integration-tester (D5)** → **senior-dev (D1, D2, D3, D4)**. D5 writes the failing integration spec first; senior-dev then implements D1–D4 to make it green. All other sections are single-tier.

## Next

First todo: **A1** — create `src/ui/components/rowHint.ts` and a unit test for `appendRowHint`. Handoff to **junior-dev**.

reviewed @ cd4b23f
