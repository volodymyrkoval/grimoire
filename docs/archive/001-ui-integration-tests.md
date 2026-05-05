# 001 — UI Integration Tests

## Goal & scope

Pin the existing `src/ui/` behavior with a thorough integration-test suite **before** business logic is layered on. Tests live at the `CommandPopup` ↔ panels ↔ detail-component seam. They must not touch the real Obsidian runtime — the `obsidian` package is mocked (DOM is real, via happy-dom).

The current behavior we are pinning is exactly the behavior produced by the code at HEAD; tests are descriptive, not prescriptive. If a behavior here looks wrong, we still pin it — refactor later, don't smuggle a fix in via test edits.

**In scope**

- Test harness: real DOM (happy-dom) + targeted `obsidian` mock that preserves element identity and makes `Scope.register` invocable (so we can dispatch keys).
- Integration suite covering the ten user-listed behaviors (Escape navigation, list↔detail transitions, Tab cycling, TabBar click, SearchInput wiring, selection memory, keyboard suspend/resume, modal lifecycle).
- One focused component test for `ForgeSentinelDetail` (input focus, submit payload) since it owns its own keyboard scope.
- New `.claude/integration-test-cmd` so `/done` can run the integration suite.

**Out of scope**

- Refactoring any production code under `src/`. If a test needs a seam, add the seam in a follow-up plan — do not add it here.
- Mutation testing of the new tests (Stryker pass is a separate cycle).
- Real-Obsidian end-to-end tests (would need a running vault).
- Visual / CSS / layout assertions beyond class-list state (`is-selected`, `is-active`, `is-disabled`, `is-expanded`).
- LogsPanel internals beyond what's reachable through the popup integration (no LogList unit tests in this plan).

## Complexity

**Medium.** Single subsystem (UI), but the harness work is non-trivial: the existing `obsidian` mock returns fresh element instances on every call (identity is not preserved), so DOM-state assertions are impossible without rebuilding it. Once the harness is right, the tests themselves are mechanical.

## Proposed solution

Two layers, dispatched in order.

1. **Harness (Section A).** Switch the integration tests to a happy-dom environment, polyfill Obsidian's element-extension API (`createEl`, `createDiv`, `createSpan`, `addClass`, `removeClass`, `hasClass`, `toggleClass`, `setText`, `setAttr`, `onClickEvent`, `empty`) onto `HTMLElement.prototype` for tests, and replace `tests/__mocks__/obsidian.ts` with a richer mock whose `Scope.register` keeps a callable registry keyed by `(modifiers, key)`. Provide a small test driver (`createPopupHarness`) that opens the modal, mounts `contentEl` into a real DOM body, and exposes typed helpers: `pressKey(key, mods?)`, `type(text)`, `clickTab(id)`, `clickRow(index)`, `clickBack()`, `submitForge()`. Drop a separate `vitest.integration.config.ts` so unit tests stay node-only.
2. **Tests (Sections B–F).** Five tester-only sections, each opening with a `**ui-integration-tester**` group. The harness from Section A is the only seam test code touches; production code is untouched.

The split is deliberate: harness scaffolding is mechanical (junior-dev), the tests are integration assertions that own the Red criterion (ui-integration-tester). No senior-dev or lead-dev work is anticipated — there are no design questions, only behavior to pin.

## Components

| Component | Responsibility | Location |
|---|---|---|
| `tests/__mocks__/obsidian.ts` | Mock `App`, `Modal`, `Scope` with real-DOM-backed `contentEl` and a callable `Scope.register` registry. | `tests/__mocks__/obsidian.ts` (rewrite) |
| `tests/integration/setup.ts` | Polyfill Obsidian element-extension methods onto `HTMLElement.prototype` for the integration suite. | `tests/integration/setup.ts` (new) |
| `tests/integration/harness.ts` | `createPopupHarness(app?)` — opens a `CommandPopup`, returns the modal plus key/click/type helpers and DOM accessors. | `tests/integration/harness.ts` (new) |
| `vitest.integration.config.ts` | Vitest config for `tests/integration/**` — `environment: 'happy-dom'`, the setup file above, same `obsidian` alias. | repo root (new) |
| Test suites (B–F) | One `*.spec.ts` per concern under `tests/integration/`. | `tests/integration/*.spec.ts` (new) |
| `.claude/integration-test-cmd` | `vitest run --config vitest.integration.config.ts` — read by `/done`. | `.claude/` (new) |

