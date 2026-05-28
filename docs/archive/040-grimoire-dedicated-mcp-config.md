# 040 — Grimoire: Dedicated MCP config

> Complexity: **Medium**. Source pitch: `brain/Grimoire - Dedicated MCP config.md` (Shape Up, small batch).
> Single Settings field → two appended CLI flags on `claude -p` invocations → predictable, isolated MCP surface per cast. No new transports, no new modules.

## Goal & scope

Give the user one knob that makes local casts pass `--mcp-config <path> --strict-mcp-config` to `claude -p`, so a cast's MCP server set becomes **exactly** what the named file declares — independent of `~/.claude.json`, project `.mcp.json`, claude.ai connectors, or anything else the machine happens to carry. The two flags are atomic: appended together or not at all, because strict mode is the load-bearing half.

**Behaviour contract:**

- A new free-text field "MCP config path" appears in the **General** section of `GrimoireSettingTab`, alongside CLI command and binary path.
- Persisted as `mcpConfigPath: string` on `GrimoireSettings`; default `""`.
- When the value is **non-empty after trim**, `buildCastArgs` appends `--mcp-config <path> --strict-mcp-config` to every local cast (both inline and file-based). The path string is passed verbatim — no resolution, no validation, no expansion.
- When the value is **empty or whitespace-only**, both flags are omitted and casts behave exactly as today (inheriting whatever scopes the machine has).
- No remote/portal change: `RemoteCaster` is untouched; the setting is a local-cast concern.

### In scope

- `mcpConfigPath: string` field on `GrimoireSettings` (+ `DEFAULT_SETTINGS: ''`).
- One text row in `GrimoireSettingTab.#renderGeneralSection`, placed between "Binary path" and "Forge output folder".
- `mcpConfigPath` plumbed through `CastArgsInput` (base) → `LocalCaster` → `CastRunner` → `buildCastArgs`.
- The atomic two-flag append logic in `buildCastArgs`, gated by a trimmed-non-empty check.
- Unit tests over `buildCastArgs` covering: empty path → no flags; whitespace-only path → no flags; non-empty path → both flags in correct order; both flags coexist with existing `--effort` / `--add-dir` / `--system-prompt-file` flags without collision.
- One integration assertion in the existing `tests/integration/settings-panel.spec.ts` seam: the new text row is rendered, typing writes through, and `plugin.save()` is called (mirrors the existing row-count + write-through pattern).
- README: in step-1 of *Getting started*, add a one-paragraph note reconciling `claude mcp list` with `--strict-mcp-config` (the listing reflects ambient scopes, not what loads at cast time when the setting is on); state plainly that the **server names in the permission allow-list must match the names declared in the Grimoire MCP file**, not whatever `claude mcp list` shows.

### Out of scope (No-Gos from the pitch — enforce)

- **No file picker / browse button.** Passive path entry only, matching every other field in the tab.
- **No "test config" button**, no JSON parsing, no schema validation. If the path is wrong, the cast surfaces the error like any other CLI failure — same blast radius as a bad binary path today.
- **No Grimoire-authored or Grimoire-mutated MCP file.** The plugin only points `claude -p` at a path the user controls. (A starter-config bundle is out — see "Deferred", below.)
- **No path normalisation / expansion** (no `~` expansion, no `path.resolve`, no `app.vault.adapter.getResourcePath`). The user-supplied string is passed verbatim. `claude` will resolve relative paths against its cwd, which is `vaultMountPath`.
- **No remote/portal handling.** The portal builds its own invocation on its own host; a plugin-side local path is meaningless there. `RemoteCaster` and the portal request shape stay untouched.
- **No per-provider generalisation.** This is a Claude-invocation flag for the one provider Grimoire supports today. When the adapter contract lands, "how MCP config is passed" becomes per-adapter — this plan conforms to that later, it does not pre-empt it.
- **No automatic discovery of server names**, no enumeration, no `claude mcp list` shelling.
- **No migration logic** — the new field defaults to `""`, which is exactly the legacy behaviour. Existing data files load with `mcpConfigPath` absent → hydrate fills the default → no flags appended → identical behaviour to before. No version bump, no data migration step.

## Proposed solution

The data is a single string that rides the existing settings → caster → runner → args-builder chain. The only behavioural fork is inside `buildCastArgs`: a `trim() !== ''` check that decides whether to append two flags in a fixed order. Strict-mode and the path are inseparable — they are appended together or not at all, in one branch, never as two independent decisions.

