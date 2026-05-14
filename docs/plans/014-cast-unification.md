# 014 — Cast Unification

> Deep refactor of the casting layer: introduce a single `Caster` interface that both local CLI and remote portal implementations satisfy, move log writes and notifications out of the transport into the calling Observer, eliminate the `{ remote: true }` log-routing flag, collapse `castAction` + `optionsCastAction` in `CommandPopup` / `main.ts` into one action, and remove `executionMode` branching from `ForgeImprinter`. No user-visible behaviour changes; existing test suite stays green throughout.

**Complexity:** Complex (multi-component, cross-cutting, three call sites, tests across unit + integration layers).

---

## Goal & scope

### In scope

- New `Caster` interface in `src/cast/` with `cast(input, callbacks)` shape.
- Two concrete implementations:
  - `LocalCaster` — wraps `CastRunner`; fires `onAccepted()` on exit 0, `onFailure(msg)` on non-zero exit / spawn error.
  - `RemoteCaster` — wraps the existing portal HTTP code; fires `onAccepted({ jobId: portalCastId })` on HTTP 202 with a `castId` field, `onAccepted({})` on HTTP 202 without one (degraded but accepted), `onFailure(msg)` on every error path.
- A `createCaster(settings, deps)` factory function in `src/cast/`; called once in `main.ts`, the resulting `Caster` is injected into both `CastDispatcher` and `ForgeImprinter`.
- Folder reshape: all local-CLI files move into `src/cast/local/`; portal files already live in `src/cast/portal/`; `Caster.ts` + `createCaster.ts` live at `src/cast/` root.
- Observer-layer migration: `castLogStore.recordCasted(...)`, `recordError(...)`, and `notify(...)` calls move out of any path that was previously inside `RemoteCastTransport` / inside the `{ remote: true }` flag and into `CastDispatcher` / `ForgeImprinter`. Each caller writes to the correct log file via the writer it was injected with.
- Eliminate the `{ remote: true }` write-routing flag on `CastLogStore`. Splitting strategy: extract a write-only `CastLogWriter` interface (`recordCasted`, `recordError`) bound to a single file path; the existing `CastLogStore` keeps `readAll()` (which already merges both files) and continues to be the writer for the local log. A new `CastLogStore`-equivalent or thin wrapper handles writes to the remote log — see Components below.
- Remove `executionMode === 'remote'` branching from `ForgeImprinter`.
- Collapse `castAction` + `optionsCastAction` in `CommandPopup` and `main.ts` into a single `castAction(spell, snapshot)` callback. The Enter-from-list path in `main.ts` builds a default `OptionsFormSnapshot` from `settings.defaultModel` / `settings.defaultEffort` / etc.
- Bug fix in `ForgeImprinter` (the duplicated record/notify path) — disappears naturally when both branches collapse onto `caster.cast(input, { onAccepted, onFailure })`.
- All existing unit and integration tests continue to pass; tests are updated where the public API at the seam they observe changes (constructor deps, callback shape).

### Out of scope

- No new user-visible behaviour. No new notice strings. No new log fields. No new transports.
- Status close-loop (`in-progress` / `done` for remote casts) — still deferred per `remote-casting.md`.
- Reshape of `CastRunner` or `requestUrl` — they remain `Caster` implementation details.
- Settings UI changes.
- `CastLogStore.readAll()` reading behaviour — unchanged. The split is write-only.

### Decisions already made (do not re-open)

- `onAccepted` fires "cast accepted/started" semantics for both local and remote, **not** "cast completed."
- Remote completion is observed via `cast-log-remote.jsonl` + hook materializer — never via callback.
- Caster does not own log writes or notifications.
- `portalCastId` preserved — RemoteCaster passes it via `{ jobId }` in `onAccepted`; caller writes the second log entry.
- Factory is the single creation point — no mode branches in `main.ts` beyond calling the factory.

---

## Proposed solution

The casting layer today carries three coupled responsibilities at every dispatch site:
(1) execute the cast (local CLI or remote HTTP), (2) write to the right log file, (3) notify the user. Today these are tangled: `CastDispatcher` has the mode switch, holds both transports, knows the `{ remote: true }` log flag, and writes the second `recordCasted` from inside the `RemoteCastTransport`'s callback. `ForgeImprinter` duplicates the same shape — its own mode switch, its own remote branch, and its own duplicated record-and-notify wiring (the bug call-site).

The refactor splits these three responsibilities along the seam the live-spec for remote-casting already named: a `Caster` is a structural type for "thing that turns a `CastInput` into a fire-and-forget execution with `accepted/failure` semantics." Both `LocalCaster` and `RemoteCaster` satisfy it. The factory chooses one based on `settings.executionMode`. Callers (`CastDispatcher`, `ForgeImprinter`) are pure Observers — they compose the input, invoke `cast(...)`, and translate the two callbacks into log writes + notifications. The log target is bound at injection time (the writer the caller holds writes to the file for that mode), so the routing flag disappears.

The `CommandPopup` consolidation is structural: today `castAction` and `optionsCastAction` build *different* `CastDispatchInput` shapes from two paths in `main.ts`. Collapsing to one action means the no-options Enter-from-list path constructs a default `OptionsFormSnapshot`, which makes the "Enter-from-list = options-panel-with-defaults" relationship explicit in the wiring — and removes a category of "the two paths drifted" bugs.

---

## Components

| Component | Location | Responsibility |
|---|---|---|
| `Caster` (interface) | `src/cast/Caster.ts` | Structural type: `cast(input: CastInput, callbacks: CastCallbacks): void` |
| `CastInput`, `CastCallbacks` (types) | `src/cast/Caster.ts` | Single shared input/callback shapes consumed by both implementations |
| `LocalCaster` | `src/cast/local/LocalCaster.ts` | Caster impl that delegates to `CastRunner`; translates `onSuccess` → `onAccepted()`, `onFailure(msg)` → `onFailure(msg)` |
| `RemoteCaster` | `src/cast/portal/RemoteCaster.ts` | Caster impl that wraps current `RemoteCastTransport`; translates 202 → `onAccepted({ jobId? })`, all error paths → `onFailure(msg)` |
| `createCaster` | `src/cast/createCaster.ts` | Factory: switches on `settings.executionMode` to return `LocalCaster` or `RemoteCaster`; assumes settings already validated by caller |
| `CastRunner` | `src/cast/local/CastRunner.ts` (moved) | Unchanged behaviour; new path |
| `CastSpawner` (in `spawnCast.ts`) | `src/cast/local/spawnCast.ts` (moved) | Unchanged |
| `buildCastArgs`, `resolveCliBinary` | `src/cast/local/` (moved) | Unchanged |
| `RemoteCastTransport` | `src/cast/portal/RemoteCastTransport.ts` (unchanged location) | Unchanged behaviour; becomes the internal HTTP plumbing for `RemoteCaster` |
| Portal helpers | `src/cast/portal/` (unchanged) | Unchanged |
| `CastLogWriter` (interface) | `src/castLog/CastLogWriter.ts` | `recordCasted(input)`, `recordError(input)` — the write-side seam, bound to one file |
| `CastLogStore` | `src/castLog/store.ts` | Unchanged read API (`readAll()` still merges both files); write methods drop the `RecordOptions { remote? }` parameter; the store implements `CastLogWriter` for the local log path. |
| Remote log writer | (see Interfaces below) | Writes `casted` / `error` events to the remote log path; same shape as `CastLogStore`'s write methods |
| `CastDispatcher` | `src/cast/CastDispatcher.ts` | Pure Observer: build prompt, call `caster.cast`, translate callbacks → writer + notify + close. Holds one `Caster` and one `CastLogWriter` (bound to the right file by `main.ts`). |
| `ForgeImprinter` | `src/forge/ForgeImprinter.ts` | Pure Observer: same shape as `CastDispatcher`. Holds one `Caster` and one `CastLogWriter`. No `executionMode` branching. |
| `CommandPopup` | `src/ui/CommandPopup.ts` | Drops `castAction: (spell) => void` constructor param; renames `optionsCastAction` to `castAction` with shape `(spell, snapshot) => void` |
| `main.ts` | `src/main.ts` | Calls `createCaster(...)` once per popup-open (settings-live-read); also picks the `CastLogWriter` matching the chosen execution mode and injects both into Dispatcher and Imprinter; builds default `OptionsFormSnapshot` for the Enter-from-list call site |

