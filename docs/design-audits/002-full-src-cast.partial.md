---
shard: src-cast
verdict: REWORK
violation_count: 17
---

# Design Audit Partial: src/cast

## Threshold Violations

| Unit | Location | Size | Threshold | Severity |
|------|----------|------|-----------|----------|
| Method `RemoteCastTransport.#execute` | src/cast/portal/RemoteCastTransport.ts:85 | 74 lines body | >40 FAIL | FAIL |
| Method `CastDispatcher.dispatch` | src/cast/CastDispatcher.ts:63 | 54 lines body | >40 FAIL | FAIL |
| Method `CastDispatcher.#buildUserPrompt` | src/cast/CastDispatcher.ts:118 | 5 parameters | >3 FAIL | FAIL |
| Method `LocalCaster.cast` | src/cast/local/LocalCaster.ts:23 | 28 lines body | >20 WARN | WARN |
| Method `mapPortalError` | src/cast/portal/mapPortalError.ts:32 | ~30 lines body | >20 WARN | WARN |

## Violations by Smell

### Long Method (Fowler)
- src/cast/portal/RemoteCastTransport.ts:85 — `#execute` is 74 LOC, well past the 40-line FAIL bar. Combines URL/header/body construction, timeout-race wiring, response shape detection, status branching, and error mapping. Refactoring move: Extract Method per responsibility — `#buildRequest(input)`, `#raceWithTimeout(promise)`, `#interpretResponse(response, callbacks)`, `#handleHttpFailure(response, callbacks)`.
- src/cast/CastDispatcher.ts:63 — `dispatch` is 54 LOC. Refactoring move: Extract Method — `#validate(input)`, `#logIntent(...)`, `#announce(spell, isRemote)`, `#wireCallbacks(...)`.

### SRP Violation (Uncle Bob)
- src/cast/CastDispatcher.ts:63 — `dispatch` validates prerequisites, generates an id, builds a user prompt, writes the initial log entry, emits a notice, closes the dialog, invokes the caster, AND defines `onAccepted`/`onFailure` callbacks that themselves write a second log entry and emit notices. Three reasons to change (input rules, log schema, UX wording). Refactoring move: Extract Class — split log emission into a `CastLogger` collaborator; extract notify/close into a `CastUiPresenter`.
- src/cast/portal/RemoteCastTransport.ts:85 — `#execute` constructs the request, races a timeout, AND interprets the response. Three reasons to change. Refactoring move: Extract Method as above; consider an `#interpretResponse` returning a discriminated union mapped via `mapPortalError`.
- src/cast/local/LocalCaster.ts:23 — `cast` performs input-shape branching AND adapter assembly for two distinct shapes, then forwards to runner. Refactoring move: Extract Method `#toRunInput(input)` with a base object and conditional spread; the cast method should then read `this.#runner.run(this.#toRunInput(input), this.#adaptCallbacks(callbacks))`.

### Long Parameter List (Fowler)
- src/cast/CastDispatcher.ts:118 — `#buildUserPrompt(executeOnNote, vaultMountPath, activeFilePath, contextNotePaths, followUp)` takes 5 positional parameters. Refactoring move: Introduce Parameter Object — pass the original `CastDispatchInput` (Preserve Whole Object).

### Inline Logic in `if` Conditions
- src/cast/portal/RemoteCastTransport.ts:138 — `if (typeof json === 'object' && json !== null && typeof (json as Record<string, unknown>).castId === 'string')` is a multi-clause inline predicate. Refactoring move: Extract Method to a named guard `#extractPortalCastId(json): string | null` returning the id or null.

### Nested Function Declarations Inside Methods
- src/cast/CastDispatcher.ts:102 — `onAccepted: ({ jobId }) => { if (jobId !== undefined) { logWriter.recordCasted(...).catch(console.error); } if (!isRemote) this.#notify('Spell cast'); }` is a multi-statement arrow declared inside `dispatch` carrying real logic (log write + conditional notify). Refactoring move: Extract Method `#onCastAccepted(castId, spell, model, effort, contextNotePaths, input, isRemote)` on the class.
- src/cast/CastDispatcher.ts:110 — `onFailure: (msg) => { logWriter.recordError(...).catch(console.error); this.#notify(...); }` — same pattern. Extract Method `#onCastFailure(castId, isRemote)`.

### Duplicated Code (Fowler)
- src/cast/local/LocalCaster.ts:24-45 — the two ternary arms repeat `modelId`, `effort`, `vaultMountPath`, `binaryPath`, `cliCommand`, `castId`, `claudeHooksDir` (7 fields). Refactoring move: build a base object once, then spread + add the branch-specific fields.
- src/cast/portal/RemoteCastTransport.ts:141,143 — `(json as Record<string, unknown>).castId as string` cast appears twice in adjacent lines. Refactoring move: bind once to a local `const castId = ...`, then use it.

