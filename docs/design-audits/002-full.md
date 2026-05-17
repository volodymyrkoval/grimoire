---
scope: full
run: 002
verdict: REWORK
violation_count: 131
shards: [src-cast, src-castlog, src-domain, src-editor, src-execution-main-refine, src-forge-infra, src-ui, architecture]
---

# Design Audit: Full Codebase

## Verdict
❌ REWORK

## Summary
131 total violations across 8 shards. The worst systemic issue is a broken domain boundary: `domain/` is not pure — it imports the Obsidian SDK (`App`, `TFile`, `Platform`, `FileSystemAdapter`, `prepareFuzzySearch`) and `infra/DebouncedSaver`, which means the codebase has no host-agnostic core. A secondary systemic fault is codebase-wide Primitive Obsession: `ModelId`, `CastId`, `AbsolutePath`, and path-variant types all flow as bare `string` through 6 of 7 source shards, giving the type system no ability to detect mix-ups. The architecture shard also reports a broken `dependency-cruiser` config, meaning these boundary violations currently slip through CI undetected.

---

## Architecture Findings

_(Source: [docs/design-audits/002-full-architecture.partial.md](002-full-architecture.partial.md))_

**9 violations.** The fitness tool (`dependency-cruiser`) is misconfigured and non-functional — fix first, then drain the four boundary violations below.

### Dependency Direction Violations

**A — `domain/` → `infra/`** (domain must be pure)
- `src/domain/settings/SpellOverrideStore.ts:3` imports `DebouncedSaver`. Refactoring move: define a `SaveScheduler` port in domain; wire `DebouncedSaver` from `main/`.

**B — `domain/` → `obsidian` SDK** (4 violations; host runtime is infrastructure)
- `src/domain/settings/persistence.ts:1` imports `App`. Move `hydrate` to `infra/SettingsRepository`.
- `src/domain/settings/computeVaultMountDefault.ts:1` imports `App`, `Platform`, `FileSystemAdapter`. Move to `infra/`; inject resolved string at startup.
- `src/domain/spells/spellScanner.ts:1` imports `App`, `TFile`. Move scanner to `infra/`; domain owns only the `Spell` shape.
- `src/domain/spells/fuzzyFilter.ts:1` imports `prepareFuzzySearch`, `sortSearchResults`. Define a pure `rankSpells` port in domain; move the Obsidian ranker to `infra/`.

**C — `forge/` → `castLog/`** (rule: forge → domain only; 2 violations)
- `src/forge/ForgeImprinter.ts:2` imports `FORGE_SPELL_PATH` from `castLog/types`. Move constant to `domain/spells/`.
- `src/forge/ForgeImprinter.ts:7` imports `CastLogWriter`. Define a `CastEventSink` port in forge; wire from `main/`.

**D — `refine/` → `castLog/`** (rule: refine → domain, cast)
- `src/refine/refineCastSpell.ts:2` imports `REFINE_SPELL_PATH` from `castLog/types`. Move to `domain/spells/`.

**E — `cast/` → `castLog/`** (rule: cast → domain, execution, infra)
- `src/cast/CastDispatcher.ts:4` imports `CastLogWriter`. Extract a `CastResultRecorder` port in cast; wire from `main/`.

### Cross-Module Smells

**Feature Envy**
- `src/forge/ForgeImprinter.ts` — depends on two castLog symbols; orchestrates castLog persistence more than forge logic. Port-and-adapter the `ForgeOutcomeSink`.
- `src/refine/refineCastSpell.ts` — reaches into castLog only for `REFINE_SPELL_PATH`. Eliminated entirely by moving the constant to domain.

**Leaky Abstraction**
- `src/domain/spells/fuzzyFilter.ts` — exposes Obsidian search semantics from inside domain. Invert to a pure port.
- `castLog/types.ts` is a junk drawer for domain spell-path identifiers (`FORGE_SPELL_PATH`, `REFINE_SPELL_PATH`) used by forge, refine, and ui. Move Field to `domain/spells/`.

---

## Per-Shard Findings

### src-cast (17 violations)
_(Source: [docs/design-audits/002-full-src-cast.partial.md](002-full-src-cast.partial.md))_

**Threshold violations:**
- `RemoteCastTransport.#execute` — 74-line method (FAIL >40)
- `CastDispatcher.dispatch` — 54-line method (FAIL >40)
- `CastDispatcher.#buildUserPrompt` — 5 parameters (FAIL >3)

