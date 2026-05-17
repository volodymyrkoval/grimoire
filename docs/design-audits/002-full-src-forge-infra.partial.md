---
shard: src-forge-infra
verdict: REWORK
violation_count: 24
---

# Design Audit Partial: src/forge + src/infra

## Threshold Violations

| Unit | Location | Measure | Threshold | Severity |
|------|----------|---------|-----------|----------|
| Method `ForgeImprinter.imprint` | src/forge/ForgeImprinter.ts:43-103 | ~60 LOC | >40 FAIL | FAIL |
| Method `ForgeImprinter.imprint` cyclomatic complexity | src/forge/ForgeImprinter.ts:43-103 | ~6 decision points (lines 47, 53, 72, 90, 95, 99) | >5 WARN | WARN |
| Nested callback in `imprint` `onAccepted` | src/forge/ForgeImprinter.ts:89-96 | 2 nested `if`s inside a callback inside a method | borderline | WARN |

## Violations by Smell

### Long Method
- src/forge/ForgeImprinter.ts:43-103 — `imprint` is ~60 LOC and performs: remote-mode validation, name sanitisation, ID generation, user-prompt building, initial log record, notification, modal close, caster dispatch, and two callback definitions with their own log/notify branches. Cannot be described in one sentence without "and". Refactoring: Extract Method per responsibility — `validateRemoteMode`, `prepareCastInput`, `recordInitialCast`, `notifyStart`, `handleAccepted`, `handleFailure`.

### SRP violation
- src/forge/ForgeImprinter.ts:24 — `ForgeImprinter` has multiple reasons to change: remote-vs-local execution policy, sanitisation policy, log record shape, notification copy, caster callback contract. Refactoring: Extract Class — separate `ForgeExecutionPolicy` (local vs remote) and `ForgeCastRecorder` (log writer interactions).
- src/infra/PluginPaths.ts:11 — `PluginPaths` aggregates cast-log paths, spell paths (forge + refine, vault-rel + plugin-rel each), agent-hooks dir, and scratch dir. Multiple reasons to change. Refactoring: Extract Class — `CastLogPaths`, `SpellPaths`, `AgentHooksPaths`.

### Flag Argument / Strategy missing
- src/forge/ForgeImprinter.ts:44 — `isRemote` boolean drives four behavioral branches (lines 47, 72, 95, 99). Two algorithms hidden behind one method. Refactoring: Strategy — `LocalForgeStrategy` and `RemoteForgeStrategy`, dispatched by `settings.executionMode`.

### Feature Envy
- src/forge/ForgeImprinter.ts:60-66, 82-83 — `imprint` destructures `snapshot` and re-assembles its fields into `buildForgeUserPrompt(...)` and `caster.cast(...)`. Behavior uses snapshot data more than its own. Refactoring: Move Method — `snapshot.toUserPromptInput(sanitisedName)` or introduce a `ForgeCastInput` value object.

### Data Clump
- src/forge/ForgeImprinter.ts:69, 92 — the field cluster `{ castId, spellPath: FORGE_SPELL_PATH, model: snapshot.model, effort: snapshot.effort, contextNotes: [] }` is constructed twice in the same method. Refactoring: Extract Variable / Introduce Parameter Object — name the cluster once.

### Anemic Domain Model
- src/forge/ForgeFormSnapshot.ts:4-10 — `ForgeFormSnapshot` is a bag of five primitive fields. All behavior — sanitisation gate, prompt building, dispatch — lives in `ForgeImprinter`. Refactoring: Move Method — `snapshot.sanitisedName()`, `snapshot.toUserPrompt()`.

### Primitive Obsession
- src/infra/PluginPaths.ts (entire file) — every method returns raw `string`. The class distinguishes "plugin-relative", "vault-relative", and "absolute" paths in JSDoc, not in types. `forgeSpellPathPluginRel()` (line 54) and `forgeSpellPathVaultRel()` (line 62) return IDENTICAL code — the semantic distinction lives only in the method name. Refactoring: Replace Primitive with Value Object — `VaultRelPath`, `AbsPath`, `PluginRelPath`.
- src/forge/ForgeImprinter.ts:15 — `forgeSpellPaths(): { absForCaster: string; vaultRelForPortal: string }` — same string-typed paths leaking into the forge module.
- src/forge/ForgeMaterializer.ts:9 — `getForgePathAbs: () => string` — same.

