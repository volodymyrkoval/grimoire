# 039 — Grimoire: Show cast output in console

## Goal & scope

Add a diagnostic toggle that, when on, tees a local cast's stdout and stderr to Obsidian's dev console as the bytes arrive, each chunk prefixed with its `castId`. Off by default. Byte-identical behavior to today when off. Failure reporting unchanged in both modes. Remote casts untouched. Desktop-only (the row is visible-but-inert on mobile by design).

The pitch is already prescriptive: one boolean in `GrimoireSettings`, one row in the Advanced section of the settings tab, one field on the `CastSpawnConfig`, one branch in the spawner's stdout/stderr listener attachment.

**In scope:**
- `showCastOutput: boolean` in `GrimoireSettings` + `DEFAULT_SETTINGS` (default `false`)
- Toggle row in `GrimoireSettingTab`'s Advanced section, beside remote-casting fields
- Thread the flag: `LocalCaster.#settings.showCastOutput` → `CastRunInput.echoOutput` → `CastSpawnConfig.echoOutput`
- Branch the stdout listener in `CastSpawner`: drain unconditionally; additionally `console.log` each chunk with `[<castId>]` prefix when echo on
- Branch the stderr listener in `CastSpawner`: accumulate unconditionally (so failure path is preserved); additionally `console.error` each chunk with `[<castId>]` prefix when echo on
- Read `castId` for the prefix from `config.env.CAST_ID` (already populated by `CastRunner`); fall back to `[cast]` if missing
- Decompose `CastSpawner.#listenToForgingProcess` into named helpers (`#attachStdoutListener`, `#attachStderrListener`) so the orchestrator stays one-level-of-abstraction

**Out of scope (No-gos from the pitch):**
- No in-app output panel, no piping into Cast Log
- No CLI flag changes (`--verbose`, `--output-format stream-json`)
- No parsing/formatting of stdout chunks — raw bytes only
- No persistence of output (no disk, no log)
- No change to existing failure reporting (the `stderrTail` returned to `onFailure` and the on-non-zero-exit `console.error` stay exactly as today)
- **No rename of `Forge*`-named internals** (`#listenToForgingProcess`, `#handleForgingProcessExit`, `"Forge spawn stderr…"` message). The brain note explicitly calls this out as a drive-by that must not grow into a refactor. The new helpers extracted from `#listenToForgingProcess` MAY be named cast-neutral (`#attachStdoutListener`, `#attachStderrListener`) — those are *new* names, not renames.
- No `Platform.isDesktop` guard on the settings row — visible-but-inert on mobile per the pitch
- No portal/remote path change — `RemoteCaster` is not touched

**Complexity:** Medium. The behavioral surface is tiny (one branch in two listeners), but it touches a load-bearing invariant (the drain) and a load-bearing failure path (stderr buffer), so the test discipline must pin both invariants explicitly. The UI surface is a single toggle row at a well-precedented seam.

## Proposed solution

Treat `echoOutput` as a pure data flag that rides the existing config chain. The spawner is the only place that knows about console I/O; the runner and caster just thread.

1. **Settings**: add field, default off; toggle row in Advanced section reuses the existing `#addToggleField` helper.
2. **CastRunInput** gains `echoOutput?: boolean`; `LocalCaster` reads `#settings.showCastOutput` and writes it.
3. **CastSpawnConfig** gains `echoOutput?: boolean`; `CastRunner` passes it through (already destructures the run input).
4. **CastSpawner.#listenToForgingProcess** decomposes into:
   - `#attachStdoutListener(child, echoConfig)` — always attaches a `data` listener that consumes; conditionally `console.log`s the prefixed chunk
   - `#attachStderrListener(child, stderrFull, echoConfig)` — always accumulates into `stderrFull.message`; conditionally `console.error`s the prefixed chunk
   - The orchestrator method then calls those two, plus the existing `child.on("exit", …)` and `child.on("error", …)`.

The prefix is a single string `[${castId}] ` built once at config-decode time inside the spawner (read `config.env.CAST_ID`, fall back to `[cast] `). It is not re-derived per chunk.

## Components

