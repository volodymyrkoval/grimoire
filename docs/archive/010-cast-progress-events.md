# 010 — Cast Progress Events

> Materialise three POSIX shell hooks + a `settings.json` on `onload`, thread `--settings` through cast launch so Claude Code fires those hooks against `cast-log-local.jsonl`, capture `affectedFiles` per cast via a scratch file, and sweep stale scratch files on load.

## Goal & scope

`cast-log-foundation` (009) already writes `casted` (on dispatch) and `error` (on subprocess failure). The two remaining lifecycle stages — `in-progress` and `done` — must come from **inside the running cast**, because only Claude Code knows when the model actually started working and when the turn ended. The pitch's central move is to put those writes in **Claude Code hook scripts** rather than in a brittle wrapper-embedded directive: hooks are platform guarantees, not a model-honoured contract.

This plan ships the hook infrastructure end-to-end: file materialisation, settings injection at spawn, scratch-file lifecycle for `affectedFiles`, and a startup sweep for orphaned scratch files. After this iteration, a successful cast produces three log lines (`casted` → `in-progress` → `done` with `affectedFiles`), and a failed cast produces either (`casted` → `error`) or (`casted` → `in-progress` → `error`) depending on how far Claude Code got.

### In scope

- A `HookMaterializer` class that on `onload` unconditionally writes four files into `<vault>/<plugin-dir>/`:
  - `hooks/session-start.sh` — POSIX `sh`; reads `$CAST_ID` from env; appends an `in-progress` JSON line.
  - `hooks/post-tool-use.sh` — POSIX `sh`; reads `$CAST_ID` from env; reads tool-call JSON on stdin; appends a path to a per-cast scratch file.
  - `hooks/stop.sh` — POSIX `sh`; reads `$CAST_ID` from env; drains the scratch file, dedups it, appends a `done` JSON line, deletes the scratch.
  - `settings.json` — Claude Code settings file with a `hooks` block pointing at the three absolute paths.
- A new `--settings <abs-path>` argument added to the cast spawn (both live cast and forge), pointing at the materialised `settings.json`.
- The absolute path of `cast-log-local.jsonl` baked into the three hook scripts at materialisation time.
- An `onload` sweep that deletes scratch files older than 24 h from `<plugin-dir>/cast-log-scratch/`.
- The plugin holds `castSettingsPath` (absolute path to the materialised `settings.json`) on its instance so the dispatcher's settings closure can pick it up.
- POSIX shell **integration tests** that invoke the three scripts via `child_process.spawnSync('sh', …)` against a temp dir and assert on the resulting log lines and scratch files.
- Unit tests at every TS seam: materialiser content, spawn-arg threading, scratch sweep.

### Out of scope (from the pitch's No-gos, plus deferred items)

- **No Cast Log reader / parser / UI** — still downstream.
- **No PowerShell variant** — desktop-Windows users are flagged as a known gap; deferred to first Windows user.
- **No streaming progress events** between `in-progress` and `done`.
- **No `summary` field** on `done` — explicitly dropped from the schema.
- **No alternate transports** — pure shell, pure file.
- **No path normalisation** of `affectedFiles` — naive string-equality dedup only.
- **No migration of existing in-vault spells** — the wrapper's Progress Tracking section is removed for *new* forges; pre-existing spells with the old placeholder text keep working unchanged because hooks make the directive irrelevant.
- **No hybrid fallback** for `--settings` injection — accept additive merge as a hard dependency.
- **No detection of hook-script tampering** — every load overwrites.
- **No `PreToolUse` capture** — only successful tool calls land in `affectedFiles`.
- **No `summary` field clean-up in the type definitions** — the union already lacks `summary` after 009; nothing to remove.
- **No `Settings` field for `castSettingsPath`** — it's a materialisation product, not user-managed config; stored as a plugin-instance field, not in `data.json`.

### Acceptance criteria

- Every `onload` writes the four files (three hook scripts + `settings.json`) into `<plugin-dir>/hooks/` (scripts) and `<plugin-dir>/` (settings), overwriting any prior content. Scripts are mode `0o755`.
- The hook scripts' shebang is `#!/bin/sh`; they exit 0 silently when `$CAST_ID` is unset.
- The `settings.json` has the shape `{ "hooks": { "SessionStart": […], "PostToolUse": […], "Stop": […] } }`, with absolute paths to the three scripts.
- Every spawn (live cast and forge) passes `--settings <abs-path-to-settings.json>` as an arg to the Claude Code binary.
- An end-to-end shell test simulating `SessionStart` writes one `{"stage":"in-progress","ts":…,"castId":…}` line to the target log.
- An end-to-end shell test simulating `PostToolUse` × N writes nothing to the log and appends N path lines to a scratch file named `<castId>.paths` in `<plugin-dir>/cast-log-scratch/`.
- An end-to-end shell test simulating `Stop` after several `PostToolUse` calls writes one `{"stage":"done","ts":…,"castId":…,"affectedFiles":[…]}` line with deduplicated paths, then deletes the scratch file.
- A `Stop` with no prior `PostToolUse` writes `affectedFiles: []`.
- The scratch sweep deletes `<plugin-dir>/cast-log-scratch/<castId>.paths` files with `mtime` older than 24 h; younger files survive.
- The dispatcher and imprinter pass the materialised `settings.json` path through to the runner unchanged.

### Edge cases (resolved up front — no `AskUserQuestion` needed)

The pitch's "Rabbit holes" section already names the relevant boundary conditions; we encode each as a concrete decision below. No deferred items.

