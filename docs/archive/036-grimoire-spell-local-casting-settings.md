# 036 — Spell-Local Casting Settings

> Relocate per-spell model/effort overrides out of the plugin data store and into each spell's own frontmatter, under a namespaced, provider-anchored key. The spell file becomes the single source of truth for how it casts; the data store keeps only vault-wide settings. One-time migration folds existing path-keyed overrides into their spell files, then retires the override record.

**Complexity:** Complex (data relocation across a frontmatter seam, cast-launch read path for local + remote, UI write-target swap, one-time migration, stale-binding fallback).

---

## Goal & scope

### What
A spell records its casting parameters in its own top-of-file YAML frontmatter, under a namespaced key (`grimoire-casting`). The **provider** is the anchor; **model** is always present; **effort** appears only when the bound provider has the concept (its absence is never treated as a default). At cast launch (local *and* remote), the resolver reads this block and falls back, **value-by-value**, to the global default — except in the stale-binding case (provider disabled/removed) where the fallback is **wholesale** (provider+model+effort together). The options panel writes the block to spell frontmatter instead of the data store; the non-default notification dot reads from frontmatter. Forge stamps the block in at creation (via the forge system-prompt instruction). Plugin settings keep only vault-wide data; **Set as default** continues to write there.

### Why
The current path-keyed override store (`data.json` → `spellOverrides[path]`) silently undercuts spell self-containment: rename/relocate orphans the override, copying across vaults strips it, and Obsidian Sync's last-modified-wins can clobber it. Co-locating casting params with the prompt fixes all three and is forward-compatible with the multi-provider work without building any provider machinery now.

### Out of scope (No-gos)
- **No provider machinery.** There is one provider today (`claude-code`). The shape is forward-compatible but builds no adapters, no per-provider registry, no Strategy hierarchy.
- **No MCP / access-control config in the spell** — those belong in provider config files.
- **The global default's shape** (whether Settings grows a provider dimension) belongs to the Settings update. This pitch inherits whatever Settings defines; it does **not** add a `defaultProvider` to `GrimoireSettings`. The single provider id is a local constant (`CLAUDE_CODE_PROVIDER`) consumed by the migration and the write path.
- **Plugin-wide settings stay in the data store.** This removes only the `spellOverrides` per-spell record from `GrimoireData`.
- **Refine sentinel keeps its data-store override.** `REFINE_SENTINEL_PATH` is a synthetic path with no backing file; it cannot carry frontmatter. Its override stays in the data store via the retained `SpellOverrideStore` (see Technical notes / Deferred).

---

## Edge-case decisions (from AskUserQuestion)

The following edge-case dimensions were resolved up-front. Confirmed behaviors are concrete todos; deferred items are listed in **Deferred edge cases**.

- **Block absent entirely** → wholesale fall back to global default (provider+model+effort). Todo E-series.
- **Model key absent within a present block** → invalid block; treat as absent → wholesale fallback. (Model is required by the format.) Todo E-series.
- **Effort key absent within a present block** → valid; effort resolves from the global default *only if the resolved provider/model supports effort*; otherwise effort is `null`. Effort absence is never a sentinel. Todo E-series.
- **Provider names a disabled/removed provider (stale binding)** → wholesale fallback (provider+model+effort together). No partial inheritance. Today the only check is equality with `CLAUDE_CODE_PROVIDER`; any other value is "stale". Todo E-series.
- **Malformed block (not an object / wrong types)** at the trust boundary → treat as absent → wholesale fallback; never throw at cast launch. Todo E-series.
- **Migration: spell file no longer exists at the keyed path (orphan)** → drop the override, do not guess. Todo H-series.
- **Migration runs again after completion** → idempotent: `spellOverrides` is already empty (or only the Refine sentinel remains), so the fold is a no-op. Todo H-series.
- **Frontmatter write must not disturb the body** → use `app.fileManager.processFrontMatter`, which targets only the top-of-file YAML block. Never touch the body separators or the `Begin execution now.` line. Todo C/D-series.

### Deferred edge cases
- **Concurrent writes to the same spell frontmatter** (two popups, or popup + external edit). `processFrontMatter` serialises per-file at the Obsidian layer; we do not add our own locking. Deferred.
- **Effort vocabulary divergence when the adapter contract lands.** If provider ids end up named differently, a trivial in-plugin rename of the `CLAUDE_CODE_PROVIDER` constant + a migration follows later. Accepted as a cheap future cost per the pitch's Dependency section. Deferred.
- **Notification dot for the Refine sentinel.** Out of scope as before (the dot is only painted on `SpellRow`, never `SentinelRow`). Deferred.

---

## Proposed solution

1. **Domain shape + parser (pure).** Add a `SpellCastingSettings` type `{ provider: string; model: ModelId; effort?: Effort }` and a namespaced key `CASTING_FRONTMATTER_KEY = 'grimoire-casting'`. Add a pure `parseCastingSettings(raw: unknown): SpellCastingSettings | null` that validates the block at the trust boundary (object shape, required `provider` + `model` strings, optional `effort`), returning `null` for absent/malformed/model-missing.

2. **Resolution (pure).** Add a pure `resolveCastingForSpell` that takes the parsed block (or `null`), the global defaults, the supported models, and the known provider id, and returns `{ model, effort }`. It implements: wholesale fallback when block is `null` or provider is stale; otherwise per-value fallback (model from block; effort from block if present and valid for the model, else from default-if-supported, else `null`). Effort is then clamped to the model's options. This **does not** replace the session→…→settings cascade; it replaces the *override tier's source* (data store → frontmatter).

3. **Frontmatter seam (I/O).** A thin read port (`readCastingFrontmatter(spellPath): SpellCastingSettings | null` backed by `metadataCache.getFileCache().frontmatter[CASTING_FRONTMATTER_KEY]` → `parseCastingSettings`) and a thin write port (`writeCastingFrontmatter(spellPath, settings)` / `clearCastingFrontmatter(spellPath)` backed by `app.fileManager.processFrontMatter`). Mirrors the existing `HotkeyWriter`/`HotkeyEraser` callback seam in `CommandPopupBuilder`.

