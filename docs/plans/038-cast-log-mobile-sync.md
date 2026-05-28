# 038 — Cast log mobile sync

## Goal & scope

Make the two cast-log files (`cast-log-plugin`, `cast-log-agent`) reach mobile via Obsidian Sync. Sync's `.obsidian/` allow-list passes `.json` but not `.jsonl`; the files are renamed from `.jsonl` to `.json` at the one authority that owns the path — `src/infra/PluginPaths.ts` — and every test that hard-codes those filenames as fixtures is updated to match. The contents do not change; the log remains newline-delimited JSON under a deliberately-misnamed `.json` extension, which the existing line-by-line reader (`#readFromFile`) already tolerates.

**In scope:**

- Two literal swaps in `src/infra/PluginPaths.ts` (`cast-log-plugin.jsonl` → `cast-log-plugin.json`, `cast-log-agent.jsonl` → `cast-log-agent.json`).
- Fixture updates in unit and integration tests that pin the old filenames as expected values or stub-path keys.
- `.gitignore` update so the new filenames are ignored (add the `.json` names; old `.jsonl` entries removed since no production data exists).
- A confirmation pass that no other source file — and in particular no Portal Service code or hook-script renderer — hardcodes `.jsonl` independently of `PluginPaths`.

**Explicitly out of scope (overrides the pitch):**

- **No migration / legacy support.** The pitch's "Solution" section proposes a one-time copy-on-load from `.jsonl` to `.json` with a "new absent" guard. The user has scoped this out: we are pre-production, no production logs to preserve, hand-deletable in dev. Therefore:
  - No code in `CastLogModule.initStartupMaintenance` for migration.
  - No guard logic, no `#runOrLog` migration step, no copy via `DataAdapter`.
  - The pitch's rabbit holes "re-copy clobber", "agent log shared three ways", "portal transitional window" are **all moot** under this scoping — they exist solely to make migration safe, and we are not migrating.
- **No reader changes.** `#readFromFile` already splits on newlines and parses per-line; that contract is preserved untouched.
- **No file-content changes.** Still newline-delimited JSON. No pretty-printing, no JSON-array wrapping.
- **No scratch migration.** `cast-log-scratch/` is unaffected (transient `.paths` files, irrelevant to sync).
- **No Sync UI, no onboarding copy, no schema versioning.**
- **No deletion of orphaned `.jsonl` files** in user vaults — none exist in production; dev artefacts are user-deletable.
- **No archived-plan edits.** Historical `docs/archive/**` and `docs/features/**` reference the old filenames; `/spec` after `/done` runs a drift sweep across docs and will update the live feature specs. This plan does not touch those.

## Proposed solution

Change two string literals in one file. Update every test that locked the old filename into a fixture. Update `.gitignore`. Confirm no other producer hardcodes `.jsonl`. Stop.

## Components

| Component | Location | Change |
|-----------|----------|--------|
| `PluginPaths` | `src/infra/PluginPaths.ts` | Two literal swaps: lines 19–20 |
| `PluginPaths` unit tests | `tests/PluginPaths.test.ts` | Two expected-value updates (lines 16, 23) |
| `CastLogStore` unit tests | `tests/castLog/store.test.ts`, `tests/castLog/store.readAll.test.ts` | Stub-path keys updated to `.json` |
| `HookMaterializer` unit tests | `tests/castLog/HookMaterializer.test.ts` | `getLogPathAbs()` fixtures updated |
| Integration tests | `tests/integration/remote-cast.spec.ts`, `tests/integration/store-panel-delete-integration.spec.ts` | Log-path constants updated |
| `.gitignore` | `.gitignore` | Replace `cast-log-*.jsonl` entries with `cast-log-*.json` |

## Interfaces

No interface changes. `PluginPaths.pluginLogPath()` and `agentLogPath()` keep their signatures; only the suffix of the returned string changes.

## Data flow

Unchanged. `PluginPaths` is the single source of truth for the two log paths; every consumer reads via `pluginLogPath()` / `agentLogPath()` or is injected the absolute path through `HookMaterializer`'s `getLogPathAbs`. Renaming at source propagates to: `CastLogStore` (read/append), `HookMaterializer` (script materialisation), `VaultRefreshCoordinator` (vault watch path), and `castSettings` plumbing. Hook scripts (`session-start.sh`, `stop.sh`) embed whatever path the materialiser hands them; no script-side change is required.

## Error handling

No new error paths. The change is purely lexical.

## Technical notes

