# 043 — Logger Class Extraction

## Goal & scope

Introduce a single `Logger` abstraction that owns every diagnostic `console.*` call in `src/`, and thread it by dependency injection from the composition root (`main.ts`) into every class and function that currently logs. The Logger has two gating tiers:

- **Always printed:** `logger.error(...)` and `logger.warn(...)` — regardless of settings.
- **Gated:** `logger.debug(...)` — printed only when `settings.debugLogging` is enabled, read **live** (toggling the checkbox takes effect with no reload).

A new boolean setting `debugLogging` (default `false`) gets a checkbox in the existing Debug section of the settings UI.

### In scope
- New `Logger` class wrapping an injectable console sink, with live debug-gating.
- New `debugLogging` settings field + default + UI toggle.
- Migration of all **diagnostic** `console.*` sites in `src/` to the injected logger.
- Threading the logger through the construction graph rooted at `main.ts`.

### Out of scope (explicit)
- **`spawnCast.ts` cast-output echo (lines ~158–184, `console.log`/`console.error` under `echoConfig.echoOn`).** This is the user-facing "show cast output in console" feature (plan 039), gated by the *separate* `showCastOutput` setting. It streams raw child-process stdout/stderr verbatim, not diagnostic logging. **Leave the echo `console.log`/`console.error` calls untouched.** Only the two diagnostic error logs in `spawnCast.ts` (`#handleForgingProcessError` line ~205, `#handleForgingProcessExit` line ~219) migrate to the logger. See "Key design decisions" §6.
- Renaming/restructuring the `showCastOutput` setting or echo behavior.
- Adding log levels beyond error/warn/debug (no `trace`, no `fatal`).
- Log persistence, log files, remote log shipping. Console only.
- Migrating `console.*` in `tests/` or `scripts/`.

## Proposed solution

A small `Logger` class (`src/infra/Logger.ts`) wraps a `LogSink` (the three console methods it uses) and an `isDebugEnabled: () => boolean` predicate. `error`/`warn` forward unconditionally; `debug` forwards only when the predicate returns `true`. The predicate is a closure over `this.data.settings.debugLogging`, so toggling the setting changes behavior on the next call without re-instantiating anything — this is what makes gating "live".

`main.ts` instantiates one `Logger` immediately after loading data (so the closure can read `this.data`), then passes it into every `deps`/`ports` object and positional-function call that previously reached for `console`. Classes already use a `deps`-object constructor convention, so the logger joins that object as a required field. The two free functions (`computeVaultMountDefault`, `resolveProviderAdapter`) gain a `logger` parameter.

Deep `.catch(console.error)` callbacks (in `CastDispatcher`, `ForgeImprinter`, `ForgeUpdateImprinter`, `CastLogModule`) become `.catch((e) => this.#logger.error(...))` against the logger the class already holds. The deepest UI leaves (`EffortRow`, `OptionsFormState`) are constructed in several mid-tree UI components, so the logger threads from `main.ts` → `GrimoireSettingTab` / popup-build chain → those components → the leaf constructors.

## Components

| Component | Responsibility | Location |
|-----------|---------------|----------|
| `Logger` | Wrap a `LogSink`; forward `error`/`warn` always, `debug` only when `isDebugEnabled()` is true | `src/infra/Logger.ts` (new) |
| `LogSink` (type) | The minimal console surface Logger depends on: `{ error, warn, debug }` | `src/infra/Logger.ts` (new) |
| `GrimoireSettings` | Add `debugLogging: boolean` field | `src/domain/settings/Settings.ts` |
| `DEFAULT_SETTINGS` | Add `debugLogging: false` | `src/domain/settings/Settings.ts` |
| `GrimoireSettingTab` | Add a "Debug logging" toggle to the existing Debug section; carry a `logger` to pass to its `EffortRow` | `src/ui/settings/GrimoireSettingTab.ts` |
| `GrimoirePlugin` (composition root) | Instantiate one `Logger`; thread it into every downstream `deps`/`ports`/function call | `src/main.ts` |
| ~18 call-site files | Replace diagnostic `console.*` with an injected `logger.*` | see "Call-site migration map" |

## Interfaces

