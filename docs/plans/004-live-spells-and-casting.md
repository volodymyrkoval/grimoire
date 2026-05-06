# 004 — Live spells: real casting on row activation

## Complexity

**Medium.** All cast machinery is already built and unit-tested (`CastDispatcher`, `CastRunner`, `CastSpawner`, `buildCastArgs`, `resolveCliBinary`). The remaining work is one small seam: replace the spell-row's "open detail" handler with "dispatch a cast", thread a `CastAction` from `main.ts` through `CommandPopup` (mirroring the existing `ImprintAction` pattern), and resolve the active note from the workspace at command-callback time. Plus one production-side tweak — `CastDispatcher` currently emits `'Casting…'`; the pitch is explicit that the toast must name the spell (`Casting '<name>'…`). One UI integration spec at the new seam, plus targeted unit-test updates for the dispatcher message change and a new `Workspace`/`getActiveFile` arm in the Obsidian mock.

No concurrency, no security surface, no cross-module invariant beyond the existing `vaultMountPath` env contract that already passes `CastRunner`'s tests.

## Goal & scope

Wire the Spell Picker so that clicking a spell row (mouse) or pressing `Enter` on the highlighted row dispatches a real cast against the currently active note, using the user's settings defaults for model and effort. Replace the current `'detail'` event semantics (which opens a placeholder detail view) for spell rows with a `'cast'` action. Sentinel rows are unchanged.

### In scope

- Rename the `SpellEvents` `detail` member to `cast` (its only consumer is `CommandPopup.renderDetail`, which is itself a placeholder shell — `<h2>` + Back button — with no real content). The event payload shape (`Spell`) is unchanged.
- `SpellsPanel.confirm(index)` emits `cast` (was `detail`) for spell rows. Sentinel branch unchanged.
- `SpellList.render` wires the spell-row click handler to emit `cast` (was `detail`).
- `CommandPopup` constructor accepts a new `castAction: CastAction` parameter (positional, last — same convention as `imprintAction` / `defaults` in 003). On `cast` event from `SpellsPanel`, the popup invokes `this.#castAction(spell)`. The popup does **not** also call `exitDetail()` — the `CastDispatcher` is responsible for `close()` (it always calls it, both on the no-active-note path and on the happy path). The popup's overridden `close()` already routes through `super.close()` because `phase === 'search'` at the moment of dispatch.
- `CastAction` is a new type alias: `(spell: Spell) => void`. The closure built in `main.ts` captures the `CastDispatcher`, the live `this.data.settings`, and the live `this.app.workspace` so that settings edits and active-file changes both take effect on the next cast.
- `main.ts` constructs **one** `CastDispatcher` per command invocation (cheaper alternative: per `onload`, see §1 of *Key design decisions*) wired with `notify: msg => new Notice(msg)` and `close: () => popup.close()`. The `castAction` closure resolves the active file via `this.app.workspace.getActiveFile()` and forwards its `.path` (or `null`) to `dispatcher.dispatch(...)`.
- `CastDispatcher.dispatch` is updated so the "Casting…" notice reads `Casting '<spell.name>'…` (single quotes around the name). One production line changes; one existing unit test updates; one new unit test pins the spell-name interpolation.
- The Obsidian mock gains `Workspace` with `getActiveFile()` (returns `TFile | null`) on `App`. The mock is extended in a backward-compatible way — existing tests that ignore `app.workspace` keep passing.
- `renderDetail(spell)` and the `detail` event handler are deleted from `CommandPopup` (the only call site disappears with the rename, and the placeholder `<h2>` + Back path is dead code per the pitch — there is no spell detail view planned).
- One UI integration spec (`tests/integration/spell-cast.spec.ts`) pins the popup → spell-row → `castAction` seam: clicking a row and pressing Enter on the highlighted row both invoke the stub action exactly once with the row's `Spell`. The popup remains in search phase (the action is fire-and-forget; the popup's own `close()` is driven by the `CastDispatcher`'s injected `close` in production, but the integration test stubs the action and asserts the action was called — it does not assert on `close()` because the stub does not call it).
- The existing `tests/integration/spell-detail.spec.ts` is **deleted** — the `detail` flow it pins is removed by this iteration. (See *Risks*: leaving it would make the suite red.)
- `tests/CommandPopup.test.ts` is updated to thread the new `castAction` constructor argument (default to `vi.fn()` in `makeApp`-style helpers). Any test asserting on `renderDetail` / Back-button interaction for spell rows is deleted.
- `tests/integration/harness.ts` `createPopupHarness` accepts an optional `castAction?: CastAction` and forwards it; defaults to `vi.fn()`.

### Out of scope

- **Per-spell options panel, ArrowRight to expand into options, model/effort overrides on the spell row.** Pitch is explicit: those belong to a later iteration.
- **`SpellOverrideStore` consumption.** The store exists and persists overrides, but this iteration does not read from it. Cast always uses `settings.defaultModel` and `settings.defaultEffort`. Documented in *Key design decisions §2*.
- **Context notes (`contextNotePaths`).** Pitch is explicit. Always passed as `[]`.
- **Follow-up text.** Pitch is explicit. Always passed as `''`.
- **Cast log integration / `castId` / streaming / cancel / retry.** Pitch is explicit. Only the toasts the dispatcher already emits (`Casting '<name>'…` / `Spell cast` / `Cast failed: <msg>` / `Open a note to cast against`).
- **Spell scanner / live-update choreography / Spell Picker integration with the scanner.** Already shipped in prior work — verified by `getSpells(app, tag)` already feeding `SpellsPanel`.
- **Real Obsidian end-to-end tests against a running vault.** Out of scope; the integration test stubs the action and the unit tests stub the runner.
- **Refactoring the frozen Cast PoC modules** (`src/cast/*` except for the one-line message change in `CastDispatcher`). Same convention as 002 / 003 — tests pin behaviour as committed; only the message string is in scope this iteration.
- **Validation UI** (e.g. inline notice when `vaultMountPath` is empty). The dispatcher already toasts `Cast failed: <stderrTail>` if the spawn fails. No duplicate path.
- **Workspace events (`active-leaf-change`)** to refresh the popup when the user switches notes between opening and confirming. The active file is resolved at confirm time, so the user experience is correct regardless of when they switched.

## Proposed solution

