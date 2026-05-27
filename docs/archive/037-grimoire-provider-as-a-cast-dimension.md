# 037 — Provider as a Cast Dimension

> Make **provider** a first-class domain primitive and thread it — as a single-valued dimension — through every place where `model` and `effort` already travel together, plus add one orthogonal provider→adapter resolution seam in the dispatch path. One provider exists today (`claude-code`); the work is completeness and correct seam placement, not algorithmic difficulty.

## Goal & scope

**Goal.** Promote provider from the loose `string` constant it is today (`CLAUDE_CODE_PROVIDER = 'claude-code'`, introduced by feature 034) into a stable, branded domain primitive with a known-set registry, and ride it alongside model+effort through: the model registry, the global default settings, per-spell `grimoire-casting` frontmatter, cast inputs, the cast-log record/event, Refine, and Forge (create + update). Add a single seam that resolves a provider identity to a **provider adapter**, orthogonal to the existing local-vs-remote caster, returning the one adapter that exists today.

**Why now.** Provider is implicit everywhere because there has only ever been one back-end. The roadmap adds Codex/Gemini/opencode/Qwen. If provider stays implicit until the first additional provider lands, that arrival becomes a migration touching every cast path at once. Threading the dimension now — while it has exactly one value — makes the future provider an *additive* entry, not a reshape.

### In scope
- A `Provider` domain primitive (branded union, one member `claude-code` today) with a known-set + a trust-boundary parser, mirroring `ModelId`/`Effort`.
- `SupportedModel` records which provider each model belongs to (`provider` field).
- `defaultProvider` on `GrimoireSettings` (+ `DEFAULT_SETTINGS`, hydrate, settings-tab field).
- Provider rides alongside model/effort in: `SpellCastingSettings` (frontmatter), `CastInput`, `CastedEvent` / `CastRecord`, Forge `ForgeFormSnapshot` + the forge system-prompt stamp, ForgeUpdate snapshot, Refine cast resolution, the portal request body.
- The `resolveProviderAdapter(provider) → ProviderAdapter` seam in the dispatch path, returning the single existing adapter via a one-entry registry.
- `resolveCastingForSpell` / `parseCastingSettings` upgraded to treat provider as the primitive rather than a bare string (the "stale provider → wholesale fallback" rule already exists; it now compares typed providers).

### Out of scope (no-gos — flag drift toward these)
- **No second adapter and no full adapter interface.** The `ProviderAdapter` introduced here is an opaque registry entry / marker. No per-provider invocation dialects, no arg-building beyond the single seam, no MCP config. Defining what an adapter must *implement* is the adapter-contract bet's job.
- **No effort changes.** Effort stays exactly as it is (optional, model-clamped). Provider-specific or absent-effort policy is a separate tightening.
- **No settings restructure** beyond adding `defaultProvider`. No per-provider model lists, no curated-vs-BYO tiers.
- **No folding provider into the caster** as a third branch beside local/remote. Provider is its own axis (the central rabbit hole).
- **No second provider value.** `claude-code` is the only member. The union is shaped so a future member is one-line additive, but no second value is added.

---

## Proposed solution

Two genuinely new units; everything else is mechanical field-threading.

1. **`Provider` primitive (keystone).** A branded string union (`'claude-code'`) with `KNOWN_PROVIDERS` set, a `provider()` brand constructor, and `parseProvider(raw): Provider | null` at the trust boundary. `CLAUDE_CODE_PROVIDER` becomes the single known member, retyped from a bare `string` literal to `Provider`. This identifier is *settled here* — whatever the adapter contract later builds conforms to it rather than redefining it.