```ts
// src/infra/Logger.ts

/** Minimal console surface the Logger depends on. Injectable for tests. */
export interface LogSink {
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}

export interface LoggerDeps {
  /** Live predicate read on every debug() call. Closure over settings.debugLogging. */
  isDebugEnabled: () => boolean;
  /** Defaults to globalThis.console. Inject a fake in tests. */
  sink?: LogSink;
}

export class Logger {
  constructor(deps: LoggerDeps);
  /** Always forwarded to sink.error. */
  error(...args: unknown[]): void;
  /** Always forwarded to sink.warn. */
  warn(...args: unknown[]): void;
  /** Forwarded to sink.debug only when isDebugEnabled() returns true. */
  debug(...args: unknown[]): void;
}
```

Each consuming class adds `logger: Logger` to its existing `deps` object and stores it as `readonly #logger: Logger`. The two free functions add a trailing parameter:

```ts
export function computeVaultMountDefault(app: App, logger: Logger): string;
export function resolveProviderAdapter(p: string, logger: Logger): ProviderAdapter;
```

## Data flow

```
main.ts onload
  → #loadPluginData(): this.data hydrated; this.#logger = #buildLogger()
  → const logger = new Logger({ isDebugEnabled: () => this.data.settings.debugLogging })
  → logger passed into:
       SecretMigrator.catch / refine-ext catch (main.ts inline)
       PortalSecret      (deps.logger)
       DebouncedSaver    (constructor — see Call-site map)
       SpellOverrideStore(deps.logger)
       CastLogModule     (deps.logger) ──┬─→ ScratchSweeper (ports.logger)
                                          ├─→ VaultRefreshCoordinator (deps.logger)
                                          └─→ CastLogStore (deps.logger)
       PopupModule       (deps.logger) ──┬─→ ForgeImprinter (deps.logger)
                                          ├─→ ForgeUpdateImprinter (deps.logger)
                                          ├─→ CastDispatcher (via createDispatcher → deps.logger)
                                          └─→ CommandPopupBuilder → OptionsDetail → OptionsFormState (deps.logger)
                                                                   → CastModelSection / ForgeSentinelDetail → EffortRow (logger)
       createCaster(settings, secret, hooksDir, logger) ─→ CastRunner / spawnCast / RemoteCastTransport
       GrimoireSettingTab (logger arg) ─→ new EffortRow(logger); reads/writes debugLogging via plugin.data.settings
       refineMarkerExtension(logger) ─→ castMarkerViewPlugin

Settings toggle write path:
  user flips "Debug logging" toggle
  → set: s.debugLogging = v; plugin.save()
  → next logger.debug() call reads the new value via isDebugEnabled() closure (live)
```

## Error handling

- `Logger` itself never throws and never wraps in try/catch — it is a thin forwarder. If a sink method throws, that is a programming error in the host console and should surface.
- `error`/`warn` are unconditional; there is no path where an error message is swallowed by gating.
- The migration must preserve existing message text and arguments verbatim (same string, same trailing error object) so DevTools output is unchanged except for the gating of former debug-ish logs. Note: today **all** migrated sites are `console.error`/`console.warn` (no diagnostic `console.debug`/`console.log` outside the excluded echo feature), so none of them become gated — they all map to `logger.error`/`logger.warn` and stay always-on. `logger.debug` exists for future use and is exercised only by its own unit tests in this iteration.

## Key design decisions

1. **Logger is injected, never a global singleton.** Instantiated exactly once in `main.ts` and threaded through `deps`/`ports` objects, matching the codebase's established constructor-deps convention (see `CastLogModule`, `PopupModule`, `ForgeImprinter`). Rationale: testability (fake sink per test), explicit dependencies, no hidden import-time coupling. Rejected: module-level `export const logger` — defeats the user's explicit "injected where it's needed" requirement and is untestable in isolation.

2. **Debug gating is live via `isDebugEnabled: () => boolean`, not a captured boolean.** The composition root passes `() => this.data.settings.debugLogging`. Each `debug()` call evaluates the predicate fresh, so flipping the toggle takes effect immediately with no plugin reload. Rationale: the settings UI mutates `this.data.settings` in place and `plugin.save()` persists asynchronously; reading live off the same object the UI mutates is the simplest correct wiring.

3. **`warn` is always-on (error-tier), not debug-gated.** The current `console.warn` sites (`PortalSecret` save failure, `OptionsFormState` model-fallback, `resolveProviderAdapter` unknown-provider fallback, `RemoteCastTransport` malformed 202) all signal misconfiguration or silent fallback the user should see regardless of debug mode. Rationale: a warning the user cannot see defeats its purpose; debug-gating is reserved for verbose tracing, of which we currently have none.