- **Empty `$CAST_ID`**: gate at top of every script: `[ -z "$CAST_ID" ] && exit 0`. Sessions outside Grimoire are silent no-ops.
- **Pathological vault paths in `PostToolUse` stdin** (apostrophes, spaces, unicode): the script reads stdin with `cat` into a variable; path extraction uses POSIX-safe parsing (a tiny `sed`/`awk` extracting the `tool_input.file_path` value from the JSON). Decision: **use Python via `python3 -c` for one-shot JSON parsing.** macOS and most Linux desktops ship `python3` by default; if absent, the script falls back to a `sed` extractor that handles the common case (Claude Code emits compact JSON without embedded quotes in `file_path`). Materialisation tests assert both branches compile to valid shell.
  - **Revised after Context7 check** (see Technical notes #2): Claude Code's `PostToolUse` payload is documented as `{"tool_name": "...", "tool_input": {"file_path": "..."}, "tool_response": {...}}`. The `file_path` value is JSON-string-escaped; we extract it through `jq` if available else through a `python3 -c` one-liner else through a `sed`/`grep` fallback that handles the simple-string case. **Final decision: prefer `python3` (broad availability on macOS/Linux), document the dependency in the plugin README as a follow-up.**
- **No `python3`/`jq` available**: the script writes a single warning to stderr (visible in Claude Code's own log, not in our JSONL) and skips this tool-call's contribution to `affectedFiles`. The cast still completes; the `done` line just has a possibly-shorter list. Acceptable degradation.
- **`PostToolUse` matcher selectivity**: settings.json filters by `Write|Edit|MultiEdit|NotebookEdit` — Claude Code's built-in file-writing tools per the docs. MCP-tool capture (`mcp__obsidian-*`) flagged as Rabbit hole; deferred per the pitch.
- **Stop fires with no prior PostToolUse for that cast**: scratch file does not exist; the `done` writer treats this as `affectedFiles: []`. Implemented as `[ -f "$SCRATCH" ] && SORTED=$(sort -u "$SCRATCH") || SORTED=`.
- **Concurrent casts** (two casts running at once, distinct `castId`s): each has its own scratch file; appends to the JSONL are atomic at kernel level (foundation pitch's invariant); no shared state.
- **Plugin reload mid-cast**: the running cast still has `--settings` pointing at the materialised file; the file path is stable across reloads since it lives in `<plugin-dir>/`. Worst case the next load overwrites the contents — but the in-flight cast already has the file resolved via Claude Code's read at session start. Accepted.
- **Settings merge replaces-rather-than-merges in some Claude Code config combinations**: out-of-scope mitigation (per pitch); we accept additive-merge as a hard precondition. If field reports surface a problem, the resolution is a separate pitch ("paste hooks into your own settings") — not in this plan.
- **`vaultMountPath === ''`**: `--settings` arg uses the **plugin-dir absolute path**, not vault-mount-path; unaffected.
- **`plugin.manifest.dir` is undefined** (degenerate Obsidian state): fall back to `${this.app.vault.configDir}/plugins/grimoire`, matching how 009 handles `pluginDir` in `CastLogStore`.
- **Stale scratch files from killed casts**: swept on `onload` if mtime > 24 h. Younger ones may belong to live casts and must survive.
- **`fs.writeFile` rejects during materialisation** (EACCES, disk full): logged via `console.error`; plugin load continues. The cast will still spawn (without hooks); `casted` and `error` continue to be written. Hooks degrade gracefully — they do not block the plugin.
- **Sweep races with a live cast that just created a scratch file**: 24 h threshold ensures live scratch files never qualify; this is the cheap and idempotent design the pitch calls out.

## Proposed solution

### High-level shape

```
                ┌──────────────────────────────────────────────────────────┐
                │ main.ts.onload                                            │
                │  ┌───────────────────────────────────────────────────┐   │
                │  │ 1. await initCore()                                │   │
                │  │ 2. castLogStore = new CastLogStore({...})          │   │
                │  │ 3. castSettingsPath = await materialiser.run()     │   │
                │  │ 4. await scratchSweeper.sweep()                    │   │
                │  └───────────────────────────────────────────────────┘   │
                │                       │                                   │
                │                       ▼                                   │
                │       writes: <plugin-dir>/hooks/{session-start,           │
                │                                   post-tool-use,           │
                │                                   stop}.sh                 │
                │                <plugin-dir>/settings.json                  │
                │                                                            │
                │       this.castSettingsPath = <abs-path to settings.json>  │
                └──────────────────────────────────────────────────────────┘
                                       │
                                       ▼
                          createDispatcher / imprinter wiring
                                       │
                                       ▼
                              CastDispatcher.dispatch       ForgeImprinter.imprint
                                       │                            │
                                       └──── runner.run({ …, castSettingsPath })
                                                       │
                                                       ▼
                                      CastSpawner.run with args
                                      [..., "--settings", castSettingsPath]
                                                       │
                                                       ▼
                                          Claude Code reads settings.json,
                                          fires SessionStart / PostToolUse / Stop
                                                       │
                                                       ▼
                                          Hook scripts append directly to
                                          <plugin-dir>/cast-log-local.jsonl
                                          (independent of plugin process)
```

### Components

| Component | Location | Responsibility |
|---|---|---|
| `HookMaterializer` | `src/castLog/HookMaterializer.ts` (new) | On `run()`, write the three hook scripts and `settings.json` into the plugin data dir. Returns the absolute path of `settings.json`. Idempotent and unconditional — every load overwrites. |
| `renderSessionStartScript` | `src/castLog/hookScripts.ts` (new) | Pure function: `(logPath: string) => string` — returns the POSIX shell content for `session-start.sh`. |
| `renderPostToolUseScript` | `src/castLog/hookScripts.ts` (new) | Pure function: `(scratchDir: string) => string` — returns the POSIX shell content for `post-tool-use.sh`. |
| `renderStopScript` | `src/castLog/hookScripts.ts` (new) | Pure function: `(logPath: string, scratchDir: string) => string` — returns the POSIX shell content for `stop.sh`. |
| `renderSettingsJson` | `src/castLog/hookScripts.ts` (new) | Pure function: `(scriptPaths: { sessionStart: string; postToolUse: string; stop: string }) => string` — returns the JSON content for `settings.json`. |
| `ScratchSweeper` | `src/castLog/ScratchSweeper.ts` (new) | On `sweep()`, list `<plugin-dir>/cast-log-scratch/*.paths` and delete files with `mtime > 24h`. Logs and continues on per-file failures. |
| `CastDispatcher` (modified) | `src/cast/CastDispatcher.ts` | Constructor gains `castSettingsPath: string` in deps; threaded into `runner.run({ …, castSettingsPath })`. |
| `ForgeImprinter` (modified) | `src/forge/ForgeImprinter.ts` | Same surface change: `castSettingsPath: string` in deps; threaded into the runner call. |
| `CastRunner` (modified) | `src/cast/CastRunner.ts` | `BaseCastRunInput` gains `castSettingsPath: string`; passed through to `buildCastArgs`. |
| `buildCastArgs` (modified) | `src/cast/buildCastArgs.ts` | Accepts `castSettingsPath` and appends `--settings <path>` to the arg list. |
| `GrimoirePlugin.onload` (modified) | `src/main.ts` | Constructs `HookMaterializer`, runs it, captures the returned settings path on the instance, runs `ScratchSweeper.sweep()` (fire-and-forget); passes the captured path into both dispatcher and imprinter. |

### Interfaces

```ts
// src/castLog/HookMaterializer.ts
export interface HookMaterializerPorts {
  /** Absolute path of <vault>/<plugin-dir>/. */
  getPluginDirAbs: () => string;
  /** Absolute path of cast-log-local.jsonl (baked into hooks). */
  getLogPathAbs: () => string;
  /** Default fs.promises.writeFile + chmod; injectable for tests. */
  writeFile?: (filePath: string, content: string, mode?: number) => Promise<void>;
  /** Default fs.promises.mkdir(..., { recursive: true }); injectable for tests. */
  mkdir?: (dir: string) => Promise<void>;
}

export class HookMaterializer {
  constructor(ports: HookMaterializerPorts);
  /** Returns the absolute path of the written settings.json. */
  run(): Promise<string>;
}
```

```ts
// src/castLog/hookScripts.ts — pure renderers, no I/O
export function renderSessionStartScript(args: { logPathAbs: string }): string;
export function renderPostToolUseScript(args: { scratchDirAbs: string }): string;
export function renderStopScript(args: { logPathAbs: string; scratchDirAbs: string }): string;
export function renderSettingsJson(args: {
  sessionStartScriptAbs: string;
  postToolUseScriptAbs: string;
  stopScriptAbs: string;
}): string;
```

```ts
// src/castLog/ScratchSweeper.ts
export interface ScratchSweeperPorts {
  getScratchDirAbs: () => string;
  readdir?: (dir: string) => Promise<string[]>;
  stat?: (filePath: string) => Promise<{ mtimeMs: number }>;
  unlink?: (filePath: string) => Promise<void>;
  now?: () => number; // Date.now()
  /** Default 24h; injectable for tests. */
  ttlMs?: number;
}

export class ScratchSweeper {
  constructor(ports: ScratchSweeperPorts);
  sweep(): Promise<void>;
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
  castId: string;
  castSettingsPath: string;  // NEW — absolute path
}
```

```ts
// src/cast/buildCastArgs.ts — modified
interface BaseCastArgsInput {
  modelId: string;
  effort: Effort | null;
  vaultMountPath: string;
  castSettingsPath: string;  // NEW
}
// Appends "--settings", castSettingsPath if non-empty.
```

```ts
// src/cast/CastDispatcher.ts — modified
export interface CastDispatcherDeps {
  notify: (msg: string) => void;
  close: () => void;
  castRunner?: CastRunner;
  spawner?: SpawnFn;
  castLogStore: CastLogStore;
  generateId?: () => string;
  castSettingsPath: string;   // NEW — required; supplied by main.ts
}
```

```ts
// src/forge/ForgeImprinter.ts — modified
export interface ForgeImprinterDeps {
  notify: (msg: string) => void;
  castRunner: CastRunner;
  castLogStore: CastLogStore;
  generateId?: () => string;
  castSettingsPath: string;   // NEW — required; supplied by main.ts
}
```

### Hook-script contracts (POSIX shell)

The three scripts share an identical preamble:

```sh
#!/bin/sh
# Auto-generated by Grimoire HookMaterializer. Do not edit — overwritten on every plugin load.
set -e
[ -z "$CAST_ID" ] && exit 0
```

**`session-start.sh`** (writes one line, no stdin parsing):

```sh
#!/bin/sh
set -e
[ -z "$CAST_ID" ] && exit 0
TS=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
LOG="<LOG_PATH_ABS>"
printf '{"stage":"in-progress","ts":"%s","castId":"%s"}\n' "$TS" "$CAST_ID" >> "$LOG"
```

**`post-tool-use.sh`** (parses stdin JSON, appends path to scratch file):

```sh
#!/bin/sh
set -e
[ -z "$CAST_ID" ] && exit 0
SCRATCH_DIR="<SCRATCH_DIR_ABS>"
mkdir -p "$SCRATCH_DIR"
SCRATCH="$SCRATCH_DIR/$CAST_ID.paths"
# Extract tool_input.file_path from stdin JSON.
# Try python3 first (broadly available on macOS/Linux desktop).
FILE_PATH=$(python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("tool_input",{}).get("file_path",""))' 2>/dev/null || true)
if [ -n "$FILE_PATH" ]; then
  printf '%s\n' "$FILE_PATH" >> "$SCRATCH"
fi
exit 0
```

**`stop.sh`** (drains scratch into a `done` line, then deletes scratch):

```sh
#!/bin/sh
set -e
[ -z "$CAST_ID" ] && exit 0
LOG="<LOG_PATH_ABS>"
SCRATCH_DIR="<SCRATCH_DIR_ABS>"
SCRATCH="$SCRATCH_DIR/$CAST_ID.paths"
TS=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
# Build JSON array of deduped paths, using python3 for JSON-safe escaping.
if [ -f "$SCRATCH" ]; then
  PATHS_JSON=$(sort -u "$SCRATCH" | python3 -c 'import sys,json; print(json.dumps([l.rstrip("\n") for l in sys.stdin if l.strip()]))' 2>/dev/null || echo "[]")
  rm -f "$SCRATCH"
else
  PATHS_JSON="[]"
fi
printf '{"stage":"done","ts":"%s","castId":"%s","affectedFiles":%s}\n' "$TS" "$CAST_ID" "$PATHS_JSON" >> "$LOG"
```

Notes on the contract:
- All angle-bracket placeholders are **literal substitutions** done by the renderer functions — no runtime interpolation; the resulting `.sh` files have absolute paths baked in.
- `date -u +"%Y-%m-%dT%H:%M:%S.000Z"` matches the JS `ISO-8601` shape we already write in `CastLogStore` (millisecond precision; we round to `.000` since POSIX `date` doesn't ship sub-second by default — acceptable since we only sort lexicographically).
- `printf` (not `echo`) avoids escape-interpretation drift between shells.
- `set -e` plus the early `exit 0` on missing `$CAST_ID` means accidental failures never crash Claude Code's hook executor — the `exit 0` short-circuit is the deliberate normal path for non-Grimoire sessions.

### `settings.json` shape

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "<ABS_PATH>/hooks/session-start.sh" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit|NotebookEdit",
        "hooks": [
          { "type": "command", "command": "<ABS_PATH>/hooks/post-tool-use.sh" }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "<ABS_PATH>/hooks/stop.sh" }
        ]
      }
    ]
  }
}
```

The JSON is rendered via `JSON.stringify(obj, null, 2)` for readability and stable diffs across reloads.

### Data flow

**`onload`:**
1. `await this.initCore()` — existing.
2. `this.castLogStore = new CastLogStore({...})` — existing.
3. `const materializer = new HookMaterializer({ getPluginDirAbs: …, getLogPathAbs: () => path.join(pluginDirAbs, 'cast-log-local.jsonl') })`.
4. `this.castSettingsPath = await materializer.run()` — writes the four files, returns abs path of `settings.json`.
5. `const sweeper = new ScratchSweeper({ getScratchDirAbs: () => path.join(pluginDirAbs, 'cast-log-scratch') }); sweeper.sweep().catch(console.error)` — fire-and-forget; non-blocking.
6. Construct `ForgeImprinter` and (lazily, via `createDispatcher`) `CastDispatcher`, passing `castSettingsPath: this.castSettingsPath`.

**Live cast:**
1. `dispatcher.dispatch` proceeds exactly as in 009 through `recordCasted` and `runner.run`.
2. `runner.run` now receives `castSettingsPath` in its input; `buildCastArgs` appends `--settings <path>`; spawn fires.
3. Claude Code reads the settings file, merges its `hooks` with the user's settings, fires `SessionStart` immediately (the hook writes `in-progress`), fires `PostToolUse` after each matching tool call (each appends one path to `<castId>.paths`), and fires `Stop` at turn end (drains the scratch into a `done` line).
4. On non-zero exit, `CastRunner.onCastExit` routes to `onFailure(msg)` → `recordError` + notify — unchanged from 009.

**Forge cast:** identical, with `FORGE_SPELL_PATH` sentinel on the `casted` line; `affectedFiles` on the `done` line will contain the path of the newly-forged spell (including any `-2`/`-3` collision suffix).

### Error handling

- **Materialisation fails** (EACCES on plugin-dir, disk full): `console.error`; `castSettingsPath` is left as the would-be path. The cast spawn will still pass `--settings <path>` to Claude Code, which will fail to read it and continue without hooks. The cast itself succeeds; only `in-progress`/`done` are missed. Plugin does not crash. (Pitch: hooks are observability, not load-bearing.)
- **Hook script writes fail mid-cast** (e.g. log file deleted): `printf >> "$LOG"` fails; `set -e` exits non-zero; Claude Code logs the hook failure to its own log. The cast itself is unaffected since hooks run in a side process. No plugin recovery needed.
- **Scratch sweep fails on a specific file**: per-file `try/catch`; log and continue.
- **`python3` missing in PostToolUse**: silent `|| true` falls through; that tool-call's path is dropped; the rest of the cast proceeds. Documented as a known limitation in Technical notes.
- **`python3` missing in Stop**: fallback to `PATHS_JSON="[]"`; the `done` line still writes, just with an empty array.

### Technical notes

#### Key design decisions

1. **Materialise on every load, unconditionally.** Cheap (≤4 small file writes), and guarantees plugin upgrades automatically ship the latest hook content. No version-tracking, no diffing.
2. **Hook payload contract — verified against Claude Code docs.** `SessionStart`, `Stop`: no useful stdin for our needs (we only need env). `PostToolUse`: stdin is JSON with `tool_name`, `tool_input` (object — for `Write`/`Edit`/`MultiEdit`/`NotebookEdit` it contains `file_path`), `tool_response`. The matcher string is a regex over `tool_name`. Source: Claude Code hooks reference. Fetched via Context7 at plan time — confirmed shape and event-name set as of the most recent Claude Code docs.
3. **Bake absolute paths at materialisation time, not at runtime.** The pitch's "the plugin instance knows the path on load" — we render path strings into the `.sh` files directly. Hooks then have no env-resolution gymnastics. Cost: any path change requires a plugin reload (acceptable; Obsidian reloads plugins on settings change anyway).
4. **`python3` as the JSON parser of choice in shell.** macOS ships `python3` in command-line tools by default since 2019; major desktop Linux distros ship it. Compared to `jq` (often not installed) and pure-`sed` (fragile), `python3 -c '…'` is the best blend of availability and correctness. The `2>/dev/null || true` fallback handles its absence with graceful degradation. This is called out in Technical notes #1 in the rejected-patterns list as well.
5. **`HookMaterializer` is a separate class, not a method on `GrimoirePlugin`.** Single responsibility: it owns the four files and nothing else. Tests can construct it with stubbed `writeFile`/`mkdir` ports and verify content + paths without booting the plugin.
6. **Pure renderer functions, not a templating engine.** Each script's content is generated by a function taking the absolute paths as args and returning a string. Tests assert on the output string directly; no templating library required.
7. **`ScratchSweeper` is also a separate class.** Lifecycle is "best-effort startup hygiene"; fire-and-forget. Single responsibility, single tested method.
8. **POSIX-shell integration tests run `sh` directly.** We invoke `child_process.spawnSync('sh', [scriptPath], { input: stdinJson, env: { CAST_ID, ... } })` against a temp dir built by the test, then read the resulting JSONL file and scratch dir to assert. This is the most honest test possible without a real Claude Code subprocess: it exercises the exact shell the plugin will ship. The tests live in `tests/castLog/hookScripts.integration.test.ts` (regular vitest, no special harness — just `child_process` and `fs`). Marked `.integration.test.ts` so they live in the unit `tests/` tree but are conceptually integration tests at the shell-script seam.
9. **`--settings <abs-path>` is the right Claude Code flag.** Confirmed via Context7: the CLI accepts `--settings <path-or-json>` and merges with the user's resolved settings hierarchy. Decision: pass the absolute path; the file is plugin-owned and stable.
10. **The wrapper note's "Progress Tracking" section is removed for new forges only.** `buildMetaSpell.ts` currently emits a `## Progress Tracking` section in the wrapper instructions to Claude. This plan removes the instructional sentence in `buildMetaSpell` that tells the model to include that section in the wrapper. Existing in-vault spells with the old text are unaffected — the model honouring the old directive does nothing harmful; hooks do the work regardless.
11. **`castSettingsPath` is required, not optional**, on the dispatcher/imprinter/runner deps — same rationale as `castId` in 009 (required prevents drift where some paths skip hooks).
12. **No `Settings` field for the path.** It's a derived runtime location, not user config. Lives on `GrimoirePlugin` as a private instance field, parallel to `castLogStore`.

