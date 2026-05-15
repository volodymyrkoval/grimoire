# 016 — Audit Comments (full repo sweep)

## Goal

Sweep all 173 source/test/config files for comment violations and fix them per the `code-comments` skill — comments only, no behavior or signature changes.

## Complexity

Simple — mechanical maintenance sweep. Each file is one S-effort todo for `junior-dev`. The only judgment per file is whether each comment earns its place per the `code-comments` skill.

## Implementation Notes (hard rules — apply per file)

- **Comments only.** No signature changes, no extracts, no refactors, no renames. If a comment can only be saved by changing code, delete the comment instead.
- **No commits by agents.** Edit files where needed; the orchestrator makes one combined commit at the end. Never run `git add` or `git commit`.
- **Skip files with no changes.** If a file has zero comment-worthy changes after the audit, leave it untouched.
- **No invented invariants.** If a JSDoc/docstring would assert something that cannot be verified from the code as-is (e.g. "always returns sorted", "thread-safe", "idempotent"), omit the assertion and flag the file in the iteration summary.
- **Behavior conflict = stop.** If an existing comment contradicts current behavior and it is ambiguous which is right, do not "fix" either side — flag the file and continue with the next todo.
- **Apply the `code-comments` skill verbatim.** Prefer expressive names and small functions as primary documentation. JSDoc earns its place on exported symbols and module headers; inline comments earn their place only when they explain *why*, not *what*.
- **TS/JS syntax only.** All target files are `.ts`. Use JSDoc for exported symbols where the skill prescribes it; line comments for inline `why` notes.
- **Tests are in scope.** Tests get the same treatment — `describe`/`it` titles are the primary documentation; comments inside tests must earn their place.

## Overall effort summary

- 173 todos, all **S, junior-dev**
- Counts by group: src/cast 14 · src/castLog 19 · src/domain 11 · src/execution+forge+infra+main 12 · src/ui 28 · tests 89 · config 2

## Dispatch

All sections are single-tier `**junior-dev**` groups. Dispatch order across sections is plan order; within each section, file order as listed.

---

## A. src/cast (14 files)

#### Section briefing

**What this section produces:** Modified comments only across the 14 files listed below under `src/cast/`. No new files, no signature changes, no exported-API changes.

**Design context the executor needs upfront:** Apply the `code-comments` skill verbatim — JSDoc on exported symbols where it earns its place, inline `why` comments only, expressive names do the heavy lifting. See Implementation Notes above for the full hard-rule list (one-commit-per-file, no invented invariants, behavior conflict = stop).

**Cross-section couplings:** None.

**Section-level Red criterion:** For each file, either (a) a single commit `docs(comments): <path>` lands with comment-only diff and the test suite stays green via pre-commit-green, or (b) the file is audited-clean (no commit) and the todo is ticked. Any file flagged for behavior conflict or unverifiable invariant is recorded in the iteration summary, not silently skipped.

### todos

**junior-dev**
- [x] `src/cast/CastDispatcher.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/cast/CastDispatcher.ts` if changed **[S, junior-dev]**
- [x] `src/cast/createCaster.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/cast/createCaster.ts` if changed **[S, junior-dev]**
- [x] `src/cast/local/buildCastArgs.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/cast/local/buildCastArgs.ts` if changed **[S, junior-dev]**
- [x] `src/cast/local/CastRunner.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/cast/local/CastRunner.ts` if changed **[S, junior-dev]**
- [x] `src/cast/local/LocalCaster.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/cast/local/LocalCaster.ts` if changed **[S, junior-dev]**
- [x] `src/cast/local/resolveCliBinary.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/cast/local/resolveCliBinary.ts` if changed **[S, junior-dev]**
- [x] `src/cast/local/spawnCast.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/cast/local/spawnCast.ts` if changed **[S, junior-dev]**
- [x] `src/cast/portal/buildBasicAuthHeader.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/cast/portal/buildBasicAuthHeader.ts` if changed **[S, junior-dev]**
- [x] `src/cast/portal/buildPortalRequestBody.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/cast/portal/buildPortalRequestBody.ts` if changed **[S, junior-dev]**
- [x] `src/cast/portal/buildPortalUrl.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/cast/portal/buildPortalUrl.ts` if changed **[S, junior-dev]**
- [x] `src/cast/portal/mapPortalError.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/cast/portal/mapPortalError.ts` if changed **[S, junior-dev]**
- [x] `src/cast/portal/parsePortalScheme.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/cast/portal/parsePortalScheme.ts` if changed **[S, junior-dev]**
- [x] `src/cast/portal/RemoteCaster.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/cast/portal/RemoteCaster.ts` if changed **[S, junior-dev]**
- [x] `src/cast/portal/RemoteCastTransport.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/cast/portal/RemoteCastTransport.ts` if changed **[S, junior-dev]**