| Component | File | Responsibility |
|-----------|------|----------------|
| `GrimoireSettings` | `src/domain/settings/Settings.ts` | Add `showCastOutput: boolean` field + default `false` in `DEFAULT_SETTINGS` |
| `GrimoireSettingTab` | `src/ui/settings/GrimoireSettingTab.ts` | Render new toggle row in `#renderAdvancedSection` (existing private method); reuses `#addToggleField` |
| `LocalCaster` | `src/cast/local/LocalCaster.ts` | Thread `#settings.showCastOutput` into both inline and file-mode `CastRunInput` as `echoOutput` |
| `CastRunInput` (type) | `src/cast/local/CastRunner.ts` | Extend `BaseCastRunInput` with `echoOutput?: boolean` |
| `CastRunner` | `src/cast/local/CastRunner.ts` | Pass `input.echoOutput` into `CastSpawnConfig` in `#spawnCast` |
| `CastSpawnConfig` (type) | `src/cast/local/spawnCast.ts` | Add `echoOutput?: boolean` |
| `CastSpawner` | `src/cast/local/spawnCast.ts` | Decompose `#listenToForgingProcess`; new helpers `#attachStdoutListener` and `#attachStderrListener` carry the echo branch |

No new files. All changes are in-place to existing modules.

## Interfaces

```ts
// src/domain/settings/Settings.ts
export interface GrimoireSettings {
  // ...existing fields...
  /** When true, the spawner tees local cast stdout/stderr to console.log/console.error,
   *  each chunk prefixed with [castId]. Off by default. No-op on mobile. */
  showCastOutput: boolean;
}

// DEFAULT_SETTINGS gains: showCastOutput: false

// src/cast/local/CastRunner.ts
interface BaseCastRunInput {
  // ...existing fields...
  /** Forwarded to CastSpawnConfig.echoOutput. Undefined treated as false. */
  echoOutput?: boolean;
}

// src/cast/local/spawnCast.ts
export interface CastSpawnConfig {
  binary: string;
  args: readonly string[];
  env: Record<string, string | undefined>;
  cwd?: string;
  /** When true, each stdout chunk is also written to console.log,
   *  and each stderr chunk is also written to console.error,
   *  prefixed with `[${env.CAST_ID ?? 'cast'}] `.
   *  Stream consumption and stderr buffering are NOT conditional on this flag. */
  echoOutput?: boolean;
}
```

## Data flow

```
GrimoireSettingTab toggle row
   ↓ writes plugin.data.settings.showCastOutput
   ↓ plugin.save()
LocalCaster (already holds #settings: GrimoireSettings)
   ↓ runInput.echoOutput = this.#settings.showCastOutput
CastRunner.#spawnCast
   ↓ CastSpawnConfig.echoOutput = input.echoOutput
CastSpawner.run → #listenToForgingProcess
   ↓ derives prefix = `[${config.env.CAST_ID ?? 'cast'}] `
   ↓ derives echoOn = !!config.echoOutput
   ↓ #attachStdoutListener(child, { echoOn, prefix }) — always drains; conditionally console.logs
   ↓ #attachStderrListener(child, stderrFull, { echoOn, prefix }) — always accumulates; conditionally console.errors
   ↓ child.on('exit', …) / child.on('error', …) — UNCHANGED, still reads stderrFull.message
```

The flag is a one-way push. Nothing reads it back. Nothing persists it beyond `data.json`.

## Error handling

- **Spawn sync throw**: untouched. `CastSpawner.run` still rejects.
- **Async error event** (ENOENT, EACCES): untouched. `#handleForgingProcessError` still reads `stderrFull.message` (which now may have accumulated chunks that were also live-echoed — both consumers see the same bytes).
- **Non-zero exit code**: untouched. `#handleForgingProcessExit` still calls `console.error("Forge spawn stderr:\n…")` and returns `stderrTail`. The fact that some of those bytes were also live-echoed during execution is additive — the failure dump runs regardless.
- **Missing `CAST_ID`**: spawner reads `config.env.CAST_ID ?? 'cast'` once to build the prefix; never throws.
- **Console.log/console.error throwing**: not defended against. The dev console is local and synchronous; failures here would crash the renderer and that's a deeper problem than this toggle should paper over. (Senior-dev: do not wrap in try/catch.)
- **Mobile**: the existing `Platform.isDesktop` guard in `CastSpawner.#loadSpawner` throws if echo is somehow requested on mobile. The settings row sets the flag harmlessly to `data.json` but the spawner never runs.