#### Patterns considered (per design-patterns skill)

- **Template Method** for the three hook scripts (each has a "gate-then-do-thing" shape) — *rejected*: the shapes diverge enough (no-stdin-input vs stdin-parse vs scratch-drain) that the abstraction would obscure more than it clarifies. Three pure render functions sharing a preamble string constant is enough.
- **Strategy** for JSON-parsing in the shell (python3 vs jq vs sed) — *rejected*: the fallback chain is `python3 || true`; a strategy here would add code without enabling configurability the user wants.
- **Builder** for `settings.json` — *rejected*: it's a small static-shaped object; `renderSettingsJson` taking three path strings is sufficient. A builder would be ceremony at N=3.
- **Dependency Injection** at every side effect (`writeFile`, `mkdir`, `readdir`, `stat`, `unlink`, `now`) — **applied**. Mirrors `CastLogStore` from 009. Enables pure-function tests at every seam.
- **Repository** — implicit in `HookMaterializer` (write-only over four files) and `ScratchSweeper` (read-and-delete over the scratch dir). Naming follows the existing `CastLogStore` / `SpellOverrideStore` convention.
- **Single Responsibility Principle** — applied: `HookMaterializer` owns file production; `ScratchSweeper` owns scratch cleanup; renderers own content. Each has one reason to change.

