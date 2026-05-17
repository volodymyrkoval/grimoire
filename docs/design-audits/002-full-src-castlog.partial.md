---
shard: src-castlog
verdict: REWORK
violation_count: 18
---

# Design Audit Partial: src/castLog

## Threshold Violations

| Unit | Location | Measure | Threshold | Severity |
|------|----------|---------|-----------|----------|
| Class `VaultRefreshCoordinator` | src/castLog/VaultRefreshCoordinator.ts:29–230 | 201 LOC class body | >200 warn | WARN |
| Nesting depth in `VaultRefreshCoordinator.#pollMtimes` | src/castLog/VaultRefreshCoordinator.ts:210–229 | for → try → if = depth 3 | >2 FAIL | FAIL |
| Nesting depth in `VaultRefreshCoordinator.#checkSettlingWindow` | src/castLog/VaultRefreshCoordinator.ts:177–194 | for → try → if = depth 3 | >2 FAIL | FAIL |
| Nesting depth in `VaultRefreshCoordinator.#sampleBaseline` | src/castLog/VaultRefreshCoordinator.ts:146–158 | for → try → catch → if = depth 3 | >2 FAIL | FAIL |
| Nesting depth in `CastLogStore.#readFromFile` | src/castLog/store.ts:93–138 | try → for → try = depth 3 | >2 FAIL | FAIL |

## Violations by Smell

### God Class / Divergent Change (SRP)
- src/castLog/VaultRefreshCoordinator.ts:29 — `VaultRefreshCoordinator` carries five reasons to change: (1) vault event subscription, (2) baseline stat sampling, (3) settling-window probe scheduling, (4) polling fallback engagement, (5) trailing-debounce timer management. Each cluster owns its own field set (`#eventRef`, `#lastStat`, `#settlingHandle`, `#pollHandle`, `#debounceHandle`). → Extract Class along those seams (e.g. `VaultEventListener`, `MtimePoller`, `DebouncedNotifier`); compose them in this coordinator. Class body is 201 LOC — already over the 200 warn threshold and growing along independent axes.

### Long Method
- src/castLog/store.ts:93 — `CastLogStore.#readFromFile` mixes file read, ENOENT handling, line splitting, JSON parsing, shape validation, and error-class discrimination in one body (~40 effective LOC). → Extract Method: `#safeReadAll(path)` for the I/O+ENOENT swallow, `#parseLines(content)` for line-by-line parsing, `#isCastLogEvent(parsed)` for shape validation.

### Nested function declarations / Pyramid of nesting (Arrow Code)
- src/castLog/VaultRefreshCoordinator.ts:210, 177, 146 — `for { try { if { ... } } }` triple nesting in three private methods. → Extract Method per body: `await this.#refreshMtime(absPath)` returning a boolean changed-flag; loop reduces over the result. Guard clauses for `this.#disposed`.
- src/castLog/store.ts:93 — same shape. → Extract Method `#parseEventLine(line): CastLogEvent | null`; outer for-loop becomes flat.

### Swallowed Exceptions
- src/castLog/IntervalTickCoordinator.ts:33 — `try { onTick() } catch { /* comment */ }` swallows every callback error with a justification comment. The comment is asking to become a logged-and-rethrown wrapper. → Log via `console.error` at minimum; or accept an `onError` port.
- src/castLog/ScratchSweeper.ts:85 — `catch (error) { console.error(...) }` in `#processFile`. Log-only is swallowing.
- src/castLog/store.ts:135 — `catch (error) { console.error(...); return []; }` in `#readFromFile`. Returns empty on every non-ENOENT failure — caller cannot distinguish "no log yet" from "disk failure".
- src/castLog/VaultRefreshCoordinator.ts:135, 186, 221 — three empty catches with explanatory comments. Same pattern repeated three times in one file.

### Shotgun Surgery / Duplicated Code (ENOENT-and-DataAdapter pattern)
- src/castLog/store.ts:38–43, src/castLog/ScratchSweeper.ts:32–43, src/castLog/VaultRefreshCoordinator.ts:60–64, src/castLog/HookMaterializer.ts:41–44 — four classes each defensively build a `DataAdapter`-backed default for one or two filesystem operations, each manufacturing `Object.assign(new Error('ENOENT: …'), { code: 'ENOENT' })` to mimic Node's fs errors. → Extract Class `ObsidianFsPort` (or similar) exposing `readFile`, `appendFile`, `stat`, `list`, `mkdir`, `remove` with consistent ENOENT semantics; inject it as the single dependency.

### Temporal Coupling
- src/castLog/HookMaterializer.ts:36, 53–58, 65, 72 — `#hooksDir` is initialized to `''` and only populated in `run()`. `#writeScript` reads `#hooksDir` without checking; calling it before `run()` silently writes to `'/<filename>'`. → Compute `hooksDir` locally inside `run()` and pass it as a parameter through `#materializeScripts` / `#writeScript`. No mutable field, no ordering trap.

