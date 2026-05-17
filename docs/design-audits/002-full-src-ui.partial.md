---
shard: src-ui
verdict: REWORK
violation_count: 41
---

# Design Audit Partial: src/ui

## Threshold Violations

| Unit | Location | Measure | Threshold | Severity |
|------|----------|---------|-----------|----------|
| File | src/ui/CommandPopup.ts | 343 LOC | >300 FAIL | ❌ |
| Method `CommandPopupBuilder.build` | src/ui/popup/CommandPopupBuilder.ts:34–88 | 55 LOC | >40 FAIL | ❌ |
| Params `CastLogList.render` | src/ui/components/CastLogList.ts:22 | 4 params | >3 FAIL | ❌ |
| Params `CastLogList.#syncRows` | src/ui/components/CastLogList.ts:78 | 4 params | >3 FAIL | ❌ |
| Params `SearchInput.render` | src/ui/components/SearchInput.ts:10 | 5 params | >3 FAIL | ❌ |
| Params `SearchInput.#applyInitialFilter` | src/ui/components/SearchInput.ts:37 | 4 params | >3 FAIL | ❌ |
| Params `TabBar.render` | src/ui/components/TabBar.ts:8 | 5 params | >3 FAIL | ❌ |
| Params `TabBar.#buildTabs` | src/ui/components/TabBar.ts:23 | 4 params | >3 FAIL | ❌ |
| Params `TabBar.#buildTab` | src/ui/components/TabBar.ts:27 | 4 params | >3 FAIL | ❌ |
| Params `CastModelSection.mount` | src/ui/options/CastModelSection.ts:37 | 4 params | >3 FAIL | ❌ |
| Params `OptionsPanel.render` | src/ui/options/OptionsPanel.ts:38 | 4 params | >3 FAIL | ❌ |
| Params `OptionsPanel.#buildFormControls` | src/ui/options/OptionsPanel.ts:73 | 4 params | >3 FAIL | ❌ |
| Params `OptionsPanel.#bindReset` | src/ui/options/OptionsPanel.ts:188 | 8 params | >3 FAIL | ❌ |
| Params `optionsFormSnapshotFromRefineDefaults` | src/ui/options/OptionsFormState.ts:39 | 4 params | >3 FAIL | ❌ |
| Params `GrimoireSettingTab.#addTextField` | src/ui/settings/GrimoireSettingTab.ts:91 | 4 params | >3 FAIL | ❌ |
| Params `GrimoireSettingTab.#addToggleField` | src/ui/settings/GrimoireSettingTab.ts:97 | 4 params | >3 FAIL | ❌ |
| File (warn) | src/ui/components/CastLogRow.ts | 206 LOC | >200 warn (<300 file fail) | ⚠ |
| File (warn) | src/ui/options/OptionsPanel.ts | 211 LOC | >200 warn (<300 file fail) | ⚠ |

## Violations by Smell

### God Class
- src/ui/CommandPopup.ts:78–343 — `CommandPopup` is 264 LOC inside a 343-LOC file (>300 file FAIL). The class owns phase state, panel construction, event wiring for four event types (cast, sentinel, refine-cast, open-options, open-refine-options), keyboard binding, tab bar lifecycle, search rendering, three near-identical detail-panel renderers (`#renderForgeSentinelDetail`, `#renderOptionsPanel`, `#renderRefineOptionsPanel`), close interception override, and an `openLink` workspace handler. Multiple reasons to change. Refactoring move: Extract Class — DetailPanelRouter for the three render-detail methods; PopupEventWiring for the panel.events.on chain in `#createSpellsPanel`.

### Long Method
- src/ui/popup/CommandPopupBuilder.ts:34–88 — `build()` is 55 LOC (>40 FAIL): declares `refineCastAction` with 18-line nested body, then constructs the `CommandPopup` with another inline `imprintAction` lambda and inline `castAction` lambda, then mutates the outer `dispatcher` binding. Three lambdas with real logic plus assembly in one method. Refactoring move: Extract Method `#buildRefineCastAction`, `#buildImprintAction`, `#buildCastAction`.