```
GrimoireSettingTab (General section: MCP config path)
   ↓ plugin.data.settings.mcpConfigPath
   ↓ plugin.save()
LocalCaster (already holds #settings: GrimoireSettings)
   ↓ runInput.mcpConfigPath = this.#settings.mcpConfigPath
CastRunner.#getCastArgs  → strips binaryPath/cliCommand/castId, passes the rest
   ↓ castArgsInput.mcpConfigPath
buildCastArgs
   ↓ if mcpConfigPath.trim() !== '' → push('--mcp-config', mcpConfigPath, '--strict-mcp-config')
spawned `claude` process
```

No new modules. No transport change. No new classes.

## Components

| Component | File | Responsibility |
|-----------|------|----------------|
| `GrimoireSettings` | `src/domain/settings/Settings.ts` | Add `mcpConfigPath: string` field; default `''` in `DEFAULT_SETTINGS`. |
| `GrimoireSettingTab` | `src/ui/settings/GrimoireSettingTab.ts` | Render new text row in `#renderGeneralSection`, between "Binary path" and "Forge output folder". Reuses the existing `#addTextField` helper — no new method. |
| `BaseCastArgsInput` (type) | `src/cast/local/buildCastArgs.ts` | Add `mcpConfigPath: string` field (required, default-handled at the caster). |
| `buildCastArgs` | `src/cast/local/buildCastArgs.ts` | When `input.mcpConfigPath.trim() !== ''`, append `--mcp-config <path> --strict-mcp-config` to the args array, atomically. Placement follows existing flag order (after model/permission-mode/effort/add-dir is fine; consistency with neighbouring flag pushes). |
| `BaseCastRunInput` (type) | `src/cast/local/CastRunner.ts` | Add `mcpConfigPath: string`. |
| `LocalCaster` | `src/cast/local/LocalCaster.ts` | Thread `#settings.mcpConfigPath` into both the inline and file-mode branches of `runInput` (mirrors the existing `binaryPath`/`cliCommand`/`echoOutput` plumbing). |
| README onboarding | `README.md` | Add the cross-reference paragraph between step 1 (MCP setup) and step 2 (permissions): when "MCP config path" is set, `claude mcp list` no longer reflects load-time reality, so the permission allow-list's `mcp__<name>__*` entries must match the names declared in the user's Grimoire MCP file, not what `claude mcp list` shows. |

No new files. All changes are in-place to existing modules.

## Interfaces

```ts
// src/domain/settings/Settings.ts
export interface GrimoireSettings {
  // ...existing fields...
  /** Absolute or relative path to a dedicated MCP config file. When non-empty (after trim),
   *  local casts append `--mcp-config <path> --strict-mcp-config` to `claude -p`, making
   *  the cast's MCP server set exactly what the file declares (ignoring all configured
   *  scopes). When empty, both flags are omitted and casts inherit ambient MCP state.
   *  Passed verbatim — no expansion, no validation. */
  mcpConfigPath: string;
}

// DEFAULT_SETTINGS gains: mcpConfigPath: ''

// src/cast/local/buildCastArgs.ts
interface BaseCastArgsInput {
  modelId: string;
  effort: Effort | null;
  vaultMountPath: string;
  /** See GrimoireSettings.mcpConfigPath. Verbatim string. */
  mcpConfigPath: string;
}

// src/cast/local/CastRunner.ts
interface BaseCastRunInput {
  // ...existing fields...
  mcpConfigPath: string;
}
```

**Argv contract for `buildCastArgs`** when `mcpConfigPath.trim() !== ''`:

- The pair `--mcp-config <path>` and the standalone flag `--strict-mcp-config` are both appended.
- They appear consecutively, in the order `--mcp-config <path>` first, then `--strict-mcp-config`.
- They never appear independently (no half-applied state).
- They append **after** the existing args (model / permission-mode / effort / add-dir) — placement is at the tail. This matches `--add-dir`'s position today and keeps the diff local to the function's last block.

## Data flow

Unchanged shape; one extra field traverses the existing chain. The new field is read once at cast time (no caching, no derived state) and consumed once at argv construction. There is no other consumer.

## Error handling

- **Invalid / non-existent path:** not detected by Grimoire. `claude -p` exits non-zero, `CastRunner.#onCastExit` reports the failure via the existing `callbacks.onFailure` path — identical UX to any other CLI failure. This is deliberate (No-Go: no "test config" button, no validation). The Cast Log will show the failure with the CLI's stderr tail.
- **Whitespace-only path:** treated as empty (trimmed). Both flags omitted. Mirrors the established empty-string convention used by `vaultMountPath` (`!== ''` check), but uses `trim()` because a path field is more likely to acquire stray whitespace through copy-paste than a vault mount default.
- **No try/catch added.** There is no new I/O, no async work, no parsing — there is nothing to wrap.

## Technical notes