#### Design-rubric self-critique (Section 7 questions)

- **Q1: Does any one class know more than it should?** No. `HookMaterializer` doesn't know what the scripts *do*; it asks renderers for content and writes bytes. The renderers don't know where the files land; they just return strings. The plugin doesn't know shell at all.
- **Q2: Is there a god object?** No. `GrimoirePlugin.onload` is the assembly point but each piece is independently testable.
- **Q3: Are dependencies one-directional?** Yes: `main.ts → HookMaterializer / ScratchSweeper`, both depend on `hookScripts` renderers; the dispatcher/imprinter only consume `castSettingsPath: string` — they don't know hooks exist.
- **Q4: Is there a place a change of contract would force a cascade?** Adding a new hook (e.g. `UserPromptSubmit`) requires (a) a new renderer fn, (b) a new entry in `renderSettingsJson`, (c) a new file write in `HookMaterializer`. That's the right cost for a new lifecycle stage.
- **Q5: Can each unit be tested in isolation?** Yes. Renderers are pure functions. `HookMaterializer` takes injected ports. `ScratchSweeper` takes injected ports. The shell-script integration tests use real `sh` against a temp dir but no plugin code.
- **Q6: Are there abstractions invented "for later"?** No. The Strategy/Template-Method/Builder candidates were all rejected for YAGNI above.
- **Q7: Are name spaces and module boundaries honest?** `src/castLog/` already exists from 009 for "all things cast-log-related"; the new files (`HookMaterializer`, `ScratchSweeper`, `hookScripts`) fit there. The hook scripts themselves aren't TS — they're runtime artefacts in `<plugin-dir>/hooks/`.

#### Dependencies

- `node:fs/promises` for `writeFile`, `chmod`, `mkdir`, `readdir`, `stat`, `unlink` — already available.
- `node:path` for `join` — already available.
- `node:child_process` for the shell-script integration tests (`spawnSync`) — already used elsewhere in the codebase.
- **No npm install required.**

#### Test stubbing

- `writeFile` / `mkdir` / `readdir` / `stat` / `unlink` → injected ports; tests use `vi.fn()`.
- `getPluginDirAbs` / `getLogPathAbs` / `getScratchDirAbs` → injected; tests pass a constant function.
- `now` (for sweeper) → injected; tests use `() => 1_000_000`.
- Shell integration tests: `child_process.spawnSync('sh', [scriptPath], …)` against `os.tmpdir()` build dir. Cleanup with `fs.rm(tempDir, { recursive: true, force: true })` in `afterEach`.
- No new `obsidian.ts` mock entries needed.

## Todos

### A. Pure shell-script renderers (`castLog/hookScripts.ts`)

#### Section briefing

**What this section produces:** A new file `src/castLog/hookScripts.ts` exporting four pure functions: `renderSessionStartScript`, `renderPostToolUseScript`, `renderStopScript`, `renderSettingsJson`. Each takes an args object of absolute paths and returns a string. No I/O, no module-level state. Tests live at `tests/castLog/hookScripts.test.ts`.

**Design context the executor needs upfront:** Copy from the "Hook-script contracts" subsection of Proposed solution — every script begins with the shared preamble (`#!/bin/sh`, `set -e`, `[ -z "$CAST_ID" ] && exit 0`). Each absolute path is substituted *literally* into the script text — no env-resolution at runtime. The `settings.json` matcher for `PostToolUse` is the literal regex `Write|Edit|MultiEdit|NotebookEdit`. JSON content is `JSON.stringify(obj, null, 2)`. Key design decision #3: paths baked at materialisation. Key design decision #6: renderers are pure.

**Cross-section couplings:**
- B (HookMaterializer) calls A1–A4 to produce file content. A's output is B's input.
- D (integration tests) execute the rendered scripts via `sh` directly; D depends on A1–A3 producing scripts whose content actually runs.
- None of A's todos depend on each other except A4 references the same path strings A1–A3 use; ordering inside the group is irrelevant.

**Section-level Red criterion:** `tests/castLog/hookScripts.test.ts` proves: (1) each render fn returns a string starting with `#!/bin/sh\n`; (2) each contains the gate `[ -z "$CAST_ID" ] && exit 0` on a line before any other operation; (3) each contains the supplied absolute path(s) literally; (4) `renderPostToolUseScript` contains `mkdir -p` and `>> "$SCRATCH"`; (5) `renderStopScript` contains `sort -u`, `rm -f`, and writes a `"stage":"done"` JSON; (6) `renderSettingsJson` parses as JSON and has the shape `{ hooks: { SessionStart: [{hooks:[{type:'command',command:<path>}]}], PostToolUse: [{matcher:'Write|Edit|MultiEdit|NotebookEdit', hooks:[…]}], Stop: [{hooks:[…]}] } }`.

**junior-dev**
- [x] A1: Write failing test in `tests/castLog/hookScripts.test.ts`: `renderSessionStartScript({ logPathAbs: '/abs/log.jsonl' })` returns a string starting with `'#!/bin/sh\n'`, contains `'[ -z "$CAST_ID" ] && exit 0'`, contains `'/abs/log.jsonl'`, contains `'"stage":"in-progress"'`, and contains a `printf` ending with `>> "$LOG"`. — S, junior-dev
- [x] A2: Implement `renderSessionStartScript` to make A1 green. Body matches the "session-start.sh" sample in Hook-script contracts, with `<LOG_PATH_ABS>` literally substituted. — S, junior-dev
- [x] A3: Write failing test: `renderPostToolUseScript({ scratchDirAbs: '/abs/scratch' })` returns a string containing `'/abs/scratch'`, contains `'mkdir -p "$SCRATCH_DIR"'`, contains `'python3 -c'`, contains `'tool_input'` and `'file_path'`, and ends with `'exit 0\n'`. — S, junior-dev
- [x] A4: Implement `renderPostToolUseScript` to make A3 green. — S, junior-dev
- [x] A5: Write failing test: `renderStopScript({ logPathAbs: '/abs/log.jsonl', scratchDirAbs: '/abs/scratch' })` returns a string containing both paths literally, contains `'sort -u'`, contains `'rm -f'`, contains `'"stage":"done"'`, and contains `'"affectedFiles":%s'` in the `printf` template. — S, junior-dev
- [x] A6: Implement `renderStopScript` to make A5 green. — S, junior-dev
- [x] A7: Write failing test: `renderSettingsJson({ sessionStartScriptAbs: '/a/ss.sh', postToolUseScriptAbs: '/a/pt.sh', stopScriptAbs: '/a/st.sh' })` returns a string; `JSON.parse(result)` equals the literal shape `{ hooks: { SessionStart: [{hooks:[{type:'command',command:'/a/ss.sh'}]}], PostToolUse: [{matcher:'Write|Edit|MultiEdit|NotebookEdit', hooks:[{type:'command',command:'/a/pt.sh'}]}], Stop: [{hooks:[{type:'command',command:'/a/st.sh'}]}] } }`. — S, junior-dev
- [x] A8: Implement `renderSettingsJson` to make A7 green. Use `JSON.stringify(obj, null, 2)` for readability. — S, junior-dev
- [x] A9: Edge-case test: paths with spaces/apostrophes in `renderSessionStartScript({ logPathAbs: "/abs path/with 'quote.jsonl" })` — the path is literally substituted; the resulting script's `LOG=` line is `LOG="/abs path/with 'quote.jsonl"`. (No escaping is applied — that's the contract; the plugin owns the data dir and the user does not control its path.) Add a one-line code comment near the substitution: `// Plugin-owned absolute paths; no shell-escaping applied by the renderer.` — S, junior-dev