4. **`LogSink` is the injected seam, defaulting to `globalThis.console`.** Tests construct `new Logger({ isDebugEnabled, sink: fakeSink })` and assert call counts/args on the fake. Production omits `sink` and gets the real console. Rationale: avoids stubbing the global, keeps unit tests pure.

5. **Two DI shapes, matching existing conventions.** Classes get `logger` in their `deps` object (required field). The two free functions (`computeVaultMountDefault`, `resolveProviderAdapter`) get a trailing positional `logger` parameter. Stateful UI classes (`OptionsFormState`, `EffortRow`) get `logger` via their existing constructor/options object, threaded from their construction sites — they are not free functions. Rationale: don't invent a context object the codebase doesn't use; follow each call site's existing shape.

6. **`spawnCast.ts` echo `console.log`/`console.error` stay; diagnostic ones migrate.** The two echo listeners (`#attachStdoutListener`/`#attachStderrListener`, gated by `echoConfig.echoOn` from `showCastOutput`) are a separate user-facing feature (plan 039) that intentionally bypasses any level gating to mirror raw cast output. They are NOT debug logging. Only `#handleForgingProcessError` and `#handleForgingProcessExit`'s diagnostic `console.error` calls migrate. The `spawnCast` function/class must therefore receive a `logger` for the two diagnostic sites while leaving the echo path alone. Flag this boundary to the dev agent loudly — conflating the two is the single most likely migration error.

## Technical notes

- **Patterns considered (design-patterns pass):**
  - *Strategy / level-handler map* — rejected: only two gating behaviors (always vs predicate), a single `if` in `debug()` is clearer than a handler registry. YAGNI.
  - *Null Object for the sink* — rejected: the default sink IS the real console; a no-op logger is only needed in tests, where injecting a fake sink already covers it.
  - *Facade* — accepted (implicitly): `Logger` is a thin facade over `console`, which is the whole point. No separate todo needed beyond the Logger itself.
  - *Adapter* — the `LogSink` interface adapts `console` to the minimal surface; this is the injectable seam, captured in A1.
- **No new dependencies.** Logger wraps the global `console`, which is allowed (only Node native modules fs/path/child_process are banned).
- **ESLint:** the new toggle uses `new Setting(el).addToggle(...)` via the existing `#addToggleField` helper — no raw `createEl('h3')`, no `obsidianmd/*` disables. The `spawnCast` echo retains its existing `eslint-disable obsidianmd/rule-custom-message` (untouched).
- **Test convention:** unit tests in `tests/` (node env); integration tests in `tests/integration/` (happy-dom + mocked `obsidian`). The settings-toggle seam follows `GrimoireSettingTab.provider.spec.ts` (construct tab, `tab.display()`, query the rendered DOM, trigger change, assert `plugin.save` fired and `settings.debugLogging` flipped).
- **Construction-site fan-out:** `EffortRow` is `new`-ed in three places (`GrimoireSettingTab` line 68, `CastModelSection` line 33, `ForgeSentinelDetail` line 269); `OptionsFormState` in one (`OptionsDetail` line 152). Threading their loggers means each of those parents must also receive a logger from *its* parent. This fan-out is the reason Section C is senior-dev: the dependency must reach every construction site without breaking the popup build.
- **Migration is mechanical per file** once the logger reaches the constructor — replace `console.X(args)` with `this.#logger.X(args)` (classes) or `logger.X(args)` (functions), preserving args verbatim.

## Call-site migration map

Diagnostic sites that migrate (echo sites excluded):