4. **Resolver wiring.** `OptionsDetail` and `OptionsFormState.optionsFormSnapshotFromRefineDefaults` currently call `resolveSpellOptions({ session, overrides, settings, models })`. Replace the `overrides` tier with the frontmatter read for real spell paths; the Refine sentinel keeps the data-store override (no backing file).

5. **Write-target swap in the panel.** `CastModelSection`'s everyday behaviour: when the user picks a model/effort and casts, the panel writes the block to the spell's frontmatter (new write port) — not the data store. The **Set as default** checkbox writes the *plugin-wide* default (`settings.defaultModel` / `defaultEffort`) + saves data, per the pitch. The notification dot reads frontmatter presence.

6. **Cast-launch read path.** The resolved `{ model, effort }` already arrives at `CastDispatcher` from the panel snapshot, so the local path is covered by step 4. The remote path uses the same `CastDispatchInput.model/effort`, so no separate remote read is needed — both transports consume the already-resolved values. The plan adds an explicit Enter-from-list resolution that today uses `optionsFormSnapshotFromDefaults` (defaults only) so that a spell with a frontmatter block casts with its block values without opening the panel.

7. **Forge stamping.** Extend the forge system-prompt template (step 3 of `renderForgeSystemPrompt`) to instruct the LLM to write the `grimoire-casting` block with `provider: claude-code` and the chosen model (+ effort when the model supports it).

8. **Migration.** A one-time `migrateSpellOverridesToFrontmatter` that, for each `data.spellOverrides[path]` keyed on a real (non-sentinel) path: resolve the `TFile`; if missing → drop; else `processFrontMatter` to stamp `{ provider: claude-code, model, effort }`; then delete the record. After the loop, persist. Idempotent.

---

## Components

| Component | Responsibility | Location |
|---|---|---|
| `CASTING_FRONTMATTER_KEY`, `SpellCastingSettings`, `CLAUDE_CODE_PROVIDER` | Namespaced key constant, frontmatter block type, the single provider id (local constant, **not** in `GrimoireSettings`) | `src/domain/settings/CastingSettings.ts` (new) |
| `parseCastingSettings` | Pure trust-boundary parser: `unknown → SpellCastingSettings \| null` (object shape, required provider+model strings, optional effort) | `src/domain/settings/CastingSettings.ts` (new) |
| `resolveCastingForSpell` | Pure resolver: `(parsed \| null, defaults, models, knownProvider) → { model, effort }`; wholesale fallback on null/stale, per-value otherwise, effort clamped | `src/domain/settings/resolveCastingForSpell.ts` (new) |
| `CastingFrontmatterReader` (callback type) + `readCastingFrontmatter` | Read port: `(spellPath) => SpellCastingSettings \| null` via `metadataCache` + parser | `src/infra/castingFrontmatter.ts` (new) |
| `CastingFrontmatterWriter` / `CastingFrontmatterEraser` (callback types) | Write/clear port via `app.fileManager.processFrontMatter`; built host-side in `CommandPopupBuilder` (mirrors `HotkeyWriter`) | `src/infra/castingFrontmatter.ts` (new) + `src/ui/popup/CommandPopupBuilder.ts` (edited) |
| `migrateSpellOverridesToFrontmatter` | One-time fold of `data.spellOverrides` (real paths) into frontmatter; drop orphans; clear records; persist | `src/infra/migrateSpellOverrides.ts` (new) |
| `CastModelSection` (edited) | Write target swap: everyday model/effort → frontmatter write port; **Set as default** → plugin-wide default; dot/checkbox read frontmatter presence | `src/ui/options/CastModelSection.ts` |
| `OptionsDetail` (edited) | Resolve via frontmatter read (real spells) / data-store override (Refine sentinel) instead of `overrides` tier | `src/ui/components/OptionsDetail.ts` |
| `OptionsFormState.optionsFormSnapshotFromRefineDefaults` (unchanged-ish) | Refine sentinel keeps data-store override path | `src/ui/options/OptionsFormState.ts` |
| `renderForgeSystemPrompt` (edited) | Step-3 instruction now also stamps the `grimoire-casting` block | `src/forge/forgeTemplate.ts` |
| `CommandPopup` / `CommandPopupBuilder` (edited) | Thread the read/write/erase casting ports; `#handleHasOverride` reads frontmatter; Enter-from-list resolves frontmatter | `src/ui/CommandPopup.ts`, `src/ui/popup/CommandPopupBuilder.ts` |
| `hydrate` / `GrimoireData` (edited) | `spellOverrides` retained for Refine sentinel only; migration runs in `main.ts` onload | `src/infra/settingsPersistence.ts`, `src/domain/settings/Settings.ts`, `src/main.ts` |

---

## Interfaces