## Interfaces

### `tests/__mocks__/obsidian.ts` (rewritten)

```ts
export class App {}

export type RegisteredHandler = (e: KeyboardEvent) => boolean;

export class Scope {
  // Keyed by `${sortedModifiers.join('+')}::${key}`. Multiple handlers per key
  // are stored LIFO (last registered, first invoked) — matches Obsidian's
  // behavior where the most recent scope binding wins.
  private readonly handlers = new Map<string, RegisteredHandler[]>();

  register(modifiers: string[], key: string, handler: RegisteredHandler): RegisteredHandler {
    const k = scopeKey(modifiers, key);
    const bucket = this.handlers.get(k) ?? [];
    bucket.unshift(handler);
    this.handlers.set(k, bucket);
    return handler; // KeymapEventHandler stand-in — test code never inspects it
  }

  unregister(handler: RegisteredHandler): void {
    for (const [k, bucket] of this.handlers) {
      const i = bucket.indexOf(handler);
      if (i >= 0) bucket.splice(i, 1);
      if (bucket.length === 0) this.handlers.delete(k);
    }
  }

  // Test-only: dispatch a key and return whether *any* handler claimed it.
  // Returns `true` when a handler returned false (claimed, preventDefault),
  // `false` when no handler matched or all returned true (let it bubble).
  dispatch(key: string, modifiers: string[] = []): boolean { ... }
}

export class Modal {
  readonly app: App;
  readonly scope = new Scope();
  readonly contentEl: HTMLElement;            // a real <div> attached to document.body
  constructor(app: App) { ... }
  open(): void { /* calls onOpen() */ }
  close(): void { /* calls onClose(), detaches contentEl */ }
}
```

`Scope.dispatch` is the integration-suite's keyboard simulator. The `KeyboardController` registers a wrapper that calls the user handler and returns `false` on claim — so `dispatch` returns `true` when the popup consumed the key. This is the seam the tests will press against.

### `tests/integration/setup.ts`

Polyfills onto `HTMLElement.prototype` (and `Document` where needed):

```ts
createEl(tag, opts?): HTMLElement      // appendChild(document.createElement(tag)), apply opts
createDiv(opts?): HTMLElement          // sugar for createEl('div', opts)
createSpan(opts?): HTMLElement         // sugar for createEl('span', opts)
addClass(...names): void               // classList.add
removeClass(...names): void            // classList.remove
hasClass(name): boolean                // classList.contains
toggleClass(name, force?): void        // classList.toggle
setText(s): void                       // textContent = s
setAttr(name, value): void             // setAttribute
empty(): void                          // remove all children
onClickEvent(fn): void                 // addEventListener('click', fn)
```

These mirror Obsidian's documented extensions. Behavior is intentionally minimal — only what `src/ui/` actually calls.

### `tests/integration/harness.ts`

```ts
export interface PopupHarness {
  modal: CommandPopup;
  contentEl: HTMLElement;

  pressKey(key: string, modifiers?: string[]): boolean;   // returns Scope.dispatch result
  type(text: string): void;                                // sets input.value, dispatches 'input'
  clickTab(id: string): void;                              // finds .modal-tab matching label
  clickRow(index: number): void;                           // clicks Nth .spells-row | .sentinel-row
  clickBack(): void;                                       // clicks the visible "← Back" button
  submitForge(values?: Partial<ForgeFormData>): ForgeFormData; // fills fields, submits the form

  // DOM queries — return live state, not snapshots
  visibleSpellRows(): HTMLElement[];
  visibleSentinelRows(): HTMLElement[];
  selectedRow(): HTMLElement | null;                       // .is-selected
  activeTabId(): string;                                   // tab with .is-active
  searchInput(): HTMLInputElement;
  isInDetail(): boolean;                                   // no search input visible
}

export function createPopupHarness(): PopupHarness;
```

