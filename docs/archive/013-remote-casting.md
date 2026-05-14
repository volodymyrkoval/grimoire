# 013 — Remote casting

> Wire the cast dispatcher to actually call the portal when `executionMode === 'remote'`. Plan 012 landed the persisted settings surface (toggle + five Advanced fields). This iteration closes the gap to dispatch behaviour: a new HTTP transport sits beside the existing local-spawn primitive with the same callback contract; the dispatcher branches on the toggle; forge inherits remote routing through the same seam; the cast log gains an optional `portalCastId` field; the reserved `cast-log-remote.jsonl` path finally gets a producer.

## Complexity

🔴 **Complex.** Five distinct error shapes with bespoke notices and log behaviour. A new HTTP transport that has to honour the same `(input, callbacks)` contract as `CastRunner`. A schema-additive change to the cast log (`portalCastId` on the casted event; remote events route to `cast-log-remote.jsonl`). A forge invariant (forge must still work, remote-routed when the toggle is on). Settings UI gains a one-line description addendum on the host field. The host field's scheme prefix parsing is subtle (recognise `http://` or `https://`; default to `https`; pass everything else through as the host). The 30-s timeout is layered over `requestUrl` (which has no native abort), so the cleanup story matters. Multi-perspective analysis warranted.

## Goal & scope

### In scope

- A new `RemoteCastTransport` module under `src/cast/` whose `run(input, callbacks)` shape mirrors `CastRunner.run` so the dispatcher can substitute it transparently when `executionMode === 'remote'`.
- A small set of pure helpers under `src/cast/portal/`:
  - `parsePortalScheme(host)` — recognises optional `http://` / `https://` prefix; returns `{ scheme, hostWithoutScheme }`.
  - `buildPortalUrl({ host, port, path })` — assembles `<scheme>://<hostWithoutScheme>[:<port>][<normalised-path>]/cast`. Strips trailing slashes on `path`; tolerates empty `path`.
  - `buildBasicAuthHeader(user, password)` — `Basic <base64(user:pass)>`. Always produces a header, even when both are empty.
  - `buildPortalRequestBody({ castId, spell, model, effort, userPrompt })` — JSON-stringifies the four-field object the portal expects (`castId`, `spellPath`, `userPrompt`, `model`, `effort`).
  - `mapPortalError(rawError | response)` → discriminated union of the five error shapes.
- `CastDispatcher` reads `settings.executionMode` once per dispatch and branches:
  - Pre-dispatch guard: when `executionMode === 'remote'` and `portalHost` is empty (after `.trim()`), notify *"Configure portal host in settings before casting remotely."*, **do not** call `recordCasted`, **do not** close the popup. User can fix and retry.
  - Otherwise notify *"Casting '<spell name>' on portal…"* on the remote branch (vs. *"Casting '<spell name>'…"* on local), close the popup, and invoke `remoteTransport.run` instead of `castRunner.run`. Local branch is byte-for-byte unchanged.
- `ForgeImprinter` reads `settings.executionMode` once and routes through the same `remoteTransport` when remote. Notice text is *"Forging '<sanitised>' on portal…"* on the remote branch (vs *"Forging '<sanitised>'…"* on local).
- `CastLogStore` gains the ability to write events to `cast-log-remote.jsonl` when invoked for a remote cast. The mechanism: add a `recordCasted({ ..., portalCastId? }, { remote: true })` second-argument flag (or a parallel `recordCastedRemote` method — see Key design decisions below). `recordError(..., { remote: true })` likewise writes to the remote file. The `portalCastId` field is added as an optional field on `CastedEvent`, `CastRecord`, and the `recordCasted` input shape.
- `tests/__mocks__/obsidian.ts` gains a `requestUrl` mock (default rejects unless overridden by test).
- `GrimoireSettingTab.#renderAdvancedSection`: the *Portal host* row gains a one-line description via `.setDesc('Hostname or full URL. Defaults to HTTPS unless http:// is prefixed.')`. No other settings changes.
- Pre-dispatch guard, URL construction (`http://`, `https://`, default-https, trailing slash on `path`, empty `port`, empty `path`), Basic Auth header assembly (including empty credentials), 202 response handling (extract `portalCastId`), each of the five error shapes (empty host, connection failure, 401, other non-2xx with truncated body, timeout) are each pinned by a failing unit or integration test before implementation.
- Forge-still-works invariant: an integration test driving `imprinter.imprint` with `executionMode === 'local'` keeps producing the existing `CastRunner.run` call; with `'remote'` produces a `requestUrl` call. No new forge UI.
- The reserved `cast-log-remote.jsonl` finally gets a producer: remote casts (live and forge) write `casted` + `error` events into it. Local casts continue to write to `cast-log-local.jsonl`. The reader already merges both files.

### Out of scope (No-gos from pitch)

- No status close-loop for remote casts. Entries stay at `casted` (or transition to `error` on the five failure shapes). `in-progress` and `done` for remote casts are a future pitch's problem; `portalCastId` is captured now so that future pitch has a correlation key.
- No retry logic. A failed remote cast surfaces a notice and the user re-casts manually.
- No token auth, no JWT, no request signing — Basic Auth only.
- No certificate pinning, no custom CA bundle.
- No keep-alive pool, no connection caching, no warmup.
- No automatic fallback to local when the network is down — the user sees the error and decides.
- No separate remote-forge toggle — forge follows the global toggle.
- No polling or SSE — `requestUrl` returns 202, transport resolves, that's it.
- No connectivity preflight ("Test connection" button).
- No new settings — pitch is explicit. The host description addendum is one `.setDesc` call.
- No reshape of `CastRunner` or `spawnCast` — local path is byte-for-byte unchanged.
- No reshape of `requestUrl` into a fetch-like abstraction. The transport calls `requestUrl` directly and accepts an injected stub for tests.
- No change to the on-disk shape of existing log lines beyond the additive optional `portalCastId` field on `casted` events.

### Acceptance criteria (from pitch "done when")

1. Flipping execution mode to *Remote* and casting sends a POST to `<scheme>://<host>[:<port>][<path>]/cast` with the documented JSON body and `Authorization: Basic …` header.
2. The popup closes and a *"Casting '<spell>' on portal…"* notice fires the moment the request is dispatched (parallel to the local *"Casting…"* notice).
3. A 202 response with `{ "castId": "<server-side-id>", … }` causes a `casted` event to be written to `cast-log-remote.jsonl` with the new optional `portalCastId` field populated.
4. Each of the five error shapes surfaces its specific notice text and (where applicable) writes an `error` event to `cast-log-remote.jsonl`. The empty-host pre-dispatch guard writes nothing and leaves the popup open.
5. Flipping back to *Local* restores the existing spawn path with no observable change in behaviour.
6. Forge dispatches remote when the toggle is on (uses `requestUrl`, writes to the remote log) and local when off (uses `CastRunner`, writes to the local log).
7. The host field accepts an optional `http://` or `https://` prefix without rejecting bare hostnames. The description row reads *"Hostname or full URL. Defaults to HTTPS unless http:// is prefixed."*

## Proposed solution

A new transport module sits alongside `src/cast/CastRunner.ts`. Its `run(input, callbacks)` shape mirrors `CastRunner.run` exactly — same `RemoteCastInput` (a structural superset omitting the local-only `binaryPath`/`cliCommand`), same `{ onSuccess, onFailure }` callbacks. The dispatcher reads `settings.executionMode` once at the top of `dispatch()` and threads either the local runner or the remote transport into the same downstream code path. Same callback shape on both branches means `recordError` wiring stays in `CastDispatcher` — only the *file* the error lands in differs.

Five small pure functions handle URL construction, scheme detection, Basic Auth, JSON body, and error mapping. Each is independently testable; the transport is a thin coordinator that composes them, calls `requestUrl`, races against a 30-s timeout, and resolves `{ kind, ... }` for the dispatcher to consume.

The cast log split (local vs remote files) is implemented by extending `CastLogStore` with an optional `remote` flag on its record methods. The flag selects which `getLogPathAbs`/`getRemoteLogPathAbs` resolver to call. No new public method names, just a second argument; consumers omit it for the existing local path.

