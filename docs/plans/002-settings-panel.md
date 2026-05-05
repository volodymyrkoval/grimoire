# 002 — Settings Panel

## Complexity

**Medium.** Domain/infra/widgets are already committed (PoC); this iteration backfills tests across ~10 modules and adds two new components: `GrimoireSettingTab` (Obsidian `PluginSettingTab` subclass) and the `main.ts` wiring that owns `GrimoireData`, the `DebouncedSaver`, and the `SpellOverrideStore`. No reactive framework, no cross-module invariants beyond effort-clamping (already encapsulated). One natural component seam (`GrimoireSettingTab` ↔ `GrimoirePlugin`) → one UI integration test.

## Goal & scope

Ship a working **Settings tab** for the Grimoire Obsidian plugin so a user can change the seven `GrimoireSettings` fields and have edits persist (debounced, 500 ms; flushed on `onunload`). Backfill unit tests across the committed PoC so the codebase becomes test-clean before further features land on top of it.

### In scope

- `GrimoireSettingTab extends PluginSettingTab` — renders 5 text rows + 1 dropdown + 1 conditional `EffortRow`.
- `main.ts` wiring — `data` property, `save()` method backed by `DebouncedSaver`, `onload`/`onunload` lifecycle.
- Unit tests for: `DebouncedSaver`, `hydrate`, `computeVaultMountDefault`, `SpellOverrideStore`, `resolveSpellOptions`, `SegmentedControl`, `EffortRow`, `OptionsFormState`, `OptionsSessionMap`, `OptionsSnapshot`.
- One UI integration test: settings tab DOM produced by `display()`, the conditional `EffortRow` toggling on model change, edits propagating to `plugin.data.settings` and triggering a debounced save.
- Obsidian mock additions: `Plugin`, `PluginSettingTab`, `Setting`, `Platform`, `FileSystemAdapter`.

### Out of scope

- Reset-to-defaults button, import/export, validation UI (no errors surfaced inline).
- Settings UI for `spellOverrides` (handled by future Spell Picker options panel).
- E2E testing against a real Obsidian runtime.
- Any change to `Settings.ts`, `persistence.ts`, `computeVaultMountDefault.ts`, `SpellOverrideStore.ts`, `spellOptionsResolver.ts`, `DebouncedSaver.ts`, `SegmentedControl.ts`, `EffortRow.ts`, or `src/ui/options/*` source files. Those PoC files are frozen by this iteration; we test them as committed.

## Proposed solution

1. Backfill unit tests around the frozen PoC modules (Section A, B). These run first because they require zero new production code — pure characterisation tests over committed behaviour.
2. Extend the Obsidian mock to support `PluginSettingTab`, `Setting`, `Platform`, `FileSystemAdapter`, and `Plugin` (Section C). Without this, neither the `GrimoireSettingTab` nor the `main.ts` wiring can be exercised.
3. Build the seam-test for the settings tab (Section D, ui-integration-tester first), then add `GrimoireSettingTab` to make it green.
4. Wire the plugin (Section E): `data`, `save`, `DebouncedSaver`, `SpellOverrideStore`, `addSettingTab`, `onunload` flush.

## Components

| Component | Location | Responsibility | Status |
|---|---|---|---|
| `GrimoireSettingTab` | `src/ui/settings/GrimoireSettingTab.ts` (new) | Render 7 settings rows; write through to `plugin.data.settings`; trigger `plugin.save()` on every change | NEW |
| `GrimoirePlugin` | `src/main.ts` (modified) | Hold `data: GrimoireData`, own `DebouncedSaver` + `SpellOverrideStore`, register `GrimoireSettingTab`, flush on unload | MODIFIED |
| Obsidian mock | `tests/__mocks__/obsidian.ts` (modified) | Add `Plugin`, `PluginSettingTab`, `Setting`, `Platform`, `FileSystemAdapter` shapes used by new code & tests | MODIFIED |
| Frozen PoC modules | `src/domain/settings/*`, `src/infra/DebouncedSaver.ts`, `src/ui/SegmentedControl.ts`, `src/ui/widgets/EffortRow.ts`, `src/ui/options/*` | Existing behaviour, untested today | UNCHANGED — tests added |

## Interfaces

### `GrimoireSettingTab` (new)

