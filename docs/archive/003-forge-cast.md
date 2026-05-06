# 003 — Forge Cast (end-to-end wiring)

## Complexity

**Medium.** The PoC code for spawn / args / binary resolution / meta-spell / sanitiser / `ForgeImprinter` / `CastDispatcher` / `CastRunner` is already on disk untracked. The only new production work is (a) adding an `effort` field to `ForgeSentinelDetail`, (b) threading an `ImprintAction` from `main.ts` through `CommandPopup` down to the detail, and (c) constructing `ForgeImprinter` in `main.ts` with a `Notice`-backed `notify`. Plus a substantial test backfill across the frozen PoC modules and one new integration spec covering the popup→detail→imprinter seam. No concurrency, no security surface, no cross-module invariants beyond the existing `vaultMountPath` env contract.

## Goal & scope

Wire the Forge sentinel form so submitting it actually invokes `ForgeImprinter.imprint(snapshot, settings, close)`, which spawns Claude Code via `CastRunner` and writes a new spell file to the vault. Replace the placeholder `onSubmit: exit` in `CommandPopup.renderForgeSentinelDetail` with a real `ImprintAction`. Backfill unit tests across the frozen Cast/Forge PoC modules so the codebase stays test-clean for the next iteration.

### In scope

- `ForgeSentinelDetail` gains an `effort` `<select>` (or equivalent control) so submission produces a complete `ForgeFormSnapshot`. Defaults pulled from `settings.defaultModel` and `settings.defaultEffort`.
- `ForgeSentinelDetail` callback `onSubmit` switches from `(data: ForgeFormData) => void` to `(snapshot: ForgeFormSnapshot) => void`. The intermediate `ForgeFormData` type is deleted.
- `CommandPopup` constructor accepts an injected `imprintAction: ImprintAction` (alias `(snapshot: ForgeFormSnapshot) => void`) and passes it down to `ForgeSentinelDetail.onSubmit` — wrapped so the popup also calls the existing `exitDetail()` after the action returns. (`ForgeImprinter` still owns the user-visible `close` — it calls the `close` parameter passed to `imprint`. The popup wires `close` to `exitDetail`.)
- `CommandPopup` accepts the user's current settings (or a `() => GrimoireSettings` snapshot getter) so it can hand `settings` to the imprint action at submit time. Decision recorded in *Key design decisions* below.
- `main.ts` constructs a `ForgeImprinter` (`new ForgeImprinter({ notify: (msg) => new Notice(msg), castRunner: new CastRunner() })`) and supplies the popup with an `ImprintAction` closure that calls `imprinter.imprint(snapshot, this.data.settings, close)`.
- Obsidian mock gains `Notice` (constructor-only spy class — captures the message string, no DOM behaviour).
- Unit tests for the previously-untested Cast/Forge PoC modules: `sanitiseSpellName`, `buildMetaSpell`, `buildCastArgs`, `resolveCliBinary`, `CastSpawner` (the inner class in `spawnCast.ts`), `CastRunner`, `CastDispatcher`, `ForgeImprinter`.
- One new UI integration spec at the popup → form → imprint-action seam (the imprint action is stubbed as a `vi.fn()` at the `CommandPopup` constructor — `CastRunner` is *not* invoked; below-the-seam coverage lives in `ForgeImprinter`'s unit tests with a stubbed `CastRunner`).
- Updates to existing `tests/ForgeSentinelDetail.test.ts` and `tests/integration/forge-sentinel-detail.spec.ts` to reflect the new `effort` field and snapshot-shaped callback.
- Updates to `tests/CommandPopup.test.ts` to thread the new `imprintAction` constructor argument (default to `vi.fn()` in the existing `makeApp()` helper).
- Update `tests/integration/harness.ts` `submitForge` to accept an `effort` field and to construct `CommandPopup` with the new constructor signature.

### Out of scope

- **Cast Log, `castId`, streaming, cancel, retry** — the pitch is explicit. Only the toasts the imprinter already emits.
- Refactoring the frozen PoC modules (`src/cast/*`, `src/forge/*`). They are tested **as committed**. If a unit test would force a source change, the source is wrong, not the test, and a follow-up plan is required (same convention as `002-settings-panel.md`).
- Wiring `CastDispatcher` into the popup (the dispatcher is for the *other* code path — casting an existing spell against the active note — which the popup does not yet expose). It still gets unit tests because it's frozen PoC.
- Real Obsidian end-to-end tests against a running vault.
- Validation UI inside the form (e.g. inline error when the name sanitises to empty). The imprinter already toasts `"Spell name is invalid after sanitisation"` and dismisses the popup; the form doesn't get a duplicate path.
- Persisting the user's last-used model/effort selection back to settings. The form reads defaults from settings but does not write back.
- Sentinel kinds other than Forge.

## Proposed solution

1. Backfill unit tests across the eight frozen PoC modules first (Section A). They require zero new production code — pure characterisation tests over committed behaviour, mirroring the `002` playbook.
2. Add `Notice` to the Obsidian mock (Section B). Required by Section E (`main.ts` wiring) and by any test that exercises `ForgeImprinter`'s real `notify` path.
3. Define the new public types — `ForgeFormSnapshot`-shaped `onSubmit` callback, `ImprintAction` alias — and update existing tests to compile against them (Section C). Scaffolding-only; no behavioural change yet.
4. Write the **integration test** that pins the new seam (Section D, **ui-integration-tester** group): build a `CommandPopup` with a stub `imprintAction`, navigate Spells → Forge sentinel → fill the form → submit → assert the action receives the expected snapshot, the popup leaves detail phase, and the modal stays open.
5. Implement the production wiring to make Section D green (Section D, senior-dev group): add `effort` field to `ForgeSentinelDetail`; switch its `onSubmit` to emit `ForgeFormSnapshot`; thread `imprintAction` through the `CommandPopup` constructor; update `renderForgeSentinelDetail` to invoke `imprintAction(snapshot)` then `exitDetail()`.
6. Wire `main.ts` (Section E): construct `ForgeImprinter` once with `Notice`-backed `notify`, build the `imprintAction` closure that calls `imprinter.imprint(snapshot, this.data.settings, close)`, pass it into the `CommandPopup` constructor at command-callback time.

## Components

| Component | Location | Responsibility | Status |
|---|---|---|---|
| `sanitiseSpellName` | `src/forge/sanitiseSpellName.ts` | Strip illegal filename chars, collapse dashes, trim | UNCHANGED — tests added |
| `buildMetaSpell` | `src/forge/buildMetaSpell.ts` | Build the meta-prompt sent to Claude Code that authors a spell file | UNCHANGED — tests added |
| `ForgeImprinter` | `src/forge/ForgeImprinter.ts` | Sanitise → build meta-spell → notify → spawn cast → notify result | UNCHANGED — tests added |
| `ForgeFormSnapshot` | `src/forge/ForgeFormSnapshot.ts` | Type for `{ description, name, model, effort: Effort \| null }` | UNCHANGED |
| `buildCastArgs` | `src/cast/buildCastArgs.ts` | Build `claude` CLI args from input (inline or file mode) | UNCHANGED — tests added |
| `resolveCliBinary` | `src/cast/resolveCliBinary.ts` | Pick `binaryPath` if non-empty, else `cliCommand` | UNCHANGED — tests added |
| `CastSpawner` | `src/cast/spawnCast.ts` | Run the subprocess; resolve once on first of `exit` / `error`; capture stderr tail | UNCHANGED — tests added |
| `CastRunner` | `src/cast/CastRunner.ts` | Compose binary + args + spawn; route exit/error to `onSuccess`/`onFailure` | UNCHANGED — tests added |
| `CastDispatcher` | `src/cast/CastDispatcher.ts` | Build user prompt, notify "Casting…", invoke `CastRunner.run` for spell-on-note casts | UNCHANGED — tests added |
| `ForgeSentinelDetail` | `src/ui/components/ForgeSentinelDetail.ts` | Render Forge form (now with effort), emit `ForgeFormSnapshot` on submit | MODIFIED |
| `CommandPopup` | `src/ui/CommandPopup.ts` | Accept `imprintAction` in constructor; thread it into `ForgeSentinelDetail.onSubmit` | MODIFIED |
| `GrimoirePlugin` | `src/main.ts` | Construct `ForgeImprinter` with `Notice`-backed `notify`; pass `imprintAction` closure into `CommandPopup` | MODIFIED |
| Obsidian mock | `tests/__mocks__/obsidian.ts` | Add `Notice` (constructor spy) | MODIFIED |
| Existing tests | `tests/CommandPopup.test.ts`, `tests/ForgeSentinelDetail.test.ts`, `tests/integration/forge-sentinel-detail.spec.ts`, `tests/integration/harness.ts` | Updated to reflect new constructor signature, new field, new snapshot-shaped callback | MODIFIED |

## Interfaces

### `ImprintAction` (new alias)

```ts
// Used by CommandPopup; closure built in main.ts.
export type ImprintAction = (snapshot: ForgeFormSnapshot) => void;
```

The closure built in `main.ts` is responsible for capturing both the imprinter and the current settings (`this.data.settings`). It also captures the popup's `close` callback — but since the popup wants to control its own teardown, the popup wraps the action: it calls `imprintAction(snapshot)`, then `exitDetail()`. The imprinter's own `close` parameter is wired by the popup to the same `exitDetail`. The double-call is harmless because `exitDetail` is idempotent (it nulls `#onDetailBack` on first call). See *Key design decisions §3*.

### `ForgeSentinelDetail` (modified)

```ts
import { ForgeFormSnapshot } from '../../forge/ForgeFormSnapshot';
import { Effort, SUPPORTED_MODELS } from '../../domain/settings/Settings';

interface Callbacks {
  onBack: () => void;
  onSubmit: (snapshot: ForgeFormSnapshot) => void;     // was (data: ForgeFormData) => void
}

interface FormDefaults {
  defaultModel: string;          // settings.defaultModel
  defaultEffort: Effort | null;  // settings.defaultEffort
}

export class ForgeSentinelDetail {
  constructor(
    contentEl: HTMLElement,
    scope: Scope,
    callbacks: Callbacks,
    defaults: FormDefaults,            // NEW — last param so tests with positional mocks fail loudly
  );
  destroy(): void;                     // unchanged
}
```

- Model `<select>` is populated from `SUPPORTED_MODELS` (id, label) — replacing the hardcoded `['haiku', 'sonnet', 'opus']` list. Selected value defaults to `defaults.defaultModel` if it is among the supported ids, otherwise to the first supported id.
- A new effort `<select>` is mounted alongside the model select. Options: `['low', 'medium', 'high', 'xhigh', 'max']` (the full `Effort` union). Plus a `(none)` option whose underlying value is the empty string and which maps to `null` on submit. Selected value defaults to `defaults.defaultEffort` (or `(none)` if it is `null`).
- The existing keyboard ArrowUp/ArrowDown handlers remain bound to the **model** select only (matches today's behaviour). Effort cycling via keyboard is out of scope for this iteration — the user uses Tab + Space/click to change effort. Documented in *Out of scope*.
- The `ForgeFormData` type is deleted from this file. `onSubmit` receives a `ForgeFormSnapshot` where `effort` is `Effort | null` (the empty-string option maps to `null` before emitting).

### `CommandPopup` (modified)

```ts
import type { ImprintAction } from '...';

export class CommandPopup extends Modal {
  constructor(app: App, spellTag: string, imprintAction: ImprintAction, defaults: FormDefaults);
  // ... unchanged below
}
```

- The new `imprintAction` and `defaults` parameters are stored on private fields and forwarded into `ForgeSentinelDetail` from `renderForgeSentinelDetail`. `onSubmit` becomes:
  ```ts
  onSubmit: (snapshot) => {
    this.#imprintAction(snapshot);
    exit();   // exitDetail
  }
  ```
- Defaults travel as a small `FormDefaults` object (same shape as in `ForgeSentinelDetail`) rather than the full `GrimoireSettings`. Rationale: the popup has no other reason to know the seven settings fields; the imprinter's closure already captures `settings` directly. Keeps the popup's surface minimal. (See *Key design decisions §1*.)

### `GrimoirePlugin` (modified)

```ts
// src/main.ts
async onload(): Promise<void> {
  // ... existing wiring ...
  const imprinter = new ForgeImprinter({
    notify: (msg) => { new Notice(msg); },
    castRunner: new CastRunner(),
  });
  this.addCommand({
    id: 'open-command-popup',
    name: 'Open Grimoire',
    callback: () => {
      const popup = new CommandPopup(
        this.app,
        this.data.settings.spellTag,
        (snapshot) => imprinter.imprint(snapshot, this.data.settings, () => popup.close()),
        { defaultModel: this.data.settings.defaultModel, defaultEffort: this.data.settings.defaultEffort },
      );
      popup.open();
    },
  });
}
```

- `imprinter` is constructed once at `onload` (single `Notice` factory, single `CastRunner`). Settings are read **at submit time** through the closure capturing `this.data.settings`, so changes made in the Settings tab between popup opens take effect on the very next cast — no stale snapshot. (See *Key design decisions §2*.)
- The closure-passed `close` calls `popup.close()`. Obsidian's `Modal.close()` triggers the popup's overridden `close()`, which already routes through `exitDetail` when `phase === 'detail'`. So the imprinter's "dismiss the popup" semantics work unchanged.

### `Notice` (Obsidian mock, new)

```ts
// tests/__mocks__/obsidian.ts
export class Notice {
  static instances: Notice[] = [];
  constructor(public readonly message: string) {
    Notice.instances.push(this);
  }
}
```

Tests that need to assert toasts read `Notice.instances`. Reset between tests via `beforeEach(() => { Notice.instances.length = 0; })`. No DOM, no timeouts — the production `Notice` constructor in Obsidian also has side effects we explicitly do not model.

## Data flow

```
main.ts (onload)
  │
  │  builds: imprinter = new ForgeImprinter({ notify: msg => new Notice(msg), castRunner: new CastRunner() })
  │
  │  on command "Open Grimoire":
  │    popup = new CommandPopup(app, spellTag, imprintAction, defaults)
  │       where imprintAction = snapshot =>
  │         imprinter.imprint(snapshot, this.data.settings, () => popup.close())
  │
  ▼
CommandPopup (Spells tab, Enter on Forge sentinel)
  │
  ▼
ForgeSentinelDetail (form: name, description, model, effort)
  │  user types + clicks Submit
  │  onSubmit({ name, description, model, effort: Effort | null })
  ▼
imprintAction(snapshot)  ──►  ForgeImprinter.imprint(snapshot, settings, close)
                                 │
                                 │  sanitiseSpellName → "" ? notify "invalid" + close → return
                                 │  buildMetaSpell(snapshot + settings)
                                 │  notify "Forging \"<name>\"…"
                                 │  close()                    ── popup dismissed
                                 │  CastRunner.run({ metaSpell, model, effort, ...paths },
                                 │                  { onSuccess, onFailure })
                                 │     │
                                 │     ▼
                                 │  CastSpawner.run({ binary, args, env: { VAULT_MOUNT_PATH }, cwd })
                                 │     │
                                 │     ▼
                                 │  child process: claude --system-prompt-file ... or claude -p <metaSpell>
                                 │     ▼
                                 │  exit 0  → notify "Spell \"<name>\" forged"
                                 │  exit !=0 → notify "Forge failed: <stderrTail | exit N>"

CommandPopup also calls exitDetail() after imprintAction returns
  → second close() is a no-op because #onDetailBack was already cleared by imprinter's close()
```

## Error handling

- **Empty/whitespace name → empty after sanitise.** `ForgeImprinter` toasts `"Spell name is invalid after sanitisation"` and calls `close()`. Behaviour is committed. The form does not duplicate this validation. **Edge case is explicit and tested in unit tests.**
- **Spawn failure (binary missing, ENOENT, EACCES).** `CastSpawner.run` resolves with `{ code: null, error, stderrTail }`. `CastRunner` routes that to `callbacks.onFailure(error.message)`. `ForgeImprinter` toasts `"Forge failed: <message>"`. **Tested in `CastSpawner` and `CastRunner` unit tests.**
- **Sync spawner throw (e.g. invalid args constructed by future change).** `CastSpawner.run`'s `try { spawner(...) } catch { reject(err) }` rejects the promise; `CastRunner.onCastError` logs to console and routes to `onFailure`. **Tested.**
- **Both `exit` and `error` fire (race).** `CastSpawner.safeResolve` ensures only the first wins via the `fired` flag. **Tested.**
- **Backpressure on stdout.** `CastSpawner` already drains stdout (`child.stdout.on('data', () => {})`). Tested by exercising the data event with no consumer assertion.
- **`vaultMountPath === ""` (unset settings).** `buildCastArgs` skips `--add-dir` in that case (existing behaviour). Cast may still succeed if Claude can find the file. **Tested in `buildCastArgs` unit tests.**
- **`effort === null`.** `buildCastArgs` and `buildMetaSpell` both branch on this. **Tested.**
- **Submit before settings are configured (empty `binaryPath` *and* empty `cliCommand`).** `resolveCliBinary` returns `""` and `spawn("")` will throw → `onFailure("spawn error")`. **Documented; surfaces as a `Forge failed:` toast.** No new validation UI in this iteration.
- **Multiple submits in quick succession.** Today the popup closes on first submit, so the user cannot submit twice from the same form. Each submit spawns one independent subprocess. No locking required.
- **Form submission with all three fields blank.** `name === ""` → invalid → toast + close (covered by sanitise edge case above). No separate "all blank" check.

## Key design decisions

1. **Popup takes `imprintAction` and `defaults`, not the full `GrimoireSettings`.** The imprinter's closure already captures `this.data.settings` for use at submit time. The popup needs only enough to construct the form's defaults. This keeps the popup's interface from coupling to seven unrelated fields and makes the test seam smaller (a `vi.fn()` action + a tiny `defaults` object).
2. **Settings are read inside the closure, not at popup-construction time.** A user who edits "Default model" in Settings then opens the popup gets the new model immediately. No staleness because the closure dereferences `this.data.settings` on each submit. The defaults handed to the form do snapshot at popup construction — that's correct because the form is mounted on open and not re-rendered.
3. **The popup's `onSubmit` wrapper calls `imprintAction(snapshot)` *then* `exitDetail()`.** The imprinter's own `close` parameter is wired to `() => popup.close()` (in `main.ts`'s closure). Both paths converge on `exitDetail` because `popup.close()` while in detail phase routes there. The double-trip is intentional and idempotent: it ensures the popup is dismissed even if a future imprinter implementation forgets to call `close`. Documented in `Interfaces` above.
4. **Effort is captured by a `<select>` not a segmented control.** The settings panel uses `EffortRow`/`SegmentedControl`; the form does not. Reason: the form's effort is a per-cast override and its model→effort gating is *not* enforced (Haiku has no efforts but the form lets you pick one; the user is responsible). A segmented control with disabled options would suggest validation that isn't implemented and isn't planned. A plain `<select>` plus `(none)` is honest about the affordance. Recorded as a deferred edge case.
5. **`SUPPORTED_MODELS` becomes the source of truth for the model dropdown** (replacing the hardcoded `['haiku','sonnet','opus']`). Same source the settings panel uses. Future changes to supported models propagate automatically.
6. **No new abstraction in `ForgeImprinter`.** It already takes `notify` and `castRunner` as constructor deps — both injectable for tests, both replaceable for a hypothetical alternative runner. Strategy-pattern wrapping was considered and rejected: only one runner exists, and `castRunner` injection is already a Strategy seam in disguise.
7. **`Notice` adapter lives at the `main.ts` boundary, not inside `ForgeImprinter`.** Keeps the imprinter pure (no `obsidian` imports), so its unit tests stay node-only. Adapter pattern; passes Step 3.

## Patterns considered

| Pattern | Decision | Reason |
|---|---|---|
| Action / Command callable (`ImprintAction`) | **Adopted** | Decouples popup from `ForgeImprinter`/settings/`Notice`; minimal seam for the integration test stub. |
| Adapter for `Notice` → `notify` | **Adopted** | Keeps `ForgeImprinter` import-free of `obsidian`; unit-testable in node env. |
| Factory for `imprintAction` in `main.ts` | **Adopted** | `main.ts` is the sole composition root; popup constructor is a plain function-injection consumer. |
| Strategy for swapping spawners | **Rejected** | Already encoded as `SpawnFn` injection in `CastSpawner` — adding a wrapper layer is YAGNI. |
| Strategy for swapping runners inside `ForgeImprinter` | **Rejected** | `castRunner` constructor dep is the Strategy seam; no second runner type exists. |
| Builder for `CastRunInput` | **Rejected** | The two discriminated-union shapes (`InlineCastRunInput` / `FileCastRunInput`) are constructed in exactly two places (`ForgeImprinter`, `CastDispatcher`); a builder would add ceremony with no second call site. |
| Observer / event bus around imprint result | **Rejected** | `notify` is sufficient. No code today wants to react to "spell forged" beyond the toast. |
| State machine in `ForgeSentinelDetail` | **Rejected** | The form has no states beyond "filled/unfilled" which the DOM tracks for free. |
| Validation chain in the form (empty name → inline error before submit) | **Rejected** | Imprinter already toasts and dismisses. Adding inline UI duplicates the contract and is out of scope. |

## Technical notes

- **PoC code is on disk untracked.** `git status` shows `src/cast/` and `src/forge/` as untracked. The first dev step ("scaffold tier") is to read each PoC file and stage it as the starting point — not to invent the API. Tests are written *against* the committed shape; if a test forces a source change, the source is wrong and a follow-up plan is required.
- **The `obsidian` package is mocked at `tests/__mocks__/obsidian.ts`.** Any new import (`Notice`) must be added to the mock before the test that uses it.
- **Unit-test environment is node, not happy-dom.** `ForgeImprinter` and friends never touch the DOM, so this is fine. The integration test (Section D's tester) lives under `tests/integration/` and runs in happy-dom via `vitest.integration.config.ts`.
- **`CastSpawner` tests need a fake `SpawnFn`.** Pattern: construct a fake `SpawnedProcess` with `EventEmitter`-shaped `on(event, handler)` methods, return it from a `vi.fn()` `SpawnFn`, then drive `exit` / `error` / `data` events synchronously from the test. The internal `Promise<CastExitInfo>` resolves on next microtask — `await runner.run(...)` flushes it.
- **`buildMetaSpell` test strategy is snapshot-friendly** but inline assertions on substrings (`Description:`, `Name (already sanitised):`, `Effort: medium`, `[${spellTag}]`, `${forgeOutputFolder}${name}.md`) are preferable so a future copy edit doesn't drown the diff. The `effort === null` branch must be covered (output: `Effort: n/a`).
- **`sanitiseSpellName` edge cases:** empty input, whitespace-only, all-illegal, leading/trailing dashes, runs of dashes, control characters. Each becomes one `it()`.
- **`buildCastArgs` branches:** inline mode (`metaSpell`) vs file mode (`systemPromptFile` + `userPrompt`); `effort === null` vs set; `vaultMountPath === ""` vs set. 4 × 2 × 2 = 8 cases is too many; aim for one happy path per mode plus one focused test per branch.
- **`CastDispatcher` is unit-tested with a stubbed `CastRunner`** (the `castRunner?` constructor dep). Cover: `activeFilePath === null` early return, prompt construction with/without context notes, with/without follow-up, success/failure callbacks routing to notify.
- **`ForgeImprinter` is unit-tested with a stubbed `CastRunner`** (constructor dep). Cover: invalid-name early return + close, happy path notify-then-cast-then-success-toast, failure routing to `Forge failed: <msg>`.
- **Integration test stubs the imprint action at the popup constructor** — it does not stub `CastRunner` or `ForgeImprinter`. The seam this test pins is "popup → form → action callback", not "popup → ... → subprocess". Below-the-seam coverage is the unit tests' job. (UI-test-rubric Section 1.)
- The `tests/CommandPopup.test.ts` tests that capture `onSubmit` from the FSD constructor (lines 163–186) currently call it with no args — they assert resume behaviour, not snapshot shape. After the type change they must call it with a stub snapshot: `capturedOnSubmit!({ name: '', description: '', model: 'sonnet', effort: null })`.

## Todos

### A. Backfill unit tests for the frozen Cast/Forge PoC (no new production code)

#### Section briefing

**What this section produces:** Eight new unit-test files under `tests/`, one per frozen PoC module, all in the node vitest env. No `src/` changes. Files: `tests/sanitiseSpellName.test.ts`, `tests/buildMetaSpell.test.ts`, `tests/buildCastArgs.test.ts`, `tests/resolveCliBinary.test.ts`, `tests/CastSpawner.test.ts`, `tests/CastRunner.test.ts`, `tests/CastDispatcher.test.ts`, `tests/ForgeImprinter.test.ts`.

**Design context the executor needs upfront:** From *Out of scope*: "PoC files are frozen by this iteration; we test them as committed. If a unit test would force a source change, the source is wrong, not the test, and a follow-up plan is required." From *Technical notes*: `CastSpawner` tests use a `vi.fn()` `SpawnFn` returning a fake `SpawnedProcess` with `EventEmitter`-shaped `on(event, handler)`; `CastDispatcher` and `ForgeImprinter` are tested with a stubbed `CastRunner` injected via the `castRunner` constructor dep.

**Cross-section couplings:** None. This section produces tests against committed PoC code only; no other section depends on these tests, and these tests do not depend on Section B/C/D/E changes.

**Section-level Red criterion:** Eight new test files exist; running `npm test` shows them in the suite list and they all pass on the unmodified PoC source. Each `it()` exercises one branch identified in *Technical notes* (sanitise edges; `buildMetaSpell` substring + `effort === null` branch; `buildCastArgs` happy paths × inline/file × effort-null × empty-vault; `resolveCliBinary` two arms; `CastSpawner` exit-success / exit-failure / spawn-error-async / spawn-throw-sync / fired-flag race / stderr-tail truncation; `CastRunner` happy path → onSuccess + non-zero exit → onFailure(stderrTail) + spawn error → onFailure(err.message); `CastDispatcher` activeFilePath-null / prompt with/without context+followUp / runner injection / success+failure routing; `ForgeImprinter` invalid-name early return / happy-path toast sequence / failure toast).

**junior-dev**

- [x] A1: write `tests/sanitiseSpellName.test.ts` covering empty, whitespace-only, all-illegal-chars (`<>:"/\|?*` and `\x00-\x1f`), runs of dashes collapsing, leading/trailing dash trim, mixed legal+illegal — at least 6 `it()` blocks. Use the spec from `src/forge/sanitiseSpellName.ts`. — S, junior-dev (04f0adc)
- [x] A2: write `tests/buildMetaSpell.test.ts` asserting (a) the output contains `Description: <input>`, `Name (already sanitised): <input>`, `Model: <input>`, `Effort: medium` for `effort='medium'`; (b) for `effort=null` the output contains `Effort: n/a`; (c) the output contains the spell-tag string `[${spellTag}]`; (d) the output contains `${forgeOutputFolder}${name}.md`. Inline substring assertions, no snapshot files. — S, junior-dev (04f0adc)
- [x] A3: write `tests/buildCastArgs.test.ts` covering: inline-mode (`metaSpell` set) → `["-p", metaSpell, "--model", id, "--permission-mode", "dontAsk"]`; file-mode (`systemPromptFile`+`userPrompt`) → `["--system-prompt-file", path, "-p", prompt, ...]`; `effort=null` omits `--effort`; `effort='high'` appends `["--effort", "high"]`; `vaultMountPath=""` omits `--add-dir`; `vaultMountPath='/v'` appends `["--add-dir", "/v"]`. — S, junior-dev (04f0adc)
- [x] A4: write `tests/resolveCliBinary.test.ts` covering both branches: non-empty `binaryPath` wins; empty `binaryPath` falls back to `cliCommand`; both empty returns `""`. — S, junior-dev (04f0adc)
- [x] A5: write `tests/CastSpawner.test.ts` covering: exit code 0 → `{ code: 0, stderrTail: '' }`; exit code 1 with stderr → `{ code: 1, stderrTail: <text> }`; async spawn error event → `{ code: null, error, stderrTail }`; sync spawn throw → promise rejects; `fired` flag prevents double-resolve when both `exit` and `error` fire; stderr longer than `STDERR_TAIL_LIMIT` (500) is truncated to last 500 chars. Build a `vi.fn()` `SpawnFn` returning a fake `SpawnedProcess` with `on(event, handler)` and `stdout.on` / `stderr.on`; drive events synchronously from the test. — M, junior-dev (04f0adc)
- [x] A6: write `tests/CastRunner.test.ts` covering: happy path with `code === 0` calls `onSuccess`; non-zero exit calls `onFailure(stderrTail)`; spawn error calls `onFailure(err.message)`; binary path is taken from `binaryPath` when set, `cliCommand` otherwise (verify by inspecting the args passed to the injected `SpawnFn`); env passed to spawner contains `VAULT_MOUNT_PATH: input.vaultMountPath`; cwd is `input.vaultMountPath`. Construct via `new CastRunner(fakeSpawnFn)` and assert against the fake. — M, junior-dev (04f0adc)
- [x] A7: write `tests/CastDispatcher.test.ts` covering: `activeFilePath === null` toasts `'Open a note to cast against'` and closes; happy path with no context notes / no followUp produces the "Execute this spell against …" prompt; with context notes appends `Additional context notes: a, b.`; with followUp appends `Follow-up: <text>`; success callback routes to `'Spell cast'` notify; failure routes to `'Cast failed: ' + msg`. Inject a stub `CastRunner` whose `run` captures input + immediately invokes the relevant callback. — M, junior-dev (04f0adc)
- [x] A8: write `tests/ForgeImprinter.test.ts` covering: empty-after-sanitise name → notify `'Spell name is invalid after sanitisation'` + `close()` + no runner call; happy path → notify `'Forging "<sanitised>"…'` + `close()` + runner called with `metaSpell` matching `buildMetaSpell` output (substring assertion only) + onSuccess routes to notify `'Spell "<sanitised>" forged'`; onFailure routes to `'Forge failed: <msg>'`. Inject a stub `CastRunner` whose `run` captures input + invokes the chosen callback. — M, junior-dev (04f0adc)

### B. Add `Notice` to the Obsidian mock

#### Section briefing

**What this section produces:** A `Notice` class added to `tests/__mocks__/obsidian.ts` matching the shape in *Interfaces → `Notice` (Obsidian mock, new)*. No source changes; no test changes (tests that consume `Notice` are added in Sections D and E's accompanying test edits).

**Design context the executor needs upfront:** From *Interfaces*: the mock holds `static instances: Notice[] = []` and pushes each constructed instance. From *Technical notes*: "Any new import (`Notice`) must be added to the mock before the test that uses it." Tests reset state via `beforeEach(() => { Notice.instances.length = 0; })`.

**Cross-section couplings:** B1 unblocks E1 (which imports `Notice` in `main.ts`) and any test in Section D or E that asserts toast contents. B1 must land before any test that reads `Notice.instances`.

**Section-level Red criterion:** `tests/__mocks__/obsidian.ts` exports `Notice`; constructing `new Notice('hi')` from a test file pushes a `{ message: 'hi' }` entry onto `Notice.instances`; the existing unit and integration suites still pass (no regression).

**junior-dev**

- [x] B1: add `Notice` class to `tests/__mocks__/obsidian.ts` exactly as specified in *Interfaces → `Notice` (Obsidian mock, new)*. Verify by running the existing `npm test` — no test should break. Add no other exports. — S, junior-dev

### C. Type scaffolding for the new contract (no runtime behaviour change)

#### Section briefing

**What this section produces:** The new `ImprintAction` type alias and the new `FormDefaults` shape, declared in their target files. The `ForgeFormData` type is deleted from `ForgeSentinelDetail.ts`. Existing tests that reference `ForgeFormData` are updated to import / inline the equivalent `ForgeFormSnapshot` shape — but production behaviour is otherwise unchanged: `ForgeSentinelDetail`'s submit handler still emits `{ name, description, model }`, with `effort` and the new `defaults` constructor parameter introduced in Section D. This section is purely a type-scaffolding pass so D and E don't have to invent types and update consumers in the same step.

**Design context the executor needs upfront:** From *Interfaces → `ImprintAction`*: `export type ImprintAction = (snapshot: ForgeFormSnapshot) => void;`. From *Interfaces → `ForgeSentinelDetail`*: `interface FormDefaults { defaultModel: string; defaultEffort: Effort | null }`. From *Out of scope*: PoC files frozen; this section touches **only** the UI files (`ForgeSentinelDetail.ts`, `CommandPopup.ts`) and tests, never `src/forge/*` or `src/cast/*`.

**Cross-section couplings:** C1 must land before D2 / D3 / D4 (which consume the new types). C2's deletion of `ForgeFormData` requires the test updates in C3 to land in the same commit or compilation breaks.

**Section-level Red criterion:** `npm run build` and `npx tsc --noEmit` both pass. `ImprintAction` is exported from `src/ui/CommandPopup.ts` (or a sibling types file — pick one, document inline). `ForgeFormData` is no longer exported from `ForgeSentinelDetail.ts`. `tests/ForgeSentinelDetail.test.ts` and `tests/integration/forge-sentinel-detail.spec.ts` both compile and still pass with the new snapshot-shaped `onSubmit` (the runtime payload remains `{ name, description, model }` plus a placeholder `effort: null` field added by the form — see C2's note below).

**junior-dev**

- [x] C1: declare `export type ImprintAction = (snapshot: ForgeFormSnapshot) => void;` and `export interface FormDefaults { defaultModel: string; defaultEffort: Effort | null }` at the top of `src/ui/CommandPopup.ts`. Import `ForgeFormSnapshot` from `src/forge/ForgeFormSnapshot.ts` and `Effort` from `src/domain/settings/Settings.ts`. — S, junior-dev
- [x] C2: in `src/ui/components/ForgeSentinelDetail.ts`, delete the `ForgeFormData` type. Change the `Callbacks.onSubmit` parameter type from `(data: ForgeFormData)` to `(snapshot: ForgeFormSnapshot)`. Import `ForgeFormSnapshot` from `src/forge/ForgeFormSnapshot.ts`. In `wireSubmitHandler`, **temporarily** emit `{ name, description, model, effort: null }` so the type matches — actual effort capture is wired in D2. — S, junior-dev
- [x] C3: update `tests/ForgeSentinelDetail.test.ts` to expect the snapshot shape `{ name, description, model, effort: null }` in the `'submitting form calls onSubmit with ForgeFormData'` test (rename it to `'submitting form calls onSubmit with ForgeFormSnapshot'`). Update `tests/integration/forge-sentinel-detail.spec.ts` `D1b` to expect `{ name: 'X', description: 'Y', model: 'sonnet', effort: null }`. Update `tests/CommandPopup.test.ts`'s `capturedOnSubmit!()` call to pass a stub snapshot `{ name: '', description: '', model: 'sonnet', effort: null }`. — S, junior-dev

### D. Wire the popup → form → imprint-action seam

#### Section briefing

**What this section produces:** The integration test (D0) that pins the new seam, and the production wiring that makes it green: `ForgeSentinelDetail` learns the `effort` field and the `defaults` constructor parameter; `CommandPopup` accepts `imprintAction` + `defaults` in its constructor and threads them into `renderForgeSentinelDetail`. Files touched: `tests/integration/forge-cast.spec.ts` (new), `src/ui/components/ForgeSentinelDetail.ts`, `src/ui/CommandPopup.ts`, `tests/integration/harness.ts`, `tests/CommandPopup.test.ts` (constructor signature update).

**Design context the executor needs upfront:** From *Key design decisions §1*: the popup takes only `imprintAction` and `defaults`, **not** the full `GrimoireSettings`. From *§3*: the popup wraps the action — `imprintAction(snapshot); exitDetail();`. From *§4*: effort is a plain `<select>` with a `(none)` option mapping to `null`. From *§5*: the model dropdown is populated from `SUPPORTED_MODELS`. From *Interfaces*: `defaults: FormDefaults` is the **last** positional parameter to both `CommandPopup` and `ForgeSentinelDetail` — positional, not options-bag, so existing tests with the old signature fail to compile loudly. From *Technical notes*: the integration test stubs `imprintAction` at the popup constructor — it does **not** stub `CastRunner` or `ForgeImprinter`; below-the-seam coverage is in Section A.

**Cross-section couplings:** D0 depends on B1 (`Notice` mock) only if the test asserts toast state — it does not need to, because the action is a stub. D2/D3/D4 depend on C1 + C2 + C3 (types declared, `ForgeFormData` deleted). D2 supersedes C2's temporary `effort: null` placeholder. D5 depends on D3 (popup signature change) — `tests/CommandPopup.test.ts` and `tests/integration/harness.ts` must land in the same commit to keep the suite green.

**Section-level Red criterion:** A new file `tests/integration/forge-cast.spec.ts` exists with at least four `it()` blocks: (1) form contains a name input, description textarea, model select pre-selected to `defaults.defaultModel`, effort select pre-selected to `defaults.defaultEffort`; (2) submitting the form invokes the stub `imprintAction` exactly once with a `ForgeFormSnapshot` containing the typed values + chosen effort; (3) selecting the `(none)` effort option results in `snapshot.effort === null`; (4) after submit, the popup is no longer in detail phase (`harness.isInDetail() === false`) and the modal is still open. All four tests fail before D2/D3/D4 (because the constructor signature, the effort field, and the action wiring are all missing) and pass after.

**ui-integration-tester**

- [x] D0: write `tests/integration/forge-cast.spec.ts` containing the four `it()` blocks specified in the Red criterion above. Build the popup via the existing `createPopupHarness()` (after extending the harness in D5) so the test reads at the same level as `forge-sentinel-detail.spec.ts`. The stub `imprintAction` is `vi.fn()`; assert call count, call args, and post-submit `isInDetail()`. Do not assert anything below the `imprintAction` boundary (no `Notice`, no `CastRunner`, no spawn). — M, ui-integration-tester

**senior-dev**

- [x] D1: in `src/ui/components/ForgeSentinelDetail.ts`, replace the hardcoded `['haiku','sonnet','opus']` array in `buildModelSelect` with `SUPPORTED_MODELS.map(m => ({ value: m.id, text: m.label }))`. Import `SUPPORTED_MODELS` from `src/domain/settings/Settings.ts`. — S, senior-dev (fb6085b)
- [x] D2: in `src/ui/components/ForgeSentinelDetail.ts`, add a `FormDefaults` constructor parameter (positional, last). Add a private `effortSelect: HTMLSelectElement` field, populated by a new `buildEffortSelect(form)` method that creates options for `'low' | 'medium' | 'high' | 'xhigh' | 'max'` plus a `(none)` option whose `value` is `''`. After construction, set `modelSelect.value = defaults.defaultModel` (if it matches one of the supported ids; otherwise leave the default first option) and `effortSelect.value = defaults.defaultEffort ?? ''`. In `wireSubmitHandler`, build the snapshot with `effort: this.effortSelect.value === '' ? null : (this.effortSelect.value as Effort)` instead of the C2 placeholder. — M, senior-dev (fb6085b)
- [x] D3: in `src/ui/CommandPopup.ts`, change the constructor signature to `constructor(app: App, spellTag: string, imprintAction: ImprintAction, defaults: FormDefaults)`. Store both on `#imprintAction` and `#formDefaults` private fields. — S, senior-dev (fb6085b)
- [x] D4: in `src/ui/CommandPopup.ts`, in `renderForgeSentinelDetail`, pass `this.#formDefaults` as the new fourth arg to `new ForgeSentinelDetail(...)`. Replace the placeholder `onSubmit: exit` with `onSubmit: (snapshot) => { this.#imprintAction(snapshot); exit(); }`. — S, senior-dev (fb6085b)
- [x] D5: extend `tests/integration/harness.ts` `createPopupHarness()` to accept an optional `{ imprintAction?, defaults? }` object and pass them into `new CommandPopup(...)` (defaulting to `vi.fn()` and `{ defaultModel: 'claude-sonnet-4-5', defaultEffort: 'medium' }`). Extend the harness's `submitForge(values)` to accept `effort?: Effort | null` and to set `effortSelect.value` accordingly (`null` → `''`). Update `tests/CommandPopup.test.ts` `installFakeScope` callsites to pass `vi.fn()` and the same default object as the third and fourth `CommandPopup` constructor args. — M, senior-dev (fb6085b)

### E. Wire `main.ts` to construct the imprinter and supply the action

#### Section briefing

**What this section produces:** `src/main.ts` constructs a `ForgeImprinter` once at `onload`, builds an `imprintAction` closure that calls `imprinter.imprint(snapshot, this.data.settings, () => popup.close())`, and passes both that action and a `FormDefaults` snapshot into the `CommandPopup` constructor inside the command callback. A new unit test `tests/main.test.ts` (or extension to the existing one) verifies the wiring at the construction-spy level.

**Design context the executor needs upfront:** From *Key design decisions §2*: settings are read inside the closure on each submit, not snapshotted at popup construction — the closure captures `this.data.settings` so subsequent edits in the Settings tab take effect immediately. From *§7*: the `Notice` adapter lives at `main.ts`, not inside `ForgeImprinter`. From *Interfaces → `GrimoirePlugin`*: the imprinter is built once per `onload`; the popup is built per command invocation. From *Data flow*: the closure-passed `close` is `() => popup.close()`, which routes through the popup's `close()` override into `exitDetail` while in detail phase.

**Cross-section couplings:** E1 depends on B1 (`Notice` mock must exist before any test on `main.ts` constructs it). E1 depends on D3 (new `CommandPopup` constructor signature). E2 depends on E1 (asserts the wiring landed).

**Section-level Red criterion:** `src/main.ts` imports `ForgeImprinter`, `CastRunner`, and `Notice`. `onload` constructs one `ForgeImprinter` and stores or closes over it. The "Open Grimoire" command callback constructs the popup with four args: `app`, `spellTag`, an action closure, and a `FormDefaults` object. A new `it()` in `tests/main.test.ts` asserts that calling the command twice (with `data.settings.defaultModel` mutated between calls) constructs popups with the corresponding `defaults.defaultModel` value — proving the closure dereferences settings at call time. A second new `it()` asserts that invoking the captured `imprintAction` with a stub snapshot calls a stubbed `imprinter.imprint` with `(snapshot, this.data.settings, <a function>)`.

**senior-dev**

- [x] E1: modify `src/main.ts` per *Interfaces → `GrimoirePlugin`*. Construct `imprinter = new ForgeImprinter({ notify: (msg) => { new Notice(msg); }, castRunner: new CastRunner() })` once in `onload`. In the `addCommand` callback, build the popup with the four args specified, including the closure `(snapshot) => imprinter.imprint(snapshot, this.data.settings, () => popup.close())`. Note: `popup` is referenced inside its own constructor argument — declare with `let popup: CommandPopup;` then `popup = new CommandPopup(...)`. Imports needed: `Notice`, `ForgeImprinter`, `CastRunner`, `ImprintAction` (optional — closure shape suffices). — M, senior-dev (6b468d0)
- [x] E2: extend `tests/main.test.ts` (or add new tests if cleaner) covering: (1) `onload` followed by invoking the registered command callback constructs a `CommandPopup` with four positional args — assert by spying on the `CommandPopup` constructor via `vi.spyOn` on the module export; (2) the third arg (action closure) when invoked with a stub snapshot calls a stubbed `imprinter.imprint` with `(snapshot, plugin.data.settings, expect.any(Function))`; (3) the fourth arg `defaults` reflects `plugin.data.settings.defaultModel` and `plugin.data.settings.defaultEffort` at the moment the command callback fires (test by mutating `plugin.data.settings.defaultModel` between two command-callback invocations and asserting both popups received the corresponding value). — M, senior-dev (6b468d0)

## Verification

- `npm test` passes — all eight new unit-test files (Section A) plus the modified `ForgeSentinelDetail.test.ts`, `CommandPopup.test.ts`, `main.test.ts` are green.
- `npm run test:integration` passes — `forge-cast.spec.ts` plus the modified `forge-sentinel-detail.spec.ts` (effort field, snapshot shape) plus the unmodified existing integration suite all green.
- `npm run lint` clean.
- `npm run build` clean (esbuild produces `main.js`).
- `npx tsc --noEmit` clean.
- Manual sanity check (optional, not gated): with a configured Obsidian vault, opening the popup, choosing Forge, filling the form, and submitting produces a visible `Forging "<name>"…` toast and (if the CLI binary resolves) eventually a `Spell "<name>" forged` or `Forge failed: ...` toast.

## Risks

- **PoC code may have latent bugs the new tests surface.** Mitigation: the iteration's contract is "tests pin behaviour as committed" — any test that reveals a real bug becomes a `// FIXME` annotation + a backlog item, not a same-commit fix. Same convention as `002`.
- **`Notice` constructor side effects in real Obsidian are non-trivial** (DOM mount + auto-dismiss timer). The mock models only the message string. Production behaviour is sensitive to Obsidian's own `Notice` lifecycle, which this iteration does not test. Acceptable: the only contract we depend on is "calling `new Notice(msg)` shows the user a toast"; that is Obsidian's contract, not ours.
- **`CastSpawner`'s use of `process.env`** means tests must not pollute the parent process env. Mitigation: tests construct `CastSpawner` with a `vi.fn()` `SpawnFn` and inspect the `options.env` argument — they do not rely on the real spawn, so `process.env` is read once but never written.
- **`buildMetaSpell` is a long template literal** including future-pipeline hints (`a future cast pipeline will supply CAST_ID`). Substring assertions risk drift if the template is edited. Mitigation: assert only on the load-bearing substrings called out in A2; do not snapshot the whole string.
- **Effort `<select>` + `(none)` may surprise users who expect Haiku to gate options.** Documented as a deferred edge case in *Key design decisions §4*. The form intentionally does not enforce model→effort gating — the user can pick `effort=high` for Haiku, the CLI will receive `--effort high`, and the runtime decides. Future iteration can add `EffortRow` here if the friction proves real.
- **Race between `imprintAction` synchronous return and `exitDetail`.** `imprint()` is fire-and-forget — it spawns the cast asynchronously and returns synchronously after calling `notify` + `close`. Calling `exitDetail()` immediately after is safe because `close()` (the imprinter's `close` parameter) ran first synchronously. The "double exit" path (popup's wrapper calls `exit()` after `imprintAction(snapshot)`) is idempotent (`#onDetailBack = null` after the first call). Documented in *Key design decisions §3* and *Data flow*.

## Effort summary

- Total: **20 todos** — S: 12, M: 8, L: 0
- Tier mix: junior-dev 12, senior-dev 7, ui-integration-tester 1, lead-dev 0
- Section breakdown: A (8 unit-test todos, all junior), B (1 mock todo, junior), C (3 type-scaffolding todos, junior), D (1 tester + 5 senior wiring), E (2 senior wiring)
- Dominant tier: **junior-dev**, with senior-dev concentrated in the actual seam wiring (D2–D5, E1–E2). Lead-dev is not needed: the design questions are closed in this plan, and the seams are mechanical.

reviewed @ 6b468d0