### Duplicated Code
- src/infra/PluginPaths.ts:53-55 vs 61-63 — `forgeSpellPathPluginRel` and `forgeSpellPathVaultRel` are byte-identical implementations. Refactoring: Either delete one or correct the divergent intent (the vault-rel variant must strip the vault root).
- src/infra/PluginPaths.ts:69-71 vs 77-79 — same duplication for the refine pair.
- src/infra/KeyboardController.ts:16-21 vs 30-37 — `bind` and `resume` re-declare the same `scope.register(..., (e) => { if (!handler()) return true; e.preventDefault(); return false; })` registration body. Refactoring: Extract Method `#registerBinding(binding)`.
- src/infra/KeyboardController.ts:25-27 vs 41-43 — identical `forEach unregister + clear` block in `suspend` and `unbindAll`. Refactoring: Extract Method `#unregisterAll()`.

### Speculative Generality / OCP violation
- src/forge/ForgeMaterializer.ts:8-14, 25-38 — `ForgeMaterializerPorts` accepts three injection shapes (adapter, writeFile+mkdir, or both) defended by a runtime guard at line 30. The writeFile/mkdir override exists solely as a test seam; stubbing `DataAdapter` covers the same case. Refactoring: Inline Class — accept `DataAdapter` (or a single port interface) and delete the alternative shape.

### Make illegal states unrepresentable (Temporal/Construction coupling)
- src/forge/ForgeMaterializer.ts:30-32 — runtime guard `if (!ports.writeFile && !ports.mkdir && !adapter) throw` exists because the port type permits illegal combinations. Refactoring: Replace with a discriminated union — `{ kind: 'adapter'; adapter } | { kind: 'explicit'; writeFile; mkdir }`.
- src/forge/ForgeMaterializer.ts:35, 37 — `adapter!.write(...)`, `adapter!.mkdir(...)` non-null assertions are direct evidence the type system cannot follow the constructor's runtime invariants.

### Leaky Abstraction / DIP violation
- src/forge/ForgeMaterializer.ts:1 — `src/forge` imports `DataAdapter` from `obsidian` (volatile infrastructure type). Forge module should depend only on its own port abstraction. Refactoring: Invert Dependency — keep `ForgeMaterializerPorts` adapter-free; the adapter binding lives in the composition root.

### Middle Man
- src/forge/ForgeMaterializer.ts:34-37 — `writeFile`/`mkdir` defaults are one-line pass-throughs to `adapter.write` / `adapter.mkdir`. Combined with #Speculative Generality above: Remove Middle Man.

### Swallowed Exception
- src/forge/ForgeImprinter.ts:70 — `logWriter.recordCasted(...).catch(console.error)` — log-failure silently consumed; user not notified.
- src/forge/ForgeImprinter.ts:93 — same anti-pattern inside `onAccepted`.
- src/forge/ForgeImprinter.ts:98 — `logWriter.recordError(...).catch(console.error)` — error-logging error silently dropped.
- src/infra/DebouncedSaver.ts:32-36 — `try { await this.#save(); } catch (e) { console.error(e); }` — save failure silently absorbed inside debounced infrastructure with no surface signal. Refactoring: re-throw, surface to caller, or expose a failure event.

### Mysterious Name
- src/forge/ForgeMaterializer.ts:43 — method `run()` says nothing about what runs. Refactoring: Rename — `materializeForgeFile()` or `writeForgeSystemPrompt()`.

### Type-system bypass
- src/infra/TypedEmitter.ts:8, 19 — listeners stored as `Listener<unknown>[]` and dispatched as `T[K]` without a type-narrowing cast at the storage boundary. The "typed" emitter relies on the public API's generics to enforce safety while the internals use `unknown`. Refactoring: Encapsulate the cast at insertion in `on()`, or use per-event maps.

### Missing capability / ISP-adjacent
- src/infra/TypedEmitter.ts — no `off()` / `once()` / `removeAllListeners()`. Any subscriber that outlives the emitter leaks. Refactoring: Add `off()` returning a disposer from `on()`.

### LSP violation / undocumented asymmetry
- src/infra/KeyboardController.ts:51-57 — `bindTrap` registers on `scope` but does NOT push into `#bindings` or `#registered`. As a result, `suspend()`, `resume()`, and `unbindAll()` silently ignore trap bindings. Two methods that look like siblings (`bind`/`bindTrap`) have divergent lifecycle semantics. Refactoring: Either treat trap bindings uniformly (push into the same arrays) or split into a separate class with explicit "permanent" semantics.

### Resource-as-code (Long Method by content)
- src/forge/forgeTemplate.ts:8-56 — `renderForgeSystemPrompt` body is a 45-line template literal carrying a procedural document with three interpolations. Source size under 20 LOC is illusory; the function is a document, not a function. Refactoring: Move template to a `.md` resource shipped with the plugin, load on init, substitute via a documented placeholder syntax.

### Path manipulation inside business code
- src/forge/ForgeMaterializer.ts:48 — `forgePath.substring(0, forgePath.lastIndexOf('/'))` is raw string surgery to derive a parent directory. Compounds the Primitive Obsession above. Refactoring: a `Path` value object with a `parent()` method.

## Verdict
REWORK