```ts
// src/ui/settings/GrimoireSettingTab.ts
import { App, PluginSettingTab, Setting } from 'obsidian';
import { GrimoirePlugin } from '../../main';
import { EffortRow } from '../widgets/EffortRow';
import { SUPPORTED_MODELS, Effort } from '../../domain/settings/Settings';

export class GrimoireSettingTab extends PluginSettingTab {
  constructor(app: App, plugin: GrimoirePlugin);
  display(): void;        // builds the rows; called by Obsidian
  hide(): void;           // optional; no-op for this iteration
}
```

`display()` clears `containerEl`, then appends rows in fixed order:

1. **Spell tag** — text input bound to `data.settings.spellTag`
2. **CLI command** — text input bound to `data.settings.cliCommand`
3. **Binary path** — text input bound to `data.settings.binaryPath`
4. **Forge output folder** — text input bound to `data.settings.forgeOutputFolder`
5. **Vault mount path** — text input bound to `data.settings.vaultMountPath`
6. **Default model** — dropdown populated from `SUPPORTED_MODELS` (id → label), bound to `data.settings.defaultModel`. On change: write the new id, then update the conditional `EffortRow` row via the row's `update(modelId, currentEffort)` method, then `plugin.save()`.
7. **Default effort** — a single `Setting` whose `controlEl` hosts an `EffortRow` instance (mounted once during `display()`). The row mounts only when the selected model has `effortOptions !== null`. When the model changes to one without options, `EffortRow.update` is invoked and renders nothing visible (Case 2: still mounted, no options → no-op; the existing wrapper stays empty). When the model changes to one with options after starting without, `EffortRow.update` lazy-mounts (Case 3).

Every text input's `onChange` writes through to `plugin.data.settings.<field>` and calls `plugin.save()`. The dropdown's `onChange` does the same plus `effortRow.update(...)`. `EffortRow`'s `onChange` writes `plugin.data.settings.defaultEffort = next` and calls `plugin.save()`.

### `GrimoirePlugin` (extended)

```ts
// src/main.ts
import { Plugin } from 'obsidian';
import { GrimoireData } from './domain/settings/Settings';
import { hydrate } from './domain/settings/persistence';
import { DebouncedSaver } from './infra/DebouncedSaver';
import { SpellOverrideStore } from './domain/settings/SpellOverrideStore';
import { GrimoireSettingTab } from './ui/settings/GrimoireSettingTab';
import { CommandPopup } from './ui/CommandPopup';

export default class GrimoirePlugin extends Plugin {
  data!: GrimoireData;
  saver!: DebouncedSaver;
  overrides!: SpellOverrideStore;

  async onload(): Promise<void> {
    this.data = hydrate(await this.loadData(), this.app);
    this.saver = new DebouncedSaver(() => this.saveData(this.data), 500);
    this.overrides = new SpellOverrideStore({ data: this.data, saver: this.saver });
    this.addSettingTab(new GrimoireSettingTab(this.app, this));
    this.addCommand({
      id: 'open-command-popup',
      name: 'Open Grimoire',
      callback: () => new CommandPopup(this.app).open(),
    });
  }

  onunload(): void {
    this.saver.flush();
  }

  save(): void { this.saver.schedule(); }
}
```

`save()` is the single mutation hand-off used by `GrimoireSettingTab` rows. It does **not** itself await anything — debouncing absorbs every keystroke. Callers must not assume persistence has occurred until `flush()` runs.

### Obsidian mock additions (interface only, see Component E for behaviour)

```ts
export class Plugin {
  app: App;
  constructor(app: App);
  loadData(): Promise<unknown>;       // vi.fn returning undefined by default
  saveData(data: unknown): Promise<void>; // vi.fn
  addCommand(...): void;              // vi.fn
  addSettingTab(tab: PluginSettingTab): void; // vi.fn — but tests can read .display()
}
export class PluginSettingTab {
  app: App;
  containerEl: HTMLElement;
  constructor(app: App, plugin: Plugin);
  display(): void;                    // overridden by subclass
  hide(): void;
}
export class Setting {
  settingEl: HTMLElement;
  controlEl: HTMLElement;
  constructor(containerEl: HTMLElement);
  setName(name: string): this;
  setDesc(desc: string): this;
  addText(cb: (t: TextInputComponent) => void): this;
  addDropdown(cb: (d: DropdownComponent) => void): this;
}
export const Platform: { isDesktop: boolean }; // mutable for tests
export class FileSystemAdapter { getBasePath(): string; }
```

The mock must keep both **node-mode** (`createMockElement`) and **happy-dom mode** (`document.createElement`) parity, matching the existing pattern in the file.

## Data flow