---

## B. src/castLog (19 files)

#### Section briefing

**What this section produces:** Modified comments only across the 19 files listed below under `src/castLog/`. No new files, no signature changes.

**Design context the executor needs upfront:** Apply the `code-comments` skill verbatim. See Implementation Notes for hard rules.

**Cross-section couplings:** None.

**Section-level Red criterion:** Per file: comment-only commit lands green, or audited-clean (no commit). Flagged files surface in the iteration summary.

### todos

**junior-dev**
- [x] `src/castLog/CastLogReader.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/castLog/CastLogReader.ts` if changed **[S, junior-dev]**
- [x] `src/castLog/CastLogSource.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/castLog/CastLogSource.ts` if changed **[S, junior-dev]**
- [x] `src/castLog/CastLogWriter.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/castLog/CastLogWriter.ts` if changed **[S, junior-dev]**
- [x] `src/castLog/CastRecord.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/castLog/CastRecord.ts` if changed **[S, junior-dev]**
- [x] `src/castLog/foldEvents.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/castLog/foldEvents.ts` if changed **[S, junior-dev]**
- [x] `src/castLog/format/displayName.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/castLog/format/displayName.ts` if changed **[S, junior-dev]**
- [x] `src/castLog/format/duration.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/castLog/format/duration.ts` if changed **[S, junior-dev]**
- [x] `src/castLog/format/durationMs.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/castLog/format/durationMs.ts` if changed **[S, junior-dev]**
- [x] `src/castLog/format/relativeTime.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/castLog/format/relativeTime.ts` if changed **[S, junior-dev]**
- [x] `src/castLog/HookMaterializer.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/castLog/HookMaterializer.ts` if changed **[S, junior-dev]**
- [x] `src/castLog/hookScripts.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/castLog/hookScripts.ts` if changed **[S, junior-dev]**
- [x] `src/castLog/IntervalTickCoordinator.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/castLog/IntervalTickCoordinator.ts` if changed **[S, junior-dev]**
- [x] `src/castLog/RefreshCoordinator.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/castLog/RefreshCoordinator.ts` if changed **[S, junior-dev]**
- [x] `src/castLog/ScratchSweeper.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/castLog/ScratchSweeper.ts` if changed **[S, junior-dev]**
- [x] `src/castLog/stagePriority.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/castLog/stagePriority.ts` if changed **[S, junior-dev]**
- [x] `src/castLog/store.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/castLog/store.ts` if changed **[S, junior-dev]**
- [x] `src/castLog/TickCoordinator.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/castLog/TickCoordinator.ts` if changed **[S, junior-dev]**
- [x] `src/castLog/types.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/castLog/types.ts` if changed **[S, junior-dev]**
- [x] `src/castLog/VaultRefreshCoordinator.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/castLog/VaultRefreshCoordinator.ts` if changed **[S, junior-dev]**

---

## C. src/domain (11 files)

#### Section briefing

**What this section produces:** Modified comments only across the 11 files listed below under `src/domain/`. No new files, no signature changes.

**Design context the executor needs upfront:** Apply the `code-comments` skill verbatim. See Implementation Notes for hard rules.

**Cross-section couplings:** None.

**Section-level Red criterion:** Per file: comment-only commit lands green, or audited-clean (no commit). Flagged files surface in the iteration summary.

### todos

