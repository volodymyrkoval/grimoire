# Cast Unification

> `dev/done-013` — 2026-05-15 — Deep refactor that collapses local-CLI and remote-portal casting onto a single `Caster` interface and moves cast-log writes and notifications out of the transport into the calling observer. No user-visible behaviour changes.

## What it does

From a user's perspective: nothing. Local casts still spawn Claude Code locally; remote casts still POST to the portal; both still produce the same notices, the same log lines, the same `portalCastId` capture on the second `casted` event. Every existing unit and integration test continues to pass.

Internally, the casting layer was tangled. `CastDispatcher` and `ForgeImprinter` each carried their own `executionMode === 'remote'` branch, each held both a local runner and a remote transport, and each routed its log writes through a `{ remote: true }` flag on `CastLogStore`. The remote branch in `ForgeImprinter` even duplicated the record-and-notify path against the local branch, a bug latent in the previous shape. This iteration consolidates all three responsibilities — execute, write to the right log, notify — along a single seam.

A small new `Caster` interface (`cast(input, { onAccepted, onFailure })`) is satisfied by two implementations: `LocalCaster` wraps `CastRunner`, `RemoteCaster` wraps `RemoteCastTransport`. A `createCaster(settings)` factory picks one based on `executionMode`. Dispatcher and Imprinter become pure observers — they compose the input, invoke `caster.cast(...)`, and translate the two callbacks into log writes plus notifications. The log target is fixed at injection time (one `CastLogWriter` per observer), so the routing flag disappears. The Command Popup's two cast actions (`castAction` for Enter-from-list, `optionsCastAction` for the options panel) collapse to one — the popup itself builds a default snapshot for the Enter-from-list path.

## Design decisions

- **`Caster` is a structural interface, not an abstract base.** Keeps `LocalCaster` and `RemoteCaster` decoupled and matches the existing `RemoteCastTransport` shape. A future third transport (queued, websocket) slots in by satisfying the same interface.
- **`createCaster` is a free function with a `switch` on `executionMode`.** No state, no class, no factory hierarchy. Mirrors how `resolveCliBinary` is shaped. A post-plan refinement (J) also removed the `deps` parameter — `RemoteCaster` constructs its own `RemoteCastTransport` internally, and tests mock at the module level instead of through injection seams.
- **The caster is constructed per dispatch, not per popup-open.** Preserves the live-read semantic for `settings` that the previous closure-based wiring already had. One `new` per cast is trivial.
- **`CastLogWriter` is the interface observers depend on; the write-routing flag is deleted.** Dispatcher and Imprinter take a single `CastLogWriter` bound at construction. Two `CastLogStore` instances are constructed in `main.ts` — one for the local log path, one for the remote. The reader API (`readAll()` for the Logs panel) keeps the original store, which still merges both files.
- **Pre-flight guards stay in the observer.** "No active note" and "empty portal host" don't fit the Caster's shape — surfacing them through `onFailure` would force the writer to learn "this guard failure doesn't get a log entry." Keeping them in the observer preserves the existing test contract.
- **`CommandPopup` consolidates to one `castAction(spell, snapshot)`.** The previous two-action shape was an implementation accident leaking through. The Enter-from-list path now builds a default snapshot inside the popup, so `main.ts` no longer carries two closures.
- **Folder reshape mirrors `cast/portal/`.** All local-CLI files (`CastRunner`, `spawnCast`, `buildCastArgs`, `resolveCliBinary`) move under `src/cast/local/`. Shared types live at `src/cast/` root; the `Caster` interface lives one level higher under `src/execution/`, signalling that it is consumed outside the cast module too (by `ForgeImprinter`).

## Scope

**In:**

- New `Caster` interface (and `CastInput`, `CastCallbacks`, `CastAcceptedInfo` types) under `src/execution/`.
- `LocalCaster` and `RemoteCaster` implementations, plus a `createCaster` factory in `src/cast/`.
- New `CastLogWriter` interface in `src/castLog/`; `CastLogStore` continues to implement it directly per-instance.
- `CastDispatcher` and `ForgeImprinter` refactored to depend on `Caster` + `CastLogWriter` only — no more `castRunner` / `remoteTransport` / `castLogStore` deps, no more `executionMode` branching.
- `CommandPopup` collapsed to a single `castAction(spell, snapshot)`; `optionsCastAction` removed.
- `{ remote: true }` flag removed from `CastLogStore.recordCasted` / `recordError`; `RecordOptions` type deleted.
- Local-CLI files moved under `src/cast/local/`.

**Out:**

- **No user-visible behaviour changes.** Pitched explicitly as such — this is a structural refactor, not a feature.
- **No new transports.** The seam is open for one, but adding it is a separate concern.
- **Status close-loop (`in-progress` / `done` for remote casts).** Still deferred per `remote-casting`; the materialiser is the consumer, not the Caster.
- **Reshape of `CastRunner` or `requestUrl`.** They remain Caster implementation details; promotion to a shared HTTP/process abstraction waits for a third use case.

## Relationship to existing system

- **Replaces the dual-branch wiring documented in `remote-casting`.** That iteration described the execution-mode branch as living inside `CastDispatcher` and `ForgeImprinter`; after this iteration, the branch lives inside `createCaster` only, and the observers are mode-agnostic.
- **Supersedes the `{ remote: true }` write-routing pattern documented in `remote-casting` and `cast-log-foundation`.** Log routing is now structural: each observer holds the writer for its mode.
- **Reshapes the `CommandPopup` callback surface documented in `command-popup-ui`, `live-spells-and-casting`, and `options-panel`.** What was two callbacks (`castAction` for Enter-from-list, `optionsCastAction` for the options panel) is now one (`castAction(spell, snapshot)`); the popup builds the default snapshot for the no-options path.
- **Leaves the on-disk log format, hook materialiser contract, settings schema, and Plugin entry surface unchanged.** Every consumer outside the casting layer is byte-compatible.

## Behavior changes

This refactor is purely internal — no end-user behaviour changed. The behaviour changes worth recording are API-shape changes that other docs claimed otherwise:

- **`CastDispatcher` / `ForgeImprinter` constructor deps:** previously took `{ castRunner, remoteTransport?, castLogStore, ... }`; now take `{ caster: () => Caster, logWriter: CastLogWriter, ... }`. Reason: the observers no longer pick the transport or the log file — the factory and `main.ts` do.
- **`CastLogStore.recordCasted` / `recordError`:** previously accepted an optional `{ remote: true }` second argument to route to the remote log; now take no second argument. Each store instance writes to exactly one path. Reason: routing belongs in wiring, not in the call site.
- **`CommandPopup` constructor params:** previously took both `castAction: (spell) => void` and `optionsCastAction: (spell, snapshot) => void`; now takes a single `castAction: (spell, snapshot) => void`. Reason: the two paths arrive at the same dispatch; the popup builds the default snapshot for Enter-from-list.