**Smells:** Long Method, SRP, Long Parameter List, Inline Predicate, Nested Function Logic, Duplicated Code (two arms of LocalCaster.cast), Primitive Obsession (castId/spellPath/modelId/etc. as bare strings codebase-wide), Data Clumps (portal config cluster, local cast env cluster), Concept Drift (cast ID named three ways: `castId`/`portalCastId`/`jobId`; agent hooks dir named four ways), Leaky Abstraction (RequestUrlResponse shape leaks into transport), Speculative Generality (rejecting default in constructor), Command-Query Mix (timer side effect in Promise executor), Feature Envy (`mapPortalError` return fields not fully consumed), Magic Number (truncation limit 200).

---

### src-castLog (18 violations)
_(Source: [docs/design-audits/002-full-src-castlog.partial.md](002-full-src-castlog.partial.md))_

**Threshold violations:**
- `VaultRefreshCoordinator` class — 201 LOC (WARN)
- Three methods in `VaultRefreshCoordinator` — nesting depth 3 (FAIL >2)
- `CastLogStore.#readFromFile` — nesting depth 3 (FAIL >2)

**Smells:** God Class / Divergent Change (`VaultRefreshCoordinator` has 5 reasons to change), Long Method (`#readFromFile`), Nested Pyramid / Arrow Code (triple nesting in 4 locations), Swallowed Exceptions (4 silent catch blocks in one file + 3 others across shard), Shotgun Surgery (4 classes hand-roll identical `DataAdapter`+ENOENT pattern), Temporal Coupling (`HookMaterializer.#hooksDir` init), DIP / Optional-Adapter Coupling (optional ports with non-null assertions across 4 classes), Stringly-Typed Sentinel Values (`FORGE_SPELL_PATH`/`REFINE_SPELL_PATH` as magic string type-codes — should be discriminated union), Primitive Obsession (paths + castId + model as bare strings), Missing Strategy / Switch on Type (display name and stage dispatch via string comparisons), Duplicated Code (foldEvents, store), Leaky Abstraction (unsafe cast in `#readFromFile`), Flag-like Unused Parameter (encoding in `readFile`).

---

### src-domain (13 violations)
_(Source: [docs/design-audits/002-full-src-domain.partial.md](002-full-src-domain.partial.md))_

**Threshold violations:**
- `resolveSpellOptions` — ~32 LOC (WARN)
- `SpellOverrideStore.set` — ~22 LOC (WARN)

