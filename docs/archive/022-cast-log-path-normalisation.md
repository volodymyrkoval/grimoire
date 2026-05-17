# Cast Log path normalisation

> **Pitch source:** `brain/Grimoire - Cast Log path normalisation.md`
> **Plan date:** 2026-05-17 — branch `main`
> **Complexity:** Medium — three concerns (writer normalisation, read-side fallback, display basename + label rename), each at a different layer. No new dependencies, no schema change.

## Goal & scope

Make the Cast Log panel's expanded body present *Context notes* and *Affected notes* as short, consistent, clickable labels rather than as full paths — and stop the inconsistency at the writer (hook script) where it originates.

Three concrete behaviour changes:

1. **Writer-side normalisation.** `stop.sh` (rendered by `renderStopScript` and materialised under `<plugin-dir>/agent-hooks/`) strips the vault-root prefix from every captured tool-call path before writing the JSONL `done` line. The vault root is baked into the script at materialisation time, alongside the log and scratch paths that are already baked in.
2. **Read-side soft normalisation.** When the panel renders a recorded path, if the path is absolute and starts with the vault root, the prefix is stripped before display and link resolution. Otherwise the path is passed through unchanged. This serves only legacy entries written before the writer-side fix; new entries are already vault-relative.
3. **Display rendering.** Both lists (*Context notes* and *Affected notes*) render the **basename** as the link text; the link's target stays the full vault-relative path so Obsidian's link resolver opens the right file. The user-facing label *Affected files* changes to *Affected notes*. The JSONL field name (`affectedFiles`) is unchanged.

### Out of scope

- Migration of historical JSONL lines (the read-side fallback handles them).
- Renaming the JSONL `affectedFiles` field.
- Filename-collision disambiguation (two `index.md` both display as `index.md`).
- Extension stripping (`.md` stays).
- Hover tooltips of the full path.
- Multi-line wrapping / list-formatting refactor.
- Permanent compatibility shim; the read-side fallback is transitional but no removal step ships in this plan.

## Proposed solution

The three changes map to three sections, dispatched outside-in so the UI contract pins first.

```
Section A: UI integration test + display layer
   └─ ui-integration-tester writes the red contract:
        "row shows basename for both lists; link target is full path;
         legacy absolute paths with vault-root prefix display as basename
         of the stripped suffix; label reads 'Affected notes'."
   └─ junior-dev adds a pure basename helper + read-side soft normaliser,
        and a senior-dev wires them into CastLogRow.

Section B: Writer-side normalisation in the stop.sh template
   └─ junior-dev extends renderStopScript to accept vaultRootAbs and
        emit a sh prefix-strip step (no fallback branch); shell integration
        tests run the script under real /bin/sh against a temp vault root.

Section C: Wire the vault root through HookMaterializer + CastLogModule
   └─ junior-dev threads vaultMountPath as a port into HookMaterializer
        for the agent-hooks materialisation site, and CastLogModule reads
        it from settings.
```

`CastLogReader` / `foldEvents` are not modified — folding stays pure over raw event data. Display-time normalisation is a UI concern and lives at the UI seam.

## Components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `renderStopScript` (extended) | `src/castLog/hookScripts.ts` | Pure renderer — now accepts `vaultRootAbs` and emits a `sh` prefix-strip step that runs after `sort -u` and before JSON-array construction. |
| `HookMaterializer` (extended) | `src/castLog/HookMaterializer.ts` | Adds `getVaultRootAbs: () => string` port; passes the value into `renderStopScript`. |
| `CastLogModule` (extended) | `src/main/CastLogModule.ts` | Wires the new port from settings (`vaultMountPath`). |
| `toDisplayPath` (new) | `src/castLog/format/toDisplayPath.ts` | Pure: `(rawPath, vaultRootAbs) → string`. If `rawPath` is absolute and starts with `vaultRootAbs`, strip the prefix (and any leading `/`). Else pass through. |
| `basename` (new) | `src/castLog/format/basename.ts` | Pure: returns the last segment of a path. Trailing slashes are stripped before splitting. Empty input → empty string. |
| `CastLogRow` (modified) | `src/ui/components/CastLogRow.ts` | Receives a new `vaultRootAbs: string` via the existing dep wiring; uses `toDisplayPath` + `basename` for link text on both lists; renders the link `href` and `onOpenLink` argument as the normalised (vault-relative) path so the resolver works. Label text changes to `Affected notes:`. |
| `CastLogPanel` + `CastLogList` (modified) | `src/ui/tabs/CastLogPanel.ts`, `src/ui/components/CastLogList.ts` | Pass `vaultRootAbs` through to each row at construction time. |
| `main.ts` / `CastLogModule.buildCastLogPanelDeps` | (existing wiring) | Adds `getVaultRootAbs: () => settings.vaultMountPath` into the panel deps. |

