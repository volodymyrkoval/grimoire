---
shard: src-execution-main-refine
verdict: REWORK
violation_count: 7
---

# Design Audit Partial: src/execution + src/main + src/refine

## Threshold Violations

| Unit | Location | LOC / depth / params | Threshold | Severity |
|------|----------|----------------------|-----------|----------|
| Method `initStartupMaintenance` | src/main/CastLogModule.ts:117-161 | 45 LOC body | >40 FAIL | FAIL |
| Method constructor | src/main/CastLogModule.ts:56-80 | ~24 LOC body | >20 warn | WARN |
| Method `buildCastLogPanelDeps` | src/main/CastLogModule.ts:91-114 | ~23 LOC body | >20 warn | WARN |
| Method constructor | src/main/PopupModule.ts:27-50 | ~22 LOC body | >20 warn | WARN |

## Violations by Smell

### Long Method
- src/main/CastLogModule.ts:117-161 — `initStartupMaintenance` is 45 LOC body. Exceeds hard FAIL threshold (>40). Refactoring move: Extract Method per subsystem — `runRemoteHookMaterializer()`, `runForgeMaterializer()`, `runRefineMaterializer()`, `runScratchSweeper()`. The method's own body becomes four sequential `await`s.

### SRP Violation (Mixed Concerns in One Method)
- src/main/CastLogModule.ts:117-161 — `initStartupMaintenance` orchestrates four unrelated subsystems (remote hook script materialization, forge spell materialization, refine spell materialization, scratch directory sweep). Each has its own factory, ports shape, and failure log message. Cannot be described in one sentence without "and". Refactoring move: Extract Method per concern; consider a `StartupMaintenanceRunner` that composes named tasks.

### Divergent Change (SRP at Class Level)
- src/main/CastLogModule.ts:46-173 — `CastLogModule` has at least four reasons to change: (1) cast-log store wiring, (2) CastLogPanel UI dependency construction (`buildCastLogPanelDeps`), (3) startup maintenance orchestration of four distinct subsystems (hooks/forge/refine/scratch), (4) on-demand forge re-materialization (`materializeForge`). A change to refine materialization wiring forces edits to a class whose primary name suggests cast-log responsibility. Refactoring move: Extract Class — `StartupMaintenanceRunner` (owns the four init tasks and `materializeForge`), leaving `CastLogModule` with only log-store + panel-deps responsibilities.

### Shotgun Surgery / Duplicated Code
- src/main/CastLogModule.ts:127-131, 139-143, 150-154 — three structurally identical `try { await X.run() } catch (e) { console.error('<Name> failed', e) }` blocks. Same shape, copy-pasted error handling. Refactoring move: Extract Method `runOrLog(label, task)` that swallows-and-logs uniformly, or replace with a tasks array iterated once.
- src/main/CastLogModule.ts:133-137 vs 164-171 — forge materializer construction (`#forgeMaterializerFactory({ adapter, getForgePathAbs, getSettings })`) is duplicated verbatim between `initStartupMaintenance` and `materializeForge`. Adding a new port to forge materializer requires edits in both sites. Refactoring move: Extract Method `#buildForgeMaterializer()`.

### Data Clumps
- src/main/CastLogModule.ts:17-38 — the shape `{ adapter: DataAdapter; getXxxPathAbs: () => string; ... }` recurs across four port types (`MaterializerPorts`, `SweeperPorts`, `ForgeMaterializerPorts`, `RefineMaterializerPorts`). The `adapter` + `getSomeAbsolutePath` pair travels together everywhere. Refactoring move: Introduce a shared `AdapterWithPath` base or a `PathPort` value object and compose; the four types should not redefine the same clump.

### Swallowed Exceptions (Error Handling)
- src/main/CastLogModule.ts:129-131, 141-143, 152-154 — three `catch (e) { console.error(...) }` blocks that swallow without rethrowing, wrapping, or recording the failure in any retrievable state. Startup silently degrades to "broken refine/forge/hooks" with only a console line. Refactoring move: aggregate failures into a returned `StartupReport` (or surface as a `Notice`); do not swallow domain-relevant initialization errors.
- src/main/CastLogModule.ts:160 — `sweeper.sweep().catch(console.error)` — fire-and-forget swallow of sweeper failure. Same prescription: surface or record.

### Primitive Obsession
- src/execution/Caster.ts:5-12 — `CastInput` carries `castId: string`, `spellPath?: string`, `modelId: string`, `userPrompt: string`, `systemPromptFile?: string`, `vaultMountPath: string` as bare primitives. `castId`, `modelId`, `spellPath`, `systemPromptFile`, `vaultMountPath` all have domain meaning and would benefit from value objects (`CastId`, `ModelId`, `SpellPath` — note `SpellPath` already exists at `src/domain/spells/SpellPath.ts` per `refineCastSpell.ts:1` import — yet `CastInput.spellPath` is `string`, not the value object). Refactoring move: Replace Primitive with Value Object across the `CastInput` surface; at minimum, type `spellPath` as the existing `SpellPath` value object.

## Verdict

REWORK