### B. `HookMaterializer` (`castLog/HookMaterializer.ts`)

#### Section briefing

**What this section produces:** A new file `src/castLog/HookMaterializer.ts` exporting `HookMaterializer` and `HookMaterializerPorts`. The class has one public method, `run(): Promise<string>`, which writes four files into the plugin data dir and returns the absolute path of `settings.json`. Tests live at `tests/castLog/HookMaterializer.test.ts`.

**Design context the executor needs upfront (verbatim from Key design decisions):**
- Decision #1: "Materialise on every load, unconditionally." → `run()` always writes; no diff check.
- Decision #3: "Bake absolute paths at materialisation time." → use the injected `getPluginDirAbs` and `getLogPathAbs` to compute script and settings paths.
- Decision #5: "`HookMaterializer` is a separate class." → single responsibility: file production only.
- Layout:
  - Scripts go in `<pluginDir>/hooks/` (subdir must be created via `mkdir`).
  - Settings goes in `<pluginDir>/settings.json` (top-level alongside `data.json`).
  - Scratch dir at `<pluginDir>/cast-log-scratch/` is *not* created by `HookMaterializer` — it's created lazily by `post-tool-use.sh` via `mkdir -p`. (Avoids ping-pong of "who owns the dir".)
- Permissions: scripts chmodded to `0o755` (executable); settings.json default permissions (no chmod).

**Cross-section couplings:**
- B1–B6 depend on A (the four renderer functions exist).
- B is consumed by F (main.ts wiring).
- The returned settings-path string is the value E1 wires into `dispatcher` and `imprinter`.

**Section-level Red criterion:** `tests/castLog/HookMaterializer.test.ts` proves: (1) `run()` calls `mkdir(<pluginDir>/hooks)` exactly once; (2) calls `writeFile` four times — once for each of `hooks/session-start.sh`, `hooks/post-tool-use.sh`, `hooks/stop.sh`, `settings.json`, with the content from the matching renderer; (3) the three `.sh` files are written with mode `0o755`; (4) `run()` resolves to `<pluginDir>/settings.json`; (5) the `command` paths inside the settings JSON match the absolute paths of the three scripts; (6) when `writeFile` rejects, `run()` rejects (caller — main.ts — owns the swallow via fire-and-forget).

**junior-dev**
- [x] B1: Write failing test: construct `new HookMaterializer({ getPluginDirAbs: () => '/p', getLogPathAbs: () => '/p/cast-log-local.jsonl', writeFile: vi.fn().mockResolvedValue(undefined), mkdir: vi.fn().mockResolvedValue(undefined) })`. Call `await mat.run()`. Assert: `mkdir` called once with `'/p/hooks'`; `writeFile` called 4 times with paths `'/p/hooks/session-start.sh'`, `'/p/hooks/post-tool-use.sh'`, `'/p/hooks/stop.sh'`, `'/p/settings.json'`. — S, junior-dev
- [x] B2: Implement `HookMaterializer.run()` to make B1 green. Steps in order: `await mkdir(hooksDir)`; render and write the three scripts (mode `0o755`); render and write `settings.json`; return its absolute path. — S, junior-dev
- [x] B3: Write failing test: `run()` returns `'/p/settings.json'`. — S, junior-dev (verify after B2 — should already pass).
- [x] B4: Write failing test: the content passed to `writeFile` for `hooks/session-start.sh` matches `renderSessionStartScript({ logPathAbs: '/p/cast-log-local.jsonl' })` byte-for-byte. Similarly for the other two scripts and `renderSettingsJson`. — S, junior-dev
- [x] B5: Write failing test: the three `.sh` writes pass `mode: 0o755` as the third arg to `writeFile`. Implementation note: signature must be `writeFile(path, content, mode?)` so the port can ignore mode when undefined. — S, junior-dev
- [x] B6: Write failing test: `writeFile` rejecting on the first script causes `run()` to reject. (Verifies callers can decide to swallow; the materialiser itself doesn't.) — S, junior-dev
- [x] B7: Default `writeFile`/`mkdir` ports use `fs/promises.writeFile` (with `chmod` for mode) and `fs/promises.mkdir({ recursive: true })`. Add a test that constructs without ports and (via a `vi.spyOn(fsPromises, 'writeFile')`) verifies they're invoked. (If module-mock complexity is high, accept this as a manual check and add a code comment; mirror B8's pattern from 009.) — M, junior-dev
- [x] B8: Edge case: `getPluginDirAbs()` returning a path with a trailing slash (`'/p/'`) still produces `'/p/hooks/session-start.sh'` — i.e. use `path.join`, not string concatenation. Assert against `vi.fn` calls. — S, junior-dev

### C. `ScratchSweeper` (`castLog/ScratchSweeper.ts`)

#### Section briefing

**What this section produces:** A new file `src/castLog/ScratchSweeper.ts` exporting `ScratchSweeper` and `ScratchSweeperPorts`. One public method, `sweep(): Promise<void>`, lists the scratch dir, deletes files with `mtime` older than `ttlMs` (default 24 h), continues on per-file failures. Tests live at `tests/castLog/ScratchSweeper.test.ts`.

**Design context the executor needs upfront:**
- Decision #7: "best-effort startup hygiene; fire-and-forget"; main.ts wraps `sweep()` in `.catch(console.error)`.
- The TTL is **24 h** to ensure live scratch files (created seconds ago by an in-flight cast) never qualify for deletion.
- Behaviour on missing scratch dir: `readdir` returns ENOENT → return early, no error. (Scratch dir is created lazily by the `post-tool-use.sh` hook.)
- Per-file: `unlink` failure (EACCES, ENOENT race) → `console.error` and continue with the next file.

**Cross-section couplings:**
- C is consumed by F (main.ts wiring).
- C has no dependency on A/B; can be implemented in parallel.

**Section-level Red criterion:** `tests/castLog/ScratchSweeper.test.ts` proves: (1) given two files (`old.paths` mtime=0, `young.paths` mtime=now-1h), `sweep()` calls `unlink('old.paths')` exactly once and does **not** call `unlink('young.paths')`; (2) when `readdir` throws ENOENT, `sweep()` resolves without throwing and without calling `unlink`; (3) when `unlink` rejects on one file, the sweep continues to the next file; (4) `now()` defaults to `Date.now`; (5) `ttlMs` defaults to `24*60*60*1000`.

**junior-dev**
- [x] C1: Write failing test: `sweep()` with `readdir: () => Promise.resolve(['old.paths','young.paths'])`, `stat: f => f.includes('old') ? { mtimeMs: 0 } : { mtimeMs: 1_000_000 - 60*60*1000 }`, `now: () => 1_000_000`, `ttlMs: 24*60*60*1000` — `unlink` is called once with the `old.paths` absolute path; not called for `young.paths`. — S, junior-dev (11dd399)
- [x] C2: Implement `ScratchSweeper.sweep()` to make C1 green. — S, junior-dev (11dd399)
- [x] C3: Write failing test: `readdir` rejecting with `code: 'ENOENT'` causes `sweep()` to resolve without throwing and without calling `unlink`. — S, junior-dev (11dd399)
- [x] C4: Implement the ENOENT short-circuit in `sweep()`. — S, junior-dev (11dd399)
- [x] C5: Write failing test: `unlink` rejecting on the first file does not prevent the sweep from calling `unlink` on the second qualifying file. — S, junior-dev (11dd399)
- [x] C6: Implement per-file `try/catch` (with `console.error`) around `unlink`. — S, junior-dev (11dd399)
- [x] C7: Edge-case test: empty dir (`readdir → []`) — `sweep()` resolves without calling `stat` or `unlink`. — S, junior-dev (11dd399)
- [x] C8: Edge-case test: file at boundary (`mtimeMs === now - ttlMs` exactly) is **not** deleted; `mtimeMs === now - ttlMs - 1` is deleted. Document the comparison in the implementation (`now - mtimeMs > ttlMs`). — S, junior-dev (11dd399)

### D. Shell-script integration tests (`tests/castLog/hookScripts.integration.test.ts`)

#### Section briefing