1. **Rename `SpellEvents.detail` → `cast`** and propagate through the two emitters and the one consumer (`CommandPopup`) in a single scaffolding section. No behavioural change in the rename itself — the popup's handler still calls the same `renderDetail` placeholder until Section D rewires it to `#castAction`. (Section B.)
2. **Tweak `CastDispatcher`'s notify message** to interpolate `spell.name`. One-line production change + one unit-test edit + one new unit-test case for the interpolation. Independent of the popup work. (Section A.)
3. **Extend the Obsidian mock** with `Workspace.getActiveFile()` so integration tests and unit tests of `main.ts` can pin the active-file resolution. Backward-compatible — existing tests ignore the new property. (Section C.)
4. **Write the integration test** (`tests/integration/spell-cast.spec.ts`) for the new seam: build a popup with a stub `castAction`, navigate to a spell row, click it (mouse), and separately press Enter on the highlighted row. Assert the stub was called once per interaction with the row's `Spell`. The test is RED until D2 / D3 land. (Section D, ui-integration-tester.)
5. **Wire the production seam** to make Section D green: add a `CastAction` type alias to `CommandPopup`, accept it in the constructor, replace the `cast` event handler from `renderDetail(spell)` to `this.#castAction(spell)`, and delete the now-dead `renderDetail` method + Back-button code path. Update `tests/integration/harness.ts` and `tests/CommandPopup.test.ts` to pass `vi.fn()` for the new argument. Delete `tests/integration/spell-detail.spec.ts` (the flow it pins is gone). (Section D, senior-dev.)
6. **Wire `main.ts`** to construct a `CastDispatcher` and supply the `castAction` closure that resolves the active file via `this.app.workspace.getActiveFile()` at submit time. Mirror 003's per-`onload` construction pattern. Add a small unit test in `tests/main.test.ts` that asserts the wiring (constructor-spy + closure invocation pattern, same shape as 003 §E2). (Section E.)

## Components

| Component | Location | Responsibility | Status |
|---|---|---|---|
| `SpellEvents` | `src/ui/SpellEvents.ts` | Type map: `cast: Spell` (was `detail: Spell`) + `sentinel: Sentinel` (unchanged) | MODIFIED |
| `SpellsPanel` | `src/ui/tabs/SpellsPanel.ts` | `confirm(index)` emits `cast` for spell rows (was `detail`) | MODIFIED |
| `SpellList` | `src/ui/components/SpellList.ts` | Row click handler emits `cast` (was `detail`) | MODIFIED |
| `CommandPopup` | `src/ui/CommandPopup.ts` | Accept `castAction: CastAction` in constructor; on `cast` event invoke `#castAction(spell)`; delete `renderDetail` + the spell-row Back path | MODIFIED |
| `CastDispatcher` | `src/cast/CastDispatcher.ts` | One-line change: `notify('Casting…')` → `notify(\`Casting '${spell.name}'…\`)` | MODIFIED (production message only) |
| `CastAction` (alias) | `src/ui/CommandPopup.ts` | `(spell: Spell) => void` — exported alias next to `ImprintAction` | NEW |
| `GrimoirePlugin` | `src/main.ts` | Construct `CastDispatcher` once at `onload`; build `castAction` closure resolving `this.app.workspace.getActiveFile()?.path ?? null` and `this.data.settings` at submit time; pass into `CommandPopup` | MODIFIED |
| Obsidian mock | `tests/__mocks__/obsidian.ts` | Add `Workspace` class with `getActiveFile = vi.fn(() => null)`; attach `workspace` to `App` | MODIFIED |
| Existing unit tests | `tests/CastDispatcher.test.ts`, `tests/CommandPopup.test.ts`, `tests/main.test.ts` | Updated for new dispatcher message, new constructor arg, new wiring | MODIFIED |
| Existing integration tests | `tests/integration/harness.ts`, `tests/integration/spell-detail.spec.ts` | `harness.ts` adds `castAction` option; `spell-detail.spec.ts` deleted | MODIFIED + DELETED |
| New unit test | `tests/main.test.ts` (extension) | Pins the cast-action closure wiring | MODIFIED |
| New integration test | `tests/integration/spell-cast.spec.ts` | Pins popup → spell-row → `castAction` seam | NEW |

## Interfaces

### `CastAction` (new alias)

```ts
// src/ui/CommandPopup.ts
import type { Spell } from '../domain/spells/Spell';

export type CastAction = (spell: Spell) => void;
```

The closure built in `main.ts` is responsible for capturing the dispatcher, the live settings, and the live workspace. The popup is callback-only — it does **not** know about `CastDispatcher`, `CastRunner`, settings, or `Notice`. Same separation as `ImprintAction`.

### `SpellEvents` (modified)

```ts
// src/ui/SpellEvents.ts
import type { Spell, Sentinel } from "../domain/spells/Spell";

export type SpellEvents = {
  cast: Spell;       // was: detail: Spell
  sentinel: Sentinel; // unchanged
};
```

The rename is mechanical. There is exactly one emitter per event and exactly one consumer per event:

- `cast` emitter: `SpellsPanel.confirm` (for index < filteredSpells.length) and `SpellList.render` (per-row click handler).
- `cast` consumer: `CommandPopup` constructor handler — was `(spell) => this.renderDetail(spell)`, becomes `(spell) => this.#castAction(spell)`.
- `sentinel` emitter / consumer: unchanged.

### `CommandPopup` (modified)

```ts
import type { CastAction } from '...'; // same file

export class CommandPopup extends Modal {
  constructor(
    app: App,
    spellTag: string,
    imprintAction: ImprintAction,
    castAction: CastAction,         // NEW — fourth positional arg, before defaults
    defaults: FormDefaults,
  );
  // ... unchanged below
}
```

- The constructor signature gains `castAction` as the **fourth** positional argument, before `defaults`. Existing callers (`main.ts`, `harness.ts`, `tests/CommandPopup.test.ts`, `tests/integration/forge-cast.spec.ts`) compile-fail on the old 4-arg shape until updated. Same "fail loudly" pattern as 003 §D3.
- `#castAction` is stored on a private field. The `cast` event handler in the constructor body becomes:
  ```ts
  spellsPanel.events.on("cast", (spell) => this.#castAction(spell));
  ```
- `renderDetail(spell: Spell): void` is deleted in its entirety (it was a placeholder: `<h2>` + Back button, no real content).
- The `#onDetailBack` field, the Back-button creation in `renderDetail`, and the `phase === 'detail'` branch that handled spell-detail close-override are unaffected — the **sentinel-detail** path still owns them. Only the spell-row branch loses its detail wiring.

### `CastDispatcher` (modified — message string only)