| File | Sites | Logger reaches via |
|------|-------|--------------------|
| `src/main.ts` | 56 (SecretMigrator catch), 129/130 (materialize catch), 136 (ext reg catch) | `this.#logger`, local in `onload` |
| `src/infra/PortalSecret.ts` | 36 (warn) | `deps.logger` |
| `src/infra/DebouncedSaver.ts` | 36 (error) | constructor (currently positional — add trailing `logger` param or convert to deps; smallest diff) |
| `src/infra/computeVaultMountDefault.ts` | 12 (error) | trailing `logger` param |
| `src/cast/provider/resolveProviderAdapter.ts` | 23 (warn) | trailing `logger` param |
| `src/cast/CastDispatcher.ts` | 90, 113, 118 (catch) | `deps.logger` (via `createDispatcher`) |
| `src/cast/portal/RemoteCastTransport.ts` | 148 (warn) | constructor deps (via `RemoteCaster`/`createCaster`) |
| `src/cast/local/spawnCast.ts` | 205, 219 (error) — **NOT 163/182 echo** | `deps.logger` (via `LocalCaster`/`createCaster`; echo path untouched) |
| `src/cast/local/CastRunner.ts` | 108 (error) | constructor deps (via `LocalCaster`/`createCaster`) |
| `src/forge/ForgeImprinter.ts` | 88, 133, 141 (catch) | `deps.logger` |
| `src/forge/ForgeUpdateImprinter.ts` | 83, 137 (catch) | `deps.logger` |
| `src/castLog/ScratchSweeper.ts` | 86 (error) | `ports.logger` |
| `src/castLog/VaultRefreshCoordinator.ts` | 153 (error) | constructor deps |
| `src/castLog/store.ts` | 237 (error) | `CastLogStore` deps |
| `src/main/CastLogModule.ts` | 148, 214 (error/catch) | `deps.logger` |
| `src/domain/settings/SpellOverrideStore.ts` | 37, 42 (error) | `deps.logger` |
| `src/editor/castMarkerViewPlugin.ts` | 26 (error) | `refineMarkerExtension(logger)` seam |
| `src/ui/widgets/EffortRow.ts` | 33, 49, 67 (error) | constructor arg `logger`, threaded from `GrimoireSettingTab` / `CastModelSection` / `ForgeSentinelDetail` |
| `src/ui/tabs/CastLogPanel.ts` | 138, 157 (error) | `deps.logger` |
| `src/ui/options/OptionsFormState.ts` | 110 (warn) | constructor (`OptionsFormState` is a class; add `logger`, thread from `OptionsDetail`) |

> The dev agent should grep `console\.(log\|error\|warn\|debug\|info)` under `src/` after migration; the only remaining hits must be `spawnCast.ts` lines ~163 and ~182 (the echo feature).

---

## Todos

### A. Logger core + settings field (foundation, no UI)

#### Section briefing

1. **What this section produces** — `src/infra/Logger.ts` (new) implementing `Logger` and exporting `LogSink`/`LoggerDeps` (see Interfaces). Adds `debugLogging: boolean` to `GrimoireSettings` and `debugLogging: false` to `DEFAULT_SETTINGS` in `src/domain/settings/Settings.ts`. Unit test `tests/Logger.spec.ts`.
2. **Methods produced** —
   - `Logger.constructor(deps)` — store `isDebugEnabled` predicate and resolve sink (`deps.sink ?? globalThis.console`).
   - `Logger.error(...args)` — forward unconditionally to `#sink.error`.
   - `Logger.warn(...args)` — forward unconditionally to `#sink.warn`.
   - `Logger.debug(...args)` — call `#isDebugEnabled()`; forward to `#sink.debug` only when true.
   No helpers needed — each method is a single-concern forwarder; no decomposition trigger crossed.
3. **Design context the executor needs upfront** — Decision §2 verbatim: "Debug gating is live via `isDebugEnabled: () => boolean`, not a captured boolean… Each `debug()` call evaluates the predicate fresh." Decision §4: "`LogSink` is the injected seam, defaulting to `globalThis.console`." Decision §3: `warn` is always-on, never gated.
4. **Cross-section couplings** — None. (This section is pure foundation; later sections import `Logger` but nothing here depends on them.)
5. **Section-level Red criterion** — `tests/Logger.spec.ts` asserts: (a) `error`/`warn` reach a fake sink regardless of predicate value; (b) `debug` reaches the sink when `isDebugEnabled` returns `true` and does NOT when it returns `false`; (c) gating is live — a predicate that flips its return value between calls changes `debug` behavior without re-constructing; (d) all args (including a trailing error object) are forwarded verbatim; (e) default sink is `globalThis.console` when `sink` omitted. A `hydrate(undefined, app)` result has `settings.debugLogging === false`.