**What this section produces:** A new test file `tests/castLog/hookScripts.integration.test.ts` that materialises real `.sh` files into a `os.tmpdir()` directory, executes them via `child_process.spawnSync('sh', …)` with stdin/env fixtures, and asserts on the resulting JSONL log file and scratch files. This is the only test that exercises shell-level correctness. Lives in the **unit** test tree (`tests/`), runs under the default `npm test` command — no separate harness, just `child_process` and `fs/promises`.

**Design context the executor needs upfront (verbatim):**
- Decision #8: "POSIX-shell integration tests run `sh` directly." Use `spawnSync('sh', [scriptPath], { input: stdinJson, env: { ...process.env, CAST_ID: 'test-cast-id' } })`.
- Each test sets up a fresh temp dir via `fs.mkdtemp(path.join(os.tmpdir(), 'grimoire-hooks-'))` in `beforeEach`, materialises the relevant script via `fs.writeFile` (using the **real** renderer from A, so any breakage in A surfaces here too), `chmod` to `0o755`, and tears down with `fs.rm(tempDir, { recursive: true, force: true })` in `afterEach`.
- The tests treat `python3` as available. If CI lacks it, add `it.skipIf(process.env.SKIP_PYTHON_TESTS)` — but locally on macOS dev machines it is present.
- Timestamps are matched with a regex (`/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/`) — we don't pin to an exact `ts`.

**Cross-section couplings:**
- D depends on A (renderers exist and produce correct content) — if any A test fails, these will too.
- D does *not* depend on B (HookMaterializer) — these tests materialise scripts via direct `writeFile` rather than going through the materialiser, to isolate the shell-correctness concern.

**Section-level Red criterion:** All four scenarios pass against real `/bin/sh`:
1. `session-start.sh` with `CAST_ID=abc` env → appends one parsable JSON line with `stage:'in-progress'` to the log.
2. `session-start.sh` without `CAST_ID` → exit 0, no log change.
3. `post-tool-use.sh` with `CAST_ID=abc` env and stdin `'{"tool_name":"Write","tool_input":{"file_path":"foo/bar.md"},"tool_response":{}}'` → no log change, scratch file `<scratch>/abc.paths` contains `foo/bar.md\n`.
4. `stop.sh` with `CAST_ID=abc` env, after two prior `post-tool-use.sh` calls (one for `a.md`, one for `b.md`, one duplicate for `a.md`) → log gains one `{"stage":"done","ts":…,"castId":"abc","affectedFiles":["a.md","b.md"]}` line; scratch file is gone.
5. `stop.sh` with `CAST_ID=abc` and no prior scratch file → log gains a `done` line with `affectedFiles:[]`.

**senior-dev**
- [x] D1: Set up shared test helpers at the top of the file: `mkTempDir()`, `materializeScript(name, content)`, `runShell(scriptPath, { stdin?, env? })` (wrapping `spawnSync`), `readLog(logPath): CastLogEvent[]` (split by `\n`, JSON-parse each). Add `beforeEach`/`afterEach` for temp-dir lifecycle. — M, senior-dev
- [x] D2: Write failing test for **scenario 1** (SessionStart writes `in-progress`): materialise `session-start.sh` via real `renderSessionStartScript`, run with `CAST_ID=abc`, assert log file contains exactly one JSON line with shape `{stage:'in-progress', ts:<ISO-regex>, castId:'abc'}`. — S, senior-dev
- [x] D3: Write failing test for **scenario 2** (no `CAST_ID` → no-op): run the same script without `CAST_ID` in env, assert log file does not exist (or is empty), exit code 0. — S, senior-dev
- [x] D4: Write failing test for **scenario 3** (PostToolUse appends to scratch): materialise `post-tool-use.sh`, run with `CAST_ID=abc` and stdin `'{"tool_name":"Write","tool_input":{"file_path":"foo/bar.md"},"tool_response":{}}'`, assert: log file is empty/absent, scratch file `<scratchDir>/abc.paths` contents equal `'foo/bar.md\n'`. — S, senior-dev
- [x] D5: Write failing test for **scenario 4** (Stop drains scratch with dedup): pre-populate scratch file with `"a.md\nb.md\na.md\n"`, materialise and run `stop.sh` with `CAST_ID=abc`, assert: log gains one `done` line with `affectedFiles:['a.md','b.md']` (sorted, dedup), scratch file is gone. — S, senior-dev
- [x] D6: Write failing test for **scenario 5** (Stop with no prior tool calls): no scratch file exists, run `stop.sh` with `CAST_ID=abc`, assert: log gains one `done` line with `affectedFiles:[]`. — S, senior-dev
- [x] D7: Edge-case test: PostToolUse with a `file_path` containing apostrophes and unicode (`"docs/it's a test/日本.md"`) — assert scratch file content is `"docs/it's a test/日本.md\n"` (no shell-level corruption). — S, senior-dev
- [x] D8: Edge-case test: PostToolUse with stdin JSON whose `tool_input` has no `file_path` key (e.g. a different tool that slipped past the matcher in some Claude Code version) — assert: script exits 0, scratch file either does not exist or is empty (the empty-`FILE_PATH` branch in the script skips the `printf`). — S, senior-dev
- [x] D9: Edge-case test: Two concurrent `castId`s — interleave calls for `castA` and `castB` PostToolUse, then `stop.sh` for each. Assert their `done` lines have disjoint `affectedFiles` and the per-cast scratch files were both cleaned up. (Same-process sequencing; no real concurrency primitives needed — Claude Code never invokes hooks for two distinct casts in the same `sh` process.) — S, senior-dev

### E. `CastRunner` + `buildCastArgs` settings-flag threading

#### Section briefing

**What this section produces:** Modifies `src/cast/CastRunner.ts` to require `castSettingsPath: string` on `BaseCastRunInput`, and `src/cast/buildCastArgs.ts` to accept the same field and append `"--settings", castSettingsPath` to the CLI args.

**Design context the executor needs upfront (verbatim):**
- Decision #9: "`--settings <abs-path>` is the right Claude Code flag." Confirmed against current Claude Code CLI docs.
- Decision #11: required, not optional.
- The arg is appended *after* the existing args but before `--add-dir` is appended (or in any stable position — order does not affect CLI semantics). Choose to append at the end of `buildCastArgs` for diff-stability with the existing structure.
- The runner already strips `binaryPath`/`cliCommand`/`castId` before forwarding to `buildCastArgs` (see existing `getCastArgs`). Add `castSettingsPath` to the destructure-and-forward.

**Cross-section couplings:**
- E1 is a prerequisite for G (CastDispatcher) and H (ForgeImprinter) — those todos cannot compile their tests until the runner accepts `castSettingsPath`.
- E1 forces an update to every existing `CastRunner.run` and `buildCastArgs` call site in tests; treat as mechanical search-and-replace.

**Section-level Red criterion:** `tests/CastRunner.test.ts` and `tests/buildCastArgs.test.ts` (extended) prove: (1) `buildCastArgs({ …, castSettingsPath: '/abs/settings.json' })` returns an array containing `'--settings'` immediately followed by `'/abs/settings.json'`; (2) `runner.run({ …, castSettingsPath: '/abs/settings.json' }, callbacks)` causes the spawner to receive args containing `'--settings'` then `'/abs/settings.json'`; (3) compile fails if `castSettingsPath` is omitted.

**junior-dev**
- [x] E1: Write failing test in `tests/buildCastArgs.test.ts`: `buildCastArgs({ metaSpell:'x', modelId:'sonnet', effort:null, vaultMountPath:'/v', castSettingsPath:'/abs/settings.json' })` returns an array where `args.indexOf('--settings')` is followed by `'/abs/settings.json'` at `index+1`. — S, junior-dev
- [x] E2: Implement: add `castSettingsPath: string` to `BaseCastArgsInput`; after the existing `if (input.vaultMountPath !== "")` block, append `args.push('--settings', input.castSettingsPath);` (unconditional — the value is always present from main.ts, even if empty; the runner does not enforce non-empty). — S, junior-dev
- [x] E3: Edge case: `castSettingsPath === ''` (degenerate; main.ts failed to materialise) — the args still contain `'--settings'` followed by `''`. Document with a one-line comment: `// --settings is always emitted; empty value lets Claude Code fall back to user settings.` — S, junior-dev
- [x] E4: Write failing test in `tests/CastRunner.test.ts`: `runner.run({ …, castId:'c', castSettingsPath:'/abs/settings.json' }, …)` causes the spawner to receive args containing `'--settings'` then `'/abs/settings.json'`. — S, junior-dev
- [x] E5: Implement: add `castSettingsPath: string` to `BaseCastRunInput`; update `getCastArgs` to forward `castSettingsPath` in the destructure (`const { binaryPath, cliCommand, castId: _castId, ...castArgsInput } = input;` already strips by listing — confirm `castSettingsPath` falls through into `castArgsInput`). — S, junior-dev
- [x] E6: Update every existing `CastRunner.run` / `CastRunInput` / `buildCastArgs` call site in production code (the dispatcher and imprinter will be patched in G/H; only test fixtures here) — grep for `binaryPath:` and add `castSettingsPath: 'test-settings.json'` to each input literal. — S, junior-dev