- **Design-rubric §7 (one-reason-to-change applied per component AND per method):**
  - `GrimoireSettings` — changes when persisted settings shape changes. ✅
  - `GrimoireSettingTab.#renderGeneralSection` — changes when the General-section rows change. Adding one row stays one reason. The new row reuses `#addTextField`; no new private method introduced. ✅
  - `buildCastArgs` — changes when the argv contract for `claude -p` changes. The added branch is a single atomic decision (`if non-empty → push 3 args`), one level of abstraction with the existing `if effort !== null → push` and `if vaultMountPath !== '' → push` blocks. No conflation. ✅
  - `LocalCaster.cast` — already a two-branch wide-shape object literal; one extra field per branch. The duplicated-literal smell that already exists in `cast` is **not** a target of this plan (separate refactor concern); see "Patterns considered". ✅
- **Design-patterns pass:**
  - *Strategy for "with strict MCP" vs "without"* — **rejected**: the variation is one optional flag-pair on a stable command shape, not two algorithms. A Strategy would invent a hierarchy where the actual code is one `if`. YAGNI.
  - *Builder for the argv array* — **rejected**: `buildCastArgs` is already a small pure function returning an array; switching to a fluent builder would inflate LoC without adding meaning. The existing trailing `if` blocks are the local pattern; the new flag-pair follows it. Per design-rubric, consistency with neighbours beats novelty here.
  - *Adapter for per-provider MCP flag passing* — **rejected this cycle**: only one provider exists. Per the pitch's "No-Gos", when the adapter contract lands later, "how MCP config is passed" becomes per-adapter. This plan conforms to that future shape but does not build it.
  - *Validation / parser layer over the path* — **rejected**: explicit No-Go in the pitch ("over-building the Settings side — a file picker, a 'test config' button, JSON validation").
  - *Decompose `LocalCaster.cast`'s twin object literals into a shared base* — **noted, not acted on**. Both branches already duplicate `modelId / effort / vaultMountPath / binaryPath / cliCommand / castId / claudeHooksDir / echoOutput`; adding `mcpConfigPath` extends the duplication. This is a pre-existing smell (`refactor candidate, separate cycle`) that this plan deliberately does not enlarge into a refactor — adding the one field to both branches keeps the diff surgical and matches how `echoOutput` was added in `dev/done-039`. Flag only.
- **Argv ordering rationale:** placing `--mcp-config <path> --strict-mcp-config` at the tail (after `--add-dir`) keeps the function structure consistent — every conditional-append block sits at the tail of the function. Insertion order in argv doesn't matter to `claude` (flags are order-independent); the constraint is that the two flags are emitted together. The integration-shaped argv tests in `buildCastArgs.test.ts` should assert *adjacency and ordering of the pair* (`--mcp-config` immediately followed by the path, then `--strict-mcp-config` somewhere after), not absolute index positions — keep tests resilient to neighbouring-flag reordering.
- **UI integration test scope:** the existing `tests/integration/settings-panel.spec.ts` is the right seam; this plan adds one more text-row index to its row-count assertion and one new write-through test. We do **not** spin a new integration spec file — the seam is already pinned, and a single new field doesn't earn its own spec (per the planner's UI-integration emission rule: a spec is warranted when a *new* component seam appears, not for an n+1 row on an existing seam).
- **Permissions doc cross-reference is README-only this cycle.** The pitch wants the two docs to "agree" — the bigger docs site (`grimoire-docs`) is out of scope for plugin commits. The README is the surface we own. The cross-reference there is the deliverable; the rest is a docs-site follow-up that belongs to a `/docs` pass on the docs repo, not this plan.
- **Starter MCP config bundle is deferred.** The pitch mentions "onboarding can ship a starter config the same way it ships the permissions template" — but the permissions block in the README is shown inline as a code fence (not a shipped file), and the same shape works for MCP: a README snippet showing a minimal MCP config the user can paste. This plan delivers the README snippet (D2 below) but does **not** introduce any plugin-side starter file, manifest entry, or seeder — that would cross the "no Grimoire-authored MCP file" line.

## Todos

### A. Settings shape

#### Section briefing

**What this section produces.** Adds `mcpConfigPath: string` to `GrimoireSettings` (see Interfaces) in `src/domain/settings/Settings.ts`, with `''` in `DEFAULT_SETTINGS`. No new files, no signature changes to any function.

**Methods produced.** None — this is an interface-and-constant edit only. The `GrimoireSettings` interface gains one field; the `DEFAULT_SETTINGS` constant gains one key.

**Design context the executor needs upfront.** From Interfaces, verbatim: `mcpConfigPath: string` with the doc comment "Absolute or relative path to a dedicated MCP config file. When non-empty (after trim), local casts append `--mcp-config <path> --strict-mcp-config` to `claude -p` … Passed verbatim — no expansion, no validation." Default value is `''` (matches the established empty-string convention for `binaryPath`, `vaultMountPath`, `portalHost`, etc.). No migration logic is needed — existing data files load with the field absent; hydrate fills the default; identical behaviour to before.