---

## Interfaces

```ts
// src/cast/Caster.ts
import type { Effort } from '../domain/settings/Settings';

export interface CastInput {
  readonly castId: string;
  readonly spellPath: string;     // 'spells/foo.md' for live; '<forge>' for forge
  readonly modelId: string;
  readonly effort: Effort | null;
  readonly userPrompt: string;    // "Execute this spell against …" or the forge meta-spell
  readonly systemPromptFile?: string; // present for live-cast (file-mode); omitted for forge (inline mode)
  readonly vaultMountPath: string;    // local-only; remote ignores
}

export interface CastAcceptedInfo {
  readonly jobId?: string;   // present for remote when portal returned a castId
}

export interface CastCallbacks {
  onAccepted(info: CastAcceptedInfo): void;
  onFailure(message: string): void;
}

export interface Caster {
  cast(input: CastInput, callbacks: CastCallbacks): void;
}
```

```ts
// src/cast/createCaster.ts
import type { GrimoireSettings } from '../domain/settings/Settings';
import type { Caster } from './Caster';
import { LocalCaster } from './local/LocalCaster';
import { RemoteCaster } from './portal/RemoteCaster';
import type { CastRunner } from './local/CastRunner';
import type { RemoteCastTransport } from './portal/RemoteCastTransport';

export interface CreateCasterDeps {
  castRunner?: CastRunner;
  remoteTransport?: RemoteCastTransport;
}

export function createCaster(settings: GrimoireSettings, deps: CreateCasterDeps): Caster {
  if (settings.executionMode === 'remote') {
    if (!deps.remoteTransport) throw new Error('createCaster: remoteTransport is required for remote mode');
    return new RemoteCaster({ transport: deps.remoteTransport, settings });
  }
  return new LocalCaster({ runner: deps.castRunner ?? new CastRunner(), settings });
}
```

```ts
// src/castLog/CastLogWriter.ts
import type { CastedEvent, ErrorEvent } from './types';

export type RecordCastedInput = Omit<CastedEvent, 'stage' | 'ts'>;
export type RecordErrorInput = Omit<ErrorEvent, 'stage' | 'ts'>;

export interface CastLogWriter {
  recordCasted(input: RecordCastedInput): Promise<void>;
  recordError(input: RecordErrorInput): Promise<void>;
}
```