### Long Method (warn-tier — over 20 LOC, still violation per rubric prompt)
- src/ui/options/OptionsFormState.ts:39–76 — `optionsFormSnapshotFromRefineDefaults` is 38 LOC. Builds a 12-field stub settings object inline, calls resolver, then assembles the snapshot. Refactoring move: Extract `#buildResolverSettingsStub`.
- src/ui/widgets/EffortRow.ts:23–60 — `EffortRow.mount` is 38 LOC with four early-return guards and inline console error logging. Refactoring move: Extract `#resolveModel`, `#resolveInitialEffort`.
- src/ui/widgets/EffortRow.ts:62–99 — `EffortRow.update` is 38 LOC with four switch-like `if` blocks each marked by a `// Case N:` comment — the comments are asking to become method names. Refactoring move: Replace Conditional with Polymorphism / Extract Method per case.
- src/ui/widgets/SegmentedControl.ts:43–73 — `setOptions` is 31 LOC, two distinct branches (same-options diff vs full rebuild). Refactoring move: Extract Method `#updateSameOptions`, `#rebuildOptions`.
- src/ui/options/OptionsFormState.ts:100–124 — `setModel` is 25 LOC with three-branch effort-survival logic mixed with state mutation, fallback warning logging, and emit. Refactoring move: Extract `#resolveEffortForModel(model)` predicate.
- src/ui/options/CastModelSection.ts:123–147 — `#subscribeReactive` is 25 LOC with nested fallback-mount logic for EffortRow. Refactoring move: Extract `#remountEffortIfNeeded`.
- src/ui/options/OptionsPanel.ts:73–101 — `#buildFormControls` is 29 LOC plus 4-param signature. Refactoring move: Split into `#buildPrimaryFields` + `#buildSubmissionControls`.
- src/ui/options/OptionsPanel.ts:188–210 — `#bindReset` takes 8 parameters and is 23 LOC. Refactoring move: Introduce Parameter Object `ResetContext`; Extract Method `#applyResetState`.
- src/ui/components/RefineOptionsDetail.ts:41–63 — `#resolveOptions` is 23 LOC due to 12-field empty-string stub.
- src/ui/CommandPopup.ts:114–145 — constructor is 32 LOC (>20 warn). Builds three subcomponents, four event subscriptions, and a 12-field PopupPhaseContext object. Refactoring move: Extract `#buildPhaseContext`.

### Long Parameter List / Data Clump
- src/ui/options/OptionsPanel.ts:188 — `#bindReset(button, snapshot, formState, deps, textarea, eonCheckbox, initialExecuteOnNote, showExecuteOnNote)` — 8 parameters. Multiple data clumps (`eonCheckbox + initialExecuteOnNote + showExecuteOnNote` always travel together).
- src/ui/components/TabBar.ts:8 — `render(container, tabs, activeTab, disabled, onSwitch)`, propagated to `#buildTabs` and `#buildTab`. The 4-tuple `(activeTab, disabled, onSwitch)` + per-tab `id` clump traverses three methods → Preserve Whole Object as `TabBarConfig`.
- src/ui/components/SearchInput.ts:10,37 — `(container, panel, initialQuery, initialSelectedIndex, onFilter)` reused with permutations.
- src/ui/components/CastLogList.ts:22,78 — `(records, expandedIds, now, onToggle)` clump passed through twice.
- src/ui/options/CastModelSection.ts:37 — `(container, formState, snapshot, deps)` clump; also reappears in `OptionsPanel.render` (line 38) and `OptionsPanel.#buildFormControls` (line 73). Move `formState+snapshot` into a single `OptionsFormBinding` value object.

### Flag Arguments
- src/ui/CommandPopup.ts:269 — `#enterDetail(detail, onBack, { suspendKb: true })`. The only call sites all pass `suspendKb: true` (lines 289, 309, 328); the `false` branch is documented as "not currently used (for future use)". Dead flag controlling behavior → split or inline the suspend.
- src/ui/options/OptionsPanel.ts:19,84–88 — `OptionsPanelDeps.showExecuteOnNote?: boolean` toggles render and reset behavior of the executeOnNote checkbox. Two static call sites (`SpellOptionsDetail` true, `RefineOptionsDetail` false). Refactoring move: Split into `SpellOptionsPanel` and `RefineOptionsPanel`, or Replace Conditional with Strategy.
- src/ui/components/SentinelRow.ts:12 — `render(container, sentinel, selected, showHint = false)` — boolean flag switching whether to append hint chip.
- src/ui/components/SpellRow.ts:12 — `render(container, spell, selected, hasOverride = false)` — boolean flag controlling whether the override dot renders.
- src/ui/components/TabBar.ts:8,27 — `disabled: boolean` flag changes tab interactivity. Two states, two responsibilities.