**junior-dev**
- [ ] A1: Create `src/infra/Logger.ts` with `LogSink`, `LoggerDeps`, and `Logger` exactly per the Interfaces section. `constructor` stores `#isDebugEnabled = deps.isDebugEnabled` and `#sink = deps.sink ?? globalThis.console`. `error`/`warn` forward unconditionally; `debug` forwards only when `#isDebugEnabled()` is true. No try/catch, no extra methods. — S, junior-dev
- [ ] A2: Unit-test `Logger` in `tests/Logger.spec.ts` covering the five Red-criterion assertions (error/warn always; debug gated both ways; live re-read via a mutable predicate; verbatim arg forwarding incl. trailing error object; default sink fallback). Use a fake `LogSink` with `vi.fn()` per method. — S, junior-dev
- [ ] A3: Add `debugLogging: boolean` to `GrimoireSettings` (with a one-line doc comment: "When true, logger.debug output is printed to the console; errors/warnings always print.") and `debugLogging: false` to `DEFAULT_SETTINGS` in `src/domain/settings/Settings.ts`. Add/extend a hydrate unit test asserting `hydrate(undefined, app).settings.debugLogging === false` and that a saved `true` survives the merge. — S, junior-dev

### B. Settings UI toggle (scaffolding-free; tester owns the seam)

#### Section briefing

1. **What this section produces** — a "Debug logging" toggle appended to the existing Debug section of `GrimoireSettingTab` (`src/ui/settings/GrimoireSettingTab.ts`, `#renderDebugSection`). Integration test `tests/integration/settings-debug-logging.spec.ts`.
2. **Methods produced** —
   - `GrimoireSettingTab.#renderDebugSection()` — modify: after the existing "Show cast output in console" toggle, add a second `#addToggleField('Debug logging', () => s.debugLogging, v => { s.debugLogging = v; }, '<desc>')`. Reuses the existing `#addToggleField` helper (no new helper, no decomposition trigger — it is a single `addToggleField` call).
3. **Design context the executor needs upfront** — Decision §2: the toggle's `set` writes `s.debugLogging = v` then the helper calls `plugin.save()`; the Logger reads the same `this.data.settings.debugLogging` live, so no extra wiring is needed for "live" gating. ESLint note (Technical notes): must use `addToggle`, never raw `createEl('h3')`; the section heading already exists via `new Setting(el).setName('Debug').setHeading()`.
4. **Cross-section couplings** — B1 depends on A3: the toggle reads/writes `s.debugLogging`, which A3 adds to `GrimoireSettings`/`DEFAULT_SETTINGS`. B0/B1 do not depend on Section C wiring — the toggle's persistence is self-contained (`plugin.save`); the *gating effect* (that flipping the toggle changes `logger.debug` output) is a property of Section A+C, not separately verified here.
5. **Section-level Red criterion** — `tests/integration/settings-debug-logging.spec.ts` (pattern: `GrimoireSettingTab.provider.spec.ts`): after `tab.display()`, the rendered container contains a toggle row whose label text includes "Debug logging"; the toggle's initial state reflects `settings.debugLogging` (false by default); triggering its change to `true` sets `plugin.data.settings.debugLogging === true` and calls `plugin.save` exactly once.

**ui-integration-tester**
- [ ] B0: integration test `tests/integration/settings-debug-logging.spec.ts` — assert the Debug-logging toggle seam: renders in the Debug section, initial value mirrors `settings.debugLogging`, onChange flips the setting and fires `plugin.save` once. Follow `GrimoireSettingTab.provider.spec.ts` construction (`makePlugin`, `tab.display()`, query DOM, trigger change). — S, ui-integration-tester (depends on A3)

**junior-dev**
- [ ] B1: In `GrimoireSettingTab.#renderDebugSection`, append `#addToggleField('Debug logging', () => s.debugLogging, v => { s.debugLogging = v; }, 'Print verbose debug output to the developer console. Errors and warnings always print regardless of this setting.')` after the existing "Show cast output in console" toggle. Make B0 green. — S, junior-dev (depends on B0, A3)

### C. Composition-root wiring (logger instantiation + threading)

#### Section briefing