**junior-dev**
- [x] `src/domain/settings/computeVaultMountDefault.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/domain/settings/computeVaultMountDefault.ts` if changed **[S, junior-dev]**
- [x] `src/domain/settings/FormDefaults.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/domain/settings/FormDefaults.ts` if changed **[S, junior-dev]**
- [x] `src/domain/settings/persistence.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/domain/settings/persistence.ts` if changed **[S, junior-dev]**
- [x] `src/domain/settings/Settings.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/domain/settings/Settings.ts` if changed **[S, junior-dev]**
- [x] `src/domain/settings/spellOptionsResolver.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/domain/settings/spellOptionsResolver.ts` if changed **[S, junior-dev]**
- [x] `src/domain/settings/SpellOverrideStore.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/domain/settings/SpellOverrideStore.ts` if changed **[S, junior-dev]**
- [x] `src/domain/spells/fuzzyFilter.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/domain/spells/fuzzyFilter.ts` if changed **[S, junior-dev]**
- [x] `src/domain/spells/Spell.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/domain/spells/Spell.ts` if changed **[S, junior-dev]**
- [x] `src/domain/spells/SpellEvents.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/domain/spells/SpellEvents.ts` if changed **[S, junior-dev]**
- [x] `src/domain/spells/SpellPath.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/domain/spells/SpellPath.ts` if changed **[S, junior-dev]**
- [x] `src/domain/spells/spellScanner.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/domain/spells/spellScanner.ts` if changed **[S, junior-dev]**

---

## D. src/execution + src/forge + src/infra + src/main (12 files)

#### Section briefing

**What this section produces:** Modified comments only across the 12 files listed below under `src/execution/`, `src/forge/`, `src/infra/`, `src/main.ts`, and `src/main/`. No new files, no signature changes.

**Design context the executor needs upfront:** Apply the `code-comments` skill verbatim. See Implementation Notes for hard rules. `src/main.ts` is the plugin entry point — JSDoc on the `Plugin` subclass should describe its lifecycle role; do not invent invariants about init order beyond what is visible in the code.

**Cross-section couplings:** None.

**Section-level Red criterion:** Per file: comment-only commit lands green, or audited-clean (no commit). Flagged files surface in the iteration summary.

### todos

**junior-dev**
- [x] `src/execution/Caster.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/execution/Caster.ts` if changed **[S, junior-dev]**
- [x] `src/forge/buildMetaSpell.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/forge/buildMetaSpell.ts` if changed **[S, junior-dev]**
- [x] `src/forge/ForgeFormSnapshot.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/forge/ForgeFormSnapshot.ts` if changed **[S, junior-dev]**
- [x] `src/forge/ForgeImprinter.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/forge/ForgeImprinter.ts` if changed **[S, junior-dev]**
- [x] `src/forge/sanitiseSpellName.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/forge/sanitiseSpellName.ts` if changed **[S, junior-dev]**
- [x] `src/infra/DebouncedSaver.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/infra/DebouncedSaver.ts` if changed **[S, junior-dev]**
- [x] `src/infra/KeyboardController.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/infra/KeyboardController.ts` if changed **[S, junior-dev]**
- [x] `src/infra/PluginPaths.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/infra/PluginPaths.ts` if changed **[S, junior-dev]**
- [x] `src/infra/TypedEmitter.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/infra/TypedEmitter.ts` if changed **[S, junior-dev]**
- [x] `src/main.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/main.ts` if changed **[S, junior-dev]**
- [x] `src/main/CastLogModule.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/main/CastLogModule.ts` if changed **[S, junior-dev]**
- [x] `src/main/PopupModule.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/main/PopupModule.ts` if changed **[S, junior-dev]**

---

## E. src/ui (28 files)

#### Section briefing

**What this section produces:** Modified comments only across the 28 files listed below under `src/ui/`. No new files, no signature changes.

**Design context the executor needs upfront:** Apply the `code-comments` skill verbatim. See Implementation Notes for hard rules. UI components frequently have implicit DOM/lifecycle assumptions — only document those that are observable in the code itself; do not invent invariants about render ordering or focus management.

**Cross-section couplings:** None.

**Section-level Red criterion:** Per file: comment-only commit lands green, or audited-clean (no commit). Flagged files surface in the iteration summary.

### todos