- **No new I/O.** No `DataAdapter` calls added. Pure string-literal swap.
- **`#readFromFile` is untouched.** Its tolerance for newline-delimited JSON under a `.json` name is the load-bearing assumption; verified in the pitch and not exercised by this change beyond the file-rename.
- **No Portal Service repo change.** Grep across `src/` confirms `PluginPaths.ts` is the only source file with the `.jsonl` literals. The synced hook scripts carry the path; the host runs them; the portal inherits the new name on next sync.
- **Hook-script renderers** (`src/castLog/hookScripts.ts`) take `logPathAbs` as a parameter — no embedded extension. The fixture tests at `tests/castLog/hookScripts.test.ts` and `tests/castLog/hookScripts.integration.test.ts` pass arbitrary throwaway filenames like `/abs/log.jsonl` to exercise the templating contract; those are *not* updated — their value is structural (template embeds the path verbatim), and the extension carried in the fixture is irrelevant to the assertion.
- **Tests with arbitrary fixture paths** (`tests/castLog/VaultRefreshCoordinator.test.ts`, `tests/integration/cast-log-refresh.spec.ts` with `WATCHED_PATH = 'cast-log.jsonl'`) similarly use a throwaway filename to exercise watch-path matching; the literal is not part of the contract under test. Left alone.
- **`docs/features/**` drift** — the feature docs `cast-log-foundation.md`, `cast-log-panel.md`, `remote-casting.md`, `command-popup-ui.md`, `grimoire-cast-log-deletion.md`, `cast-progress-events.md`, `cast-log-path-normalisation.md` reference the old `.jsonl` names. They will be patched by `feature-documenter` during `/spec` after `/done`, not in this iteration's commits.
- **Why the pitch's rabbit holes are dropped, in one line each:** *Re-copy clobber* — no copy happens. *Agent log shared three ways* — no migration to coordinate, each device just gets the new file when sync delivers it. *Portal transitional window* — accepted (and trivial), but it isn't this plan's responsibility because we ship no host-side coordination.

## Todos

### A. Path-source rename

#### Section briefing

**What this section produces:** updated `src/infra/PluginPaths.ts` with the two log filenames suffixed `.json` instead of `.jsonl`; the corresponding expectations in `tests/PluginPaths.test.ts` updated.

**Design context the executor needs upfront:** `PluginPaths` is the sole authority for both log paths. `#readFromFile` is untouched and remains tolerant of newline-delimited JSON under a `.json` name. Do not touch the contents-handling code.

**Cross-section couplings:** A1 (source change) makes B/C/D test fixtures red until they are updated; that is the desired Red-then-Green sequence. None of the consumers in `src/` need code edits — they all flow through `PluginPaths`. A grep-confirmation step lives in F.

**Section-level Red criterion:** `tests/PluginPaths.test.ts` asserts that `pluginLogPath()` returns `<pluginDir>/cast-log-plugin.json` and `agentLogPath()` returns `<pluginDir>/cast-log-agent.json`. Both tests pass after A2 lands.

**junior-dev**

- [ ] A1: In `tests/PluginPaths.test.ts`, change line 16 expected literal from `cast-log-plugin.jsonl` to `cast-log-plugin.json`, and line 23 expected literal from `cast-log-agent.jsonl` to `cast-log-agent.json`. Run `npx vitest run tests/PluginPaths.test.ts` — both tests must be red against the unchanged source. — S, junior-dev
- [ ] A2: In `src/infra/PluginPaths.ts`, change line 19 string literal from `cast-log-plugin.jsonl` to `cast-log-plugin.json`, and line 20 from `cast-log-agent.jsonl` to `cast-log-agent.json`. Re-run `npx vitest run tests/PluginPaths.test.ts` — both tests must now pass. — S, junior-dev

### B. Store test-fixture sweep

#### Section briefing

**What this section produces:** every hardcoded `cast-log-plugin.jsonl` / `cast-log-agent.jsonl` string in `tests/castLog/store.test.ts` and `tests/castLog/store.readAll.test.ts` replaced with the `.json` form. The standalone `'/local.jsonl'` / `'/agent.jsonl'` arbitrary stub-paths inside the same files (used as in-memory map keys for the `files` test double) **also** get updated to `'/local.json'` / `'/agent.json'` — purely for fidelity; the behaviour does not depend on the suffix, but mixed suffixes invite future confusion.