```ts
// before
this.#notify('Casting…');
// after
this.#notify(`Casting '${spell.name}'…`);
```

That is the only production change inside `src/cast/`. No structural change. The corresponding test edits live in `tests/CastDispatcher.test.ts`.

### `GrimoirePlugin` (modified)

```ts
// src/main.ts
import { Plugin, Notice } from 'obsidian';
import { CastDispatcher } from './cast/CastDispatcher';
import { CastRunner } from './cast/CastRunner';
import { CommandPopup } from './ui/CommandPopup';
import { ForgeImprinter } from './forge/ForgeImprinter';
// ... existing imports

async onload(): Promise<void> {
  // ... existing wiring (data, saver, overrides, settings tab, imprinter) unchanged ...

  this.addCommand({
    id: 'open-command-popup',
    name: 'Open Grimoire',
    callback: () => {
      const closeRef = { close: () => {} };
      const dispatcher = new CastDispatcher({
        notify: (msg) => { new Notice(msg); },
        close: () => closeRef.close(),
        castRunner: new CastRunner(),
      });
      const popup = new CommandPopup(
        this.app,
        this.data.settings.spellTag,
        (snapshot) => imprinter.imprint(snapshot, this.data.settings, () => closeRef.close()),
        (spell) => dispatcher.dispatch({
          spell,
          model: this.data.settings.defaultModel,
          effort: this.data.settings.defaultEffort,
          contextNotePaths: [],
          followUp: '',
          settings: this.data.settings,
          activeFilePath: this.app.workspace.getActiveFile()?.path ?? null,
        }),
        { defaultModel: this.data.settings.defaultModel, defaultEffort: this.data.settings.defaultEffort },
      );
      closeRef.close = () => popup.close();
      popup.open();
    },
  });
}
```

- `CastDispatcher` is constructed **inside** the command callback (per popup invocation), not once at `onload`. Reason: it captures `closeRef.close` which itself captures `popup` — the popup must exist before the dispatcher's `close` resolves. Re-instantiation is cheap (`CastDispatcher` is a thin coordinator class, no allocations of note). See *Key design decisions §1*.
- The closure dereferences `this.data.settings`, `this.app.workspace.getActiveFile()` on each invocation. Settings edits and active-file changes take effect immediately on the next cast.
- `CastRunner` is constructed per dispatcher (and per popup-open). This is acceptable — `CastRunner` is also a thin class with no per-instance state beyond a `CastSpawner`. Hoisting it to a singleton is a future optimization; YAGNI for now.
- The forge-imprinter wiring is **untouched**. Only the popup constructor signature gains a new positional argument; `imprinter`'s closure is unchanged.

### Obsidian mock (modified)

```ts
// tests/__mocks__/obsidian.ts
export class Workspace {
  getActiveFile = vi.fn<() => any>(() => null);
}

export class App {
  vault = { getMarkdownFiles: vi.fn<() => any[]>(() => []) };
  metadataCache = { getFileCache: vi.fn<(file: any) => any>(() => null) };
  workspace = new Workspace();   // NEW
}
```