The harness is the *only* test-side abstraction. Tests use `harness.pressKey('Escape')` and `expect(harness.activeTabId()).toBe('logs')` — never poke `contentEl` directly.

## Data flow

```
Test → harness.pressKey('ArrowDown')
     → mockScope.dispatch('ArrowDown', [])
     → KeyboardController's wrapper handler
     → CommandPopup.move(1)
     → activePanel.move + updateSelection
     → SpellList.updateSelection toggles 'is-selected' on real DOM elements
     → Test reads harness.selectedRow().textContent
```

```
Test → harness.clickRow(0)
     → element.dispatchEvent(new Event('click'))
     → onClickEvent listener (added by polyfill) fires
     → SpellList emits 'detail' on TypedEmitter
     → CommandPopup.renderDetail mounts detail UI
     → Test asserts harness.isInDetail() === true
```

## Error handling

The integration suite has no production-style error handling — these are tests. But two harness-level guards are required:

1. **`harness.pressKey` returns the dispatch result.** If a key is unbound during the current phase, `dispatch` returns `false`. Tests asserting "Tab is ignored in detail phase" rely on this signal — so the boolean must be exposed, not silently swallowed.
2. **`harness.selectedRow()` returns `null` when nothing is selected.** Tests must not crash the suite when the panel is empty (e.g. no-results filter); they assert `null` explicitly.

Test-helper failures (e.g. `clickTab('nonexistent')`) throw immediately with a diagnostic — silent no-ops would mask broken tests.

## Key design decisions