1. **What this section produces** — modifies `src/main.ts` to instantiate one `Logger` and pass it into every downstream constructor/factory/function this file builds. Adds `logger: Logger` to the constructor `deps`/`ports`/signature of every node in the threading chain so Section D's per-file `console.*` swaps compile. No `console.*` is swapped in C; this section only carries the dependency to where D needs it.
2. **Methods produced** —
   - `GrimoirePlugin.#buildLogger(): Logger` — new: returns `new Logger({ isDebugEnabled: () => this.data.settings.debugLogging })`.
   - `GrimoirePlugin.#loadPluginData()` — modify: assign `this.#logger = this.#buildLogger()` immediately after `this.data` is hydrated and before the `SecretMigrator` is built; the `migrator.run().catch` closure uses `this.#logger.error('SecretMigrator failed', err)`.
   - `GrimoirePlugin.#initCastLog(paths)` — modify: pass `logger: this.#logger` into `new CastLogModule({...})`.
   - `GrimoirePlugin.#buildPopupModule(castLog, paths)` — modify: pass `logger: this.#logger` into `PopupModule` deps.
   - `GrimoirePlugin.#registerUI(castLog, popupModule)` — modify: `materialize*().catch(...)` and the extension-registration `catch` use `this.#logger.error(...)`; construct `new GrimoireSettingTab(this.app, this, this.#secret, ..., this.#logger)` and `refineMarkerExtension(this.#logger)`.
   - Constructor/signature edits (each: add `logger`, store `readonly #logger`): `CastLogModule`, `PopupModule`, `PortalSecret`, `SpellOverrideStore`, `DebouncedSaver`, `createCaster` → `LocalCaster`/`RemoteCaster` → `CastRunner`/`spawnCast`/`RemoteCastTransport`, `GrimoireSettingTab`, `CommandPopupBuilder`→`OptionsDetail`→`OptionsFormState`, `CastModelSection`/`ForgeSentinelDetail`→`EffortRow`, `refineMarkerExtension`→`castMarkerViewPlugin`.
3. **Design context the executor needs upfront** — Decision §1: "Logger is injected, never a global singleton… threaded through `deps`/`ports` objects." Decision §2: pass `() => this.data.settings.debugLogging` so gating is live. Decision §5: classes get `logger` in their `deps`/constructor; free functions get a trailing positional param. Technical note "Construction-site fan-out": `EffortRow` has three construction sites, `OptionsFormState` one — each parent up the chain must receive a logger.
4. **Cross-section couplings** — C depends on A1 (`Logger` must exist to import). Section D depends on C for both runtime wiring and *compilation* (D's `deps.logger`/param references won't type-check until C adds the field) — therefore C lands entirely before D. D-section tests inject fake loggers directly. Specifically: D2 (CastDispatcher) consumes `deps.logger` from C's `createDispatcher` wiring; D8 (spawnCast/CastRunner) consumes the `logger` forwarded by C3's `createCaster` chain; D9 (castMarkerViewPlugin) consumes `refineMarkerExtension(logger)` from C1; D9 (EffortRow) consumes the constructor logger threaded by C4 from `GrimoireSettingTab`/`CastModelSection`/`ForgeSentinelDetail`; D7 (OptionsFormState) consumes the constructor logger threaded by C4 from `OptionsDetail`.
5. **Section-level Red criterion** — `npm run build` (tsc) compiles with `logger` present on every modified constructor's deps/ports/signature; `main.ts` instantiates exactly one `Logger` (grep `new Logger(` in `src/` → one hit); all existing unit/integration tests that construct the modified classes still pass after fixtures are updated to pass a fake logger. No behavior change — no `console.*` swapped in C.

