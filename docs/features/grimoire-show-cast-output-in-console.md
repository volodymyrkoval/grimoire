# Show Cast Output in Console

> `dev/done-037` — 2026-05-28 — Adds a diagnostic toggle that tees each local cast's stdout and stderr to the Obsidian developer console as the bytes arrive, every chunk prefixed with the cast id. Off by default; byte-identical behaviour to before when off.

## What it does

A new **Show cast output in console** toggle appears in the **Advanced** section of the Grimoire settings tab, beside the remote-casting fields. When it is on, every chunk a local cast writes to stdout is mirrored to `console.debug` and every chunk it writes to stderr is mirrored to `console.error`, each prefixed with `[<castId>]` so concurrent casts stay legible. The toggle is off by default — the console stays quiet for normal use and lights up only when a developer reaches for it.

The toggle is purely diagnostic. It does not change what gets stored, surfaced, or reported. Failure handling is unchanged in both modes: stderr is still accumulated into the buffer that powers `stderrTail`, and a non-zero exit still produces the existing `Forge spawn stderr:` console dump. The toggle ships no in-app panel, no log pipeline, and no CLI flags — the dev console is the entire surface.

Remote casts are untouched: the flag rides through `LocalCaster` and the local `CastSpawner` only. On mobile, the row is visible-but-inert; the local spawner never runs there, so the flag is harmlessly persisted.

## Design decisions

- **Echo is additive to existing stream handling, never a replacement.** Both listeners always consume their chunks (stdout drain, stderr accumulation); echo only adds a second consumer when the flag is on. This makes the load-bearing drain invariant — without which a chatty cast would stall on OS-level pipe backpressure — a property of the code shape rather than a comment to remember.
- **Decompose `#listenToForgingProcess` before adding the branch, not after.** Two stream listeners × two conditional behaviours (drain vs. echo) inside one method would conflate orchestration with stream-handling detail. The orchestrator now calls `#attachStdoutListener` and `#attachStderrListener`; both helpers attach a `data` listener unconditionally and put the echo branch inside the listener body.
- **Read the prefix's cast id from `config.env.CAST_ID`, not a new top-level config field.** `CastRunner` already populates that env entry for the hooks; reusing it avoids a parallel data path. Missing entries fall back to `[cast]`.
- **`console.debug` for stdout, `console.error` for stderr.** `eslint-plugin-obsidianmd` prohibits `console.log` in plugin source; `console.debug` is the Obsidian-compliant level for diagnostic output and is visible in the Electron devtools at the default log level.
- **Spy on `console` in tests, no injected logger port.** The dev console is the explicit surface the pitch names; an abstraction layer would be speculative generality for a two-line behaviour.
- **No `Platform.isDesktop` guard on the row.** Leaving it visible-but-inert on mobile costs nothing; adding a guard buys nothing.
- **Per-chunk prefix, not per-line.** One `data` event yields one prefixed `console.debug` call. Multi-line chunks render with one prefix at the front and the rest verbatim, matching the "no parsing, no formatting" no-go.
- **Keep the `Forge*`-shaped internal names.** Renaming `#listenToForgingProcess` and its `Forge spawn stderr:` message was explicitly held back to keep this iteration from sprawling into a refactor. The newly extracted helpers carry cast-neutral names because they are new, not renamed.

## Scope

**In:**

- New `showCastOutput: boolean` field on `GrimoireSettings` (default `false`), persisted through the existing additive-merge hydration.
- New toggle row in the Advanced section of the settings tab, between the **Remote execution** toggle and the **Portal host** row.
- A new optional `echoOutput` flag threaded through `LocalCaster` → `CastRunInput` → `CastSpawnConfig`.
- New private helpers `#attachStdoutListener`, `#attachStderrListener`, and `#deriveEchoConfig` on `CastSpawner`; the echo branch lives inside the two listener bodies.

**Out:**

- **In-app output panel / pipe into Cast Log** — overlaps Cast Log's territory and deserves its own pitch; not justified by the single use case here.
- **Remote-cast output echo** — Portal-side concern with its own data shape; out of scope for the local spawner.
- **CLI flag changes (`--verbose`, `--output-format stream-json`)** — would alter the bytes Claude Code emits, far beyond a diagnostic tap.
- **Parsing, formatting, or per-line splitting of chunks** — pitch is "tee raw bytes"; anything richer is a different feature.
- **Persistence of output** — disk / log writes belong to Cast Log, not a diagnostic toggle.
- **Renaming the `Forge*`-shaped spawner internals** — flagged as a reasonable drive-by but explicitly held back to avoid scope creep.
- **`Platform.isDesktop` guard on the row** — visible-but-inert on mobile is the desired shape.

## Relationship to existing system

- **Builds on** `settings-panel` and `remote-casting-setup`: same `GrimoireSettings` field + `DEFAULT_SETTINGS` + `Advanced`-section pattern, same `#addToggleField` helper, same write-through-and-debounced-save contract, same additive-merge hydration.
- **Extends** the local-cast chain documented in `live-spells-and-casting` and `forge-cast` (`LocalCaster` → `CastRunner` → `CastSpawner`): the same chain now carries one extra optional field with no behavioural effect when unset.
- **Mirrors** the per-cast-id prefixing already used by hooks via `CAST_ID`: the same env entry now powers the console prefix, with no new identifier needed.
- **Does not interact with** the remote-cast path (`remote-casting`) or with Cast Log (`cast-log-foundation`, `cast-log-panel`, `cast-log-mobile-sync`); both are explicitly out of scope.

<!-- No `## Behavior changes` section: with the toggle off (the default) the spawner is byte-identical to before. Pinned by an explicit echo-OFF test that asserts no console.debug calls fire and the existing `stderrTail` + on-failure `Forge spawn stderr:` dump are unchanged. -->