```
User types in text input
  → Setting.addText(.onChange(value))
  → plugin.data.settings.<field> = value
  → plugin.save()
  → saver.schedule()  ── 500 ms ──▶  saveData(data)

User picks model in dropdown
  → Setting.addDropdown(.onChange(modelId))
  → plugin.data.settings.defaultModel = modelId
  → effortRow.update(modelId, plugin.data.settings.defaultEffort)
        ↳ if new model has no effortOptions: row hides (no DOM left visible)
        ↳ if it does: SegmentedControl re-renders with the survival-rule effort
  → plugin.save()

User picks effort in segmented control
  → SegmentedControl onChange(effort)
  → plugin.data.settings.defaultEffort = effort
  → plugin.save()

Plugin unload
  → onunload() → saver.flush() → saveData(data) (sync-fire of pending timer)
```

## Error handling

- `loadData()` returns `undefined` for first-run; `hydrate(undefined, app)` already merges defaults. Tested.
- `loadData()` returns malformed JSON / unknown shape: `hydrate` casts via `as`, then `Object.assign` over defaults — unknown fields silently ignored. Tested via "saved blob with extra junk" case.
- `computeVaultMountDefault` throws on adapter access: caught, logs, returns `''`. Tested.
- `defaultEffort` corrupted to a non-`Effort` value: hydrate replaces with `'medium'`. Tested.
- `saveData()` rejects: `DebouncedSaver` already wraps in try/catch and logs. Tested.
- Unknown `defaultModel` from saved data: dropdown will display the saved id even if not in `SUPPORTED_MODELS` — **deferred edge case**, not solved here. The `EffortRow` already handles unknown model id with a `console.error` and short-circuit. We do not add validation in `hydrate` for this iteration; it would leak UI policy into the domain layer.

## Key design decisions

1. **No reactive framework.** Settings rows write directly to `plugin.data.settings.<field>` and call `plugin.save()`. The store is the data; the UI is a thin write-through. Rationale: matches brain-note constraint, keeps `GrimoireSettings` a plain interface, avoids signal/store machinery for a 7-field form.
2. **`EffortRow` is mounted once into the effort row's `controlEl` and reused via `update()`.** We do not destroy and re-create it on model change. Rationale: `EffortRow` already encodes the four mount/unmount cases; reusing those is cheaper and keeps DOM identity stable for tests.
3. **Persistence is debounced in one place — the plugin's `DebouncedSaver`.** Rows do not call `saveData` directly; they call `plugin.save()`, which schedules. Rationale: single point of coalescing means typing in a text field doesn't write seven blobs in 200 ms, and tests can advance fake timers in one place.
4. **`onunload` flush is the only hard persistence guarantee.** No other event triggers immediate write. Rationale: matches existing `DebouncedSaver` contract; aligns with brain-note rule "DebouncedSaver at 500ms; onunload flush".
5. **`Setting` is constructed against `containerEl` (the `PluginSettingTab` field) directly.** No wrapper; we use Obsidian's stock layout. The effort row's `controlEl` holds the `EffortRow` wrapper as a child — Obsidian's CSS will style the row correctly.
6. **The Obsidian mock returns `vi.fn()`-style spies for `Plugin.loadData`/`saveData`/`addSettingTab`** so unit tests can assert call counts without booting a real plugin. `PluginSettingTab.containerEl` is a real DOM element when `document` is available (matches the existing `Modal` pattern).

## Technical notes