```ts
// src/domain/settings/CastingSettings.ts
export const CASTING_FRONTMATTER_KEY = 'grimoire-casting' as const;
/** The only provider that exists today. NOT a GrimoireSettings field — a local anchor. */
export const CLAUDE_CODE_PROVIDER = 'claude-code' as const;

/** Provider-anchored casting parameters stored in a spell's frontmatter.
 *  `effort` is present only when the bound provider has the concept. Absence ≠ default. */
export interface SpellCastingSettings {
  provider: string;
  model: ModelId;
  effort?: Effort;
}

/** Trust-boundary parser. Returns null for absent, malformed, or model-missing blocks.
 *  Re-brands `model` to ModelId. Does NOT validate the provider against any registry. */
export function parseCastingSettings(raw: unknown): SpellCastingSettings | null;

// src/domain/settings/resolveCastingForSpell.ts
export interface ResolveCastingInput {
  parsed: SpellCastingSettings | null;          // from frontmatter, may be null
  defaults: { defaultModel: ModelId; defaultEffort: Effort | null };
  models: readonly SupportedModel[];
  knownProvider: string;                          // CLAUDE_CODE_PROVIDER today
}
export interface ResolvedCasting { model: ModelId; effort: Effort | null; }
/** Wholesale fallback when parsed === null OR parsed.provider !== knownProvider (stale).
 *  Otherwise per-value: model from block (clamped to supported), effort from block-if-valid
 *  else default-if-model-supports-effort else null. */
export function resolveCastingForSpell(input: ResolveCastingInput): ResolvedCasting;

// src/infra/castingFrontmatter.ts
export type CastingFrontmatterReader = (spellPath: SpellPath) => SpellCastingSettings | null;
export type CastingFrontmatterWriter = (spellPath: SpellPath, settings: SpellCastingSettings) => Promise<void>;
export type CastingFrontmatterEraser = (spellPath: SpellPath) => Promise<void>;
export function readCastingFrontmatter(app: App, spellPath: SpellPath): SpellCastingSettings | null;

// src/infra/migrateSpellOverrides.ts
export interface MigrateDeps {
  data: GrimoireData;                              // mutated: real-path records deleted
  resolveFile: (path: string) => TFile | null;     // app.vault.getAbstractFileByPath narrowed
  writeBlock: (file: TFile, settings: SpellCastingSettings) => Promise<void>; // processFrontMatter
  persist: () => void;                             // saver.schedule / flush
  isSentinelPath: (path: string) => boolean;       // REFINE_SENTINEL_PATH guard
}
export async function migrateSpellOverridesToFrontmatter(deps: MigrateDeps): Promise<void>;
```

---

## Data flow

```
Cast launch (open panel → Cast):
  OptionsDetail.render(spell)
    → readCastingFrontmatter(app, spell.path)            // replaces overrides.get tier
    → resolveCastingForSpell({ parsed, defaults, models, knownProvider })
    → session entry (if any) still wins as tier-1 via existing resolveSpellOptions chain
    → OptionsFormState seeded with { model, effort }
  User edits model/effort → Cast
    → CastModelSection persists block to frontmatter (writeCastingFrontmatter) on Cast
    → onCast(snapshot) → castAction(spell, snapshot) → dispatcher.dispatch({ model, effort, ... })
       (local + remote both consume the resolved model/effort from the snapshot)

Cast launch (Enter from list, no panel):
  CommandPopup.#handleSpellCast(spell)
    → readCastingFrontmatter(app, spell.path) → resolveCastingForSpell(...)
    → snapshot { model, effort } (was: optionsFormSnapshotFromDefaults → defaults only)
    → castAction(spell, snapshot)

Set as default (checkbox):
  checked → write plugin-wide settings.defaultModel/defaultEffort + saver.schedule()
  (no per-spell write; default is vault-wide by definition)

Notification dot:
  SpellsPanel hasOverride predicate → readCastingFrontmatter(app, path) !== null

Forge create:
  renderForgeSystemPrompt → LLM writes frontmatter incl. grimoire-casting block
  { provider: claude-code, model, effort? }

Migration (onload, once):
  for path,override in data.spellOverrides:
     if isSentinelPath(path): skip (Refine keeps data-store override)
     file = resolveFile(path); if !file: delete record (orphan); continue
     writeBlock(file, { provider: claude-code, model: override.model, effort: override.effort })
     delete data.spellOverrides[path]
  persist()
```

---

## Error handling
- **Parser never throws.** `parseCastingSettings` returns `null` for any non-conforming input (non-object, missing/empty provider or model, wrong types). Cast launch therefore degrades to global default, never errors.
- **Frontmatter write failure** (`processFrontMatter` rejects): surface a `Notice` ("Could not save casting settings"); do not throw into the cast path. Mirrors the hotkey-eraser failure handling.
- **Migration file-resolution failure**: a missing `TFile` is the orphan case (drop the record); a `processFrontMatter` rejection for a present file is logged via `console.error` and the record is left intact so a later run retries (still idempotent because the block write is upsert).
- **Stale provider**: not an error — it is the wholesale-fallback branch in `resolveCastingForSpell`.

---

## Technical notes

- **Why keep `resolveSpellOptions` and add `resolveCastingForSpell` rather than fold them?** §3 SRP at the method level: `resolveSpellOptions` owns the session→source→settings *cascade ordering*; `resolveCastingForSpell` owns the *frontmatter-vs-default value policy* (wholesale-vs-per-value, stale provider). Conflating them would put I/O-shaped policy into the cascade. The frontmatter read (I/O) sits at the call site (`OptionsDetail`, `CommandPopup`); the two pure functions stay testable in the node env.
- **`SpellOverrideStore` is retained, not deleted.** The Refine sentinel (`REFINE_SENTINEL_PATH`) is synthetic and has no backing file, so its override must stay in the data store. `GrimoireData.spellOverrides` therefore survives, but real-spell records are migrated out and the panel no longer writes real-spell records to it. This is a deliberate scope boundary, not drift.
- **Design-patterns pass:**
  - *Strategy* (provider-specific effort policy) — **rejected: only one provider exists, YAGNI.** The pitch explicitly forbids provider machinery.
  - *Adapter / port* (frontmatter read+write) — **accepted as narrow callback types**, matching the existing `HotkeyWriter`/`HotkeyEraser` seam. No class hierarchy.
  - *Repository* (replace `SpellOverrideStore` wholesale) — **rejected:** the store survives for the sentinel; a full repository abstraction over frontmatter is heavier than the two pure functions + two callbacks needed here.
  - *Template Method* (migration loop) — **rejected:** a plain async function with injected ports is simpler and equally testable.
- **No Node APIs.** All file access via `app.vault` / `app.metadataCache` / `app.fileManager`. No `fs`/`path`.
- **`obsidianmd/*` lint:** no manual HTML headings introduced; UI changes touch existing `createSpan`/`Setting` patterns only.
- **Mock readiness:** `tests/__mocks__/obsidian.ts` already supports `processFrontMatter`, `__registerFile`, `getAbstractFileByPath`, and `metadataCache.getFileCache`. The frontmatter read seam needs `getFileCache` to return `{ frontmatter: { 'grimoire-casting': {...} } }` — supported today. No harness extension required beyond the integration harness threading the new ports (one junior todo).