## Interfaces

```ts
// hookScripts.ts — signature extended
export function renderStopScript(args: {
  logPathAbs: string;
  scratchDirAbs: string;
  vaultRootAbs: string;          // NEW — empty string ⇒ no normalisation step emitted
}): string;

// HookMaterializerPorts — extended
export interface HookMaterializerPorts {
  getPluginDirAbs: () => string;
  getLogPathAbs: () => string;
  getVaultRootAbs: () => string; // NEW — empty string is a valid value (means "skip normalisation")
  writeFile?: (filePath: string, content: string) => Promise<void>;
  mkdir?: (dir: string) => Promise<void>;
  adapter?: DataAdapter;
  hooksDir?: string;
}

// New pure helpers
export function basename(path: string): string;
export function toDisplayPath(rawPath: string, vaultRootAbs: string): string;
```

`toDisplayPath` contract:

| Input `rawPath`                     | `vaultRootAbs`     | Output |
|-------------------------------------|--------------------|--------|
| `Notes/foo.md`                      | `/vault`           | `Notes/foo.md` (pass-through — already relative) |
| `/vault/Notes/foo.md`               | `/vault`           | `Notes/foo.md` |
| `/vault/Notes/foo.md`               | `/vault/`          | `Notes/foo.md` (trailing slash tolerated) |
| `/other/abs/foo.md`                 | `/vault`           | `/other/abs/foo.md` (pass-through — different machine) |
| `/vault`                            | `/vault`           | `/vault` (degenerate — no normalisation) |
| `Notes/foo.md`                      | `''` (no setting)  | `Notes/foo.md` (pass-through) |
| `/vault/Notes/foo.md`               | `''`               | `/vault/Notes/foo.md` (pass-through — cannot strip without root) |
| `''`                                | any                | `''` |

`basename` contract:

| Input              | Output |
|--------------------|--------|
| `Notes/foo.md`     | `foo.md` |
| `foo.md`           | `foo.md` |
| `Notes/sub/foo.md` | `foo.md` |
| `Notes/`           | `Notes` (strip trailing slash, then last segment) |
| `''`               | `''` |

Both functions are pure POSIX-style — they split on `/`, never on the OS separator. Vault paths are `/`-delimited regardless of platform (Obsidian normalisation already enforces this).

## Data flow

```
Hook script materialisation (plugin onload)
   settings.vaultMountPath ─┐
                            ▼
   CastLogModule ──→ HookMaterializer.run() ──→ renderStopScript({ vaultRootAbs }) ──→ stop.sh on disk

Cast execution (Claude Code side)
   PostToolUse → /vault/Notes/foo.md → scratch/<castId>.paths (absolute paths)
   Stop hook  → reads scratch, sort -u, strips vault-root prefix line-by-line,
                json-encodes the (now vault-relative) list,
                writes done line with affectedFiles: ["Notes/foo.md", ...]

Panel render
   CastRecord.affectedFiles (mix of vault-relative new + absolute legacy)
        │
        ▼
   For each path:
     displayPath = toDisplayPath(rawPath, vaultRootAbs)     ← strip legacy abs prefix
     linkText    = basename(displayPath)                    ← short label
     linkTarget  = displayPath                              ← full vault-relative path
   onOpenLink(displayPath) on click ─→ workspace.openLinkText
```