### Primitive Obsession (Fowler)
- src/cast/* (cross-shard) — `castId: string`, `spellPath: string`, `modelId: string`, `vaultMountPath: string`, `binaryPath: string`, `cliCommand: string`, `portalHost: string`, `portalPort: string`, `portalPath: string`, `portalAuthUser: string`, `portalAuthPassword: string` flow as bare strings across at least 7 files (CastDispatcher, LocalCaster, CastRunner, RemoteCaster, RemoteCastTransport, buildCastArgs, buildPortalRequestBody). Nothing prevents mixing a `spellPath` with a `vaultMountPath` at a call site. Refactoring move: Replace Primitive with Value Object — introduce `CastId`, `SpellPath`, `ModelId`, `VaultPath`, `BinaryPath`, `PortalEndpoint`, `BasicCredentials`.

### Data Clumps (Fowler)
- src/cast/portal/RemoteCaster.ts:36-40, src/cast/portal/RemoteCastTransport.ts:44-48 — `portalHost`, `portalPort`, `portalPath`, `portalAuthUser`, `portalAuthPassword` always travel together. Refactoring move: Extract Class `PortalEndpoint` (host/port/path) and `PortalCredentials` (user/password), or one `PortalConfig` value object.
- src/cast/local/CastRunner.ts:9-17, src/cast/local/LocalCaster.ts:14 — `binaryPath`, `cliCommand`, `vaultMountPath`, `claudeHooksDir` always travel together. Refactoring move: Extract Class `LocalCastEnvironment`.

### Concept Drift (Naming)
- Cast identifier on the remote side is named three times: `castId` (RemoteCastInput), `portalCastId` (RemoteCastCallbacks at src/cast/portal/RemoteCastTransport.ts:55, src/cast/portal/RemoteCaster.ts:44), `jobId` (CastDispatcher onAccepted at src/cast/CastDispatcher.ts:102). One concept, three names. Refactoring move: pick `portalCastId` and propagate.
- Agent hooks directory has four names across the shard: `agentHooksDirAbs` (createCaster.ts:10), `claudeHooksDirAbs` (LocalCaster.ts:12,14,17), `claudeHooksDir` (CastRunner.ts:16, LocalCaster.ts:34, LocalCaster.ts:44), `CLAUDE_HOOKS_DIR` (CastRunner.ts:86). One directory, four names. Refactoring move: pick one canonical name (the `createCaster` boundary already calls it `agentHooks*` — propagate that inward, or rename outward).

### Leaky Abstraction
- src/cast/portal/RemoteCastTransport.ts:13-30 — `RequestUrlParam` and `RequestUrlResponse` are declared as "shims that mirror Obsidian's real types". `RequestUrlResponse.json` is typed `unknown` purely for test convenience, which forces every caller to runtime-narrow (see lines 137-143). The seam leaks the obsidian-API shape into the transport. Refactoring move: map at the boundary — return a domain `PortalResponse = { kind: 'accepted'; castId } | { kind: 'http'; status; body } | ...` from a thin obsidian-only adapter.

### Speculative Generality / Dead Default
- src/cast/portal/RemoteCastTransport.ts:73-75 — `this.#requestUrlFn = deps?.requestUrlFn ?? (() => Promise.reject(new Error('requestUrl not injected')))` provides a rejecting default for a parameter every production call site supplies. The default exists only to make the constructor zero-arg-callable in tests that should be injecting a fake anyway. Refactoring move: make `requestUrlFn` a required constructor dep; tests inject explicitly.

### Command-Query Mix (borderline) / Side Effect in Promise Executor
- src/cast/portal/RemoteCastTransport.ts:99-101 — the `timeoutPromise` executor mutates the enclosing-scope `timeoutId` so it can be cleared later. The Promise both schedules a timer and leaks its handle as a side effect. Refactoring move: Extract Method `#withTimeout<T>(promise, ms): Promise<T | { kind: 'timeout' }>` that owns the timer lifecycle internally and calls `clearTimeout` on settle.

### Feature Envy
- src/cast/portal/RemoteCastTransport.ts:122-132 — `#execute` repeatedly reaches into `mapPortalError({ kind: 'timeout' }).notice`, `mapPortalError({ kind: 'network', ...}).notice`, `mapPortalError({ kind: 'http', ...}).notice`. The caller only ever wants the notice; the `PortalErrorOutput.logEvent` field returned from `mapPortalError` is never read here. Refactoring move: either consume `logEvent` (the field exists for a reason) or split `mapPortalError` into `errorNotice` and `errorLogEvent` so this caller stops grabbing one field off a richer return.

### Magic Number
- src/cast/portal/mapPortalError.ts:58 — `bodyPart.length > 200 ... bodyPart.slice(0, 200)` — the truncation limit `200` is a magic number with domain meaning ("max notice body length"). Refactoring move: Extract Constant `MAX_NOTICE_BODY_LENGTH = 200`.

## Verdict
REWORK
