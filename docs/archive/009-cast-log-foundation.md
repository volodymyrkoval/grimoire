# 009 — Cast Log Foundation

> Schema, store, UUID threading, and the two plugin-owned event writers (`casted`, `error`) for the cast lifecycle. No reader, no UI, no Claude Code hooks — those are sibling pitches.

## Goal & scope

Every cast dispatched by the plugin — whether through the Spell Picker (live cast) or the Forge dialog (imprint) — must produce an auditable record in a local append-only JSONL file. This pitch lays the foundation:

1. A discriminated-union schema (`CastLogEvent`) in a new `src/castLog/types.ts`, covering all four lifecycle stages (`casted`, `error`, `in-progress`, `done`) — the last two reserved for the sibling pitch.
2. A `CastLogStore` class wrapping `fs.appendFile` against `<vault>/<plugin-dir>/cast-log-local.jsonl`, exposing one method per **plugin-produced** variant: `recordCasted`, `recordError`.
3. UUID generation for every dispatch, threaded through both dispatch sites and into the subprocess as `CAST_ID`.
4. `casted` written before subprocess spawn at both dispatch sites; `error` written from the failure callback at both dispatch sites.

### In scope

- Schema file with the full union (all four variants typed, even unused ones).
- Store class with two write methods and lazy path resolution.
- `castId: string` added to `CastDispatchInput` and to `CastRunInput`; threaded into spawn env as `CAST_ID`.
- Dispatcher and imprinter generate `castId` after their existing guards pass and before their existing toast fires; they record `casted` then call the runner.
- Failure-callback path (existing `onFailure` inside both dispatchers) also calls `recordError`.
- Plugin wires a single `CastLogStore` instance into both dispatcher and imprinter at `onload` time.
- Tests at every seam (store, dispatcher, imprinter, runner env, main wiring).

### Out of scope (sibling pitches or deferred)

- `in-progress` / `done` writes (sibling pitch — Claude Code hooks).
- Hook scripts, `settings.json` materialisation, settings-flag injection (sibling pitch).
- Cast Log reader, parser, UI panel — no consumer of the JSONL file yet.
- `cast-log-remote.jsonl` — reserved name; not produced.
- Timeout-based stale detection, retention/rotation, telemetry.
- Surfacing `castId` in `Notice` toasts.
- Schema versioning field — added only when a breaking change forces it.
- Spell Wrapper changes.

### Acceptance criteria

- Every successful dispatch (live-cast or forge) writes exactly one `casted` line to `cast-log-local.jsonl` before the subprocess is spawned.
- Every failed dispatch (non-zero exit OR async launch failure) additionally writes exactly one `error` line.
- A dispatch blocked by an existing guard (`no active note` / empty-after-sanitise name) writes **nothing** — those casts never reached the dispatched state.
- The subprocess receives `CAST_ID` in its env.
- The JSONL file is created on first write (no explicit ensure step).
- The `CastLogStore` interface is the only path through which plugin code writes the log.

## Proposed solution

### High-level shape

```
                ┌─────────────────────────────────────────────────┐
                │ main.ts.onload                                  │
                │   castLogStore = new CastLogStore({ plugin })   │
                │   ↓ injected into both dispatch sites           │
                └────────┬───────────────────────────┬────────────┘
                         │                           │
                         ▼                           ▼
              CastDispatcher.dispatch        ForgeImprinter.imprint
                  ├─ guard: no active note      ├─ guard: empty name
                  │   → notify + close          │   → notify + close
                  │     (no log entry)          │     (no log entry)
                  ├─ castId = generateId()      ├─ castId = generateId()
                  ├─ recordCasted({ … })        ├─ recordCasted({
                  │                             │     spellPath: "<forge>",
                  │                             │     followUp/executeOnNote
                  │                             │     omitted })
                  ├─ notify "Casting …"         ├─ notify "Forging …"
                  ├─ close()                    ├─ close()
                  └─ runner.run({ …, castId })  └─ runner.run({ …, castId })
                       ├─ env: CAST_ID + …           ├─ env: CAST_ID + …
                       ├─ onSuccess → notify         ├─ onSuccess → notify
                       └─ onFailure(msg) →           └─ onFailure(msg) →
                            recordError(castId,           recordError(castId,
                                        msg);             msg);
                            notify "Cast failed: …"       notify "Forge failed:"
```

### Components

| Component | Location | Responsibility |
|---|---|---|
| `CastLogEvent` (union) + variant interfaces | `src/castLog/types.ts` (new) | Type contract for every event the log can hold. Discriminated by `stage`. No implementation. |
| `CastLogStore` | `src/castLog/store.ts` (new) | Wraps `fs.appendFile` against `cast-log-local.jsonl`. Lazy path resolution from injected `getBasePath` + `pluginDir`. Exposes `recordCasted`, `recordError`. |
| `CastDispatcher` (modified) | `src/cast/CastDispatcher.ts` | Generates `castId` after no-active-note guard passes; writes `casted` event; passes `castId` to runner; writes `error` on failure. |
| `ForgeImprinter` (modified) | `src/forge/ForgeImprinter.ts` | Generates `castId` after sanitise guard passes; writes `casted` event with `spellPath: "<forge>"` and omitted `followUp`/`executeOnNote`; passes `castId` to runner; writes `error` on failure. |
| `CastRunner` (modified) | `src/cast/CastRunner.ts` | `CastRunInput` gains a `castId: string` field; spawner env extended to `{ VAULT_MOUNT_PATH, CAST_ID }`. No log-store dependency. |
| `GrimoirePlugin.onload` (modified) | `src/main.ts` | Instantiates `CastLogStore` once and injects into the `CastDispatcher` and `ForgeImprinter` constructors. |