## Error handling

- `vaultMountPath` empty (user hasn't set it): writer emits the stop script *without* the prefix-strip step (the renderer guards `vaultRootAbs === ''`). Read-side fallback no-ops the same way. Result: paths flow through unchanged — degraded but not broken.
- Path with embedded double-quotes: the existing `shellEscape` already covers `vaultRootAbs` baking into the script. The shell prefix-strip itself uses `sh` parameter expansion (`${path#"$VAULT_ROOT/"}`) which handles quotes inside the variable safely.
- Non-prefix absolute path (e.g. log written on another machine, then synced): `${path#"$VAULT_ROOT/"}` leaves it untouched; line survives the pipeline as-is.
- `python3` absent (existing behaviour): unchanged — silent degradation already documented.
- DOM-level: `basename('')` returning `''` would render an empty `<a>`; the row already guards on `record.affectedFiles?.length === 0` and `record.contextNotes.length === 0` before rendering the section, so empty paths inside a non-empty array are a producer bug — surface as the empty string and move on. No defensive throw.

## Technical notes

- **Vault root in the shell.** Bake the vault root into `stop.sh` via the same `shellEscape` pattern used for `logPathAbs` and `scratchDirAbs`. The shell variable is `VAULT_ROOT`; the strip is a per-line `sed` or a `while read` loop with `${line#"$VAULT_ROOT/"}`. Use `${#}` parameter expansion (POSIX) rather than `sed` to keep the dependency surface flat — `python3` is already an optional dependency; adding `sed` reliance for `BSD vs GNU` differences is needless.
- **Empty `vaultRootAbs` is a valid input, not an error.** The renderer treats it as "user hasn't configured the vault mount; emit the legacy stop script". This keeps the contract one-shape and avoids forcing CastLogModule to refuse to materialise hooks before the user fills in Settings.
- **No new `vault-root` constant**. `vaultMountPath` already exists in `GrimoireSettings`; thread it.
- **Display basename is `/`-only.** Vault paths are POSIX-style; Obsidian normalises Windows backslashes upstream. A `basename` that splits on both separators would suggest the rest of the codebase needs to as well — it doesn't.
- **Patterns considered.**
  - *Strategy for "writer-normalised vs reader-normalised"* — rejected: only one algorithm of each kind exists, YAGNI.
  - *Decorator over `foldEvents` to normalise paths during folding* — rejected: pushes a UI concern (display) into a pure data fold and hides the legacy fallback in a place tests for fold don't expect.
  - *Adapter wrapping the path normaliser* — rejected: both helpers are pure one-liners; a class would obscure the fact that they're stateless utilities.
  - *Template Method on `CastLogRow` for "renderPathList"* — accepted implicitly: the existing `appendContextNotesRow` / `appendAffectedFilesRow` already are the template shape. We will extract a single helper `appendPathLinkList(body, label, paths, vaultRoot, onOpenLink)` that both call into, since the two functions differ only in CSS class + label + source field. This is a refactor budget choice — without it we'd duplicate the basename logic.
- **Coupling.** `vaultRootAbs` is threaded through one extra dep on the panel side (`getVaultRootAbs`) and one extra port on the materializer side (`getVaultRootAbs`). Both are thunks, not captured strings, so a `Settings`-tab edit (which already triggers re-materialisation of forge) picks up changes on the next `materializeForge`-equivalent reload. Re-materialisation of the agent hooks on settings-change is *out of scope* — hooks already re-materialise on plugin reload, which is the existing contract.
- **Test seam.** Three independent test files: pure unit tests for `basename` + `toDisplayPath`, extension of `tests/castLog/hookScripts.test.ts` and `tests/castLog/hookScripts.integration.test.ts` for the writer-side, and extension of `tests/integration/CastLogRow.spec.ts` for the UI. The integration test pins the contract end-to-end.

## Todos

### A. UI integration test + display layer

#### Section briefing

1. **What this section produces** — A `tests/integration/CastLogRow.spec.ts` extension covering basename rendering for both lists, legacy-prefix soft normalisation on display, the `Affected notes` label, and link-target preservation. Then two new pure helpers (`src/castLog/format/basename.ts`, `src/castLog/format/toDisplayPath.ts`) with their own unit test files, and modifications to `src/ui/components/CastLogRow.ts` (and its construction wiring in `src/ui/components/CastLogList.ts` + `src/ui/tabs/CastLogPanel.ts`) to consume them. Public surface: see Interfaces — `basename`, `toDisplayPath`, and the new `vaultRootAbs` field threaded through `CastLogRow`'s constructor.
2. **Design context the executor needs upfront** — From Technical notes: *"`vaultRootAbs` is threaded through one extra dep on the panel side (`getVaultRootAbs`)… Both are thunks, not captured strings."* From Components: *"`CastLogRow` … receives a new `vaultRootAbs: string` via the existing dep wiring; uses `toDisplayPath` + `basename` for link text on both lists; renders the link `href` and `onOpenLink` argument as the normalised (vault-relative) path."* The label string change is decision #3 in Goal & scope: `Affected files:` → `Affected notes:` (JSONL field unchanged).
3. **Cross-section couplings** —
   - A6 (senior-dev: wire `vaultRootAbs` into rows) consumes the helper signatures landed in A3/A4 and is the seam that section B's writer-side normalisation eventually replaces for new entries; the read-side fallback this todo enables must not throw or behave differently when paths are *already* vault-relative (the future post-B steady state).
   - A1 (the integration test) pins the contract that section C will also satisfy when wiring the materializer port — but A1's assertions are UI-only; no test in A1 reaches into HookMaterializer or stop.sh.
   - The renamed label `Affected notes:` is only emitted by the UI; section B's JSONL `done` line still carries the field name `affectedFiles`. The plan's "Do not rename the JSONL field" no-go is enforced by leaving `src/castLog/types.ts` and `src/castLog/CastRecord.ts` untouched.
4. **Section-level Red criterion** — `tests/integration/CastLogRow.spec.ts` contains new specs that fail until A3–A7 land: (a) given `affectedFiles: ['Notes/foo.md', '/vault/Notes/bar.md']` and `vaultRootAbs = '/vault'`, the row renders two `<a>` elements with text `foo.md` and `bar.md` (basenames), `href = '#'`, and `onOpenLink` is called with `'Notes/foo.md'` / `'Notes/bar.md'` respectively when clicked; (b) the `.cast-log-affected-files-row .cast-log-field-label` text is `Affected notes:`; (c) the same basename rule applies to `.cast-log-context-notes-row` links; (d) an `/other/abs/x.md` path (no vault-root prefix) renders as `x.md` (basename), and `onOpenLink` is invoked with the unchanged `/other/abs/x.md` (pass-through). Pure unit specs for `basename` and `toDisplayPath` mirror the contract tables in the Interfaces section.

**ui-integration-tester**
- [x] A1: extend `tests/integration/CastLogRow.spec.ts` with the four specs in the Red criterion above (basename + label + legacy abs + pass-through). Use `vaultRootAbs = '/vault'` in fixtures. Click-target assertion: spy `openLink` and verify the arg is the normalised path, not the raw record path — S, ui-integration-tester

**junior-dev**
- [x] A2: add `src/castLog/format/basename.ts` exporting `basename(path: string): string` per the Interfaces contract table. Implementation: strip trailing `/`, return substring after the last `/`, else the whole input — S, junior-dev (7076a7f)
- [x] A3: add `tests/castLog/format/basename.test.ts` covering every row of the `basename` contract table (incl. empty input, trailing slash, no separator, multi-segment) — S, junior-dev
- [x] A4: add `src/castLog/format/toDisplayPath.ts` exporting `toDisplayPath(rawPath, vaultRootAbs): string` per the Interfaces table. Implementation: if `rawPath === ''` return `''`; if `vaultRootAbs === ''` return `rawPath`; normalise `vaultRootAbs` by stripping any trailing `/`; if `rawPath === vaultRootAbs` return `rawPath` (degenerate guard); if `rawPath.startsWith(vaultRootAbs + '/')` return `rawPath.slice(vaultRootAbs.length + 1)`; else return `rawPath` — S, junior-dev (295621a)
- [x] A5: add `tests/castLog/format/toDisplayPath.test.ts` covering every row of the `toDisplayPath` contract table — S, junior-dev (295621a)

**senior-dev**
- [x] A6: modify `src/ui/components/CastLogRow.ts` constructor to accept `vaultRootAbs: string`; extract the shared list-rendering shape into a single private/module helper `appendPathLinkList(body, { label, cssRowClass, cssSectionClass, paths, vaultRootAbs, onOpenLink })` that computes `displayPath = toDisplayPath(p, vaultRootAbs)` and `linkText = basename(displayPath)`, sets `href = '#'`, and calls `onOpenLink(displayPath)` on click. Rewrite `appendContextNotesRow` and `appendAffectedFilesRow` to delegate to it. Change the *Affected files:* label string to `Affected notes:` (CSS class names unchanged — keep `.cast-log-affected-files-row` / `.cast-log-affected-files` for backward CSS compatibility) — M, senior-dev (49a76a2)
- [x] A7: thread `vaultRootAbs` through to `CastLogRow`. `src/ui/components/CastLogList.ts` accepts it on construction and passes it to each new `CastLogRow`. `src/ui/tabs/CastLogPanel.ts` adds `vaultRootAbs` (or a `getVaultRootAbs: () => string` thunk evaluated at render time) to its deps and forwards it. `src/main/CastLogModule.buildCastLogPanelDeps()` sources it from settings via the same `getSettings` thunk pattern already used for `vaultMountPath`. Verify A1 now green — M, senior-dev (dbf87a8)

### B. Writer-side normalisation in stop.sh

#### Section briefing

1. **What this section produces** — Extension of `renderStopScript` in `src/castLog/hookScripts.ts` to accept `vaultRootAbs: string` and emit (when non-empty) a per-line POSIX prefix-strip step between `sort -u` and the JSON-array construction. Tests landed in `tests/castLog/hookScripts.test.ts` (unit) and `tests/castLog/hookScripts.integration.test.ts` (runs under real `/bin/sh` against a temp directory).
2. **Design context the executor needs upfront** — From Technical notes: *"Use `${#}` parameter expansion (POSIX) rather than `sed` to keep the dependency surface flat."* From Technical notes: *"Empty `vaultRootAbs` is a valid input, not an error… emit the legacy stop script."* From Pitch (verbatim): *"Since Claude Code is sandboxed to the vault, every captured path sits under the vault root by construction — no safety hatch, no fallback branch."* The prefix-strip step therefore does **not** branch on "does it match?" — `${line#"$VAULT_ROOT/"}` is a no-op when the prefix is absent, which is correct behaviour for an off-root path on the rare cross-vault sync edge.
3. **Cross-section couplings** —
   - B2 depends on C1: the `vaultRootAbs` value baked into the script comes from the `getVaultRootAbs` port added to `HookMaterializerPorts` in section C. Until C1 lands, `renderStopScript` has a `vaultRootAbs` parameter but no caller is passing it — that is acceptable; B-section tests pass `vaultRootAbs` directly to the renderer.
   - The on-disk JSONL contract is unchanged — `affectedFiles` field, JSON-array of strings. Section A's read-side fallback is the safety net for any line written before section B reaches a user's machine.
4. **Section-level Red criterion** — `tests/castLog/hookScripts.integration.test.ts` contains a new spec: given a scratch file pre-populated with `/vault/a.md\n/vault/sub/b.md\n/other/c.md\n` and `renderStopScript({ logPathAbs, scratchDirAbs, vaultRootAbs: '/vault' })`, running the script under `/bin/sh` writes one `done` line whose `affectedFiles` equals `['/other/c.md', 'a.md', 'sub/b.md']` (sorted post-dedup). A separate spec verifies that `vaultRootAbs: ''` reproduces the current behaviour byte-for-byte (regression fence: existing tests in this file must still pass with the new signature when called with `vaultRootAbs: ''`).

**junior-dev**
- [x] B1: extend `renderStopScript` signature in `src/castLog/hookScripts.ts` to accept `vaultRootAbs: string`. When `vaultRootAbs === ''`, emit the current script body unchanged (preserves the existing tests in `tests/castLog/hookScripts.test.ts`). When non-empty, bake `VAULT_ROOT="${shellEscape(vaultRootAbs.replace(/\/$/, ''))}"` (trailing slash stripped) and insert a per-line strip *between* `sort -u "$SCRATCH"` and the python3 JSON encoder. Implementation pattern: pipe `sort -u` through a `while IFS= read -r line; do printf '%s\n' "${line#"$VAULT_ROOT/"}"; done` filter before piping into `python3`. Keep `python3` as the JSON encoder — unchanged — S, junior-dev (b676fe1)
- [x] B2: extend `tests/castLog/hookScripts.test.ts` with `renderStopScript` cases: (a) `vaultRootAbs: ''` produces a script string that contains no `VAULT_ROOT=` assignment; (b) `vaultRootAbs: '/v'` produces a script string containing `VAULT_ROOT="/v"`; (c) trailing-slash `vaultRootAbs: '/v/'` still produces `VAULT_ROOT="/v"` (one assignment, no double slash); (d) double-quote in `vaultRootAbs` is escaped via `shellEscape` (e.g. `/v"q` → `VAULT_ROOT="/v\"q"`); (e) `vaultRootAbs: ''` regression — the rendered script is byte-equal to the pre-change baseline (snapshot or `toContain`-style assertions on the unchanged shell pipeline) — S, junior-dev
- [x] B3: extend `tests/castLog/hookScripts.integration.test.ts` with the integration spec from the Red criterion (mixed pre-populated scratch, `vaultRootAbs: '/vault'`, asserts `affectedFiles` is the deduplicated + sorted + prefix-stripped list). Reuse the existing `mkTempDir` / `materializeScript` / `runShell` / `readLog` helpers — S, junior-dev
- [x] B4: edge case integration spec: same setup but `vaultRootAbs: ''` (legacy mode) — verify the `done` line carries the raw paths from scratch with no stripping, proving the regression-fence behaviour end-to-end — S, junior-dev
- [x] B5: edge case integration spec: path equal to vault root (`/vault\n` alone in scratch, `vaultRootAbs: '/vault'`) — verify the `done` line carries `affectedFiles: ['/vault']` (degenerate guard: only the `/vault/` prefix strips; a bare match is unchanged). This pins the contract from the `toDisplayPath` table row "input = vaultRootAbs → output = rawPath" symmetrically on the writer side — S, junior-dev (be28a7a)

### C. Wire vault root through HookMaterializer + CastLogModule

#### Section briefing

1. **What this section produces** — A new `getVaultRootAbs: () => string` port on `HookMaterializerPorts` in `src/castLog/HookMaterializer.ts`, threaded into `renderStopScript` at call time, and sourced from `settings.vaultMountPath` by `CastLogModule` in `src/main/CastLogModule.ts` via the existing `getSettings` pattern. Tests in `tests/castLog/HookMaterializer.test.ts` and `tests/CastLogModule.test.ts` cover the wiring.
2. **Design context the executor needs upfront** — From Technical notes: *"`vaultMountPath` already exists in `GrimoireSettings`; thread it."* From Components: *"`CastLogModule` … Wires the new port from settings (`vaultMountPath`)."* The existing `ForgeSystemPromptInput` already exposes `vaultMountPath`; the same thunk shape (`() => ({ vaultMountPath: this.data.settings.vaultMountPath })`) is reused — no new settings field, no UI surface, no migration.
3. **Cross-section couplings** —
   - C1 is the wiring without which B1's new parameter is dead — but B1 ships an empty-string default behaviour (the legacy script), so the two sections can land independently. The integration only becomes user-visible once both are in.
   - The local-hooks materialiser site (`HookMaterializer` constructed for the *plugin*-side hooks, distinct from the agent-hooks site) currently shares the same code path. There is only **one** materialiser code path in this codebase but two callers in `CastLogModule.#runRemoteHookMaterializer` (agent hooks, used by Claude Code for `affectedFiles`). The plugin itself does not write `affectedFiles` lines — only the agent-hooks copy of `stop.sh` does. Confirm by inspection: `initStartupMaintenance` only invokes `#runRemoteHookMaterializer`. C1 wires `getVaultRootAbs` exactly once, at that site.
4. **Section-level Red criterion** — `tests/castLog/HookMaterializer.test.ts` contains a new spec: given `getVaultRootAbs: () => '/vault'`, the call to `writeFile` for `stop.sh` receives a content string equal to `renderStopScript({ logPathAbs, scratchDirAbs, vaultRootAbs: '/vault' })`. A second spec: given `getVaultRootAbs: () => ''`, the same call receives content equal to `renderStopScript({ logPathAbs, scratchDirAbs, vaultRootAbs: '' })`. `tests/CastLogModule.test.ts` verifies that `initStartupMaintenance` constructs the materialiser with a `getVaultRootAbs` thunk that returns `settings.vaultMountPath`.

**junior-dev**
- [x] C1: add `getVaultRootAbs: () => string` to `HookMaterializerPorts` in `src/castLog/HookMaterializer.ts`. In `#materializeScripts`, pass `vaultRootAbs: this.#ports.getVaultRootAbs()` into the `renderStopScript` call. No default value — the port is required; callers without a vault root pass `() => ''` explicitly — S, junior-dev (8542176)
- [x] C2: update `tests/castLog/HookMaterializer.test.ts`: (a) every existing test gains `getVaultRootAbs: () => ''` in the ports literal — this is a mechanical addition; (b) add a new spec asserting `stop.sh` content matches `renderStopScript({ ..., vaultRootAbs: '/vault' })` when `getVaultRootAbs: () => '/vault'`; (c) add a spec asserting `stop.sh` content matches `renderStopScript({ ..., vaultRootAbs: '' })` when the port returns `''` — S, junior-dev
- [x] C3: update `MaterializerPorts` type and `#runRemoteHookMaterializer` in `src/main/CastLogModule.ts` to include `getVaultRootAbs`. Wire it via `getVaultRootAbs: () => this.#getSettings().vaultMountPath`. The `getSettings` thunk already returns `{ spellTag, forgeOutputFolder, vaultMountPath }` — no change to `ForgeSystemPromptInput`; the same property is reused — S, junior-dev (eae0960)
- [x] C4: extend `tests/CastLogModule.test.ts` with a spec verifying that the `materializerFactory` injection point receives ports whose `getVaultRootAbs()` returns the value of `vaultMountPath` from `getSettings`. Use a fake `materializerFactory` that captures the ports it was called with, mirroring the existing factory-spy pattern in the file — S, junior-dev (149e3d4)

## Overall effort summary

- **A:** 1 ui-integration-tester (S), 4 junior-dev (S/S/S/S), 2 senior-dev (M/M) — 7 todos
- **B:** 5 junior-dev (S/S/S/S/S) — 5 todos
- **C:** 4 junior-dev (S/S/S/S) — 4 todos

**Totals:** 16 todos — S × 14, M × 2, L × 0
**Dev tiers:** ui-integration-tester × 1, junior-dev × 13, senior-dev × 2, lead-dev × 0

**Tier-mix sanity:** junior-dev dominates (13/16). Senior-dev appears only twice in section A — for the `CastLogRow` refactor that introduces the `appendPathLinkList` helper (a non-trivial structural choice that ripples through two existing functions and the row's public construction signature) and the wiring across `CastLogList` / `CastLogPanel` / `CastLogModule`. No lead-dev work: no concurrency, no perf, no unknown root cause, no security surface.

reviewed @ 149e3d4