- **Pattern: Strategy considered — rejected.** The settings rows could each be a `SettingsRow` strategy with `render(parent, plugin)` and `onSave()`. We don't need it: there are seven rows total, six of which are nearly identical text-input shapes. YAGNI — extracting a Strategy here is speculative generality. If the row count grows or row types diverge (e.g. multi-step wizards), revisit.
- **Pattern: Observer / pub-sub considered — rejected for the dropdown→`EffortRow` link.** The dropdown's `onChange` directly calls `effortRow.update`. Adding an event bus for one consumer is unjustified. Tested.
- **Pattern: Adapter — already in use, unchanged.** `computeVaultMountDefault` adapts Obsidian's `FileSystemAdapter` to a plain string. We retain the existing shape and test it under the existing contract.
- **Pattern: Template Method — implicit via `PluginSettingTab.display()`.** Obsidian's framework owns the lifecycle; we override `display()`. No alternative — it's the framework's contract.
- **`Platform.isDesktop` is checked in `computeVaultMountDefault`. Tests must mutate `Platform.isDesktop` per case.** The mock exports `Platform` as a mutable object so tests can flip it.
- **`SUPPORTED_MODELS[2]` (`claude-opus-4-5`) has 5 effort levels including `xhigh`; `[1]` has 4 (no `xhigh`); `[0]` has none.** The integration test must drive a transition across all three to exercise survival, clamp, and unmount/lazy-remount.
- **Effort-survival rule lives in `OptionsFormState.setModel`, not in `GrimoireSettingTab`.** The settings tab does not own this logic — it only re-renders the row using the current `data.settings.defaultEffort`. If the saved effort is invalid for the new model, `EffortRow.update` falls back to the model's `defaultEffort` (Case 1 path). The settings UI still **stores** the user's last picked value; we do not auto-rewrite `data.settings.defaultEffort` on model change. Rationale: avoids a write-on-render side effect; if the user picks Opus → `xhigh`, then Sonnet (which has no `xhigh`), the visible row falls back to `medium`, but `data.settings.defaultEffort` keeps `xhigh` until the user touches the row. **Risk:** this means the persisted value can be temporarily out of sync with what's displayed — flagged for review under the user-facing semantics.
- **Section briefing rule:** every section below opens with one. Read only your section; the briefing carries the design context the executor needs.

## Todos

> Each todo is one testable behaviour. Effort tags: S = trivial / contained, M = moderate, L = larger. Tier tags: junior-dev / senior-dev / lead-dev / ui-integration-tester. Within each section, tier-group order is **ui-integration-tester → junior-dev → senior-dev → lead-dev**.

### A. Unit tests for committed domain/infra (no production code changes)

#### Section briefing

1. **What this section produces** — five new test files under `tests/`: `DebouncedSaver.test.ts`, `persistence.test.ts`, `computeVaultMountDefault.test.ts`, `SpellOverrideStore.test.ts`, `spellOptionsResolver.test.ts`. No production source modified. The frozen modules being characterised are listed in the Components table under "Frozen PoC modules".
2. **Design context the executor needs upfront** — characterisation tests for committed code: write the test that asserts what the source already does, then run it green. If a test would require changing source, stop and escalate; the source is frozen for this iteration. The exact behaviours to lock in are enumerated per todo. `DebouncedSaver` uses `setTimeout`; use `vi.useFakeTimers()`. `computeVaultMountDefault` reads `Platform.isDesktop` — mutate the mock. `hydrate` calls `computeVaultMountDefault` only when `vaultMountPath === ''` (see Settings.ts line 28: default is empty string, so the fallback fires on first run).
3. **Cross-section couplings** — A3 (`computeVaultMountDefault.test.ts`) requires the `Platform` and `FileSystemAdapter` mock additions in C2. Reorder if needed: A3 depends on C2.
4. **Section-level Red criterion** — `npm test` runs all five files. Each test file imports its target module from `src/...`, mounts the cases below, and they pass. Coverage of the listed branches is observable: every `if`/`else` arm in each frozen module has at least one passing assertion.

**junior-dev**