### F. `main.ts` wiring (materialise + sweep + thread path)

#### Section briefing

**What this section produces:** Modifies `src/main.ts` to (a) instantiate `HookMaterializer` and `ScratchSweeper` after `CastLogStore`, (b) `await materializer.run()` and stash the returned path on `this.castSettingsPath`, (c) fire-and-forget `sweeper.sweep()`, (d) pass `castSettingsPath: this.castSettingsPath` into both `ForgeImprinter` and (inside `createDispatcher`) `CastDispatcher`.

**Design context the executor needs upfront (verbatim from 009 + this plan):**
- Decision #5 (009): "Constructor takes injected `getBasePath: () => string`." Same pattern for the materialiser ports: `getPluginDirAbs: () => path.join(this.app.vault.adapter.getBasePath(), this.manifest.dir ?? FALLBACK)`; `getLogPathAbs: () => path.join(<that>, 'cast-log-local.jsonl')`; `getScratchDirAbs: () => path.join(<that>, 'cast-log-scratch')`.
- Decision #12 (this plan): `castSettingsPath` is a `private castSettingsPath!: string;` instance field, not in `data.json`.
- Materialisation is `await`ed — but wrapped in a `try/catch` that logs and proceeds. The plugin must load even if file writes fail. The default value of `this.castSettingsPath` in the failure branch is the *would-be* path (still `path.join(pluginDirAbs, 'settings.json')`), so the cast spawn still passes a `--settings` flag (Claude Code falls back to user settings if the file is missing or unreadable).
- The sweeper runs fire-and-forget (`.catch(console.error)`); it does not block `onload`.

**Cross-section couplings:**
- F depends on B (HookMaterializer), C (ScratchSweeper), and the dispatcher/imprinter constructor changes in G1 and H1.
- F is the singleton-assembly point for everything in A–E.

**Section-level Red criterion:** `tests/main.test.ts` (extended) proves: (1) `onload` constructs exactly one `HookMaterializer` and calls `.run()` once; (2) `onload` constructs exactly one `ScratchSweeper` and calls `.sweep()` once; (3) the resolved settings path is stored on the plugin instance and passed to both the `ForgeImprinter` constructor and the `CastDispatcher` constructor (both receive the same string value); (4) when `HookMaterializer.run()` rejects, `onload` still resolves and the plugin remains functional (cast action is still wired) — error is logged via `console.error`; (5) when `ScratchSweeper.sweep()` rejects, `onload` still resolves.

**senior-dev**
- [x] F1: Write failing test: `onload` invokes `new HookMaterializer(...)` exactly once. Spy on the constructor; assert the ports object contains `getPluginDirAbs: expect.any(Function)` and `getLogPathAbs: expect.any(Function)`. — M, senior-dev (8f4bc3b)
- [x] F2: Implement: in `onload`, after `this.castLogStore = …`, instantiate `const materializer = new HookMaterializer({ getPluginDirAbs: () => path.join(this.app.vault.adapter.getBasePath(), this.manifest.dir ?? FALLBACK), getLogPathAbs: () => path.join(this.app.vault.adapter.getBasePath(), this.manifest.dir ?? FALLBACK, 'cast-log-local.jsonl') })`. Define `FALLBACK = \`${this.app.vault.configDir}/plugins/grimoire\`` as a local const. — M, senior-dev (8f4bc3b)
- [x] F3: Write failing test: `onload` calls `materializer.run()` and stores the result on `this.castSettingsPath`. — S, senior-dev (8f4bc3b)
- [x] F4: Implement: `try { this.castSettingsPath = await materializer.run(); } catch (e) { console.error('HookMaterializer failed', e); this.castSettingsPath = path.join(pluginDirAbs, 'settings.json'); }`. — S, senior-dev (8f4bc3b)
- [x] F5: Write failing test: `onload` invokes `new ScratchSweeper(...)` exactly once and calls `.sweep()`. — S, senior-dev (8f4bc3b)
- [x] F6: Implement: instantiate `const sweeper = new ScratchSweeper({ getScratchDirAbs: () => path.join(pluginDirAbs, 'cast-log-scratch') })`; call `sweeper.sweep().catch(console.error)` (fire-and-forget). — S, senior-dev (8f4bc3b)
- [x] F7: Write failing test: the `ForgeImprinter` constructor receives `castSettingsPath` equal to the value returned by `materializer.run()`. — S, senior-dev (8f4bc3b)
- [x] F8: Implement: pass `castSettingsPath: this.castSettingsPath` into `new ForgeImprinter({ … })`. — S, senior-dev (8f4bc3b)
- [x] F9: Write failing test: the `CastDispatcher` constructor (inside `createDispatcher`) receives the same `castSettingsPath`. — S, senior-dev (8f4bc3b)
- [x] F10: Implement: pass `castSettingsPath: this.castSettingsPath` into `new CastDispatcher({ … })` inside `createDispatcher`. — S, senior-dev (8f4bc3b)
- [x] F11: Write failing test: when the injected `HookMaterializer.run` rejects, `onload` resolves and the existing "command callback constructs CommandPopup with..." test still passes (regression). Strategy: spy on the constructor, mock its `run` to reject. — S, senior-dev (8f4bc3b)
- [x] F12: Confirm F11 passes given F4's `try/catch`. — S, senior-dev (8f4bc3b)

### G. `CastDispatcher` plumbing (`cast/CastDispatcher.ts`)

#### Section briefing

**What this section produces:** Modifies `src/cast/CastDispatcher.ts` to require `castSettingsPath: string` in `CastDispatcherDeps` and thread it into `runner.run({ …, castSettingsPath })`.

**Design context the executor needs upfront:**
- Decision #11: required, not optional. Symmetric with `castLogStore` in 009 — drift prevention.
- The dispatcher does **not** read or interpret the path; it just transports.

**Cross-section couplings:**
- G depends on E (`CastRunInput` has the field).
- G is consumed by F8 (main.ts wires it in).

**Section-level Red criterion:** `tests/CastDispatcher.test.ts` (extended) proves: (1) `castSettingsPath` is required in deps (compile-time guarantee); (2) every successful `dispatch` calls `runner.run` with `castSettingsPath` matching the value passed at construction; (3) existing tests (no-active-note bail, recordCasted, recordError) continue to pass with the new field.