2. **Provider→adapter resolver seam.** A `ProviderAdapter` opaque marker type and a `resolveProviderAdapter(provider): ProviderAdapter` backed by a one-entry `Map<Provider, ProviderAdapter>` (`PROVIDER_ADAPTERS`). Today it returns the single `claudeCodeAdapter`. This is the *orthogonal* axis: `createCaster` still answers *where* (local/remote); `resolveProviderAdapter` answers *which back-end*. A cast is the product of the two. The seam lives in the dispatch path (`CastDispatcher` / the Forge imprinters' dispatch), invoked alongside `createCaster` — never inside it.

Everything else — `SupportedModel.provider`, `GrimoireSettings.defaultProvider`, `CastInput.provider`, `CastedEvent.provider` / `CastRecord.provider`, the Forge/Refine snapshots — is adding one field that flows along the route model+effort already takes.

### Components

| Component | Responsibility | Location |
|-----------|----------------|----------|
| `Provider` primitive | Branded union type, `KNOWN_PROVIDERS`, brand ctor, trust-boundary parser | `src/domain/settings/Provider.ts` (new) |
| `ProviderAdapter` + resolver | Opaque adapter marker, one-entry registry, `resolveProviderAdapter` | `src/cast/provider/resolveProviderAdapter.ts` (new) |
| `SupportedModel` | Gains `provider: Provider` per model entry | `src/domain/settings/Settings.ts` |
| `GrimoireSettings` | Gains `defaultProvider: Provider`; `DEFAULT_SETTINGS` sets `claude-code` | `src/domain/settings/Settings.ts` |
| `hydrate` | Defaults + re-brands `defaultProvider` at the disk trust boundary | `src/infra/settingsPersistence.ts` |
| `SpellCastingSettings` | `provider` field retyped `string → Provider`; parser uses `parseProvider` | `src/domain/settings/CastingSettings.ts` |
| `resolveCastingForSpell` | `knownProvider` retyped to `Provider`; returns resolved `provider` alongside model/effort | `src/domain/settings/resolveCastingForSpell.ts` |
| `CastInput` | Gains `provider: Provider` | `src/execution/Caster.ts` |
| `CastedEvent` / `CastRecord` / recorder ports | Gain `provider: Provider` | `src/castLog/types.ts`, `src/castLog/CastRecord.ts`, `src/cast/CastResultRecorder.ts` |
| `foldEvents` | Copies `provider` from casted event into the record | `src/castLog/foldEvents.ts` |
| `CastDispatcher` | Threads provider into `recordCasted` + `CastInput`; resolves adapter via seam | `src/cast/CastDispatcher.ts` |
| Forge snapshots + imprinters + template | Provider stamped on created/updated spells and logged | `src/forge/*` |
| Settings tab | "Default provider" field (single-option dropdown today) | `src/ui/settings/GrimoireSettingTab.ts` |
| Portal request body | Carries `provider` in the JSON payload | `src/cast/portal/buildPortalRequestBody.ts`, `RemoteCaster.ts`, `RemoteCastTransport.ts` |

### Interfaces

```ts
// src/domain/settings/Provider.ts
export type Provider = string & { readonly __brand: 'Provider' };
export const CLAUDE_CODE: Provider; // 'claude-code'
export const KNOWN_PROVIDERS: readonly Provider[]; // [CLAUDE_CODE]
export function provider(value: string): Provider;          // brand ctor
export function parseProvider(raw: unknown): Provider | null; // trust boundary: returns a KNOWN provider or null
export function isKnownProvider(value: string): boolean;

// src/cast/provider/resolveProviderAdapter.ts
export interface ProviderAdapter { readonly provider: Provider; } // opaque marker — NO arg-building, NO dialect methods
export function resolveProviderAdapter(p: Provider): ProviderAdapter; // one-entry Map lookup; today always claudeCodeAdapter

// Settings.ts additions
export interface SupportedModel { id: ModelId; label: string; provider: Provider; effortOptions: readonly Effort[] | null; defaultEffort: Effort | null; }
export interface GrimoireSettings { /* …existing… */ defaultProvider: Provider; }

// CastingSettings.ts
export interface SpellCastingSettings { provider: Provider; model: ModelId; effort?: Effort; }

// resolveCastingForSpell.ts
export interface ResolvedCasting { provider: Provider; model: ModelId; effort: Effort | null; }

// Caster.ts
export interface CastInput { /* …existing… */ readonly provider: Provider; }

// castLog/types.ts + CastRecord.ts + CastResultRecorder.ts
interface CastedEvent { /* … */ readonly provider: Provider; }
interface CastRecord  { /* … */ readonly provider: Provider; }
interface RecordCastedInput { /* … */ readonly provider: Provider; }
```

### Data flow

```
                         ┌─────────────────────────────────────────────┐
 SUPPORTED_MODELS ──────▶│ each model carries its provider               │
 (registry)              └─────────────────────────────────────────────┘
                                          │
 GrimoireSettings.defaultProvider ────────┼─────────────┐
                                          ▼             ▼
 spell frontmatter (grimoire-casting.provider) ──▶ resolveCastingForSpell ──▶ { provider, model, effort }
                                                                  │
                                          ┌───────────────────────┴───────────────────┐
                                          ▼                                            ▼
                              CastDispatcher.dispatch                       Forge / ForgeUpdate imprint
                                          │                                            │
        ┌─────────────────────────────────┼────────────────────────────┐              │
        ▼                                 ▼                            ▼               ▼
  recordCasted({…, provider})    resolveProviderAdapter(provider)   caster.cast({…, provider})
        │                          (orthogonal to createCaster)        │
        ▼                                                              ▼
  CastedEvent.provider ──foldEvents──▶ CastRecord.provider     Local: buildCastArgs (no provider arg today)
                                                                Remote: buildPortalRequestBody({…, provider})
```

The two axes meet at dispatch: `createCaster(settings)` chooses local/remote (the *where*); `resolveProviderAdapter(provider)` chooses the back-end (the *which*). Today the adapter is held but drives no per-provider behavior — the no-go forbids it.

### Error handling
- **Trust boundary (disk / frontmatter / portal):** `parseProvider(raw)` returns `null` for any unknown/malformed value. `hydrate` falls `defaultProvider` back to `CLAUDE_CODE` when the persisted value is absent or not a known provider (mirrors the existing `defaultModel` re-brand and `defaultEffort` validation).
- **Stale provider in frontmatter:** already handled by `resolveCastingForSpell`'s `shouldFallbackWholesale` (provider ≠ known → wholesale fallback). This rule is preserved; the comparison just moves from `string !== string` to `Provider !== Provider`. An unknown provider string in the block still triggers wholesale fallback to the global default.
- **`resolveProviderAdapter` with an unknown provider:** by construction the input is a `Provider` (already a known member). The registry lookup falls back to `claudeCodeAdapter` if a future caller ever passes an unregistered provider — defence-in-depth, never the primary path today.

### Technical notes
- **`Provider` mirrors `ModelId`/`Effort`** brand patterns already in the repo — consistency over novelty.
- **The adapter is an opaque marker, not a Strategy.** Patterns considered: **Strategy for adapter behavior — rejected:** no per-provider arg-building exists; the adapter holds no behavior today (explicit no-go, YAGNI). **Registry/Map for provider→adapter — accepted:** one entry today; "register an adapter, not rewrite dispatch" is exactly the pitch's seam. **Provider-as-caster-branch — rejected:** the central rabbit hole; collapses two orthogonal axes.
- **`CLAUDE_CODE_PROVIDER` is retyped, not duplicated.** The existing constant in `CastingSettings.ts` is re-exported from / replaced by `Provider.ts`'s `CLAUDE_CODE` to avoid two sources of truth. Existing string-typed call sites (`OptionsDetail`, `CommandPopup`, `CastModelSection`, `forgeTemplate`) compile unchanged because `Provider` is a branded `string`.
- **`buildCastArgs` gains no `--provider` flag.** Adding a CLI arg is per-provider dialect work (no-go). Provider rides in `CastInput` and is *logged*, but the local arg builder is untouched. The portal body *does* carry it (additive JSON field, cheap, and the portal is where multi-provider routing will eventually live).
- **Refine sentinel keeps the data-store override path.** Its `resolveSpellOptions` cascade does not gain provider (the sentinel has no frontmatter); the Refine *cast* still picks up the global `defaultProvider` when building its `CastInput`. Mirrors feature 034's deliberate sentinel boundary.
- **Hydrate migration is free.** No existing data carries provider; absence defaults to `claude-code`. No idempotent fold needed (unlike 034) because there is no prior provider field to migrate.

---

## Perspective synthesis

- **Minimalist:** The smallest viable version is the `Provider` primitive + the field on `SupportedModel`, `GrimoireSettings`, `SpellCastingSettings`, `CastInput`, `CastedEvent`/`CastRecord`, and the `resolveProviderAdapter` seam. Everything else (portal body field, settings-tab dropdown) is cheap follow-through. Resist adding any adapter *method*.
- **Extensibility:** The 10× question is the keystone: is `Provider` shaped so member #2 is one line? Yes — union member + `KNOWN_PROVIDERS` entry + a `PROVIDER_ADAPTERS` registration. The seam (`resolveProviderAdapter`) is the single place dispatch consults; a new provider registers an adapter there. The `SupportedModel.provider` field lets the registry carry Codex/Gemini rows without changing shape.
- **Devil's advocate:** The riskiest failure is **incompleteness** — a missed path reintroduces the migration. The mitigation is the route survey above: every place model+effort travel together is enumerated and gets a todo, plus a grep-assertion todo (H1) that no remaining cast/log/forge interface still omits provider. Second risk: accidentally giving the adapter behavior and drifting into the no-go. Mitigation: the adapter type has *one* field (`provider`) and the plan forbids methods.
- **User advocate:** The settings-tab "Default provider" dropdown has one option today — it must read as deliberate (a real control), not a bug. Per-spell frontmatter already shows `provider: claude-code`; making it a typed primitive must not break hand-edited blocks (the wholesale-fallback rule covers typos).

**Consensus:** Thread the field everywhere model+effort go; add exactly one orthogonal resolver seam; keep the adapter behaviorless. **Tension:** portal body field (extensibility wants it; minimalist would cut it) — resolved *in* because the portal is the eventual multi-provider router and the field is one additive JSON key. **Critical concern:** completeness — addressed by the route survey + a grep-assertion guard todo (H1).

---

## Todos

### A. Provider primitive (keystone — no UI, no seam yet)

#### Section briefing
1. **What this section produces.** A new `src/domain/settings/Provider.ts` exporting the `Provider` brand, `CLAUDE_CODE`, `KNOWN_PROVIDERS`, `provider()`, `isKnownProvider()`, and `parseProvider()` — see Interfaces. No other file changes here.
2. **Methods produced.**
   - `provider(value: string): Provider` — brand-cast a string to `Provider` (mirrors `modelId`).
   - `isKnownProvider(value: string): boolean` — membership test against `KNOWN_PROVIDERS`.
   - `parseProvider(raw: unknown): Provider | null` — trust-boundary parse: returns a known `Provider` for a matching non-empty string, else `null`.
3. **Design context the executor needs upfront.** From Technical notes: "`Provider` mirrors `ModelId`/`Effort` brand patterns already in the repo." `CLAUDE_CODE` value is the string `'claude-code'`. `KNOWN_PROVIDERS` has exactly one member today; shape it so a second member is a one-line addition. `parseProvider` returns `null` for unknown/malformed (not a branded passthrough) — only *known* providers parse.
4. **Cross-section couplings.** None. (Section B retypes `CLAUDE_CODE_PROVIDER` to depend on this; that dependency is declared in B's briefing.)
5. **Section-level Red criterion.** Unit tests prove: `parseProvider('claude-code')` returns the branded `CLAUDE_CODE`; `parseProvider('codex')`, `parseProvider('')`, `parseProvider(null)`, `parseProvider(42)`, `parseProvider({})` all return `null`; `isKnownProvider('claude-code')` is `true`, `isKnownProvider('nope')` is `false`; `KNOWN_PROVIDERS` contains exactly `CLAUDE_CODE`.

**junior-dev**
- [x] A1: Create `src/domain/settings/Provider.ts` with `type Provider = string & { readonly __brand: 'Provider' }`, `provider(value)` brand ctor, `CLAUDE_CODE = provider('claude-code')`, and `KNOWN_PROVIDERS: readonly Provider[] = [CLAUDE_CODE]`. Mirror `src/domain/settings/ModelId.ts` exactly. — S, junior-dev
- [x] A2: Add `isKnownProvider(value: string): boolean` (returns `KNOWN_PROVIDERS.some(p => p === value)`) and `parseProvider(raw: unknown): Provider | null` (returns `provider(raw.trim())` when `typeof raw === 'string'` and `isKnownProvider(raw.trim())`, else `null`). Cover the edge cases in the Red criterion: empty string, `null`, non-string, unknown string, plain object. — S, junior-dev

### B. Provider in the model registry, global settings, and hydrate

#### Section briefing
1. **What this section produces.** Modifies `src/domain/settings/Settings.ts` (`SupportedModel` gains `provider`, every `SUPPORTED_MODELS` row tagged `CLAUDE_CODE`, `GrimoireSettings` gains `defaultProvider`, `DEFAULT_SETTINGS` sets it), `src/infra/settingsPersistence.ts` (`hydrate` defaults/re-brands `defaultProvider`), and `src/domain/settings/CastingSettings.ts` (retype `CLAUDE_CODE_PROVIDER` and `SpellCastingSettings.provider` to the `Provider` from A). Uses the `Provider` primitive from Section A — see Interfaces.
2. **Methods produced.**
   - `hydrate(saved, app)` — already exists; add one re-brand/validation line: `merged.defaultProvider = parseProvider(merged.defaultProvider) ?? CLAUDE_CODE`. No new helper; single line alongside the existing `defaultModel` re-brand.
   - `parseCastingSettings(raw)` / the local `parseProvider(obj)` in `CastingSettings.ts` — retype to return `Provider | null` by delegating to `Provider.ts`'s `parseProvider` instead of the bare-string check. The block parser must reject an unknown-provider block the same way it rejects a missing one (returns `null` → wholesale fallback downstream). NOTE: confirm against C — `resolveCastingForSpell` relies on a non-null parsed block meaning "known provider."
3. **Design context the executor needs upfront.** From Technical notes: "`CLAUDE_CODE_PROVIDER` is retyped, not duplicated — re-export from / replace with `Provider.ts`'s `CLAUDE_CODE` to avoid two sources of truth." "Hydrate migration is free — absence defaults to `claude-code`; no idempotent fold needed." From Error handling: hydrate "falls `defaultProvider` back to `CLAUDE_CODE` when the persisted value is absent or not a known provider."
4. **Cross-section couplings.** B depends on A1/A2: every retype here imports `Provider`, `CLAUDE_CODE`, `parseProvider` from `Provider.ts`. C2 depends on B's `parseCastingSettings` retype: the resolver's `knownProvider` argument must be the typed `Provider`, and "parsed block is non-null ⇒ known provider" must hold after B changes the parser.
5. **Section-level Red criterion.** `DEFAULT_SETTINGS.defaultProvider === CLAUDE_CODE`; every `SUPPORTED_MODELS` entry has `provider === CLAUDE_CODE`; `hydrate({}, app).settings.defaultProvider === CLAUDE_CODE`; `hydrate({ settings: { defaultProvider: 'codex' } }, app).settings.defaultProvider === CLAUDE_CODE` (unknown → fallback); `hydrate({ settings: { defaultProvider: 'claude-code' } }, app)` preserves it; `parseCastingSettings({ provider: 'codex', model: 'x' })` returns `null` (unknown provider rejected); `parseCastingSettings({ provider: 'claude-code', model: 'claude-sonnet-4-5' })` returns a block whose `provider === CLAUDE_CODE`.

**junior-dev**
- [x] B1: In `Settings.ts`, add `provider: Provider` to `SupportedModel` and tag all three `SUPPORTED_MODELS` rows with `CLAUDE_CODE` (import from `Provider.ts`). — S, junior-dev (63e4d3a)
- [x] B2: In `Settings.ts`, add `defaultProvider: Provider` to `GrimoireSettings` and set `DEFAULT_SETTINGS.defaultProvider = CLAUDE_CODE`. — S, junior-dev (63e4d3a)
- [x] B3: In `settingsPersistence.ts` `hydrate`, after the existing `defaultModel` re-brand add `merged.defaultProvider = parseProvider(merged.defaultProvider) ?? CLAUDE_CODE;`. Edge cases: absent (→ `CLAUDE_CODE`), unknown string (→ `CLAUDE_CODE`), valid (→ preserved). — S, junior-dev (63e4d3a)
- [x] B4: In `CastingSettings.ts`, replace the local `CLAUDE_CODE_PROVIDER` literal with a re-export of `CLAUDE_CODE` from `Provider.ts` (keep the `CLAUDE_CODE_PROVIDER` name exported for existing importers, or update importers — pick the lower-churn option and note it), retype `SpellCastingSettings.provider` to `Provider`, and make the block's `parseProvider`/`parseCastingSettings` delegate to `Provider.ts`'s `parseProvider` so an unknown-provider block returns `null`. Edge case: unknown provider in block → `null`. — M, junior-dev (63e4d3a)

### C. Provider in the spell-casting resolver

#### Section briefing
1. **What this section produces.** Modifies `src/domain/settings/resolveCastingForSpell.ts` so `knownProvider` is typed `Provider` and the resolver returns the resolved `provider` alongside `model`/`effort` (`ResolvedCasting` gains `provider`). Uses A's `Provider` and the B-retyped `SpellCastingSettings` — see Interfaces.
2. **Methods produced.**
   - `resolveCastingForSpell(input)` — orchestrator; already decomposed into `shouldFallbackWholesale` → `resolveModel` → `resolveEffort`. Resolve provider inline (single expression): when wholesale, resolved provider is `input.defaults.defaultProvider`; otherwise `input.parsed!.provider`. No new branching helper — one ternary keyed off the existing wholesale flag.
   - `shouldFallbackWholesale(parsed, knownProvider)` — unchanged logic; `knownProvider` retyped to `Provider`.
3. **Design context the executor needs upfront.** From feature 034 (still in force): "the new `resolveCastingForSpell` owns the frontmatter-vs-default value policy (wholesale-vs-per-value, stale provider)." Wholesale fallback fires when `parsed === null` OR `parsed.provider !== knownProvider`. The resolved provider must follow the same wholesale flag as model/effort: wholesale ⇒ default provider; per-value ⇒ the block's provider.
4. **Cross-section couplings.** C2 depends on B4: `ResolveCastingInput.knownProvider` is now `Provider`, and `defaults` gains `defaultProvider: Provider`. C is depended on by D (CastDispatcher) and F (OptionsDetail/CommandPopup callers) — those callers must pass `defaultProvider` and consume the returned `provider`; declared in D's and F's briefings.
5. **Section-level Red criterion.** `resolveCastingForSpell` returns `provider: CLAUDE_CODE` for a valid claude-code block; returns `defaultProvider` (wholesale) when `parsed` is `null`; returns `defaultProvider` (wholesale) when `parsed.provider` is a stale/unknown provider; the returned `model`/`effort` behavior is byte-for-byte unchanged from today (regression guard).

**junior-dev**
- [x] C1: Add `defaultProvider: Provider` to `ResolveCastingInput.defaults` and `provider: Provider` to `ResolvedCasting`. — S, junior-dev (8238099)
- [x] C2: Retype `ResolveCastingInput.knownProvider` to `Provider`; in `resolveCastingForSpell`, compute `resolvedProvider = wholesale ? input.defaults.defaultProvider : input.parsed!.provider` and include it in the return. Tests: valid block → block provider; null parsed → default; stale provider → wholesale to default; assert model/effort unchanged vs current behavior. — M, junior-dev (8238099)

### D. Provider through dispatch, cast input, cast log, and the adapter seam

#### Section briefing
1. **What this section produces.** Adds `src/cast/provider/resolveProviderAdapter.ts` (the seam) and threads `provider` through `CastInput` (`src/execution/Caster.ts`), the cast-log event/record/recorder (`src/castLog/types.ts`, `src/castLog/CastRecord.ts`, `src/cast/CastResultRecorder.ts`, `src/castLog/foldEvents.ts`), and `CastDispatcher` (`src/cast/CastDispatcher.ts`). The local arg builder (`buildCastArgs`) is intentionally NOT changed; the portal body (`buildPortalRequestBody` + `RemoteCaster` + `RemoteCastTransport`) gains a `provider` field. Uses A's `Provider`; consumes C's resolved provider — see Interfaces.
2. **Methods produced.**
   - `resolveProviderAdapter(p: Provider): ProviderAdapter` — single `Map.get` against `PROVIDER_ADAPTERS`, falling back to `claudeCodeAdapter`. No helpers; one lookup. `ProviderAdapter` is a marker `{ readonly provider: Provider }` with no methods.
   - `CastDispatcher.dispatch(input)` — orchestrator; already decomposed (`#buildUserPrompt`, inline `recordCasted`, `caster.cast`). Changes are field-threading only: add `provider` to `CastDispatchInput`, pass it into both `recordCasted(...)` calls and the `caster.cast({...})` input, and call `resolveProviderAdapter(input.provider)` adjacent to `this.#caster()` (the adapter is resolved and held; today it carries no behavior — do NOT branch on it). No new branch helper; the existing structure absorbs the field. NOTE: keep `createCaster` and `resolveProviderAdapter` as two separate calls — never fold one into the other (no-go).
   - `combineCastedRecord(castId, castedEvent)` (in `foldEvents.ts`) — add `provider: castedEvent.provider` to the seeded record. One field.
   - `buildPortalRequestBody(input)` — add `body.provider = input.provider` (additive JSON key). One field.
3. **Design context the executor needs upfront.** From Solution/Technical notes: "`createCaster(settings)` chooses the *where* (local/remote); `resolveProviderAdapter(provider)` chooses the *which* (back-end). The two axes meet at dispatch — never fold one into the other." From Technical notes: "`buildCastArgs` gains no `--provider` flag — adding a CLI arg is per-provider dialect work (no-go). The portal body *does* carry it." From the Rabbit holes no-go: the adapter is an opaque marker with one field and no methods.
4. **Cross-section couplings.** D depends on A (Provider) and on C (the dispatcher's caller supplies the resolved `provider` — `CastDispatchInput` gains `provider`, populated by F's callers). D depends on B (`CastedEvent.provider` is typed `Provider`). E (Forge) and D both add `provider` to `RecordCastedInput`; the recorder port change in D2 is shared — E reuses it, declared in E's briefing.
5. **Section-level Red criterion.** `resolveProviderAdapter(CLAUDE_CODE)` returns the single `claudeCodeAdapter` whose `.provider === CLAUDE_CODE`; `CastInput`, `CastedEvent`, `CastRecord`, `RecordCastedInput` all carry a `provider: Provider` field (type-level + runtime); `foldEvents` copies `provider` from the casted event into the resulting `CastRecord`; `CastDispatcher.dispatch` records `provider` in `recordCasted` and passes it in `CastInput`, and calls `resolveProviderAdapter` exactly once per dispatch without altering local-vs-remote selection; `buildPortalRequestBody({…, provider: CLAUDE_CODE})` includes `"provider":"claude-code"` in the JSON; `buildCastArgs` output is unchanged (regression guard — no `--provider`).

**junior-dev**
- [x] D1: Add `readonly provider: Provider` to `CastInput` (`src/execution/Caster.ts`). — S, junior-dev
- [x] D2: Add `readonly provider: Provider` to `CastedEvent` (`src/castLog/types.ts`), `CastRecord` (`src/castLog/CastRecord.ts`), and `RecordCastedInput` in `src/cast/CastResultRecorder.ts`. — S, junior-dev
- [x] D3: In `foldEvents.ts` `combineCastedRecord`, copy `provider: castedEvent.provider` into the seeded record. Test: record reflects the casted event's provider. — S, junior-dev
- [x] D4: In `buildPortalRequestBody.ts`, add `provider: input.provider` to the body and `provider` to its input type; thread `provider` through `RemoteCaster.cast` and `RemoteCastTransport` run input. Test: JSON body contains `"provider":"claude-code"`. — M, junior-dev

**senior-dev**
- [x] D5: Create `src/cast/provider/resolveProviderAdapter.ts` — `interface ProviderAdapter { readonly provider: Provider }`, a `claudeCodeAdapter: ProviderAdapter = { provider: CLAUDE_CODE }`, a `PROVIDER_ADAPTERS: Map<Provider, ProviderAdapter>` with the one entry, and `resolveProviderAdapter(p)` returning `PROVIDER_ADAPTERS.get(p) ?? claudeCodeAdapter`. The adapter MUST have no methods (no-go: no adapter interface/dialect). Tests: returns the claude-code adapter for `CLAUDE_CODE`; returns it as fallback for any unregistered provider. — S, senior-dev (judgment: this is the load-bearing seam shape; keep it behaviorless and orthogonal) (d9e5734)
- [x] D6: In `CastDispatcher`, add `provider: Provider` to `CastDispatchInput`; thread it into both `recordCasted(...)` calls and the `caster.cast({...})` `CastInput`; call `resolveProviderAdapter(input.provider)` alongside `this.#caster()` (resolve + hold; do NOT branch on it, do NOT fold into `createCaster`). Tests: `recordCasted` receives provider; `CastInput` carries provider; `resolveProviderAdapter` invoked once; local-vs-remote selection unchanged. — M, senior-dev (judgment: the orthogonality invariant — two separate calls, adapter held not branched — is the whole pitch; depends on D5) (d9e5734)

### E. Provider in Forge create, Forge update, and the forge template

#### Section briefing
1. **What this section produces.** Threads provider through the Forge create path (`src/forge/ForgeFormSnapshot.ts`, `ForgeImprinter.ts`, `buildForgeUserPrompt.ts`, `forgeTemplate.ts`), the Forge update path (`ForgeUpdateFormSnapshot.ts`, `ForgeUpdateImprinter.ts`, `buildForgeUpdateUserPrompt.ts`), and confirms the form snapshots are populated with a provider. Reuses D2's `RecordCastedInput.provider` and D5's `resolveProviderAdapter`; uses A's `Provider` — see Interfaces.
2. **Methods produced.**
   - `ForgeImprinter.#recordCast(castId, snapshot)` — add `provider: snapshot.provider` to `recordCasted(...)`. One field.
   - `ForgeImprinter.#onCastAccepted(ctx, jobId)` — add `provider: snapshot.provider` to its `recordCasted(...)`. One field.
   - `ForgeImprinter.#dispatchCast(ctx)` — add `provider: snapshot.provider` to the `caster.cast({...})` `CastInput`, and call `resolveProviderAdapter(snapshot.provider)` adjacent to `this.#caster()` (held, not branched). Mirrors D6's invariant.
   - `ForgeUpdateImprinter.#recordCast` / `#dispatchCast` — same two edits as their `ForgeImprinter` counterparts.
   - `buildForgeUserPrompt(input)` / `buildForgeUpdateUserPrompt(input)` — add a `Provider:` line to the rendered prompt so the meta-spell knows which provider stamp to write. One field each.
   - `renderForgeSystemPrompt(input)` — the `grimoire-casting` stamp instruction already hardcodes `provider: ${CLAUDE_CODE_PROVIDER}`; retype that import to `CLAUDE_CODE` (the stamp value is unchanged, the type is now the primitive).
3. **Design context the executor needs upfront.** From feature 034 relationship notes: "the system-prompt template's create instruction now also stamps the `grimoire-casting` block." From this pitch: "the values Forge stamps onto a spell it creates" must include provider — it already does (hardcoded `claude-code`); this section makes that value flow from the snapshot/primitive rather than a bare constant, and logs provider on the forge cast record. From D's no-go: adapter held not branched; `createCaster`/`resolveProviderAdapter` stay separate.
4. **Cross-section couplings.** E depends on D2 (`RecordCastedInput.provider`), D5 (`resolveProviderAdapter`), and D1 (`CastInput.provider`). The Forge form snapshots gaining `provider` are populated by the popup builder wiring in F — declared in F's briefing.
5. **Section-level Red criterion.** `ForgeFormSnapshot` and `ForgeUpdateFormSnapshot` carry `provider: Provider`; both imprinters log `provider` in `recordCasted` and pass it in `CastInput`; both call `resolveProviderAdapter` once per dispatch without changing local-vs-remote selection; `buildForgeUserPrompt`/`buildForgeUpdateUserPrompt` render the provider line; `renderForgeSystemPrompt` still stamps `provider: claude-code` (typed via `CLAUDE_CODE`).

**junior-dev**
- [x] E1: Add `provider: Provider` to `ForgeFormSnapshot` and `ForgeUpdateFormSnapshot`. — S, junior-dev
- [x] E2: In `buildForgeUserPrompt` and `buildForgeUpdateUserPrompt`, add `provider` to the input type and render a `- **Provider:** ${provider}` line. Test: rendered prompt contains the provider. — S, junior-dev
- [x] E3: In `forgeTemplate.ts`, retype the `CLAUDE_CODE_PROVIDER` import to `CLAUDE_CODE` from `Provider.ts` (stamp value unchanged: `provider: claude-code`). — S, junior-dev
- [x] E4: In `ForgeImprinter` (`#recordCast`, `#onCastAccepted`, `#dispatchCast`) add `provider: snapshot.provider` to both `recordCasted` calls and the `CastInput`; call `resolveProviderAdapter(snapshot.provider)` beside `this.#caster()` (held, not branched). Same edits in `ForgeUpdateImprinter` (`#recordCast`, `#dispatchCast`). Tests: provider logged + in CastInput; adapter resolved once; local/remote unchanged. — M, junior-dev (design fully prescribed by D5/D6 — mechanical mirror)

### F. Wire provider through the popup/options callers and the Refine cast

#### Section briefing
1. **What this section produces.** Updates the call sites that build `CastDispatchInput` / Forge snapshots / Refine casts so the resolved/default provider is supplied: `src/ui/CommandPopup.ts` (Enter-from-list `#handleSpellCast`, `#handleRefineCast`), `src/ui/components/OptionsDetail.ts` (`#resolveRealSpellCasting`), `src/ui/options/CastModelSection.ts` (the persisted block uses `CLAUDE_CODE`), and the popup builder/`PopupModule`/`main.ts` wiring that constructs snapshots and supplies `defaultProvider`. Any cast-action plumbing that forwards `{ model, effort }` must now also forward `provider`. Consumes C's `ResolvedCasting.provider`, D6's `CastDispatchInput.provider`, E1's snapshot field. No new files.
2. **Methods produced.**
   - `CommandPopup.#handleSpellCast(spell)` — already calls `resolveCastingForSpell(...)`; add `defaultProvider` to `defaults`, retype `knownProvider` to `CLAUDE_CODE`, and forward the returned `provider` into `#castAction(...)`. Field-threading only.
   - `CommandPopup.#handleRefineCast()` — supply the global `defaultProvider` when building the Refine cast snapshot (sentinel has no frontmatter; provider comes from settings default).
   - `OptionsDetail.#resolveRealSpellCasting(spellPath, params)` — add `defaultProvider` to `defaults`, return the resolved `provider` alongside model/effort.
   - `CastModelSection.persistBlockOnCast(...)` / `#blockChanged(...)` — the written `newBlock.provider` uses `CLAUDE_CODE` (retyped); `#blockChanged` provider comparison stays `Provider !== Provider`. Field-threading only.
   - Popup builder / `PopupModule` / `main.ts` cast-action closures — forward `provider` from the resolved options into `CastDispatcher.dispatch`, set `provider` on Forge snapshots (Forge create: `settings.defaultProvider`; Forge update: the resolved/default provider per the existing model precedent), and pass `defaultProvider` into the resolver `defaults` (route it the way `defaultModel`/`defaultEffort` already travel via `FormDefaults`).
3. **Design context the executor needs upfront.** From feature 034: the panel and Enter-from-list paths both feed the same `CastDispatcher` with already-resolved `{ model, effort }` — now `{ provider, model, effort }`. From this pitch: "Refine and Forge are no exception" — Refine's cast must carry provider (from the global default, since the sentinel has no frontmatter). From Technical notes: "Refine sentinel keeps the data-store override path … the Refine cast still picks up the global `defaultProvider` when building its `CastInput`."
4. **Cross-section couplings.** F depends on C (resolver returns `provider`), D6 (`CastDispatchInput.provider`), E1 (snapshot `provider`), and B2 (`GrimoireSettings.defaultProvider` exists). F is the last wiring layer — it is where `main.ts`/`PopupModule` pass `defaultProvider` into the resolver `defaults`. NOTE: the cast-action signature that currently carries `{ model, effort, contextNotePaths, followUp, executeOnNote }` must gain `provider`; trace every caller of that action (CommandPopup, OptionsPanel host) and thread it.
5. **Section-level Red criterion.** Enter-from-list cast dispatches a `CastDispatchInput` whose `provider` is the spell's resolved provider (block provider, or `defaultProvider` on wholesale fallback); the options-panel cast does the same; the Refine cast dispatches with `provider === settings.defaultProvider`; Forge create dispatches with the configured default provider; the `CastModelSection` block written on cast carries `provider: CLAUDE_CODE`; no caller of the cast action omits `provider` (type-checks).

**senior-dev**
- [x] F1: Thread `defaultProvider` into every `resolveCastingForSpell({ defaults, knownProvider })` call site (`CommandPopup.#handleSpellCast`, `OptionsDetail.#resolveRealSpellCasting`) using `settings.defaultProvider` / `formDefaults` and `CLAUDE_CODE`, and forward the returned `provider` into the cast action. Update `FormDefaults`/`formDefaults` plumbing if it must carry `defaultProvider` (follow the existing `defaultModel`/`defaultEffort` route). — M, senior-dev (judgment: trace the full set of cast-action callers; this is the completeness-critical wiring the pitch's risk centres on) (93ee8e6)
- [x] F2: Extend the cast-action / dispatch-input plumbing (the closure that calls `CastDispatcher.dispatch` from `CommandPopup`/`PopupModule`, the Refine cast action, and Forge-snapshot construction) so `provider` is supplied everywhere: spell casts pass the resolved provider; Refine passes `settings.defaultProvider`; Forge create passes the default provider; Forge update passes the resolved/default provider per the existing model precedent. Update `CastModelSection` to write `CLAUDE_CODE` (retyped) and compare providers in `#blockChanged`. — M, senior-dev (judgment: orchestrates the wiring across popup, refine, and forge call sites; depends on F1) (93ee8e6)

### G. Default-provider settings field (UI seam)

#### Section briefing
1. **What this section produces.** Adds a "Default provider" control to `src/ui/settings/GrimoireSettingTab.ts` that reads/writes `settings.defaultProvider`. Single-option dropdown today (only `claude-code`), persisted via the existing `#save()` path. Uses B2's `GrimoireSettings.defaultProvider` and A's `KNOWN_PROVIDERS` — see Interfaces. This is the only user-facing UI seam in the plan; all prior sections are domain/dispatch plumbing.
2. **Methods produced.**
   - `GrimoireSettingTab.#addProviderField()` — new private method mirroring `#addModelField`: `new Setting(...).setName('Default provider').setDesc(...).addDropdown(d => { KNOWN_PROVIDERS.forEach(p => d.addOption(p, label(p))); d.setValue(s.defaultProvider); d.onChange(raw => { s.defaultProvider = parseProvider(raw) ?? CLAUDE_CODE; this.#save(); }); })`. Called from `#renderGeneralSection` before `#addModelField`. One concern: render + persist the provider field.
3. **Design context the executor needs upfront.** From the user-advocate synthesis: "the dropdown has one option today — it must read as deliberate (a real control), not a bug." From Technical notes: no settings restructure beyond adding `defaultProvider` (no per-provider model lists). The provider field sits in the General section alongside Default model / Default effort.
4. **Cross-section couplings.** G depends on B2 (`GrimoireSettings.defaultProvider`) and A (`KNOWN_PROVIDERS`, `parseProvider`, `CLAUDE_CODE`). No section depends on G. G6 (tester) owns the Red criterion; G7 makes it green.
5. **Section-level Red criterion.** Mounting `GrimoireSettingTab` renders a "Default provider" dropdown whose options are exactly `KNOWN_PROVIDERS`, whose value reflects `settings.defaultProvider`, and whose `onChange` writes the parsed provider back to settings and triggers a save. Changing the (single) option keeps `defaultProvider` a valid known provider.

**ui-integration-tester**
- [x] G6: integration test (`tests/integration/`): mount `GrimoireSettingTab`, assert a "Default provider" dropdown exists with options equal to `KNOWN_PROVIDERS` and value equal to `settings.defaultProvider`; simulate selecting the option and assert `settings.defaultProvider` is set to a known `Provider` and the save callback fired. Mock `obsidian` via the existing `tests/__mocks__/obsidian.ts`. — S, ui-integration-tester

**junior-dev**
- [x] G7: Add `#addProviderField()` to `GrimoireSettingTab` (mirror `#addModelField`), call it from `#renderGeneralSection` ahead of the model field, reading/writing `settings.defaultProvider` with `KNOWN_PROVIDERS` options and `parseProvider(raw) ?? CLAUDE_CODE` on change. Make G6 green. — S, junior-dev (depends on G6 above)

### H. Completeness guard

#### Section briefing
1. **What this section produces.** A grep-style / type-level assertion test that fails if any cast/log/forge interface that carries `model` still omits `provider` — the devil's-advocate mitigation against the migration-reintroducing "missed path." No production code; one test file under `tests/`.
2. **Methods produced.** None (test-only).
3. **Design context the executor needs upfront.** From the perspective synthesis (devil's advocate / critical concern): "completeness — a missed path reintroduces the migration. Mitigation: a grep-assertion that no remaining cast/log/forge interface still omits provider." The enumerated route is the Components table.
4. **Cross-section couplings.** H depends on every prior section (A–F) having added `provider` to its interface. It is the final verification gate.
5. **Section-level Red criterion.** A test reads the source of `Caster.ts`, `castLog/types.ts`, `CastRecord.ts`, `CastResultRecorder.ts`, `CastingSettings.ts`, `resolveCastingForSpell.ts` (`ResolvedCasting`), `ForgeFormSnapshot.ts`, `ForgeUpdateFormSnapshot.ts`, and `buildPortalRequestBody.ts`, and asserts each that mentions `model`/`modelId` also mentions `provider`. The test fails (red) if a provider field was dropped from any threaded interface.

**junior-dev**
- [x] H1: Add a completeness test asserting every threaded interface listed in the Red criterion that references `model`/`modelId` also references `provider` (string-match the source files, mirroring `tests/castLog/CastLogWriter.types.test.ts`-style guards). Edge: the test must fail if any one interface omits provider. — M, junior-dev

---

## Effort & dev tier summary

- **Total todos: 23.** Effort — S: 15, M: 8, L: 0.
  - M todos: B4, C2, D4, D6, E4, F1, F2, H1. All others are S.
- **By tier:** junior-dev: 18 · senior-dev: 4 · ui-integration-tester: 1 · lead-dev: 0.
  - junior-dev = A1, A2, B1, B2, B3, B4, C1, C2, D1, D2, D3, D4, E1, E2, E3, E4, G7, H1.
  - senior-dev = D5, D6, F1, F2.
  - ui-integration-tester = G6.
- **Dominant tier:** junior-dev. The feature is overwhelmingly mechanical field-threading; the only genuine judgment is the adapter-seam shape (D5), the orthogonality invariant at dispatch (D6 — two separate calls, adapter held not branched), and tracing the full set of cast-action callers (F1/F2). One thin UI seam (G6/G7) for the settings dropdown; one completeness guard (H1).

reviewed @ 00ef871