### Command-Query Separation Violation
- src/ui/options/OptionsFormState.ts:100 — `setModel(modelId, models): Effort | null` mutates `#model`, `#effort`, calls `#emit()`, and returns a value. A method named `set...` must not return computed state. Split into `setModel(...)` (void) + `resolvedEffort()` query.
- src/ui/tabs/SpellsPanel.ts:63 — `filter(query): number` mutates `#filteredSpells`, `#lastSelectedIndex`, rerenders the list, and returns an index. Split into `filter(query)` (void) + `focusedIndex()` query.
- src/ui/components/SearchInput.ts:50–53 — `oninput` handler calls `panel.filter(query)` to drive both the filter side effect and the callback's index argument. Couples consumer to the CQS violation in `SpellsPanel.filter`.

### Duplicated Code / Shotgun Surgery
- The 12-field empty-string settings stub (`spellTag, cliCommand, binaryPath, forgeOutputFolder, vaultMountPath, executionMode, portalHost, portalPort, portalPath, portalAuthUser, portalAuthPassword`) is hand-rolled in three places:
  - src/ui/components/SpellOptionsDetail.ts:45–58
  - src/ui/components/RefineOptionsDetail.ts:47–60
  - src/ui/options/OptionsFormState.ts:50–63
  Any new settings field requires editing all three. Refactoring move: Extract Function `buildOptionsResolverSettings(formDefaults)` or — better — change `resolveSpellOptions` to accept only the fields it actually reads.

### Leaky Abstraction
- src/ui/components/SpellOptionsDetail.ts:40–62, src/ui/components/RefineOptionsDetail.ts:41–63, src/ui/options/OptionsFormState.ts:45–65 — UI callers fabricate a fake `Settings` shape filled with empty strings purely to satisfy `resolveSpellOptions`. The resolver leaks its full settings dependency into every call site that only cares about `defaultModel`/`defaultEffort`. Refactoring move: Tighten `resolveSpellOptions` parameter to a narrower `{ defaultModel; defaultEffort }`.

### Middle Man / Divergent-by-Copy
- src/ui/components/SpellOptionsDetail.ts and src/ui/components/RefineOptionsDetail.ts — two classes, near-identical structure (`render` → `#resolveOptions` → `#buildFormState` → `#createPanel` → `destroy`). Both wrap `OptionsPanel`. They diverge only in: spell path (one passes `params.spell.path`, the other hard-codes `REFINE_SENTINEL_PATH`), `executeOnNote` source, and one boolean flag passed to OptionsPanel. Refactoring move: Unify into a single `OptionsDetail` parameterized by an `OptionsDetailKind` value object.

### Dead Code / Speculative Generality
- src/ui/CommandPopup.ts:108–112 — `refineCastActionForWiring` getter exists solely to suppress an "unused private member" lint error with a `TODO: Section D` comment. By rubric: comments-restating-future-intent and dead surface. Refactoring move: Delete the getter; the field is already wired through `#renderRefineOptionsPanel` and `#createSpellsPanel`.
- src/ui/CommandPopup.ts:268–273 — `#enterDetail`'s `suspendKb: false` path is documented "not currently used (for future use)". Speculative generality. Refactoring move: Inline as unconditional suspend; reintroduce the flag when a real second caller exists.

### Anemic Domain / Primitive Obsession
- src/ui/options/OptionsSessionMap.ts:4–10 — `OptionsSessionEntry` is a 5-field bag with no behavior. The same shape is fabricated in `OptionsFormSnapshot` (OptionsFormState.ts:9–15) and re-used by `OptionsFormState.snapshot()` and `sessionMap.put`. Tell-Don't-Ask is violated: callers manually copy fields from `OptionsFormSnapshot` into `sessionMap.put` (see OptionsPanel.ts:92–93 and src/ui/CommandPopup.ts:218–232). Refactoring move: Make `OptionsSessionEntry` the same value as `OptionsFormSnapshot`, or give `OptionsFormSnapshot` a `toSessionEntry()` method.
- `model: string` flows as a primitive through `OptionsFormSnapshot`, `OptionsSessionEntry`, `OptionsSnapshot`, `EffortRow`, `ModelSelect`. Refactoring move: Introduce `ModelId` value object.

### Mysterious Names
- src/ui/settings/GrimoireSettingTab.ts:34,48,64,78 — `const s = this.#plugin.data.settings;` — single-letter name for the central settings reference, repeated four times. Per rubric: single letters outside loop counters → Rename to `settings`.
- src/ui/settings/GrimoireSettingTab.ts:92,98 — `const s = new Setting(this.containerEl)...` — same letter rebound to a different concept in the same file. Concept drift via short name.
- src/ui/components/CastLogList.ts:90 — destructured `r` in `records.filter((r) => r.status === 'casted' || ...)` — acceptable as loop var.