### DIP / Optional-Adapter Temporal Coupling
- src/castLog/HookMaterializer.ts:14–20, src/castLog/store.ts:10–17, src/castLog/ScratchSweeper.ts:7–15, src/castLog/VaultRefreshCoordinator.ts:8–21 — every ports interface marks `adapter` optional alongside optional `writeFile`/`readFile`/etc., then uses `adapter!` non-null assertion at runtime. The type system cannot prove either branch is satisfied; callers can construct a class that crashes on first use. → Discriminated union: `{ kind: 'adapter', adapter } | { kind: 'fs', readFile, ..., stat, ... }`, or make `adapter` required and stop accepting overrides outside tests.

### Stringly-Typed API / Sentinel Strings (Primitive Obsession)
- src/castLog/types.ts:57, 62 — `FORGE_SPELL_PATH = '<forge>'` and `REFINE_SPELL_PATH = '<refine>'` overload the `spellPath: string` primitive with control values. Consumers must do string comparison against magic constants to dispatch behavior. → Replace Type Code with Discriminated Union: model `CastOrigin = { kind: 'spell'; path: string } | { kind: 'forge' } | { kind: 'refine' }` on `CastedEvent` / `CastRecord`. Eliminates magic strings, makes exhaustiveness checkable.

### Primitive Obsession (paths / identifiers)
- src/castLog/store.ts:11–12, src/castLog/HookMaterializer.ts:13–14, src/castLog/ScratchSweeper.ts:8, src/castLog/VaultRefreshCoordinator.ts (paths in port surface) — every filesystem boundary takes raw `string` for absolute paths via `getLogPathAbs() / getAgentLogPathAbs() / getScratchDirAbs() / getPluginDirAbs() / getLogPathAbs`. Same domain concept (absolute vault-adapter path) flowing as a primitive. → Introduce `AbsolutePath` (and/or `VaultRelativePath`) value object validated at construction; let the type system prevent mixing them with arbitrary strings.
- src/castLog/CastRecord.ts:12 and src/castLog/types.ts:10 — `castId: string`, `spellPath: string`, `model: string` propagate raw strings through every event and folded record. Same primitive obsession; intermixable in argument order without compile-time protection.

### Missing Strategy / Switch on Type
- src/castLog/format/displayName.ts:19–34 — `resolveDisplayName` branches on `record.spellPath === FORGE_SPELL_PATH`, then `=== REFINE_SPELL_PATH`, then falls through to live-spell. Three formatting algorithms dispatched by inspecting a primitive string. → Once `CastOrigin` becomes a discriminated union (see above), replace the `if`-chain with a `switch (origin.kind)` for exhaustiveness, or apply Strategy with a `DisplayNameFormatter` per origin kind.
- src/castLog/foldEvents.ts:79–104 — `updateRecordWithEvent` dispatches on `event.stage` via `if`/`else if`/`else if`. Manageable today; flag for future extraction if a new stage is added.

### Duplicated Code (small)
- src/castLog/foldEvents.ts:51–60 and :65–74 — `updateForDone` and `updateForError` share the "set endedTs if absent, then set one more field if absent" shape. → Extract Method `setIfAbsent(record, field, value)` or fold into a single `applyTerminalEvent` per stage with a value extractor.
- src/castLog/store.ts:49–57 and :62–70 — `recordCasted` and `recordError` are identical except stage literal and input type. → Extract `#appendEvent(stage, input)`.

### Comments Restating Code
- src/castLog/format/displayName.ts:21 — `// Forge cast` immediately above `if (record.spellPath === FORGE_SPELL_PATH)`. The conditional already says it. → Delete.
- src/castLog/foldEvents.ts:121 — `// Reduce over the remaining events only — the seed is already applied above.` restates what `.reduce(updateRecordWithEvent, record)` already conveys via the seed argument. → Delete or replace with a *why* line if the alternative seed was meaningful.

### Flag-like Unused Parameter
- src/castLog/store.ts:13, 38 — `readFile?: (path: string, encoding: 'utf-8') => Promise<string>`. The signature forces callers to pass `'utf-8'`, but the default implementation ignores it (`async (filePath, _) => { ... }`), and there's no other encoding the type accepts. → Drop the encoding parameter; it's noise that pretends to be a knob.

### Leaky Abstraction (boundary mapping)
- src/castLog/store.ts:111–120 — `#readFromFile` returns `parsed as CastLogEvent` after checking only that `castId` and `stage` keys exist. The cast is unsafe (no stage-shape validation: `'casted'` events still need `spellPath`/`model`/`effort`/`contextNotes`; the rest of the system reads them as if guaranteed). Malformed JSON with the right two keys propagates as a typed event. → Validate at the boundary per-stage (or use a schema validator). Map untyped input to the domain type at the seam; do not lie to the type system.

### Speculative Generality (borderline)
- src/castLog/RefreshCoordinator.ts, src/castLog/TickCoordinator.ts — both interfaces have exactly one implementation (`VaultRefreshCoordinator`, `IntervalTickCoordinator`). If a second implementation is not on the near horizon, these interfaces are speculative. → Inline if no second use case lands in the next iteration; keep otherwise (note: they do support test fakes, so the abstraction earns its keep if tests substitute them).

## Verdict
REWORK