## Technical notes

- **Decomposition is mandatory, not aesthetic.** `#listenToForgingProcess` already attaches stdout, stderr, exit, error in one method (today: ~10 lines). Adding the echo branch to both stream listeners crosses §3 ("Orchestrate, don't conflate"): two distinct UI primitives (stdout vs stderr listeners) × two distinct conditional behaviors (drain vs echo) inside one method. The fix is to extract `#attachStdoutListener` and `#attachStderrListener` as private helpers so the orchestrator stays one level of abstraction.
- **Drain invariant is structural, not commented.** Both new helpers attach a `data` listener unconditionally. The conditional is inside the listener body, not around the `.on()` call. This makes "the drain is always attached" a property of the code shape, not a comment to remember.
- **`stderrFull` accumulation is unconditional** for the same reason. The `+=` line runs in both echo branches because the failure path reads it.
- **Prefix is per-chunk, not per-line.** Pitch says "tee raw bytes." We do not split chunks at `\n`. One `data` event → one prefixed `console.log` call. Multi-line chunks render with one prefix at the front and the rest of the chunk verbatim. This matches the "no parsing, no formatting" no-go.
- **Strategy pattern considered — rejected.** Only two algorithms (echo on / off) and they share 90% of the body. A `Strategy` interface would dwarf the actual difference. YAGNI.
- **Stream decorator considered — rejected.** The chunk handler is ~3 lines. Wrapping streams in a Tee class is more abstraction than the behavior warrants.
- **`logger` injection considered — rejected.** `console.log`/`console.error` are the explicit surface the pitch names ("dev console"). Adding a `Logger` port for testability would mean two more files for what is a 2-line behavior. We test by spying on `console.log` and `console.error` in vitest (`vi.spyOn(console, 'log')`).
- **`Platform` check on the toggle row considered — rejected** per pitch: "Leaving the row visible-but-inert costs nothing; adding a `Platform` check to hide it buys nothing. Leave it."
- **`Forge*` rename considered — explicitly rejected from this iteration** per pitch. The new helpers (`#attachStdoutListener`, `#attachStderrListener`) are *new* names extracted in this iteration; they are not renames of the existing `#listenToForgingProcess` / `#handleForgingProcess{Exit,Error}` methods, which keep their vestigial names.

## Todos

### A. Settings field + persistence (no UI, no spawner)

#### Section briefing

1. **What this section produces** — extends `GrimoireSettings` (`src/domain/settings/Settings.ts`) with `showCastOutput: boolean` and extends `DEFAULT_SETTINGS` with `showCastOutput: false`. No new files. See Interfaces for the exact shape.
2. **Methods produced** — none. Pure type/constant extension. `hydrate` (`src/infra/settingsPersistence.ts`) needs no change: its `Object.assign({}, DEFAULT_SETTINGS, s?.settings)` already merges new defaults over absent keys.
3. **Design context the executor needs upfront** — copied from Technical notes: "Off by default. No-op on mobile." From the pitch: "It defaults `false`: the console stays quiet for normal use and lights up only when you reach for it." Persisted via `plugin.data.settings` + `plugin.save()` like every other row.
4. **Cross-section couplings** — B1 (UI row) reads/writes `s.showCastOutput`; C1 (`LocalCaster` threading) reads `this.#settings.showCastOutput`. Both depend on A1 landing first. None of the spawner work (D, E) depends on the field name directly — those see the boolean via the config chain.
5. **Section-level Red criterion** — a unit test asserts `DEFAULT_SETTINGS.showCastOutput === false`, and a `hydrate` test asserts that a saved-data object lacking `showCastOutput` round-trips with `showCastOutput: false`. TypeScript compilation across the codebase passes (no consumer breaks because the field has a default).

