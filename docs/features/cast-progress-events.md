# Cast Progress Events

> `dev/done-009` — 2026-05-13 — Ships the `in-progress` and `done` cast lifecycle events via Claude Code hook scripts materialised on plugin load, completing the four-stage log schema laid down by `cast-log-foundation`.

## What it does

Every cast now produces lifecycle events from both sides of the subprocess boundary. The plugin still writes `casted` before spawning and `error` on failure; Claude Code itself writes `in-progress` the moment the model starts working and `done` when the turn ends. A successful cast lands three lines in `<vault>/<plugin-dir>/cast-log-local.jsonl`: `casted` → `in-progress` → `done`. A failed one lands two or three, depending on how far Claude got before exiting.

The `done` line carries an `affectedFiles` array — the deduplicated list of vault paths the cast wrote via `Write`, `Edit`, `MultiEdit`, or `NotebookEdit`. Paths captured through Obsidian MCP tools are not in this list yet (known gap, see Scope).

The mechanism is platform hooks, not model-honoured instructions. On every plugin load, Grimoire writes three POSIX shell scripts (`session-start.sh`, `post-tool-use.sh`, `stop.sh`) into `<plugin-dir>/hooks/` and a `settings.json` next to `data.json` pointing at them. Every cast spawn now passes `--settings <abs-path>` so Claude Code merges the hooks block into the user's resolved settings and fires the scripts at the matching lifecycle stages. The scripts read `$CAST_ID` from the subprocess env (already exported by `cast-log-foundation`) and append directly to the JSONL log, independent of the plugin process.

## Design decisions

- **Hooks over wrapper directives.** The previous plan had the meta-spell tell the model to write a `## Progress Tracking` section. That made progress tracking a contract the model could forget. Hooks are a platform guarantee — they fire whether or not the model cooperates.
- **Materialise on every load, unconditionally.** Four small writes; no diff check, no version field. Plugin upgrades automatically ship the latest hook content.
- **Bake absolute paths at materialisation time.** Each script has the log path and scratch directory hardcoded by the renderer. No env-resolution gymnastics inside the shell; reload picks up any path change.
- **`python3` as the in-shell JSON parser.** Broadly available on macOS/Linux desktops. Compared to `jq` (often missing) and pure-`sed` (fragile), this is the best blend of availability and correctness. If absent, that tool call's path is silently dropped — graceful degradation rather than a failed cast.
- **`--settings` is always emitted, even with an empty value.** Lets Claude Code fall back to user settings cleanly when materialisation failed; keeps the runner contract uniform.
- **`HookMaterializer` and `ScratchSweeper` are separate classes.** Each owns one responsibility — file production and stale-scratch cleanup — and is testable in isolation through injected ports, mirroring `CastLogStore`.
- **Scratch files for `affectedFiles`, swept at 24 h.** Each `PostToolUse` invocation appends one path to `<plugin-dir>/cast-log-scratch/<castId>.paths`; `stop.sh` drains-and-dedupes the file into one `done` line and deletes it. Orphaned scratch files (killed casts) age out on the next plugin load. The 24 h TTL is large enough that no live cast can ever qualify for deletion.
- **`castSettingsPath` is required, not optional**, on the dispatcher, imprinter, and runner deps. Same drift-prevention rationale `cast-log-foundation` applied to `castId`.

## Scope

**In:**

- `HookMaterializer` writes three `.sh` scripts (mode `0o755`) plus `settings.json` on every `onload`.
- Four pure renderer functions (`renderSessionStartScript`, `renderPostToolUseScript`, `renderStopScript`, `renderSettingsJson`) with absolute paths substituted literally.
- `--settings <abs-path>` appended to every cast spawn (live cast and forge) via `buildCastArgs`.
- `ScratchSweeper` runs fire-and-forget on `onload`, deleting `<plugin-dir>/cast-log-scratch/*.paths` files older than 24 h.
- `PostToolUse` matches the built-in file-writing tools (`Write|Edit|MultiEdit|NotebookEdit`).
- `done` line carries deduplicated `affectedFiles` (empty array when no matching tool calls occurred).
- The meta-spell no longer instructs forged spells to include a `## Progress Tracking` section; the directive is now redundant.
- POSIX shell integration tests that run the scripts under real `/bin/sh` against a temp directory.

**Out:**

- **MCP-tool capture in `affectedFiles`** — the `Write|Edit|MultiEdit|NotebookEdit` matcher does not catch `mcp__obsidian-*` writes, and the forge wrapper prefers Obsidian MCP. Forge `done` lines often surface empty arrays today. Deferred pending empirical verification of how Claude Code names MCP tools in hook payloads.
- **PowerShell variant** — desktop-Windows users will not get hooks until a parallel script set ships. Deferred to the first Windows user.
- **Streaming progress events between `in-progress` and `done`** — premature; no consumer.
- **`summary` field on `done`** — explicitly dropped from the schema.
- **Migration of pre-existing in-vault spells** — the old `## Progress Tracking` directive is harmless once hooks do the work; no rewrite pass.
- **Detection of hook-script tampering** — every load overwrites; no checksum.
- **`PreToolUse` capture** — only successful tool calls land in `affectedFiles`.
- **Cast Log reader / UI** — still the next downstream pitch; this iteration only writes events.

## Relationship to existing system

- **Completes `cast-log-foundation`** — the discriminated-union schema (`casted` / `error` / `in-progress` / `done`) defined in 008 now has all four stages emitted. The `CAST_ID` env var threaded through `CastRunner` in 008 is the join key the hook scripts read.
- **Extends `forge-cast` and `live-spells-and-casting`** transparently — both dispatch paths now thread `castSettingsPath` through `CastRunner` and `buildCastArgs`, but their guards, toasts, and UX are unchanged. Live-cast and forge subprocess args now include `--settings <abs-path>` after the existing args.
- **Touches `buildMetaSpell`** — the `## Progress Tracking` mention is removed from the wrapper-instructions bullet given to Claude. `## Execution Mode` and `## MCP Tools` are unchanged.
- **Adds a new on-disk surface** under `<plugin-dir>/`: `hooks/` (scripts), `settings.json`, and `cast-log-scratch/` (transient per-cast files).

## Behavior changes

- **Successful cast logging:** previously wrote one `casted` line and nothing else on success. Now writes three lines (`casted` → `in-progress` → `done` with `affectedFiles`). Reason: complete lifecycle visibility was the original schema's goal.
- **Failed cast logging:** previously wrote `casted` then `error`. Now writes `casted` → optionally `in-progress` → `error`, depending on whether Claude Code reached `SessionStart` before failing. Reason: same.
- **Subprocess spawn args:** previously ended at `--add-dir <vaultMountPath>`. Now also includes `--settings <abs-path-to-settings.json>` for every cast. Reason: required to inject the hook commands into Claude Code's settings tree.
- **Forged spells:** the meta-prompt no longer instructs Claude to add a `## Progress Tracking` section to new spells. Reason: hooks supersede the model-honoured directive.
- **Plugin `onload` side effects:** previously only constructed in-memory state. Now also writes four files into `<plugin-dir>/` and sweeps stale scratch files. Failures are logged and the plugin still loads; hooks are observability, not load-bearing.