### Interfaces

```ts
// src/castLog/types.ts
export type CastLogStage = 'casted' | 'error' | 'in-progress' | 'done';

interface BaseEvent {
  readonly castId: string;
  readonly ts: string; // ISO-8601 UTC
}

export interface CastedEvent extends BaseEvent {
  readonly stage: 'casted';
  readonly spellPath: string; // "<forge>" sentinel for forge casts
  readonly model: string;
  readonly effort: Effort | null;
  readonly contextNotes: readonly string[];
  readonly followUp?: string;       // omitted for forge casts
  readonly executeOnNote?: boolean; // omitted for forge casts
}

export interface ErrorEvent extends BaseEvent {
  readonly stage: 'error';
  readonly message: string;
}

export interface InProgressEvent extends BaseEvent {
  readonly stage: 'in-progress';
}

export interface DoneEvent extends BaseEvent {
  readonly stage: 'done';
  readonly affectedFiles?: readonly string[];
}

export type CastLogEvent = CastedEvent | ErrorEvent | InProgressEvent | DoneEvent;

export const FORGE_SPELL_PATH = '<forge>' as const;
```

```ts
// src/castLog/store.ts
export interface CastLogStorePorts {
  getBasePath: () => string;          // app.vault.adapter.getBasePath()
  pluginDir: string;                  // plugin.manifest.dir (e.g. ".obsidian/plugins/grimoire")
  appendLine?: (filePath: string, line: string) => Promise<void>; // default: fs.promises.appendFile
  now?: () => Date;                   // default: () => new Date()
}

// Input shapes use Omit so callers do not pass ts/stage.
export type RecordCastedInput = Omit<CastedEvent, 'stage' | 'ts'>;
export type RecordErrorInput  = Omit<ErrorEvent,  'stage' | 'ts'>;

export class CastLogStore {
  constructor(ports: CastLogStorePorts);
  recordCasted(input: RecordCastedInput): Promise<void>;
  recordError(input: RecordErrorInput): Promise<void>;
}
```

```ts
// src/cast/CastDispatcher.ts — modified
export interface CastDispatcherDeps {
  notify: (msg: string) => void;
  close: () => void;
  castRunner?: CastRunner;
  spawner?: SpawnFn;
  castLogStore: CastLogStore;          // NEW — required
  generateId?: () => string;           // NEW — default crypto.randomUUID
}
```

```ts
// src/forge/ForgeImprinter.ts — modified
export interface ForgeImprinterDeps {
  notify: (msg: string) => void;
  castRunner: CastRunner;
  castLogStore: CastLogStore;          // NEW — required
  generateId?: () => string;           // NEW — default crypto.randomUUID
}
```

```ts
// src/cast/CastRunner.ts — modified
interface BaseCastRunInput {
  modelId: string;
  effort: Effort | null;
  vaultMountPath: string;
  binaryPath: string;
  cliCommand: string;
  castId: string;                      // NEW — required
}
```

### Data flow