**Design context the executor needs upfront:** These tests configure `CastLogStore` with explicit `getLogPathAbs` / `getAgentLogPathAbs` callables returning hardcoded paths. They are not testing path construction — they are testing read/write/mutate behaviour against an in-memory adapter keyed on those paths. The keys are arbitrary but must remain self-consistent within each test.

**Cross-section couplings:** None — these tests do not depend on `PluginPaths.ts` (they bypass it by injecting paths directly). They are updated for documentary consistency, not because the source change makes them red.

**Section-level Red criterion:** N/A — these tests are not red against the A2 change; they pass before and after. The criterion for "this section done" is grep-clean: `grep -n 'cast-log-plugin.jsonl\|cast-log-agent.jsonl\|local\.jsonl\|agent\.jsonl' tests/castLog/store.test.ts tests/castLog/store.readAll.test.ts` returns nothing, and both files' tests still pass.

**junior-dev**

- [ ] B1: In `tests/castLog/store.test.ts`, replace every occurrence of `cast-log-plugin.jsonl` with `cast-log-plugin.json` and `cast-log-agent.jsonl` with `cast-log-agent.json`. Also replace the arbitrary stub paths `/local.jsonl` → `/local.json` and `/agent.jsonl` → `/agent.json` (these are in-memory map keys for the adapter double). Run `npx vitest run tests/castLog/store.test.ts` — all tests pass. — S, junior-dev
- [ ] B2: In `tests/castLog/store.readAll.test.ts`, replace every occurrence of `cast-log-plugin.jsonl` with `cast-log-plugin.json` and `cast-log-agent.jsonl` with `cast-log-agent.json`. Run `npx vitest run tests/castLog/store.readAll.test.ts` — all tests pass. — S, junior-dev

### C. HookMaterializer test-fixture sweep

#### Section briefing

**What this section produces:** every `getLogPathAbs` fixture path in `tests/castLog/HookMaterializer.test.ts` updated from `cast-log-plugin.jsonl` / `cast-log-agent.jsonl` to the `.json` form.

**Design context the executor needs upfront:** Hook-script renderers (`renderSessionStartScript`, `renderStopScript`) embed `logPathAbs` verbatim into the script body. The materialiser tests assert byte-for-byte equality between the materialised file content and `renderXScript({ logPathAbs })` — so the fixture path inside the test must match what the materialiser is given. Both sides of the equality change together. Do not touch `tests/castLog/hookScripts.test.ts` or `hookScripts.integration.test.ts` — those use arbitrary throwaway filenames (`/abs/log.jsonl`, `cast-log.jsonl`) whose extension is irrelevant to what they assert.

**Cross-section couplings:** None. Self-contained sweep.

**Section-level Red criterion:** `grep -n 'cast-log-plugin.jsonl\|cast-log-agent.jsonl' tests/castLog/HookMaterializer.test.ts` returns nothing; `npx vitest run tests/castLog/HookMaterializer.test.ts` passes.

**junior-dev**

- [ ] C1: In `tests/castLog/HookMaterializer.test.ts`, replace every occurrence of `cast-log-plugin.jsonl` with `cast-log-plugin.json` and `cast-log-agent.jsonl` with `cast-log-agent.json`. Run `npx vitest run tests/castLog/HookMaterializer.test.ts` — all tests pass. — S, junior-dev

### D. Integration-test fixture sweep

#### Section briefing

**What this section produces:** the two integration specs that hardcode the old log filenames updated to the `.json` form.

**Design context the executor needs upfront:** `tests/integration/remote-cast.spec.ts` declares `REMOTE_LOG = '/vault/cast-log-agent.jsonl'` and `LOCAL_LOG = '/vault/cast-log-plugin.jsonl'` and uses them as in-memory adapter keys. `tests/integration/store-panel-delete-integration.spec.ts` uses `LOCAL_LOG` and `AGENT_LOG` constants with full `.obsidian/plugins/grimoire/` paths. Both wire the in-memory store via the same path keys. Updating both literal sides keeps the harness consistent. Do **not** touch `tests/integration/cast-log-refresh.spec.ts` line 16 — the `WATCHED_PATH = 'cast-log.jsonl'` constant there is an arbitrary throwaway watch-path used to test the coordinator's path-matching logic, not a reference to the real log file.

**Cross-section couplings:** None — these are integration test harness fixtures, independent of the `PluginPaths` change (they inject paths directly into the store / adapter).

**Section-level Red criterion:** Both spec files green; `grep -n 'cast-log-plugin.jsonl\|cast-log-agent.jsonl' tests/integration/` returns nothing.