**junior-dev**
- [x] `src/ui/CommandPopup.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/ui/CommandPopup.ts` if changed **[S, junior-dev]**
- [x] `src/ui/components/CastLogList.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/ui/components/CastLogList.ts` if changed **[S, junior-dev]**
- [x] `src/ui/components/CastLogRow.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/ui/components/CastLogRow.ts` if changed **[S, junior-dev]**
- [x] `src/ui/components/ForgeSentinelDetail.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/ui/components/ForgeSentinelDetail.ts` if changed **[S, junior-dev]**
- [x] `src/ui/components/SearchInput.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/ui/components/SearchInput.ts` if changed **[S, junior-dev]**
- [x] `src/ui/components/SentinelRow.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/ui/components/SentinelRow.ts` if changed **[S, junior-dev]**
- [x] `src/ui/components/SpellList.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/ui/components/SpellList.ts` if changed **[S, junior-dev]**
- [x] `src/ui/components/SpellOptionsDetail.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/ui/components/SpellOptionsDetail.ts` if changed **[S, junior-dev]**
- [x] `src/ui/components/SpellRow.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/ui/components/SpellRow.ts` if changed **[S, junior-dev]**
- [x] `src/ui/components/statusBadge.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/ui/components/statusBadge.ts` if changed **[S, junior-dev]**
- [x] `src/ui/components/TabBar.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/ui/components/TabBar.ts` if changed **[S, junior-dev]**
- [x] `src/ui/options/CastModelSection.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/ui/options/CastModelSection.ts` if changed **[S, junior-dev]**
- [x] `src/ui/options/OptionsFormState.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/ui/options/OptionsFormState.ts` if changed **[S, junior-dev]**
- [x] `src/ui/options/OptionsPanel.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/ui/options/OptionsPanel.ts` if changed **[S, junior-dev]**
- [x] `src/ui/options/OptionsSessionMap.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/ui/options/OptionsSessionMap.ts` if changed **[S, junior-dev]**
- [x] `src/ui/options/OptionsSnapshot.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/ui/options/OptionsSnapshot.ts` if changed **[S, junior-dev]**
- [x] `src/ui/popup/CommandPopupBuilder.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/ui/popup/CommandPopupBuilder.ts` if changed **[S, junior-dev]**
- [x] `src/ui/popup/DetailPhase.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/ui/popup/DetailPhase.ts` if changed **[S, junior-dev]**
- [x] `src/ui/popup/PopupPhase.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/ui/popup/PopupPhase.ts` if changed **[S, junior-dev]**
- [x] `src/ui/popup/SearchPhase.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/ui/popup/SearchPhase.ts` if changed **[S, junior-dev]**
- [x] `src/ui/settings/GrimoireSettingTab.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/ui/settings/GrimoireSettingTab.ts` if changed **[S, junior-dev]**
- [x] `src/ui/tabs/CastLogPanel.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/ui/tabs/CastLogPanel.ts` if changed **[S, junior-dev]**
- [x] `src/ui/tabs/SpellsPanel.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/ui/tabs/SpellsPanel.ts` if changed **[S, junior-dev]**
- [x] `src/ui/tabs/TabPanel.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/ui/tabs/TabPanel.ts` if changed **[S, junior-dev]**
- [x] `src/ui/widgets/ContextNotesInput.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/ui/widgets/ContextNotesInput.ts` if changed **[S, junior-dev]**
- [x] `src/ui/widgets/EffortRow.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/ui/widgets/EffortRow.ts` if changed **[S, junior-dev]**
- [x] `src/ui/widgets/ModelSelect.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/ui/widgets/ModelSelect.ts` if changed **[S, junior-dev]**
- [x] `src/ui/widgets/SegmentedControl.ts` — audit comments per `code-comments` skill; commit `docs(comments): src/ui/widgets/SegmentedControl.ts` if changed **[S, junior-dev]**

---

## F. tests (89 files)

#### Section briefing

**What this section produces:** Modified comments only across the 89 test files listed below under `tests/`. No new files, no signature changes, no test assertion changes.