**Cross-section couplings.**
- A1 is the type prerequisite for B1, C1, and D1. Land A1 first; the rest cannot compile without it.

**Section-level Red criterion.** Done when `GrimoireSettings` has the `mcpConfigPath: string` field, `DEFAULT_SETTINGS.mcpConfigPath === ''`, the JSDoc comment matches the Interfaces block above (no expansion / no validation / verbatim), and `npm test` is green (the existing `hydrate` test in `tests/infra/settingsPersistence.test.ts` — or wherever the hydration test lives — must still pass; verify by greps that no test pins `Object.keys(DEFAULT_SETTINGS).length` to a literal count).

**junior-dev**

- [x] A1: In `src/domain/settings/Settings.ts`, add `mcpConfigPath: string;` to the `GrimoireSettings` interface (after `binaryPath`, before `forgeOutputFolder` — matches the General-section row order in the settings tab). Add the JSDoc copied verbatim from the Interfaces section of this plan. In `DEFAULT_SETTINGS`, add `mcpConfigPath: '',` in the same positional slot. Do NOT touch any hydration code beyond this file. If `tests/infra/settingsPersistence.test.ts` (or any settings hydration test) asserts a literal `Object.keys(...).length` for `DEFAULT_SETTINGS`, bump that literal by one — but do not invent new tests here. — S, junior-dev

### B. Argv builder — atomic flag pair

#### Section briefing

**What this section produces.** Extends `BaseCastArgsInput` in `src/cast/local/buildCastArgs.ts` with the new field (see Interfaces) and adds the atomic two-flag append branch to `buildCastArgs`. Extends `tests/buildCastArgs.test.ts` with the empty / whitespace-only / non-empty / coexistence cases enumerated in the Edge-case section.

**Methods produced.** One existing pure function is modified:
- `buildCastArgs(input) — return argv for the cast CLI, including --mcp-config/--strict-mcp-config when input.mcpConfigPath is non-empty after trim.` Single function, no branching beyond the existing `if` blocks at the tail. The new branch is one `if` that pushes three array entries in a fixed order; no helper extraction earns its place because the §3 thresholds (multiple UI primitives / multiple persistence writes / multiple error branches / multiple async ops) are all zero — this is one conditional push next to two existing conditional pushes of identical shape. Consistency with neighbours wins.

**Design context the executor needs upfront.** From Interfaces / Argv contract, verbatim: "The pair `--mcp-config <path>` and the standalone flag `--strict-mcp-config` are both appended. They appear consecutively, in the order `--mcp-config <path>` first, then `--strict-mcp-config`. They never appear independently (no half-applied state). They append after the existing args." And from Error handling: "Whitespace-only path: treated as empty (trimmed). Both flags omitted." The trim convention is `input.mcpConfigPath.trim() !== ''` — not `!== ''` alone — because paths can acquire stray whitespace through copy-paste in a settings text field, where `vaultMountPath`'s value comes from a computed default.

**Cross-section couplings.**
- B1 depends on A1: the field must exist on the interface before the builder can read it.
- B2 (tests) depends on B1 (implementation). Standard red-then-green ordering within this section: write the test, see it fail with the expected message, then implement.
- C1 (CastRunner) depends on B1: the `CastArgsInput` type must include `mcpConfigPath` before the runner can pass it through.

**Section-level Red criterion.** Done when `buildCastArgs`:
- Appends nothing related to MCP when `mcpConfigPath === ''`.
- Appends nothing related to MCP when `mcpConfigPath === '   '` (whitespace only).
- Appends `['--mcp-config', '<path>', '--strict-mcp-config']` consecutively, in that order, when `mcpConfigPath === '/some/path'`.
- Coexists with `--effort`, `--add-dir`, `--system-prompt-file`, and inline `-p` flags without disturbing their existing positions or values.
- Every test case in `tests/buildCastArgs.test.ts` passes; the new test cases mechanically assert the four bullets above.

**junior-dev**