- [ ] A1: `tests/DebouncedSaver.test.ts` — cases: (a) `schedule()` then advance 500 ms → `save` called once, (b) `schedule()` twice within 500 ms → `save` called once after final 500 ms (debounce coalesces), (c) `flush()` with pending timer → `save` called immediately, (d) `flush()` with no pending timer → no-op (no extra calls), (e) `save` throws → error caught, no rethrow (assert `console.error` called via spy). Use `vi.useFakeTimers()` / `vi.advanceTimersByTime`. — S, junior-dev
- [ ] A2: `tests/persistence.test.ts` — cases: (a) `saved === undefined` → returns full `DEFAULT_SETTINGS` clone + empty `spellOverrides`, (b) `saved.settings` partial (e.g. only `cliCommand: 'foo'`) → merges over defaults, (c) `saved.settings.vaultMountPath === ''` → `computeVaultMountDefault` is called and its return value is used (mock the import), (d) `saved.settings.vaultMountPath === '/already/set'` → `computeVaultMountDefault` is NOT called, (e) `saved.settings.defaultEffort === 'banana'` → coerced to `'medium'`, (f) `saved.settings.defaultEffort === null` → preserved as `null` (Haiku case), (g) `saved.spellOverrides` populated → carried through unmodified. Use `vi.mock('../src/domain/settings/computeVaultMountDefault', ...)` to stub the dep. — S, junior-dev
- [ ] A3: `tests/computeVaultMountDefault.test.ts` — cases: (a) `Platform.isDesktop === true` and `adapter.getBasePath()` returns `'/vault'` → returns `'/vault'`, (b) `Platform.isDesktop === false` → returns `''` (adapter not consulted), (c) `Platform.isDesktop === true` and `getBasePath` throws → returns `''` and `console.error` called. Mutate `Platform.isDesktop` on the mock module; cast adapter to `FileSystemAdapter` in fixture. (Depends on C2.) — S, junior-dev
- [ ] A4: `tests/SpellOverrideStore.test.ts` — cases: (a) `get` for unknown path → `undefined`, (b) `has` mirrors `get`, (c) `set` valid override → stored in `data.spellOverrides[path]`, `saver.schedule()` called once, (d) `set` with model id not in `SUPPORTED_MODELS` → not stored, `console.error` called, `saver.schedule()` NOT called, (e) `set` for `claude-haiku-4-5` (no effort support) → not stored, `console.error` called, (f) `set` with effort outside `effortOptions` (e.g. `'xhigh'` for Sonnet) → stored with effort clamped to model's `defaultEffort`, (g) `clear` for known path → removed, `saver.schedule()` called, (h) `clear` for unknown path → no-op, `saver.schedule()` NOT called. Inject a fake `saver` with `schedule = vi.fn()`. — S, junior-dev
- [ ] A5: `tests/spellOptionsResolver.test.ts` — cases: (a) session entry present → returns session's model+effort untouched (when valid), (b) no session, override present → returns override, (c) no session, no override → returns settings defaults, (d) selectedModel id missing from `models` → falls back to `models[0]`'s id and its `defaultEffort`, (e) effort survival: selectedEffort is in resolvedModel.effortOptions → kept, (f) effort survival: selectedEffort NOT in resolvedModel.effortOptions → falls back to model.defaultEffort, (g) resolvedModel has `effortOptions === null` → returned effort is the model's `defaultEffort` (which is null). — S, junior-dev

### B. Unit tests for committed UI widgets

#### Section briefing

1. **What this section produces** — five new test files under `tests/`: `SegmentedControl.test.ts`, `EffortRow.test.ts`, `OptionsFormState.test.ts`, `OptionsSessionMap.test.ts`, `OptionsSnapshot.test.ts`. The targets are enumerated in the Components table under "Frozen PoC modules". No production source modified.
2. **Design context the executor needs upfront** — these tests exercise DOM. The default `vitest.config.ts` runs `environment: 'node'`, so per-file environment annotation is required: add `// @vitest-environment happy-dom` at the top of `SegmentedControl.test.ts` and `EffortRow.test.ts`. The other three files (`OptionsFormState`, `OptionsSessionMap`, `OptionsSnapshot`) are pure-data and can stay in the node env. Boundary `ArrowLeft` at index 0 is a no-op (`SegmentedControl.ts` line 74). `EffortRow.update` has four explicit cases — every one needs a test (see EffortRow.ts lines 67–92).
3. **Cross-section couplings** — None.
4. **Section-level Red criterion** — `npm test` runs all five files. Every public method on each frozen widget has at least one assertion. Each branch in `SegmentedControl.#handleArrow`, `SegmentedControl.#handleClick`, and the four-case `EffortRow.update` switch is covered.

**junior-dev**