```
src/cast/RemoteCastTransport.ts          — new: composes the five helpers, calls requestUrl, 30-s timeout race
src/cast/portal/parsePortalScheme.ts     — new: pure
src/cast/portal/buildPortalUrl.ts        — new: pure
src/cast/portal/buildBasicAuthHeader.ts  — new: pure
src/cast/portal/buildPortalRequestBody.ts— new: pure
src/cast/portal/mapPortalError.ts        — new: pure
src/cast/CastDispatcher.ts               — branch on settings.executionMode; pre-dispatch guard; pass remote callback
src/forge/ForgeImprinter.ts              — branch on settings.executionMode; route through remoteTransport
src/castLog/types.ts                     — add optional portalCastId to CastedEvent
src/castLog/CastRecord.ts                — add optional portalCastId
src/castLog/foldEvents.ts                — propagate portalCastId from casted event into record
src/castLog/store.ts                     — add optional { remote: true } flag on recordCasted/recordError
src/ui/settings/GrimoireSettingTab.ts    — add .setDesc on Portal host row
src/main.ts                              — wire RemoteCastTransport into both dispatcher and imprinter
tests/__mocks__/obsidian.ts              — add requestUrl mock
tests/integration/remote-cast.spec.ts    — new: end-to-end seam (popup → dispatcher → mocked requestUrl → log file)
tests/integration/remote-forge.spec.ts   — new: forge invariant on both branches
tests/cast/portal/*.test.ts              — unit tests for each pure helper
tests/cast/RemoteCastTransport.test.ts   — unit: transport composes helpers, handles all five error shapes
tests/CastDispatcher.test.ts             — extend: remote branch, pre-dispatch guard, notice text
tests/ForgeImprinter.test.ts             — extend: remote branch
tests/castLog/store.test.ts              — extend: { remote: true } writes to cast-log-remote.jsonl
tests/castLog/foldEvents.test.ts         — extend: portalCastId propagation
tests/castLog/types.test.ts              — extend: portalCastId is optional on CastedEvent
tests/persistence.test.ts                — no change expected — settings shape unchanged in this iteration
tests/integration/settings-panel.spec.ts — extend: host field has .setDesc with the documented text
docs/features/remote-casting-setup.md    — flagged for /spec sweep post-/done (host description addendum)
```

## Components

