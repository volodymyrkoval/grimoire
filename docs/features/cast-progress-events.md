# Cast Progress Events

> `dev/done-009` — 2026-05-13 — Ships the `in-progress` and `done` cast lifecycle events via Claude Code hook scripts materialised on plugin load, completing the four-stage log schema laid down by `cast-log-foundation`.

## What it does

Every cast now produces lifecycle events from both sides of the subprocess boundary. The plugin still writes `casted` before spawning and `error` on failure; Claude Code itself writes `in-progress` the moment the model starts working and `done` when the turn ends. Events are split across two files by writer: Obsidian writes `casted` and `error` to `cast-log-plugin.jsonl`; Claude Code hook scripts write `in-progress` and `done` to `cast-log-agent.jsonl`. A successful cast therefore lands `casted` in the local log and `in-progress` → `done` in the remote log. This split prevents sync conflicts when the vault is synchronised across machines.

The `done` line carries an `affectedFiles` array — the deduplicated list of vault paths the cast wrote via `Write`, `Edit`, `MultiEdit`, or `NotebookEdit`. Paths captured through Obsidian MCP tools are not in this list yet (known gap, see Scope).

The mechanism is platform hooks, not model-honoured instructions. On every plugin load, Grimoire writes three POSIX shell scripts (`session-start.sh`, `post-tool-use.sh`, `stop.sh`) into `<vault>/.obsidian/plugins/grimoire/agent-hooks/`. Users wire these into Claude Code once by adding `sh .obsidian/plugins/grimoire/agent-hooks/<script>.sh` entries to their vault's `.claude/settings.local.json`; scripts are invoked via `sh` rather than directly, so no execute permission is required. For portal casts the same directory is used: `CLAUDE_HOOKS_DIR` points the portal's Claude Code instance at it. The scripts read `$CAST_ID` from the subprocess env (already exported by `cast-log-foundation`) and append directly to `cast-log-agent.jsonl`, independent of the plugin process.

## Design decisions

- **Hooks over wrapper directives.** The previous plan had the meta-spell tell the model to write a `## Progress Tracking` section. That made progress tracking a contract the model could forget. Hooks are a platform guarantee — they fire whether or not the model cooperates.
- **Manual `settings.local.json` wiring instead of a plugin-managed `settings.json`.** The original design wrote a `settings.json` next to `data.json` and passed `--settings <abs-path>` on every cast spawn. That doesn't compose: Claude Code's `--settings` flag fully replaces user settings rather than merging, so injecting hooks this way silently dropped the user's own permissions and tool config. Generating scripts at a known relative path and asking the user to reference them once from their existing `.claude/settings.local.json` is the only way Claude Code's settings layer cooperates.
- **Materialise on every load, unconditionally.** Three small writes; no diff check, no version field. Plugin upgrades automatically ship the latest hook content.
- **Bake absolute paths at materialisation time.** Each script has the log path and scratch directory hardcoded by the renderer. No env-resolution gymnastics inside the shell; reload picks up any path change.
- **`python3` as the in-shell JSON parser.** Broadly available on macOS/Linux desktops. Compared to `jq` (often missing) and pure-`sed` (fragile), this is the best blend of availability and correctness. If absent, that tool call's path is silently dropped — graceful degradation rather than a failed cast.
- **`HookMaterializer` and `ScratchSweeper` are separate classes.** Each owns one responsibility — file production and stale-scratch cleanup — and is testable in isolation through injected ports, mirroring `CastLogStore`.
- **Scratch files for `affectedFiles`, swept at 24 h.** Each `PostToolUse` invocation appends one path to `<plugin-dir>/cast-log-scratch/<castId>.paths`; `stop.sh` drains-and-dedupes the file into one `done` line and deletes it. Orphaned scratch files (killed casts) age out on the next plugin load. The 24 h TTL is large enough that no live cast can ever qualify for deletion.

## Scope

**In:**

- `HookMaterializer` writes three `.sh` scripts into `<plugin-dir>/agent-hooks/` on every `onload`.
- Three pure renderer functions (`renderSessionStartScript`, `renderPostToolUseScript`, `renderStopScript`) with absolute paths substituted literally.
- `ScratchSweeper` runs fire-and-forget on `onload`, deleting `<plugin-dir>/cast-log-scratch/*.paths` files older than 24 h.
- `PostToolUse` matches the built-in file-writing tools (`Write|Edit|MultiEdit|NotebookEdit`).
- `done` line carries deduplicated `affectedFiles` (empty array when no matching tool calls occurred).
- The meta-spell no longer instructs forged spells to include a `## Progress Tracking` section; the directive is now redundant.
- POSIX shell integration tests that run the scripts under real `/bin/sh` against a temp directory.

**Out:**

- **Settings-file hook injection** — explored and rejected after `--settings` was found to replace rather than merge user settings (see Design decisions). `CLAUDE_HOOKS_DIR` injected at spawn time is the durable alternative.
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
- **Leaves `forge-cast` and `live-spells-and-casting` spawn args unchanged.** Both dispatch paths still build the same `claude` command they did before this iteration; no `--settings` flag is appended. The hook integration happens entirely outside the spawn contract, in the user's own Claude Code settings file.
- **Touches `buildMetaSpell`** — the `## Progress Tracking` mention is removed from the wrapper-instructions bullet given to Claude. `## Execution Mode` and `## MCP Tools` are unchanged.
- **Adds new on-disk surfaces** under `<plugin-dir>/`: `agent-hooks/` (scripts) and `cast-log-scratch/` (transient per-cast files). Both are gitignored.

## Behavior changes

- **Successful cast logging:** previously wrote one `casted` line and nothing else on success. Now writes `casted` to `cast-log-plugin.jsonl` and `in-progress` → `done` (with `affectedFiles`) to `cast-log-agent.jsonl`. Reason: complete lifecycle visibility was the original schema's goal; file split prevents sync conflicts.
- **Failed cast logging:** previously wrote `casted` then `error` to the plugin log. Now writes `casted` and `error` to the plugin log → optionally `in-progress` to the agent log, depending on whether Claude Code reached `SessionStart` before failing.
- **Forged spells:** the meta-prompt no longer instructs Claude to add a `## Progress Tracking` section to new spells. Reason: hooks supersede the model-honoured directive.
- **Plugin `onload` side effects:** previously only constructed in-memory state. Now also writes three script files into `<plugin-dir>/agent-hooks/` and sweeps stale scratch files. Failures are logged and the plugin still loads; hooks are observability, not load-bearing.
- **Required user setup:** add three hook entries to the vault's `.claude/settings.local.json`, invoking each script via `sh` (no execute permission required). Without this, `in-progress` and `done` events are never written.