**junior-dev**

- [ ] D1: In `tests/integration/remote-cast.spec.ts`, change line 28 `REMOTE_LOG` constant from `/vault/cast-log-agent.jsonl` to `/vault/cast-log-agent.json` and line 29 `LOCAL_LOG` from `/vault/cast-log-plugin.jsonl` to `/vault/cast-log-plugin.json`. Run the integration suite (`npm run test:integration`) for this file. — S, junior-dev
- [ ] D2: In `tests/integration/store-panel-delete-integration.spec.ts`, change lines 50–51 to use `cast-log-plugin.json` and `cast-log-agent.json` in the `LOCAL_LOG` and `AGENT_LOG` constants respectively. Re-run the integration suite for this file. — S, junior-dev

### E. `.gitignore` housekeeping

#### Section briefing

**What this section produces:** updated `.gitignore` that ignores the new `.json` filenames; the old `.jsonl` entries are removed (no production data exists; dev environments can reset by hand).

**Design context the executor needs upfront:** `.gitignore` currently lists four cast-log entries: `cast-log-local.jsonl` and `cast-log-remote.jsonl` (historical, from before the rename to plugin/agent), and `cast-log-plugin.jsonl` and `cast-log-agent.jsonl` (current). Replace the current pair with the `.json` form; the historical pair can stay (harmless) or go — preference is to drop them along with the rename for hygiene.

**Cross-section couplings:** None.

**Section-level Red criterion:** `.gitignore` contains `cast-log-plugin.json` and `cast-log-agent.json` lines and no `cast-log-*.jsonl` lines.

**junior-dev**

- [ ] E1: In `.gitignore`, replace lines 13–14 (`cast-log-plugin.jsonl`, `cast-log-agent.jsonl`) with `cast-log-plugin.json` and `cast-log-agent.json`. Also remove the historical lines 11–12 (`cast-log-local.jsonl`, `cast-log-remote.jsonl`) since those filenames have been gone since iteration 015. — S, junior-dev

### F. Verification sweep

#### Section briefing

**What this section produces:** confidence that no source file under `src/` independently hardcodes `.jsonl` for either cast log, and that the full test suite is green after sections A–E. A short manual note is added to the plan's `notes/` section (not in code) confirming the dev-environment `.jsonl` files were hand-deleted (or never existed on this machine).

**Design context the executor needs upfront:** The only known `.jsonl` literals in `src/` are the two lines in `PluginPaths.ts` already changed in A2. The comment in `src/castLog/format/toDisplayPath.ts` line 9 mentions "the JSONL record" — that is a format description, not an extension, and is correct (the contents are still newline-delimited JSON). Leave it untouched.

**Cross-section couplings:** F1 depends on A2 (must be after the source change). F2 depends on A–E (full-suite gate).

**Section-level Red criterion:** `grep -rn 'cast-log-.*\.jsonl' src/` returns nothing; `grep -rn 'cast-log-.*\.jsonl' tests/` returns only the deliberately-untouched fixtures called out in C and D (the throwaway hook-script paths and `VaultRefreshCoordinator` / `cast-log-refresh` arbitrary watch paths). `npm test` and `npm run test:integration` both green.

**junior-dev**

- [ ] F1: Run `grep -rn 'cast-log-plugin\.jsonl\|cast-log-agent\.jsonl' src/`. Expected: zero matches. If any match exists outside `PluginPaths.ts` (which was already updated in A2), report it as an unexpected coupling and stop — the plan assumes no such source exists. — S, junior-dev
- [ ] F2: Run the full test suite: `npm run lint && npm test && npm run test:integration`. All must be green. — S, junior-dev

## Effort summary

Total todos: 9. Effort: **S × 9**. Tier: **junior-dev × 9**. No senior or lead work — every prescription is mechanical: known files, known literals, known expected behaviour. The only judgement call (which test fixtures are load-bearing vs. arbitrary) is resolved in the section briefings.

## Notes (not todos)

- Dev environments may contain stale `cast-log-plugin.jsonl` / `cast-log-agent.jsonl` files in `<vault>/.obsidian/plugins/grimoire/`. Delete them by hand if you want a clean slate; otherwise they are inert (nothing reads them after the rename). Production has no such files.
- The new `.json` filenames are recognised by Obsidian Sync's allow-list and will reach mobile on next sync after the plugin re-loads with the changed `PluginPaths`.
- A first mobile cast (post-sync) confirms the round-trip; this is a manual smoke test outside the automated suite.
