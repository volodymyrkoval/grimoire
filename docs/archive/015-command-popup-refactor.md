# 015 — Command Popup Refactor

**Complexity:** Medium
**Kind:** Pure refactor — zero behavior change. Every existing test (unit + integration) must pass before and after each TDD cycle. No new features, no API changes visible to callers outside the popup/plugin boundary.

## Goal & scope

Eliminate the 11 validated design-audit violations in `src/main.ts` (177 lines) and `src/ui/CommandPopup.ts` (280 lines):

1. `CommandPopup` god class — 4 reasons to change (tab lifecycle, keyboard/phase machine, search state, detail orchestration).
2. `phase: "search" | "detail"` string flag drives 6+ branches — replace with polymorphic dispatch.
3. `phase` and `panels` downgraded to `private` (no `#`) with `eslint-disable no-restricted-syntax` — tests reach in via bracket notation. Restore `#` privacy once tests no longer require it.
4. Three `#render*` detail methods duplicate phase-swap + kb.suspend + exit-registration boilerplate.
5. `#renderGenericSentinelDetail` never registers `#activeDetail` — `.destroy()` never runs. Latent bug; **fixing it is part of the refactor, not a behavior change** (today the generic sentinel detail has nothing to destroy, so semantics are unchanged).
6. Feature Envy: `#createSpellsPanel`'s `cast` handler assembles `OptionsFormSnapshot` from `FormDefaults` inline — move to `OptionsFormSnapshot.fromDefaults(defaults, spell)`.
7. `closeRef = { close: () => {} }` mutable box in `main.ts` — temporal coupling; eliminate via construction-order swap.
8. `cast-log-local.jsonl` / `cast-log-remote.jsonl` / `cast-log-scratch` string literals appear in 3 methods of `main.ts` — Shotgun Surgery risk. Extract `PluginPaths` value object.
9. `GrimoirePlugin.onload` sliding toward god class — 8+ collaborators wired with implicit ordering. Extract `CastLogModule` and `PopupModule`.
10. `#createCommandPopup` takes 4 positional params and assembles a cyclic graph by hand — replace with `CommandPopupBuilder`.
11. Feature envy on `OptionsFormSnapshot` (covered jointly with #6).

**Out of scope:**
- Any behavior change visible from a test or end user.
- Rewriting `SpellsPanel`, `CastLogPanel`, `OptionsPanel`, `SpellOptionsDetail`, `ForgeSentinelDetail`, `CastDispatcher`, `ForgeImprinter`, `HookMaterializer`, `ScratchSweeper`. They are touched only where they consume new types (e.g. `CommandPopup` API).
- Test rewrites for the sake of taste. Existing tests are pinned contracts; the refactor must keep them green. We will **modify** test files only to drop `(popup as any).phase` / `(popup as any).panels` access once those fields become truly private — and only after equivalent observable assertions exist.
- Changing the public `CommandPopup` constructor signature. Builders construct it; the constructor accepts the same params object.

## Proposed solution

Five sequenced refactors, each one TDD cycle deep, ordered so each step lands on a green tree:

1. **`OptionsFormSnapshot.fromDefaults` factory** (smallest, frees up Priority 1's substep).
2. **`PluginPaths` value object** — pull literals out of `main.ts`. Localized, no cross-file risk.
3. **`closeRef` elimination** — construction-order swap in `main.ts`. Tight blast radius.
4. **State pattern + phase controller** — the big one. `PopupPhase` interface with `SearchPhase` / `DetailPhase` implementations; extract `#enterDetail`; fix the `#activeDetail` registration gap in the generic sentinel path. Restore `#phase` and `#panels` to true privacy.
5. **Composition modules + `CommandPopupBuilder`** — `CastLogModule`, `PopupModule`, builder. `onload` becomes a flat composition root.

Order rationale: 1 is independent and unblocks 4. 2 and 3 are independent low-risk wins. 4 is the largest refactor and depends on 1. 5 depends on 2 and 3 (it consumes `PluginPaths` and the post-`closeRef` API).

## Components

| Component | Location | Responsibility |
|---|---|---|
| `OptionsFormSnapshot` (existing type) + `optionsFormSnapshotFromDefaults` | `src/ui/options/OptionsFormState.ts` | Pure factory: build a default snapshot from `FormDefaults` + a `Spell`. |
| `PluginPaths` | `src/infra/PluginPaths.ts` (new) | Immutable value object owning `pluginDirAbs`, `localLogPath()`, `remoteLogPath()`, `scratchDir()`. Built once in `onload` from `manifest.dir` + `app.vault.configDir`. |
| `PopupPhase` (interface) | `src/ui/popup/PopupPhase.ts` (new) | Contract: `handleKey(key, ctx)`, `onClose()`, `confirm()`, `move(delta)`. |
| `SearchPhase` | `src/ui/popup/SearchPhase.ts` (new) | Implements `PopupPhase`. Owns search-phase behavior: TabBar enabled, arrow/Enter/Tab/ArrowRight wired. |
| `DetailPhase` | `src/ui/popup/DetailPhase.ts` (new) | Implements `PopupPhase`. Owns `#onDetailBack`, `#activeDetail`, kb suspend state. `onClose` runs back. |
| `CommandPopup` (slimmed) | `src/ui/CommandPopup.ts` | Holds `#currentPhase: PopupPhase`. Delegates keyboard, confirm, move, close to phase. Owns `#enterDetail(detail, onBack, opts)`. |
| `CastLogModule` | `src/main/CastLogModule.ts` (new) | Constructs both `CastLogStore`s, runs `HookMaterializer`, schedules `ScratchSweeper`, exposes `activeLogStore()` + `buildCastLogPanelDeps()`. |
| `PopupModule` | `src/main/PopupModule.ts` (new) | Owns `OptionsSessionMap`, `ForgeImprinter`. Exposes `register(plugin, ...)` and `openPopup()`. |
| `CommandPopupBuilder` | `src/ui/popup/CommandPopupBuilder.ts` (new) | Takes plugin context once, exposes `build(): CommandPopup`. Replaces `#createCommandPopup`'s positional params. |
| `GrimoirePlugin.onload` | `src/main.ts` | Flat composition root: build `PluginPaths`, build modules, register UI. |

## Interfaces

### `optionsFormSnapshotFromDefaults`

```ts
export function optionsFormSnapshotFromDefaults(
  defaults: FormDefaults,
  spell: Pick<Spell, 'executeOnNote'>,
): OptionsFormSnapshot
```

Returns: `{ model, effort, contextNotePaths: [], followUp: '', executeOnNote }`. Pure — no side effects, no mutation of `defaults`.

### `PluginPaths`

```ts
export class PluginPaths {
  constructor(pluginDir: string);
  pluginDirAbs(): string;        // normalizePath(pluginDir)
  localLogPath(): string;         // normalizePath(`${pluginDir}/cast-log-local.jsonl`)
  remoteLogPath(): string;        // normalizePath(`${pluginDir}/cast-log-remote.jsonl`)
  scratchDir(): string;           // normalizePath(`${pluginDir}/cast-log-scratch`)
}
```

Immutable. All methods return strings already normalized (callers no longer call `normalizePath` themselves).

### `PopupPhase`

```ts
export interface PopupPhase {
  readonly kind: 'search' | 'detail';   // retained as a discriminator so the close() override can still ask the phase "should super.close() proceed?"
  /** Returns true if the key was consumed. Mirrors KeyboardController contract. */
  handleArrow(delta: -1 | 1): boolean;
  handleEnter(): boolean;
  handleTab(): boolean;
  handleArrowRight(): boolean;
  /** Called when modal.close() runs. Returns true if the close should be intercepted (i.e. exit detail, do not call super.close). */
  interceptClose(): boolean;
}
```

`SearchPhase` returns `false` from `interceptClose()` (let `super.close()` run). `DetailPhase` returns `true` and triggers exitDetail.

Phase instances are constructed inside `CommandPopup` and receive a back-reference / context object so they can call into the popup's collaborators (panels, kb, contentEl). Avoid a cyclic `new SearchPhase(this)` smell by passing a focused `PopupPhaseContext` interface (an object literal exposing only the methods phases legitimately need).

### `CommandPopupBuilder`

```ts
export class CommandPopupBuilder {
  constructor(deps: {
    app: App;
    plugin: { data: GrimoireData; overrides: SpellOverrideStore };
    imprinter: ForgeImprinter;
    sessionMap: OptionsSessionMap;
    castLogPanelDeps: Omit<CastLogPanelDeps, 'openLink'>;
    createDispatcher: (close: () => void) => CastDispatcher;
  });
  build(): CommandPopup;
}
```

`build()` constructs the popup, then constructs the dispatcher passing `() => popup.close()` directly — no mutable box.

### `CastLogModule` / `PopupModule`

```ts
export class CastLogModule {
  constructor(deps: { app: App; paths: PluginPaths; getExecutionMode: () => 'local' | 'remote' });
  async initStartupMaintenance(): Promise<void>;       // runs HookMaterializer + ScratchSweeper
  activeLogStore(): CastLogWriter;
  buildCastLogPanelDeps(): Omit<CastLogPanelDeps, 'openLink'>;
}

export class PopupModule {
  constructor(deps: {
    app: App;
    getData: () => GrimoireData;
    overrides: SpellOverrideStore;
    castLog: CastLogModule;
  });
  register(plugin: Plugin): void;     // calls plugin.addCommand({ id: 'open-popup', ... })
}
```

## Data flow

No data flow changes. The phase delegation only relocates dispatch:

```
key event → KeyboardController → CommandPopup → currentPhase.handleX()
                                              → (phase decides; in detail, returns false / no-ops; in search, dispatches to panel)
```

`closeRef` removed:

```
before: closeRef = {close: noop} → dispatcher closure captures closeRef.close
                                 → popup constructed → closeRef.close = popup.close
after:  popup constructed first → dispatcher closure captures () => popup.close()
```

Both produce the same runtime behavior (popup.close invoked when dispatcher decides), but the post-state has no temporally-coupled mutable box.

## Error handling

No new error paths. The latent `#activeDetail` registration gap on the generic sentinel detail path is fixed silently: `DetailPhase` always tracks the active detail (or `null` if no destroyable detail exists). No new `throw`s; no logging changes.

## Key design decisions

1. **`PopupPhase.kind` discriminator retained.** A pure-OO purist would route `super.close()` decision through `interceptClose()` and avoid the discriminator — and we do. The `kind` is kept *only* so the (small number of) places that still ask "are we in detail?" (currently 1 — `close()` override, which we replace with `interceptClose()` anyway) can be removed in one cycle. After step D, `kind` is the only public discriminator; tests use it instead of bracket-notation `phase` access. **Trade-off:** keeps a string-typed surface, but trades a 6-branch switch for a 1-bit observable that exists purely for test pinning. Acceptable because the alternative (publishing a getter `isInDetail(): boolean`) is the same information with extra ceremony.

2. **Phase instances are per-popup-lifetime, not per-transition.** `SearchPhase` and `DetailPhase` are each constructed once in the popup constructor. Entering detail swaps `#currentPhase` from search → detail; exiting swaps it back. Detail state (`#onDetailBack`, `#activeDetail`) lives on the `DetailPhase` instance and is cleared on exit. Rationale: fewer allocations, simpler ownership, easier to spy/stub in tests.

3. **`PopupPhaseContext` is the seam, not `this`.** Phases never see `CommandPopup` directly. They see a `PopupPhaseContext` — a narrow interface exposing only `activePanel`, `selectedIndex` get/set, `searchQuery` get/set, `panels`, `kb`, `contentEl`, `enterDetail`, `exitDetail`, `renderSearch`. This is the SOLID/Interface-Segregation lever: phases stay testable in isolation; `CommandPopup` doesn't leak its internals.

4. **`closeRef` is replaceable because dispatcher's `close` is only invoked from `dispatch()`, not from a constructor.** The mutable box exists only because the cycle was constructed by hand. Building popup first → dispatcher second resolves it cleanly because `() => popup.close()` defers the lookup.

5. **`CommandPopupBuilder` is a builder, not a factory.** The plugin holds collaborators that the builder consumes once per popup-open. `build()` is called inside the command callback (per Ctrl+P invocation) so it picks up live `plugin.data.settings` references via thunks.

6. **`PluginPaths` is value-object, not service.** No I/O, no Obsidian deps in constructor. Takes a single `pluginDir` string. The plugin still computes that string from `manifest.dir ?? app.vault.configDir/plugins/grimoire`.

7. **Generic sentinel detail bug-fix is in scope and behavior-preserving.** Today `#activeDetail` is null on the generic path, so `.destroy()` is never called — but the generic detail also doesn't allocate anything that needs destroying (no kb registration, no coordinator, no listeners). After refactor, `DetailPhase` always sets `#activeDetail` (possibly to a no-op `{ destroy(){} }`). Runtime behavior unchanged.

## Design-patterns notes

Skill `design-patterns` Step 1 was run for each component. Outcomes:

- **State pattern** for `PopupPhase` — **applied.** Two states, clearly distinct behavior, currently driven by a string discriminator across 6+ branches. Textbook fit.
- **Strategy pattern** for `PopupPhase` — *considered, rejected:* search and detail are not interchangeable algorithms for the same caller-driven decision; they are mutually exclusive lifecycle states. State pattern is the correct generalization.
- **Builder pattern** for `CommandPopupBuilder` — **applied.** 7 collaborators wired into a cyclic graph; positional params are unreadable; builder is naturally invoked once per popup-open.
- **Factory method** for `optionsFormSnapshotFromDefaults` — **applied** as a plain factory function (not a static method on a class — the snapshot type is an interface, not a class). Avoids introducing a class just to host a static.
- **Value object** for `PluginPaths` — **applied.** Immutable, no identity, equality irrelevant.
- **Module / Facade** for `CastLogModule` and `PopupModule` — **applied.** Each owns a coherent slice of `onload` wiring.
- **Observer** — *considered, rejected:* the existing TypedEmitter-based event flow stays untouched. No new event sources warranted.
- **Decorator** for phase behavior — *considered, rejected:* phases are mutually exclusive, not stackable. State is the right pattern.
- **Mediator** for phase ↔ popup coordination — *considered, rejected:* the `PopupPhaseContext` interface (a focused port) is sufficient. A mediator would add a layer without separating concerns the interface doesn't already separate.

## Design-rubric (Section 7 self-critique)

- **Q: Does each component have one reason to change?** Yes. `SearchPhase` changes if search-phase keyboard behavior changes. `DetailPhase` changes if the detail lifecycle changes. `CommandPopup` changes if the modal lifecycle changes. `CastLogModule` changes if log-store wiring changes. `PopupModule` changes if popup composition changes. `PluginPaths` changes if path layout changes.
- **Q: Are dependencies pointed away from volatility?** Yes. Phases depend on a narrow `PopupPhaseContext` interface, not `CommandPopup`. `PluginPaths` depends on nothing. `CommandPopupBuilder` depends on collaborator interfaces, not concrete implementations of `CastDispatcher` etc. (we already inject via `createDispatcher`).
- **Q: Is the interface small enough that mocking it in tests is cheap?** `PopupPhase` has 5 methods, all returning `boolean`. `PopupPhaseContext` exposes ~8 members but they are all already public-ish via the existing bracket-notation tests, so this is a narrowing, not a widening.
- **Q: Are we creating abstractions that have only one implementation?** `PopupPhase` has two implementations from day one (`SearchPhase`, `DetailPhase`). `PluginPaths` has one — but it is a value object, not a service; YAGNI of an interface is correct. `CastLogModule` and `PopupModule` have one implementation each — they are modules, not interfaces, and exist for composition-root simplification, not polymorphism.
- **Q: What's the worst-case test for each public seam?** `optionsFormSnapshotFromDefaults` — pure function, trivially testable. `PluginPaths` — string equality. `PopupPhase` — fake `PopupPhaseContext`, drive keys, assert delegation. `CommandPopupBuilder` — spy on `CommandPopup` constructor, assert single param-object call. `CastLogModule` — already covered by the existing plugin.test.ts assertions on `CastLogStore` construction; equivalent assertions move to `CastLogModule.test.ts`.
- **Q: Is there any temporal coupling left?** No. `closeRef` was the only one. Phases are stateless w.r.t. ordering — entry/exit are explicit method calls.
- **Q: Could we cut any of this and still ship?** Step 4 (state pattern) is the highest-leverage step and could ship alone; steps 2, 3, 5 are independent localized cleanups. Step 1 is a precondition for the cleanest version of step 4 but step 4 could be done without it (with a duplicate-snapshot todo deferred). Recommendation: do all five, in the order given.

## UI integration tests

UI stack detected (`*.{ts}` files under `src/ui/`, Obsidian Modal-based UI, full integration harness at `tests/integration/`). Per the planner emission rule, `**ui-integration-tester**` tier groups are required for any section touching user-facing code.

**However**, this is a *pure refactor*. The existing integration suite (`tests/integration/*.spec.ts`) already pins the end-to-end behavior at the seam this refactor changes (`tests/integration/keyboard-suspend.spec.ts`, `tests/integration/sentinel-detail.spec.ts`, `tests/integration/options-panel-popup.spec.ts`, `tests/integration/tab-navigation.spec.ts`, `tests/integration/forge-sentinel-detail.spec.ts`, `tests/integration/spell-cast.spec.ts`). These are our integration safety net.

The refactor's correctness criterion is: **the existing integration suite remains green after every TDD cycle, with zero modifications to integration test files**. Any change to an integration spec is a red flag that the refactor altered observable behavior — abort and re-plan.

Per-section we therefore *do not* emit a fresh `**ui-integration-tester**` group writing new red tests; instead, **section D (state pattern) opens with a `**ui-integration-tester**` group whose sole todo is to run the existing integration suite and assert green before that section's dev work begins** — a baseline pin, not new tests. Sections A, B, C, E either don't touch user-facing keyboard/phase code (B, C, E are composition wiring) or don't change observable behavior (A is a pure refactor of an inline expression into a function).

This satisfies the emission rule and respects the "pure refactor" constraint.

---

## Todos

### A. `OptionsFormSnapshot.fromDefaults` factory

#### Section briefing

1. **What this section produces:** a new exported function `optionsFormSnapshotFromDefaults(defaults, spell)` in `src/ui/options/OptionsFormState.ts`; replaces the inline assembly in `CommandPopup.#createSpellsPanel`'s `cast` handler (see Interfaces).
2. **Design context the executor needs upfront:** from Key design decisions #1 — this is a Factory function, not a static method on a class, because `OptionsFormSnapshot` is an interface. Signature is pure: takes `FormDefaults` and `Pick<Spell, 'executeOnNote'>`, returns a fresh snapshot — no mutation, no side effects.
3. **Cross-section couplings:** D (state pattern) consumes this factory inside `SearchPhase.handleEnter` / spells-panel cast handler. A must land first so D can refer to a stable export.
4. **Section-level Red criterion:** a new unit test `tests/optionsFormSnapshotFromDefaults.test.ts` asserts the factory returns a snapshot with `model = defaults.defaultModel`, `effort = defaults.defaultEffort`, `contextNotePaths = []`, `followUp = ''`, `executeOnNote = spell.executeOnNote`. `tests/CommandPopup.test.ts` and all integration specs remain green after the inline assembly in `#createSpellsPanel` is replaced by a call to the factory.

**junior-dev**
- [x] A1: write a failing unit test in `tests/optionsFormSnapshotFromDefaults.test.ts` for the new factory: assert returned snapshot field-by-field for two cases (effort=`'medium'`, effort=`null`) and that `contextNotePaths` is a fresh empty array (not a shared reference) — S, junior-dev (842c92f)
- [x] A2: implement `optionsFormSnapshotFromDefaults` in `src/ui/options/OptionsFormState.ts` (same file as the interface it returns); export it alongside `OptionsFormSnapshot` — S, junior-dev (842c92f)
- [x] A3: replace the inline `const snapshot: OptionsFormSnapshot = { ... }` in `CommandPopup.#createSpellsPanel`'s `cast` handler (lines 144–152 of current `src/ui/CommandPopup.ts`) with a call to the new factory; run `npm test` and confirm green — S, junior-dev (7a9a01f)

### B. `PluginPaths` value object

#### Section briefing

1. **What this section produces:** a new file `src/infra/PluginPaths.ts` exporting `class PluginPaths` (immutable value object). Used in `src/main.ts` to replace all string literals for `cast-log-local.jsonl`, `cast-log-remote.jsonl`, `cast-log-scratch` and to centralize `normalizePath` calls (see Interfaces).
2. **Design context the executor needs upfront:** from Key design decisions #6 — `PluginPaths` is a value object, not a service. No I/O, no Obsidian deps in constructor. Takes one `pluginDir: string`. Methods return already-normalized strings; callers no longer call `normalizePath` directly.
3. **Cross-section couplings:** E (composition modules) depends on `PluginPaths` because `CastLogModule` accepts a `PluginPaths` in its constructor. B must land before E.
4. **Section-level Red criterion:** new unit test `tests/PluginPaths.test.ts` asserts the four methods return correctly-normalized strings for a sample `pluginDir`. `tests/plugin.test.ts` remains green (the `CastLogStore` getters and `HookMaterializer` getters and `ScratchSweeper` getter still receive functions returning the same strings as before).

**junior-dev**
- [x] B1: write a failing unit test in `tests/PluginPaths.test.ts`: construct `new PluginPaths('.obsidian/plugins/grimoire')` and assert `pluginDirAbs()`, `localLogPath()`, `remoteLogPath()`, `scratchDir()` each equal the expected normalized string (compare against `normalizePath` output for the four constants currently in `src/main.ts`) — S, junior-dev (0978e2c)
- [x] B2: implement `PluginPaths` in `src/infra/PluginPaths.ts` as documented in the Interfaces section; use `normalizePath` from `obsidian`; mark all four fields `#`-private — S, junior-dev (0978e2c)
- [x] B3: replace the three usages in `src/main.ts` (in `#initCastLog`, `#runStartupMaintenance`, `#buildCastLogPanelDeps`) with a single `#paths: PluginPaths` field constructed in `#initPluginDir`; thread it through each method; confirm `npm test` green — M, junior-dev (5e7e9da)

### C. Eliminate `closeRef` mutable box

#### Section briefing

1. **What this section produces:** `src/main.ts` `#openCommandPopup` no longer constructs a `closeRef = { close: () => {} }` box. Instead, the `CommandPopup` is constructed first; the `CastDispatcher` is constructed second with `close: () => popup.close()` capturing `popup` directly. `#createCommandPopup` and `#createDispatcher` signatures change to drop the `closeRef` parameter.
2. **Design context the executor needs upfront:** from Key design decisions #4 — the cyclic dependency can be broken because `dispatcher.close` is only invoked from `dispatcher.dispatch()`, never from construction. Constructing popup first then dispatcher works as long as the popup's `castAction` thunk captures `dispatcher` via closure, which it already does (the lambda passed as `castAction` resolves `dispatcher` lazily). Order: build popup with `castAction: (spell, snap) => dispatcher.dispatch(...)` referring to a `let dispatcher` declared above; build dispatcher second; assign.
3. **Cross-section couplings:** None. (E replaces both of these methods with the builder, but C is a valid intermediate state — E only lands after C.)
4. **Section-level Red criterion:** `tests/plugin.test.ts` "imprintAction closure calls ForgeImprinter.imprint with snapshot, settings, and a close fn" — the existing test that calls `closeFn()` and asserts `popupMock.close` was called — must remain green. Additionally, a new test in `tests/plugin.test.ts` asserts that `#openCommandPopup` does not construct any object with a mutable `close` field (grep-style assertion against the constructed dispatcher's `close` is harder; instead assert post-construction structural property: the dispatcher's close, when invoked, calls into the popup, with no intermediate empty-noop period).

**junior-dev**
- [x] C1: add a failing unit test in `tests/plugin.test.ts` (new `describe` block "C — close wiring") asserting: when `#openCommandPopup` runs, the captured dispatcher's `close` callback is *not* observably a no-op at any point — concretely, mock both `CommandPopup` and `CastDispatcher` constructors, capture the `close` passed to dispatcher, invoke it synchronously after the callback returns, and assert `popup.close` was called. Existing test "imprintAction closure" already covers this transitively; the new test pins the temporal property — S, junior-dev (b83fb72)
- [x] C2: refactor `#openCommandPopup` in `src/main.ts`: declare `let dispatcher: CastDispatcher`; construct `popup` first with `castAction: (spell, snap) => dispatcher.dispatch(...)`; construct `dispatcher` second with `close: () => popup.close()`; remove the `closeRef` box, remove its parameter from `#createDispatcher` and `#createCommandPopup`, remove the `// close is captured by reference …` comment. Confirm `npm test` green — M, senior-dev (f91ef54)

### D. State pattern + phase controller + `#enterDetail` + `#activeDetail` fix

#### Section briefing

1. **What this section produces:** new files `src/ui/popup/PopupPhase.ts` (interface + `PopupPhaseContext`), `src/ui/popup/SearchPhase.ts`, `src/ui/popup/DetailPhase.ts`. `src/ui/CommandPopup.ts` is rewritten to hold `#currentPhase: PopupPhase`, delegate keyboard and `close()` decisions through it, and own a single `#enterDetail(detail, onBack)` method centralizing the phase-swap + kb.suspend + exit-registration ritual. The `#renderForgeSentinelDetail`, `#renderOptionsPanel`, `#renderGenericSentinelDetail` methods all call `#enterDetail`. The `private` (non-`#`) declarations of `phase` and `panels`, with their `eslint-disable-next-line no-restricted-syntax` comments, are removed and replaced with `#` private fields once the test refactor in D6 lands.
2. **Design context the executor needs upfront:** from Key design decisions #1, #2, #3, #7 — `PopupPhase.kind` is retained as a `'search' | 'detail'` discriminator so tests can pin phase state without bracket-notation hacks. Phase instances are constructed *once* in the popup constructor (not per-transition). Phases see `CommandPopup` only through a narrow `PopupPhaseContext` interface. The `#activeDetail` registration gap on the generic sentinel detail path is closed by always assigning `#activeDetail` in `DetailPhase` (use a no-op `{ destroy(){} }` for paths with nothing to tear down) — behavior unchanged because the generic path has nothing to destroy today.
3. **Cross-section couplings:** D1 depends on A2 (uses `optionsFormSnapshotFromDefaults`). D's `**ui-integration-tester**` baseline pin must run before any dev work in D begins (it asserts the integration suite is green on the pre-D tree).
4. **Section-level Red criterion:** all of these are simultaneously green: (a) every existing test in `tests/CommandPopup.test.ts` passes, including the bracket-notation `(popup as any).phase === 'detail'` assertion in "open-options event switches phase to detail" — the new public `currentPhase.kind` shape must surface as `phase` on the popup for backward compatibility *or* the test is updated to read `(popup as any).currentPhase.kind` in the same commit; (b) every integration spec passes unchanged; (c) `src/ui/CommandPopup.ts` no longer contains `phase: "search" | "detail"`, no `eslint-disable no-restricted-syntax`, no duplicate phase-swap boilerplate in the three `#render*Detail` methods; (d) `npm run lint` passes; (e) new unit tests in `tests/SearchPhase.test.ts` and `tests/DetailPhase.test.ts` cover each phase's `handle*` methods against a fake `PopupPhaseContext`.

**ui-integration-tester**
- [x] D0: run `npm run test:integration` against the current (post-C) tree and confirm the entire suite passes; record the passing test count in the dev-agent handoff note. Do not write new integration tests — the existing suite is the pinned contract. If any spec is red, abort and re-plan — S, ui-integration-tester

**junior-dev**
- [x] D1: write failing unit tests in `tests/SearchPhase.test.ts`: construct `SearchPhase` with a fake `PopupPhaseContext` (object literal exposing `activePanel`, `panels`, `selectedIndex`, `kb`, etc. as spies); assert `handleArrow(1)` calls `ctx.activePanel.move(1, ...)` and `ctx.activePanel.updateSelection(...)`; `handleEnter` calls `ctx.activePanel.confirm`; `handleTab` advances `activePanel` round-robin; `handleArrowRight` calls `ctx.spellsPanel.openOptions` only when active panel is spells and selection is a spell row; `interceptClose` returns `false`. Tests fail because `SearchPhase` does not exist yet — S, junior-dev (751daad)
- [x] D2: write failing unit tests in `tests/DetailPhase.test.ts`: construct `DetailPhase` with a fake context; assert `handleArrow`, `handleEnter`, `handleTab`, `handleArrowRight` all return `false` (no-op); `interceptClose` returns `true` and invokes `ctx.exitDetail`. Tests fail because `DetailPhase` does not exist yet — S, junior-dev (751daad)
- [x] D3: implement `PopupPhase` interface and `PopupPhaseContext` interface in `src/ui/popup/PopupPhase.ts` per the Interfaces section. Both interfaces only — no classes yet. `npm run build` passes — S, junior-dev
- [x] D4: implement `SearchPhase` in `src/ui/popup/SearchPhase.ts` so D1 turns green. Constructor takes `PopupPhaseContext`. All methods consume only the context (no global state). Uses `isNavigable` guard from `src/ui/tabs/TabPanel.ts` exactly as today — S, junior-dev
- [x] D5: implement `DetailPhase` in `src/ui/popup/DetailPhase.ts` so D2 turns green. Holds `#onDetailBack` and `#activeDetail` fields; exposes `setActive(detail, onBack)` for `enterDetail` to call; `interceptClose` runs `onBack` and clears both fields. Both fields are `#` private — S, junior-dev

**senior-dev**
- [x] D6: rewrite `src/ui/CommandPopup.ts`: hold `#currentPhase: PopupPhase`, `#searchPhase: SearchPhase`, `#detailPhase: DetailPhase` constructed once in the constructor; build a `PopupPhaseContext` object exposing only the members phases need; rewire `#bindKeys` to call `this.#currentPhase.handleArrow / handleEnter / handleTab / handleArrowRight`; rewrite `close()` override to call `if (this.#currentPhase.interceptClose()) return; super.close();`; extract `#enterDetail(detail, onBack, opts: { suspendKb: boolean })` consolidating the phase-swap + kb.suspend + `#detailPhase.setActive` ritual; rewrite `#renderForgeSentinelDetail`, `#renderOptionsPanel`, `#renderGenericSentinelDetail` to all call `#enterDetail`, with the generic path passing `suspendKb: false` and a `{ destroy(){} }` no-op detail to close the `#activeDetail` gap; restore `phase` and `panels` to `#` private; remove both `eslint-disable-next-line no-restricted-syntax` comments. Update `tests/CommandPopup.test.ts` *only* to read `(popup as any).currentPhase.kind` instead of `(popup as any).phase` and `(popup as any).panels` access stays valid because `panels` becomes a `#` field exposed as a non-enumerable accessor for tests, OR — preferred — replace the four `(popup as any).panels` reads with calls to a new `tests/test-helpers/popupInternals.ts` helper that uses a public test seam. Choose the lighter approach; document choice in commit message. Run `npm test`, `npm run test:integration`, `npm run lint` — all green — L, senior-dev (52658ca)

### E. Composition modules + `CommandPopupBuilder`

#### Section briefing

1. **What this section produces:** new files `src/main/CastLogModule.ts`, `src/main/PopupModule.ts`, `src/ui/popup/CommandPopupBuilder.ts`. `src/main.ts` is reduced to a flat composition root: `onload` builds `PluginPaths`, builds `CastLogModule`, runs startup maintenance, builds `PopupModule`, registers the setting tab and command. The current `#initCore`, `#initPluginDir`, `#initCastLog`, `#runStartupMaintenance`, `#initImprinter`, `#registerUI`, `#openCommandPopup`, `#createDispatcher`, `#createCommandPopup`, `#buildCastLogPanelDeps` methods collapse into the modules and the builder.
2. **Design context the executor needs upfront:** from Key design decisions #5 and #6 — `CommandPopupBuilder` is called *inside the command callback*, not in `onload`, so each popup-open picks up the live `plugin.data.settings` references via thunks (matches existing test `command callback snapshots defaults from settings at the time the command fires`). `CastLogModule` runs `HookMaterializer` + `ScratchSweeper` in `initStartupMaintenance()`; the existing error-tolerance behavior (`HookMaterializer` rejection swallowed and logged) is preserved exactly.
3. **Cross-section couplings:** E2 depends on B (uses `PluginPaths`). E4 depends on C (post-`closeRef` API). E5 must not change any observable behavior pinned by `tests/plugin.test.ts` — every existing assertion (`HookMaterializer` constructed once, `ScratchSweeper` constructed once + `sweep()` called, both `CastLogStore` constructions with correct port shapes, `ForgeImprinter` caster thunk, `CastDispatcher` caster thunk, `optionsCastAction` is undefined, `imprintAction` close chain calls `popup.close()`, defaults snapshotted at callback time, settings mutation reflected in subsequent popups, `castLogPanelDeps` shape) must remain green.
4. **Section-level Red criterion:** `npm test` passes; `npm run test:integration` passes; `src/main.ts` reduces below 100 lines and `onload` body consists of: build paths, build castlog, run maintenance, build popup module, register setting tab, popup module registers command. No string literals for log files remain in `main.ts`. No `closeRef` remains. No `#create*` factory methods remain in `main.ts`.

**junior-dev**
- [x] E1: write a failing unit test in `tests/CastLogModule.test.ts` asserting: constructing `CastLogModule` with stub `app` + `paths` + `getExecutionMode` does not throw; `buildCastLogPanelDeps()` returns an object with `source`, `refresh`, `tick`, `now`; `activeLogStore()` returns the local store when `getExecutionMode()` returns `'local'` and the remote store when it returns `'remote'`; `initStartupMaintenance()` invokes `HookMaterializer.run` and `ScratchSweeper.sweep` exactly once each; `initStartupMaintenance()` resolves even when `HookMaterializer.run` rejects — M, junior-dev (fde93be)
- [x] E2: implement `CastLogModule` in `src/main/CastLogModule.ts` so E1 turns green. Internally constructs both `CastLogStore`s, `HookMaterializer`, `ScratchSweeper`, `CastLogSource`, `VaultRefreshCoordinator`, `IntervalTickCoordinator` — same construction details as today's `#initCastLog`, `#runStartupMaintenance`, `#buildCastLogPanelDeps`. Uses `PluginPaths` from section B for all path-derived getters — M, junior-dev (3e6c2d6)
- [x] E3: write a failing unit test in `tests/CommandPopupBuilder.test.ts` asserting: `new CommandPopupBuilder({...}).build()` calls the `CommandPopup` constructor exactly once with a single param object whose shape matches the current `tests/plugin.test.ts` "command callback constructs CommandPopup with …" assertions; the builder uses `createDispatcher(() => popup.close())` exactly once and the returned dispatcher is used to build the popup's `castAction` thunk — S, junior-dev (8fc01e4)
- [x] E4: implement `CommandPopupBuilder` in `src/ui/popup/CommandPopupBuilder.ts` so E3 turns green. Builds `CommandPopup` first; then builds dispatcher via injected factory passing `() => popup.close()`; wires `imprintAction` and `castAction` thunks. No mutable boxes — S, senior-dev

**senior-dev**
- [x] E5: implement `PopupModule` in `src/main/PopupModule.ts`. Owns `OptionsSessionMap`, constructs `ForgeImprinter` (with `caster: () => createCaster(getData().settings)` and `logWriter: () => castLog.activeLogStore()`), exposes `register(plugin: Plugin)` which calls `plugin.addCommand({ id: 'open-popup', name: 'Open spell browser', callback: () => this.#openPopup() })`. Inside `#openPopup`, constructs `CommandPopupBuilder` with all current dependencies (using a `createDispatcher` factory built from `getData`, `castLog`, `notify: msg => new Notice(msg)`) and calls `.build().open()`. Run `npm test` — `tests/plugin.test.ts` must remain entirely green — M, senior-dev (adf31ae)
- [x] E6: rewrite `src/main.ts` `onload` to use the new modules: build `PluginPaths`, build `CastLogModule`, `await castLog.initStartupMaintenance()` (preserving error-tolerance), build `PopupModule`, `addSettingTab`, `popupModule.register(this)`. Delete `#initCore` (inline), `#initPluginDir`, `#initCastLog`, `#runStartupMaintenance`, `#initImprinter`, `#registerUI`, `#openCommandPopup`, `#createDispatcher`, `#createCommandPopup`, `#buildCastLogPanelDeps`, `#activeLogStore`, `#localCastLogStore`, `#remoteCastLogStore`, `#pluginDir`. Keep public fields `data`, `saver`, `overrides`, public methods `save`, `onunload`. Run `npm test`, `npm run test:integration`, `npm run lint`, `npm run arch:check` — all green — L, senior-dev (cc716e2)

## Overall effort summary

- **Total todos:** 22 (1 ui-integration-tester, 17 junior-dev, 4 senior-dev)
- **Effort distribution:** S × 14, M × 6, L × 2
- **Tier distribution:** ui-integration-tester × 1, junior-dev × 17, senior-dev × 4, lead-dev × 0
- **Dominant tier:** junior-dev (77%). The bulk of this refactor is mechanical extraction once the design is set; senior-dev judgment is concentrated in C2 (temporal-coupling unwind), D6 (the state-pattern rewrite of `CommandPopup`), E5 (`PopupModule` construction), and E6 (the final `main.ts` rewrite). No lead-dev calls — there's no unknown root cause, no concurrency, no perf, no cross-module invariant beyond what's already pinned by tests.

## Next

First todo: **A1** — write a failing unit test for `optionsFormSnapshotFromDefaults` (`tests/optionsFormSnapshotFromDefaults.test.ts`). Handoff to **junior-dev**.

reviewed @ 986e858