---

## Perspective synthesis

- **Minimalist:** The smallest viable version is steps 1–6 (shape + parser + resolver + read/write seam + panel swap + Enter-from-list). Forge stamping (step 7) and migration (step 8) are independently shippable but in-scope per the pitch's rabbit holes. Cut nothing; the pitch is already small. Resist adding a `defaultProvider` to settings — explicitly a No-go.
- **Extensibility:** The provider anchor is the seam that pays off at 10×. Keeping `provider` as a free string (not an enum) and `effort` optional means the multi-provider work renames a constant and adds providers without reopening every spell file. `resolveCastingForSpell` taking `knownProvider` as a parameter (not a hardcoded check) is the injection point for a future provider registry.
- **Devil's advocate:** Riskiest assumption — that `metadataCache` is populated for a freshly-Forged spell at the moment Enter-from-list resolves it. Mitigation: the read seam degrades to `null` → global default if the cache lags, which is acceptable (no error, sane default). Second risk: the panel writing frontmatter on *every* Cast could thrash Sync. Mitigation: write only when the block actually changes (compare parsed-current to about-to-write); covered by a todo.
- **User advocate:** The dot must keep reflecting "this spell has its own settings" — now sourced from frontmatter. The integration test pins that the dot lights when frontmatter has a block and extinguishes when it's cleared. Set-as-default semantics shift subtly (now writes the global default, not a per-spell record) — the live-spec must call this out so users aren't surprised that "Set as default" changes *every* spell's fallback.

---

## Todos

Effort: S/M/L. Tier: junior-dev (default) / senior-dev (judgment) / lead-dev (cross-module) / ui-integration-tester.

### A. Domain shape + pure parser (no tester — pure node-env units)

#### Section briefing
1. **What this section produces** — new file `src/domain/settings/CastingSettings.ts` exporting `CASTING_FRONTMATTER_KEY`, `CLAUDE_CODE_PROVIDER`, the `SpellCastingSettings` interface, and `parseCastingSettings`. See Interfaces for exact signatures. Imports `ModelId`/`modelId` and `Effort` from existing `Settings`/`ModelId`.
2. **Methods produced** —
   - `parseCastingSettings(raw) → #isPlainObject(raw) → #parseProvider(obj) → #parseModel(obj) → #parseEffort(obj)` — orchestrator returns `null` if provider or model invalid; assembles the block otherwise.
   - `#isPlainObject(raw) — true iff raw is a non-null non-array object.`
   - `#parseProvider(obj) — return trimmed non-empty string provider, else null.`
   - `#parseModel(obj) — return modelId(string) for a non-empty model string, else null.`
   - `#parseEffort(obj) — return the effort string if it is one of the Effort union, else undefined (absence is valid).`
   (Helpers may be module-level functions rather than private methods since this is a function module, not a class — same decomposition either way.)
3. **Design context** — copy from Error handling: "Parser never throws … returns `null` for any non-conforming input." And from Key design decision 1: effort absence is valid and is never a sentinel — `#parseEffort` returns `undefined`, not a default.
4. **Cross-section couplings** — `B1 depends on A2: resolveCastingForSpell consumes the SpellCastingSettings shape and the CLAUDE_CODE_PROVIDER constant from A.` `C1 depends on A1: the read seam calls parseCastingSettings.` `H2 depends on A1: migration stamps a block of this shape.` None block A itself.
5. **Section-level Red criterion** — `tests/CastingSettings.test.ts` proves: a well-formed object `{ provider:'claude-code', model:'claude-sonnet-4-5', effort:'high' }` parses to an equal block with `model` branded; effort omitted parses with `effort` undefined; missing `model` → `null`; missing/empty `provider` → `null`; non-object (string/number/null/array) → `null`; an unknown effort string → block with `effort` undefined (effort dropped, block still valid). `CASTING_FRONTMATTER_KEY === 'grimoire-casting'` and `CLAUDE_CODE_PROVIDER === 'claude-code'` are importable.

**junior-dev**
- [x] A1: Create `src/domain/settings/CastingSettings.ts` exporting `CASTING_FRONTMATTER_KEY = 'grimoire-casting'`, `CLAUDE_CODE_PROVIDER = 'claude-code'`, and the `SpellCastingSettings` interface (`{ provider: string; model: ModelId; effort?: Effort }`). Import `ModelId`/`modelId` from `./ModelId` and `Effort` from `./Settings`. — S, junior-dev (105a586)
- [x] A2: Implement `parseCastingSettings(raw: unknown): SpellCastingSettings | null` in the same file, decomposed into `#isPlainObject` / `#parseProvider` / `#parseModel` / `#parseEffort` helpers (module-level). Required: provider (non-empty string) + model (non-empty string, re-branded via `modelId`). Optional: effort (must be one of `'low'|'medium'|'high'|'xhigh'|'max'`, else dropped to `undefined`). Any failure of provider/model → `null`. Add `tests/CastingSettings.test.ts` covering the Red-criterion cases above. — M, junior-dev (105a586)

### B. Pure resolution policy (no tester — pure node-env unit)

#### Section briefing
1. **What this section produces** — new file `src/domain/settings/resolveCastingForSpell.ts` exporting `ResolveCastingInput`, `ResolvedCasting`, and `resolveCastingForSpell`. See Interfaces. Reuses the existing effort-clamp logic shape from `resolveSpellOptions` (model lookup + `effortOptions.includes`).
2. **Methods produced** —
   - `resolveCastingForSpell(input) → #shouldFallbackWholesale(input) → #resolveModel(...) → #resolveEffort(...)` — orchestrator picks wholesale-vs-per-value, returns `{ model, effort }`.
   - `#shouldFallbackWholesale(input) — true iff parsed === null OR parsed.provider !== knownProvider.`
   - `#resolveModel(parsed, defaults, models, wholesale) — block model (clamped to a supported model, deprecation-fallback to models[0]) when not wholesale; else defaults.defaultModel.`
   - `#resolveEffort(parsed, defaults, resolvedModel, wholesale) — when wholesale: defaults.defaultEffort clamped to resolvedModel; else: block.effort if valid for resolvedModel, else (model supports effort ? defaults.defaultEffort-if-valid-else-model-default : null).`