**junior-dev**
- [x] G1: Extend `CastDispatcherDeps` with required `castSettingsPath: string`. Fix every existing `CastDispatcher` test to pass a stub value `'test-settings.json'`. Existing tests will fail to compile — mechanical fix. — S, junior-dev
- [x] G2: Write failing test: a successful dispatch calls `runner.run` with `castSettingsPath: 'test-settings.json'` in the input. — S, junior-dev
- [x] G3: Implement: store `this.#castSettingsPath = deps.castSettingsPath` in the constructor; pass it into the `runner.run({ …, castSettingsPath: this.#castSettingsPath })` call. — S, junior-dev
- [x] G4: Edge-case test: when the no-active-note guard bails, `runner.run` is not called (regression — confirms G3 didn't accidentally move the runner call above the guard). — S, junior-dev

### H. `ForgeImprinter` plumbing (`forge/ForgeImprinter.ts`)

#### Section briefing

**What this section produces:** Modifies `src/forge/ForgeImprinter.ts` to require `castSettingsPath: string` in `ForgeImprinterDeps` and thread it into the `runCasting` helper's `castRunner.run({ …, castSettingsPath })` call.

**Design context the executor needs upfront:**
- Same as G — transport-only field.

**Cross-section couplings:**
- H depends on E (`CastRunInput` has the field).
- H is consumed by F7/F8.

**Section-level Red criterion:** `tests/ForgeImprinter.test.ts` (extended) proves: (1) required field on deps; (2) a valid imprint reaches `castRunner.run` with `castSettingsPath` matching the constructor value; (3) the empty-name guard short-circuits before any runner call (regression).

**junior-dev**
- [x] H1: Extend `ForgeImprinterDeps` with required `castSettingsPath: string`. Fix every existing `ForgeImprinter` test fixture to pass `'test-settings.json'`. — S, junior-dev
- [x] H2: Write failing test: a valid `imprint(...)` causes `castRunner.run` to be called with `castSettingsPath: 'test-settings.json'`. — S, junior-dev
- [x] H3: Implement: store on the instance; pass into `runCasting`'s `castRunner.run({ …, castSettingsPath })` call. — S, junior-dev
- [x] H4: Edge-case test: empty-name guard — `castRunner.run` is not called (regression). — S, junior-dev

### I. Remove "Progress Tracking" instructional sentence from `buildMetaSpell`

#### Section briefing

**What this section produces:** Modifies `src/forge/buildMetaSpell.ts` to delete the sentence in the wrapper-instructions step that tells the model to include a `## Progress Tracking` section inside the new spell's `%%` block. New forges no longer carry the directive. Existing in-vault spells with the old text are unaffected (per the No-gos: no migration).

**Design context the executor needs upfront (verbatim from pitch):**
> The wrapper note loses its Progress Tracking section in this pitch — it described a directive that the new mechanism does not need.
- The current source contains: `'\`## Progress Tracking\` (with the first/last-action important callout — include verbatim; a future cast pipeline will supply CAST_ID), and '`. Remove only that fragment from the bulleted instruction in step 2; the surrounding text remains.

**Cross-section couplings:**
- None. Independent of A–H. Can be implemented in parallel.

**Section-level Red criterion:** `tests/buildMetaSpell.test.ts` (extended) proves: (1) the returned meta-spell string no longer contains the substring `'Progress Tracking'`; (2) the rest of the wrapper instructions are intact (Execution Mode callout, MCP Tools section, `%%` block fences).

**junior-dev**
- [x] I1: Write failing test in `tests/buildMetaSpell.test.ts`: `expect(buildMetaSpell({...})).not.toContain('Progress Tracking')`. — S, junior-dev
- [x] I2: Implement: remove the `\`## Progress Tracking\` (...)` fragment from the bullet in `buildMetaSpell.ts` step 2. Leave the surrounding `Execution Mode` and `MCP Tools` mentions intact. — S, junior-dev
- [x] I3: Regression test: the wrapper instructions still mention `'Execution Mode'` and `'MCP Tools'`. — S, junior-dev

### J. Cleanup + lint + integration suite

#### Section briefing

**What this section produces:** Runs lint and both test suites; confirms zero new failures and zero new lint violations.

**Design context the executor needs upfront:** None — this is hygiene.

**Cross-section couplings:** None — runs last, depends on A–I being green.

**Section-level Red criterion:** `npm run lint` exits 0; `npm test` exits 0; `npm run test:integration` exits 0; `git diff --stat` lists changes only in the files in the Components table plus their tests.

**junior-dev**
- [x] J1: Run `npm run lint`; fix any new violations. Likely targets: `no-nodejs-modules` eslint-disable comments in `HookMaterializer.ts`, `ScratchSweeper.ts`, `hookScripts.integration.test.ts` (same convention as `store.ts`). — S, junior-dev
- [x] J2: Run `npm test`; confirm 0 failures, 0 unintentionally-skipped tests. Confirm the new shell-integration tests run by default (no `it.skip`). — S, junior-dev
- [x] J3: Run `npm run test:integration`; confirm the existing happy-dom UI integration tests still pass. They construct `CastDispatcher`/`ForgeImprinter` indirectly via `main.ts.onload`; the new `castSettingsPath` field flows through the existing wiring and should not break the harness. If a harness fixture builds the dispatcher directly, update it to pass `castSettingsPath: 'test-settings.json'`. — M, junior-dev

## Overall effort summary

- **Total todos:** 67
- **Effort:** S × 59, M × 8, L × 0
- **Dev tiers:** junior-dev × 50, senior-dev × 17 (Section D + Section F), lead-dev × 0
- **No `ui-integration-tester` group** — there is no UI surface in this iteration; the entire effect is in on-disk shell scripts, settings JSON, and the JSONL log. Existing UI integration tests continue to pass with the new `castSettingsPath` field threaded through via the harness/main.ts.

**Why senior-dev appears at all:**
- **Section D** (shell-script integration tests) — composing `spawnSync` + temp-dir lifecycle + JSON parsing of log lines is a small framework of its own; junior-dev could do D2–D9 once D1's helpers exist, but the helper design (`mkTempDir`, `materializeScript`, `runShell`, `readLog`) is judgment-shaped enough to warrant senior-dev for the full group. Keeping the whole section under one tier avoids handoff cost.
- **Section F** (main.ts wiring) — five constructor-spy tests plus a try/catch that must keep the plugin functional on materialiser failure; the failure-path test (F11) requires careful spy and assertion design. Senior-dev for the whole section.

## Risks and follow-ups

- **MCP-tool capture for `affectedFiles`.** The matcher is `Write|Edit|MultiEdit|NotebookEdit`; Obsidian MCP tools (`mcp__obsidian-tools__create_vault_file` etc.) don't match. The wrapper today *prefers* MCP for vault writes — so a typical forge cast may produce a `done` line with an empty `affectedFiles`. Mitigation flagged by the pitch: extend the matcher string after empirical verification of how Claude Code names MCP tools in hook payloads. **Follow-up: dogfood the pitch's two-day plan; if the gap is wide, either extend the matcher to include `mcp__obsidian.*` or flip the wrapper's tool preference to built-in file tools.**
- **`python3` availability.** Document in `README.md` (via `/readme`) after this lands. If unavailable, `affectedFiles` degrades to empty but the cast still completes — acceptable graceful failure.
- **Windows PowerShell variant.** Out of scope; the contract (settings.json plus three commands) accepts a parallel PowerShell script set behind the same matcher entry.
- **Settings merge replace-vs-additive.** Hard precondition. If field reports surface a problem, a separate pitch ("paste hooks into your own settings") is the resolution per the pitch's No-gos.
- **Stale `casted` records** when Claude Code crashes hard enough to skip both `Stop` and the plugin's `error` writer — out of scope, downstream of timeout-based stale detection (not on the roadmap).
- **Plan-time Context7 verification** for hook payload shape and `--settings` flag: confirmed at plan time. Re-verify during implementation only if a fixture test fails for an unexpected reason.
- **Mutation testing** (`/mutate`) should target `hookScripts.ts` renderers and `ScratchSweeper.sweep` after this lands.
- **Live-spec** after `/done` should describe: the hook contract, the four files that materialise, how `affectedFiles` is captured, and the known MCP gap.

### R. Review fixes (post-review remediation)

**junior-dev**
- [x] R6: In `tests/main.test.ts`, mock `HookMaterializer.run` for all existing `onload()` tests that don't already spy on it (the ~10 tests that predate Section F). Add a `beforeEach` spy on `HookMaterializerModule.HookMaterializer` that stubs `.run` to resolve with `'/test/vault/.obsidian/plugins/test/settings.json'`. Goal: eliminate 15 spurious `console.error('HookMaterializer failed')` lines per run. Pattern: mirror the existing F-section spy style already in the file. — M, junior-dev (6bd9c80)

**senior-dev**
- [x] R1: Write failing test in `tests/castLog/hookScripts.test.ts`: `renderSessionStartScript({ logPathAbs: '/path/with"quote/log.jsonl' })` contains the path literally with the double-quote preserved and does not break shell assignment syntax. Same for `renderPostToolUseScript` and `renderStopScript`. — S, senior-dev
- [x] R2: Fix `hookScripts.ts` renderers to escape double-quotes in all path args before shell interpolation (e.g. `const safe = (p: string) => p.replace(/"/g, '\\"');`), so the rendered assignments remain syntactically valid when the path contains `"`. Make R1 green. — S, senior-dev
- [x] R3: In `renderStopScript`, replace `|| echo "[]"` with `|| printf '%s' '[]'` to match the plan's `printf`-only contract for all shell output. — S, senior-dev
- [x] R4: Write failing test in `tests/castLog/ScratchSweeper.test.ts`: `stat()` rejecting for the first file does not prevent `unlink()` from being called for a second qualifying file. — S, senior-dev (8ee3a96)
- [x] R5: Fix `ScratchSweeper.sweep()`: wrap the `stat + unlink` block together in a per-file `try/catch` that logs and continues, matching the "continues on per-file failures" plan invariant. Make R4 green. — S, senior-dev (8ee3a96)

reviewed @ 225abff