- [ ] B1: `tests/SegmentedControl.test.ts` (`// @vitest-environment happy-dom`) — cases: (a) ctor builds N buttons with class `grimoire-segmented__btn`, initial value gets `is-active`, (b) ctor with value not in options → throws, (c) clicking a non-active button switches active class and fires `onChange(value)` once, (d) clicking the active button → no `onChange` (lines 84), (e) `ArrowRight` from middle button → next becomes active, focus moves, `onChange` fired, (f) `ArrowLeft` from leftmost → no-op, no `onChange` fired, (g) `ArrowRight` from rightmost → no-op, (h) `setValue(next)` updates active class without firing `onChange`, (i) `setOptions(newOpts, newValue)` clears children and rebuilds; `setOptions` with value outside new options → throws, (j) `focusSelected()` focuses the active button. — M, junior-dev
- [ ] B2: `tests/EffortRow.test.ts` (`// @vitest-environment happy-dom`) — cases: (a) `mount` with model that has effortOptions → wrapper `.grimoire-effort-row` appended, segmented control rendered with model's options, (b) `mount` with model that has `effortOptions === null` (Haiku) → no wrapper appended, (c) `mount` with `opts.effort === null` and model with options → uses model's `defaultEffort`, (d) `mount` with model id not in `models` → `console.error`, no DOM appended, (e) `update` Case 1 — currently mounted, new model has options → `setOptions` called, current effort survives if valid, falls back to defaultEffort otherwise, (f) `update` Case 2 — mounted, new model has no options → no DOM change (we keep the wrapper, just don't re-render; existing segmented stays), (g) `update` Case 3 — not mounted, new model has options → lazy-mount happens (wrapper now exists), (h) `update` Case 4 — not mounted, new model has no options → still no DOM, no error. — M, junior-dev
- [ ] B3: `tests/OptionsFormState.test.ts` — cases: (a) ctor stores snapshot, `snapshot()` returns equivalent, (b) `setEffort` updates effort, fires `onChange`, (c) `setModel` to model with same effort in `effortOptions` → effort survives, (d) `setModel` to model whose options exclude current effort → falls back to that model's `defaultEffort`, (e) `setModel` to Haiku (no options) → effort becomes `null`, (f) `setModel` with unknown id → falls back to `models[0]`, `console.warn` called, (g) `setContextNotePaths`/`setFollowUp` update fields and fire `onChange`, (h) `onChange` returns an unsubscribe fn that removes the listener, (i) `snapshot().contextNotePaths` is a fresh array (mutating it doesn't affect internal state). — M, junior-dev
- [ ] B4: `tests/OptionsSessionMap.test.ts` — cases: `put` then `get` returns entry; `delete` removes; `clear` empties; `get` for missing → `undefined`. — S, junior-dev
- [ ] B5: `tests/OptionsSnapshot.test.ts` — `snapshotEqualsCurrent`: equal model+effort → true; mismatched model → false; mismatched effort → false; effort `null` vs `'medium'` → false; both `null` → true. — S, junior-dev

### C. Obsidian mock additions (scaffolding for D and E)

#### Section briefing

1. **What this section produces** — modifications to `tests/__mocks__/obsidian.ts`: new exports `Plugin`, `PluginSettingTab`, `Setting`, `Platform`, `FileSystemAdapter`. No new files. See "Obsidian mock additions" under Interfaces for required shapes.
2. **Design context the executor needs upfront** — the mock must support both **node mode** and **happy-dom mode** (existing pattern at lines 81–95 of `obsidian.ts`: check `typeof document !== 'undefined'`). For elements: in happy-dom use `document.createElement('div')`; in node use `createMockElement()`. `Setting` must expose `settingEl` and `controlEl` as real `HTMLElement`s in happy-dom so the integration test can query the DOM. `Platform` is a plain object literal with a mutable `isDesktop` field — tests will write to it.
3. **Cross-section couplings** — A3 depends on C2 (`Platform`, `FileSystemAdapter`). D and E depend on C1 (`Plugin`, `PluginSettingTab`, `Setting`).
4. **Section-level Red criterion** — `import { Plugin, PluginSettingTab, Setting, Platform, FileSystemAdapter } from 'obsidian'` resolves in any test file. `new Setting(parent).setName('x').setDesc('y').addText(cb)` constructs without error in both environments and fires `cb` with a component object exposing `setValue`, `setPlaceholder`, `onChange`. The mock does not crash if a test uses only a subset of these.

**junior-dev**

- [ ] C1: Extend `tests/__mocks__/obsidian.ts` with `Plugin`, `PluginSettingTab`, `Setting`, `TextInputComponent`, `DropdownComponent`. Required surface (see Interfaces): `Plugin` ctor takes `app`, exposes `loadData = vi.fn(async () => undefined)` and `saveData = vi.fn(async () => {})`, `addCommand = vi.fn()`, `addSettingTab = vi.fn()`. `PluginSettingTab` ctor takes `(app, plugin)`, sets `containerEl` to `document.createElement('div')` (happy-dom) or mock element (node). `Setting` ctor takes `containerEl`; `settingEl` and `controlEl` are real elements appended to `containerEl` in happy-dom. `setName`, `setDesc` return `this`. `addText(cb)` calls `cb({ setValue, setPlaceholder, onChange, inputEl })`; the component object captures the registered `onChange` and exposes a `__triggerChange(value)` test hook that updates `inputEl.value` then fires the registered handler. `addDropdown(cb)` is symmetric: `cb({ addOption(id,label), setValue, onChange, selectEl })` plus `__triggerChange(value)`. — M, junior-dev
- [ ] C2: Extend `tests/__mocks__/obsidian.ts` with `Platform` and `FileSystemAdapter`. `Platform` is `export const Platform = { isDesktop: true };` (mutable). `FileSystemAdapter` is a class with a `getBasePath = vi.fn(() => '/test/vault')` method. — S, junior-dev