`CastLogStore` continues to implement these write methods directly, bound to its single `getLogPathAbs` getter (the local-log path). For the remote-log path, `main.ts` constructs a second `CastLogStore` instance with `getLogPathAbs: () => remoteLogPath` and `getRemoteLogPathAbs: undefined` — same class, different file. (See Technical notes for why we don't introduce a new `RemoteCastLogStore` class.)

```ts
// CastDispatcher constructor deps after refactor
export interface CastDispatcherDeps {
  notify: (msg: string) => void;
  close: () => void;
  caster: Caster;
  logWriter: CastLogWriter;
  generateId?: () => string;
}

// ForgeImprinter constructor deps after refactor
export interface ForgeImprinterDeps {
  notify: (msg: string) => void;
  caster: Caster;
  logWriter: CastLogWriter;
  generateId?: () => string;
}
```

```ts
// CommandPopup constructor params after refactor
export type CastAction = (spell: Spell, snapshot: OptionsFormSnapshot) => void;
// (no separate OptionsCastAction type; the previous CastAction type — `(spell) => void` — is removed)

export interface CommandPopupParams {
  app: App;
  spellTag: string;
  imprintAction: ImprintAction;
  castAction: CastAction;       // new shape — was optionsCastAction
  defaults: FormDefaults;
  overrides: SpellOverrideStore;
  sessionMap: OptionsSessionMap;
  castLogPanelDeps: Omit<CastLogPanelDeps, 'openLink'>;
  // optionsCastAction removed
}
```

The Enter-from-list path (`SpellsPanel` emits `cast` with a `Spell`) builds a default snapshot in the popup before calling `castAction`:

```ts
// inside CommandPopup, in the spellsPanel "cast" handler
panel.events.on("cast", (spell) => {
  const snapshot: OptionsFormSnapshot = {
    model: this.#formDefaults.defaultModel,
    effort: this.#formDefaults.defaultEffort,
    contextNotePaths: [],
    followUp: '',
    executeOnNote: spell.executeOnNote,
  };
  this.#castAction(spell, snapshot);
});
```

This keeps `main.ts` ignorant of the Enter-from-list vs. options-panel distinction — both paths arrive at the same `castAction(spell, snapshot)`.

---

## Data flow

### Live cast (popup → dispatcher → caster → writer)

```
CommandPopup spellsPanel "cast" event (or options panel "cast" event)
  → castAction(spell, snapshot)            // single action for both paths
  → CastDispatcher.dispatch({ spell, ...snapshot, settings, activeFilePath, executeOnNote })
      ├── pre-flight: executeOnNote && activeFilePath === null → notify "Open a note…" + close + return
      ├── pre-flight: settings.executionMode === 'remote' && portalHost.trim() === '' → notify "Configure portal host…" + return (no close)
      ├── castId = generateId()
      ├── userPrompt = #buildUserPrompt(...)            // unchanged logic
      ├── logWriter.recordCasted({ castId, spellPath: spell.path, model, effort, contextNotes, followUp, executeOnNote }).catch(console.error)
      ├── notify(`Casting '${spell.name}'…`)            // local: this exact string; remote: `'…' on portal…`
      ├── close()
      └── caster.cast({ castId, spellPath, modelId, effort, userPrompt, systemPromptFile, vaultMountPath }, {
            onAccepted: ({ jobId }) => {
              if (jobId !== undefined) {
                logWriter.recordCasted({ castId, spellPath, model, effort, contextNotes, followUp, executeOnNote, portalCastId: jobId }).catch(console.error);
              }
              if (!isRemote) notify('Spell cast');       // local "accepted" == "completed" semantically; remote "accepted" gets no second toast
            },
            onFailure: (msg) => {
              logWriter.recordError({ castId, message: msg }).catch(console.error);
              notify(isRemote ? msg : `Cast failed: ${msg}`);
            },
          })
```

(`isRemote` is a constant the dispatcher captures at construction by reading `settings.executionMode` — see Key design decisions for why this is acceptable.)

### Forge imprint (mirror shape)

```
CommandPopup forge sentinel submit
  → imprintAction(snapshot)
  → ForgeImprinter.imprint(snapshot, settings, close)
      ├── pre-flight: invalid name → notify + close + return
      ├── pre-flight: remote + empty portalHost → notify + return (no close)
      ├── castId = generateId()
      ├── metaSpell = buildMetaSpell(...)
      ├── logWriter.recordCasted({ castId, spellPath: '<forge>', model, effort, contextNotes: [] }).catch(console.error)
      ├── notify(`Forging '${sanitised}'…`)            // local; remote: `…' on portal…`
      ├── close()
      └── caster.cast({ castId, spellPath: '<forge>', modelId, effort, userPrompt: metaSpell, systemPromptFile: undefined, vaultMountPath }, {
            onAccepted: ({ jobId }) => {
              if (jobId !== undefined) {
                logWriter.recordCasted({ castId, spellPath: '<forge>', model, effort, contextNotes: [], portalCastId: jobId }).catch(console.error);
              }
              if (!isRemote) notify(`Spell "${sanitised}" forged`);
            },
            onFailure: (msg) => {
              logWriter.recordError({ castId, message: msg }).catch(console.error);
              notify(isRemote ? msg : `Forge failed: ${msg}`);
            },
          })
```

The duplicated record-and-notify path in today's `#remoteImprint` disappears — both local and remote arrive at the same `onAccepted` / `onFailure` shape via `caster.cast`.

### main.ts wiring

```
onload:
  remoteTransport = new RemoteCastTransport({ requestUrlFn: requestUrl })
  localLogWriter  = new CastLogStore({ adapter, getLogPathAbs: localPath, getRemoteLogPathAbs: remotePath }) // still serves readAll()
  remoteLogWriter = new CastLogStore({ adapter, getLogPathAbs: remotePath })                                  // write-only role
  imprinter = new ForgeImprinter({ notify, caster: <created later or per-call>, logWriter: <ditto> })
  // see Key design decisions for whether caster is created per-onload or per-dispatch

openCommandPopup:
  isRemote = settings.executionMode === 'remote'
  caster   = createCaster(settings, { castRunner: new CastRunner(), remoteTransport })
  logWriter = isRemote ? remoteLogWriter : localLogWriter
  dispatcher = new CastDispatcher({ notify, close, caster, logWriter })
  popup = new CommandPopup({ app, spellTag, imprintAction, castAction, defaults, overrides, sessionMap, castLogPanelDeps })
```

---

## Error handling

- **Pre-flight guards** (no active note, empty portal host) live in the Observer (`CastDispatcher` / `ForgeImprinter`), not in the Caster — preserving the current "guard fires, no log entry, popup may stay open" semantics covered by existing tests.
- **`createCaster` precondition**: when `settings.executionMode === 'remote'` and `deps.remoteTransport` is missing, throw. This is a wiring bug, not a runtime condition. `main.ts` always provides one.
- **Remote `onAccepted` without `castId`**: `RemoteCaster` fires `onAccepted({})` (no jobId). The Observer's `onAccepted` writes the second `recordCasted` only when `jobId !== undefined`. Net behaviour matches today's `console.warn` + skip path.
- **Network / timeout / 401 / non-2xx**: all flow through `RemoteCaster`'s `onFailure`, identical strings to today (helpers in `src/cast/portal/` unchanged).
- **Local spawn error / non-zero exit**: `LocalCaster.onFailure(msg)` with the same message shape `CastRunner` produces today (`error.message ?? stderrTail ?? "exit N"`).

---

## Perspective synthesis (deep)

### Minimalist

Drop:
- Don't introduce a `CastFactoryClass` — `createCaster` is a free function; one switch, no state.
- Don't promote `CastInput` to a generic / branded type; `userPrompt` and `systemPromptFile?` cover both inline and file-mode CLI shapes already.
- Don't add a `CastObserver` interface — Dispatcher and Imprinter *are* the observers; abstracting the callback handler would be ceremony with one consumer each.
- Don't introduce `CastLogWriterFactory` — `main.ts` picks one of two pre-built writers with a ternary.
- Don't add a "remote vs local" enum to `Caster`. The whole point of the refactor is that the caller doesn't care.

Keep small: two impl classes (~30 LOC each), one factory function (~15 LOC), one new tiny interface file (`CastLogWriter`). The bulk of the diff is *deletion* in Dispatcher / Imprinter / main.ts.

### Extensibility

The shape leaves room for:
- A third transport (queue, websocket, batch) — slots into `createCaster`'s switch.
- Additional `CastAcceptedInfo` fields (`queuePosition?`, `acceptedAt?`) — additive, no callback-shape change.
- New observers (telemetry, retry-on-failure-policy) — wrap the existing dispatcher's callback before forwarding, no Caster change.
- `CastLogWriter` is the right seam for future writers (in-memory, batched, streaming) without touching `CastLogStore`'s reader.

What we *don't* extensibility-design for: switching modes mid-iteration. The factory is called per-popup-open; settings change between opens take effect on the next open. No reactive subscription needed.

### Devil's advocate

Risks:

1. **Lost `portalCastId` second write.** Today the second `recordCasted` lives inside `RemoteCastTransport`'s callback; after refactor it lives inside the Observer's `onAccepted`. If the Observer is wired wrong (forgets the second write, or writes with the wrong `spellPath`), the bug is silent — `portalCastId` never appears in the log, the foldEvents merge fails to associate cast→complete. **Mitigation:** explicit unit test "remote dispatch: onAccepted with jobId triggers a second `recordCasted` containing `portalCastId`" in both `CastDispatcher.test.ts` and `ForgeImprinter.test.ts` (these tests exist today — they must continue to pass with the new wiring).

2. **`{ remote: true }` removal silently breaks readers.** `CastLogStore.readAll()` reads both files via `getLogPathAbs` + `getRemoteLogPathAbs?`. After the split, `localLogWriter` (the singleton hooked into the `CastLogPanel`'s `CastLogSource`) keeps both getters; `remoteLogWriter` only has `getLogPathAbs` (= remote path) — it's write-only by convention, never read. **Mitigation:** the second store instance is *only* injected into Dispatcher/Imprinter via the `CastLogWriter` interface; the panel keeps the original. A grep-assert can verify no consumer outside `main.ts` constructs a `CastLogStore`.

3. **Mode switch race during long-lived popup.** User opens popup with `executionMode: 'local'`, edits settings → 'remote' → casts. Today the popup's `castAction` reads `this.data.settings` on each call, so the second cast goes remote. After refactor, `caster` is bound at popup-open. If the user changes mode mid-popup, the bound caster is stale. **Mitigation:** `createCaster` is called *inside* `#openCommandPopup`, which is per popup invocation. To preserve "settings change between actions take effect on the next action," construct the caster **per dispatch**, not per popup-open. Trade-off: factory call cost is trivial (one `new`, no I/O). **Decision: per-dispatch construction.** `main.ts` passes `() => createCaster(currentSettings, deps)` as a thunk, and Dispatcher/Imprinter call the thunk on each `dispatch`/`imprint`. (This is the same closure pattern `castAction` already uses for `this.data.settings`.) Updated wiring shown in Technical notes.

4. **Pre-flight guard duplication.** The "remote + empty portalHost" guard exists today in two places (Dispatcher and Imprinter). After refactor it stays in two places. Factoring it out is tempting; **rejected** — the guard's failure mode is intertwined with each caller's pre-dispatch flow (Imprinter also has the `sanitiseSpellName` guard before/after; Dispatcher has the `executeOnNote && activeFilePath === null` guard). A shared guard helper would obscure the per-caller ordering. Leave duplicated; cover with test.

5. **Test API churn.** Renaming `optionsCastAction` to `castAction` in `CommandPopup`, removing the old `castAction: (spell) => void`, breaks `tests/CommandPopup.test.ts`, `tests/integration/spell-cast.spec.ts`, `tests/integration/harness.ts`, `tests/integration/forge-cast.spec.ts`. **Mitigation:** included as explicit todos in section F.

### User advocate

Developer ergonomics:
- `caster.cast(input, callbacks)` reads the same as `runner.run(input, callbacks)` does today — familiar shape, no learning curve.
- Renaming `optionsCastAction → castAction` is the right user-facing name; the previous "two actions" was an implementation accident leaking through.
- The `{ jobId? }` shape on `onAccepted` is honest — it's optional precisely when remote returns 202 without an id.
- `createCaster` is a one-line call site; no factory-class boilerplate.
- The `isRemote` flag the Observer captures is a small wart (the Observer "shouldn't know" but does, to pick the right notice text). Acceptable: notice strings are user-facing copy and belong with the user-facing layer (Observer), not the transport. The Observer reading `settings.executionMode` once is cheaper than threading "is this an `accepted` or a `completed` event?" through the Caster interface.

Net: the refactor removes more concepts (`{ remote: true }`, `optionsCastAction`, two transports threaded through Dispatcher) than it adds (`Caster`, `CastLogWriter`, `createCaster`, `LocalCaster`, `RemoteCaster`).

### Critical concerns (consensus)

- **Devil's advocate point 3** (per-dispatch caster construction) is the load-bearing decision; promoted to Key design decision #3.
- **Devil's advocate point 1** (lost second `recordCasted`) is the load-bearing test; promoted to a non-negotiable assertion in section D.
- All four perspectives agree on the Caster interface shape, the factory placement, and the Observer-pattern direction.

---

## Key design decisions

1. **`Caster` is a structural interface, not an abstract base class.** Matches the pattern `RemoteCastTransport` already uses (the live-spec for remote-casting calls this out explicitly). Keeps `LocalCaster` and `RemoteCaster` decoupled from each other and from any shared scaffolding.

2. **`createCaster` is a free function in `src/cast/createCaster.ts`, not a class.** One switch on `executionMode`. No state, no methods. Mirrors how `resolveCliBinary` is shaped.

3. **The caster is constructed per dispatch, not per popup-open.** Reason: settings live-read semantics (matches today's behaviour for `castAction` and `imprintAction` closures over `this.data.settings`). `main.ts` injects a thunk `() => createCaster(currentSettings, deps)` into Dispatcher and Imprinter; they call it inside `dispatch()` / `imprint()`. The thunk is one allocation per cast — trivial.

4. **`CastLogStore` is reused (not subclassed) for the remote log path.** Two instances of the same class, different `getLogPathAbs`. The store implements `CastLogWriter` directly; we don't need a `RemoteCastLogStore` subclass. This deletes the `RecordOptions { remote? }` parameter without inventing a new type.

5. **`CastLogWriter` interface is the seam Observers depend on.** Dispatcher and Imprinter type their dep as `CastLogWriter`, not `CastLogStore` — they only need write methods. `main.ts` injects the right instance. The reader (`CastLogPanel`'s `CastLogSource`) keeps depending on the existing `CastLogStore` (the local one, which has both getters and merges both files in `readAll`).

6. **The pre-flight guards stay in Dispatcher / Imprinter.** "No active note" and "empty portalHost" do not fit the Caster's `cast(input, callbacks)` shape (the latter would need `onFailure` to fire synchronously *and* the caller to know "this is a guard failure, don't write a log entry"). Keeping them in the Observer preserves the existing test contract (`recordCasted` not called, `close` not called).

7. **The Observer captures `isRemote` from settings to pick notice text and decide whether `onAccepted` produces a "Spell cast" toast.** The Caster doesn't carry user-facing copy. Local "accepted" semantically equals "completed" today (CLI exit 0 = success); remote "accepted" semantically equals "started" (the toast for completion comes via the hook materializer's `done` event, not the callback). Same logic exists today, just spread differently.

8. **Folder reshape mirrors the `cast/portal/` convention already in place.** All local-CLI files move into `src/cast/local/`. Shared types stay at `src/cast/` root. Imports update by path only — no symbol renames in the moved files.

9. **`RemoteCastTransport` keeps its current name and location.** It becomes an implementation detail of `RemoteCaster` — `RemoteCaster` holds a `RemoteCastTransport` and adapts its callback names (`onAccepted({ portalCastId })` → `onAccepted({ jobId: portalCastId })`). The transport's HTTP code is unchanged.

10. **No new notice strings.** Every notification string in the new code exists verbatim in the current code.

---

## Technical notes

### Dependencies

- No new runtime dependencies.
- No new dev dependencies.

### Test strategy

- Existing tests are the contract: any change that breaks behaviour breaks an existing test.
- Tests that observe the **public API at the seam** (constructor deps, callback shape) require updates: `tests/CastDispatcher.test.ts`, `tests/ForgeImprinter.test.ts`, `tests/integration/remote-cast.spec.ts`, `tests/integration/remote-forge.spec.ts`, `tests/CommandPopup.test.ts`, `tests/integration/harness.ts`, `tests/integration/forge-cast.spec.ts`, `tests/integration/spell-cast.spec.ts`. All updates are mechanical: dep-shape change, callback-name change.
- Tests that observe **internal behaviour** (the buildPortalUrl / parsePortalScheme / mapPortalError suite, the CastSpawner suite, etc.) are unchanged — those modules don't move beyond folder paths.
- New tests:
  - `createCaster` returns `LocalCaster` for `executionMode: 'local'`, `RemoteCaster` for `executionMode: 'remote'`, throws on remote without transport.
  - `LocalCaster.cast` translates `onSuccess` → `onAccepted({})`, `onFailure(msg)` → `onFailure(msg)`.
  - `RemoteCaster.cast` translates 202 with castId → `onAccepted({ jobId })`, 202 without castId → `onAccepted({})`, every error path → `onFailure(msg)` with the same strings as today.
  - `CastLogStore` write methods called without the second arg behave identically to today's call without `{ remote: true }` (sanity test that the parameter removal is clean).

### Patterns considered

- **Factory pattern (Step 1 of design-patterns):** `createCaster` selecting between `LocalCaster` / `RemoteCaster` based on a settings field is the textbook factory case. **Adopted.** Free function, not a class — no state, one switch.
- **Strategy pattern:** `Caster` *is* a Strategy interface. `LocalCaster` and `RemoteCaster` are concrete strategies. **Adopted implicitly.** Both share the same `cast(input, callbacks)` slot in Dispatcher/Imprinter; the factory chooses.
- **Observer pattern:** Dispatcher/Imprinter observe Caster events via callbacks; Caster does not know who is listening. **Adopted.** Matches the spec's explicit Observer language.
- **Adapter pattern:** `RemoteCaster` adapts `RemoteCastTransport`'s `{ onAccepted: ({ portalCastId }) }` shape to the unified `{ onAccepted: ({ jobId? }) }` shape. **Adopted (one-line method).** Considered: collapsing `RemoteCastTransport` into `RemoteCaster` directly. Rejected: the transport encapsulates HTTP error mapping (`mapPortalError`), URL building, body building, timeout race — splitting these out keeps the Caster thin and the transport unit-testable in isolation.
- **Bridge pattern:** considered as a way to fully decouple the Observer interface from the concrete Caster classes. Rejected — YAGNI; one Observer per surface, no orthogonal axis to bridge over.
- **Decorator pattern:** considered for layering future telemetry / retry observers. Rejected for now — no second observer exists; structure is open enough that adding one later is additive.
- **Template Method:** considered as a shared base class for Caster impls (e.g. shared id-generation, shared input validation). Rejected — the two impls share *zero* execution logic; their only commonality is the callback shape, which the interface already enforces.
- **Singleton:** explicitly avoided for the writer-store pair. `main.ts` constructs both instances explicitly and passes references — no module-level state.

### Backward compatibility

- The on-disk log format is unchanged. `cast-log-local.jsonl` and `cast-log-remote.jsonl` continue to receive the same event shapes.
- `manifest.json` and the Plugin entry contract are unchanged.
- Settings shape unchanged.
- The hook materializer's contract (`HookMaterializer`) is unchanged.

### Migration order (why this order matters)

1. New types and impls land first (`Caster`, `LocalCaster`, `RemoteCaster`, `createCaster`, `CastLogWriter`) so each is testable in isolation.
2. `CastLogStore` loses `{ remote: true }` *after* `CastLogWriter` exists — Dispatcher/Imprinter migrate to `CastLogWriter` first.
3. Folder reshape (`src/cast/local/`) lands before any test that imports the moved files runs — done as a single commit per move.
4. Dispatcher migrates to `Caster + CastLogWriter`, then Imprinter (independent surfaces).
5. `main.ts` rewires last — it's the integration point. By the time main.ts changes, all callees expose the new shape.
6. CommandPopup consolidation (`castAction` rename) is separable from the Caster work — sequenced last so it doesn't tangle with the transport refactor.
7. Final tidy: delete the now-unused `CastDispatcherDeps.castRunner`, `CastDispatcherDeps.spawner`, `CastDispatcherDeps.remoteTransport` properties; same for `ForgeImprinter`.

---

## Todos

### A. Foundations: `Caster` interface and `CastLogWriter`

#### Section briefing

**What this section produces**
- New file `src/cast/Caster.ts` exporting `Caster`, `CastInput`, `CastCallbacks`, `CastAcceptedInfo` — see Interfaces.
- New file `src/castLog/CastLogWriter.ts` exporting `CastLogWriter`, `RecordCastedInput`, `RecordErrorInput` — see Interfaces.
- A test file pair confirming the types are exported and the names match the contracts.

**Design context the executor needs upfront**
From Key design decisions #1: "`Caster` is a structural interface, not an abstract base class." From Key design decisions #5: "`CastLogWriter` interface is the seam Observers depend on; Dispatcher and Imprinter type their dep as `CastLogWriter`, not `CastLogStore`." Use the verbatim type signatures shown in the Interfaces section.

**Cross-section couplings**
- A1 is a prerequisite for B1, B2, C1, C2 (the impls and the factory cannot exist without the interface).
- A2 is a prerequisite for D2, E2 (Dispatcher and Imprinter type their dep on `CastLogWriter`).

**Section-level Red criterion**
A new test file imports `Caster`, `CastInput`, `CastCallbacks`, `CastAcceptedInfo` from `src/cast/Caster` and `CastLogWriter`, `RecordCastedInput`, `RecordErrorInput` from `src/castLog/CastLogWriter` and a `tsc --noEmit` over the test file passes. A grep for `recordCasted(` / `recordError(` in those files matches the new method signatures (no second `RecordOptions` arg).

**junior-dev**
- [ ] A1: Create `src/cast/Caster.ts` with the four exports `Caster`, `CastInput`, `CastCallbacks`, `CastAcceptedInfo` exactly as specified in the Interfaces section above. — S, junior-dev
- [ ] A2: Create `src/castLog/CastLogWriter.ts` with `CastLogWriter`, `RecordCastedInput`, `RecordErrorInput` exactly as specified. Move the `RecordCastedInput` / `RecordErrorInput` type aliases from `src/castLog/store.ts` into this file; re-export them from `store.ts` for backward compatibility during migration. — S, junior-dev
- [ ] A3: Add a unit test file `tests/cast/Caster.types.test.ts` that imports the four types and writes a no-op assignment to confirm they exist and have the expected shape (compile-time test + a runtime `expect(true).toBe(true)`). — S, junior-dev

### B. Local Caster

#### Section briefing

**What this section produces**
- New file `src/cast/local/LocalCaster.ts` exporting class `LocalCaster implements Caster`.
- A unit test file `tests/cast/local/LocalCaster.test.ts` covering the callback translation.

**Design context the executor needs upfront**
From Components: "`LocalCaster` — wraps `CastRunner`; fires `onAccepted()` on exit 0, `onFailure(msg)` on non-zero exit / spawn error." `LocalCaster` translates `CastRunCallbacks` (`onSuccess: () => void`, `onFailure(msg)`) into `CastCallbacks` (`onAccepted({})`, `onFailure(msg)`). The runner's `CastRunInput` has both inline (`metaSpell`) and file (`systemPromptFile + userPrompt`) shapes — `LocalCaster` chooses one based on whether `input.systemPromptFile` is present.

**Cross-section couplings**
- B1 depends on A1 (uses the `Caster`, `CastInput`, `CastCallbacks` types).
- B1 is a prerequisite for C1 (the factory returns `LocalCaster` for local mode).
- B does **not** require the folder move (section H) yet — `LocalCaster` can import `CastRunner` from its current path; the import path updates in section H.

**Section-level Red criterion**
`tests/cast/local/LocalCaster.test.ts` asserts: (1) when `input.systemPromptFile` is defined, the runner is invoked with file-mode args (`systemPromptFile + userPrompt`); (2) when `systemPromptFile` is undefined, the runner is invoked with inline-mode args (`metaSpell: input.userPrompt`); (3) `runner.onSuccess()` triggers `callbacks.onAccepted({})` exactly once; (4) `runner.onFailure(msg)` triggers `callbacks.onFailure(msg)` exactly once with the same message. All four pass.

**senior-dev**
- [ ] B1: Implement `src/cast/local/LocalCaster.ts` — class `LocalCaster implements Caster`, constructor `({ runner, settings: GrimoireSettings })`. `cast(input, callbacks)` builds a `CastRunInput` (file-mode if `input.systemPromptFile` is set, inline-mode if not — pass `input.userPrompt` as `metaSpell`), then calls `runner.run(runInput, { onSuccess: () => callbacks.onAccepted({}), onFailure: callbacks.onFailure })`. Pull `binaryPath` and `cliCommand` from settings. — M, senior-dev
- [ ] B2: Add `tests/cast/local/LocalCaster.test.ts` — four cases per the Red criterion above. Mock `CastRunner` with a `vi.fn()` stub. — M, senior-dev

### C. Remote Caster + Factory

#### Section briefing

**What this section produces**
- New file `src/cast/portal/RemoteCaster.ts` exporting class `RemoteCaster implements Caster`.
- New file `src/cast/createCaster.ts` exporting the `createCaster` function.
- Two unit test files: `tests/cast/portal/RemoteCaster.test.ts` and `tests/cast/createCaster.test.ts`.

**Design context the executor needs upfront**
From Key design decisions #2: "`createCaster` is a free function in `src/cast/createCaster.ts`, not a class. One switch on `executionMode`." From Error handling: "`RemoteCaster` fires `onAccepted({})` (no jobId) when the portal returns 202 without a castId — net behaviour matches today's `console.warn` + skip path." From Key design decisions #9: "`RemoteCaster` holds a `RemoteCastTransport` and adapts its callback names." Use the verbatim factory signature in Interfaces (`createCaster.ts`).

**Cross-section couplings**
- C1 depends on A1 (uses Caster types).
- C2 depends on B1 and C1 (the factory imports both `LocalCaster` and `RemoteCaster`).
- C1 maps `transport.run`'s `{ portalCastId }` to `{ jobId: portalCastId }`. Verify by reading `src/cast/RemoteCastTransport.ts:118` — the transport invokes `callbacks.onAccepted({ portalCastId: <string> })` only when 202 carries a string `castId`; otherwise it `console.warn`s and returns without calling onAccepted at all. RemoteCaster must therefore wrap the transport so that the no-castId 202 case still fires `onAccepted({})` — see Devil's advocate point 1 in the perspective synthesis.

**Section-level Red criterion**
Three test files all green: (1) RemoteCaster routes 202+castId to `onAccepted({ jobId: 'srv-x' })`, 202 without castId to `onAccepted({})`, every error path (network, timeout, 401, non-2xx) to `onFailure(<exact-current-message>)`. (2) `createCaster({executionMode:'local',...}, deps)` returns an instance whose `cast` invokes `deps.castRunner`'s run; `createCaster({executionMode:'remote',...}, deps)` returns one that invokes `deps.remoteTransport`'s run; `createCaster({executionMode:'remote'}, {})` (no transport) throws.

**senior-dev**
- [ ] C1: Implement `src/cast/portal/RemoteCaster.ts` — class `RemoteCaster implements Caster`, constructor `({ transport: RemoteCastTransport, settings: GrimoireSettings })`. `cast(input, callbacks)` calls `transport.run({...portal fields from settings, castId, spellPath, userPrompt: input.userPrompt, modelId, effort}, { onAccepted: ({portalCastId}) => callbacks.onAccepted({jobId: portalCastId}), onFailure: callbacks.onFailure })`. **Crucial:** wrap so that if the transport does *not* call `onAccepted` (the 202-without-castId case), **`RemoteCaster` does not synthesise one either** — preserves today's behaviour where the second `recordCasted` is silently skipped. (Document this with a comment citing `src/cast/RemoteCastTransport.ts:118`.) — M, senior-dev
- [ ] C2: Implement `src/cast/createCaster.ts` exactly per the Interfaces section. Throws when `executionMode === 'remote'` and `deps.remoteTransport` is undefined. For local mode, instantiates `new CastRunner()` if `deps.castRunner` is omitted. — S, junior-dev
- [ ] C3: Add `tests/cast/portal/RemoteCaster.test.ts` with cases (a) 202+castId → onAccepted({jobId}); (b) 202 without castId → no onAccepted call; (c) network error → onFailure with the network-error notice; (d) timeout → onFailure with the timeout notice; (e) 401 → onFailure with the 401 notice; (f) other non-2xx → onFailure with the non-2xx notice. Stub `RemoteCastTransport` with a `vi.fn()` that drives the callbacks the test wants. — M, senior-dev
- [ ] C4: Add `tests/cast/createCaster.test.ts` covering local/remote/missing-transport-throws + that the returned object has a `cast` method that delegates to the underlying runner / transport. — S, junior-dev

### D. CastDispatcher migration to Caster + CastLogWriter

#### Section briefing

**What this section produces**
- Modified `src/cast/CastDispatcher.ts` — constructor deps replace `castRunner` / `spawner` / `remoteTransport` / `castLogStore` with `caster: () => Caster` (thunk) + `logWriter: CastLogWriter`. The `executionMode` switch and `#remoteDispatch` private method are deleted; both branches collapse onto `caster.cast(input, callbacks)`.
- Updated `tests/CastDispatcher.test.ts` and `tests/integration/remote-cast.spec.ts` reflecting the new dep shape; assertions for behaviour are unchanged.

**Design context the executor needs upfront**
From Key design decisions #3: "The caster is constructed per dispatch, not per popup-open. `main.ts` injects a thunk `() => createCaster(currentSettings, deps)` into Dispatcher and Imprinter; they call it inside `dispatch()` / `imprint()`." From Key design decisions #6: "The pre-flight guards stay in Dispatcher / Imprinter." From Key design decisions #7: "The Observer captures `isRemote` from settings to pick notice text." From Devil's advocate point 1: "Lost `portalCastId` second write" — D5 must assert this explicitly. From Data flow > Live cast: copy the dispatch flow verbatim into the new `dispatch` body.

**Cross-section couplings**
- D depends on A1, A2, C1 (uses Caster, CastLogWriter, RemoteCaster's exported types via the factory).
- D5 depends on the same property as ForgeImprinter's E5 — both are the "second `recordCasted` with `portalCastId`" assertion.
- D must not move CastRunner imports yet (section H does the folder move). The dispatcher will lose all direct `CastRunner` / `RemoteCastTransport` imports as part of D1.

**Section-level Red criterion**
All existing `tests/CastDispatcher.test.ts` cases pass with the new constructor shape (replaced `{ castRunner, remoteTransport, castLogStore }` with `{ caster, logWriter }`). The remote-branch tests (`remote happy path`, `remote onAccepted`, `remote onFailure`, pre-dispatch guard, missing-transport, whitespace-only host) all pass. `tests/integration/remote-cast.spec.ts` passes with `caster` constructed from `createCaster(settings, { remoteTransport })` and `logWriter` being a fresh `CastLogStore` pointed at the remote path.

**senior-dev**
- [ ] D1: Refactor `CastDispatcher` constructor: replace deps `{ castRunner?, spawner?, remoteTransport?, castLogStore }` with `{ caster: () => Caster, logWriter: CastLogWriter, generateId? }`. Capture the thunk; do not invoke it at construction. — M, senior-dev
- [ ] D2: Replace the `dispatch` body with the unified flow shown in Data flow > Live cast. Pre-flight guards (`executeOnNote && activeFilePath === null`, `executionMode === 'remote' && portalHost.trim() === ''`) stay; `#remoteDispatch` is deleted; the local-vs-remote choice happens inside the thunk-built `caster.cast(...)`. Capture `isRemote = settings.executionMode === 'remote'` once for notice text. — M, senior-dev
- [ ] D3: Inside the `caster.cast` callbacks: `onAccepted({jobId})` — if `jobId !== undefined`, write a second `recordCasted` with `portalCastId: jobId`; if `!isRemote`, notify `'Spell cast'`. `onFailure(msg)` — write `recordError({castId, message: msg})` then notify (`'Cast failed: '+msg` for local, `msg` for remote). — M, senior-dev
- [ ] D4: Update `tests/CastDispatcher.test.ts` — replace the `castRunner` / `remoteTransport` stub helpers with a single `makeStubCaster()` that returns `{ stub: () => Caster, getInput, getCallbacks }`. Update every test call to use `caster: stubCaster, logWriter: storeStub` instead of the old shape. Behaviour assertions unchanged. — M, senior-dev
- [ ] D5: Add an explicit assertion in `tests/CastDispatcher.test.ts` (or strengthen the existing "remote onAccepted" test): when the caster's `onAccepted` fires with `{ jobId: 'srv-1' }`, `logWriter.recordCasted` is called *exactly twice*, the second call's first arg matches `expect.objectContaining({ castId: <fixed-id>, portalCastId: 'srv-1' })`. Also assert: when `onAccepted({})` fires (no jobId), only the *first* `recordCasted` was made. — S, senior-dev
- [ ] D6: Update `tests/integration/remote-cast.spec.ts` — the harness section that constructs `CastDispatcher` now builds a `caster` thunk via `createCaster(settings, { remoteTransport })` and a write-only `CastLogStore` for the remote path; assertions on what gets written to which log file are unchanged. — M, senior-dev

### E. ForgeImprinter migration

#### Section briefing

**What this section produces**
- Modified `src/forge/ForgeImprinter.ts` — same dep-shape change as Dispatcher; `#remoteImprint` deleted; both branches collapse onto `caster.cast(...)`. The duplicated record-and-notify code is removed in the process.
- Updated `tests/ForgeImprinter.test.ts` and `tests/integration/remote-forge.spec.ts`.

**Design context the executor needs upfront**
From Problems to solve > 5: "Remove `executionMode === 'remote'` from `ForgeImprinter`. `ForgeImprinter` receives a `Caster` and calls `caster.cast(...)`. No mode checks." From Problems to solve > 7: "Today: `#remoteImprint()` duplicates record/notify logic and the local path has its own early-recording. After the refactor the bug disappears naturally when both paths go through the same `caster.cast(input, { onAccepted, onFailure })` call." Use Data flow > Forge imprint verbatim.

**Cross-section couplings**
- E depends on A1, A2, C1 (Caster, CastLogWriter, factory).
- E5 mirrors D5 (the `portalCastId` second-write contract test must exist for both call sites).
- ForgeImprinter still owns the `sanitiseSpellName` empty-name guard and the empty-portal-host guard — those stay.

**Section-level Red criterion**
All existing `tests/ForgeImprinter.test.ts` cases pass with the new constructor `{ notify, caster, logWriter, generateId? }` (no more `castRunner` / `remoteTransport` / `castLogStore`). `tests/integration/remote-forge.spec.ts` passes. The `executionMode` keyword no longer appears in `src/forge/ForgeImprinter.ts`. Grep-assert: `grep -E "executionMode" src/forge/ForgeImprinter.ts` returns nothing.

**senior-dev**
- [ ] E1: Refactor `ForgeImprinter` constructor: replace `{ notify, castRunner, castLogStore, generateId?, remoteTransport? }` with `{ notify, caster: () => Caster, logWriter: CastLogWriter, generateId? }`. — M, senior-dev
- [ ] E2: Replace `imprint(snapshot, settings, close)` body per Data flow > Forge imprint. Keep the empty-name guard and the empty-portal-host guard (both intact). Delete `#remoteImprint`, `#runCasting`, `#recordCast`, `#getMetaSpell` only if they collapse cleanly into the new `imprint` body — otherwise inline the relevant pieces. The new body builds `castId`, builds `metaSpell` (call `buildMetaSpell` directly), records `casted`, notifies, closes, then calls `caster.cast(...)` with `userPrompt: metaSpell`, `systemPromptFile: undefined`. — M, senior-dev
- [ ] E3: `caster.cast` `onAccepted({jobId})` callback: same shape as Dispatcher's — second `recordCasted` only when `jobId` is defined; `notify('Spell "<sanitised>" forged')` only when `!isRemote`. `onFailure(msg)`: `recordError` then notify (`'Forge failed: '+msg` for local, `msg` for remote). — M, senior-dev
- [ ] E4: Update `tests/ForgeImprinter.test.ts` — same `makeStubCaster()` helper pattern as Dispatcher tests. Every existing assertion stays; only the dep-shape changes. — M, senior-dev
- [ ] E5: Strengthen the "remote onAccepted" test in `tests/ForgeImprinter.test.ts` — assert the second `recordCasted` carries `portalCastId` and is called *exactly twice* total; assert that `onAccepted({})` (no jobId) results in only the first call. — S, senior-dev
- [ ] E6: Update `tests/integration/remote-forge.spec.ts` — same pattern as D6. — M, senior-dev

### F. CommandPopup consolidation

#### Section briefing

**What this section produces**
- Modified `src/ui/CommandPopup.ts` — drop `CastAction = (spell) => void`; rename `OptionsCastAction` (callback shape `(spell, snapshot) => void`) to `CastAction`; drop `optionsCastAction` constructor param; rename remaining single `castAction` to use the new shape. The `panel.events.on("cast", ...)` handler builds a default `OptionsFormSnapshot` and calls `castAction(spell, snapshot)`.
- Updated `tests/CommandPopup.test.ts`, `tests/integration/harness.ts`, and `tests/integration/spell-cast.spec.ts`, `tests/integration/forge-cast.spec.ts` — all places that pass `optionsCastAction` separately collapse to a single `castAction` of the new shape.

**Design context the executor needs upfront**
From Problems to solve > 6: "Single `cast(spell: Spell, snapshot: CastSnapshot)` action. The no-options call site builds a default snapshot from `settings.defaultModel` / `settings.defaultEffort` / etc. `CommandPopup`'s constructor loses `castAction` param; `optionsCastAction` is renamed to `castAction`." From Interfaces > CommandPopup constructor params after refactor — the snapshot defaults are: `model: defaults.defaultModel`, `effort: defaults.defaultEffort`, `contextNotePaths: []`, `followUp: ''`, `executeOnNote: spell.executeOnNote`. Build the snapshot **inside** the popup, not inside `main.ts` — keeps `main.ts` ignorant of the no-options vs. options-panel distinction.

**Cross-section couplings**
- F is independent of sections A–E (the popup change touches the UI seam, not the casting layer); can be done in parallel with D/E if reviewer prefers, but ordered after them in this plan to keep the diff focused.
- F2 depends on F1 (constructor shape change must precede handler-body change).

**Section-level Red criterion**
`CommandPopup.test.ts` no longer passes `optionsCastAction` to the constructor. The harness's `createPopupHarness` accepts a single `castAction` callback of shape `(spell, snapshot) => void` and removes `optionsCastAction`. `tests/integration/spell-cast.spec.ts` asserts `castAction` is called with both args (the snapshot defaults are checked: model = `defaults.defaultModel`, effort = `defaults.defaultEffort`, contextNotePaths = `[]`, followUp = `''`, executeOnNote = `spell.executeOnNote`). All existing behaviour (Enter on row → cast, Right Arrow → options panel → cast with form values) preserved.

**junior-dev**
- [ ] F1: In `src/ui/CommandPopup.ts`: remove `export type CastAction = (spell: Spell) => void`; rename `export type OptionsCastAction = (spell, snapshot) => void` to `export type CastAction = (spell, snapshot) => void`; in `CommandPopupParams`, remove the `optionsCastAction` field, change `castAction`'s type to the new shape. Constructor: remove `this.#optionsCastAction` field; replace its uses with `this.#castAction`. — S, junior-dev
- [ ] F2: In `#createSpellsPanel`, change `panel.events.on("cast", (spell) => this.#castAction(spell))` to build a default snapshot from `this.#formDefaults` plus `executeOnNote: spell.executeOnNote`, `contextNotePaths: []`, `followUp: ''`, then call `this.#castAction(spell, snapshot)`. In `#renderOptionsPanel`, the `onCast` handler stays `(snap) => this.#castAction(spell, snap)`. — S, junior-dev
- [ ] F3: Update `tests/CommandPopup.test.ts` — remove `optionsCastAction` from every constructor call; change `castAction` typing to the new shape; existing assertions stay. — S, junior-dev
- [ ] F4: Update `tests/integration/harness.ts` — `createPopupHarness` options accept a single `castAction: CastAction` (new shape) and drop `optionsCastAction`. `CommandPopup` is constructed without `optionsCastAction`. — S, junior-dev
- [ ] F5: Update `tests/integration/spell-cast.spec.ts` — assertions now check `castAction` was called with `(spell, snapshot)`; assert default snapshot fields per the Red criterion (model, effort, contextNotePaths, followUp, executeOnNote). — S, junior-dev
- [ ] F6: Update `tests/integration/forge-cast.spec.ts` and any other callers of `createPopupHarness` / `new CommandPopup` to drop `optionsCastAction`. — S, junior-dev

### G. main.ts wiring

#### Section briefing

**What this section produces**
- Modified `src/main.ts` — constructs two `CastLogStore` instances (one keeps both getters for the panel reader; one is write-only at the remote path); injects the right `logWriter` and a `caster` thunk into Dispatcher and Imprinter. Removes the direct `castRunner` / `remoteTransport` / `castLogStore` (the old singleton) injections from those constructors. Builds the default `OptionsFormSnapshot` no longer in `main.ts` (the popup does it now); the only `castAction` closure left is `(spell, snap) => dispatcher.dispatch({ spell, model: snap.model, ... })`.
- No new tests; existing `tests/main.test.ts` and `tests/plugin.test.ts` continue to pass.

**Design context the executor needs upfront**
From Key design decisions #4: "Two instances of the same class, different `getLogPathAbs`. The store implements `CastLogWriter` directly." From Key design decisions #3: "`main.ts` injects a thunk `() => createCaster(currentSettings, deps)` into Dispatcher and Imprinter." From Data flow > main.ts wiring: copy the wiring sketch verbatim into `#openCommandPopup`. The `imprinter` is constructed in `onload` today; it stays there but its deps change — the `caster` thunk references `this.data.settings` (live-read) so it picks up settings changes between imprints.

**Cross-section couplings**
- G depends on every prior section (D, E, F land first; then `main.ts` rewires).
- G3 (the `castAction` closure simplification) depends on F2 (the popup builds the snapshot, so `main.ts` no longer has two closures).

**Section-level Red criterion**
- `main.ts` has zero references to `{ remote: true }`.
- `main.ts` has exactly two `new CastLogStore(...)` calls (one with both getters, one with only `getLogPathAbs` pointing at the remote path).
- `CastDispatcher` and `ForgeImprinter` constructors in `main.ts` receive `{ caster: () => createCaster(...), logWriter: ... }` and nothing related to the old `castRunner` / `remoteTransport` field.
- `CommandPopup` constructor in `main.ts` receives a single `castAction` (the new shape) and no `optionsCastAction`.
- All existing tests green: `npm test` and `npm run test:integration` both pass.

**senior-dev**
- [ ] G1: In `main.ts.onload`, construct `localLogWriter = this.#castLogStore` (same singleton, now serves as both reader for the panel and writer for the local path) and `remoteLogWriter = new CastLogStore({ adapter, getLogPathAbs: () => normalizePath(`${pluginDir}/cast-log-remote.jsonl`) })` (write-only role; no `getRemoteLogPathAbs`). Change `imprinter`'s deps to `{ notify, caster: () => createCaster(this.data.settings, { remoteTransport: this.#remoteTransport }), logWriter: this.data.settings.executionMode === 'remote' ? remoteLogWriter : localLogWriter }`. — M, senior-dev
- [ ] G2: In `#createDispatcher`, replace the deps with `{ notify, close, caster: () => createCaster(this.data.settings, { remoteTransport: this.#remoteTransport }), logWriter: this.data.settings.executionMode === 'remote' ? remoteLogWriter : localLogWriter }`. Both `localLogWriter` and `remoteLogWriter` are members on the plugin (or captured by closure in `onload` and referenced in `#createDispatcher` via `this.#localLogWriter` / `this.#remoteLogWriter` fields). — M, senior-dev
- [ ] G3: In `#createCommandPopup`, remove the `optionsCastAction` constructor argument and replace the two-closure `castAction` + `optionsCastAction` pair with a single `castAction: (spell, snap) => dispatcher.dispatch({ spell, model: snap.model, effort: snap.effort, contextNotePaths: snap.contextNotePaths, followUp: snap.followUp, settings: this.data.settings, activeFilePath: this.app.workspace.getActiveFile()?.path ?? null, executeOnNote: snap.executeOnNote })`. — S, junior-dev
- [ ] G4: Run `npm test` and `npm run test:integration` — both green. — S, junior-dev

### H. Folder reshape: `src/cast/local/`

#### Section briefing

**What this section produces**
- Files moved to `src/cast/local/`: `CastRunner.ts`, `spawnCast.ts`, `buildCastArgs.ts`, `resolveCliBinary.ts`. (`LocalCaster.ts` already lives there from B1.)
- Updated import paths in every file that referenced the moved modules: `src/cast/CastDispatcher.ts` (post-D), `src/cast/createCaster.ts` (post-C), `src/forge/ForgeImprinter.ts` (post-E), tests that import these directly (`tests/CastRunner.test.ts`, `tests/CastSpawner.test.ts`, `tests/buildCastArgs.test.ts`, `tests/resolveCliBinary.test.ts`).
- No file content changes beyond `import` lines.

**Design context the executor needs upfront**
From Key design decisions #8: "Folder reshape mirrors the `cast/portal/` convention already in place. All local-CLI files move into `src/cast/local/`. Shared types stay at `src/cast/` root. Imports update by path only — no symbol renames in the moved files."

**Cross-section couplings**
- H is sequenced last so the rename diff doesn't tangle with the behaviour-changing diffs in D, E, G. Done as four separate commits (one per file move) for reviewability.
- After H, `src/cast/` contains only `Caster.ts`, `createCaster.ts`, `CastDispatcher.ts`, plus the `local/` and `portal/` subfolders.

**Section-level Red criterion**
All tests green after each move. `find src/cast -maxdepth 1 -type f` returns only `Caster.ts`, `createCaster.ts`, `CastDispatcher.ts` (and any other top-level `.ts` files like the `RemoteCastTransport.ts` if it stays at root — see Components: it stays under `portal/` already).

**junior-dev**
- [ ] H1: `git mv src/cast/CastRunner.ts src/cast/local/CastRunner.ts`; update every importing file's path. Run `npm test` — green. Commit. — S, junior-dev
- [ ] H2: `git mv src/cast/spawnCast.ts src/cast/local/spawnCast.ts`; update imports. Run tests. Commit. — S, junior-dev
- [ ] H3: `git mv src/cast/buildCastArgs.ts src/cast/local/buildCastArgs.ts`; update imports. Run tests. Commit. — S, junior-dev
- [ ] H4: `git mv src/cast/resolveCliBinary.ts src/cast/local/resolveCliBinary.ts`; update imports. Run tests. Commit. — S, junior-dev
- [ ] H5: Verify `tests/cast/local/LocalCaster.test.ts` (from B2) and `src/cast/local/LocalCaster.ts` (from B1) live at their final paths. If B was done before H, the imports in `LocalCaster.ts` for `CastRunner` need updating now. — S, junior-dev

### I. Final tidy

#### Section briefing

**What this section produces**
- Delete dead code: `RecordOptions` type in `src/castLog/store.ts` (no longer used), `#getTargetPath`'s `opts` param branch, the `recordCasted` / `recordError` second `opts` parameter. The `getRemoteLogPathAbs` getter on `CastLogStorePorts` stays — `readAll()` still uses it for the panel.
- Re-export tidy: if `RecordCastedInput` / `RecordErrorInput` were re-exported from `store.ts` for back-compat in A2, drop the re-exports now and update any straggling imports.
- Spec checkpoint: confirm no source file outside `src/cast/` and `src/forge/` references `Caster`, `CastInput`, `LocalCaster`, `RemoteCaster`, `createCaster` — these are internal to the casting layer.

**Design context the executor needs upfront**
From Migration order > 7: "Final tidy: delete the now-unused `CastDispatcherDeps.castRunner`, `CastDispatcherDeps.spawner`, `CastDispatcherDeps.remoteTransport` properties; same for `ForgeImprinter`." Those deletions already happened in D1 / E1; this section catches the leftovers in `castLog/store.ts`.

**Cross-section couplings**
- I depends on D, E, G all green (those are the only callers of `recordCasted({...}, { remote: true })`).

**Section-level Red criterion**
- `grep -rn "remote:" src/castLog/` returns nothing.
- `grep -rn "RecordOptions" src/` returns nothing.
- `grep -rn "{ remote: true }" src/ tests/` returns nothing (tests in section D / E may still have the old pattern in skipped/comment lines — clean those up).
- `npm test` and `npm run test:integration` both green.

**junior-dev**
- [ ] I1: In `src/castLog/store.ts`: delete `RecordOptions`; remove `opts?: RecordOptions` from `recordCasted` / `recordError` signatures and the `#getTargetPath(opts?)` branching — `#getTargetPath` becomes unconditional `return this.#ports.getLogPathAbs()`. — S, junior-dev
- [ ] I2: Update `tests/castLog/store.test.ts` — drop any test case that exercised `{ remote: true }`. The remote-routing concern is now covered structurally by section G's two-instance wiring; the store no longer cares. — S, junior-dev
- [ ] I3: Final grep sweep: `grep -rn "{ remote: true }" src/ tests/` returns nothing. `grep -rn "RecordOptions" src/ tests/` returns nothing. — S, junior-dev
- [ ] I4: `npm test`, `npm run test:integration`, `npm run lint`, `npm run build` — all pass. — S, junior-dev

---

## Effort summary

- **Total todos:** 41
  - A: 3 (3S)
  - B: 2 (2M)
  - C: 4 (3M, 1S)
  - D: 6 (5M, 1S)
  - E: 6 (5M, 1S)
  - F: 6 (6S)
  - G: 4 (3M, 1S)
  - H: 5 (5S)
  - I: 4 (4S)

- **By size:** S × 24, M × 17, L × 0
- **By tier:** junior-dev × 19, senior-dev × 22, lead-dev × 0, ui-integration-tester × 0

**Why no `ui-integration-tester` group:** This is a structural refactor — no new component seams are introduced; the existing UI integration tests under `tests/integration/` (`spell-cast`, `forge-cast`, `remote-cast`, `remote-forge`) are *updated* (assertions stay, dep-shape changes in setup) by the same dev tier doing the corresponding logic change. There is no "new UI behaviour to drive" — the tester role exists to write the red test for new component-seam behaviour, which this iteration has none of. Dispatching a tester for "rename a callback" is ceremony.

**Senior-dev concentration:** D, E, B, C contain the load-bearing judgment (callback adaptation, `portalCastId`-second-write contract, dep-shape migration with test updates). F, G3, H, I are mechanical and stay junior. G1/G2 are senior because they're the integration point.

**Risk hotspots** (call out for code review at section boundaries):
- After D5 / E5 — the `portalCastId` second-write contract is the bug-disappears-after-refactor moment from Problems to solve §7.
- After G — a manual smoke test in Obsidian is worth one cycle: open popup, cast a spell, check `cast-log-local.jsonl`. Flip to remote, cast, check `cast-log-remote.jsonl` for two `casted` lines (one with `portalCastId`).
