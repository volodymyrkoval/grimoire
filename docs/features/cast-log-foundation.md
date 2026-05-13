# Cast Log Foundation

> `dev/done-008` — 2026-05-13 — Lays the schema, append-only JSONL store, UUID threading, and the two plugin-owned event writers (`casted`, `error`) for the cast lifecycle. No reader, no UI, no Claude Code hooks yet.

## What it does

Every cast dispatched by the plugin — Spell Picker live cast or Forge imprint — now produces an auditable record in `<vault>/<plugin-dir>/cast-log-local.jsonl`. The file is append-only, one JSON event per line, created on first write.

Two events are written by the plugin process today. A `casted` line is written before the subprocess spawns, capturing `castId`, spell path (or the `<forge>` sentinel for forge casts), model, effort, context notes, and (live casts only) follow-up and execute-on-note. An `error` line is written when the cast fails — non-zero exit or async launch failure — carrying the same `castId` and the failure message. A dispatch blocked by an existing guard (no active note, or empty-after-sanitise name) writes nothing: those casts never reached the dispatched state.

Each dispatch generates a UUID via `crypto.randomUUID`, threads it through the runner, and exports it to the spawned subprocess as the `CAST_ID` environment variable. Future Claude Code hook scripts will read `$CAST_ID` to write the matching `in-progress` / `done` lines from outside the plugin process. The discriminated-union schema covers all four lifecycle stages today; only `casted` and `error` are written by this iteration.

## Design decisions

- **Lazy, cached path resolution.** The store accepts `getBasePath: () => string` (not a captured string) so a hot-reloaded vault path is picked up. Path is resolved on first write and cached. Sidesteps a load-order pitfall the plan flagged.
- **`fs.appendFile` direct, no locking.** Kernel `O_APPEND` guarantees atomic appends below `PIPE_BUF`; a log line is well under 1 KB. A lockfile would buy nothing.
- **Fire-and-forget writes** wrapped in `.catch(console.error)` at the call sites. The cast UX must not stall on disk I/O; the log is a tap on the side of the dispatch flow, not a barrier.
- **`castId` is required on `CastRunInput` and on both dispatcher deps.** Optional would invite drift where some paths skip log entries — exactly the failure mode the contract prevents.
- **Dispatchers own id generation, not `main.ts`.** Generating after each dispatcher's guard passes means a guard-blocked cast never gets an id and never gets a `casted` event.
- **Runner stays oblivious to the store.** It threads `castId` into env and surfaces failures via its existing `onFailure(msg)` callback; the dispatcher/imprinter writes `error` from inside that callback. Preserves runner's single responsibility.
- **`FORGE_SPELL_PATH = '<forge>'` lives in the log types module**, not in `forge/`, because it is a property of the log contract and future readers will render it specially.
- **No schema-version field yet.** Deferred to the first breaking change. Adding `schemaVersion: 1` now would lock the format earlier than necessary.

## Scope

**In:**

- `CastLogEvent` discriminated union (`casted` / `error` / `in-progress` / `done`) and the `FORGE_SPELL_PATH` sentinel, exported from a new `castLog` module.
- `CastLogStore` class with `recordCasted` and `recordError`, lazy path resolution, injectable `appendLine` / `getBasePath` / `now` / `generateId` ports for testability.
- `castId: string` threaded through `CastDispatchInput`, `CastRunInput`, and into the spawned subprocess env as `CAST_ID`.
- Both dispatch sites (`CastDispatcher.dispatch`, `ForgeImprinter.imprint`) generate `castId` after their guards pass, write `casted` before the spawn, and write `error` from the failure callback.
- A single `CastLogStore` instance constructed in `onload` and injected into both dispatch sites.
- Unit tests at every seam (store, dispatcher, imprinter, runner env, main wiring) and integration-harness updates so existing UI specs keep passing through the injected store.

**Out:**

- `in-progress` / `done` writes — sibling pitch (Claude Code hooks), written from outside the plugin process.
- Hook scripts, `settings.json` materialisation, settings-flag injection — same sibling pitch.
- Cast Log reader, parser, UI panel — no consumer of the JSONL file yet; deferred until the reader pitch.
- `cast-log-remote.jsonl` — reserved name; not produced until remote casting lands.
- Timeout-based stale detection, retention/rotation, telemetry — premature; not justified by any current use case.
- Surfacing `castId` in `Notice` toasts — no UX rationale yet.
- Schema-versioning field — deferred to the first breaking change (YAGNI).

## Relationship to existing system

- **Extends `live-spells-and-casting`** and **`forge-cast`**: both dispatch sites now write to the log before spawning and on failure. Their guard semantics, toasts, and spawn paths are otherwise unchanged.
- **Extends `CastRunner`'s spawn env** with `CAST_ID` alongside the existing `VAULT_MOUNT_PATH`. The runner does not validate the id; producers guarantee uniqueness.
- **Wired in `main.ts`** as a singleton, mirroring how `SpellOverrideStore` is constructed once and injected into seam owners.
- **Anticipates the future Cast Log reader** referenced in `README.md` ("What's not there yet") and the Claude Code hooks pitch; the JSONL file plus `CAST_ID` env are the two stable seams those iterations will pick up.

## Behavior changes

- **Successful dispatch (live cast or forge):** previously wrote nothing to disk besides what the subprocess itself touched; now writes exactly one `casted` line before spawning. Reason: every dispatched cast must be auditable.
- **Failed dispatch:** previously surfaced only as a `Cast failed: …` / `Forge failed: …` toast; now additionally writes one `error` line carrying the same `castId`. Reason: failures are the most useful signal to log.
- **Spawned subprocess environment:** previously received `VAULT_MOUNT_PATH` only; now also receives `CAST_ID`. Reason: gives Claude Code hooks a join key against the JSONL file.
- **`CastDispatcher` / `ForgeImprinter` / `CastRunner` constructor surfaces:** dispatcher and imprinter deps now require `castLogStore`; `CastRunInput` now requires `castId`. Reason: required (not optional) prevents silent log gaps.