3. **Design context** — copy from Edge-case decisions: "Provider names a disabled/removed provider (stale binding) → wholesale fallback (provider+model+effort together). No partial inheritance." And: "Effort key absent within a present block → valid; effort resolves from the global default *only if the resolved provider/model supports effort*; otherwise null."
4. **Cross-section couplings** — `B1 depends on A2: consumes SpellCastingSettings + CLAUDE_CODE_PROVIDER.` `E-series (resolver wiring) depends on B1: OptionsDetail and CommandPopup call resolveCastingForSpell with the frontmatter read result.` None block B itself beyond A.
5. **Section-level Red criterion** — `tests/resolveCastingForSpell.test.ts` proves: null block → defaults; stale provider (`provider:'openai'`) → defaults wholesale even though a model/effort are present; matching provider with model+valid effort → those values; matching provider, effort omitted, model supports effort → defaults.defaultEffort (clamped); matching provider, model is Haiku (no effort) → effort `null` regardless of defaults; block effort invalid for the block model → clamped to the model's default; block model not in supported list → `models[0]` (deprecation fallback).

**junior-dev**
- [x] B1: Implement `resolveCastingForSpell` in `src/domain/settings/resolveCastingForSpell.ts`, decomposed into `#shouldFallbackWholesale` / `#resolveModel` / `#resolveEffort` per the Methods-produced list. Reuse the model-lookup + `effortOptions.includes` clamp pattern from `resolveSpellOptions` (do not import it; replicate the small clamp inline or extract a shared `clampEffort` helper if cleaner). Add `tests/resolveCastingForSpell.test.ts` covering all seven Red-criterion cases. — M, junior-dev (29ae13a)

### C. Frontmatter read/write seam (no tester — thin I/O units with mocked obsidian)

#### Section briefing
1. **What this section produces** — new file `src/infra/castingFrontmatter.ts` exporting the `CastingFrontmatterReader` / `CastingFrontmatterWriter` / `CastingFrontmatterEraser` callback types and a concrete `readCastingFrontmatter(app, spellPath)`. See Interfaces. The writer/eraser *closures* are built host-side in section F (`CommandPopupBuilder`), mirroring `#buildHotkeyWriter`/`#buildHotkeyEraser`; this section produces only the types + the read function.
2. **Methods produced** —
   - `readCastingFrontmatter(app, spellPath) → metadataCache.getFileCache(file)?.frontmatter?.[CASTING_FRONTMATTER_KEY] → parseCastingSettings(raw)` — returns `null` when the file is absent, uncached, or the block is missing/malformed.
3. **Design context** — copy from Technical notes: "All file access via `app.vault` / `app.metadataCache` / `app.fileManager`. No `fs`/`path`." And from Devil's-advocate: the read seam degrades to `null` → global default if the cache lags.
4. **Cross-section couplings** — `C1 depends on A1/A2: calls parseCastingSettings.` `E-series depends on C1: OptionsDetail/CommandPopup call readCastingFrontmatter.` `F (CommandPopupBuilder writer closures) depends on C1 for the callback type definitions.` None block C beyond A.
5. **Section-level Red criterion** — `tests/castingFrontmatter.test.ts` proves: a registered file whose `getFileCache` returns `{ frontmatter: { 'grimoire-casting': {provider,model,effort} } }` → parsed block; a file with no such key → `null`; an unregistered path (`getAbstractFileByPath → null`) → `null`; a file whose block is malformed → `null` (delegated to the parser).

**junior-dev**
- [x] C1: Create `src/infra/castingFrontmatter.ts`. Export the three callback types and `readCastingFrontmatter(app, spellPath)`: resolve the `TFile` via `app.vault.getAbstractFileByPath` (narrow with `instanceof TFile`; return `null` otherwise), read `app.metadataCache.getFileCache(file)?.frontmatter?.[CASTING_FRONTMATTER_KEY]`, pass through `parseCastingSettings`. Add `tests/castingFrontmatter.test.ts` per the Red criterion. — M, junior-dev (ff312ad)

### D. One-time migration (no tester — async unit with mocked ports)

#### Section briefing
1. **What this section produces** — new file `src/infra/migrateSpellOverrides.ts` exporting `MigrateDeps` and `migrateSpellOverridesToFrontmatter`. See Interfaces. Mutates `deps.data.spellOverrides` (deletes migrated/orphaned real-path records), calls `deps.writeBlock` per surviving file, calls `deps.persist` once at the end.
2. **Methods produced** —
   - `migrateSpellOverridesToFrontmatter(deps) → (per entry) #classifyEntry(path, deps) → #foldEntry(entry, deps)` then `deps.persist()` — orchestrator iterates `Object.entries(data.spellOverrides)`.
   - `#classifyEntry(path, deps) — returns 'sentinel' | 'orphan' | { file } by checking isSentinelPath then resolveFile.`
   - `#foldEntry(path, override, file, deps) — await writeBlock(file, { provider: CLAUDE_CODE_PROVIDER, model, effort }); delete data.spellOverrides[path].`
   - Sentinel → skip (leave record). Orphan → `delete data.spellOverrides[path]` (drop, no write).