**senior-dev**
- [ ] C1: In `main.ts`, add `#logger!: Logger` field and `#buildLogger(): Logger` returning `new Logger({ isDebugEnabled: () => this.data.settings.debugLogging })`. In `#loadPluginData`, assign `this.#logger = this.#buildLogger()` right after `this.data` is hydrated and before the `SecretMigrator` is built; replace the `migrator.run().catch` `console.error` with `this.#logger.error('SecretMigrator failed', err)`. Replace the `#registerUI` `materialize*().catch(console.error)` and extension-registration `catch` `console.error` with `this.#logger.error(...)`. (The `GrimoireSettingTab`/`refineMarkerExtension` logger args are wired in C3/C4.) — M, senior-dev (depends on A1)
- [ ] C2: Add `logger: Logger` to the `deps`/`ports` of `CastLogModule`, `PopupModule`, `PortalSecret`, `SpellOverrideStore`, and carry a logger into `DebouncedSaver` (smallest diff — trailing positional param or deps object). Store each as `readonly #logger: Logger`. Thread `this.#logger` into the `main.ts` construction sites (`#loadPluginData`, `#initCastLog`, `#buildPopupModule`) and into `PopupModule`'s `ForgeImprinter`/`ForgeUpdateImprinter`/`createDispatcher` deps. Update existing tests that construct these classes to pass a fake logger. Build green; no `console.*` swapped. — L, senior-dev (depends on C1)
- [ ] C3: Add trailing `logger: Logger` to `createCaster` and forward into `LocalCaster`→`CastRunner`/`spawnCast` and `RemoteCaster`→`RemoteCastTransport` (add `logger` to their deps/ports, store `#logger`). Add `logger` param to `refineMarkerExtension(...)` and its inner `castMarkerViewPlugin` construction; update `#registerUI` to pass `this.#logger`. Update all construction sites (`PopupModule.createCaster(...)`, `main.ts` extension registration) and tests. Build green; no `console.*` swapped. — L, senior-dev (depends on C2)
- [ ] C4: Thread a logger into the stateful UI-leaf classes. Add `logger` to `OptionsFormState`'s constructor (`OptionsFormSnapshot` initial arg stays; add a second `logger` arg or a deps wrapper) and to `EffortRow`'s constructor. Add a `logger: Logger` arg to `GrimoireSettingTab`'s constructor (passed from `main.ts` line 128) and use it for `new EffortRow(logger)` (line 68). Thread a logger to `CastModelSection` (line 33) and `ForgeSentinelDetail` (line 269) so their `new EffortRow(logger)` compiles, and to `OptionsDetail` (line 152) for `new OptionsFormState(..., logger)` — each from its own parent up to `CommandPopupBuilder`/`PopupModule` (which already received the logger in C2). Update all construction sites + the many integration tests that build these components (pass a fake logger). Build green; no `console.*` swapped. — L, senior-dev (depends on C2, C3)

### D. Call-site migration (mechanical console → logger swaps)

#### Section briefing

1. **What this section produces** — replaces every diagnostic `console.*` call listed in the Call-site migration map with `this.#logger.*` (classes) or `logger.*` (functions), preserving message strings and arguments verbatim. No new files; no signature changes (those landed in C). Per-file unit/regression tests assert the logger method is called (via injected fake) instead of `console`.
2. **Methods produced** — no new methods; edits inside existing methods. The orchestrator-with-helpers cases (`CastDispatcher.dispatch`, `ForgeImprinter.imprint`/`#dispatchCast`/`#onCastAccepted`/`#onCastFailed`, `ForgeUpdateImprinter` equivalents, `CastLogModule.#runOrLog`/`#runScratchSweeper`) already decompose their concerns into helpers; the migration only swaps the `.catch(console.error)` callback target inside each existing helper to `.catch((e) => this.#logger.error(...))`. Preserve the existing message text where a string was passed (e.g. `'deleteCast failed'`).
3. **Design context the executor needs upfront** — Decision §6 verbatim: in `spawnCast.ts`, the echo `console.log`/`console.error` under `echoConfig.echoOn` (lines ~163/~182) are the `showCastOutput` feature and **must not be touched**; only `#handleForgingProcessError` (~205) and `#handleForgingProcessExit` (~219) migrate. Error-handling note: all migrated sites are `error`/`warn` and stay always-on; none become debug-gated.
4. **Cross-section couplings** — Every D todo depends on C: the `logger` field/param must already exist on the target's deps/ports/signature before the swap compiles (C2 for D1–D6; C3 for D8; C3+C4 for D7 OptionsFormState and D9 EffortRow/castMarkerViewPlugin). D8 (spawnCast) depends specifically on C3. D7's OptionsFormState swap and D9's EffortRow swap depend on C4. D-section tests inject fake loggers directly and do NOT depend on B (UI) or the live `main.ts` wiring.
5. **Section-level Red criterion** — `grep -rn 'console\.\(log\|error\|warn\|debug\|info\)' src/` returns exactly two hits, both in `spawnCast.ts` (the echo listeners ~163 and ~182). Every other former site now calls the injected logger, verified per-file by a test that passes a fake `LogSink`/logger and asserts the corresponding method fired with the original message/args. Existing behavior (notices, return values, control flow) is unchanged.