**Design context the executor needs upfront:** Tests get the same treatment as production code per the `code-comments` skill. `describe`/`it` titles are the primary documentation — comments inside test bodies must explain *why* a setup or assertion matters, not *what* the code does. Strip restating-the-obvious comments. Do not modify assertions, fixtures, or test order.

**Cross-section couplings:** None.

**Section-level Red criterion:** Per file: comment-only commit lands green (the existing test still runs and passes), or audited-clean (no commit). Any file where pre-commit-green fails is reverted and flagged.

### todos

**junior-dev**
- [x] `tests/__mocks__/obsidian.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/__mocks__/obsidian.ts` if changed **[S, junior-dev]**
- [x] `tests/buildCastArgs.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/buildCastArgs.test.ts` if changed **[S, junior-dev]**
- [x] `tests/buildMetaSpell.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/buildMetaSpell.test.ts` if changed **[S, junior-dev]**
- [x] `tests/cast/Caster.types.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/cast/Caster.types.test.ts` if changed **[S, junior-dev]**
- [x] `tests/cast/createCaster.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/cast/createCaster.test.ts` if changed **[S, junior-dev]**
- [x] `tests/cast/local/LocalCaster.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/cast/local/LocalCaster.test.ts` if changed **[S, junior-dev]**
- [x] `tests/cast/portal/buildBasicAuthHeader.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/cast/portal/buildBasicAuthHeader.test.ts` if changed **[S, junior-dev]**
- [x] `tests/cast/portal/buildPortalRequestBody.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/cast/portal/buildPortalRequestBody.test.ts` if changed **[S, junior-dev]**
- [x] `tests/cast/portal/buildPortalUrl.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/cast/portal/buildPortalUrl.test.ts` if changed **[S, junior-dev]**
- [x] `tests/cast/portal/mapPortalError.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/cast/portal/mapPortalError.test.ts` if changed **[S, junior-dev]**
- [x] `tests/cast/portal/parsePortalScheme.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/cast/portal/parsePortalScheme.test.ts` if changed **[S, junior-dev]**
- [x] `tests/cast/portal/RemoteCaster.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/cast/portal/RemoteCaster.test.ts` if changed **[S, junior-dev]**
- [x] `tests/cast/RemoteCastTransport.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/cast/RemoteCastTransport.test.ts` if changed **[S, junior-dev]**
- [x] `tests/CastDispatcher.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/CastDispatcher.test.ts` if changed **[S, junior-dev]**
- [x] `tests/castLog/CastLogSource.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/castLog/CastLogSource.test.ts` if changed **[S, junior-dev]**
- [x] `tests/castLog/CastLogWriter.types.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/castLog/CastLogWriter.types.test.ts` if changed **[S, junior-dev]**
- [x] `tests/castLog/foldEvents.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/castLog/foldEvents.test.ts` if changed **[S, junior-dev]**
- [x] `tests/castLog/format/displayName.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/castLog/format/displayName.test.ts` if changed **[S, junior-dev]**
- [x] `tests/castLog/format/duration.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/castLog/format/duration.test.ts` if changed **[S, junior-dev]**
- [x] `tests/castLog/format/durationMs.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/castLog/format/durationMs.test.ts` if changed **[S, junior-dev]**
- [x] `tests/castLog/format/relativeTime.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/castLog/format/relativeTime.test.ts` if changed **[S, junior-dev]**
- [x] `tests/castLog/format/statusBadge.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/castLog/format/statusBadge.test.ts` if changed **[S, junior-dev]**
- [x] `tests/castLog/HookMaterializer.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/castLog/HookMaterializer.test.ts` if changed **[S, junior-dev]**
- [x] `tests/castLog/hookScripts.integration.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/castLog/hookScripts.integration.test.ts` if changed **[S, junior-dev]**
- [x] `tests/castLog/hookScripts.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/castLog/hookScripts.test.ts` if changed **[S, junior-dev]**
- [x] `tests/castLog/IntervalTickCoordinator.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/castLog/IntervalTickCoordinator.test.ts` if changed **[S, junior-dev]**
- [x] `tests/castLog/ScratchSweeper.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/castLog/ScratchSweeper.test.ts` if changed **[S, junior-dev]**
- [x] `tests/castLog/store.readAll.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/castLog/store.readAll.test.ts` if changed **[S, junior-dev]**
- [x] `tests/castLog/store.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/castLog/store.test.ts` if changed **[S, junior-dev]**
- [x] `tests/castLog/types.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/castLog/types.test.ts` if changed **[S, junior-dev]**
- [x] `tests/castLog/VaultRefreshCoordinator.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/castLog/VaultRefreshCoordinator.test.ts` if changed **[S, junior-dev]**
- [x] `tests/CastLogModule.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/CastLogModule.test.ts` if changed **[S, junior-dev]**
- [x] `tests/CastRunner.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/CastRunner.test.ts` if changed **[S, junior-dev]**
- [x] `tests/CastSpawner.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/CastSpawner.test.ts` if changed **[S, junior-dev]**
- [x] `tests/CommandPopup.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/CommandPopup.test.ts` if changed **[S, junior-dev]**
- [x] `tests/CommandPopupBuilder.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/CommandPopupBuilder.test.ts` if changed **[S, junior-dev]**
- [x] `tests/computeVaultMountDefault.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/computeVaultMountDefault.test.ts` if changed **[S, junior-dev]**
- [x] `tests/DebouncedSaver.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/DebouncedSaver.test.ts` if changed **[S, junior-dev]**
- [x] `tests/DetailPhase.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/DetailPhase.test.ts` if changed **[S, junior-dev]**
- [x] `tests/EffortRow.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/EffortRow.test.ts` if changed **[S, junior-dev]**
- [x] `tests/ForgeImprinter.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/ForgeImprinter.test.ts` if changed **[S, junior-dev]**
- [x] `tests/ForgeSentinelDetail.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/ForgeSentinelDetail.test.ts` if changed **[S, junior-dev]**
- [x] `tests/integration/cast-log-panel.spec.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/integration/cast-log-panel.spec.ts` if changed **[S, junior-dev]**
- [x] `tests/integration/cast-log-refresh.spec.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/integration/cast-log-refresh.spec.ts` if changed **[S, junior-dev]**
- [x] `tests/integration/cast-log-source.spec.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/integration/cast-log-source.spec.ts` if changed **[S, junior-dev]**
- [x] `tests/integration/CastLogRow.spec.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/integration/CastLogRow.spec.ts` if changed **[S, junior-dev]**
- [x] `tests/integration/execute-on-note.spec.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/integration/execute-on-note.spec.ts` if changed **[S, junior-dev]**
- [x] `tests/integration/forge-cast.spec.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/integration/forge-cast.spec.ts` if changed **[S, junior-dev]**
- [x] `tests/integration/forge-sentinel-detail.spec.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/integration/forge-sentinel-detail.spec.ts` if changed **[S, junior-dev]**
- [x] `tests/integration/harness.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/integration/harness.ts` if changed **[S, junior-dev]**
- [x] `tests/integration/keyboard-suspend.spec.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/integration/keyboard-suspend.spec.ts` if changed **[S, junior-dev]**
- [x] `tests/integration/modal-lifecycle.spec.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/integration/modal-lifecycle.spec.ts` if changed **[S, junior-dev]**
- [x] `tests/integration/options-panel-popup.spec.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/integration/options-panel-popup.spec.ts` if changed **[S, junior-dev]**
- [x] `tests/integration/options-panel.spec.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/integration/options-panel.spec.ts` if changed **[S, junior-dev]**
- [x] `tests/integration/remote-cast.spec.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/integration/remote-cast.spec.ts` if changed **[S, junior-dev]**
- [x] `tests/integration/remote-forge.spec.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/integration/remote-forge.spec.ts` if changed **[S, junior-dev]**
- [x] `tests/integration/search-input.spec.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/integration/search-input.spec.ts` if changed **[S, junior-dev]**
- [x] `tests/integration/sentinel-detail.spec.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/integration/sentinel-detail.spec.ts` if changed **[S, junior-dev]**
- [x] `tests/integration/settings-panel.spec.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/integration/settings-panel.spec.ts` if changed **[S, junior-dev]**
- [x] `tests/integration/setup.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/integration/setup.ts` if changed **[S, junior-dev]**
- [x] `tests/integration/smoke.spec.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/integration/smoke.spec.ts` if changed **[S, junior-dev]**
- [x] `tests/integration/spell-cast.spec.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/integration/spell-cast.spec.ts` if changed **[S, junior-dev]**
- [x] `tests/integration/spell-options-detail-execute-on-note.spec.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/integration/spell-options-detail-execute-on-note.spec.ts` if changed **[S, junior-dev]**
- [x] `tests/integration/tab-navigation.spec.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/integration/tab-navigation.spec.ts` if changed **[S, junior-dev]**
- [x] `tests/KeyboardController.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/KeyboardController.test.ts` if changed **[S, junior-dev]**
- [x] `tests/main.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/main.test.ts` if changed **[S, junior-dev]**
- [x] `tests/optionsFormSnapshotFromDefaults.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/optionsFormSnapshotFromDefaults.test.ts` if changed **[S, junior-dev]**
- [x] `tests/OptionsFormState.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/OptionsFormState.test.ts` if changed **[S, junior-dev]**
- [x] `tests/OptionsPanel.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/OptionsPanel.test.ts` if changed **[S, junior-dev]**
- [x] `tests/OptionsSessionMap.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/OptionsSessionMap.test.ts` if changed **[S, junior-dev]**
- [x] `tests/OptionsSnapshot.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/OptionsSnapshot.test.ts` if changed **[S, junior-dev]**
- [x] `tests/persistence.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/persistence.test.ts` if changed **[S, junior-dev]**
- [x] `tests/plugin.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/plugin.test.ts` if changed **[S, junior-dev]**
- [x] `tests/PluginPaths.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/PluginPaths.test.ts` if changed **[S, junior-dev]**
- [x] `tests/PopupModule.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/PopupModule.test.ts` if changed **[S, junior-dev]**
- [x] `tests/resolveCliBinary.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/resolveCliBinary.test.ts` if changed **[S, junior-dev]**
- [x] `tests/sanitiseSpellName.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/sanitiseSpellName.test.ts` if changed **[S, junior-dev]**
- [x] `tests/SearchPhase.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/SearchPhase.test.ts` if changed **[S, junior-dev]**
- [x] `tests/SegmentedControl.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/SegmentedControl.test.ts` if changed **[S, junior-dev]**
- [x] `tests/setup.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/setup.ts` if changed **[S, junior-dev]**
- [x] `tests/Spell.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/Spell.test.ts` if changed **[S, junior-dev]**
- [x] `tests/SpellList.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/SpellList.test.ts` if changed **[S, junior-dev]**
- [x] `tests/spellOptionsResolver.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/spellOptionsResolver.test.ts` if changed **[S, junior-dev]**
- [x] `tests/SpellOverrideStore.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/SpellOverrideStore.test.ts` if changed **[S, junior-dev]**
- [x] `tests/SpellRow.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/SpellRow.test.ts` if changed **[S, junior-dev]**
- [x] `tests/spellScanner.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/spellScanner.test.ts` if changed **[S, junior-dev]**
- [x] `tests/SpellsPanel.test.ts` — audit comments per `code-comments` skill; commit `docs(comments): tests/SpellsPanel.test.ts` if changed **[S, junior-dev]**

---

## G. config (2 files)

#### Section briefing

**What this section produces:** Modified comments only across the 2 vitest config files at the repo root. No config option changes.

**Design context the executor needs upfront:** Apply the `code-comments` skill verbatim. Config files often benefit from a brief module header explaining *why* this config exists alongside the other one (e.g. unit vs integration), but only if that distinction is not already obvious from the filename alone.

**Cross-section couplings:** None.

**Section-level Red criterion:** Per file: comment-only commit lands green, or audited-clean (no commit). Flagged files surface in the iteration summary.

### todos

**junior-dev**
- [x] `vitest.config.ts` — audit comments per `code-comments` skill; commit `docs(comments): vitest.config.ts` if changed **[S, junior-dev]**
- [x] `vitest.integration.config.ts` — audit comments per `code-comments` skill; commit `docs(comments): vitest.integration.config.ts` if changed **[S, junior-dev]**