3. **Design context** — copy from Edge-case decisions: "Migration: spell file no longer exists at the keyed path (orphan) → drop the override, do not guess." and "Migration runs again after completion → idempotent." And Error handling: "a `processFrontMatter` rejection for a present file is logged via `console.error` and the record is left intact so a later run retries."
4. **Cross-section couplings** — `D1 depends on A1: stamps a block of the A shape with CLAUDE_CODE_PROVIDER.` `G3 depends on D1: main.ts onload invokes the migration with real app-backed ports.` None block D beyond A.
5. **Section-level Red criterion** — `tests/migrateSpellOverrides.test.ts` proves: a real-path record with a resolvable file → `writeBlock` called once with `{ provider:'claude-code', model, effort }` and the record deleted; an orphan record (resolveFile → null) → no `writeBlock`, record deleted; the Refine sentinel record (`isSentinelPath → true`) → untouched; `persist` called exactly once after the loop; running twice on already-empty `spellOverrides` → no `writeBlock`, no throw (idempotent); a `writeBlock` rejection for one entry → that record survives, others still migrate, no throw out of the function.

**senior-dev**
- [x] D1: Implement `migrateSpellOverridesToFrontmatter` in `src/infra/migrateSpellOverrides.ts`, decomposed per the Methods-produced list. Wrap each `#foldEntry` write in try/catch: on rejection `console.error` and leave the record (do not delete). Skip sentinel paths. Drop orphans without writing. Call `deps.persist()` once after the loop. Add `tests/migrateSpellOverrides.test.ts` covering all six Red-criterion cases. — M, senior-dev (07e1c3e)

### E. Resolver wiring — frontmatter replaces the override tier (UI seam)

#### Section briefing
1. **What this section produces** — modifies `src/ui/components/OptionsDetail.ts` so real-spell options resolve from `readCastingFrontmatter` + `resolveCastingForSpell` instead of the `SpellOverrideStore` tier; the Refine sentinel branch still uses the data-store override. Threads a `CastingFrontmatterReader` into `OptionsDetailParams`/`DetailPanelRouterDeps`. Does **not** change `resolveSpellOptions` itself (the session tier-1 still wins). See Components + Data flow.
2. **Methods produced** —
   - `OptionsDetail.#resolveOptions(spellPath, params) → #resolveRealSpellCasting(spellPath, params)` (frontmatter path) `or #resolveSentinelCasting(params)` (existing data-store path) — orchestrator branches on `params.kind.kind`.
   - `#resolveRealSpellCasting(spellPath, params) — params.reader(spellPath) → resolveCastingForSpell({ parsed, defaults, models, knownProvider: CLAUDE_CODE_PROVIDER }); then let any session entry override via the existing snapshot seeding.`
   - `#resolveSentinelCasting(params) — unchanged call into resolveSpellOptions with the data-store overrides for REFINE_SENTINEL_PATH.`
3. **Design context** — copy from Technical notes: "the frontmatter read (I/O) sits at the call site (`OptionsDetail`, `CommandPopup`); the two pure functions stay testable in the node env." And from No-gos: "Refine sentinel keeps its data-store override."
4. **Cross-section couplings** — `E1 depends on B1 + C1: calls resolveCastingForSpell and the reader.` `E2 (router/popup threading) is consumed by F (CommandPopupBuilder builds the reader closure from app).` `E0 (tester) pins the seam E1/E2 implement.` `G1 depends on E2: main.ts threads the reader.`
5. **Section-level Red criterion** — integration: opening the options panel for a spell whose frontmatter carries `{ provider:'claude-code', model:'claude-opus-4-5', effort:'high' }` seeds the model select to Opus and the effort row to high (not the global Sonnet/medium default); opening a spell with no block seeds the global default; opening a spell with a stale provider seeds the global default wholesale.

**ui-integration-tester**
- [x] E0: Integration test (`tests/integration/spell-casting-frontmatter.spec.ts`): drive `OptionsDetail`/popup with a stubbed `CastingFrontmatterReader` and assert the seeded model/effort for (a) a present matching block, (b) absent block, (c) stale-provider block. Use the existing harness pattern; thread the reader as a new dep. Red until E1/E2 land. — M, ui-integration-tester

**senior-dev**
- [x] E1: In `OptionsDetail`, replace `#resolveOptions` with the orchestrator + `#resolveRealSpellCasting` / `#resolveSentinelCasting` split. Real spells: call `params.reader(spellPath)` → `resolveCastingForSpell(...)`; keep the existing session-entry seeding so tier-1 session still wins. Refine sentinel: keep the current `resolveSpellOptions` + data-store-override path. Add `reader: CastingFrontmatterReader` to `OptionsDetailParams`. — M, senior-dev *(depends on B1, C1)* (eb5c17e)
- [x] E2: Thread `reader: CastingFrontmatterReader` through `DetailPanelRouterDeps` → `renderSpellOptions`/`renderRefineOptions` → `OptionsDetail.render`. Add it to `CommandPopupParams`/`CommandPopup` constructor and pass into `#buildRouter`. No behaviour change beyond wiring. — M, senior-dev *(depends on E1)* (eb5c17e)

### F. Panel write-target swap + notification dot + host-side ports (UI seam)

#### Section briefing
1. **What this section produces** — modifies `src/ui/options/CastModelSection.ts` so everyday model/effort persistence on Cast writes the **spell frontmatter** (new writer port) and **Set as default** writes the **plugin-wide default**; modifies `src/ui/CommandPopup.ts` `#handleHasOverride` and Enter-from-list `#handleSpellCast` to read frontmatter; builds the writer/eraser closures host-side in `src/ui/popup/CommandPopupBuilder.ts` (mirroring `#buildHotkeyWriter`). See Components + Data flow.
2. **Methods produced** —
   - `CommandPopupBuilder.#buildCastingWriter() — closure over app.fileManager.processFrontMatter that upserts the grimoire-casting block; rejects when the file is missing.`
   - `CommandPopupBuilder.#buildCastingEraser() — closure that deletes the block.`
   - `CommandPopupBuilder.#buildCastingReader() — closure binding readCastingFrontmatter to app.`
   - `CastModelSection.#bindSetAsDefault(checkbox, formState, deps) — checked → deps.setVaultDefault(model, effort); unchecked → no-op (default cannot be "unset" per-spell).` (Replaces the old overrides.set/clear write.)
   - `CastModelSection.#persistBlockOnCast(formState, deps) — #blockChanged(current, deps) ? deps.writeCasting(spellPath, block) : skip.` (New; invoked from the Cast path.)
   - `CastModelSection.#blockChanged(current, deps) — compare the about-to-write block against deps.reader(spellPath) to avoid Sync thrash.`
   - `CommandPopup.#handleHasOverride(path) — deps.reader(path) !== null.`
   - `CommandPopup.#handleSpellCast(spell) — reader+resolveCastingForSpell → snapshot → castAction.` (Replaces `optionsFormSnapshotFromDefaults`.)