### D. Settings tab UI (integration test first, then implementation)

#### Section briefing

1. **What this section produces** — `src/ui/settings/GrimoireSettingTab.ts` (new) implementing the `GrimoireSettingTab` class described under Interfaces, and `tests/integration/settings-panel.spec.ts` exercising it through the Obsidian-mock seam. The integration test uses `// @vitest-environment happy-dom` (or the integration config picks that up) and runs under `npm run test:integration`.
2. **Design context the executor needs upfront** — copied verbatim from Key design decisions: "Settings rows write directly to `plugin.data.settings.<field>` and call `plugin.save()`. The store is the data; the UI is a thin write-through." And: "`EffortRow` is mounted once into the effort row's `controlEl` and reused via `update()`." Row order, fields, and components are listed under Interfaces — copy them; do not re-invent labels. The dropdown's onChange order is critical: write field first, then call `effortRow.update`, then `plugin.save()`. The effort row's `controlEl` hosts the `EffortRow` wrapper; `EffortRow.mount` is called once during `display()` and never again.
3. **Cross-section couplings** — D0 and D1 depend on C1 (`Plugin`, `PluginSettingTab`, `Setting` mock additions). D1 depends on D0 (test-driven). D1 must NOT modify `src/main.ts`; the integration test constructs a fake plugin object that satisfies `{ app, data, save }` — the real wiring lands in Section E.
4. **Section-level Red criterion** — `npm run test:integration` runs `settings-panel.spec.ts`. It constructs a fake plugin with `data: hydrate(undefined, app)` and `save = vi.fn()`, instantiates `new GrimoireSettingTab(app, plugin)`, calls `display()`, then asserts: (i) seven rows render (5 text + 1 dropdown + 1 effort), (ii) typing in the spell-tag input writes through to `plugin.data.settings.spellTag` and calls `plugin.save()` once, (iii) selecting `claude-haiku-4-5` in the dropdown removes the visible segmented control (effort row hides — `.grimoire-segmented` no longer in `controlEl`), (iv) selecting `claude-opus-4-5` after Haiku lazy-mounts the segmented control with Opus's 5 effort options, (v) clicking an effort button writes through to `plugin.data.settings.defaultEffort` and calls `plugin.save()`. All five assertions pass.

**ui-integration-tester**

- [ ] D0: `tests/integration/settings-panel.spec.ts` — write the failing seam test described in the Section-level Red criterion above. The test must NOT import `src/main.ts`; it constructs a minimal `plugin = { app, data: hydrate(undefined, app), save: vi.fn() }` and passes it to `new GrimoireSettingTab(app, plugin as any)`. Use `Setting`'s `__triggerChange` mock helper (from C1) to drive input/dropdown changes. Assertions cover: row count, text-input write-through + save call, dropdown → effort row hide, dropdown → effort row lazy-remount with correct options, effort click → save call. The test fails today because `src/ui/settings/GrimoireSettingTab.ts` does not exist. — S, ui-integration-tester

**senior-dev**

- [ ] D1: Implement `src/ui/settings/GrimoireSettingTab.ts` to make D0 green. Render the seven rows in the order specified under Interfaces. Mount one `EffortRow` instance into the effort row's `controlEl` during `display()`, supplying `models: SUPPORTED_MODELS` and `modelId: plugin.data.settings.defaultModel`, `effort: plugin.data.settings.defaultEffort`. The dropdown's `onChange(modelId)`: assign the field, call `effortRow.update(modelId, plugin.data.settings.defaultEffort)`, call `plugin.save()` — in that order. The effort row's `onChange(effort)`: assign `plugin.data.settings.defaultEffort = effort`, call `plugin.save()`. Each text input: assign field, call `plugin.save()`. Do NOT introduce reset/import/export/validation UI. Do NOT touch `src/main.ts` here — Section E does that. (Depends on D0.) — M, senior-dev

### E. Plugin wiring

#### Section briefing

