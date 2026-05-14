# Remote Casting

> `dev/done-012` — 2026-05-14 — Wires the dispatcher and forge imprinter to actually call a portal when the **Remote execution** toggle is on, completing the seam laid down by `remote-casting-setup` and giving `cast-log-remote.jsonl` its first producer.

## What it does

With the toggle in *Local* (the default), nothing changes — every cast still spawns Claude Code locally and writes to `cast-log-local.jsonl`. Flipping the toggle to *Remote* re-routes both live casts and forge imprints through a new HTTP transport: each dispatch POSTs to `<scheme>://<portalHost>[:<port>][<path>]/cast` with `Authorization: Basic …` and a JSON body carrying the cast id, spell path (or the `<forge>` sentinel), user prompt, model, and effort. The popup closes the moment the request is dispatched, and a *"Casting '<spell>' on portal…"* (or *"Forging '<name>' on portal…"*) toast confirms the remote branch took effect.

Each remote dispatch writes its events to `cast-log-remote.jsonl` instead of the local log. The Logs panel already merges both files (see `cast-log-panel`), so remote casts surface in the UI without any panel-side change. A new optional `portalCastId` field on the `casted` event captures the portal's server-side id when the response lands. Five named error shapes — empty host, network failure, 401, other non-2xx, and a 30 s timeout — each surface a specific notice; four of them write an `error` event to the remote log.

If the user flips the toggle on but the Portal host field is empty, dispatch refuses with *"Configure portal host in settings before casting remotely."*, leaves the popup open, and writes nothing — so the user can fix the field and retry without losing context. The Portal host row also picked up an inline description (*"Hostname or full URL. Defaults to HTTPS unless http:// is prefixed."*) so the bare-host vs. full-URL affordance is discoverable.

## Design decisions

- **`RemoteCastTransport` is a class with the same `run(input, callbacks)` shape as `CastRunner`, not a subclass of a shared base.** Structural parity is what lets the dispatcher swap them; a shared base would have forced `binaryPath` and `cliCommand` into the abstract input where they make no sense for HTTP. A future third transport (`queued`) slots in as a third concrete class.
- **The execution-mode branch lives inside `CastDispatcher` and `ForgeImprinter`, not in `main.ts`.** Routing the branch from the wiring layer would expose two callback contracts upward; keeping it in the dispatcher means the existing single `dispatch(input)` seam stays single.
- **Two-write `casted` pattern for `portalCastId` capture.** A bare `casted` event is written immediately on dispatch (so the cast is visible in the log instantly, matching local behaviour); a second `casted` with the same `castId` plus `portalCastId` is appended after the 202 lands. `foldEvents` was taught "later `casted` wins on optional fields." The simpler alternative (buffer until 202) was rejected because it left the cast invisible during the request window.
- **`{ remote: true }` is an option on the existing `recordCasted` / `recordError` methods, not parallel `…Remote` methods.** One branch in one place; no duplicated timestamp + JSON + append code.
- **`portalCastId` is an optional field on `CastedEvent` and `CastRecord`, not a split subtype.** A union `CastedEvent | RemoteCastedEvent` would propagate one optional field through every consumer.
- **30 s timeout is `Promise.race`, not an abort.** Obsidian's `requestUrl` has no abort surface; the race is the simplest correct mechanism. The background request continues and its result is discarded — acceptable per the no-retry rule.
- **The five notice strings are inline literals in `mapPortalError`, not constants.** Tested verbatim; externalising helps i18n, which the plugin doesn't have. YAGNI.

## Scope

**In:**

- HTTP transport (`RemoteCastTransport`) composed from five pure helpers under `src/cast/portal/`: scheme parsing, URL building, Basic Auth header, JSON body, error mapping.
- Pre-dispatch guard on empty (or whitespace-only) `portalHost`.
- Remote branch in both `CastDispatcher` and `ForgeImprinter` with branch-specific notice text.
- `CastLogStore` accepts `{ remote: true }` to direct writes to `cast-log-remote.jsonl`.
- Optional `portalCastId` on `CastedEvent` / `CastRecord`, propagated by `foldEvents` with "later casted wins."
- `requestUrl` mock added to the Obsidian test mock; description string added to the Portal host row.
- Unit coverage for every helper, the transport, and both dispatch-site branches; integration specs for live cast and forge driving the seam end-to-end with a mocked portal.

**Out:**

- **Status close-loop (`in-progress` / `done` for remote casts)** — deferred; the captured `portalCastId` is the correlation key a future pitch will use. No polling, no SSE.
- **Retry, dedup, fallback-to-local** — pitch was explicit: the user re-casts manually after a failure.
- **Token / JWT / request signing, certificate pinning** — Basic Auth is sufficient for the personal-VPS use case; cryptographic upgrades are a separate concern when the threat model widens.
- **"Test connection" button, port-range / hostname / path validation** — passive validation matches the rest of the settings tab; premature without empirical user pain.
- **Separate remote-forge toggle** — forge follows the global execution mode by design; a per-surface toggle would split user mental model with no use case behind it.
- **Reshape of `CastRunner` or `requestUrl` into a shared HTTP/process abstraction** — only two transports today; promotion to an `ICastTransport` interface waits for the third.

## Relationship to existing system

- **Closes the seam opened by `remote-casting-setup`.** That iteration shipped the toggle and the five portal fields as a read-only API; this iteration is their first consumer outside the settings tab.
- **Gives `cast-log-foundation`'s reserved `cast-log-remote.jsonl` its first producer.** The schema and reader plumbing already existed; only the writers were missing.
- **Surfaces in `cast-log-panel` for free.** The Logs panel already merges both log files, so remote casts show up alongside local ones with no panel-side change.
- **Extends `live-spells-and-casting` and `forge-cast` with a parallel branch.** The local data flow documented in those specs is byte-for-byte unchanged; the remote branch is a sibling path with its own notice strings and its own log file. Both dispatch sites still own id generation and write the bare `casted` line before invoking their runner / transport.
- **Reuses the Obsidian test mock pattern** established for `Plugin`, `Setting`, `TextComponent`, etc. — `requestUrl` is one more `vi.fn()` defaulting to a clear "not mocked" rejection so node-env tests that never touch it stay quiet.

## Behavior changes

- **Cast dispatch with `executionMode === 'remote'`:** previously a no-op beyond persisting the toggle state; now POSTs to the portal, writes to the remote log, and surfaces five distinct error notices. Reason: the read-only API laid down by `remote-casting-setup` was always meant to be consumed.
- **Forge imprint with `executionMode === 'remote'`:** same change — forge follows the global toggle and routes through the same transport (sending the meta-spell as `userPrompt` and `<forge>` as `spellPath`). Reason: pitch was explicit that forge has no separate toggle.
- **Portal host row in Settings:** previously had no inline description; now reads *"Hostname or full URL. Defaults to HTTPS unless http:// is prefixed."*. Reason: the bare-host vs. full-URL affordance is otherwise invisible.
- **`CastDispatcher` / `ForgeImprinter` constructor deps:** both gained an optional `remoteTransport?: RemoteCastTransport`. Required at runtime when the toggle can land on `remote`; production wiring in `main.ts` always provides it. Reason: same dependency-injection posture as `castRunner`.