### Feature Envy
- src/ui/components/CastLogRow.ts:80–207 — module-level functions `buildNameSpan`, `buildModelBadgeSpan`, `buildStartedSpan`, `buildDurationSpan`, `buildStatusBadgeSpan`, `updateNameSpan`, `updateModelBadgeSpan`, `updateStartedSpan`, `updateDurationSpan`, `updateStatusBadgeSpan`, `appendCastIdRow`, `appendContextNotesRow`, `appendAffectedFilesRow`, `appendFollowUpRow`, `appendExecuteOnNoteRow` — all read `record.*` fields and call format helpers. They envy `CastRecord` data. Refactoring move: Move Method onto `CastRecord` (formatters) or onto a `CastRecordHeader` / `CastRecordBody` value object.

### Mixed Concerns (SRP)
- src/ui/popup/CommandPopupBuilder.ts:37–55 — `refineCastAction` mixes (1) validating active file is an md, (2) emitting a user-facing `Notice` UI side effect, (3) calling dispatcher with assembled payload, (4) closing the popup. Four responsibilities in one arrow. Refactoring move: Extract `#requireActiveMarkdownFile()` guard, `#buildRefineDispatchCommand(snapshot, activeFile)`, leave dispatch + dismiss in the action.
- src/ui/options/OptionsFormState.ts:100–124 — `setModel` mixes effort-survival resolution logic, fallback model resolution (with `console.warn` I/O), state mutation, and listener emit. Refactoring move: Extract `#resolveModel`, `#resolveEffort`.

### Logging Bleeding from Domain
- src/ui/options/OptionsFormState.ts:104 — `console.warn(...)` inside reactive form state on missing model. Domain state object writes to the console.
- src/ui/widgets/EffortRow.ts:28,50, src/ui/widgets/EffortRow.ts:67 — `console.error(...)` for missing model / missing default effort. UI widget logs through a global I/O sink. Refactoring move: Surface via callback / Result, or fail fast.

### Comments Restating Code
- src/ui/widgets/EffortRow.ts:24 (`// Look up the model`), :30 (`// Store for later use in update (must happen before any early return)`), :36 (`// If model has no effort options, don't mount anything`), :41 (`// Create wrapper div`), :45 (`// Determine the initial effort value`), :54 (`// Instantiate SegmentedControl`), :69, :78, :86, :97 — every block has a comment narrating the next two lines. Asking to become method names. Refactoring move: Extract Method per comment; delete the comments.
- src/ui/widgets/EffortRow.ts:69–97 — `// Case 1:`, `// Case 2:`, `// Case 3:`, `// Case 4:` — comments enumerate a Replace Conditional with Polymorphism candidate.
- src/ui/options/OptionsFormState.ts:101 (`// Find the model; fall back to models[0] if not found`), :108 (`// Apply effort survival rule`), :112 (`// Survival: current effort is still valid for the new model`), :115 (`// Fallback: use the model's default (which may be null for Haiku)`) — narration.

### Nested Function with Real Logic
- src/ui/popup/CommandPopupBuilder.ts:37–55 — `const refineCastAction: RefineCastAction = (snapshot) => { ... 18 lines including a guard, a Notice, a dispatcher call, and `popup.dismiss()` ... };` declared inside `build()`. Used once. Per rubric: "A declared `const foo = () => { ... }` used only once inside the parent method that carries real logic = Extract Method."

### Pattern Missing — State
- src/ui/CommandPopup.ts:183–186 plus phase-handler indirection — `close()` override delegates to `#currentPhase.interceptClose()`, but the `CommandPopup` itself still owns the suspend/resume keyboard, the activePanel mutation, and the renderSearch dispatch via the `PopupPhaseContext` callbacks. The State pattern is half-applied: phases handle key events but mutate the host through a 12-field context object instead of owning their own state. Tighten by giving phases real responsibility (currently `DetailPhase` and `SearchPhase` only return booleans and re-call into the host).

### Pattern Misapplied — Speculative `kind` discrimination
- src/ui/popup/PopupPhase.ts:25, src/ui/popup/DetailPhase.ts:8, src/ui/popup/SearchPhase.ts:9 — every phase exposes `readonly kind: 'search' | 'detail'`, consumed only by `CommandPopup.#createTabBar` (line 205: `this.#currentPhase.kind === 'detail'`). If phases are truly polymorphic, the host should ask `phase.shouldDisableTabBar()` not `phase.kind`. The `kind` field is a Type-Code-via-String. Refactoring move: Replace Type Code with Polymorphism — add `disablesTabBar(): boolean` to `PopupPhase`.

## Verdict
REWORK