| Component | Location | Responsibility |
|---|---|---|
| `parsePortalScheme` | `src/cast/portal/parsePortalScheme.ts` | Pure. Input: raw `host` string. Output: `{ scheme: 'http' \| 'https', hostWithoutScheme: string }`. Recognises case-insensitive `http://` / `https://` prefix; default scheme is `'https'`. Leaves the rest of the string untouched (no trimming inside the host portion, no port stripping — port is a separate field). |
| `buildPortalUrl` | `src/cast/portal/buildPortalUrl.ts` | Pure. Composes `<scheme>://<hostWithoutScheme>[:<port>]<normalisedPath>/cast`. Strips trailing slashes on `path`. Empty `port` → no `:port` segment. Empty `path` → no path segment; result is `<scheme>://<host>[:<port>]/cast`. Always appends exactly one `/cast`. |
| `buildBasicAuthHeader` | `src/cast/portal/buildBasicAuthHeader.ts` | Pure. Returns `'Basic ' + base64(user + ':' + password)`. Uses `btoa` if available, otherwise `Buffer.from(...).toString('base64')` to keep Node tests green. Empty user and empty password still produce a header (`'Basic Og=='`). |
| `buildPortalRequestBody` | `src/cast/portal/buildPortalRequestBody.ts` | Pure. Returns a JSON string of `{ castId, spellPath, userPrompt, model, effort }`. `effort: null` is serialised as the JSON `null` value (omission semantics are the portal's concern — it accepts null per `Grimoire - Portal Service`'s Contract section). |
| `mapPortalError` | `src/cast/portal/mapPortalError.ts` | Pure. Input: a discriminator-bearing object — `{ kind: 'timeout' }`, `{ kind: 'network', message }`, `{ kind: 'http', status, body }`. Output: `{ noticeText: string, logEvent: 'error' \| 'none' }`. Maps to the four log-producing shapes (the empty-host case is handled by the dispatcher before the transport is ever called). Truncates HTTP body to 200 chars for the non-2xx-not-401 case. |
| `RemoteCastTransport` | `src/cast/RemoteCastTransport.ts` | The seam-equivalent of `CastRunner`. `run(input, callbacks)`: builds URL/header/body, calls `requestUrl({ url, method: 'POST', headers, body, throw: false })`, races against a 30-s `Promise` that resolves `{ kind: 'timeout' }`. Branches on `response.status`: 202 → extract `portalCastId` from `response.json`, call a *new* `onAccepted({ portalCastId })` callback; 401 → `onFailure` with the 401 notice; non-2xx → `onFailure` with the generic notice including truncated body; network exception → `onFailure` with the connection-failure notice. Injectable `requestUrlFn` for tests. |
| `CastDispatcher` (extended) | `src/cast/CastDispatcher.ts` | Reads `settings.executionMode` once at the top of `dispatch()`. Branches: remote-and-empty-host → pre-dispatch guard (notice + return without recordCasted/close); remote → notice with "on portal…" suffix, recordCasted with no `portalCastId` (it will be patched by `onAccepted`), close, `remoteTransport.run(...)`; local → existing path verbatim. Holds a new optional `remoteTransport?: RemoteCastTransport` dep. Error and accepted callbacks route to the **remote** log file via `recordError(..., { remote: true })` and a new *patch* path: on `onAccepted`, write a second `casted` event to the remote file with `portalCastId` populated. (See Key design decision #6 — choice of "patch via second casted event" vs. "buffer and write once".) |
| `ForgeImprinter` (extended) | `src/forge/ForgeImprinter.ts` | Same branch + same callback shape as `CastDispatcher`. Holds an optional `remoteTransport?: RemoteCastTransport` dep. Notice text gains the "on portal…" suffix on the remote branch. Forge spell path remains the `<forge>` sentinel; the meta-spell content is sent as the `userPrompt` field in the JSON body. |
| `CastLogStore` (extended) | `src/castLog/store.ts` | `recordCasted(input, opts?)` and `recordError(input, opts?)` accept an optional second argument `{ remote: true }`. When set, the event is appended to `getRemoteLogPathAbs()` instead of `getLogPathAbs()`. `recordCasted` accepts an optional `portalCastId` field on the input. |
| `CastedEvent` (extended) | `src/castLog/types.ts` | Adds optional `readonly portalCastId?: string` field. No other shape change. |
| `CastRecord` (extended) | `src/castLog/CastRecord.ts` | Adds optional `readonly portalCastId?: string` field. |
| `foldEvents` (extended) | `src/castLog/foldEvents.ts` | If a `casted` event carries `portalCastId`, propagate it onto the record. If two `casted` events share a `castId` (the "patch" pattern — see decision #6), the later one's `portalCastId` wins. |
| `obsidian` mock (extended) | `tests/__mocks__/obsidian.ts` | Adds `requestUrl: vi.fn(async () => { throw new Error('requestUrl not mocked'); })` plus the `RequestUrlParam` / `RequestUrlResponse` shape types. Tests stub per case. |
| `GrimoireSettingTab` (extended) | `src/ui/settings/GrimoireSettingTab.ts` | One `.setDesc` call inside `#renderAdvancedSection` on the Portal host row. No other change. |

## Interfaces

### `RemoteCastTransport`

```ts
export interface RemoteCastInput {
  // Mirrors CastRunInput minus binary/cliCommand; identical field names where shared.
  readonly castId: string;
  readonly spellPath: string;     // '<forge>' for forge casts
  readonly userPrompt: string;    // the meta-spell body for forges, the constructed prompt for live casts
  readonly modelId: string;
  readonly effort: Effort | null;
  readonly portalHost: string;
  readonly portalPort: string;
  readonly portalPath: string;
  readonly portalAuthUser: string;
  readonly portalAuthPassword: string;
}

export interface RemoteCastCallbacks {
  // 202 with a parsed body — the dispatcher patches the casted log event with portalCastId.
  onAccepted: (info: { portalCastId: string }) => void;
  // All four logged failure shapes — notice text is final, dispatcher just forwards it.
  onFailure: (msg: string) => void;
}

export type RequestUrlFn = (req: import('obsidian').RequestUrlParam) =>
  Promise<import('obsidian').RequestUrlResponse>;

export class RemoteCastTransport {
  constructor(deps?: { requestUrlFn?: RequestUrlFn; now?: () => number });
  run(input: RemoteCastInput, callbacks: RemoteCastCallbacks): void;  // fire-and-forget, same as CastRunner
}
```

### `mapPortalError` discriminator

```ts
export type PortalErrorInput =
  | { kind: 'timeout' }
  | { kind: 'network'; message: string; host: string }
  | { kind: 'http'; status: number; body: string };  // body already truncated upstream is fine

export interface PortalErrorOutput {
  notice: string;
  logEvent: 'error' | 'none';  // 'none' is reserved; today all four reachable shapes return 'error'
}

export function mapPortalError(input: PortalErrorInput): PortalErrorOutput;
```

The five-message catalog (verbatim, exact strings the tests pin):

| Shape | Notice text | Log event |
|---|---|---|
| Pre-dispatch (empty host) | `Configure portal host in settings before casting remotely.` | none — dispatcher returns before recordCasted |
| Connection failure (network exception) | `Couldn't reach portal at <host>: <reason>.` | error |
| 401 Unauthorized | `Portal rejected credentials. Check your portal username and password in settings.` | error |
| Other non-2xx | `Portal returned <status>: <short body or status text>.` (body truncated to 200 chars; falls back to status text when body is empty) | error |
| Timeout (30 s) | `Portal request timed out.` | error |

The pre-dispatch case is handled in `CastDispatcher` *before* the transport is invoked, so it never reaches `mapPortalError`. The other four are dispatched by the transport after `requestUrl` resolves or the timeout race wins.

### `CastDispatcherDeps` (extended)

```ts
export interface CastDispatcherDeps {
  notify: (msg: string) => void;
  close: () => void;
  castRunner?: CastRunner;
  spawner?: SpawnFn;
  remoteTransport?: RemoteCastTransport;  // NEW — required at runtime when executionMode can be 'remote'
  castLogStore: CastLogStore;
  generateId?: () => string;
}
```

### `ForgeImprinterDeps` (extended)

```ts
export interface ForgeImprinterDeps {
  notify: (msg: string) => void;
  castRunner: CastRunner;
  remoteTransport?: RemoteCastTransport;  // NEW — same shape as dispatcher
  castLogStore: CastLogStore;
  generateId?: () => string;
}
```

### `CastLogStore` record signatures (extended)

```ts
export interface RecordOptions {
  readonly remote?: boolean;  // default false → writes to getLogPathAbs(); true → writes to getRemoteLogPathAbs()
}

export type RecordCastedInput = Omit<CastedEvent, 'stage' | 'ts'>;  // unchanged shape; portalCastId is optional on CastedEvent
export type RecordErrorInput  = Omit<ErrorEvent,  'stage' | 'ts'>;

class CastLogStore {
  recordCasted(input: RecordCastedInput, opts?: RecordOptions): Promise<void>;
  recordError(input: RecordErrorInput,   opts?: RecordOptions): Promise<void>;
}
```

If `opts.remote === true` but `getRemoteLogPathAbs` is undefined on the store, the call rejects with `Error('CastLogStore: remote write requested but getRemoteLogPathAbs is not configured')`. Defensive — production wiring always provides both resolvers per `main.ts`.

### `CastedEvent` and `CastRecord` (extended)

```ts
// types.ts
export interface CastedEvent extends BaseEvent {
  readonly stage: 'casted';
  readonly spellPath: string;
  readonly model: string;
  readonly effort: Effort | null;
  readonly contextNotes: readonly string[];
  readonly followUp?: string;
  readonly executeOnNote?: boolean;
  readonly portalCastId?: string;  // NEW — only present on remote casts after the portal 202 lands
}

// CastRecord.ts
export interface CastRecord {
  // ... existing fields unchanged ...
  readonly portalCastId?: string;  // NEW — propagated from the casted event by foldEvents
}
```

## Data flow

### Live cast — local branch (unchanged)

```
user clicks row → CommandPopup.castAction
  → CastDispatcher.dispatch(input)
    → settings.executionMode === 'local'
    → recordCasted (local log)
    → notify "Casting '<spell>'…"
    → close()
    → castRunner.run(input, { onSuccess, onFailure })
      → spawnCast → child process → exit code
        → onSuccess → notify "Spell cast"
        → onFailure → recordError (local log) + notify "Cast failed: <msg>"
```

### Live cast — remote branch (new)

```
user clicks row → CommandPopup.castAction
  → CastDispatcher.dispatch(input)
    → settings.executionMode === 'remote'
    → if portalHost.trim() === '':
         notify "Configure portal host in settings before casting remotely."
         return without recordCasted, without close()      ← popup stays open
    → recordCasted (remote log, portalCastId omitted for now)
    → notify "Casting '<spell>' on portal…"
    → close()
    → remoteTransport.run(input, { onAccepted, onFailure })
      → buildPortalUrl + buildBasicAuthHeader + buildPortalRequestBody
      → requestUrl(POST, throw: false)  RACE  setTimeout(30 000) → { kind: 'timeout' }
        → 202 → response.json.castId → onAccepted({ portalCastId })
              → dispatcher writes a *patch* casted event to remote log (same castId, with portalCastId)
        → 401 → onFailure(<401 notice>)
              → dispatcher writes recordError (remote log) + notify
        → other non-2xx → onFailure(<generic notice with truncated body>)
              → dispatcher writes recordError (remote log) + notify
        → network exception → onFailure(<connection notice>)
              → dispatcher writes recordError (remote log) + notify
        → timeout → onFailure(<timeout notice>)
              → dispatcher writes recordError (remote log) + notify
```

### Forge — same shape as live cast

Forge follows the identical branch logic but at the `ForgeImprinter` site. Local: `castRunner.run({ metaSpell, … })`. Remote: `remoteTransport.run({ spellPath: '<forge>', userPrompt: metaSpell, … })`. Empty-host guard, notice text variants, log routing — all identical to the live-cast remote branch.

## Error handling

Every error has a single, named home. The catalog in **Interfaces > five-message catalog** is exhaustive — no other notice text is produced by the remote path.

- **Pre-dispatch guard** (empty `portalHost.trim()`) — dispatcher only; transport never called. No log entry. Popup stays open. Used as the explicit "user fix" path so the next attempt with a populated field just works.
- **Network exception** — `requestUrl` rejects (DNS, refused, unreachable, malformed URL). Caught by the transport, mapped to `{ kind: 'network', message, host }`, notice composed by `mapPortalError`. Logged as `error` (remote file).
- **401 Unauthorized** — `requestUrl` resolves with `status === 401`. Distinct from other non-2xx because the message and remediation are different ("check credentials in settings" vs "portal returned X"). Logged as `error`.
- **Other non-2xx** — any status not in `[200..299] ∪ {401}`. Body read as text, truncated to 200 characters before composition. When body is empty, use `response.headers['status'] || String(status)` as the inlined value. Logged as `error`.
- **Timeout** — `Promise.race` against a 30 000 ms timer; the timer arm resolves `{ kind: 'timeout' }`. The underlying `requestUrl` call is not aborted (Obsidian's `requestUrl` has no abort surface) — the request will continue in the background and its result is discarded. This is acceptable per pitch (no auto-retry, no double-dispatch protection is required because the portal is idempotent for fire-and-forget dispatch). Logged as `error`.

**Concurrent remote casts**: each call to `RemoteCastTransport.run` is independent — fresh `requestUrl`, fresh timer, fresh callbacks. No shared mutable state in the transport. Each cast races its own 30-s timer.

**Log-write failures**: `recordCasted`/`recordError` rejections are swallowed by `.catch(console.error)` at the call site (matches existing dispatcher behaviour). A failed write does not block the notice or the popup close. This is the same posture as the local path; no new failure mode.

**The "patch" casted event**: when 202 arrives, the dispatcher writes a *second* `casted` event with the same `castId` and the `portalCastId` field populated. `foldEvents` already groups events by `castId`; we add the rule "later `casted` events overwrite earlier ones field-by-field for optional fields". The two-write pattern keeps `RemoteCastTransport` decoupled from the store (transport stays pure HTTP + composition); the alternative (buffer the casted event in the dispatcher and write once after 202) gives the same on-disk result but means the cast is invisible in the log between dispatch and 202, which can be many seconds. Decision: two-write pattern. See Key design decisions #6.

## Key design decisions

1. **`RemoteCastTransport` is a class with the same `run(input, callbacks)` shape as `CastRunner`, not a function and not a subclass.** The signature parity is what lets the dispatcher swap them. Subclassing would require a base abstraction (`ICastTransport`) and force `binaryPath`/`cliCommand` into the shared input — but those fields are nonsensical for HTTP. Two concrete classes with structurally-compatible `run` methods is the simpler shape. (Devil's-advocate check: a future third transport mode — `'queued'` — slots in as a third concrete class with the same `run` shape; no interface refactor.)

2. **Branch lives inside `CastDispatcher` and `ForgeImprinter`, not in `main.ts`.** Routing `if (executionMode === 'remote') remoteTransport.run(...) else castRunner.run(...)` from `main.ts` would push that decision past two layers of construction and require the dispatcher to expose two callback paths. Keeping the branch inside the dispatcher means the existing single seam (`dispatch(input)`) stays single, and the test surface is one class with two branches instead of two configurations of the same class.

3. **Scheme parsing is a separate pure function (`parsePortalScheme`), not inlined into `buildPortalUrl`.** Scheme parsing has its own edge cases (case-insensitive prefix, scheme-less host, accidental `://` in a userinfo-like field) and is the kind of code that earns its own unit test file. `buildPortalUrl` then just concatenates the pieces.

4. **`requestUrl` is injected, not imported, into `RemoteCastTransport`.** Mirrors the `SpawnFn` injection on `CastSpawner`. Test path stubs a `requestUrlFn`; production path uses Obsidian's. Keeps the transport node-test-friendly without forcing a Platform check.

5. **30-s timeout is a `Promise.race` against `requestUrl`, not an abort.** `requestUrl` has no abort surface. The race is the simplest correct mechanism; the request continues in the background and its eventual response is discarded. Pitch is explicit that retry is out, so the background completion is harmless (the portal will dispatch once and that's fine; no client-side deduplication needed). The 30-s constant lives inside `RemoteCastTransport` as a module-level `const` — not a setting per pitch.

6. **Two-write `casted` pattern for `portalCastId` capture.** The simpler alternative is "buffer the cast event in the dispatcher, write it only after 202 succeeds, write `error` directly on failure". But that leaves a gap where the cast is in-flight but invisible in the local log — bad UX if the user opens the panel between dispatch and 202. The two-write pattern instead writes the bare `casted` event immediately (so the log shows "casted" instantly) and patches it with `portalCastId` after 202. `foldEvents` is taught the "later `casted` wins on optional fields" rule. Cost: one extra JSONL line per remote cast. Benefit: log is immediately responsive on dispatch, which matches local behaviour.

7. **`{ remote: true }` is a record-method option, not a parallel `recordCastedRemote` method.** Two methods would duplicate the timestamp + JSON-stringify + append code with no shape difference. The optional flag is one branch in one place. Mock parity: the existing `recordCasted` / `recordError` tests are extended; no new method names to learn.

8. **`portalCastId` is optional on `CastedEvent` and `CastRecord`, not split into a remote subtype.** A union (`CastedEvent | RemoteCastedEvent`) would propagate through every consumer (`foldEvents`, `CastLogPanel`, etc.) for one optional field. Additive optional matches the existing extension posture documented in `Grimoire - Cast Lifecycle` ("schema is designed for extension").

9. **The five error messages are string literals in `mapPortalError`, not externalised constants.** They're tested verbatim — moving them to a constants file adds indirection without test or i18n benefit (the plugin has no i18n today). If a future iteration adds locale support, the constants file is the natural home; not warranted now (YAGNI).

10. **The host description addendum lands in `GrimoireSettingTab` only.** The live-spec at `docs/features/remote-casting-setup.md` will be patched by the `/spec` post-`/done` sweep — that's the normal flow. We don't pre-patch live specs from inside an iteration.

11. **`empty effort: null` is serialised as JSON `null`, not omitted.** The portal contract (in `Grimoire - Portal Service`) explicitly accepts `null` and treats it as "don't pass `--effort`". Sending `null` is more explicit than property omission and matches the rest of the cast spec where `effort: null` is a valid in-memory state.

## Technical notes

- **Pattern pass (`design-patterns` Skill):**
  - **Strategy** considered for the dispatcher's transport choice — *accepted implicitly* via two concrete classes with the same `run` shape. No explicit `ICastTransport` interface; structural compatibility carries it. If a third transport lands the abstraction earns its name.
  - **Adapter** considered for `requestUrl` → fetch-like — *rejected*: `requestUrl` is already a perfectly adequate HTTP primitive; wrapping it would obscure the few places it differs from fetch (no abort, no streaming) which are the same places we're already designing around.
  - **Decorator** considered for the 30-s timeout — *rejected*: `Promise.race` inside `run()` is four lines; a `WithTimeoutTransport` decorator would be eight lines of structure for the same behaviour.
  - **Factory** considered for transport construction in `main.ts` — *rejected*: one `new RemoteCastTransport()` call at plugin load; nothing to factory.
  - **Observer / EventEmitter** considered for the dispatcher → log-store wiring — *rejected*: existing callback shape (`{ onSuccess, onFailure }`) is the seam; preserving it keeps the local path byte-identical.
  - **Template Method** considered on a shared `BaseTransport` parent of `CastRunner` and `RemoteCastTransport` — *rejected*: the only shared shape is `run(input, callbacks): void` and the input fields diverge enough that hoisting them produces a stringly-typed-union or a wide base input. Two flat classes is the smaller surface.

- **Rubric pass (`design-rubric` Skill):**
  - SRP: each pure helper does one thing; `RemoteCastTransport` composes them; `CastDispatcher` owns the branch; `CastLogStore` owns persistence. No god class.
  - OCP: adding a third execution mode requires a new transport class plus one new branch in dispatcher/imprinter — additive, no edits to existing transport.
  - DIP: dispatcher and imprinter depend on `RemoteCastTransport` directly today (no interface). Acceptable today; promote to interface when the third transport lands.
  - ISP: `RemoteCastCallbacks` is `{ onAccepted, onFailure }` — only two methods, both used by every caller. No fat interface.
  - Component sizes after change: `CastDispatcher` grows from ~85 LOC to ~120 LOC (with the remote branch and pre-dispatch guard). Still within "skim-readable" range. `RemoteCastTransport` lands at ~60 LOC. Each pure helper is < 20 LOC. No file approaches the long-method or god-class smell.
  - Dependency direction: `cast/portal/*` is pure and depends on nothing; `RemoteCastTransport` depends on `cast/portal/*` and on Obsidian's `requestUrl` type only; `CastDispatcher` depends on both runners; `main.ts` wires everything. Strict downward dependency, no cycles. `arch:check` (dependency-cruiser) should remain green.

- **Self-critique (mandatory questions answered):**
  - *What's the one responsibility of each new file?* Each pure helper has one (parse, build, compose, map). The transport composes-and-races. The dispatcher branches. The store persists. Nothing has two.
  - *What changes break if I rename a portal field?* The five pure helpers + the transport + two tests. The dispatcher reads field names by string off `settings`; that's the one rename hotspot. Acceptable — TypeScript catches it.
  - *Where would I put the third transport (`queued`)?* `src/cast/QueuedCastTransport.ts`, same `run` shape, one more branch in dispatcher/imprinter, one more constructor dep in `main.ts`. Clear seam.
  - *Where's the test boundary between unit and integration?* Pure helpers + transport composition are unit tests; the dispatcher → mocked-`requestUrl` → log-file path is integration. The forge invariant gets its own integration spec. Pre-dispatch guard is unit-level on the dispatcher.
  - *Can I delete this without breaking the local path?* Yes — removing the remote branch from dispatcher/imprinter and the new files leaves the local path byte-identical. The `portalCastId` field becomes a quiet optional that nothing populates. The `cast-log-remote.jsonl` resolver continues to be wired but unused (its current state).

- **Test commands the executor will rely on:**
  - `npm test` — unit tests via vitest (node env)
  - `npm run test:integration` — UI/integration tests via happy-dom
  - `npm run lint` — ESLint
  - `npm run build` — `tsc --noEmit` then esbuild
  - Pre-commit runs lint + unit per `.claude/lint-cmd` and `.claude/test-cmd`. Integration runs at `/done`.

- **ESLint rule reminder:** never disable `obsidianmd/*` rules. The host-description addendum uses `.setDesc(...)`, not `createEl('p', ...)` — already covered by `setName`/`setDesc` plumbing in `Setting`.

- **No `eslint-disable` in any new file.** The mock additions follow the existing `TextComponent` / `DropdownComponent` patterns.

### Deferred edge cases

User confirmed during planning conversation (and reflected here): the following edge cases are consciously deferred or accepted as-is, not silently ignored.

- **Background completion of a timed-out remote cast**: `requestUrl` cannot be aborted; the request continues, the portal may dispatch the cast, no client-side notice fires. Accepted per pitch (no retry, no deduplication). Future status close-loop pitch will surface late-arriving completion via `portalCastId` correlation.
- **Two devices casting remotely with the same `castId`**: impossible — `castId` is a fresh UUID per cast. Even with the toggle on across two devices, no shared state.
- **Whitespace-only `portalHost` (e.g. `'   '`)**: the pre-dispatch guard uses `.trim()`, so this hits the guard. Pitch is silent; trimming matches user expectation. Decision: trim for the guard only; pass the raw (untrimmed) string into `parsePortalScheme` for actual URL construction — but a non-empty trimmed value will pass the guard, so the URL builder will receive a non-empty string. (The corner case "user enters `'  '` and toggle is on" is the guard's job.)
- **`portalPort` containing non-digits (e.g. `'abc'`)**: not validated. The URL builder appends the string verbatim. `requestUrl` will fail with a network/parse error and surface as a connection failure. No client-side validation per pitch's passive-validation posture.
- **Spell path containing characters that break URL construction**: not an issue — `spellPath` is in the JSON *body*, never in the URL. Body is JSON-stringified, which handles escaping.
- **Portal returns 202 without a body, or with a malformed body**: `mapPortalError` is not invoked (202 is a success status). The dispatcher's `onAccepted` callback expects `portalCastId: string`. If the body is empty or malformed, `response.json` throws or is missing the field. Decision: catch the JSON parse failure inside the transport, treat it as a degenerate 202 — write the bare `casted` event (already done), log a `console.warn`, do not call `onAccepted`, do not patch with `portalCastId`. The cast is dispatched (the portal accepted); we just lack the correlation id.
- **Forge with empty `portalHost` and remote toggle on**: same pre-dispatch guard pattern as live casts — notice fires, dialog stays open. Identical UX.

## Perspective synthesis

### Minimalist

The smallest viable version is **one** new file: a `dispatchRemote(input, callbacks)` function inside `CastDispatcher`. Everything inlined — URL construction, header assembly, body JSON, requestUrl call, timeout, error mapping. Around 80 LOC. But the dispatcher already owns the cast-lifecycle orchestration and is the smell-vector for a god class; piling HTTP onto it crosses the line. Five pure helpers + one transport class is **smaller per file** than one inlined god-method, and each piece is independently testable. The minimalist tension resolves toward the split: the dispatcher's job is "branch and orchestrate", not "speak HTTP". Five helpers feels like a lot of files for ~150 LOC of logic, but each helper has a distinct test target (scheme parsing has 7 cases on its own).

### Extensibility

The biggest extensibility risk is the future status close-loop pitch. It will read `portalCastId` from the cast log and correlate against the portal's logs (or poll the portal, or receive an SSE event, or watch a vault-resident file). Whatever mechanism wins, it needs the `portalCastId` field to exist on the log and to be populated reliably for 202 cases. The two-write `casted` pattern (decision #6) addresses this: even if the patch-write fails (disk full, sync conflict), the first `casted` is on disk, and the future mechanism can pull the `portalCastId` from the portal's own logs by `castId` correlation. **Bigger 10× scale-up question**: what if Grimoire grows three execution modes? The two-concrete-class shape promotes cleanly to an interface (`ICastTransport`) without rewriting today's classes. **Biggest seam regret if we don't carve it**: not making `mapPortalError`'s output a discriminated union that includes a `logEvent` field. Returning just `noticeText` would force the dispatcher to know which error shapes log and which don't (today only one doesn't — the empty-host guard, which never reaches `mapPortalError`). The discriminated union with `logEvent: 'error' | 'none'` future-proofs against a sixth error shape that might not deserve a log entry.

### Devil's-advocate

**Riskiest assumption**: the portal returns a parseable JSON body on 202 with `castId` as a string field. Mitigation: the JSON-parse-failure path is documented (Deferred edge cases) and degrades gracefully — bare `casted` event already on disk, no `portalCastId`, console.warn for diagnostics.

**What could break in the live path**: the dispatcher and imprinter both grow a branch. If the branch leaks (e.g., `executionMode === 'remote'` accidentally reads as truthy when it's actually `undefined` from a malformed save), local casts could be routed remote and fail. Mitigation: strict equality `=== 'remote'` (not truthy), explicit `else` branch covers undefined/null/other.

**Hidden failure mode**: `recordCasted` and the patch-`recordCasted` both write to the remote file. If the file is locked or being read concurrently by the panel's reader, the second write could fail silently. Mitigation: `.catch(console.error)` already in place; the bare `casted` event is on disk so the cast is visible regardless.

**Concurrent dispatch with toggle flipped mid-cast**: user flips the toggle from remote to local while a remote cast is in flight. The in-flight cast's `requestUrl` is already scheduled with the remote URL; it completes (or fails) and writes to the remote log. The next cast is local. No cross-talk because each dispatch reads `executionMode` once at the top.

**`onAccepted` arrives after the popup is closed and the user has navigated away**: fine — the dispatcher's `onAccepted` closure captures `castId` and `castLogStore` (both stable). It does not touch UI. Notice fired at dispatch; no second notice on `onAccepted`.

**Timeout fires for a remote cast and the user re-casts**: each cast has its own `castId`. The portal will receive two requests (one timed out late-arrival background, one new). The portal dispatches both. **User-visible consequence**: the spell runs twice. Pitch is explicit (no retry, no deduplication) and explicit (the alternative — silent dedup — would hide a genuine portal issue). Accepted.

### User-advocate

**Notice text matters most here.** The five messages are precise and actionable in isolation, but in sequence (e.g. user mistypes the host, gets connection failure; fixes it, gets 401; fixes credentials, gets 202) they should feel coherent. The "on portal…" suffix on the dispatch notice is the visible mode-difference cue — without it, users wouldn't know remote actually took effect. **Rough edge**: the empty-host pre-dispatch guard keeps the popup open. Good for fixing the field, but the user has to navigate from popup → settings → fix → back to popup → re-cast. Acceptable for an error state; not worth a "jump to settings" deep-link in this iteration. **The description addendum on the host field** is small but high-value — without it the user has no idea they can paste a full URL. Worth the one-line change.

## UI integration tests

The UI surface in this iteration is:

1. One `.setDesc(...)` call on the existing Portal host row.
2. No new rows, no new widgets, no new DOM nodes besides the description text node.

The existing `tests/integration/settings-panel.spec.ts` covers the panel seam comprehensively. The description addendum is a single string property; verifying it via the existing seam test is sufficient. **Decision**: extend the existing integration spec with one assertion; do not spin up a dedicated `**ui-integration-tester**` group for this iteration's settings surface. The dispatcher → mocked-`requestUrl` → log-file path is an integration test (under `tests/integration/`) but it's a *logic* integration test, not a UI-component-seam test — it goes to `senior-dev` with the seam test pinning the contract.

Per the planner contract: this is a Medium/Complex plan with UI touch, but the UI delta is one description string. The `ui-test-rubric` skill's threshold (component-seam tests at trust boundaries between UI components) does not apply to a single `.setDesc()` addition. The settings-panel integration spec already pins the row's existence and write-through; adding one `.setDesc` assertion preserves that coverage.

## Todos

### A. Cast-log schema additive — `portalCastId`

#### Section briefing

1. **What this section produces:** Optional `portalCastId?: string` field on `CastedEvent` (in `src/castLog/types.ts`) and on `CastRecord` (in `src/castLog/CastRecord.ts`), plus folding logic in `src/castLog/foldEvents.ts` that propagates the field from `casted` events onto the record and applies "later `casted` event wins on optional fields" for the patch-write pattern. Two new unit-test cases in `tests/castLog/types.test.ts` and `tests/castLog/foldEvents.test.ts`.
2. **Design context the executor needs upfront:** Key design decision #6: "Two-write `casted` pattern for `portalCastId` capture." The transport writes one bare `casted` immediately and a second `casted` (same `castId`, with `portalCastId` populated) after 202. `foldEvents` must implement "later `casted` overwrites earlier `casted` on optional fields only" — required fields on the first `casted` stay authoritative. Key design decision #8: "`portalCastId` is optional on `CastedEvent` and `CastRecord`, not split into a remote subtype." Do not invent a discriminated union of `CastedEvent | RemoteCastedEvent`.
3. **Cross-section couplings:**
   - `A1` is consumed by `B1`, `C1`, `E1`, `G1` — `portalCastId` is referenced by name in the store extension, the transport's `onAccepted`, the dispatcher's patch-write, and integration tests.
   - `A2` (foldEvents) must be in place before `G1`'s integration test asserts on the post-202 folded record.
4. **Section-level Red criterion:** `npm test -- tests/castLog/types.test.ts tests/castLog/foldEvents.test.ts` passes with three new cases: (i) `CastedEvent` accepts `portalCastId: string` and accepts its omission; (ii) `foldEvents` with a single `casted` event carrying `portalCastId` produces a record with that field; (iii) `foldEvents` with two `casted` events (same `castId`, second has `portalCastId`) produces a record with the second's `portalCastId`. Type-check (`npm run build`) succeeds.

**junior-dev**

- [x] A1: Add optional `readonly portalCastId?: string` to `CastedEvent` in `src/castLog/types.ts` and to `CastRecord` in `src/castLog/CastRecord.ts`. — S, junior-dev
- [x] A2: Extend `foldEvents.ts` so that when a `casted` event is the first one seen, `portalCastId` (if present) is set on the record; when a later `casted` event with the same `castId` is seen, only its `portalCastId` field overwrites the existing record's value (other casted fields stay frozen from the first event). Add unit test cases (ii) and (iii) above. — M, junior-dev
- [x] A3: Append one case to `tests/castLog/types.test.ts` pinning that `portalCastId` is optional (compile-only: assign a `CastedEvent` literal both with and without it). — S, junior-dev

### B. `CastLogStore` remote-write flag

#### Section briefing

1. **What this section produces:** Extends `src/castLog/store.ts` so `recordCasted` and `recordError` accept an optional second argument `{ remote: true }`. When set, the event is appended to `getRemoteLogPathAbs()` instead of `getLogPathAbs()`. When `opts.remote === true` and `getRemoteLogPathAbs` is undefined, the call rejects with the documented error. Extends `tests/castLog/store.test.ts` with cases pinning each branch.
2. **Design context the executor needs upfront:** Key design decision #7: "`{ remote: true }` is a record-method option, not a parallel `recordCastedRemote` method." Do not add new method names; extend the two existing ones. The default behaviour (`opts` undefined or `opts.remote !== true`) must be byte-identical to today — the existing `tests/castLog/store.test.ts` cases must still pass without modification.
3. **Cross-section couplings:**
   - `B1` is consumed by `E2`, `E3`, `F2`, `F3` — the dispatcher and forge imprinter call `recordCasted(..., { remote: true })` and `recordError(..., { remote: true })` on the remote branch.
   - `A1` (the optional `portalCastId` field on `CastedEvent`) must be in place so the type system accepts `recordCasted({ ..., portalCastId })`.
4. **Section-level Red criterion:** `npm test -- tests/castLog/store.test.ts` passes with three new cases: (i) `recordCasted(input, { remote: true })` calls `appendLine` with `getRemoteLogPathAbs()` as the first argument; (ii) `recordError(input, { remote: true })` likewise; (iii) `recordCasted(input, { remote: true })` on a store constructed without `getRemoteLogPathAbs` rejects with the documented error message. Existing cases continue to pass unchanged.

**junior-dev**

- [x] B1: Extend `RecordCastedInput` to allow optional `portalCastId` (already covered if it derives from `CastedEvent`; verify and add an explicit test if not). Extend `recordCasted(input, opts?: { remote?: boolean })`: when `opts?.remote === true`, append to `getRemoteLogPathAbs()`; otherwise to `getLogPathAbs()`. If `opts.remote === true` and `getRemoteLogPathAbs` is undefined, reject with `Error('CastLogStore: remote write requested but getRemoteLogPathAbs is not configured')`. Extend `recordError` symmetrically. — M, junior-dev
- [x] B2: Add the three new test cases listed in the Red criterion to `tests/castLog/store.test.ts`. — S, junior-dev

### C. Pure portal helpers — `parsePortalScheme`, `buildPortalUrl`, `buildBasicAuthHeader`, `buildPortalRequestBody`, `mapPortalError`

#### Section briefing

1. **What this section produces:** Five new files under `src/cast/portal/`, each exporting one pure function with the signature documented in **Components** and **Interfaces**. Five matching unit-test files under `tests/cast/portal/`. No I/O, no dependencies on `obsidian` or `node:fs`. `mapPortalError` returns the discriminated `{ notice, logEvent }` shape with all four reachable error notices verbatim from the catalog.
2. **Design context the executor needs upfront:**
   - Key design decision #3: "Scheme parsing is a separate pure function." `parsePortalScheme` recognises only `http://` and `https://` (case-insensitive); any other prefix (e.g. `ftp://`) is treated as part of the host string and the default `'https'` scheme is used. Bare `'localhost'` → `{ scheme: 'https', hostWithoutScheme: 'localhost' }`.
   - `buildPortalUrl`: trailing slashes on `path` are stripped; empty `port` skips the `:port` segment; empty `path` results in `<scheme>://<host>[:<port>]/cast`. Always appends exactly one `/cast`.
   - `buildBasicAuthHeader`: empty `user` and empty `password` still produce a valid header. Use `btoa` when defined, else `Buffer.from(...).toString('base64')` so node-env tests pass.
   - The five-message catalog in **Interfaces > five-message catalog** is verbatim — tests pin the exact strings. Body truncation in the "other non-2xx" case is at 200 characters; when body is empty, fall back to the status text (or `String(status)` if no status text).
   - Key design decision #11: `effort: null` serialises to JSON `null`, not omission. `buildPortalRequestBody` includes the `effort` key always.
3. **Cross-section couplings:**
   - `C1`–`C5` are consumed by `D1` (the transport composes all five). No outbound coupling beyond `D`.
   - `C5` (`mapPortalError`) catalog must match the dispatcher's notice text expectations in `E2` and the integration test in `G1`.
4. **Section-level Red criterion:** `npm test -- tests/cast/portal/` passes with at minimum the following pinned cases:
   - `parsePortalScheme`: bare host, `http://`, `https://`, `HTTP://` (case-insensitive), `ftp://garbage` (treated as default-https), empty string (returns `{ scheme: 'https', hostWithoutScheme: '' }`).
   - `buildPortalUrl`: all combinations of `{ port: '' | '8080', path: '' | '/grimoire' | '/grimoire/' }` × `{ scheme: 'http' | 'https' }`.
   - `buildBasicAuthHeader`: standard `user:pass`, empty user + empty password (`'Basic Og=='`), unicode chars in password.
   - `buildPortalRequestBody`: a full input, `effort: null` round-trips as JSON `null`, `userPrompt: ''` accepted.
   - `mapPortalError`: each of the four reachable shapes (timeout, network, http 401, http other) produces the exact catalog notice; body truncation at 200 chars; empty body falls back to status text.

**junior-dev**

- [x] C1: Implement `parsePortalScheme` per signature + pinned cases. Create `tests/cast/portal/parsePortalScheme.test.ts`. — S, junior-dev
- [x] C2: Implement `buildPortalUrl` per signature + pinned cases. Create `tests/cast/portal/buildPortalUrl.test.ts`. — S, junior-dev
- [x] C3: Implement `buildBasicAuthHeader` per signature + pinned cases (use `btoa` when defined, else `Buffer.from`). Create `tests/cast/portal/buildBasicAuthHeader.test.ts`. — S, junior-dev
- [x] C4: Implement `buildPortalRequestBody` per signature + pinned cases. Create `tests/cast/portal/buildPortalRequestBody.test.ts`. — S, junior-dev
- [x] C5: Implement `mapPortalError` per the five-message catalog. Create `tests/cast/portal/mapPortalError.test.ts` with one case per reachable shape, body-truncation case, and empty-body-fallback case. Notice strings tested verbatim. — M, junior-dev

### D. `RemoteCastTransport` — compose, race, callback

#### Section briefing

1. **What this section produces:** `src/cast/RemoteCastTransport.ts` exporting the class documented in **Interfaces > `RemoteCastTransport`**. `run(input, callbacks)` composes the five helpers from Section C, calls `requestUrl({ url, method: 'POST', headers, body, throw: false })` (injected via `requestUrlFn` for tests), races the call against a 30-s timer, and invokes the appropriate callback based on status / exception / timeout. A new `tests/cast/RemoteCastTransport.test.ts` pins each branch.
2. **Design context the executor needs upfront:**
   - Key design decision #1: signature parity with `CastRunner.run(input, callbacks)`. The callback shape differs (`onAccepted({ portalCastId })` vs `onSuccess()`) because the remote path carries information the local path lacks. Keep the names as documented; do not unify with `onSuccess`.
   - Key design decision #4: `requestUrlFn` is injected via constructor `deps`. Default to importing `requestUrl` from `obsidian` lazily inside the class (so node-env tests that don't stub `requestUrlFn` get a clear "not mocked" error rather than a crash at import time).
   - Key design decision #5: 30-s timeout is `Promise.race` against the `requestUrl` promise. The timer arm resolves the race with a sentinel object; do not attempt to abort the request. The constant lives as a module-level `const TIMEOUT_MS = 30_000`.
   - For 202: the response body is parsed via `response.json` (Obsidian's `RequestUrlResponse` exposes `.json` as a getter). The transport reads `response.json.castId` (the portal's server-side cast id). If `response.json` throws or the field is missing/non-string, log a `console.warn` and do not call `onAccepted` — the bare `casted` event already on disk is sufficient (per deferred edge case "Portal returns 202 without a body…").
   - For 401: branch *before* the generic non-2xx case; the notice and remediation are different.
   - For other non-2xx: read `response.text` (truncated to 200 chars) and compose the generic notice.
   - For network exception: `requestUrl` rejects with an `Error`; capture `error.message` and the input `portalHost` into the connection-failure notice.
3. **Cross-section couplings:**
   - `D1` depends on `C1`–`C5` (all five helpers).
   - `D1` is consumed by `E2` (dispatcher remote branch), `F2` (forge remote branch), and `G1` (integration spec).
4. **Section-level Red criterion:** `npm test -- tests/cast/RemoteCastTransport.test.ts` passes with at least the following pinned cases:
   - Builds URL via `buildPortalUrl(parsePortalScheme(input.portalHost), input.portalPort, input.portalPath)` and passes it to the injected `requestUrlFn`. Verify URL string.
   - Passes `Authorization: Basic …` header from `buildBasicAuthHeader(input.portalAuthUser, input.portalAuthPassword)`. Verify header.
   - Passes JSON body from `buildPortalRequestBody(...)`. Verify body parses back to the expected object.
   - 202 with `{ castId: 'server-id', spellPath, status: 'accepted' }` → `onAccepted({ portalCastId: 'server-id' })` fired, `onFailure` not fired.
   - 401 → `onFailure('Portal rejected credentials. Check your portal username and password in settings.')`, `onAccepted` not fired.
   - 500 with body `'oh no'` → `onFailure('Portal returned 500: oh no.')`.
   - 500 with empty body → `onFailure('Portal returned 500: Internal Server Error.')` (or `'Portal returned 500: 500.'` if status text unavailable — pick one and pin).
   - `requestUrlFn` rejects with `Error('dns failure')` → `onFailure("Couldn't reach portal at <host>: dns failure.")`.
   - `requestUrlFn` never resolves within 30 s (use `vi.useFakeTimers` + advance time) → `onFailure('Portal request timed out.')`.
   - 202 with malformed body (e.g. `response.json` throws or returns `{}` without `castId`) → `onAccepted` not called, `onFailure` not called, a `console.warn` is emitted.

**senior-dev**

- [x] D1: Implement `RemoteCastTransport` per the Interfaces signature and Red criterion. Use `vi.useFakeTimers` and an injected `requestUrlFn` stub to drive each branch. The timeout case requires racing a real `setTimeout` against the (never-resolving) request promise — verify the race resolves the timer arm without leaking the timer (clear it in the success path). — L, senior-dev (8df146d)

### E. `CastDispatcher` remote branch + pre-dispatch guard

#### Section briefing

1. **What this section produces:**
   - Pre-dispatch guard for empty `portalHost` on the remote branch (notice fires, no log entry, no close).
   - Remote-branch path in `dispatch()`: notice text variant ("on portal…"), close, `remoteTransport.run(...)`.
   - Two-write `casted` pattern: `recordCasted` (remote file) fires immediately; on `onAccepted({ portalCastId })`, a second `recordCasted` writes the same input plus `portalCastId` (also remote file).
   - On `onFailure`, `recordError({ castId, message }, { remote: true })` and notify with the message verbatim (the transport composed the final string).
   - The dispatcher's new optional `remoteTransport?: RemoteCastTransport` dep.
   - Extends `tests/CastDispatcher.test.ts` with cases covering both branches; existing local-branch cases continue to pass unchanged.
2. **Design context the executor needs upfront:**
   - Key design decision #2: "Branch lives inside `CastDispatcher`." Do not push this decision to `main.ts`.
   - Pre-dispatch guard rule: when `settings.executionMode === 'remote' && settings.portalHost.trim() === ''`, notify *"Configure portal host in settings before casting remotely."*, **return immediately without calling `recordCasted` or `close()`**. The popup must stay open.
   - Notice text on remote dispatch is `"Casting '<spell.name>' on portal…"` — the "on portal…" suffix is the visible mode-difference cue (per User-advocate perspective).
   - Use **strict equality** `settings.executionMode === 'remote'` (not truthy check). Anything else falls through to local — covers undefined/null from malformed saves.
   - Two-write pattern: the first `recordCasted` (before `remoteTransport.run`) omits `portalCastId`; the second (inside `onAccepted`) repeats the same record fields **plus** `portalCastId`. `foldEvents` (from Section A) handles the merge.
   - Existing local-branch behaviour MUST stay byte-identical. The local-branch tests in `tests/CastDispatcher.test.ts` must pass without modification.
3. **Cross-section couplings:**
   - `E1`–`E4` depend on `A1`/`A2` (`portalCastId` field), `B1` (remote write flag), `C1`–`C5` (helpers, transitively via the transport), `D1` (`RemoteCastTransport`).
   - `E1`–`E4` are consumed by `H1` (`main.ts` wiring) and `G1` (integration test).
4. **Section-level Red criterion:** `npm test -- tests/CastDispatcher.test.ts` passes with at minimum the following new cases:
   - Pre-dispatch guard: `executionMode: 'remote'`, `portalHost: ''` → notify with the exact string, `recordCasted` not called, `close` not called, `remoteTransport.run` not called.
   - Pre-dispatch guard with whitespace-only host (`portalHost: '   '`) → same as above (trim applied).
   - Remote happy path: `executionMode: 'remote'`, `portalHost: 'portal.example.com'` → `recordCasted` called once (remote=true, no portalCastId), notify `"Casting 'X' on portal…"`, `close` called once, `remoteTransport.run` called with the expected `RemoteCastInput` shape.
   - `onAccepted({ portalCastId: 'srv-1' })` invocation → second `recordCasted` called (remote=true, with `portalCastId: 'srv-1'`).
   - `onFailure('Portal request timed out.')` invocation → `recordError` called (remote=true, message='Portal request timed out.'), notify the same message.
   - Local branch with `executionMode: 'local'` → unchanged behaviour (existing tests continue to pass).
   - Local branch with `executionMode` value not in `'local' | 'remote'` (defensive, e.g., from a malformed save) → falls through to local.

**senior-dev**

- [x] E1: Add `remoteTransport?: RemoteCastTransport` to `CastDispatcherDeps` and the class. Read `settings.executionMode` once at the top of `dispatch()`. — S, senior-dev (81325f1)
- [x] E2: Implement the pre-dispatch guard (empty / whitespace-only host). Add the two guard test cases. — S, senior-dev (81325f1)
- [x] E3: Implement the remote branch in `dispatch()`: build `RemoteCastInput` from the dispatch input + settings, write the bare `recordCasted({ ..., }, { remote: true })`, notify, close, invoke `remoteTransport.run(...)`. Wire `onAccepted` to write the patch `recordCasted` and `onFailure` to write `recordError` + notify. Add the four happy/error-path test cases. — M, senior-dev (81325f1)
- [x] E4: Confirm all existing `tests/CastDispatcher.test.ts` cases still pass without modification (local branch unchanged). If any existing case has to be touched to keep the type system happy (e.g. `baseSettings` needs the new fields), update only the test fixture, not the asserted behaviour. — S, senior-dev (81325f1)

### F. `ForgeImprinter` remote branch (forge invariant)

#### Section briefing

1. **What this section produces:**
   - Same branch logic as `CastDispatcher`'s remote branch, applied at the `ForgeImprinter.imprint` site. The forge spell path remains the `<forge>` sentinel; the meta-spell content becomes the `userPrompt` field in the JSON body.
   - Pre-dispatch guard for empty `portalHost`: notify with the exact same string as the live-cast guard, do not call `close`, do not call `recordCasted`. The dialog stays open.
   - Notice text on remote forge: `"Forging '<sanitised>' on portal…"`.
   - On `onAccepted`, write the patch `recordCasted` (remote=true, with `portalCastId`); on `onFailure`, write `recordError` (remote=true) and notify with the failure message.
   - Extends `tests/ForgeImprinter.test.ts` with the remote-branch cases. Existing local-branch cases must pass unchanged.
   - Integration test `tests/integration/remote-forge.spec.ts` pinning both branches end-to-end (mocked `requestUrl` for the remote case, mocked `CastRunner` for the local case).
2. **Design context the executor needs upfront:**
   - Pitch is explicit: "No separate remote-forge toggle. Forge follows the global execution mode." Branch on the **same** `settings.executionMode` field as the dispatcher.
   - The `userPrompt` field of the JSON body carries the meta-spell text (which is the entire spell content for a forge). `spellPath` stays `<forge>` per `FORGE_SPELL_PATH`.
   - Notice text uses the *sanitised* name (per existing `ForgeImprinter` behaviour). Do not change sanitisation logic.
   - Forge has no `executeOnNote` / `contextNotes` / `followUp` semantics for the remote portal — the portal receives a fully-formed prompt and dispatches. Local forge passes the meta-spell via `metaSpell` to the runner; remote forge passes it via `userPrompt`. Both end up at the same Claude Code invocation argument shape downstream.
3. **Cross-section couplings:**
   - `F1`–`F3` depend on `D1` (transport) and `B1` (remote store flag).
   - `F1`–`F3` are consumed by `H1` (`main.ts` wiring).
   - The integration test `F4` overlaps in scope with `G1` (live-cast integration) — they exercise the same transport seam from two entry points. Keep them as two specs so a forge regression and a live-cast regression don't both fail under one ambiguous test name.
4. **Section-level Red criterion:** `npm test -- tests/ForgeImprinter.test.ts` and `npm run test:integration -- remote-forge` pass with at minimum:
   - Local forge with `executionMode: 'local'` → existing behaviour, `castRunner.run` called once with `metaSpell`, no `requestUrl` call.
   - Remote forge with empty host → notify with the exact guard string, `castRunner.run` not called, `remoteTransport.run` not called, `close` not called.
   - Remote forge happy path → `recordCasted` once (remote=true, no portalCastId), notify `"Forging 'X' on portal…"`, `close` once, `remoteTransport.run` called with `RemoteCastInput { spellPath: '<forge>', userPrompt: <meta-spell-text>, … }`.
   - `onAccepted` → patch `recordCasted` (remote=true, with portalCastId).
   - `onFailure('Portal returned 500: …')` → `recordError` (remote=true) + notify the same message.

**senior-dev**

- [x] F1: Add `remoteTransport?: RemoteCastTransport` to `ForgeImprinterDeps` and the class. Read `settings.executionMode` at the top of `imprint()`. — S, senior-dev (5e509bb)
- [x] F2: Implement the pre-dispatch guard and the remote branch, threading the meta-spell into `RemoteCastInput.userPrompt` and `<forge>` into `RemoteCastInput.spellPath`. Wire `onAccepted` and `onFailure` callbacks to remote-flagged log writes. Add unit-test cases per the Red criterion. — M, senior-dev (5bd0827)
- [x] F3: Confirm existing `tests/ForgeImprinter.test.ts` local-branch cases continue to pass. — S, senior-dev (5bd0827)

**ui-integration-tester**

- [x] F4: New integration test `tests/integration/remote-forge.spec.ts` driving the forge dialog's Imprint button through the `ForgeImprinter` (with mocked `requestUrl` on the remote case and mocked `CastRunner` on the local case), pinning the branch behaviour end-to-end. — M, ui-integration-tester

### G. Live-cast integration test

#### Section briefing

1. **What this section produces:** A new spec `tests/integration/remote-cast.spec.ts` driving `CastDispatcher.dispatch` with a mocked `requestUrl` and a real `RemoteCastTransport`, asserting the request shape (URL, headers, body), the post-202 log state (both `casted` events present in `cast-log-remote.jsonl`, second one with `portalCastId`), and the notice text. Also pins the local branch with `executionMode: 'local'` continues to produce `castRunner.run` calls and writes to `cast-log-local.jsonl`.
2. **Design context the executor needs upfront:** This is a logic-integration test (transport seam from `CastDispatcher`'s perspective with the real transport + helpers but mocked HTTP), not a UI-component-seam test. It lives under `tests/integration/` so it runs at `/done`. Use the existing `obsidian` mock's `requestUrl` stub (added in Section H).
3. **Cross-section couplings:**
   - `G1` depends on `A`, `B`, `C`, `D`, `E` complete and green at the unit level.
   - `G1` does not depend on `F` (forge has its own integration spec at `F4`).
   - `G1` does not depend on `H` (main.ts wiring) — uses direct construction with stubs.
4. **Section-level Red criterion:** `npm run test:integration -- remote-cast` passes with at minimum:
   - With `executionMode: 'remote'`, valid host, mocked `requestUrl` returning 202 with `{ castId: 'srv-1', spellPath: '...', status: 'accepted' }`:
     - The mocked `requestUrl` is called with `{ url: 'https://portal.example.com/cast', method: 'POST', headers: containing 'Authorization: Basic …' and 'Content-Type: application/json', body: JSON-stringified expected shape, throw: false }`.
     - Notice fired: `"Casting 'Test' on portal…"`.
     - `cast-log-remote.jsonl` contains two `casted` lines with the same `castId`; the second has `portalCastId: 'srv-1'`.
     - `cast-log-local.jsonl` is untouched.
   - With `executionMode: 'local'`: existing behaviour — `castRunner.run` called, `requestUrl` never called, only `cast-log-local.jsonl` written.
   - With `executionMode: 'remote'`, host empty: pre-dispatch guard fires; `requestUrl` never called; no log write to either file; popup not closed.

**ui-integration-tester**

- [x] G1: New integration test `tests/integration/remote-cast.spec.ts` per the Red criterion. Uses the harness pattern from existing integration tests. — M, ui-integration-tester

### H. `obsidian` mock — `requestUrl` shim + wiring + settings description

#### Section briefing

1. **What this section produces:**
   - `tests/__mocks__/obsidian.ts` gains a `requestUrl` export as a `vi.fn()` defaulting to `async () => { throw new Error('requestUrl not mocked'); }`. Tests stub per case.
   - `src/main.ts` constructs a `RemoteCastTransport` and threads it into both `CastDispatcher` and `ForgeImprinter` constructors.
   - `src/ui/settings/GrimoireSettingTab.ts` gains a `.setDesc('Hostname or full URL. Defaults to HTTPS unless http:// is prefixed.')` on the Portal host row.
   - `tests/integration/settings-panel.spec.ts` gains one assertion pinning the description text on the Portal host row.
   - `tests/main.test.ts` gains a case pinning that `RemoteCastTransport` is constructed and passed into the dispatcher and the imprinter.
2. **Design context the executor needs upfront:**
   - Linting: never disable `obsidianmd/*`. The description text uses `.setDesc(...)` on a `Setting`; the existing helpers already support `desc` (`#addTextField` does not, but `#renderAdvancedSection` constructs the host `Setting` directly via `#addTextField`). Decision: change `#addTextField`'s signature to accept an optional `desc?: string` parameter, or extract a one-off setting construction for the host row only. Pick the simpler one — extend `#addTextField` with an optional `desc` parameter (one place, one extra `if (desc) s.setDesc(desc)` line).
   - The mock for `requestUrl` must not crash node-env unit tests that don't touch the remote path. Default-reject is sufficient — tests that need it override per case.
   - Live-spec patch: do **not** edit `docs/features/remote-casting-setup.md` in this iteration. The `/spec` post-`/done` sweep handles live-spec drift.
3. **Cross-section couplings:**
   - `H1` depends on `D1` (transport) being importable.
   - `H2` depends on the existing `addText` plumbing; the change is one extra line.
   - `H3` depends on `H2` rendering the description.
   - `H4` depends on Section E and F's dep shapes.
4. **Section-level Red criterion:**
   - `npm test` passes — no node-env test that touches the mock crashes from the new `requestUrl` export.
   - `npm run test:integration -- settings-panel` passes with the new description-text assertion.
   - `npm test -- tests/main.test.ts` passes with the new transport-wiring assertion.
   - `npm run lint` is green (no `eslint-disable`, `setDesc` used correctly).

**junior-dev**

- [x] H1: Add `requestUrl` export to `tests/__mocks__/obsidian.ts` as a `vi.fn()` default-rejecting. Export `RequestUrlParam` and `RequestUrlResponse` types (or `any` shims if structural typing in tests is sufficient — match the existing mock's posture). — S, junior-dev
- [x] H2: Extend `GrimoireSettingTab.#addTextField` with an optional `desc?: string` parameter. Pass the documented description string for the Portal host row. — S, junior-dev
- [x] H3: Append one assertion to `tests/integration/settings-panel.spec.ts`: the Portal host row's settingEl contains the documented description text. — S, junior-dev
- [x] H4: In `src/main.ts`, construct a `new RemoteCastTransport()` and pass it as `remoteTransport` into both `new CastDispatcher({ ... })` and `new ForgeImprinter({ ... })`. — S, junior-dev
- [x] H5: Add one case to `tests/main.test.ts` pinning that `RemoteCastTransport` is constructed and threaded into both `CastDispatcher` and `ForgeImprinter` (mirror the existing `castLogStore` wiring assertion pattern). — M, junior-dev
- [x] H6: Confirm `npm run lint`, `npm test`, `npm run test:integration`, `npm run build`, and `npm run arch:check` all pass. — S, junior-dev

## Overall effort

| Effort | Count |
|---|---|
| S | 17 |
| M | 8 |
| L | 1 |

| Tier | Count |
|---|---|
| junior-dev | 14 |
| senior-dev | 8 |
| lead-dev | 0 |
| ui-integration-tester | 2 |

The plan is dominated by junior-dev work because the design questions (interfaces, branch placement, error catalog, two-write pattern, mock shape, schema additivity) are closed at planning time. Senior-dev handles the transport composition (D1 is the one L), the dispatcher's two-branch implementation and the forge invariant (E and F where the branch logic plus two-write pattern interact with the existing local path). UI-integration-tester pins the two integration seams (live cast and forge) that exercise the transport end-to-end. No lead-dev — there is no unknown root cause, no concurrency that the per-cast independence model doesn't already handle, and no security-critical reasoning beyond the standard Basic Auth header pitch decision (already settled by the pitch).

## Next

First todo: **A1** — add the optional `portalCastId` field to `CastedEvent` and `CastRecord`. Handoff to junior-dev via `/implement`.

reviewed @ 55228f3