**Smells:** SRP (4 functions/methods with "and" in docstrings), Inline Logic / Magic Ternary (`parseExecuteOnNote`), Silent Fallback (`resolvedModel` with no error), Primitive Obsession (`model: string` pervasive; `Settings` has 8+ bare-string fields for distinct domain concepts), Data Clumps (`{model, effort}` shape duplicated across 3 interfaces), Swallowed Errors / Silent Command (`SpellOverrideStore.set` returns void on validation failure; caller can't detect rejection), Leaky Abstraction (unsafe cast in `persistence.hydrate`), Type-system bypass (`defaultEffort!` non-null assertion in `#clampEffort`).

---

### src-editor (2 violations)
_(Source: [docs/design-audits/002-full-src-editor.partial.md](002-full-src-editor.partial.md))_

**Threshold violations:**
- `buildCastDecorations` — nesting depth 3 (FAIL >2)
- `isInsideFencedCodeBlock` — nesting depth 3 (FAIL >2)

**Smells:** Both violations are nesting-depth. No god classes, no feature envy, no leaky abstractions detected. Clean module boundary — CM6 types stay inside this shard.

---

### src-execution + src/main + src/refine (7 violations)
_(Source: [docs/design-audits/002-full-src-execution-main-refine.partial.md](002-full-src-execution-main-refine.partial.md))_

**Threshold violations:**
- `CastLogModule.initStartupMaintenance` — 45 LOC (FAIL >40)
- Constructor `CastLogModule` — ~24 LOC (WARN)
- `buildCastLogPanelDeps` — ~23 LOC (WARN)
- Constructor `PopupModule` — ~22 LOC (WARN)

**Smells:** Long Method (initStartupMaintenance), SRP / Divergent Change (`CastLogModule` has 4 reasons to change: log wiring, panel deps, startup maintenance for 4 subsystems, forge re-materialization), Shotgun Surgery (3 identical `try/catch console.error` blocks; forge materializer construction duplicated), Data Clumps (`adapter + getXxxPathAbs` clump across 4 port types), Swallowed Exceptions (3 silent catches + fire-and-forget sweeper), Primitive Obsession (`CastInput` uses bare strings for `castId`, `modelId`, `vaultMountPath`; `SpellPath` value object exists but `CastInput.spellPath` is still `string`).

---

### src-forge + src/infra (24 violations)
_(Source: [docs/design-audits/002-full-src-forge-infra.partial.md](002-full-src-forge-infra.partial.md))_

**Threshold violations:**
- `ForgeImprinter.imprint` — ~60 LOC (FAIL >40); cyclomatic complexity ~6 (WARN)

**Smells:** Long Method (`imprint`), SRP (`ForgeImprinter` + `PluginPaths`), Flag Argument (`isRemote` boolean drives 4 branches — Strategy missing), Feature Envy (`imprint` envies `snapshot` data), Data Clump (cast input cluster constructed twice), Anemic Domain Model (`ForgeFormSnapshot` is a data bag), Primitive Obsession (all `PluginPaths` methods return raw `string`; plugin-rel vs vault-rel distinction only in names), Duplicated Code (`forgeSpellPathPluginRel`/`forgeSpellPathVaultRel` byte-identical; `refineSpellPath` pair same; `KeyboardController.bind/resume` + `suspend/unbindAll`), Speculative Generality / OCP (`ForgeMaterializer` triple injection shapes), Illegal State Representable (runtime guard masks type gap in `ForgeMaterializerPorts`), Leaky Abstraction / DIP (`forge/` imports `DataAdapter` from `obsidian`), Middle Man (one-line adapter pass-throughs), Swallowed Exceptions (3 `.catch(console.error)` + `DebouncedSaver`), Mysterious Name (`run()`), Type-system bypass (`TypedEmitter` internals use `unknown`), Missing `off()` / resource leak risk, LSP violation (`bindTrap` silently excluded from lifecycle methods), Resource-as-code (`forgeTemplate` is a 45-line doc-string function), Path manipulation in business code.

---

### src-ui (41 violations)
_(Source: [docs/design-audits/002-full-src-ui.partial.md](002-full-src-ui.partial.md))_

**Threshold violations (hard FAIL):**
- `src/ui/CommandPopup.ts` — 343 LOC file (FAIL >300)
- `CommandPopupBuilder.build` — 55 LOC method (FAIL >40)
- `OptionsPanel.#bindReset` — 8 parameters (FAIL >3)
- 8 additional methods with 4–5 parameters (FAIL >3)

**Smells:** God Class (`CommandPopup` — 264 LOC class with 9+ responsibilities), Long Method (8 methods at warn-tier 20–40 LOC plus 2 at FAIL), Long Parameter List / Data Clumps (`#bindReset` 8-param, TabBar 5-param, SearchInput 5-param, CastLogList 4-param, all with repeated clumps), Flag Arguments (5 boolean flags controlling behavior across 5 files), CQS violations (`OptionsFormState.setModel` mutates + returns; `SpellsPanel.filter` mutates + returns index), Duplicated Code (12-field settings stub hand-rolled in 3 places), Leaky Abstraction (`resolveSpellOptions` forces UI to fabricate full `Settings`), Middle Man / Divergent-by-Copy (`SpellOptionsDetail` + `RefineOptionsDetail` are near-clones differing by one flag), Dead Code / Speculative Generality (`refineCastActionForWiring` getter + `suspendKb: false` path), Anemic Domain / Primitive Obsession (`OptionsSessionEntry` data bag; `model: string` pervasive), Mysterious Names (`const s =` rebound twice in `GrimoireSettingTab`), Feature Envy (15 module-level functions in `CastLogRow` all envy `CastRecord`), Mixed Concerns (`refineCastAction` lambda has 4 responsibilities), Logging Bleeding from Domain (`console.warn/error` inside form state + widgets), Comments Restating Code (10+ narration comments in `EffortRow` alone), Nested Function with Real Logic (18-line `refineCastAction` declared inside `build()`), Half-Applied State Pattern (`CommandPopup` phases return booleans instead of owning state), Type Code via String (`phase.kind === 'detail'` instead of `phase.disablesTabBar()`).

---

## Systemic Patterns

The following smells appear in **4 or more shards** — these are codebase-wide patterns, not isolated incidents:

### 1. Primitive Obsession (6/7 source shards)
`ModelId`, `CastId`, `SpellPath`, absolute paths, plugin-relative paths, vault-relative paths, `PortalEndpoint` all flow as bare `string`. `SpellPath` has a value object but `CastInput.spellPath` is still `string`. Every other concept is unbranded. Fix once as a domain-level ADT pass; the type system will then catch mix-ups statically.

### 2. SRP / Long Method (6/7 source shards)
Pervasive "and" in function descriptions: `dispatch`, `imprint`, `initStartupMaintenance`, `#readFromFile`, `#execute`, `resolveSpellOptions`, `build()`, `setModel`. In every case the violation is structural: one function at multiple abstraction levels, or one class with multiple axes of change.

### 3. Swallowed Exceptions (4/7 source shards)
`castLog`, `forge-infra`, `execution-main-refine`, `forge` all have silent `catch (e) { console.error(e) }` that degrade silently. Startup maintenance, forge/refine materialization, and debounced saves all fail invisibly.

### 4. Data Clumps (5/7 source shards)
`{model, effort}` (`domain`), `{adapter, getXxxPathAbs}` (`main/refine`), portal config 5-tuple (`cast`), `{formState, snapshot, deps}` (`ui`), `{eonCheckbox, initialEon, showEon}` (`ui`). Each clump is a missing value object.

### 5. Duplicated Code / Shotgun Surgery (5/7 source shards)
The 12-field settings stub (3 UI locations), `DataAdapter`+ENOENT pattern (4 castLog classes), forge materializer construction (2 CastLogModule methods), LocalCaster ternary arms, `KeyboardController` register/unregister pairs. Any new settings field or port shape requires 2–4 edits.

---

## Priority

1. **Architecture fitness tool** — `.dependency-cruiser.cjs` is broken; no CI enforcement of any boundary rules today. Fix before addressing individual violations so regressions are caught.
2. **Domain purity** (`domain/` → `obsidian` SDK ×4 + `infra/` ×1) — highest leverage: purifying domain unlocks testability of all domain logic without an Obsidian runtime.
3. **Relocate `FORGE_SPELL_PATH` / `REFINE_SPELL_PATH`** — move from `castLog/types` to `domain/spells/`; kills 3 cross-module boundary violations at once.
4. **Port-and-adapter `CastLogWriter`** in `forge/` and `cast/` — define `CastEventSink` / `CastResultRecorder` ports; kills violations C/E; decouples cast + forge from castLog entirely.
5. **God classes** — `CommandPopup` (9+ responsibilities, 343-LOC file), `VaultRefreshCoordinator` (5 axes of change), `CastLogModule` (4 roles), `ForgeImprinter`/`CastDispatcher` (mixed orchestration + policy).
6. **Primitive Obsession** — `ModelId` branded type (6 shards affected); `AbsolutePath`/`PluginRelPath`/`VaultRelPath` (eliminates `PluginPaths` byte-identical method pairs); `CastId`.
7. **Long methods** — `RemoteCastTransport.#execute` (74 LOC), `ForgeImprinter.imprint` (60 LOC), `CommandPopupBuilder.build` (55 LOC), `CastDispatcher.dispatch` (54 LOC), `initStartupMaintenance` (45 LOC).

---

## Partials
- [docs/design-audits/002-full-src-cast.partial.md](002-full-src-cast.partial.md)
- [docs/design-audits/002-full-src-castlog.partial.md](002-full-src-castlog.partial.md)
- [docs/design-audits/002-full-src-domain.partial.md](002-full-src-domain.partial.md)
- [docs/design-audits/002-full-src-editor.partial.md](002-full-src-editor.partial.md)
- [docs/design-audits/002-full-src-execution-main-refine.partial.md](002-full-src-execution-main-refine.partial.md)
- [docs/design-audits/002-full-src-forge-infra.partial.md](002-full-src-forge-infra.partial.md)
- [docs/design-audits/002-full-src-ui.partial.md](002-full-src-ui.partial.md)
- [docs/design-audits/002-full-architecture.partial.md](002-full-architecture.partial.md)
