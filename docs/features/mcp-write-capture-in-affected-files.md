# MCP Write Capture in `affectedFiles`

> `dev/done-039` — 2026-06-07 — Closes the systematic hook-coverage gap that left `affectedFiles: []` on every refine cast, by broadening the `PostToolUse` matcher and rewriting the path extractor to discover `.md` paths under any MCP server's parameter naming.

## What it does

Every cast's `done` event in the Cast Log now reports the notes it actually wrote — even when the writes went through an Obsidian MCP server (`mcp__obsidian-mcp-tools__create_vault_file`, `mcp__obsidian__vault_write`, etc.) instead of the native `Write` / `Edit` tools. Previously, refine casts — which prefer MCP writes — almost always logged `affectedFiles: []`, so the Logs panel had nothing to surface as the cast's output. With this iteration, MCP-driven writes appear in the `done` line and on the Cast Log row.

The fix has two legs. The `PostToolUse` matcher documented in the README's `settings.local.json` template is broadened from `Write|Edit|MultiEdit|NotebookEdit` to `Write|Edit|MultiEdit|NotebookEdit|mcp__.*`, so hook scripts now also fire for any MCP tool invocation. The Python extractor embedded in `post-tool-use.sh` no longer reads the single key `tool_input.file_path`; instead it walks every top-level string value in `tool_input`, keeps the ones that end in `.md`, and emits them sorted-and-deduped. A 512-character cap on candidate strings prevents large `content` bodies (e.g. a `patch_vault_file` payload) from being mistaken for paths.

Existing users must update their vault's `.claude/settings.local.json` matcher to gain the new behavior; the README carries a one-line migration callout above the JSON block. The plugin does not write or migrate `settings.local.json` itself.

## Design decisions

- **Documented matcher migration, not a plugin-managed file.** The plugin does not materialize `settings.local.json` — it is user-owned, mixes permissions and unrelated hooks, and `--settings` does not merge. Same rationale that shaped `cast-progress-events`. README callout is the migration UX.
- **`mcp__.*` over a bare `.*` in the matcher.** Narrow enough to skip `Bash`, `Grep`, `WebSearch` and the like; broad enough to catch every MCP server regardless of name.
- **Top-level string scan over a named-key allowlist.** MCP servers spell the path parameter as `filepath`, `path`, `target`, `note_path`, `file_path`, `vault_path`, etc. No allowlist could keep pace; scanning every top-level string value filtered by `.endswith(".md")` is generic and stable across servers.
- **512-character cap on candidate strings.** Vault paths are short; `patch_vault_file` `content` blobs are not. The cap is exposed as `MCP_PATH_VALUE_MAX_LEN` so tests pin to a named constant rather than a literal.
- **Sorted set inside the Python.** Pre-dedupes when one path appears under two keys (e.g. a move call's `source` and `target`) and gives stable output regardless of dict iteration order across server implementations.
- **`mcp__.*` over a write-only narrowing like `mcp__.*write.*|mcp__.*patch.*`.** Tool-naming discipline varies per server; narrowing locks us back into per-server assumptions. `affectedFiles` is best-effort observability, not an audit log — over-capture from an MCP read is acceptable.

## Scope

**In:**

- Rewritten Python extractor in `renderPostToolUseScript`: walks `tool_input.values()`, keeps `.md`-suffixed strings ≤ 512 chars, sorts and dedupes, prints one path per line.
- `MCP_PATH_VALUE_MAX_LEN = 512` exported alongside the renderer so tests reference one source of truth.
- Unconditional append (`>> "$SCRATCH"`) — empty stdout from the Python yields an empty append. The `if [ -n "$FILE_PATH" ]` guard is gone.
- README `PostToolUse` matcher widened to `Write|Edit|MultiEdit|NotebookEdit|mcp__.*` with a migration callout immediately above the JSON block.
- Integration suite extended: MCP `filepath` extraction, MCP `path` extraction, multi-`.md` dedup, `content`-body suppression via the cap, non-`.md` strings (e.g. `Bash` commands) filtered out, plus the native `Write` regression case.

**Out:**

- **Plugin-managed `settings.local.json`** — user-owned file with merge hazards; same boundary as `cast-progress-events`.
- **Auto-detecting or migrating the user's existing matcher** — no plugin Notice, no parser, no `data.json` migration code. The README callout is the migration UX.
- **Recursive walk of nested `tool_input` objects** — every MCP tool surveyed keeps paths at the top level; revisit when one shows up that doesn't.
- **Narrowing the matcher to write-shaped MCP names** — locks in per-server naming assumptions; `affectedFiles` is observability, not audit.
- **`.canvas` or other non-`.md` vault files in `affectedFiles`** — no consumer surfaces them; YAGNI.
- **`PreToolUse` capture** — only successful tool calls count, same boundary as `cast-progress-events`.
- **PowerShell variant of the hook** — desktop-Windows still parked.
- **Backfilling old log lines** — historical `affectedFiles: []` records stay as written.

## Relationship to existing system

- **Closes the open gap in `cast-progress-events`.** That feature flagged "MCP-tool capture in `affectedFiles`" as deferred and stated paths captured through Obsidian MCP tools were not yet in the list. Both statements are now obsolete and have been removed from its live-spec.
- **Feeds `cast-log-panel`'s Forge display-name logic.** The panel reads the forge cast's display name from the first `affectedFiles` entry; for refine casts and other MCP-routed flows, this iteration is what makes that field non-empty.
- **Preserves `cast-log-path-normalisation`.** `stop.sh` still strips the vault-root prefix and dedupes via `sort -u`; the new extractor only changes which paths the scratch file receives.
- **Unchanged contract for `stop.sh` and `HookMaterializer`.** The script-to-script protocol (one path per line in the scratch file) is intact; no schema field changed.

## Behavior changes

- **`affectedFiles` on refine and other MCP-routed casts:** previously almost always `[]`. Now reports the `.md` paths written by MCP tools, deduplicated. Reason: hook coverage now extends to MCP tools, and the extractor no longer depends on the native `file_path` key by name.
- **`post-tool-use.sh` extraction shape:** previously read only `tool_input.file_path` and guarded the append with `[ -n "$FILE_PATH" ]`. Now walks every top-level string in `tool_input`, applies the `.md` suffix and 512-char filters, and appends unconditionally (empty stdout is a no-op append). Reason: MCP servers each pick their own path parameter name; a generic scan is the only stable strategy.
- **`PostToolUse` matcher (documented):** previously `Write|Edit|MultiEdit|NotebookEdit`. Now `Write|Edit|MultiEdit|NotebookEdit|mcp__.*`. Reason: the prior matcher never fired for MCP tools; without the broadened matcher, the new extractor would have nothing to work on. Existing users must update their `settings.local.json` to pick this up.