- [x] B1: In `src/cast/local/buildCastArgs.ts`, add `mcpConfigPath: string;` to `BaseCastArgsInput` (see Interfaces — copy the JSDoc verbatim). In the body of `buildCastArgs`, after the existing `vaultMountPath` block (lines ~56-58), add: `if (input.mcpConfigPath.trim() !== '') { args.push('--mcp-config', input.mcpConfigPath, '--strict-mcp-config'); }`. Pass the raw `input.mcpConfigPath` to `args.push` — do NOT pass the trimmed value (the gate uses trim; the value passed is verbatim, matching the "passed verbatim — no expansion" contract in Interfaces). Do NOT split into two separate `if` blocks for the two flags — they must be one atomic branch. — S, junior-dev
- [x] B2: In `tests/buildCastArgs.test.ts`, add the following test cases. (a) Update every existing test that constructs a `buildCastArgs` input to include `mcpConfigPath: ''` — the tests were written before the field existed; without this, TypeScript will fail to compile under the new required field. Use a small helper or just add the field inline; either is fine. (b) Add: "omits --mcp-config and --strict-mcp-config when mcpConfigPath is empty" — assert neither flag appears. (c) Add: "omits both MCP flags when mcpConfigPath is whitespace-only" — pass `mcpConfigPath: '   '`; assert neither flag appears. (d) Add: "appends --mcp-config <path> --strict-mcp-config when mcpConfigPath is non-empty" — pass `mcpConfigPath: '/abs/path/mcp.json'`; find `--mcp-config` in argv, assert the next element is `'/abs/path/mcp.json'`, assert `'--strict-mcp-config'` appears at a higher index than `--mcp-config`, and assert the gap between `--mcp-config` and `--strict-mcp-config` is exactly 2 indices (i.e. they are consecutive with the path between them). (e) Add: "MCP flags coexist with --effort and --add-dir" — pass effort `'high'`, vault `/v`, mcp `/abs/m.json`; assert all four flags (`--effort`, `--add-dir`, `--mcp-config`, `--strict-mcp-config`) appear and the existing flag values are unchanged. (f) Add: "MCP flags coexist with --system-prompt-file file-mode" — pass `systemPromptFile`/`userPrompt`/`mcpConfigPath`; assert the file-mode prompt flags still come first (existing `forge-shaped` test guards this ordering) and the MCP flags appear at the tail. — M, junior-dev

### C. Runner / caster plumbing

#### Section briefing

**What this section produces.** Threads `mcpConfigPath` through the runtime call chain so the value reaches `buildCastArgs`. Touches `src/cast/local/CastRunner.ts` (extend `BaseCastRunInput`) and `src/cast/local/LocalCaster.ts` (read from `#settings`, write to both branches of the run-input literal). No new files.

**Methods produced.** Two existing methods are modified; no new methods are introduced:
- `LocalCaster.cast(input, callbacks) — already a two-branch object-literal that picks between inline and file-mode CastRunInput. Adds mcpConfigPath: this.#settings.mcpConfigPath to both branches alongside the existing binaryPath / cliCommand / echoOutput plumbing.` No control-flow change beyond extending each literal by one key. §3 thresholds unchanged (the duplication smell is pre-existing and explicitly out of scope per Technical notes — flag only).
- `CastRunner.#getCastArgs(input) — already strips binaryPath / cliCommand / castId from the run input and forwards the remainder to buildCastArgs.` No code change here: the destructure already passes through unrecognised fields via the rest parameter, so adding `mcpConfigPath` to the input type is sufficient. Verify by inspection that the destructure `const { binaryPath, cliCommand, castId: _castId, ...castArgsInput } = input;` does not need to be updated. (If the dev finds that TS narrows `castArgsInput` to a closed type that excludes the new field, the fix is to add `mcpConfigPath` to the type extension on `BaseCastRunInput`, not to the destructure — the destructure already does the right thing structurally.)

**Design context the executor needs upfront.** From Components / Data flow: `LocalCaster` already holds `#settings: GrimoireSettings` in its constructor (see `src/cast/local/LocalCaster.ts:11-12, 14-18`), and `cast()` already reads `#settings.binaryPath`, `#settings.cliCommand`, `#settings.showCastOutput` in both literal branches. The plumbing pattern is established; this todo follows it line-for-line. From Technical notes: "the duplicated-literal smell that already exists in `cast` is not a target of this plan (separate refactor concern)." Do not refactor `cast()`; add the one key to each branch.

**Cross-section couplings.**
- C1 depends on B1: the `CastArgsInput` (which `BaseCastRunInput` feeds into via the `#getCastArgs` destructure) must already have `mcpConfigPath: string` before this type extension can compile through. Land B1 first.
- C2 depends on A1 and C1: `LocalCaster` reads `this.#settings.mcpConfigPath` (needs A1) and writes into a `runInput` whose type now requires the field (needs C1).
- C-section is a hard prerequisite for D-section's integration test: the row write-through assertion needs all of A/B/C to actually move data end-to-end (though the integration test itself only asserts settings write-through, not argv — the full-chain assertion is covered by B's unit tests).

**Section-level Red criterion.** Done when:
- `BaseCastRunInput` in `CastRunner.ts` has `mcpConfigPath: string`.
- `LocalCaster.cast` passes `mcpConfigPath: this.#settings.mcpConfigPath` in both the inline-mode and file-mode object literals.
- `npm test` is green; in particular, any existing unit test for `LocalCaster` (if present) does not break (verify with a grep — if no test exists, none needs to be added in this section; B2 already covers argv correctness end-to-end).
- TypeScript compiles cleanly under `npm run build`.

