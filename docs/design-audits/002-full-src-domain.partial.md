---
shard: src-domain
verdict: REWORK
violation_count: 13
---

# Design Audit Partial: src/domain

## Threshold Violations

| Unit | Location | Measure | Threshold | Severity |
|------|----------|---------|-----------|----------|
| Function `resolveSpellOptions` | src/domain/settings/spellOptionsResolver.ts:35-72 | ~32 LOC body | >20 WARN | warn |
| Method `SpellOverrideStore.set` | src/domain/settings/SpellOverrideStore.ts:32-53 | ~22 LOC body | >20 WARN | warn |

No hard-FAIL threshold breaches (no method >40 LOC, no class >400 LOC, no file >500 LOC, no nesting >2, no parameter list >3).

## Violations by Smell

### SRP violation (one method, multiple reasons to change)
- **src/domain/settings/spellOptionsResolver.ts:35** — `resolveSpellOptions` does two distinct things: (1) walks the session→override→settings cascade to pick a source, then (2) clamps the chosen effort against the model's supported range. The docstring itself uses "and": "Resolves model and effort through a three-tier cascade … Clamps effort…". → Extract Method: `selectSourceOptions(input)` returning `{model, effort}`, then `clampToModel(options, models)`.
- **src/domain/settings/persistence.ts:11** — `hydrate` does three things: merges saved data with defaults, validates the effort enum, and resolves a missing vault mount path. Docstring confirms: "Merges saved plugin data with defaults, validates effort enums, and computes missing vault paths". → Extract Method per concern: `mergeWithDefaults`, `sanitizeEffort`, `resolveVaultMount`.
- **src/domain/settings/SpellOverrideStore.ts:32** — `set` validates model existence, validates effort-support capability, clamps effort, mutates the data store, and schedules persistence. Five steps, three reasons to change (validation rules, clamping rules, persistence policy). → Extract `validateOverride`, `clampEffort`, leave `set` as orchestrator.
- **src/domain/spells/spellScanner.ts:35** — `getSpells` filters AND parses (reading frontmatter, extracting `executeOnNote` via nested ternary, constructing `Spell`) AND sorts. The `.map` lambda is a hidden method doing the parse. → Extract `parseSpell(app, file): Spell`; keep `getSpells` as the pipeline.

### Inline logic / hidden predicate / magic ternary
- **src/domain/spells/spellScanner.ts:42** — `const executeOnNote = eonValue === true ? true : eonValue === false ? false : true;` is a nested ternary whose policy ("default `true` when value is anything other than the literal boolean `false`") is buried in syntax. → Extract Constant `DEFAULT_EXECUTE_ON_NOTE = true`; Extract Function `parseExecuteOnNote(value: unknown): boolean`.
- **src/domain/settings/spellOptionsResolver.ts:59** — `const resolvedModel = model || input.models[0];` silently substitutes the first model in the list when the selected model is unknown. Magic fallback with no named meaning. → Either fail loudly (throw `UnknownModelError`) or Extract Function `findOrDefaultModel(models, id)` whose name advertises the silent default and Extract Constant for the default.

### Primitive Obsession
- **src/domain/settings/Settings.ts:14, 26, 43; src/domain/settings/SpellOverrideStore.ts:33,36,41; src/domain/settings/spellOptionsResolver.ts:6,42,48,52,58,69** — `model: string` flows through `GrimoireSettings`, `SpellOverride`, `SpellSessionEntry`, `ResolvedSpellOptions`, `SUPPORTED_MODELS.id`, every cascade tier, and every store method. The codebase already demonstrates the right move with `SpellPath` (branded type at src/domain/spells/SpellPath.ts). → Introduce `ModelId` branded type symmetric with `SpellPath`; let the type system stop mix-ups between model IDs and arbitrary strings.
- **src/domain/settings/Settings.ts:18** — `portalPort: string` for a numeric port; same file uses `string` for `portalHost`, `portalAuthPassword`, `binaryPath`, `vaultMountPath`, `forgeOutputFolder`, `cliCommand` — all distinct domain concepts collapsed onto `string`. → Value Objects (`PortNumber`, `HostName`, `FilesystemPath`, `CliCommand`) or at minimum branded aliases for each.

### Data Clumps
- **src/domain/settings/Settings.ts:25-28 (SpellOverride)**, **src/domain/settings/spellOptionsResolver.ts:6-9 (SpellSessionEntry)**, **src/domain/settings/spellOptionsResolver.ts:26-29 (ResolvedSpellOptions)** — Three interfaces with identical `{model, effort}` shape and the same nullable-effort semantics, distinguished only by name. → Unify under a single `SpellOptions` value type; let context (override vs session vs resolved) live in the surrounding type, not in a duplicated shape.

### Swallowed errors / silent failure
- **src/domain/settings/SpellOverrideStore.ts:36-37, 41-42** — `set` logs `console.error(...)` then `return;` on unknown model or unsupported-effort model. The caller cannot distinguish "stored" from "rejected" — the method advertises a write that silently dropped. Command-Query Separation is preserved but the contract is dishonest. → Throw a typed domain error (`UnknownModelError`, `EffortUnsupportedError`) or return a `Result<void, OverrideError>`.

### Leaky abstraction at the persistence boundary
- **src/domain/settings/persistence.ts:11-15** — `hydrate(saved: unknown, app: App)` performs an unchecked structural cast `const s = saved as { settings?: Partial<GrimoireSettings>; spellOverrides?: Record<string, SpellOverride> }`. No validation that `s.settings` keys match the schema, no validation that override entries match `SpellOverride`. Persisted-disk data crosses into the domain unchallenged. → Validate at the edge (schema check / parse), construct a guaranteed-valid `GrimoireData`, or fail with a typed error.

### Type-system bypass
- **src/domain/settings/SpellOverrideStore.ts:66** — `return model.defaultEffort!;` uses a non-null assertion that depends on a caller-side guard in `set` (line 40). The private helper does not encode its own precondition. → Tighten parameter type to `SupportedModel & { defaultEffort: Effort }` or accept `defaultEffort: Effort` directly, eliminating the bang.
- **src/domain/settings/SpellOverrideStore.ts:64** — `#clampEffort` takes a structural duck-type `{ effortOptions: readonly Effort[] | null; defaultEffort: Effort | null }` that duplicates the `SupportedModel` interface defined in Settings.ts. → Accept `SupportedModel` directly; remove the inline shape.

## Verdict
REWORK