1. **happy-dom over jsdom.** happy-dom is ~3× faster on small DOM workloads and the suite has hundreds of small assertions. Both support everything the polyfill needs (classList, dispatchEvent, focus tracking, form submit). Decision is reversible — config swap is a one-liner.
2. **Polyfill on `HTMLElement.prototype`, not a wrapper class.** The production code calls `container.createEl(...)` directly; intercepting via a wrapper would require touching production. The polyfill is scoped to the integration test setup file and never loaded by unit tests.
3. **Scope mock dispatches in LIFO order.** Obsidian's real `Scope` runs the most recent registration first; `KeyboardController.suspend()` + `resume()` re-registers in the same order, so LIFO is the correct emulation. Tests in Section E verify the suspend/resume contract — getting the dispatch order wrong would silently pass a broken implementation.
4. **One harness, all tests.** A single `createPopupHarness` is enough. Per-suite custom harnesses fragment the seam definition; if a test needs a new helper, it goes on `PopupHarness`.
5. **`ForgeSentinelDetail` gets one focused spec *and* integration coverage.** The focused spec pins `nameInput.focus()` is called and `onSubmit` receives the typed values. The integration spec pins that `CommandPopup` calls `kb.suspend()` / `kb.resume()` around it and that the back button exits to search. These verify different seams.
6. **Selection-memory test is explicit and scenario-driven.** Per commit `50de545`, returning from detail must restore the prior `selectedIndex`. The test moves to index 3, opens detail, exits, asserts index 3 is still highlighted. No reliance on internals.
7. **Tests pin behavior, not aspirations.** If the current code does something that looks like a bug (e.g. generic-sentinel exit doesn't call `kb.resume` because it never called `suspend`), the test pins exactly that. Bugs go in a follow-up plan, not snuck in here.

## Technical notes

- **Why not extend the existing `obsidian.ts` mock incrementally?** It returns a fresh `makeMockEl()` on every `createEl` call — element identity is lost, so `addClass('is-selected')` followed by reading the class back from a different reference returns nothing. A rewrite is cheaper than retrofitting identity.
- **Unit tests must keep working.** The current `obsidian.ts` mock is loaded by all tests via the vitest alias. After the rewrite, any existing unit test that depended on the old shape needs verification. Section A includes a todo to grep the repo for current consumers (today: zero `.spec.ts` files exist outside the placeholder, so this is a one-line check) and confirm no regressions.
- **No new dependencies beyond `happy-dom`.** `npm i -D happy-dom`. Vitest already supports it natively via `environment: 'happy-dom'`.
- **`design-rubric` self-critique.** Single Responsibility holds: harness = simulate, mock = obsidian-shaped seams, polyfill = DOM extensions, tests = behavior pins. Dependency direction flows tests → harness → mock+polyfill, never reversed. No cyclic imports. Testability is the entire point. The harness is one class with multiple methods because it represents a single concept (a driver around an opened popup) — splitting it into `KeyboardDriver` / `ClickDriver` / `QueryDriver` would fragment the seam and force tests to compose three objects to do anything useful; rejected as premature.
- **`design-patterns` self-critique.** Considered: Page Object Model — adopted (the harness *is* a page object). Considered: Builder for harness construction — rejected, no configuration variance worth a builder, a single factory function suffices (YAGNI). Considered: Strategy for key-dispatch — rejected, only one dispatch algorithm (LIFO LIFO traversal) ever exists.
- **No `*-tester` group in Section A.** Section A is pure scaffolding (harness + mock + config). The tester groups start in Section B.

## Todos

### A. Harness scaffolding (no tester — scaffolding-only section)

#### Section briefing

1. **What this section produces.** New files: `vitest.integration.config.ts` (root), `tests/integration/setup.ts`, `tests/integration/harness.ts`, `.claude/integration-test-cmd`. Rewrite: `tests/__mocks__/obsidian.ts` (replaces the current shallow mock — see Components table). Adds `happy-dom` as a devDependency. Public surface: `createPopupHarness()` and the `PopupHarness` interface defined in **Interfaces**.
2. **Design context the executor needs upfront.** From Key design decisions: "happy-dom over jsdom" (point 1), "Polyfill on `HTMLElement.prototype`, not a wrapper class" (point 2), "Scope mock dispatches in LIFO order" (point 3). From Technical notes: "Why not extend the existing `obsidian.ts` mock incrementally" — element identity must be preserved; the rewrite is required, not optional. The polyfill set is exactly the methods listed in the Interfaces `setup.ts` block — do not add others on speculation.
3. **Cross-section couplings.** Every later section (B, C, D, E, F) depends on Section A producing a working `createPopupHarness()`. Specifically: B1–B4 require `pressKey` and `clickTab`; C1–C4 require `clickRow`, `clickBack`, `isInDetail`; D1–D3 require `submitForge`; E1–E3 require `pressKey` returning the dispatch boolean; F1–F2 require `modal.open()` and `modal.close()` to round-trip through `onOpen` / `onClose`. None.
4. **Section-level Red criterion.** A trivial smoke test (`tests/integration/smoke.spec.ts`, written as part of A6) imports `createPopupHarness`, calls it, asserts `harness.contentEl` is a connected `HTMLElement`, asserts `harness.searchInput()` returns an input whose placeholder starts with `Search `, and asserts `harness.pressKey('ArrowDown')` returns `true`. The section is done when this smoke test passes via `vitest run --config vitest.integration.config.ts` and the existing unit-test command (`npm test`) still passes unchanged.

**junior-dev**

- [x] A1: Add `happy-dom` to `devDependencies` in `package.json` and run `npm install`. Verify `npm test` still passes (no behavior change yet). — S, junior-dev
- [x] A2: Create `vitest.integration.config.ts` at repo root. Config: `environment: 'happy-dom'`, `setupFiles: ['./tests/integration/setup.ts']`, same `obsidian` alias as `vitest.config.ts` pointing at `tests/__mocks__/obsidian.ts`, `include: ['tests/integration/**/*.spec.ts']`. Add npm script `test:integration` running `vitest run --config vitest.integration.config.ts`. — S, junior-dev
- [x] A3: Create `tests/integration/setup.ts` polyfilling onto `HTMLElement.prototype` exactly the methods listed in **Interfaces → `tests/integration/setup.ts`**: `createEl`, `createDiv`, `createSpan`, `addClass`, `removeClass`, `hasClass`, `toggleClass`, `setText`, `setAttr`, `empty`, `onClickEvent`. Each implementation is one line of standard-DOM. `createEl(tag, opts)` must accept `{ text?, cls?, type?, value?, placeholder? }` (the union of options used across `src/ui/`). — M, junior-dev
- [x] A4: Rewrite `tests/__mocks__/obsidian.ts` per the **Interfaces → `obsidian.ts`** block. `Scope.register` returns the handler itself (acts as the `KeymapEventHandler` token). `Scope.unregister` removes by reference. `Scope.dispatch(key, modifiers)` walks the LIFO bucket, invokes handlers until one returns `false` (claimed), and returns whether any handler claimed. `Modal` constructor creates `contentEl = document.createElement('div')` and appends to `document.body` on `open()`; `close()` calls `onClose()` then detaches. — M, junior-dev
- [x] A5: Create `tests/integration/harness.ts` exporting `createPopupHarness()` and `PopupHarness` matching the **Interfaces** block. Implement every method listed there. `pressKey` delegates to `modal.scope.dispatch`. `type(text)` sets `input.value` and dispatches a real `Event('input')` so the production `input.oninput` handler fires. `submitForge` fills fields and dispatches `Event('submit')` on the form (or calls `form.onsubmit` directly — production sets it via assignment, not `addEventListener`, so direct invocation matches reality). `selectedRow()` returns the first `.is-selected` element under `contentEl` or `null`. `activeTabId()` reads the lowercase text content of the `.modal-tab.is-active` element. — L, junior-dev
- [x] A6: Create `tests/integration/smoke.spec.ts` covering the Section A Red criterion: harness construction, search input visible, ArrowDown dispatches. This is *only* the harness smoke check — no popup behavior assertions. — S, junior-dev
- [x] A7: Create `.claude/integration-test-cmd` containing exactly `npm run test:integration` (single line). Verify `/done` is the only consumer (per the global hook docs); pre-commit-green and stop-guard do not read this file. — S, junior-dev
- [x] A8: Grep `src/` and existing `tests/` for any consumer of the old `obsidian.ts` mock shape (specifically: code that relies on `createEl` returning a `vi.fn()`-mock element). Document findings in the commit message. Today this should be empty. — S, junior-dev

### B. Tab cycling and TabBar wiring

#### Section briefing

1. **What this section produces.** New file: `tests/integration/tab-navigation.spec.ts`. No production changes. Public surface: zero — these are tests.
2. **Design context the executor needs upfront.** From `CommandPopup.bindKeys`: Tab handler returns `false` (lets the platform take over) when `phase === 'detail'`, otherwise rotates `(panels.indexOf(activePanel) + 1) % panels.length`. From `switchTab`: clears `#searchQuery`, resets `selectedIndex = 0`, calls `panel.reset()`, re-renders. From `TabBar`: clicks are no-ops when `disabled` is true (which is `phase === 'detail'`). The two panels are `[SpellsPanel, LogsPanel]` in that order — Spells is the initial active tab.
3. **Cross-section couplings.** B4 (Tab is inert in detail) depends on C1 to define the entry path into detail mode — but B4 reaches detail by reusing the same harness call (`pressKey('Enter')` on a row), so it does not depend on C1's *test* passing, only on the production code reaching detail correctly. Mark B4 as *uses the same path as C1* — if C1 fails, B4 will too, and the C1 failure is the actionable signal. None beyond that.
4. **Section-level Red criterion.** Tab via keyboard cycles Spells → Logs → Spells; `activeTabId()` returns `'spells'` then `'logs'` then `'spells'` across three `pressKey('Tab')` calls. Clicking the Logs tab swaps `activeTabId()` and clears the search input value. Clicking the active tab is a no-op except for state reset (search query cleared, index reset). In detail phase, `pressKey('Tab')` returns `false` and `activeTabId()` is unchanged.

**ui-integration-tester**

- [x] B1: integration test: `pressKey('Tab')` cycles activeTabId from 'spells' → 'logs' → 'spells' across two presses; each press's return value is `true`. — S, ui-integration-tester
- [x] B2: integration test: `clickTab('logs')` switches activeTabId to 'logs' and the search input's `value` is empty afterward (state reset per `switchTab`). Type a query first, then click — assert clear. — S, ui-integration-tester
- [x] B3: integration test: `clickTab('logs')` followed by `clickTab('spells')` lands back on Spells with `selectedIndex` reset (i.e. `selectedRow().textContent === 'Summoning Circle'` — the first spell). — S, ui-integration-tester
- [x] B4: integration test: enter detail (`pressKey('Enter')` on the first row), then `pressKey('Tab')` returns `false`, `activeTabId()` unchanged. Also assert `clickTab('logs')` while in detail does not switch (TabBar passes `disabled = true` so the click handler is gated). — M, ui-integration-tester

### C. Spell-list to spell-detail transitions

#### Section briefing

1. **What this section produces.** New file: `tests/integration/spell-detail.spec.ts`. No production changes.
2. **Design context the executor needs upfront.** From `CommandPopup.renderDetail`: sets `phase = 'detail'`, calls `#kb.suspend()`, registers `#onDetailBack = exit`, renders `<h2>` with the spell name and a "← Back" button wired to `exit`. From `CommandPopup.close()` override: when `phase === 'detail'`, runs `#onDetailBack` and *returns without calling super.close()* — Escape and Obsidian-internal `close()` calls both route through this. From `exitDetail`: clears `#onDetailBack` first, destroys `#activeDetail`, calls `#kb.resume()`, then `renderSearch()`. The first spell is `Summoning Circle` (index 0).
3. **Cross-section couplings.** C4 (selection memory) shares production behavior tested in E2 (resume re-binds keys) — but C4 only asserts the *index* survives, not the keyboard state, so the two tests can fail independently. None.
4. **Section-level Red criterion.** Three independent paths back from spell detail (Escape, Back-click, `modal.close()`) all land on the search input being visible again with a `.is-selected` row matching the previous index. Detail mount renders the spell name in an `<h2>`.

**ui-integration-tester**

- [x] C1: integration test: `pressKey('Enter')` on the initial selection opens spell detail — `isInDetail()` true, `contentEl` contains `<h2>` with text `Summoning Circle`. — S, ui-integration-tester
- [x] C2: integration test: from spell detail, `pressKey('Escape')` exits to search — `isInDetail()` false, `searchInput()` is present, modal is *still open* (no `super.close()`). Assert by checking `contentEl.isConnected === true`. — M, ui-integration-tester
- [x] C3: integration test: from spell detail, `clickBack()` exits to search with the same assertions as C2. — S, ui-integration-tester
- [x] C4: integration test: selection memory — move selection to index 3 (`pressKey('ArrowDown')` × 3), `pressKey('Enter')` to enter detail, `pressKey('Escape')` to exit, assert `selectedRow().textContent === 'Scrying Mirror'` (the spell at index 3). Pins commit `50de545`. — M, ui-integration-tester
- [x] C5: integration test: calling `modal.close()` directly from spell detail routes through the override — modal stays open, returns to search. Assert `contentEl.isConnected === true` and `searchInput()` exists. — M, ui-integration-tester

### D. Sentinel detail — forge and generic variants

#### Section briefing

1. **What this section produces.** New files: `tests/integration/sentinel-detail.spec.ts` and `tests/integration/forge-sentinel-detail.spec.ts`. The latter is a focused component-level test of `ForgeSentinelDetail` (per **Key design decisions** point 5). No production changes.
2. **Design context the executor needs upfront.** From `SpellsPanel`: sentinels are `[{ kind: 'forge', name: 'Forge' }, { kind: 'refine', name: 'Refine' }]` rendered after the 10 spells, so their list indices are 10 and 11. From `renderForgeSentinelDetail`: instantiates `ForgeSentinelDetail` with `onBack: exit, onSubmit: exit`, both call `exitDetail` which `kb.resume()`s and re-renders search. From `ForgeSentinelDetail` constructor: builds back button → `<form>` → name input (`focus()` called) → description textarea → model select → submit button. `wireSubmitHandler` calls `onSubmit({ name, description, model })` defaulting `model` to `'haiku'`. From `renderGenericSentinelDetail`: does *not* call `kb.suspend()` — pin this exact behavior (point 7 of Key design decisions).
3. **Cross-section couplings.** D2 and D3 both verify the back path leaves the popup open (same contract as C2/C3). E1 (suspend on forge entry) overlaps with D1 — D1 should focus on the *form rendering* and submit payload; E1 owns the suspend/resume contract assertion. None.
4. **Section-level Red criterion.** Forge entry renders the form with a focused name input; submit fires `onSubmit` with the typed values; back-click and Escape both exit. Generic-sentinel (refine) entry renders an `<h2>` and `<p>` with the sentinel name and kind; back-click exits.

**ui-integration-tester**

- [x] D1: focused component test (`forge-sentinel-detail.spec.ts`): instantiate `ForgeSentinelDetail` directly with a fresh `Scope` and a mock `contentEl`; assert (a) the name input is the active element after construction, (b) submitting the form invokes `onSubmit` with `{ name: 'X', description: 'Y', model: 'sonnet' }` after `submitForge({ name: 'X', description: 'Y', model: 'sonnet' })`, (c) clicking the Back button invokes `onBack`. — M, ui-integration-tester
- [x] D2: integration test: navigate to the Forge sentinel (move to index 10), `pressKey('Enter')`, assert `isInDetail()` true and a `<form class="forge-sentinel-form">` is mounted. `clickBack()` returns to search with modal still open. — M, ui-integration-tester
- [x] D3: integration test: enter Forge detail, type into the name input, submit the form via `submitForge()`, assert detail exited (back to search). — S, ui-integration-tester
- [x] D4: integration test: navigate to the Refine sentinel (index 11), `pressKey('Enter')`, assert `<h2>` text is `Refine` and `<p>` text is `Type: refine`. `clickBack()` returns to search. — M, ui-integration-tester
- [x] D5: integration test: from Refine detail, `pressKey('Escape')` routes through `close()` override and exits to search (same modal-stays-open contract as C2). Pins the generic-sentinel exit path. — S, ui-integration-tester

### E. Keyboard suspend/resume around forge detail

#### Section briefing

1. **What this section produces.** New file: `tests/integration/keyboard-suspend.spec.ts`. No production changes.
2. **Design context the executor needs upfront.** From `KeyboardController.suspend`: unregisters all currently-registered handlers, clears `#registered`, *retains* `#bindings`. From `resume`: re-registers everything in `#bindings`. From `CommandPopup.renderForgeSentinelDetail`: calls `#kb.suspend()` *before* mounting `ForgeSentinelDetail` (which then registers its own ArrowUp/ArrowDown on the same `scope`). The forge component's `destroy()` calls its own `#kb.unbindAll()` — so when `exitDetail` runs, it destroys forge keys, then calls popup's `#kb.resume()`. The order matters: if resume ran before destroy, popup's ArrowUp/Down would race forge's. The `Scope.dispatch` LIFO order in our mock (Key design decision 3) reflects this contract.
3. **Cross-section couplings.** E2's "popup keys re-bound after exit" overlaps with C4 (selection memory) — but C4 only checks the visual index, while E2 checks that `pressKey` actually moves the selection again post-exit. The two pin different facets. None.
4. **Section-level Red criterion.** While in forge detail, `pressKey('ArrowDown')` does not move the popup's `selectedIndex` (popup keys are suspended). After exit, `pressKey('ArrowDown')` moves selection again (resume worked).

**ui-integration-tester**

- [x] E1: integration test: enter Forge detail; `pressKey('Tab')` returns `false` (popup Tab handler suspended; no platform handler in our Scope); `pressKey('Enter')` returns `false` likewise. — M, ui-integration-tester
- [x] E2: integration test: enter Forge detail, exit via `clickBack()`, then `pressKey('ArrowDown')` advances `selectedRow()` to the next spell. Pins resume-after-detail. — M, ui-integration-tester
- [x] E3: integration test: re-enter Forge detail a second time and exit again — popup keys still work after multiple suspend/resume cycles. (Catches mutations that resume only once.) — S, ui-integration-tester

### F. SearchInput wiring and modal lifecycle

#### Section briefing

1. **What this section produces.** Two new files: `tests/integration/search-input.spec.ts` and `tests/integration/modal-lifecycle.spec.ts`.
2. **Design context the executor needs upfront.** From `SearchInput.bindInputHandler`: `input.oninput = () => onFilter(query.toLowerCase(), panel.filter(query))` — note `query.toLowerCase()` is what is stored, but `panel.filter` receives the raw `input.value` (still lowercased because `input.value` was set by the user). From `SpellsPanel.filter`: returns `sentinelFocusIndex` — when no spells match and the query matches a sentinel name, the selected index jumps to the matching sentinel. From `CommandPopup.confirm`: only fires when `phase === 'search'`. From `onOpen`: resets `selectedIndex = 0`, `#searchQuery = ''`, `activePanel = panels[0]`, `phase = 'search'`. From `onClose`: `contentEl.empty()`.
3. **Cross-section couplings.** F2 (modal-lifecycle) reopens the modal — the harness needs `modal.open()` to be re-callable. None beyond Section A.
4. **Section-level Red criterion.** Typing filters the list; ArrowDown/ArrowUp wrap; Enter on a filtered row opens that exact spell's detail. `onOpen` fully resets state; `onClose` empties `contentEl`.

**ui-integration-tester**

- [x] F1: integration test: `type('protect')` reduces visible spell rows to one (`Protection Rune`); `selectedRow().textContent === 'Protection Rune'`. — S, ui-integration-tester
- [x] F2: integration test: with no filter, `pressKey('ArrowDown')` then `pressKey('Enter')` opens the *second* spell's detail (`Protection Rune`). — S, ui-integration-tester
- [x] F3: integration test: ArrowUp from index 0 wraps to the last visible row (last sentinel — `Refine`). Pins `move(delta, current)` modular arithmetic. — S, ui-integration-tester
- [x] F4: integration test: typing a query that matches no spells but matches a sentinel ('forge') auto-selects the Forge sentinel row. Pins `sentinelFocusIndex`. — M, ui-integration-tester
- [x] F5: integration test (`modal-lifecycle.spec.ts`): open the modal, switch to Logs tab, type a query, then close-and-reopen — assert active tab is Spells, search input is empty, first spell row is selected. Pins `onOpen` reset. — M, ui-integration-tester
- [x] F6: integration test: close the modal (from search phase); assert `contentEl.children.length === 0` after close. Pins `onClose`. — S, ui-integration-tester

## Overall effort summary

- **Counts:** S = 16, M = 14, L = 1. Total: 31 todos across 6 sections.
- **Tier mix:** junior-dev = 8 (Section A scaffolding only); ui-integration-tester = 23 (Sections B–F). Zero senior-dev or lead-dev — by design.
- **Dispatch order:** A (junior-dev) → B–F (each is `**ui-integration-tester**` only, dispatchable in any order, but listed B → C → D → E → F because later sections rely on patterns established earlier).
- **Risk concentration:** Section A is the only place a mistake can cascade — a wrong polyfill or LIFO bug in `Scope.dispatch` will break every downstream test in a way that looks like production failure. Mitigation: A6 (smoke spec) catches harness errors before any behavior test runs.