**junior-dev**

- [x] C1: In `src/cast/local/CastRunner.ts`, add `mcpConfigPath: string;` to `BaseCastRunInput` (after `cliCommand`, before `castId` — matches the conceptual grouping of "CLI invocation config"). No JSDoc needed beyond the type — the field is documented at its source-of-truth on `GrimoireSettings`. Do NOT change `#getCastArgs`'s destructure; the rest-parameter `...castArgsInput` already forwards the new field. — S, junior-dev
- [x] C2: In `src/cast/local/LocalCaster.ts`, add `mcpConfigPath: this.#settings.mcpConfigPath,` to both the `input.systemPromptFile` branch and the `else` branch of `cast()`. Place each one immediately after `cliCommand: this.#settings.cliCommand,` to match the type-declaration order from C1. Do NOT refactor the duplicated literals — that smell is explicitly out of scope (see Technical notes). — S, junior-dev

### D. Settings UI row + integration test

#### Section briefing

**What this section produces.** Renders the new "MCP config path" text row in `GrimoireSettingTab.#renderGeneralSection` and extends the existing UI integration test (`tests/integration/settings-panel.spec.ts`) to cover the new row and bump the row-count assertion. No new spec files; no new component; reuses the existing `#addTextField` helper.

**Methods produced.** No new methods. One existing method is modified:
- `GrimoireSettingTab.#renderGeneralSection() — already orchestrates ten field additions via #addTextField / #addProviderField / #addModelField / #addEffortField. Adds one more #addTextField call between the Binary-path row and the Forge-output-folder row.` The method is already an orchestrator of named helpers — `#addTextField`, `#addProviderField`, `#addModelField`, `#addEffortField` (see `src/ui/settings/GrimoireSettingTab.ts:50-67`); the §3 decomposition rule is satisfied by the existing structure. Adding one more helper call does not change the structure; do NOT introduce a new helper. The `#addTextField` helper already encapsulates label + description + value-get/set + save-on-change.

**Design context the executor needs upfront.** From Components: "Render new text row in `#renderGeneralSection`, between 'Binary path' and 'Forge output folder'. Reuses the existing `#addTextField` helper — no new method." From `tests/integration/settings-panel.spec.ts` (the existing seam test): the row-count assertion at line 34-36 currently reads `expect(tab.containerEl.childElementCount).toBe(38);` — this becomes `39` after adding one row. The existing comment block at lines 30-33 enumerates row counts and must be updated to reflect the new general-section count. From Technical notes: "We do not spin a new integration spec file — the seam is already pinned, and a single new field doesn't earn its own spec."

**Cross-section couplings.**
- D1 depends on A1: the row reads `s.mcpConfigPath` and writes `s.mcpConfigPath = v`; the field must exist on the interface or TS won't compile.
- D2 depends on D1: the integration assertion targets the rendered row.
- D-section depends on the full A/B/C chain only insofar as the test suite must be green overall (`npm test` runs all tests); the integration test itself does not exercise `buildCastArgs` or `LocalCaster`.

**Section-level Red criterion.** Done when:
- The General section in `GrimoireSettingTab` renders an "MCP config path" text row between "Binary path" and "Forge output folder", with a description that explains: "Optional. Path to a dedicated MCP config file. When set, casts run with this file as the only MCP source (`--strict-mcp-config`), ignoring all other configured scopes. Leave blank to inherit ambient MCP state."
- Typing into the new row writes through to `plugin.data.settings.mcpConfigPath` and calls `plugin.save()` exactly once per change.
- `tests/integration/settings-panel.spec.ts` row-count assertion is bumped from 38 to 39 (with the comment block updated to enumerate the new row), and a new test case asserts the write-through pattern for the MCP config path row.
- `npm run test:integration` passes.

**junior-dev**