- `getActiveFile()` returns `null` by default — matches "no active note" path. Tests that need an active file override per-test: `app.workspace.getActiveFile.mockReturnValue({ path: 'notes/active.md', basename: 'active' });`.
- The return type is `any` (matching the `getMarkdownFiles` mock's pattern) so tests can return either a `TFile` instance or a plain `{ path, basename }` shape. The production code in `main.ts` only reads `.path`, so the shape is uncontroversial.

## Data flow

```
main.ts (onload)
  │
  │  builds: imprinter once (unchanged)
  │
  │  on command "Open Grimoire":
  │    closeRef = { close: () => {} }
  │    dispatcher = new CastDispatcher({
  │      notify: msg => new Notice(msg),
  │      close: () => closeRef.close(),
  │      castRunner: new CastRunner()
  │    })
  │    popup = new CommandPopup(app, spellTag, imprintAction, castAction, defaults)
  │      where castAction = spell =>
  │        dispatcher.dispatch({
  │          spell,
  │          model: settings.defaultModel,
  │          effort: settings.defaultEffort,
  │          contextNotePaths: [],
  │          followUp: '',
  │          settings,
  │          activeFilePath: app.workspace.getActiveFile()?.path ?? null
  │        })
  │    closeRef.close = () => popup.close()
  │
  ▼
CommandPopup (Spells tab, Enter or click on a spell row)
  │
  │  SpellsPanel.confirm(index) → emit("cast", spell)
  │  ─OR─ SpellList per-row click handler → emit("cast", spell)
  │
  ▼
CommandPopup handler: this.#castAction(spell)
  │
  ▼
castAction(spell)  ──►  dispatcher.dispatch({ spell, ..., activeFilePath })
                          │
                          │  activeFilePath === null ?
                          │    yes → notify "Open a note to cast against" + close + return
                          │    no  →
                          │      notify "Casting '<spell.name>'…"
                          │      close()                      ── popup dismissed
                          │      CastRunner.run({ systemPromptFile: vaultMount/spell.path,
                          │                       userPrompt, modelId, effort, paths },
                          │                     { onSuccess, onFailure })
                          │         │
                          │         ▼
                          │      child process: claude --system-prompt-file <path> -p <prompt>
                          │         ▼
                          │      exit 0  → notify "Spell cast"
                          │      exit !=0 → notify "Cast failed: <stderrTail | exit N>"
```

## Error handling

- **No active note (`workspace.getActiveFile()` returns `null`).** `CastDispatcher.dispatch` already toasts `'Open a note to cast against'` and calls `close()`. **Tested in `CastDispatcher` unit tests** (existing `it('notifies "Open a note to cast against" and closes when activeFilePath is null')`). The integration test in Section D adds a third `it()` covering the same path through the popup with `app.workspace.getActiveFile.mockReturnValue(null)`.
- **Active note path is the spell file itself.** Edge case: the user has the spell open and casts it. The cast runs against the spell file as if it were the target — likely produces a no-op or unhelpful output, but does not crash. **Documented as a deferred edge case** — the pitch does not require a guard, and the friction would be felt only on first use. No special handling.
- **`vaultMountPath === ""` (unset settings).** `CastSpawner` treats empty cwd as "use process cwd"; `buildCastArgs` skips `--add-dir`. The cast may still succeed if Claude resolves the file; if it fails, `'Cast failed: <stderrTail>'` toast surfaces the cause. **Already tested in `CastSpawner` and `buildCastArgs` unit tests.** No new test required.
- **`defaultEffort === null` (Haiku-style settings).** `CastDispatcher.dispatch` forwards `null` directly to `CastRunner`, which forwards to `buildCastArgs`, which omits `--effort`. **Already tested.**
- **Spawn failure (binary missing, ENOENT, EACCES).** Same as 003: routed through `CastSpawner` → `CastRunner.onCastError` → `dispatcher`'s `onFailure` callback → toast `'Cast failed: <message>'`. **Already tested.**
- **Workspace mock missing in some test (regression risk).** The mock change makes `app.workspace` always present. Existing tests that destructure `app` and ignore `workspace` are unaffected. New tests that need an active file override `getActiveFile.mockReturnValue(...)`.
- **Multiple submits in quick succession (rapid Enter spam).** Each spell-row activation closes the popup. The popup's `close()` triggers `onClose` → `contentEl.empty()`, but Obsidian's modal close also unbinds the keyboard scope. A second Enter cannot fire because the modal is already closing. If the user re-opens and Enters again, that is a second independent cast. **Acceptable.** No locking.
- **Click on a row that has already been clicked (double-click).** First click closes the popup; the second click event fires on a detached DOM node and is a no-op (the click handler is closed over the popup's `#castAction`, but the popup's `close()` has already cleared `contentEl`). **Acceptable.** No new test.
- **Active file changes between popup-open and Enter.** The `getActiveFile()` call happens at confirm time inside the closure, so the cast targets whatever is active at that moment. **Acceptable** — matches user expectation (the toast shows what they activated, the file targeted is the file open right now).

## Edge cases — explicit decisions

Recorded in conversation, encoded as production behaviour or deferred:

1. **Empty input — no spells in the vault.** Already handled by prior live-update work: the spell list renders empty + Forge sentinel still visible. The cast-action path is unreachable when there are zero spell rows. **Confirmed deferred — no new behaviour.**
2. **Boundary — first-row Enter on popup open.** Default selection is index 0. If filtered spells are non-empty, the highlighted row is the first spell. Pressing Enter immediately on open dispatches that spell. **Confirmed in scope** — the integration test exercises this exact path.
3. **Concurrent invocation — two popups open simultaneously.** Obsidian only allows one modal at a time. Not reachable. **Deferred.**
4. **Upstream dependency failure — `CastRunner` throws synchronously.** The existing `CastRunner.spawnCast` catches sync spawner throws and routes to `onFailure`. **Already covered by 003's unit tests.**
5. **Invalid input at trust boundary — spell row click event with stale `Spell` reference.** The row click handler closes over the `Spell` object captured at render time. If the spell list re-renders (e.g. live-update fires) between render and click, the closure still holds a valid `Spell` value (immutable). **Acceptable.**
6. **Partial failure — `Notice` constructor throws.** Dispatcher's `notify` callback is the only consumer; if `new Notice(msg)` throws, the error propagates synchronously out of `dispatch()` and unwinds the spell-row click handler. The popup may not close in that case. **Deferred** — Obsidian's `Notice` constructor is documented as side-effect-only; we do not defensively try/catch.
7. **Order-of-operations — Enter on a row vs. Enter inside the search input.** The search input is the focused element on popup-open and after every render. `Enter` on the search input is captured by the popup's keyboard scope (`KeyboardController`), which calls `confirm(selectedIndex)` regardless of focus position. **Confirmed in scope** — this is the existing keyboard contract; no change.
8. **Mouse vs keyboard parity.** Both must dispatch (pitch requirement). The integration test has two `it()` blocks: one for click, one for Enter. **Confirmed in scope.**

## Key design decisions

1. **`CastDispatcher` constructed per popup-open, not per `onload`.** It captures `closeRef.close`, which captures `popup`, which is constructed per command callback. The cleanest closure ordering (`closeRef = {…}` first, then `dispatcher = new CastDispatcher(...)` referencing `closeRef`, then `popup = new CommandPopup(...)` referencing the dispatcher, then `closeRef.close = () => popup.close()`) requires the dispatcher to live inside the callback. Cost is negligible (allocation only). The alternative — hoisting `dispatcher` to `onload` and using a setter for `close` — adds a mutation step and a stale-reference risk between popup-opens. Per-callback construction is simpler and tracks the existing `closeRef` pattern from 003.
2. **Cast always uses `settings.defaultModel` / `settings.defaultEffort`.** `SpellOverrideStore` exists and persists per-spell overrides, but the pitch is explicit that the options panel is out of scope. Reading from the store now would couple this seam to a UI affordance that doesn't exist. When the options panel ships, the resolution becomes `spellOptionsResolver(spell, store, settings)` (already exists in `src/domain/settings/spellOptionsResolver.ts`). For now, the closure passes `defaultModel` / `defaultEffort` directly. Recorded as a deferred extension point.
3. **Active-file resolution lives in `main.ts`, not in the popup.** The popup deals in `Spell` objects only. Resolving `app.workspace.getActiveFile()` is a wiring concern — same layer that owns `data.settings` access. Keeps the popup pure (no `app.workspace` dependency beyond the existing `app.vault` for `getMarkdownFiles`) and keeps the integration test seam as `CastAction = (spell) => void`. The test does not need to mock the workspace.
4. **Event renamed `detail` → `cast`, not "kept as `detail` with new semantics".** Preserving the old name would mislead future readers — the `detail` name implies a navigation, not a side effect. The cost of the rename is mechanical (one type, two emitters, one consumer). The benefit is correctness of the type's name. Same reasoning as `ForgeFormData → ForgeFormSnapshot` in 003.
5. **`renderDetail` is deleted, not retained.** It was a placeholder (`<h2>` + Back button, no content) added in early scaffolding. With the spell-row event repurposed, the only remaining caller is gone. Dead code that lingers tends to mislead. The Forge-sentinel detail and Refine-sentinel detail paths remain untouched (different methods: `renderForgeSentinelDetail`, `renderGenericSentinelDetail`).
6. **`CastAction` is `(spell: Spell) => void`, not `(spell, options?) => void`.** Future per-spell options are out of scope. When they arrive, the callable becomes `(spell, options) => void` with a new closure shape; that's a one-line type change. Adding an optional parameter now (anticipating the future) is YAGNI and creates a second, useless test path.
7. **Notice message format `Casting '<spell.name>'…` (single quotes, ASCII ellipsis-or-`…`).** The pitch requests the spell name in the toast. The dispatcher's existing message used `Casting…` (UTF-8 horizontal ellipsis). Preserving the ellipsis style keeps consistency with the success/failure toasts. Single quotes around `spell.name` to disambiguate names that contain spaces. **Tested with a spell name containing a space** (`'Summoning Circle'`).
8. **No `imprintAction` change.** The forge wiring is untouched. The new `castAction` parameter is added between `imprintAction` and `defaults`. This forces every existing caller to update — desirable, since the type system is the only enforcement of "remember to pass the cast action".

## Patterns considered (per design-patterns Step 1)

| Pattern | Decision | Reason |
|---|---|---|
| Action / Command callable (`CastAction`) | **Adopted** | Mirrors `ImprintAction`; minimal seam; popup stays decoupled from dispatcher / settings / workspace. Step 3 self-critique: removing it would force the popup to import `CastDispatcher` and `App.workspace` directly, which is precisely the coupling we already removed for the Forge path. |
| Adapter for `Notice` → `notify` | **Adopted (already present)** | Same as 003; `CastDispatcher` already takes `notify` as a constructor dep. No new adapter; reuse the existing one in `main.ts`. |
| Strategy for swapping cast paths (forge vs. cast) | **Rejected** | Two action types (`ImprintAction`, `CastAction`) are clearer than a tagged union with a discriminator. The popup dispatches each event to its own handler at the constructor level — there is no shared code path to abstract. |
| Observer / event bus for "cast started / finished" | **Rejected** | `notify` is the only consumer today. The future Cast Log is a separate plan; introducing an event bus now would be a guess at its shape. |
| Builder for `CastDispatchInput` | **Rejected** | Built in exactly one place (the closure in `main.ts`); a builder would add ceremony with no second call site. |
| State machine for popup post-cast (Casting → Done → Idle) | **Rejected** | The popup closes synchronously on dispatch; there is no UI state to model. The toast lifecycle is owned by Obsidian. |
| Façade over `CastDispatcher` exposing only `(spell) => void` | **Considered, partial** | The `CastAction` closure **is** that façade — built once in `main.ts`, captured in the popup. No separate class. |

## Technical notes

- **Confirm the `spell.path` shape.** `getSpells(app, tag)` produces `{ name: file.basename, path: spellPath(file.path) }`. `file.path` is **vault-relative** (Obsidian convention). `CastDispatcher.dispatch` already builds `${vaultMountPath}/${spell.path}` for `systemPromptFile`. No change required.
- **`app.workspace.getActiveFile()` returns `TFile | null`.** Production `TFile` has `.path` and `.basename`. The mock's `TFile` matches. The closure reads `?.path ?? null`. No `instanceof` checks needed.
- **`Notice` mock from 003 is reused.** `Notice.instances` accumulates across tests; `beforeEach(() => { Notice.instances.length = 0; })` is the convention. The integration test in Section D **does not** assert on `Notice.instances` — the `castAction` is a stub and never invokes the real dispatcher. Notice assertions belong in the dispatcher unit test (already exist) and `main.ts` unit test (Section E2 covers the closure shape, not the toast).
- **`tests/CastDispatcher.test.ts` already exists with six `it()` blocks.** The "Casting…" message is asserted indirectly via `notifyFn.toHaveBeenCalledWith(...)` — verify by grep before editing. The change from `'Casting…'` to `\`Casting '${spell.name}'…\`` requires updating the existing assertions (the message is currently asserted as a constant — search for `'Casting…'` or `Casting…`).
- **Event rename touches three files in lockstep.** `SpellEvents.ts`, `SpellsPanel.ts`, `SpellList.ts`, `CommandPopup.ts`. TypeScript will fail compilation in B until all four are updated. Land them in one commit.
- **The integration test deletion (`spell-detail.spec.ts`)** must happen in the same commit as D2/D3 — leaving it would keep the suite red after the rename. The senior-dev todo D5 names this explicitly.
- **`tests/integration/forge-cast.spec.ts` constructor signature change.** It currently calls `new CommandPopup(app, 'spell', imprintAction, defaults)` — a 4-arg signature. After D3, the signature is 5-arg with `castAction` as the new fourth. Update the test's `createHarnessWithAction` to pass `vi.fn()` as the cast action. Same for `tests/integration/harness.ts`.
- **`tests/CommandPopup.test.ts` constructor signature change.** Same pattern as the integration tests. Search for `new CommandPopup(` and add `vi.fn()` as the new fourth argument.
- **Per-row click handlers in `SpellList.render`** capture the `spell` object by reference. The handler is `() => this.emitter.emit("cast", spell)`. The `cast` event has the same payload shape as the old `detail` event (`Spell`), so no consumer-side change beyond the rename.
- **`renderDetail` deletion footprint.** Search `CommandPopup.ts` for `renderDetail` and `#onDetailBack` — the field `#onDetailBack` and the override path inside `close()` are still needed for the **sentinel-detail** flow. Only the spell-detail handler `(spell) => this.renderDetail(spell)` and the method `renderDetail(spell: Spell): void` itself are deleted. Touch nothing else.
- **`tests/CommandPopup.test.ts` may have spell-detail tests** that the rename + deletion break. Grep for `renderDetail` and for tests that emit `'detail'`. Delete those tests; do not retrofit them. The sentinel-detail tests stay.

## Todos

### A. `CastDispatcher` notify message includes spell name

#### Section briefing

**What this section produces:** A one-line production change to `src/cast/CastDispatcher.ts` (the `'Casting…'` notify becomes `\`Casting '${spell.name}'…\``), plus the corresponding update to `tests/CastDispatcher.test.ts` (any existing `'Casting…'` assertion is updated, and one new `it()` covers a spell name with a space). No other production files touched. No mock changes.

**Design context the executor needs upfront:** From *Interfaces → `CastDispatcher` (modified — message string only)*: the change is exactly `this.#notify('Casting…')` → `this.#notify(\`Casting '${spell.name}'…\`)`. From *Out of scope*: the rest of `src/cast/` is frozen — only the message string changes this iteration. From *Key design decisions §7*: single quotes around `spell.name`; preserve the existing UTF-8 ellipsis for consistency with `Spell cast` / `Cast failed: ` toasts.

**Cross-section couplings:** None. This section is purely a dispatcher message change; D's integration test stubs the cast action and never reaches the dispatcher. E's `main.ts` unit test asserts wiring, not the dispatcher's notify content.

**Section-level Red criterion:** `tests/CastDispatcher.test.ts` contains at least one assertion of the new message format. Specifically: an `it()` constructs a dispatcher with notify spy, dispatches with `spell.name = 'Summoning Circle'`, and asserts `notifyFn` was called with `\"Casting 'Summoning Circle'…\"`. Running `npm test` shows this assertion green (and any prior `'Casting…'` assertion has been updated, not duplicated).

**junior-dev**

- [ ] A1: in `tests/CastDispatcher.test.ts`, locate every assertion that pins the constant `'Casting…'` (likely none today — the existing tests assert on the no-active-note path and the success/failure routing only; verify via grep). Add a new `it('notifies "Casting <name>…" with single-quoted spell name')` that constructs a dispatcher with notify spy, dispatches with `spell: { name: 'Summoning Circle', path: 'spells/summoning.md' } as Spell` and `activeFilePath: 'notes/active.md'`, and asserts `notifyFn` was called with the exact string `"Casting 'Summoning Circle'…"`. Use the same `GrimoireSettings` stub already used in the file. Run `npm test` — the test must FAIL because the production message is still `'Casting…'`. — S, junior-dev
- [ ] A2: in `src/cast/CastDispatcher.ts`, change the line `this.#notify('Casting…');` to `this.#notify(\`Casting '${spell.name}'…\`);`. Run `npm test` — A1 must now pass and no other test must regress. — S, junior-dev

### B. Rename `SpellEvents.detail` → `cast` (scaffolding, no behaviour change)

#### Section briefing

**What this section produces:** The event name change propagated through four files in lockstep: `src/ui/SpellEvents.ts` (type), `src/ui/tabs/SpellsPanel.ts` (emitter in `confirm`), `src/ui/components/SpellList.ts` (per-row click emitter), `src/ui/CommandPopup.ts` (consumer in constructor — temporarily still calls `this.renderDetail(spell)`; D2 swaps to `this.#castAction(spell)`). No new public exports. No test changes here — Section D rewrites the integration tests; Section A's tests are unaffected.

**Design context the executor needs upfront:** From *Interfaces → `SpellEvents` (modified)*: `cast: Spell` replaces `detail: Spell`; `sentinel: Sentinel` is unchanged. From *Key design decisions §4*: rename, do not retain. From *Technical notes*: TypeScript will fail compilation if the four files are not updated together — land them in one commit.

**Cross-section couplings:** B1 is a prerequisite for D2 (which rewires the consumer from `renderDetail` to `#castAction`). B1 must land before D2 / D3. The renames in `SpellsPanel.ts` and `SpellList.ts` make `tests/integration/spell-detail.spec.ts` red because that spec asserts on the old `detail` emission path — that file is **deleted** in D5, not in B. Until D5 lands, the suite is briefly red after B; D2/D3/D5 must commit in a tight sequence (single PR, single dev session).

**Section-level Red criterion:** `npm run build` and `npx tsc --noEmit` both pass. `SpellEvents` exports `cast: Spell` (not `detail`). `SpellsPanel.confirm` emits `'cast'` for spell-index branches. `SpellList.render`'s per-row `onClickEvent` emits `'cast'`. `CommandPopup`'s constructor handler reads `spellsPanel.events.on("cast", ...)`. The unit test suite (`npm test`) still passes because no unit test asserts on the literal event name `'detail'` (verify via grep). The integration suite (`npm run test:integration`) **may be temporarily red** on `spell-detail.spec.ts` — that file is removed in D5.

**junior-dev**

- [ ] B1: in `src/ui/SpellEvents.ts`, rename the type-map member `detail: Spell` to `cast: Spell`. In `src/ui/tabs/SpellsPanel.ts`, change `this.events.emit("detail", spell)` to `this.events.emit("cast", spell)`. In `src/ui/components/SpellList.ts`, change `row.el.onClickEvent(() => this.emitter.emit("detail", spell))` to `row.el.onClickEvent(() => this.emitter.emit("cast", spell))`. In `src/ui/CommandPopup.ts`, change `spellsPanel.events.on("detail", (spell) => this.renderDetail(spell))` to `spellsPanel.events.on("cast", (spell) => this.renderDetail(spell))`. Do **not** delete `renderDetail` here — D2 owns that. Verify via `npx tsc --noEmit` and `npm run lint`. — S, junior-dev

### C. Extend Obsidian mock with `Workspace.getActiveFile`

#### Section briefing

**What this section produces:** A new `Workspace` class added to `tests/__mocks__/obsidian.ts` (constructor-free, exposes `getActiveFile = vi.fn(() => null)`), and `App` is extended to instantiate `workspace = new Workspace()` in its property initializer. No source changes. No test changes — Sections D and E are the consumers.

**Design context the executor needs upfront:** From *Interfaces → Obsidian mock (modified)*: the default return is `null` (matches "no active note"); tests override per-test via `app.workspace.getActiveFile.mockReturnValue({ path: 'notes/active.md', basename: 'active' })`. From *Technical notes*: the return type is `any` so tests can pass either a `TFile` or a plain `{ path, basename }`. Production code reads `.path` only.

**Cross-section couplings:** C1 unblocks E1 (which calls `this.app.workspace.getActiveFile()` in `main.ts`) and E2 (which asserts on `getActiveFile` being called). C1 also unblocks D0's "no active note" `it()` block, which sets the workspace mock to return `null` and asserts the cast-action stub is invoked with the spell anyway (the stub does not call the real dispatcher). C1 must land before D0 and E1.

**Section-level Red criterion:** `tests/__mocks__/obsidian.ts` exports a `Workspace` class with `getActiveFile` as a `vi.fn`. `App` instances have `app.workspace` set. Running `npm test` and `npm run test:integration` shows no regression (no existing test references `app.workspace`, so this is a pure additive change).

**junior-dev**

- [ ] C1: add `export class Workspace { getActiveFile = vi.fn<() => any>(() => null); }` to `tests/__mocks__/obsidian.ts`. Add `workspace = new Workspace();` as a property initializer on the `App` class. Run `npm test` and `npm run test:integration` — both must remain green (no test asserts on `app.workspace` yet). — S, junior-dev

### D. Wire popup → spell-row → `castAction` seam

#### Section briefing

**What this section produces:** The integration test (D0) that pins the new seam, and the production wiring that makes it green. Files touched: `tests/integration/spell-cast.spec.ts` (new); `src/ui/CommandPopup.ts` (add `CastAction` alias, fourth constructor arg, swap event handler, delete `renderDetail`); `tests/integration/harness.ts` (add `castAction` option to `createPopupHarness`); `tests/integration/forge-cast.spec.ts` (constructor signature update — add `vi.fn()` for cast action); `tests/CommandPopup.test.ts` (constructor signature update); `tests/integration/spell-detail.spec.ts` (deleted).

**Design context the executor needs upfront:** From *Interfaces → `CommandPopup` (modified)*: `castAction` is the **fourth** positional argument, **before** `defaults`. From *Key design decisions §3*: active-file resolution lives in `main.ts`, not the popup — the test does not mock the workspace. From *§5*: `renderDetail` is deleted entirely. From *§8*: every existing caller of `new CommandPopup(...)` must be updated to pass the new argument; TypeScript enforces this. From *Technical notes*: the `#onDetailBack` field and the `close()` override are unchanged because the **sentinel-detail** flow still needs them.

**Cross-section couplings:** D0 depends on C1 (workspace mock so the harness `app` has `workspace` even though D0's stub action does not call the dispatcher). D1/D2/D3 depend on B1 (event rename). D4 depends on D3 (constructor change must propagate to `harness.ts`, `tests/CommandPopup.test.ts`, `tests/integration/forge-cast.spec.ts`). D5 deletes `tests/integration/spell-detail.spec.ts` — must land in the same commit as D2 to keep the integration suite green.

**Section-level Red criterion:** `tests/integration/spell-cast.spec.ts` exists with at least three `it()` blocks: (1) clicking the first spell row invokes the stub `castAction` exactly once with that row's `Spell` (assert via `vi.fn().mock.calls[0][0]` shape — `name`, `path`); (2) pressing `Enter` while the first spell row is highlighted invokes the stub `castAction` exactly once with that row's `Spell`; (3) navigating with `ArrowDown` once and pressing `Enter` invokes the stub with the **second** spell row's `Spell` (proves selectedIndex tracking). All three tests fail before D2/D3 (constructor missing the fourth arg + event handler still calling `renderDetail`) and pass after. The forge-cast integration test still passes (its constructor call is updated in D4).

**ui-integration-tester**

- [ ] D0: write `tests/integration/spell-cast.spec.ts` containing the three `it()` blocks specified in the Red criterion. Use the existing `createPopupHarness({ castAction })` (extended in D4) so the test reads at the same level as `forge-cast.spec.ts`. The stub `castAction` is `vi.fn()`; assert call count, that the call arg has shape `{ name, path }` (compare against the harness's `testFiles` definitions — first spell is `Banishment Hex` after sort, since `harness.ts` sorts by name; verify by reading the harness or by sorting `testFiles` in the test setup). Use `harness.clickRow(0)` for the click case and `harness.pressKey('Enter')` for the keyboard case. Do **not** assert anything below the `castAction` boundary (no `Notice`, no `CastDispatcher`, no spawn). Set `app.workspace.getActiveFile.mockReturnValue(null)` in one of the tests to demonstrate the workspace-mock plumbing is in place — but assert only on the stub action's call args, not on the dispatcher's behaviour. — M, ui-integration-tester

**senior-dev**

- [ ] D1: in `src/ui/CommandPopup.ts`, declare `export type CastAction = (spell: Spell) => void;` next to `ImprintAction`. Import `Spell` from `../domain/spells/Spell` (the file already imports `Spell` for `renderDetail`'s parameter; the import line stays). — S, senior-dev
- [ ] D2: in `src/ui/CommandPopup.ts`, change the constructor signature to `constructor(app: App, spellTag: string, imprintAction: ImprintAction, castAction: CastAction, defaults: FormDefaults)`. Store `castAction` on a private `#castAction` field. Change the spell-event handler from `(spell) => this.renderDetail(spell)` to `(spell) => this.#castAction(spell)`. **Delete** the `renderDetail` method entirely (lines that build `<h2>` + Back button for spell rows). Do **not** touch `renderForgeSentinelDetail`, `renderGenericSentinelDetail`, or the `#onDetailBack` field — those serve the sentinel-detail flow which is unchanged. — M, senior-dev
- [ ] D3: extend `tests/integration/harness.ts` `createPopupHarness()` options object to accept an optional `castAction?: CastAction` (default `vi.fn()`). Update the `new CommandPopup(...)` call in the harness to pass `castAction` as the fourth argument and `defaults` as the fifth. Import `CastAction` from `src/ui/CommandPopup`. The existing `submitForge` and other harness methods are untouched. — S, senior-dev
- [ ] D4: update `tests/integration/forge-cast.spec.ts` `createHarnessWithAction` to construct `CommandPopup` with the new 5-arg signature: pass `vi.fn()` as the cast action between `imprintAction` and `defaults`. Update `tests/CommandPopup.test.ts`: every `new CommandPopup(...)` call site adds `vi.fn()` as the fourth argument (the existing `installFakeScope`/`makeApp` helpers are the only places to touch — search for `new CommandPopup(` and add the arg). Delete any test in `tests/CommandPopup.test.ts` that asserts on `renderDetail` behaviour (specifically: tests that emit `'detail'` from a stubbed `SpellsPanel`, or tests that look for the `<h2>` + Back button DOM after a spell-row click — grep for `renderDetail`, `← Back`, and `'detail'`). Sentinel-detail tests remain. — M, senior-dev
- [ ] D5: delete `tests/integration/spell-detail.spec.ts` entirely. Run `npm run test:integration` — the suite must be green. Run `npm test` — the unit suite must be green. — S, senior-dev

### E. Wire `main.ts` to construct the dispatcher and supply the cast action

#### Section briefing

**What this section produces:** `src/main.ts` constructs a `CastDispatcher` per command-callback invocation, builds a `castAction` closure that reads `this.data.settings` and `this.app.workspace.getActiveFile()?.path ?? null` at call time, and passes both that closure and the existing `imprintAction` into the `CommandPopup` constructor. New unit tests in `tests/main.test.ts` verify the wiring: (1) the popup is constructed with five positional args; (2) invoking the captured `castAction` with a stub spell calls a stubbed `dispatcher.dispatch` with the expected input shape; (3) mutating `data.settings.defaultModel` between command-callback invocations produces popups whose cast actions dispatch with the corresponding model, proving the closure dereferences settings at call time.

**Design context the executor needs upfront:** From *Interfaces → `GrimoirePlugin` (modified)*: the dispatcher is constructed inside the command callback, after `closeRef = { close: () => {} }` and before `popup = new CommandPopup(...)`; `closeRef.close` is then assigned to `() => popup.close()`. From *Key design decisions §1*: per-callback dispatcher construction is deliberate. From *§2*: the closure passes `defaultModel` / `defaultEffort` directly — `SpellOverrideStore` is **not** read this iteration. From *§3*: the active-file resolution is inline in the closure: `this.app.workspace.getActiveFile()?.path ?? null`. From *Technical notes*: `Notice` mock from 003 is reused; `Workspace` mock added in C1.

**Cross-section couplings:** E1 depends on B1 (event rename — without it the spell-row event handler in `CommandPopup` does not invoke `#castAction`). E1 depends on C1 (workspace mock). E1 depends on D2/D3 (new `CommandPopup` constructor signature). E2 depends on E1.

**Section-level Red criterion:** `src/main.ts` imports `CastDispatcher`. The `addCommand` callback constructs `closeRef`, `dispatcher`, `popup` (in that order), assigns `closeRef.close = () => popup.close()`, and calls `popup.open()`. `tests/main.test.ts` contains three new `it()` blocks: (1) "constructs popup with five positional args" — spies on the `CommandPopup` constructor via `vi.spyOn` on the module export; (2) "cast action dispatches with current settings" — captures the fourth constructor arg, stubs `CastDispatcher.prototype.dispatch`, invokes the captured action with a stub spell, asserts `dispatch` was called once with `{ spell, model: settings.defaultModel, effort: settings.defaultEffort, contextNotePaths: [], followUp: '', settings, activeFilePath: <mocked> }`; (3) "settings mutation is reflected in subsequent popups" — invokes the command callback twice with `data.settings.defaultModel` mutated between calls, asserts both popups' captured cast actions dispatch with the corresponding model. All three tests pass.

**senior-dev**

- [ ] E1: modify `src/main.ts` per *Interfaces → `GrimoirePlugin` (modified)*. Inside the existing `addCommand` callback (the `imprinter` line at the top of `onload` is unchanged), construct `closeRef`, then `const dispatcher = new CastDispatcher({ notify: (msg) => { new Notice(msg); }, close: () => closeRef.close(), castRunner: new CastRunner() })`, then `popup = new CommandPopup(...)` with the **five** positional args: `app`, `spellTag`, the existing imprint closure, the new cast closure `(spell) => dispatcher.dispatch({ spell, model: this.data.settings.defaultModel, effort: this.data.settings.defaultEffort, contextNotePaths: [], followUp: '', settings: this.data.settings, activeFilePath: this.app.workspace.getActiveFile()?.path ?? null })`, and the existing `defaults` object. Then `closeRef.close = () => popup.close()`. Imports needed: `CastDispatcher` from `./cast/CastDispatcher`. `CastRunner` is already imported. — M, senior-dev
- [ ] E2: extend `tests/main.test.ts` with three `it()` blocks per the Section-level Red criterion. Use `vi.spyOn(CommandPopupModule, 'CommandPopup')` (or restructure to spy on the constructor — pattern-match the 003 E2 test for `imprintAction`). For (2) and (3), stub `CastDispatcher.prototype.dispatch` via `vi.spyOn(CastDispatcher.prototype, 'dispatch').mockImplementation(() => {})` so the real dispatcher does not reach `CastRunner`. Set `app.workspace.getActiveFile.mockReturnValue({ path: 'notes/active.md', basename: 'active' })` to give a non-null `activeFilePath` in the dispatch input assertion. Reset all mocks in `beforeEach`. — M, senior-dev

## Verification

- `npm test` passes — `tests/CastDispatcher.test.ts` (with A1's new assertion + A2's production change), `tests/CommandPopup.test.ts` (with D4's signature update + dead-test removal), `tests/main.test.ts` (with E2's new wiring tests), and all other unit tests are green.
- `npm run test:integration` passes — `tests/integration/spell-cast.spec.ts` (D0's new file) is green; `tests/integration/forge-cast.spec.ts` (with D4's signature update) is green; `tests/integration/spell-detail.spec.ts` is **deleted** (D5).
- `npm run lint` clean.
- `npm run build` clean.
- `npx tsc --noEmit` clean.
- Manual sanity check (optional, not gated): with a configured Obsidian vault, opening the popup, navigating to a spell with `ArrowUp`/`ArrowDown`, and pressing Enter (or clicking the row) produces a visible `Casting '<name>'…` toast and (if the CLI binary resolves) eventually a `Spell cast` or `Cast failed: ...` toast. With no note open, the same action produces `Open a note to cast against`.

## Risks

- **The `tests/integration/spell-detail.spec.ts` deletion is destructive.** If the file is preserved by accident, the integration suite goes red on every CI run. Mitigation: D5 is an explicit todo, dependent on D2 in the same commit. The "junior temptation" is to retrofit the tests; resist — the flow is gone.
- **Active-file resolution is inline in the closure, not a helper.** The line `this.app.workspace.getActiveFile()?.path ?? null` appears once. If a future iteration needs the same resolution elsewhere (e.g. context-notes panel), extract a helper at that point. YAGNI for now.
- **Per-popup-open `CastDispatcher` allocation.** Cheap, but if profiling later flags it, the dispatcher can be hoisted to `onload` with a setter for `close`. No measured impact today.
- **Two `Notice` instances per cast in error paths.** The dispatcher toasts `Casting '<name>'…` first, then on failure `Cast failed: <msg>`. The first toast is still visible when the second fires; Obsidian's `Notice` queue handles this gracefully. Same as 003's Forge flow.
- **Click-handler closure captures `Spell` by reference at render time.** If the spell list re-renders between render and click (e.g. live-update), the captured `Spell` is from the previous render. The captured object is immutable and still valid; the only risk is the user thought they clicked a different (newly-rendered) row. Acceptable today; revisit if live-updates cause user confusion.
- **`getActiveFile()` is called on every cast.** No caching, no memoization. Obsidian's implementation is cheap (it returns the workspace's active leaf's file). No mitigation required.

## Effort summary

- Total: **9 todos** — S: 6, M: 3, L: 0
- Tier mix: junior-dev 3, senior-dev 5, ui-integration-tester 1, lead-dev 0
- Section breakdown: A (2 dispatcher-message todos, junior), B (1 event-rename todo, junior), C (1 mock-extension todo, junior), D (1 tester + 4 senior wiring), E (2 senior wiring)
- Dominant tier: **senior-dev** for the actual seam wiring (D1–D5, E1–E2). The seam decisions are closed in this plan, but each touches multiple files and one cross-section coupling (B+C+D5+E1 must commit in a tight sequence to avoid red intermediate states). Junior-dev concentrates in the additive A/B/C work that has no cross-section coupling.