3. **Design context** — copy from Goal: "**Set as default** continues to write [plugin-wide settings], because a default is a plugin-wide concern by definition." And from Devil's-advocate: "the panel writing frontmatter on *every* Cast could thrash Sync. Mitigation: write only when the block actually changes."
4. **Cross-section couplings** — `F depends on C1 (types), B1 (resolver for Enter-from-list), E2 (reader already threaded).` `F2 depends on F1: the writer closure built in CommandPopupBuilder is consumed by CastModelSection deps.` `G1/G2 depend on F: main.ts/popup module thread the ports.` `F0 (tester) pins the dot + write seam.` Note the **set-as-default behaviour change**: it now writes vault defaults, not a per-spell record — this constrains the F0 test assertions and the live-spec.
5. **Section-level Red criterion** — integration: ticking **Set as default** invokes a `setVaultDefault(model, effort)` callback (not a per-spell write) and does **not** write frontmatter; casting after changing the model writes the `grimoire-casting` block to the spell's frontmatter via `processFrontMatter`; casting with an unchanged block does **not** call `processFrontMatter`; the spell-row dot lights when the reader returns a block and is absent when the reader returns `null`.

**ui-integration-tester**
- [x] F0: Integration test (extend `tests/integration/spell-casting-frontmatter.spec.ts` or a sibling): assert (a) Set-as-default fires `setVaultDefault` and not the frontmatter writer; (b) Cast after a model change calls the casting writer with the new block; (c) Cast with no change does not call the writer; (d) `hasOverride` predicate lights the dot iff the reader returns a block. Red until F1–F3 land. — M, ui-integration-tester

**senior-dev**
- [x] F1: In `CommandPopupBuilder`, add `#buildCastingWriter` / `#buildCastingEraser` / `#buildCastingReader` closures (mirror `#buildHotkeyWriter`/`#buildHotkeyEraser`; use `app.fileManager.processFrontMatter` to upsert/delete the `CASTING_FRONTMATTER_KEY` block, and `readCastingFrontmatter` for the reader). Thread them into `CommandPopup` construction. — M, senior-dev *(depends on C1)* (faf8698)
- [x] F2: In `CastModelSection`, swap the write target: replace `#bindSetAsDefault`'s `overrides.set/clear` with a `deps.setVaultDefault(model, effort)` callback (checked only); add `#persistBlockOnCast` + `#blockChanged` invoked from the Cast path to write the frontmatter block only when it differs from the current read. Update `CastModelSectionDeps` to carry `writeCasting`, `reader`, `setVaultDefault`, drop `overrides`. — M, senior-dev *(depends on F1; behaviour change — set-as-default now vault-wide)* (faf8698)
- [x] F3: In `CommandPopup`, rewrite `#handleHasOverride` to `reader(path) !== null` and `#handleSpellCast` to resolve via `reader` + `resolveCastingForSpell` (replacing `optionsFormSnapshotFromDefaults`) so Enter-from-list honours the spell's block. Keep `onOverrideChanged → refreshOverrides()` so the dot updates after a write. — M, senior-dev *(depends on B1, F1)* (faf8698)

### G. Wiring: main.ts threading + migration invocation (no tester — wiring)

#### Section briefing
1. **What this section produces** — modifies `src/main.ts` to build the casting reader/writer/eraser and migration ports from the real `app`, run `migrateSpellOverridesToFrontmatter` once in `onload` (after `#loadPluginData`, before UI registration), and thread the reader/writer into `PopupModule`/`CommandPopupBuilder`. Modifies `src/main/PopupModule.ts` to pass the ports through. See Data flow (Migration) + Components.
2. **Methods produced** —
   - `GrimoirePlugin.#runOverrideMigration() — assemble MigrateDeps from app + saver and await migrateSpellOverridesToFrontmatter.` (New; called from `onload`.)
   - `GrimoirePlugin.onload() → … #runOverrideMigration() → #buildPopupModule(...)` — orchestrator gains one new step.
3. **Design context** — copy from Data flow: "Migration (onload, once)" loop. And No-gos: "this pitch removes only the per-spell override record from [the data store]" — `spellOverrides` survives for the sentinel.
4. **Cross-section couplings** — `G3 depends on D1: invokes the migration.` `G1 depends on E2/F1: threads the reader/writer ports built for the popup.` `G2 depends on G1.` The migration must run **before** the popup is built so the first popup open reads post-migration frontmatter (state ordering — note inline on G3).
5. **Section-level Red criterion** — `tests/main.test.ts` (extend): on `onload` with a `data.spellOverrides` containing one real-path record, the migration runs (its injected `writeBlock`/`persist` are invoked) before `popupModule.register`; with empty `spellOverrides` it is a no-op; the reader/writer ports are passed into `PopupModule`.