- [x] D1: In `src/ui/settings/GrimoireSettingTab.ts`, inside `#renderGeneralSection`, add a new `#addTextField` call between the existing "Binary path" line (line 56) and the "Forge output folder" line (line 58). Use label `'MCP config path'`, getter `() => s.mcpConfigPath`, setter `v => { s.mcpConfigPath = v; }`, and description `'Optional. Path to a dedicated MCP config file. When set, casts run with this file as the only MCP source (--strict-mcp-config), ignoring all other configured scopes. Leave blank to inherit ambient MCP state.'`. Match the existing column alignment style in the helper calls (the file uses a column-aligned multi-arg layout — preserve it). Do NOT add a new helper method. Do NOT add a file picker, browse button, or validation. — S, junior-dev
- [x] D2: In `tests/integration/settings-panel.spec.ts`, (a) update the comment block at lines 30-33 to reflect the new row count — the General-section text-field count goes from 5 to 6, the total goes from 38 to 39. Reword the comment so future readers can trace the new figure (e.g. "6 text [+ MCP config path]" instead of "5 text"). (b) Update the row-count assertion at line 35 from `toBe(38)` to `toBe(39)`. (c) Add a new test (mirroring the existing "typing in the spell-tag input" test at line 39-46): query `input[type="text"]` elements; identify the MCP-config-path input by its index in the General section (it sits at index 3 — after spellTag, cliCommand, binaryPath; before forgeOutputFolder, vaultMountPath; verify with the existing childElementCount-style probing if uncertain); call `__triggerChange('/abs/path/mcp.json')`; assert `plugin.data.settings.mcpConfigPath === '/abs/path/mcp.json'` and `plugin.save` was called. Do NOT assert downstream argv shape here — that is B2's job. — M, junior-dev

### E. README docs reconciliation

#### Section briefing

**What this section produces.** Edits `README.md` (no code). Adds a short paragraph between step 1 (MCP setup) and step 2 (permissions) reconciling `claude mcp list` with `--strict-mcp-config`, plus a one-line note inside the existing step-2 paragraph clarifying that the `mcp__<server>__*` entries in the permission allow-list must match the **names declared in the Grimoire MCP file** (when the new setting is on), not whatever `claude mcp list` shows. No new files.

**Methods produced.** None — this is a Markdown prose edit, not code. The gate is `npm run lint` passing on the docs-only change and a human read.

**Design context the executor needs upfront.** From Goal & scope and Out-of-scope notes: this README cross-reference is the only docs deliverable this cycle — the bigger docs site is out of scope for plugin commits. From the source pitch's Rabbit Holes: "the permissions doc tells users to find their server names via `claude mcp list` — but under `--strict-mcp-config`, that listing no longer reflects what loads at cast time. The two docs have to agree that the server names in the permission allow-list must match the names declared in the Grimoire MCP file, not whatever the machine's scopes show." Existing README structure: step 1 sets up Local REST API as an MCP server (lines 23-32); step 2 wires `.claude/settings.local.json` with the permissions block (lines 34-65). The new paragraph sits between them as a conditional "If you set MCP config path in Grimoire Settings…" callout.

**Cross-section couplings.** None. README is independent of the code work and can land before or after A–D.

**Section-level Red criterion.** Done when `README.md`:
- Contains a paragraph between the step-1 MCP setup section and the step-2 permissions section explaining: when the new "MCP config path" setting is non-empty, Grimoire passes `--mcp-config <path> --strict-mcp-config`, making the cast see *only* what the file declares; `claude mcp list` continues to show ambient scopes and therefore no longer reflects load-time reality for casts.
- The step-2 paragraph (around lines 65) gains a one-line clarification that the `mcp__<server>__*` allow-list entries must match the names declared in the Grimoire MCP config file (when that setting is on) — not what `claude mcp list` shows. Keep the existing "must match the server name you registered" wording for the case when the setting is empty.
- `npm run lint` passes (it should — the change is markdown-only and lint is TS/JS).
- The pre-commit hook accepts the docs-only commit.

**junior-dev**

- [x] E1: In `README.md`, after the step-1 paragraph that ends at "either trust it, or enable the plain-HTTP endpoint…" (line 30) and before the "For best-case Refine search results" paragraph (line 32), insert a new paragraph titled or led with bold "Optional: pin the MCP server set." Body: explain that Grimoire Settings → General → MCP config path takes a path to a dedicated MCP config file; when set, casts run with `--mcp-config <path> --strict-mcp-config`, so the cast's MCP servers are exactly what the file declares, identical on every machine. Note that `claude mcp list` still shows the machine's ambient scopes and no longer reflects what loads at cast time when this setting is on. Keep the paragraph short (3-5 sentences). Do NOT show a sample MCP config file body — that's a docs-site concern. — S, junior-dev
- [x] E2: In `README.md`, in the paragraph at line 65 ("The `mcp__obsidian__*` entries must match the server name you registered in step 1 (`obsidian` above)…"), add one sentence after the first one stating: "If you've set **MCP config path** in Grimoire Settings, these names must instead match the server names declared in that file — `claude mcp list` reflects ambient scopes, not what your casts actually load." Keep the existing sentences intact; this is an additive clarification, not a rewrite. — S, junior-dev

## Deferred edge cases

The pitch consciously decides these — recorded so they are not silently omitted:

- **Path validation / existence check.** Accepted, not guarded. Per the pitch: "if the path is wrong, the cast surfaces the error like any other." Same blast radius as a wrong binary path today. No code, no test.
- **`~` expansion / env-var substitution in the path.** Out of scope. Passed verbatim. If the user pastes `~/grimoire-mcp.json`, `claude` will resolve it against its cwd (`vaultMountPath`) and likely fail — the user will then paste an absolute path. Matches `binaryPath`'s existing semantics.
- **Per-spell override of the MCP config path.** Out of scope this cycle. The current `grimoire-casting` frontmatter block carries provider/model/effort only (see `docs/features/grimoire-spell-local-casting-settings.md`). Per-spell MCP would be a separate pitch; the empty-by-default vault-wide field is the right starting point.
- **A "Test MCP config" button in Settings.** Explicit No-Go in the pitch.
- **A file picker for the path.** Explicit No-Go in the pitch.
- **A Grimoire-bundled starter MCP config file.** The pitch mentions onboarding "can ship a starter config the same way it ships the permissions template" — but the permissions template is a README snippet, not a shipped file. This plan delivers the README snippet via E1/E2 (text only — no sample JSON body, deferred to docs-site). A plugin-side starter file would cross the "no Grimoire-authored MCP file" line.
- **Remote / portal MCP config.** Explicit No-Go. Portal builds its own invocation on its own host; a local path is meaningless there. The portal pitch will address this separately.
- **Migration of an empty-string `mcpConfigPath`.** Not needed. Absent field hydrates to default `''`; behaviour is identical to today (no flags appended).
- **Concurrent edits to the MCP file while a cast is running.** Out of scope. Same model Grimoire already uses for `binaryPath`, prompt files, etc. — `claude` reads what it reads at process-spawn time; the plugin doesn't lock anything.
- **Whitespace-inside-path (not trailing/leading).** The trim guard handles leading/trailing whitespace only. A path like `/some path/with spaces.json` passes through verbatim (correctly — it's a legitimate path). `claude` will handle it because the args array is passed to `execFile`-style spawn, not a shell.

## Edge-case / invariant todos (called out explicitly, not left implicit)

These are folded into the section todos above but are the load-bearing invariants the dev agents must not miss:

- **Atomic-pair invariant** is asserted in B2(d): the gap between `--mcp-config` and `--strict-mcp-config` is exactly 2 indices (path between them). If a future change ever drops one flag without the other, that test fails. This is the single most important mechanical guarantee of the feature — strict mode without the path is meaningless, the path without strict mode misses the point.
- **Whitespace-trim invariant** is asserted in B2(c): a whitespace-only path is treated as empty. Without this, a stray space in the settings field would silently turn on strict mode with an unresolvable path.
- **Verbatim-pass invariant**: the value pushed to argv is `input.mcpConfigPath`, not `input.mcpConfigPath.trim()`. The gate uses trim; the value passed is raw. B2(d) probes a clean path so it doesn't catch this — the prescription in B1 names it explicitly to prevent the dev from "helpfully" trimming the pushed value.
- **Field-on-existing-tests invariant** (B2.a): every existing `buildCastArgs` test must add `mcpConfigPath: ''` to its input literal, or TS will fail to compile. The prescription in B2 names this explicitly to prevent a silent "I'll add the new tests but the old ones broke compile" situation.

## Overall effort summary

- **Total todos: 9** — S: 7, M: 2, L: 0.
- **Tier distribution: junior-dev 9, senior-dev 0, lead-dev 0.** Every todo is a self-contained prescription against a known file with the exact field name, branch shape, argv contract, and test assertions decided in Interfaces / Components / Argv-contract / Edge-case sections. The design questions are closed (atomic pair, trim-gate, verbatim pass, no migration, no validation, no new helper). No judgment is cross-cutting — even the README phrasing is constrained by the verbatim cross-reference text in the pitch's Rabbit Holes section. The only local judgment is sentence-level prose, which is small contained junior-dev judgment per the dev-tier rules.
- **UI integration test reuse, not creation.** Per the planner's UI-integration rules: a UI stack is detected (the project ships UI in `src/ui/**`), and this plan touches user-facing code (the settings tab). However, the existing seam test in `tests/integration/settings-panel.spec.ts` already pins the `GrimoireSettingTab` boundary; a new row earns an additional assertion within that spec, not a new spec file or a `ui-integration-tester` group. Justification for not emitting a `**ui-integration-tester**` group: the integration test scope here is "one more text-field write-through assertion on an already-pinned seam", which the existing pattern in `settings-panel.spec.ts` makes mechanical. The dispatch cost (a separate agent invocation, separate red-criterion) does not pay for itself for an n+1 row. If this plan were introducing a new section or a new component on the settings tab, a tester group would be warranted.
- **Honest testing note:** README prose quality (E1/E2) is not automatable. The gate is lint + pre-commit pass; phrasing accuracy relies on the prescriptions copying the pitch's verbatim cross-reference language.

reviewed @ c14db24
