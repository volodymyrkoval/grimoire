# Cast Log Path Normalisation

> `dev/done-021` — 2026-05-17 — Cast Log rows show context-note and affected-note links as short basenames; vault-root prefixes are stripped at the writer (`stop.sh`) so new JSONL entries are vault-relative, with a display-time fallback for legacy absolute paths.

## What it does

The expanded body of a Cast Log row no longer renders full paths as link text. *Context notes* and *Affected notes* are shown as their basenames — `foo.md` rather than `Notes/sub/foo.md` — while the click target stays the full vault-relative path, so Obsidian's link resolver still opens the right file. The label *Affected files* is renamed to *Affected notes* whenever the vault root is configured; with no vault root set, both lists fall back to the previous full-path rendering and the old label.

The inconsistency is also fixed at its source. On every plugin load, `stop.sh` is regenerated with the vault root baked in (from `settings.vaultMountPath`). At session end, the script strips the vault-root prefix from every captured path before writing the `done` JSONL line, so `affectedFiles` is a list of vault-relative paths from the moment it lands on disk. Legacy entries written before this change are normalised at display time as a transitional shim.

When `vaultMountPath` is empty the writer emits the previous script byte-for-byte and the UI keeps rendering raw paths — degraded but not broken.

## Design decisions

- **Normalise at the writer, fall back at the reader.** The writer is the single point of truth for new entries; the read-side normaliser exists only to absorb pre-existing absolute-path log lines. No migration pass — the fallback is transitional and lives at the UI seam.
- **Pure POSIX parameter expansion (`${line#"$VAULT_ROOT/"}`) over `sed`.** Keeps the shell-side dependency surface flat; BSD/GNU `sed` differences would have been a separate failure mode. `python3` remains the JSON encoder, unchanged.
- **Empty `vaultRootAbs` is a valid input, not an error.** Both renderer and helper treat it as "pass through unchanged". This avoids forcing `CastLogModule` to refuse to materialise hooks before the user fills in Settings.
- **`basename` and `toDisplayPath` are pure POSIX-style helpers** that split on `/` only. Obsidian normalises Windows backslashes upstream, so a dual-separator helper would have implied the rest of the codebase needed one too.
- **CSS class names unchanged** (`.cast-log-affected-files-row`, `.cast-log-affected-files`) for backward compatibility with any user theming, even though the label text moved to "Affected notes".
- **JSONL field name `affectedFiles` unchanged.** Renaming would break the contract with `cast-progress-events`' `done` line and any external reader; the rename is a UI concern.
- **`CastLogReader` / `foldEvents` are not touched.** Folding stays pure over raw event data; display-time normalisation is a UI concern and lives at the UI seam.

## Scope

**In:**
- Writer-side prefix strip in `stop.sh` (rendered by `renderStopScript`, materialised by `HookMaterializer`).
- `getVaultRootAbs` port on `HookMaterializerPorts`, wired by `CastLogModule` from `settings.vaultMountPath`.
- Pure helpers `basename` and `toDisplayPath` under `src/castLog/format/`.
- `CastLogRow` consumes both helpers via a single `appendPathLinkList` template that both list types delegate to. `vaultRootAbs` is threaded through `CastLogList` and `CastLogPanel` deps.
- *Affected files* → *Affected notes* label change, conditional on a configured vault root.

**Out:**
- Migration of historical JSONL lines — the read-side fallback handles them; no rewrite pass.
- Renaming the JSONL `affectedFiles` field — would break the cross-process schema for no UI gain.
- Filename-collision disambiguation (two `index.md` both display as `index.md`) — premature; no use case yet.
- Extension stripping — `.md` is the conventional cue users scan for.
- Hover tooltips of the full path — premature; the link target carries the full path on click.
- Re-materialisation of agent hooks on settings change — out of scope; hooks already re-materialise on plugin reload, which is the existing contract.
- Removal of the read-side fallback — transitional but no removal step ships in this iteration.

## Relationship to existing system

- **Extends `cast-progress-events`'s `stop.sh` renderer.** That iteration baked the log and scratch paths into the script; this one adds the vault root alongside them, on the same materialisation path.
- **Builds on `cast-log-panel`'s expanded-row contract.** The link rendering for *Context notes* and *Affected notes* still routes clicks through the injected `openLink` callback; only the link text and label changed.
- **Reuses `GrimoireSettings.vaultMountPath`.** No new settings field, no UI surface — the same value already consumed by the forge system prompt is threaded through one new port and one new panel dep.
- **`HookMaterializer` and `CastLogModule` retain their port-and-thunk shape.** Settings edits picked up on next reload, same as every other materialised surface.

## Behavior changes

- **`stop.sh` output paths:** previously wrote absolute paths into `affectedFiles` (e.g. `/vault/Notes/foo.md`). Now writes vault-relative paths (`Notes/foo.md`) when `vaultMountPath` is set; falls back to the previous absolute-path behaviour when it is empty. Reason: vault-relative paths are what Obsidian's link resolver expects, and the inconsistency belonged at the writer.
- **Cast Log row link text:** previously rendered the raw stored path as link text. Now renders the basename of the display-normalised path; the click target is the normalised (vault-relative) path. Reason: short, scannable labels in the panel; full-path resolution on click.
- **Affected-list label:** previously *Affected files:*. Now *Affected notes:* whenever `vaultRootAbs` is non-empty (legacy label preserved otherwise). Reason: "notes" matches the user's mental model in an Obsidian vault.
- **`renderStopScript` signature:** previously `{ logPathAbs, scratchDirAbs }`. Now also accepts an optional `vaultRootAbs`; empty or omitted reproduces the prior script byte-for-byte. Reason: keep the change backward-compatible at the renderer layer so callers and tests migrate incrementally.