**junior-dev**
- [x] A1: add `showCastOutput: boolean` to `GrimoireSettings` interface (`src/domain/settings/Settings.ts`) and add `showCastOutput: false` to `DEFAULT_SETTINGS` in the same file. Test in `tests/domain/settings/Settings.test.ts` (create if missing) asserts `DEFAULT_SETTINGS.showCastOutput === false`. — S, junior-dev
- [x] A2: add a `hydrate`-level test in `tests/infra/settingsPersistence.test.ts` (or the existing settings-persistence test file, find it first) asserting that `hydrate({ settings: {} }, app).settings.showCastOutput === false` and that `hydrate({ settings: { showCastOutput: true } }, app).settings.showCastOutput === true`. No production code change needed for A2 — A1's default makes both pass. — S, junior-dev

### B. Settings UI toggle row (Advanced section)

#### Section briefing

1. **What this section produces** — extends `GrimoireSettingTab.#renderAdvancedSection` (`src/ui/settings/GrimoireSettingTab.ts`) with one additional toggle row labeled "Show cast output in console", description "Stream local cast stdout/stderr to the developer console as it arrives, prefixed with the cast id. Desktop only; ignored for remote casts.", placed at the end of the Advanced section (after the password row). Reuses the existing `#addToggleField` helper — no new method needed.
2. **Methods produced** — none new. `#renderAdvancedSection` gains one additional `this.#addToggleField(...)` call. It already orchestrates 8 row-adds — adding a 9th does not cross any §3 threshold because each row-add delegates to the helper.
3. **Design context the executor needs upfront** — copied from the pitch: "rendered as a toggle in the **Advanced** section of the settings tab — beside the remote-casting fields, where the other not-for-every-day knobs live." And from No-gos: do not add a `Platform.isDesktop` guard — "Leaving the row visible-but-inert costs nothing."
4. **Cross-section couplings** — B1 depends on A1: the toggle reads/writes `s.showCastOutput` which must exist on `GrimoireSettings`. B0 (the integration test) asserts the row's existence and persistence behavior; no later section depends on B's output beyond A's field.
5. **Section-level Red criterion** — an integration test in `tests/integration/settings-panel.spec.ts` (extend the existing spec; do not create a new file) asserts: (i) the Advanced section contains an additional toggle (`input[type="checkbox"]` count rises by 1 from today's expected number), (ii) toggling it to `true` writes `plugin.data.settings.showCastOutput = true` and calls `plugin.save()` exactly once, (iii) toggling it back to `false` writes `false` and calls `save()` again. The existing child-count assertion (`childElementCount`) must be updated to reflect the new row.

**ui-integration-tester**
- [x] B0: integration test in `tests/integration/settings-panel.spec.ts`: (i) row is present with label "Show cast output in console" and the documented description; (ii) toggle ON → `s.showCastOutput === true` and `plugin.save` called once; (iii) toggle OFF → `s.showCastOutput === false` and `plugin.save` called once. Also update the existing `childElementCount` count and the `checkboxes` query expectations to reflect the additional toggle. — S, ui-integration-tester

**junior-dev**
- [x] B1: in `GrimoireSettingTab.#renderAdvancedSection`, append one `this.#addToggleField(...)` call after the password row: label "Show cast output in console", `get` reads `s.showCastOutput`, `set` writes `s.showCastOutput = v`, description as in the briefing. This must make B0 green. — S, junior-dev

### C. LocalCaster threads `echoOutput` through to CastRunInput

#### Section briefing

1. **What this section produces** — extends `LocalCaster.cast` (`src/cast/local/LocalCaster.ts`) to copy `this.#settings.showCastOutput` into the `runInput.echoOutput` field for both the inline (`metaSpell`) and file-mode (`systemPromptFile`) branches. Also extends `BaseCastRunInput` in `src/cast/local/CastRunner.ts` with the optional `echoOutput?: boolean` field. See Interfaces.
2. **Methods produced** — `LocalCaster.cast(input, callbacks)` is unchanged in signature; the only change is that the two object literals it builds gain one more key (`echoOutput: this.#settings.showCastOutput`). No new helpers needed — adding one field to two object literals is mechanical and does not cross §3.
3. **Design context the executor needs upfront** — copied from Data flow: `LocalCaster` already holds `#settings: GrimoireSettings`; threading uses that same reference. The flag is a one-way push.
4. **Cross-section couplings** — C1 depends on A1 (field exists on settings) and D1 (`BaseCastRunInput` has `echoOutput`). C2 is a unit test that locks the threading behavior; later sections (E, F) test that `CastRunner` and `CastSpawner` honor the flag.
5. **Section-level Red criterion** — `tests/cast/local/LocalCaster.test.ts` gains two assertions: with `settings.showCastOutput = true`, both inline and file-mode `runner.run` calls receive `runInput.echoOutput === true`; with `showCastOutput = false` (default), both receive `echoOutput === false`. Existing tests in that file must continue to pass.

**junior-dev**
- [x] C1: add `echoOutput?: boolean` to `BaseCastRunInput` in `src/cast/local/CastRunner.ts` (interface only; no behavior change yet). — S, junior-dev
- [x] C2: extend `LocalCaster.cast` so both `runInput` object literals (inline and file-mode) include `echoOutput: this.#settings.showCastOutput`. Add two tests to `tests/cast/local/LocalCaster.test.ts`: one with `settings.showCastOutput = true` asserts the runner receives `echoOutput: true` for an inline cast; one with the same flag asserts the file-mode branch also receives `echoOutput: true`. Add one more test asserting that the default (`false`) propagates as `false`. — S, junior-dev

### D. CastRunner forwards `echoOutput` into CastSpawnConfig

#### Section briefing

1. **What this section produces** — extends `CastSpawner`'s `CastSpawnConfig` interface (`src/cast/local/spawnCast.ts`) with `echoOutput?: boolean`, and extends `CastRunner.#spawnCast` (`src/cast/local/CastRunner.ts`) to include `echoOutput: input.echoOutput` in the `CastSpawnConfig` it builds. See Interfaces.
2. **Methods produced** — `CastRunner.#spawnCast(binary, args, input, callbacks)` is unchanged in signature; the only change is that the `CastSpawnConfig` literal passed to `this.#castSpawner.run({...})` gains one more key. No new helpers.
3. **Design context the executor needs upfront** — copied from Data flow: `CastRunner` just threads. It does not read `echoOutput`. It does not derive the prefix — that is the spawner's job, since the spawner already has `config.env.CAST_ID`.
4. **Cross-section couplings** — D1 depends on C1 (`BaseCastRunInput.echoOutput`). D2 is a unit test in `tests/CastRunner.test.ts` that asserts the forward. Section E (spawner branching) reads `config.echoOutput`.
5. **Section-level Red criterion** — `tests/CastRunner.test.ts` gains a test asserting that when `input.echoOutput === true`, the `getOptions()` test helper exposes the value (we may need to expand `makeRunnerWithFakeSpawn` to also capture the config the spawner saw — but the existing fake captures `cmd, args, opts`; the new assertion will need to capture the third arg or instead spy on the `CastSpawner.run` boundary). Easiest path: the runner test asserts `echoOutput` propagates by introspecting the captured `opts` if it is reachable — if not, this assertion lives at the spawner seam (E). Section D's Red criterion then collapses to "test added at whichever layer captures it"; the production code change in D1/D2 is independently verifiable by passing types.

**junior-dev**
- [x] D1: add `echoOutput?: boolean` to `CastSpawnConfig` in `src/cast/local/spawnCast.ts` (interface only; spawner implementation still ignores it — that comes in E). — S, junior-dev
- [x] D2: in `CastRunner.#spawnCast` (`src/cast/local/CastRunner.ts`), include `echoOutput: input.echoOutput` in the `CastSpawnConfig` object literal passed to `this.#castSpawner.run({...})`. Add a test to `tests/CastRunner.test.ts`: use `makeRunnerWithFakeSpawn` and additionally stub or spy on the `CastSpawner` boundary so the test can assert the runner forwarded `echoOutput: true` when the input has it. If the existing test harness only captures `(cmd, args, opts)` from the underlying `spawn` (it does — see `makeRunnerWithFakeSpawn`), this test must verify the field by checking that `input.echoOutput = true` produces the expected runtime behavior at the next seam (E). At D2's level, the production change is type-checked and a minimal "input flows through" test is enough; the behavioral pin happens in E. — S, junior-dev

### E. CastSpawner decomposes and adds echo branching

#### Section briefing

1. **What this section produces** — modifies `CastSpawner` in `src/cast/local/spawnCast.ts`. Decomposes `#listenToForgingProcess` into an orchestrator that calls two new private helpers: `#attachStdoutListener` and `#attachStderrListener`. Each helper attaches its `data` listener unconditionally; the listener body branches on `echoOn` to additionally call `console.log` or `console.error` with the `[${castId}] ` prefix. Existing `#handleForgingProcessExit` and `#handleForgingProcessError` are NOT renamed and NOT modified (they still read `stderrFull.message` exactly as today).
2. **Methods produced**:
   - `CastSpawner.#listenToForgingProcess(child, safeResolve, echoConfig)` — orchestrates listener attachment.
     - `→ #attachStdoutListener(child, echoConfig) — attach a 'data' listener that always consumes the chunk; when echoConfig.echoOn, additionally console.log the prefixed chunk.`
     - `→ #attachStderrListener(child, stderrFull, echoConfig) — attach a 'data' listener that always appends to stderrFull.message; when echoConfig.echoOn, additionally console.error the prefixed chunk.`
     - `→ child.on('exit', this.#handleForgingProcessExit(stderrFull, safeResolve)) — UNCHANGED.`
     - `→ child.on('error', this.#handleForgingProcessError(stderrFull, safeResolve)) — UNCHANGED.`
   - `CastSpawner.#deriveEchoConfig(config) — read config.echoOutput and config.env.CAST_ID; return { echoOn: !!config.echoOutput, prefix: \`[${config.env.CAST_ID ?? 'cast'}] \` }`. Called once from `run()` before `#listenToForgingProcess`.
   - `CastSpawner.run` gains one line that calls `#deriveEchoConfig` and forwards the result to `#listenToForgingProcess`. No other change.
3. **Design context the executor needs upfront** — copied verbatim from Technical notes: "Both new helpers attach a `data` listener unconditionally. The conditional is inside the listener body, not around the `.on()` call. This makes 'the drain is always attached' a property of the code shape, not a comment to remember." And from Rabbit Holes in the brain note: "stderr buffering into `stderrFull.message` must continue regardless of toggle so the existing failure-path `console.error` and the tail returned to `onFailure` are unchanged."
4. **Cross-section couplings** — E1/E2/E3 depend on D1 (`CastSpawnConfig.echoOutput` exists). Section F (end-to-end behavior verification) reads E's output. The `Forge*`-named existing helpers (`#handleForgingProcessExit`, `#handleForgingProcessError`) MUST NOT be renamed in this section — see Out of scope.
5. **Section-level Red criterion** — `tests/CastSpawner.test.ts` gains: (i) `echoOutput: false` (or omitted) + stdout chunks emitted → no `console.log` calls (use `vi.spyOn(console, 'log')`); (ii) `echoOutput: true` + `env.CAST_ID = 'abc'` + stdout chunk `'hello'` → `console.log` called once with `'[abc] hello'`; (iii) `echoOutput: true` + stderr chunk `'oops'` → `console.error` called once with `'[abc] oops'`; (iv) `echoOutput: true` + missing `env.CAST_ID` → prefix is `'[cast] '`; (v) regardless of `echoOutput`, a stdout chunk always reaches a `data` listener (the existing "drains stdout without crashing" test must still pass); (vi) regardless of `echoOutput`, stderr always accumulates into the tail returned via the exit handler (the existing "resolves with code 1 and stderrTail" test must still pass with `echoOutput: true` too); (vii) on non-zero exit with `echoOutput: true`, the existing on-failure `console.error("Forge spawn stderr:\n…")` still fires (the failure dump is additive to the live echo, not a replacement).

**senior-dev**
- [x] E1: extract two new private methods in `CastSpawner` (`src/cast/local/spawnCast.ts`): `#attachStdoutListener(child, echoConfig)` and `#attachStderrListener(child, stderrFull, echoConfig)`, where `echoConfig: { echoOn: boolean; prefix: string }`. Move the existing listener-attachment code into them. Verify the existing test suite still passes with no behavioral change (this is a pure refactor — `#listenToForgingProcess` now orchestrates the two helpers + the two existing exit/error handlers). Do NOT rename `#listenToForgingProcess`, `#handleForgingProcessExit`, `#handleForgingProcessError`. — M, senior-dev (bd7ae31)
- [x] E2: add `#deriveEchoConfig(config: CastSpawnConfig): { echoOn: boolean; prefix: string }` that returns `{ echoOn: !!config.echoOutput, prefix: \`[${config.env.CAST_ID ?? 'cast'}] \` }`. Call it from `CastSpawner.run` and forward the result through to `#listenToForgingProcess`. Add a unit test in `tests/CastSpawner.test.ts` for this helper (test via the public seam: set up `echoOutput: true`, `env.CAST_ID: 'abc'`, emit a stdout chunk, assert `console.log` got `'[abc] hello'`). — S, senior-dev (13d30ff)
- [x] E3: in `#attachStdoutListener`, branch the listener body: always consume the chunk (no-op assignment is fine); when `echoConfig.echoOn`, additionally `console.log(echoConfig.prefix + chunk.toString())`. Add tests: (i) `echoOutput: false` → no `console.log`; (ii) `echoOutput: true` + chunk `'hello'` → `console.log('[abc] hello')` exactly once. Use `vi.spyOn(console, 'log')` and restore in `afterEach`. — S, senior-dev (93729fc)
- [x] E4: in `#attachStderrListener`, the body always appends to `stderrFull.message`; when `echoConfig.echoOn`, additionally `console.error(echoConfig.prefix + chunk.toString())`. Add tests: (i) `echoOutput: false` + stderr chunk → `stderrFull` accumulates, no `console.error` call from the live listener (the existing on-failure `console.error` still fires on non-zero exit and is a separate assertion); (ii) `echoOutput: true` + stderr chunk → both `stderrFull` accumulates AND `console.error` is called with the prefixed chunk; (iii) `echoOutput: true` + stderr chunk + non-zero exit → BOTH the live-echo `console.error` AND the on-failure `console.error("Forge spawn stderr:\n…")` are observed. — M, senior-dev (fe3e7c0)
- [x] E5: edge cases as explicit tests in `tests/CastSpawner.test.ts`: (a) missing `env.CAST_ID` + `echoOutput: true` → prefix is `'[cast] '`; (b) multi-line chunk `'line1\nline2\n'` + `echoOutput: true` → single `console.log` call with `'[abc] line1\nline2\n'` (one prefix per chunk, not per line — pins the "no parsing" no-go); (c) `echoOutput: true` + zero-byte chunk `''` → `console.log` called with `'[abc] '` (drain semantics: empty chunks still flow); (d) `echoOutput: true` + exit code 0 → success-path callbacks unchanged, live echo happened, no on-failure `console.error` fires. — S, senior-dev (895b13b)

### F. End-to-end pin: echo OFF is byte-identical to today

#### Section briefing

1. **What this section produces** — a small invariant-pinning test in `tests/CastSpawner.test.ts` (or a sibling `spawnCast-echo-off.test.ts` if the executor prefers) that proves: with `echoOutput` omitted or `false`, the spawner's externally-observable behavior is identical to today's. No new production code. This is the "drain stays attached" and "failure path unchanged" guarantee, encoded as tests.
2. **Methods produced** — none.
3. **Design context the executor needs upfront** — copied from the pitch: "the toggle off leaves behaviour byte-identical to today, stdout discarded and stderr surfaced only on failure; the drain stays attached in both branches so no cast can stall; the failure-path error report is unchanged." This section makes that guarantee testable.
4. **Cross-section couplings** — F1 depends on all of A-E landing.
5. **Section-level Red criterion** — three assertions added: (i) with `echoOutput: false`, a stdout chunk emitted before exit does NOT call `console.log`; (ii) with `echoOutput: false`, the resolved `CastExitInfo.stderrTail` matches today's value byte-for-byte across the existing tests (this is implicitly covered by the existing tests continuing to pass — F1 just makes it explicit by running one new test that asserts the existing "resolves with code 1 and stderrTail" behavior with `echoOutput: false` explicitly passed); (iii) with `echoOutput: false` + non-zero exit, the on-failure `console.error("Forge spawn stderr:\n…")` fires exactly once (the today behavior).

**junior-dev**
- [x] F1: add three explicit "echo OFF preserves today" tests to `tests/CastSpawner.test.ts`: (a) `echoOutput: false` + stdout chunk → `console.log` spy receives zero calls; (b) `echoOutput: false` + stderr chunk + exit 1 → `stderrTail === 'error text'` (mirrors existing test verbatim but with explicit `echoOutput: false`); (c) `echoOutput: false` + stderr chunk + exit 1 → on-failure `console.error` called exactly once with a string starting with `'Forge spawn stderr:\n'`. — S, junior-dev

### G. Deferred / future work (no todos — captured for traceability)

- **Rename `Forge*`-shaped internals** (`#listenToForgingProcess`, `#handleForgingProcessExit`, `#handleForgingProcessError`, the `"Forge spawn stderr…"` message) to cast-neutral names. Explicitly out of scope for this iteration. The brain note flags it as a reasonable drive-by but warns it could grow into a refactor.
- **Portal-side cast output streaming** (showing remote cast output). A Portal Service concern with its own shape and its own pitch.
- **In-app live output panel / piping to Cast Log.** Larger pitch that overlaps Cast Log's territory.

## Deferred edge cases

None — every edge case identified during planning is either covered by an explicit todo (E5 multi-line, missing CAST_ID, empty chunk; F1 echo-off byte-identity; E4 stderr double-duty) or explicitly out of scope per the No-gos (CLI flag changes, parsing/formatting, in-app surfaces, remote casts, mobile guard on the row).

## Overall effort summary

- Total: 13 todos
- Effort: S × 11, M × 2, L × 0
- Tiers: ui-integration-tester × 1 (B0), junior-dev × 7 (A1, A2, B1, C1, C2, D1, D2, F1), senior-dev × 5 (E1–E5)
- Dominant tier: junior-dev (mechanical threading + UI row + invariant pinning). Senior-dev is reserved for `CastSpawner` because that is where the drain invariant, the stderr double-duty, and the prefix derivation all converge — the one place where getting the structure wrong silently breaks production behavior. Even there, the design is fully prescribed; senior-dev's judgment is in writing the tests that pin the invariants cleanly.

## Key design decisions

1. **Decompose `#listenToForgingProcess` before adding the echo branch, not after.** Avoids the §3 conflation that would otherwise ship and then need a follow-up refactor.
2. **Echo is additive to existing behavior, never a replacement.** Both stream listeners always consume; stderr always accumulates. Echo only adds a second consumer (`console.debug`/`console.error`).
3. **Read `castId` from `config.env.CAST_ID` in the spawner**, not from a new top-level config field. The env entry is already populated by `CastRunner` for the hooks; reusing it costs nothing and avoids a parallel data path.
4. **Test `console.debug`/`console.error` directly via `vi.spyOn`**, not via an injected logger abstraction. The pitch names the dev console as the surface; an abstraction layer would be speculative generality.
7. **Use `console.debug` for stdout echo, not `console.log`.** `eslint-plugin-obsidianmd`'s recommended config prohibits `console.log` in plugin source. `console.debug` is the correct Obsidian-compliant level for diagnostic output; it is visible in the Electron devtools at the default log level for Obsidian's desktop app.
5. **Don't add `Platform.isDesktop` to the UI row** — the row is harmlessly inert on mobile per the pitch.
6. **Keep `Forge*` names in this iteration.** The pitch explicitly warns against the rename growing into a refactor.

reviewed @ 56647e5