**Live cast (happy path):**
1. `CommandPopup` → `SpellsPanel` emits `cast(spell)` → `castAction(spell)` closure in `main.ts` → `dispatcher.dispatch({ spell, model, …, executeOnNote })`.
2. `dispatch` checks `executeOnNote && activeFilePath === null` → bail with notify+close, no log entry.
3. `dispatch` calls `castId = generateId()`.
4. `dispatch` calls `await castLogStore.recordCasted({ castId, spellPath: spell.path, model, effort, contextNotes: [...contextNotePaths], followUp, executeOnNote })`. The `await` is **not** required before the toast — see Design decision #4. Implementation: fire-and-forget with `.catch(console.error)`.
5. `dispatch` notifies `Casting '<name>'…`, calls `close()`, calls `runner.run({ …, castId }, { onSuccess, onFailure })`.
6. `onSuccess` → notify `Spell cast`. No log write (sibling pitch's `done` covers success).
7. `onFailure(msg)` → `castLogStore.recordError({ castId, message: msg })` (fire-and-forget), then notify `Cast failed: <msg>`.

**Forge cast (happy path):**
1. `imprint` checks `sanitised === ''` → bail with notify+close, no log entry.
2. `imprint` calls `castId = generateId()`.
3. `imprint` calls `castLogStore.recordCasted({ castId, spellPath: FORGE_SPELL_PATH, model, effort, contextNotes: [] })` — no `followUp`, no `executeOnNote`.
4. `imprint` notifies `Forging "<name>"…`, calls `close()`, calls `runner.run({ metaSpell, …, castId }, callbacks)`.
5. `onSuccess` / `onFailure` mirror the live-cast path (success toast unique; failure writes `error` then toasts).

**Runner env threading:**
- `CastRunner.spawnCast` passes `env: { VAULT_MOUNT_PATH: input.vaultMountPath, CAST_ID: input.castId }` into `CastSpawner.run`. No new behavior; just one more key.

### Error handling

- **`appendFile` rejects** (disk full, EACCES on `cast-log-local.jsonl`): fire-and-forget `.catch(console.error)`. The cast itself **must not block** on log I/O — the user-facing path stays the same. Logged to console only.
- **`recordError` writer itself rejects**: same — `.catch(console.error)`. The error toast still fires.
- **`generateId` throws** (vanishingly unlikely with `crypto.randomUUID`): the dispatch fails outright before the `casted` toast. Not specifically caught; surfaces as an uncaught exception inside the popup callback. Acceptable; matches existing behavior for unexpected throws.
- **`getBasePath` throws on first write** (path resolution failure): same as appendFile rejection — caught and logged, cast proceeds.

### Technical notes

#### Key design decisions

1. **Lazy path resolution inside `CastLogStore`.** Resolve `path.join(getBasePath(), pluginDir, 'cast-log-local.jsonl')` on first write, cache for subsequent writes. Sidesteps the load-order pitfall the pitch flags (mirroring Data Persistence). Constructor takes injected `getBasePath: () => string` rather than a captured string so a hot-reloaded vault path picks up correctly.

2. **`fs.appendFile` direct, no locking.** The kernel `O_APPEND` guarantees atomic appends below `PIPE_BUF` (4 KB on Linux, comparable on macOS). A `casted` event line is well under 1 KB. No `proper-lockfile` or temp-file dance.

3. **`crypto.randomUUID` from Node `crypto`.** Inject as `generateId?: () => string` defaulting to `() => crypto.randomUUID()`. Node 14.17+ ships it natively; Obsidian's bundled Node is recent enough.

4. **Fire-and-forget writes** with `.catch(console.error)`. The cast UX must not stall on disk I/O. The log is a tap on the side of the dispatch flow, not a barrier. Tests assert the call happens; they do not assert the cast awaits the write.

5. **`castId` is required, not optional** on `CastRunInput` and `*DispatcherDeps`. Optional `castId` would invite drift where some code paths skip log entries — exactly the failure mode the contract is meant to prevent.

6. **Dispatcher / imprinter own `castId` generation, not main.ts.** The pitch says "Generation lives at the two dispatch sites" — `CastDispatcher.dispatch` and `ForgeImprinter.imprint` *are* the dispatch sites. Generating after their guards pass means a guard-blocked cast never gets an id, never gets a `casted` event — matching the spec ("only what reached the dispatched state").

7. **Runner stays oblivious to `CastLogStore`.** Runner threads `castId` through to env, and surfaces failures via its existing `onFailure(msg)` callback. The dispatcher/imprinter (which owns the `castLogStore` reference) writes `error` from inside that callback. This preserves runner's single responsibility (CLI orchestration) and keeps log writes paired with id generation.

8. **`FORGE_SPELL_PATH` sentinel** lives in `castLog/types.ts` (not `forge/`) because it is a property of the log contract, not of forging. Future readers can render it specially.

9. **No schema-version field.** Defer to first breaking change. Adding `schemaVersion: 1` now is YAGNI and locks the format earlier than necessary.

#### Patterns considered

- **Strategy** for per-stage write logic — *rejected*: variants share the same compose-stamp-serialize-append path. Method per variant is simpler than a strategy table at N=2 (or even N=4 if hook variants ever land here, which they won't — they're outside the plugin process).
- **Factory** for event construction — *rejected*: each `record*` method is already a tiny factory; extracting a separate builder is indirection without payoff.
- **Repository** — implicitly applied. `CastLogStore` is write-only repository over the JSONL file. Naming matches the existing `SpellOverrideStore` convention. No registry of pattern jargon required.
- **Dependency Injection** — applied to every side effect: `appendLine`, `getBasePath`, `now`, `generateId`. Enables pure-function tests at every seam.
- **Discriminated Union** (TypeScript) — applied to `CastLogEvent`. Future variants extend without touching existing code (OCP).

#### Dependencies

- `node:crypto` for `randomUUID` (already available, no install).
- `node:fs/promises` for `appendFile` (already available).
- `node:path` for `join` (already available).
- No npm install required.

#### Test stubbing

- `fs.appendFile` → injected `appendLine` port; tests use `vi.fn()`.
- `getBasePath` → injected; tests pass a constant function `() => '/test/vault'`.
- `manifest.dir` → tests pass a constant string `pluginDir: '.obsidian/plugins/grimoire'`.
- `crypto.randomUUID` → injected `generateId` port; tests use `() => 'fixed-uuid'`.
- `now` → injected; tests use `() => new Date('2026-01-01T00:00:00.000Z')`.
- In `tests/__mocks__/obsidian.ts`, `FileSystemAdapter.getBasePath` already returns `/test/vault`; no mock changes needed.

#### Edge cases (resolved up front — no `AskUserQuestion` needed)

- **Empty `contextNotes`** for live cast → serialised as `"contextNotes":[]`. The reader handles it trivially.
- **`effort === null`** (Haiku) → serialised as `"effort":null`. JSON-native.
- **Forge with `effort === null`** → same, in the forge variant.
- **Concurrent dispatches** (two consecutive Enter presses with the popup re-opened between them, or two casts dispatched programmatically): each gets a unique `castId`; `appendFile`'s `O_APPEND` makes the two `casted` lines append atomically without locking. Tests do not need to exercise this; the kernel guarantees it.
- **First write on a fresh install** (file does not exist): `fs.appendFile` creates the file. No `ensureFile` in constructor.
- **Stderr-only failure** (subprocess exits non-zero but writes nothing to stderr): `CastRunner.onCastExit` already substitutes `` `exit ${code}` `` when `stderrTail` is empty; we pass that string into `recordError({ message })` unchanged.
- **`vaultMountPath === ''`**: irrelevant to log writes — the log path uses `getBasePath()` directly, not `vaultMountPath`.
- **Plugin reload mid-cast**: the cast subprocess outlives the plugin reload; its `error`/`done` events would never be written by the plugin (post-reload `castLogStore` is a fresh instance). Accepted; sibling pitch's hook scripts write `done` from outside the plugin process anyway.

## Todos

### A. Schema (`castLog/types.ts`)

#### Section briefing

**What this section produces:** A new file `src/castLog/types.ts` exporting the discriminated union `CastLogEvent`, its four variant interfaces (`CastedEvent`, `ErrorEvent`, `InProgressEvent`, `DoneEvent`), the `CastLogStage` string-literal type, and the `FORGE_SPELL_PATH` constant. No runtime code beyond `FORGE_SPELL_PATH`.

**Design context the executor needs upfront:** Copy from Interfaces above — the union is keyed by `stage`. Common fields (`castId`, `ts`) hoisted into a `BaseEvent` interface. `CastedEvent.followUp` and `CastedEvent.executeOnNote` are optional (omitted for forge casts). `DoneEvent.affectedFiles` is optional. `ErrorEvent.message` is required. `InProgressEvent` adds no fields beyond the base. From Key design decisions #8: `FORGE_SPELL_PATH = '<forge>'` lives here, not in `forge/`.

**Cross-section couplings:**
- A1's exported types are consumed by every other section: B (`CastLogStore` input types), C (CastDispatcher), D (ForgeImprinter).
- A2 (`FORGE_SPELL_PATH`) is imported by D2.

**Section-level Red criterion:** `tests/castLog/types.test.ts` (a single type-assertion test) compiles and passes; importing `CastLogEvent` and narrowing by `stage` gives the correct variant shape with TypeScript's exhaustiveness checking.

**junior-dev**
- [x] A1: Create `src/castLog/types.ts` exporting `CastLogStage`, `BaseEvent`, `CastedEvent`, `ErrorEvent`, `InProgressEvent`, `DoneEvent`, `CastLogEvent` (union), exactly as specified in Interfaces above. Import `Effort` from `../domain/settings/Settings`. Add `tests/castLog/types.test.ts` with one exhaustiveness check: a function `assertNever(e: never): never` and a switch on `event.stage` covering all four cases — compilation passes iff the union is exhaustive. — S, junior-dev (be382da)
- [x] A2: Export `FORGE_SPELL_PATH = '<forge>' as const` from `src/castLog/types.ts`. Add a one-line test asserting `FORGE_SPELL_PATH === '<forge>'`. — S, junior-dev (be382da)

### B. `CastLogStore` (`castLog/store.ts`)

#### Section briefing

**What this section produces:** A new file `src/castLog/store.ts` exporting the `CastLogStore` class and its `CastLogStorePorts` interface. The class has two public methods: `recordCasted(input)` and `recordError(input)`. Path resolution is lazy and cached. Input types `RecordCastedInput` / `RecordErrorInput` are `Omit<…, 'stage'|'ts'>` of the matching variant — see Interfaces.

**Design context the executor needs upfront (verbatim from Key design decisions):**
- Decision #1: "Resolve `path.join(getBasePath(), pluginDir, 'cast-log-local.jsonl')` on first write, cache for subsequent writes."
- Decision #2: "`fs.appendFile` direct, no locking. The kernel `O_APPEND` guarantees atomic appends below `PIPE_BUF`." → use `fs/promises.appendFile` via the injected `appendLine` port.
- Decision #4: "Fire-and-forget writes with `.catch(console.error)`." → that catch lives in the **callers** (C and D). The store itself returns a Promise and may reject; callers swallow.
- Each `record*` method composes the event object, stamps `ts` via the injected `now()`, serialises with `JSON.stringify`, and appends a single line ending in `\n`.

**Cross-section couplings:**
- B depends on A1: imports `CastedEvent`, `ErrorEvent` types from `castLog/types.ts`.
- B is consumed by C1, D1, and E1 (main.ts wires the singleton).

**Section-level Red criterion:** `tests/castLog/store.test.ts` proves: (1) `recordCasted` appends one line whose JSON parse equals the input with `stage:'casted'` and the stamped `ts`; (2) `recordError` does the same with `stage:'error'`; (3) path resolution happens lazily on first write (constructor does **not** call `getBasePath`); (4) the path passed to `appendLine` is `path.join(basePath, pluginDir, 'cast-log-local.jsonl')`; (5) the line ends with `\n`; (6) when `getBasePath` is called more than once across multiple writes, only the first call resolves (caching).

**junior-dev**
- [x] B1: Write failing test in `tests/castLog/store.test.ts`: `recordCasted({ castId:'u1', spellPath:'s.md', model:'sonnet', effort:'medium', contextNotes:[], followUp:'', executeOnNote:true })` with stubbed `appendLine`, `getBasePath: () => '/vault'`, `pluginDir: '.obsidian/plugins/grimoire'`, `now: () => new Date('2026-01-01T00:00:00.000Z')` — assert one call to `appendLine`, path is `'/vault/.obsidian/plugins/grimoire/cast-log-local.jsonl'`, line is `JSON.stringify({ stage:'casted', ts:'2026-01-01T00:00:00.000Z', castId:'u1', spellPath:'s.md', model:'sonnet', effort:'medium', contextNotes:[], followUp:'', executeOnNote:true }) + '\n'`. — S, junior-dev (8903afd)
- [x] B2: Implement `CastLogStore.recordCasted` to make B1 green: lazy path resolution cached in a private field, compose object with `stage:'casted'` and `ts:now().toISOString()` first (so they appear first in the line), then spread input, then `appendLine(path, JSON.stringify(event)+'\n')`. — S, junior-dev (8903afd)
- [x] B3: Write failing test: `recordError({ castId:'u1', message:'boom' })` — assert line is `JSON.stringify({ stage:'error', ts:'…', castId:'u1', message:'boom' }) + '\n'`. — S, junior-dev (8903afd)
- [x] B4: Implement `recordError` to make B3 green. — S, junior-dev (8903afd)
- [x] B5: Write failing test: constructor of `CastLogStore` does **not** invoke `getBasePath`. (Pass a spied `getBasePath = vi.fn(() => '/vault')`; `new CastLogStore({ getBasePath, pluginDir, … })`; assert `getBasePath` was not called.) — S, junior-dev (8903afd)
- [x] B6: Write failing test: two sequential `recordCasted` calls invoke `getBasePath` exactly once total (path is cached after first write). — S, junior-dev (8903afd)
- [x] B7: Confirm B5+B6 pass with the existing implementation (lazy + cached field); if not, fix the path-resolution helper. — S, junior-dev (8903afd)
- [x] B8: Write failing test: default `appendLine` (when not injected) is `fs/promises.appendFile`. Strategy: import `fs/promises` in the test, `vi.spyOn(fsPromises, 'appendFile')`, construct store without the port, call `recordCasted`, assert the spy was called with the expected path. (If module-mock complexity is high, accept this as a manual check and add a code comment instead — note the decision in the implementation commit message.) — M, junior-dev (8903afd)
- [x] B9: Default `now` is `() => new Date()` — assert with `vi.useFakeTimers().setSystemTime('2026-05-10T12:00:00.000Z')` that the stamped `ts` matches. — S, junior-dev (8903afd)
- [x] B10: Edge-case test: `recordCasted` with `followUp` and `executeOnNote` **omitted** (the forge shape) — assert the JSON line does not contain those keys. (`JSON.stringify` drops `undefined` values; ensure the implementation does not coerce them to `null` or `''`.) — S, junior-dev (8903afd)

### C. `CastDispatcher` integration (`cast/CastDispatcher.ts`)

#### Section briefing

**What this section produces:** Modifies `src/cast/CastDispatcher.ts` to (a) require `castLogStore: CastLogStore` and accept optional `generateId?: () => string` in `CastDispatcherDeps`, (b) generate `castId` after the no-active-note guard passes, (c) record `casted` before the "Casting…" toast, (d) pass `castId` to `runner.run(…)`, (e) record `error` from the `onFailure` callback before the existing failure toast. No new public surface besides the constructor deps.

**Design context the executor needs upfront (verbatim from Key design decisions):**
- Decision #4: "Fire-and-forget writes with `.catch(console.error)`. The cast UX must not stall on disk I/O." → wrap each `castLogStore.record*(…)` call in `.catch(console.error)`; do **not** `await`.
- Decision #5: "`castId` is required, not optional on `CastRunInput` and `*DispatcherDeps`."
- Decision #6: "Dispatcher / imprinter own `castId` generation, not main.ts. Generating after their guards pass means a guard-blocked cast never gets an id."
- The no-active-note guard already returns early with `notify('Open a note to cast against'); close(); return`. The guard's existing behaviour must be unchanged — no log entry produced.

**Cross-section couplings:**
- C1, C2 depend on A1 (`CastedEvent` shape) and B (store API).
- C5 depends on F (CastRunner). The `castId` field on `CastRunInput` must exist before C5 can wire it.
- C6/C7 (error writer) depends on B's `recordError` method.
- E1 wires the store and (optional) `generateId` into the constructor — but the dispatcher should default `generateId` to `crypto.randomUUID` so unit tests don't strictly need to inject it (they still do, for determinism).

**Section-level Red criterion:** `tests/CastDispatcher.test.ts` (extended) proves: (1) the no-active-note bail produces no `castLogStore.recordCasted` call; (2) a successful dispatch calls `recordCasted` exactly once with the expected shape; (3) `castId` from `generateId` is passed to `runner.run` input; (4) `onFailure` from the runner triggers exactly one `recordError({ castId, message })` then the existing `'Cast failed: …'` notify; (5) `onSuccess` writes nothing.

**junior-dev**
- [x] C1: Extend `CastDispatcherDeps` with required `castLogStore: CastLogStore` and optional `generateId?: () => string`. Default `generateId` to `() => crypto.randomUUID()`. Existing tests will fail to compile — fix them by passing a `castLogStore` stub (`{ recordCasted: vi.fn(), recordError: vi.fn() } as unknown as CastLogStore`). — S, junior-dev (ffabce3)
- [x] C2: Write failing test: when `activeFilePath === null && executeOnNote === true`, neither `recordCasted` nor `recordError` is called. (Extends the existing "Open a note to cast against" test.) — S, junior-dev (ffabce3)
- [x] C3: Confirm C2 passes — current code path returns before any new behavior. — S, junior-dev (ffabce3)
- [x] C4: Write failing test: a successful dispatch (live-cast, valid active file) calls `castLogStore.recordCasted` exactly once with `{ castId:<generated>, spellPath: spell.path, model, effort, contextNotes: [...input.contextNotePaths], followUp, executeOnNote }`. Inject `generateId: () => 'fixed-uuid'`. — S, junior-dev (ffabce3)
- [x] C5: Implement: after the no-active-note guard, before the `Casting '<name>'…` notify, call `const castId = this.#generateId();` then `this.#castLogStore.recordCasted({ castId, spellPath: spell.path, model, effort, contextNotes: [...contextNotePaths], followUp, executeOnNote }).catch(console.error);`. — S, junior-dev (ffabce3)
- [x] C6: Write failing test: `runner.run` is called with `castId` included in the input. — S, junior-dev (ffabce3)
- [x] C7: Implement: thread `castId` into `runner.run({ …, castId }, callbacks)`. (This depends on F1 having added `castId` to `CastRunInput`.) — S, junior-dev (ffabce3)
- [x] C8: Write failing test: when `runner.run` invokes `onFailure('boom')`, `recordError` is called once with `{ castId:'fixed-uuid', message:'boom' }` **and** notify is still called with `'Cast failed: boom'`. — S, junior-dev (ffabce3)
- [x] C9: Implement: in `dispatch`, wrap the `onFailure` callback to call `this.#castLogStore.recordError({ castId, message: msg }).catch(console.error)` before the existing notify. — S, junior-dev (ffabce3)
- [x] C10: Write failing test: `onSuccess` produces **no** log write. (`recordCasted` was called once on dispatch; `recordError` was never called.) — S, junior-dev (ffabce3)
- [x] C11: Confirm C10 passes (no implementation should write on success). — S, junior-dev (ffabce3)

### D. `ForgeImprinter` integration (`forge/ForgeImprinter.ts`)

#### Section briefing

**What this section produces:** Modifies `src/forge/ForgeImprinter.ts` to (a) require `castLogStore: CastLogStore` and accept optional `generateId?: () => string` in `ForgeImprinterDeps`, (b) generate `castId` after the empty-name guard passes, (c) record `casted` with `spellPath: FORGE_SPELL_PATH` and **omitted** `followUp`/`executeOnNote` before the "Forging…" toast, (d) pass `castId` to `runner.run(…)`, (e) record `error` from `onFailure` before the existing failure toast.

**Design context the executor needs upfront (verbatim):**
- Decision #8: "`FORGE_SPELL_PATH` sentinel lives in `castLog/types.ts` (not `forge/`) because it is a property of the log contract, not of forging."
- The pitch on forge variant fields: "both `followUp` and `executeOnNote` are omitted — a forge has neither a follow-up text nor a notion of being note-bound." → pass an object without those keys, not with `undefined` or `null` values. Note: this works because `CastedEvent.followUp` and `executeOnNote` are typed `optional`, and `JSON.stringify` drops missing keys naturally.
- The pitch on timing: "The `casted` event is written after the sanitised-name validation passes, before the 'Forging…' toast fires."

**Cross-section couplings:**
- D1, D2 depend on A1 (`CastedEvent` shape), A2 (`FORGE_SPELL_PATH`), and B (store API).
- D5 depends on F (CastRunner needs the `castId` field on input).

**Section-level Red criterion:** `tests/ForgeImprinter.test.ts` (extended) proves: (1) empty-name guard produces no log write; (2) a valid forge calls `recordCasted` exactly once with `{ castId, spellPath: '<forge>', model, effort, contextNotes: [] }` and **without** the `followUp` / `executeOnNote` keys; (3) `castId` reaches `runner.run`; (4) `onFailure` produces exactly one `recordError` then the existing `'Forge failed: …'` notify; (5) `onSuccess` writes nothing.

**junior-dev**
- [x] D1: Extend `ForgeImprinterDeps` with required `castLogStore: CastLogStore` and optional `generateId?: () => string` (default `() => crypto.randomUUID()`). Fix existing tests to pass a stub. — S, junior-dev (c451bc0)
- [x] D2: Write failing test: empty-name guard (e.g. `name: '<>'`) calls neither `recordCasted` nor `recordError`. — S, junior-dev (c451bc0)
- [x] D3: Confirm D2 passes (early return guards the path). — S, junior-dev (c451bc0)
- [x] D4: Write failing test: a valid imprint (`name: 'My Spell'`, valid snapshot) calls `recordCasted` exactly once. Assertion uses `expect(recordCasted).toHaveBeenCalledWith({ castId: 'fixed-uuid', spellPath: '<forge>', model: snapshot.model, effort: snapshot.effort, contextNotes: [] })` — i.e. **no** `followUp` and **no** `executeOnNote` keys. Use `toEqual` with the object literal and a separate assertion that the call argument has only those five keys (`Object.keys(callArg).sort()` deepEqual `['castId','contextNotes','effort','model','spellPath']`). — S, junior-dev (c451bc0)
- [x] D5: Implement: after the empty-name guard, before the `Forging "<name>"…` notify, call `const castId = this.#generateId();` then `this.#castLogStore.recordCasted({ castId, spellPath: FORGE_SPELL_PATH, model: snapshot.model, effort: snapshot.effort, contextNotes: [] }).catch(console.error);`. Import `FORGE_SPELL_PATH` from `../castLog/types`. — S, junior-dev (c451bc0)
- [x] D6: Write failing test: `castRunner.run` receives `castId` in its input. (Depends on F1.) — S, junior-dev (c451bc0)
- [x] D7: Implement: thread `castId` into the `runCasting` private method's `run` input. — S, junior-dev (depends on F1) (c451bc0)
- [x] D8: Write failing test: `onFailure('boom')` produces `recordError({ castId:'fixed-uuid', message:'boom' })` then notify `'Forge failed: boom'`. — S, junior-dev (c451bc0)
- [x] D9: Implement: wrap `onFailure` with `recordError` before the existing notify. — S, junior-dev (c451bc0)
- [x] D10: Write failing test: `onSuccess` writes nothing. — S, junior-dev (c451bc0)
- [x] D11: Confirm D10 passes. — S, junior-dev (c451bc0)

### E. `main.ts` wiring

#### Section briefing

**What this section produces:** Modifies `src/main.ts` to (a) construct a single `CastLogStore` instance in `onload` after `initCore`, (b) inject it into both the `CastDispatcher` constructor (already inside `createDispatcher`) and the `ForgeImprinter` constructor (already inside `onload`). No new method on `GrimoirePlugin`. The store is held in a private field or local variable accessible to both wiring points.

**Design context the executor needs upfront (verbatim):**
- Decision #1: "Constructor takes injected `getBasePath: () => string` rather than a captured string." → pass `() => (this.app.vault.adapter as FileSystemAdapter).getBasePath()` to satisfy the lazy + hot-reload contract.
- Decision #6: dispatchers own id generation. `main.ts` does **not** generate ids.
- `pluginDir` comes from `this.manifest.dir`. Note: `manifest.dir` is typed as `string | undefined` on the Obsidian `Plugin` type; treat undefined as a programmer error and throw early (or use a safe fallback like `.obsidian/plugins/grimoire`). Default to throwing — Obsidian always sets it for installed plugins.

**Cross-section couplings:**
- E1 depends on B (store class exists) and on C1+D1 (both deps now accept `castLogStore`).
- E1 is the only place where the singleton lives; both `createDispatcher` and the forge `imprinter` instantiation share it.

**Section-level Red criterion:** `tests/main.test.ts` (extended) proves: (1) `onload` constructs exactly one `CastLogStore` instance; (2) the same instance is passed to both `CastDispatcher` (via the spy on its constructor) and `ForgeImprinter`. No new behavior surfaces in the UI tests — the existing flows pass through unchanged.

**junior-dev**
- [x] E1: Write failing test: `onload` invokes `new CastLogStore(...)` exactly once. Strategy: `vi.spyOn(CastLogStoreModule, 'CastLogStore')` and assert call count + that the ports passed include `getBasePath: expect.any(Function)` and `pluginDir: expect.any(String)`. — M, junior-dev (ab777b4)
- [x] E2: Implement: in `onload` (or a new private method `createCastLogStore()`), instantiate `new CastLogStore({ getBasePath: () => (this.app.vault.adapter as FileSystemAdapter).getBasePath(), pluginDir: this.manifest.dir ?? `${this.app.vault.configDir}/plugins/grimoire` })`. Hold in a `private castLogStore!: CastLogStore;` field. — S, junior-dev (ab777b4)
- [x] E3: Write failing test: the `ForgeImprinter` constructor receives the same `castLogStore` instance. Strategy: spy on `ForgeImprinter` constructor; assert `mock.calls[0][0].castLogStore` is the same reference as the one passed to `CastLogStore` spy's return value. — S, junior-dev (ab777b4)
- [x] E4: Implement: pass `castLogStore: this.castLogStore` into `new ForgeImprinter({ … })` in `onload`. — S, junior-dev (ab777b4)
- [x] E5: Write failing test: the `CastDispatcher` constructor (inside `createDispatcher`) receives the same `castLogStore` instance. — S, junior-dev (ab777b4)
- [x] E6: Implement: pass `castLogStore: this.castLogStore` into `new CastDispatcher({ … })` inside `createDispatcher`. — S, junior-dev (ab777b4)
- [x] E7: Confirm `tests/main.test.ts` "settings mutation is reflected in subsequent popups" and "command callback constructs CommandPopup with..." still pass. (No code change expected; this is a regression check.) — S, junior-dev (ab777b4)

### F. `CastRunner` env threading (`cast/CastRunner.ts`, `cast/buildCastArgs.ts`)

#### Section briefing

**What this section produces:** Modifies `src/cast/CastRunner.ts` (and the two input-shape interfaces in the same file) to require `castId: string` on `CastRunInput`. Threads `castId` into the spawn env as `CAST_ID` alongside the existing `VAULT_MOUNT_PATH`. Does **not** touch `buildCastArgs` (the id is environment, not a CLI flag).

**Design context the executor needs upfront (verbatim):**
- Decision #5: "`castId` is required, not optional on `CastRunInput`." → typed as `castId: string` (no `?`).
- The pitch on env threading: "the `castId` is added to the subprocess environment as `CAST_ID`. This is the seam the sibling pitch picks up — the hook scripts read `$CAST_ID` and use it as both the join key and the gate that distinguishes Grimoire-launched sessions from the user's own Claude Code use."

**Cross-section couplings:**
- F1 is a prerequisite for C7 and D7 (those todos can't compile their tests until the runner accepts `castId`).
- F1 forces an update to every existing `CastRunner` test that constructs a `CastRunInput` — those tests must pass a `castId` literal (any string, e.g. `'test-cast-id'`).

**Section-level Red criterion:** `tests/CastRunner.test.ts` (extended) proves: (1) `run({ …, castId: 'abc' }, …)` causes the injected spawner to receive `env: { VAULT_MOUNT_PATH: …, CAST_ID: 'abc' }`; (2) compilation fails if `castId` is omitted from `CastRunInput` (TypeScript-level guarantee, asserted via a `// @ts-expect-error` test if practical, else accepted as a compile-time check).

**junior-dev**
- [x] F1: Write failing test in `tests/CastRunner.test.ts`: `runner.run({ systemPromptFile:'…', userPrompt:'…', modelId:'sonnet', effort:null, vaultMountPath:'/v', binaryPath:'/b', cliCommand:'claude', castId:'abc' }, callbacks)` invokes the spawner with `env` containing `{ VAULT_MOUNT_PATH:'/v', CAST_ID:'abc' }`. — S, junior-dev (814bc18)
- [x] F2: Implement: extend `BaseCastRunInput` with `castId: string`; change `env: { VAULT_MOUNT_PATH: input.vaultMountPath }` to `env: { VAULT_MOUNT_PATH: input.vaultMountPath, CAST_ID: input.castId }`. — S, junior-dev (814bc18)
- [x] F3: Fix every existing call site / test that constructs a `CastRunInput` to include `castId` (search project for `runner.run(`, `castRunner.run(`, `CastRunInput`, `metaSpell:` followed by `modelId:`). Pass a literal `'test-cast-id'` in tests; pass the real plumbed value in C/D production code. — S, junior-dev (814bc18)
- [x] F4: Edge case test: `castId: ''` (empty string) is still threaded through unchanged — runner does not validate, it transports. Document this in a one-line comment near the env-merge: `// CAST_ID is opaque to the runner; producers guarantee uniqueness`. — S, junior-dev (814bc18)

### G. Cleanup + lint

#### Section briefing

**What this section produces:** Removes any temporary test scaffolding; confirms `npm run lint` and `npm test` are green; confirms no dead imports. No new code.

**Design context the executor needs upfront:** None — this is hygiene.

**Cross-section couplings:** None — runs last, depends on all prior sections being green.

**Section-level Red criterion:** `npm run lint` exits 0; `npm test` exits 0; `git diff --stat` shows changes only in the files listed in the Components table plus their corresponding tests.

**junior-dev**
- [x] G1: Run `npm run lint`; fix any new violations introduced by sections A–F (likely none, given the codebase conventions are well-established). — S, junior-dev (ab777b4)
- [x] G2: Run `npm test`; confirm 0 failures, 0 skipped tests added by this plan. — S, junior-dev (ab777b4)
- [x] G3: Run `npm run test:integration`; confirm no regressions (the integration tests exercise UI flows that now pass through `recordCasted` — verify they still pass with the stubbed `castLogStore` injection or, if integration harness builds real instances, with a no-op `appendLine` port). If integration tests rely on the wired plugin, the harness may need a stub `appendLine` injected — handle in this todo. — M, junior-dev (ab777b4)

## Overall effort summary

- **Total todos:** 47
- **Effort:** S × 44, M × 3, L × 0
- **Dev tiers:** junior-dev × 47, senior-dev × 0, lead-dev × 0
- **No UI integration tester group** — no UI surface changes; existing happy-dom tests cover the dispatch flows and will continue to pass with the injected store stub.

**Why everything is junior-dev:** The Interfaces section names every type, every method signature, every default, every error policy. The Data flow section names where each call goes. Each todo prescribes the file, the function, and the assertion. No design decisions remain open — they're all in Technical notes #1–9.

## Risks and follow-ups

- **Sibling pitch (Claude Code hooks)** picks up two pre-existing seams from this plan: (a) the `CAST_ID` env var on the spawned subprocess; (b) the `in-progress` and `done` variants reserved in `castLog/types.ts`. No further coordination required.
- **Future Cast Log reader** consumes `cast-log-local.jsonl` (this pitch) plus `cast-log-remote.jsonl` (future). The reader's contract is the `CastLogEvent` union — already exported by `castLog/types.ts`.
- **Mutation testing** (`/mutate`) should target `castLog/store.ts` after this lands — the JSON shape and `stage` literal are exactly the kind of mutants Stryker catches well.
- **Live-spec** after `/done` should describe: where the log lives, how to inspect it (`cat .obsidian/plugins/grimoire/cast-log-local.jsonl`), and the contract sibling pitches will extend.

reviewed @ e17856f