1. **What this section produces** — modifications to `src/main.ts` and one new unit test `tests/main.test.ts` (or extend `tests/plugin.test.ts`). Final shape of `GrimoirePlugin` is given under Interfaces. The existing `addCommand('open-command-popup')` registration must be preserved; do not delete it.
2. **Design context the executor needs upfront** — copied verbatim from Key design decisions: "Persistence is debounced in one place — the plugin's `DebouncedSaver`. Rows do not call `saveData` directly; they call `plugin.save()`, which schedules." And: "`onunload` flush is the only hard persistence guarantee." `save()` is non-async (it just schedules). The order in `onload` matters: `hydrate` first (it needs `app`), then `saver` (needs `saveData`), then `overrides` (needs `data` and `saver`), then `addSettingTab` (needs `plugin` so the tab can read `data` and call `save`).
3. **Cross-section couplings** — E1 depends on D1 (settings tab class must exist). E1 depends on C1 (`Plugin` mock for the unit test).
4. **Section-level Red criterion** — `npm test` includes `main.test.ts` (or extended `plugin.test.ts`) and it asserts: (i) `onload` calls `loadData` then sets `plugin.data` to a hydrated `GrimoireData`, (ii) `onload` constructs one `DebouncedSaver` with delay 500 and a save callback that calls `plugin.saveData(plugin.data)`, (iii) `onload` calls `addSettingTab` once with a `GrimoireSettingTab` instance, (iv) `plugin.save()` schedules the saver (advance fake timer 500 ms → `saveData` called), (v) `plugin.onunload()` flushes a pending save (any pending timer fires synchronously). The existing `addCommand('open-command-popup')` registration is preserved — assertion: `addCommand` called with id `'open-command-popup'`.

**senior-dev**

- [ ] E1: Wire `src/main.ts` per the Interfaces section: declare `data!: GrimoireData`, `saver!: DebouncedSaver`, `overrides!: SpellOverrideStore`. In `onload`, in this order: hydrate, construct `DebouncedSaver(() => this.saveData(this.data), 500)`, construct `SpellOverrideStore({ data: this.data, saver: this.saver })`, `addSettingTab(new GrimoireSettingTab(this.app, this))`, then preserve the existing `addCommand` registration. Add `save(): void { this.saver.schedule(); }`. Replace `onunload`'s console.log with `this.saver.flush();`. Add `tests/main.test.ts` covering the five assertions in the Section-level Red criterion. Use fake timers for assertion (iv); use the `Plugin` mock from C1. (Depends on D1, C1.) — M, senior-dev

## Deferred edge cases

The following were considered during planning and consciously deferred:

- **Saved `defaultModel` references an unknown model id.** Today `EffortRow.update` short-circuits with `console.error`. The dropdown will display the saved id even if it's not in `SUPPORTED_MODELS`. Not corrected here; pushing model-id validation into `hydrate` would mix UI policy into the domain layer. Future: add a soft-correction in the dropdown's `display()` that snaps to `SUPPORTED_MODELS[0]` if the saved id is unknown.
- **`vaultMountPath` on non-desktop reverting after the user clears it.** If a user manually empties the field on desktop, the next `hydrate` call will repopulate it from `getBasePath()`. Acceptable for this iteration — tested as part of `hydrate` behaviour.
- **Concurrent settings tab opens.** Obsidian re-uses the same `PluginSettingTab` instance; opening twice calls `display()` twice. The current implementation re-mounts a fresh `EffortRow` each time (no memory leak because `containerEl` is emptied first). Not specifically tested — `display()` idempotency is a future concern if Obsidian's behaviour changes.
- **`saveData` rejecting after `onunload` flush.** Already swallowed by `DebouncedSaver`'s try/catch (tested in A1e). No additional handling.
- **Effort row out-of-sync persistence (decision 7).** When the user picks Opus → `xhigh`, then Sonnet, the row falls back to displaying `medium` but `data.settings.defaultEffort` keeps `xhigh` until the user touches the effort row. Documented under Key design decisions; acceptable. Future: revisit when adding per-spell overrides UI.

## Effort & dev-tier summary

| Tier | Count | Effort breakdown |
|---|---|---|
| junior-dev | 8 (A1–A5, B3, B4, B5, C1, C2, B1, B2) | S: 7, M: 3 |
| ui-integration-tester | 1 (D0) | S: 1 |
| senior-dev | 2 (D1, E1) | M: 2 |
| lead-dev | 0 | — |

**Total:** 14 todos. Effort: S × 9, M × 5, L × 0.

Junior-dev dominates because the bulk of the work is characterisation tests over committed PoC modules whose behaviour is already determined. Senior-dev owns the two new components (`GrimoireSettingTab` and `main.ts` wiring) because both involve component-seam decisions (write order in the dropdown handler, lifecycle ordering in `onload`) that aren't fully predetermined in the plan and need judgment to test cleanly.
