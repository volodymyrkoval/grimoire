# Cast log mobile sync

> `dev/done-036` — 2026-05-28 — Renames the two cast-log files from `.jsonl` to `.json` so Obsidian Sync's `.obsidian/` allow-list delivers them to mobile.

## What it does

The plugin's two cast-log files — `cast-log-plugin` (written by Obsidian) and `cast-log-agent` (written by Claude Code hook scripts) — now live on disk as `cast-log-plugin.json` and `cast-log-agent.json` inside the plugin's vault directory. The contents are unchanged: each file is still append-only, one JSON event per line. Only the extension moved.

The change is motivated entirely by Obsidian Sync. Its `.obsidian/` allow-list passes `.json` but not `.jsonl`, which previously meant a cast logged on desktop never reached mobile. With the new extension, sync delivers the logs and the Cast Log panel surfaces the same casts on every device the vault is synced to.

The rename is a single-source change. `PluginPaths` is the lone authority over both paths, and every consumer — `CastLogStore`, `HookMaterializer`, `VaultRefreshCoordinator`, hook-script materialisation — flows through it, so no other production code needed editing. The line-by-line reader (`#readFromFile`) was already tolerant of newline-delimited JSON under a `.json` name, so the file-format / extension mismatch is intentional and load-bearing.

## Design decisions

- **Rename at the path authority, nowhere else.** `PluginPaths` is the only producer of these paths; consumers receive them by injection. Changing two string literals there propagates through the whole system without further code edits. Touching consumers individually would have invited drift.
- **Keep newline-delimited JSON under a `.json` extension.** The alternative — converting to a true JSON array or pretty-printed object — would have forced a reader rewrite and broken the hook scripts that append per-line from POSIX shell. The mismatch between content shape and extension is the cost of riding Sync's allow-list.
- **No migration, no copy-on-load, no legacy guard.** The pitch had proposed a one-time `.jsonl` → `.json` copy with a "new absent" check. Scoped out because Grimoire is pre-production: there are no production logs to preserve, and dev artefacts are hand-deletable. Dropping migration also retires three rabbit holes (re-copy clobber, three-way agent-log sharing, portal transitional window) that existed only to make migration safe.
- **Update only load-bearing test fixtures.** Tests that pin the real filename as an expected value were updated; tests that use arbitrary throwaway paths (`/abs/log.jsonl`, `cast-log.jsonl` as a watch-path under test) were left alone — their literal is not part of the contract.

## Scope

**In:**

- Two string-literal swaps in `PluginPaths` (`.jsonl` → `.json` for both files).
- Test fixtures across `PluginPaths`, `CastLogStore`, `HookMaterializer`, and the `remote-cast` and `store-panel-delete` integration specs updated to the new filenames.
- `.gitignore` updated to ignore the `.json` filenames; the four historical `.jsonl` entries (including the pre-rename `cast-log-local` / `cast-log-remote` pair) removed.
- Verification grep confirming no other source file independently hardcodes `.jsonl` for these logs.

**Out:**

- Migration of existing `.jsonl` files — no production data exists, so the safe-migration mechanics that the pitch described are unnecessary overhead.
- Reader changes — `#readFromFile` already splits on newlines and parses per-line; preserving that contract is the point of keeping the content shape.
- Pretty-printing or JSON-array wrapping — would break the line-append model that hook scripts depend on; separate concern.
- Sync UI, onboarding copy, or schema versioning — out of scope for a lexical rename.
- Deletion of orphaned `.jsonl` files in user vaults — none exist in production; dev users delete by hand.
- Portal Service changes — hook scripts embed whatever path the materialiser hands them; the portal inherits the new name on next sync without coordination.

## Relationship to existing system

- **`PluginPaths`** is the single change site; everything else fans out from there. This iteration validates the path-authority pattern established earlier — a literal swap in one file reaches `CastLogStore`, `HookMaterializer`, `VaultRefreshCoordinator`, and the synced hook scripts without further edits.
- **`cast-log-foundation`** owns `cast-log-plugin`; **`remote-casting`** is the first producer of `cast-log-agent`; **`cast-progress-events`** explains the writer split across the two files. All three previously documented those files with the `.jsonl` suffix; their live specs are updated alongside this one.
- **`cast-log-panel`** reads both files via `CastLogStore.readAll()` — no panel-side change required; the merged view simply now reflects whatever each device's synced files contain.
- **Hook scripts** (`session-start.sh`, `stop.sh`) and the **Portal Service** receive the log path through `HookMaterializer` parameter passing; the rename is invisible to them.

## Behavior changes

- **Mobile cast-log visibility:** previously, casts logged on desktop never reached mobile because Obsidian Sync's `.obsidian/` allow-list skipped `.jsonl` files. Now, both logs ride Sync to every device the vault is on. Reason: bringing the Cast Log panel to mobile parity was the entire motivation for the rename.
- **On-disk filenames:** previously `cast-log-plugin.jsonl` / `cast-log-agent.jsonl`; now `cast-log-plugin.json` / `cast-log-agent.json`. Reason: Sync's allow-list. Existing dev `.jsonl` files become inert orphans (nothing reads them); production has none.