**junior-dev**
- [x] G1: Thread `castingReader`, `castingWriter`, `castingEraser`, `setVaultDefault` (the closure writing `this.data.settings.defaultModel/defaultEffort` + `this.saver.schedule()`) from `main.ts` into `PopupModule` constructor deps, and forward into `CommandPopupBuilder`. Pure wiring; types from C1. — M, junior-dev *(depends on E2, F1)* (9ebd8ab)
- [x] G2: In `PopupModule`, accept the four new deps and pass them into `CommandPopupBuilder({ ... })` (alongside the existing `overrides` which now only serves the Refine sentinel). — S, junior-dev *(depends on G1)* (9ebd8ab)
- [x] G3: Add `GrimoirePlugin.#runOverrideMigration()` and call it from `onload` immediately after `#loadPluginData()` and before `#buildPopupModule(...)` (ordering is load-bearing — first popup open must read post-migration state). Assemble `MigrateDeps` with `resolveFile = p => this.app.vault.getAbstractFileByPath(p) instanceof TFile ? ... : null`, `writeBlock = (file, s) => this.app.fileManager.processFrontMatter(file, fm => { fm[CASTING_FRONTMATTER_KEY] = s; })`, `persist = () => this.saver.schedule()`, `isSentinelPath = p => p === REFINE_SENTINEL_PATH`. Extend `tests/main.test.ts` per the Red criterion. — M, junior-dev *(depends on D1, G1)* (9ebd8ab)

### H. Forge stamping (no tester — pure template string unit)

#### Section briefing
1. **What this section produces** — modifies `src/forge/forgeTemplate.ts` `renderForgeSystemPrompt` step-3 instruction so the forged spell's frontmatter includes the `grimoire-casting` block. No code reads this back differently; it is an LLM instruction string. See Data flow (Forge create).
2. **Methods produced** — none new; edits the existing template literal in `renderForgeSystemPrompt`. (Pure function, single concern: render the prompt string.)
3. **Design context** — copy from Solution step 7: "instruct the LLM to write the `grimoire-casting` block with `provider: claude-code` and the chosen model (+ effort when the model supports it)." And from the pitch rabbit hole: "Writing frontmatter must target the note's top-of-file block specifically — never disturbing the load-bearing `Begin execution now.` line." (The instruction wording must reinforce top-of-file frontmatter, which the LLM already does for `tags`/`grimoire-execute-on-note`.)
4. **Cross-section couplings** — `H1 depends on A1: references the CASTING_FRONTMATTER_KEY value and CLAUDE_CODE_PROVIDER constant in the instruction text (import the constants, do not hardcode the literals).` None block H beyond A.
5. **Section-level Red criterion** — `tests/forgeTemplate.test.ts` (extend): the rendered prompt contains an instruction naming `grimoire-casting`, `provider: claude-code`, the model, and a conditional effort note; it still contains the existing `tags` and `grimoire-execute-on-note` step-3 instructions and the closing `Begin execution now.` footer (regression guard that the body wrapper is untouched).

**junior-dev**
- [x] H1: Extend step 3 of `renderForgeSystemPrompt` to instruct the LLM to add a top-of-file frontmatter key `${CASTING_FRONTMATTER_KEY}` whose value is a block `{ provider: ${CLAUDE_CODE_PROVIDER}, model: <chosen model>, effort: <chosen effort, only when the model supports effort> }`. Import the two constants from `../domain/settings/CastingSettings`. Keep the `tags` + `grimoire-execute-on-note` instructions and the `Begin execution now.` footer intact. Extend `tests/forgeTemplate.test.ts` per the Red criterion. — S, junior-dev *(depends on A1)* (7d78454)

### I. Cleanup + regression sweep (no tester)

#### Section briefing
1. **What this section produces** — removes now-dead real-spell write paths from `SpellOverrideStore` consumers and updates the architecture/lint regression. `SpellOverrideStore` itself is **retained** (Refine sentinel), so this is a consumer-audit, not a deletion. Updates the existing `tests/integration/options-panel.spec.ts` and `tests/OptionsPanel.test.ts` whose A5/A6 assertions test `overrides.set/clear` for real spells — those expectations move to the frontmatter writer / `setVaultDefault`.
2. **Methods produced** — none new; deletions/edits to existing call sites.
3. **Design context** — copy from Technical notes: "`SpellOverrideStore` is retained, not deleted … real-spell records are migrated out and the panel no longer writes real-spell records to it."
4. **Cross-section couplings** — `I1 depends on F2: the panel no longer calls overrides.set/clear for real spells, so the existing A5/A6 tests must be rewritten to assert the new writer/setVaultDefault behaviour.` `I2 depends on all prior sections (full suite green).`
5. **Section-level Red criterion** — `npm test`, `npm run lint`, `npm run arch:check`, and `npm run test:integration` all green; no remaining real-spell call to `overrides.set`/`overrides.clear`/`overrides.get`/`overrides.has` outside the Refine-sentinel path (grep-asserted); the old `options-panel.spec.ts` A5/A6 cases assert the frontmatter-writer / vault-default behaviour instead of `overrides.set/clear`.

**junior-dev**
- [x] I1: Update `tests/integration/options-panel.spec.ts` (A5/A6) and `tests/OptionsPanel.test.ts` to assert the new write target: Set-as-default → `setVaultDefault` callback; Cast-after-change → casting writer. Remove assertions that real-spell Set-as-default calls `overrides.set/clear`. — M, junior-dev *(depends on F2)* (af43b6c)
- [x] I2: Run `npm run lint`, `npm run arch:check`, `npm test`, `npm run test:integration`; grep-assert no real-spell `overrides.{set,clear,get,has}` calls remain outside the Refine-sentinel branch in `OptionsDetail`/`OptionsFormState`. Fix any fallout. — S, junior-dev *(depends on all prior)* (b9ffe5d)

---

## Overall effort summary

- **Totals:** S: 5 · M: 13 · L: 0 (18 todos)
- **By tier:** ui-integration-tester: 2 · junior-dev: 11 · senior-dev: 5 · lead-dev: 0
- **Dominant tier:** junior-dev (pure parser/resolver/seam units and wiring are fully specified by the Interfaces section). Senior-dev concentrated where judgment is real: migration idempotency/partial-failure (D1), the resolver-wiring branch split (E1/E2), and the panel write-target swap with its set-as-default behaviour change and Sync-thrash guard (F1–F3).

reviewed @ 2d61ede