**junior-dev**
- [ ] D1: `SpellOverrideStore.set` — swap lines 37 & 42 `console.error(...)` → `this.#logger.error(...)`, same messages. Unit test injecting a fake logger asserts `error` fires (not console) for unknown-model and no-effort-support cases. — S, junior-dev (depends on C2)
- [ ] D2: `CastDispatcher` — swap the three `.catch(console.error)` (lines 90, 113, 118) → `.catch((e) => this.#logger.error('recordCasted failed', e))` and the `recordError` site likewise. Unit test asserts logger.error fires when a recorder promise rejects. — M, junior-dev (depends on C2)
- [ ] D3: `ForgeImprinter` (88, 133, 141) and `ForgeUpdateImprinter` (83, 137) — swap `.catch(console.error)` → `.catch((e) => this.#logger.error(...))`. Tests assert logger.error fires on recorder rejection. — M, junior-dev (depends on C2)
- [ ] D4: `CastLogModule` — `#runOrLog` line 148 and `#runScratchSweeper` line 214 → `this.#logger.error(...)`. Unit test asserts logger.error fires on a failing task and a rejecting sweep. — S, junior-dev (depends on C2)
- [ ] D5: `castLog/store.ts` (CastLogStore) line 237, `castLog/ScratchSweeper.ts` line 86, `castLog/VaultRefreshCoordinator.ts` line 153 → injected `this.#logger.error(...)`. Tests inject a fake logger and assert error fires on read/process/stat failure (preserve the ENOENT-as-empty branch in store.ts — only the non-ENOENT error logs). — M, junior-dev (depends on C2)
- [ ] D6: `infra/PortalSecret.ts` line 36 (`console.warn`) → `this.#logger.warn(...)`; `infra/DebouncedSaver.ts` line 36 (`console.error`) → injected logger. Tests assert warn/error fire via fake logger. — S, junior-dev (depends on C2)
- [ ] D7: `infra/computeVaultMountDefault.ts` line 12 → `logger.error(e)` (trailing param); `cast/provider/resolveProviderAdapter.ts` line 23 → `logger.warn(...)` (trailing param); `ui/options/OptionsFormState.ts` line 110 → `this.#logger.warn(...)` (constructor-injected logger from C4). Update each function's call sites to forward the logger and update tests. — M, junior-dev (depends on C3 for the two functions; C4 for OptionsFormState)
- [ ] D8: `cast/local/spawnCast.ts` — migrate ONLY `#handleForgingProcessError` (~205) and `#handleForgingProcessExit` (~219) to `this.#logger.error(...)`. **Leave lines ~163 and ~182 (echo listeners under `echoConfig.echoOn`) exactly as they are**, including their eslint-disable. `cast/local/CastRunner.ts` line 108 → `this.#logger.error(err)`. Add a test asserting the diagnostic error path uses the logger and the echo path still writes raw console output unchanged when `echoOn`. — M, junior-dev (depends on C3)
- [ ] D9: `cast/portal/RemoteCastTransport.ts` line 148 (`console.warn`) → `this.#logger.warn(...)`; `editor/castMarkerViewPlugin.ts` line 26 → logger via the `refineMarkerExtension(logger)` seam (C3); `ui/tabs/CastLogPanel.ts` lines 138 & 157 → `this.#deps.logger.error(...)` (preserve the `new Notice(...)` calls); `ui/widgets/EffortRow.ts` lines 33, 49, 67 → `this.#logger.error(...)` (constructor logger from C4). Per-file tests assert logger fires. — M, junior-dev (depends on C3, C4)
- [ ] D10: Final sweep — run `grep -rn 'console\.\(log\|error\|warn\|debug\|info\)' src/` and assert exactly two remaining hits, both in `spawnCast.ts` echo listeners (~163, ~182). Add a `tests/no-stray-console.spec.ts` guard test that scans the `src/` tree and fails if any `console.*` appears outside an allowlist of the two echo lines. — S, junior-dev (depends on D1–D9)

## Overall effort summary

- **Total:** 20 todos — S: 9, M: 8, L: 3
- **By tier:** ui-integration-tester: 1 (B0); junior-dev: 15; senior-dev: 4 (C1–C4); lead-dev: 0
- **Dominant tier:** junior-dev for the Logger and all call-site swaps (design fully closed in this plan). The judgment-bearing work is concentrated in Section C (senior-dev): threading the logger through the construction graph — including the `EffortRow`/`OptionsFormState` fan-out across multiple UI parents and the `createCaster` chain — while keeping every existing test fixture green with no behavior change.
