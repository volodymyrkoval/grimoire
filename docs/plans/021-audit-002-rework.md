# Plan 021 — audit-002-rework

> Triaged rework driven by `docs/design-audits/002-full.md` (131 violations across 8 shards). Applies the user's skeptic's lens: **fix the items that prevent real bug classes; document the ones we deliberately keep; reject the rest as overengineering.**

## Goal & scope

**Goal:** drain the high-leverage violations from audit 002 (boundary integrity, fitness-tool restoration, the spell-path-sentinel junk drawer, one targeted Primitive Obsession pass, and the two genuinely problematic god classes), while leaving long-but-linear code and speculative abstractions alone.

**In scope:**

1. Restore `.dependency-cruiser.cjs` so CI enforces module boundaries.
2. Purify `domain/` — evict `obsidian` SDK and `infra/` imports (5 files).
3. Move `FORGE_SPELL_PATH` / `REFINE_SPELL_PATH` from `castLog/types` to `domain/spells/` — kills three boundary violations atomically.
4. Port-and-adapter `CastLogWriter` consumers in `forge/` and `cast/` (define `CastEventSink` / `CastResultRecorder` ports in the consuming module; wire from `main/`).
5. One targeted Primitive Obsession pass: brand `ModelId` (parallel to existing `SpellPath`); thread it through the cast/forge/options call chain. This is the only PO win with broad statically-detectable payoff.
6. Two structural god-class breakups where the divergent-change axes are real: `CommandPopup` (detail-panel routing) and `CastLogModule` (startup maintenance).
7. Surgical fixes co-located with #4 and #6: collapse the duplicated 12-field settings stub via the leaky-`resolveSpellOptions` fix; delete the `refineCastActionForWiring` dead getter; delete the `suspendKb: false` dead branch; collapse `SpellOptionsDetail` + `RefineOptionsDetail` near-clones; replace `phase.kind === 'detail'` with `phase.disablesTabBar()`.

**Out of scope (rejected — see "Considered & Rejected"):**

- Wholesale value-object pass beyond `ModelId` (e.g. `CastId`, `AbsolutePath`, `PluginRelPath`, `VaultRelPath`, `PortalEndpoint`, `BasicCredentials`).
- Breaking up `RemoteCastTransport.#execute` (74 LOC, linear pipeline — flat is clearer than chopped).
- Breaking up `ForgeImprinter.imprint` (60 LOC, mirrors `CastDispatcher.dispatch` deliberately).
- Breaking up `CastDispatcher.dispatch` (54 LOC, linear).
- Breaking up `VaultRefreshCoordinator` (5 phases of one coordinated lifecycle — Extract Class along those axes produces five tiny mutually-dependent classes for no testability gain).
- Replacing `if`/`else if` in `displayName.ts` / `foldEvents.ts` with Strategy/polymorphism (two/three branches, stable).
- Strategy pattern for `ForgeImprinter` local-vs-remote flag (one flag drives the call, no future strategies on horizon).
- `PluginPaths` Extract Class breakup (38-LOC class, cohesive responsibility "where things live on disk").
- TypedEmitter `off()` (no leak observed today; YAGNI).
- Comments-restating-code purges as a standalone task (handled change-by-change inside the items above; not a sweeping cleanup).
- Resource-extraction of `forgeTemplate.ts` into a `.md` resource (esbuild bundling complication > marginal benefit).

---

## Multi-perspective synthesis (Design)

Four lenses were applied to the audit's full violation list. The user's skeptic axis (devils-advocate) was given disproportionate weight per the framing.

### Minimalist

> _What can we cut? What is the smallest viable version?_

- The architecture-boundary fixes (items 1–4 in Priority) are non-negotiable: they involve no abstraction invention, just relocation. Smallest viable: keep them; cut everything else if forced.
- The `ModelId` brand is one type-alias + a constructor function (~5 LOC of new code) and is mechanically applied through the call graph. Lowest cost-per-bug-prevented in the whole audit.
- `CommandPopup` is a real god class — 343-LOC file is past the FAIL threshold. But the bulk of LOC is the three `#renderXxxDetail` methods (`#renderForgeSentinelDetail`, `#renderOptionsPanel`, `#renderRefineOptionsPanel`), which are call-once routers. The minimal cut is to extract just those three into a `DetailPanelRouter`, not the speculative `PopupEventWiring` and `PhaseContextBuilder` that the audit also lists.
- `CastLogModule.initStartupMaintenance` is 45 LOC FAIL but the body is genuinely four named subsystems — Extract Method per subsystem is mechanical, junior-dev work, and the result reads better.
- **Cut entirely:** the codebase-wide PO pass beyond `ModelId`. `AbsolutePath`/`PluginRelPath`/`VaultRelPath` branding would touch ~30 files for a class of bug (mixing path variants) we have zero evidence of in incident history.

### Extensibility

> _What if this grows 10×? What seams will we regret not carving?_

- The `domain/ → obsidian` boundary is the one to defend. The plugin currently has no host-agnostic core; if Grimoire ever runs in a non-Obsidian context (CLI script, web app), the entire `domain/` layer is unusable. This is the single seam most worth carving now while the surface is small.
- The `forge/`-and-`cast/` → `castLog/` port-and-adapter inversion pays back when a second consumer of cast events appears (telemetry sink, analytics, replay log). Even without that, it clarifies which methods of `CastLogWriter` each consumer actually needs (`recordCasted` only, vs. `recordCasted + recordError`).
- The `CastOrigin` discriminated union (replace `FORGE_SPELL_PATH` / `REFINE_SPELL_PATH` magic-string sentinels with `{ kind: 'spell'; path } | { kind: 'forge' } | { kind: 'refine' }`) is high-extensibility leverage — adding a new origin kind would today require grep-finding three magic strings across `displayName`, `foldEvents`, dispatch sites. **However** this is a larger refactor than the boundary fix and the constants currently work; deferred (see Rejected). The boundary fix (relocate constants to `domain/spells/`) is independent and cheap.
- **Don't carve:** speculative ports for things with one implementation. `RefreshCoordinator` / `TickCoordinator` interfaces already exist and pay for themselves through tests — fine. `ForgeMaterializerPorts` triple-injection shape pays for nothing (test usage covered by the adapter form) — collapse.

### Devil's advocate (loudest voice)

> _What could break? What's the riskiest assumption?_

- **Risk of overengineering:** the audit lists 131 violations and a junior implementer would mechanically fix all of them. Result: ~50 new tiny classes/functions, longer call chains, harder-to-follow control flow, no behavior change. **Triage is the work.**
- **`RemoteCastTransport.#execute` (74 LOC FAIL):** breaking this up sounds appealing until you read it. It is a linear request-build → race-with-timeout → branch-on-result pipeline. Extract Method `#interpretResponse` chops the `if (timeout) / if (network) / if (response.status === 202) / ...` chain into a function that requires passing five callbacks back to the host — the seams add coupling. Keep flat.
- **`ForgeImprinter.imprint` and `CastDispatcher.dispatch` are sibling shapes by design.** They both: validate prerequisites → generate id → write log → notify → close modal → invoke caster → wire callbacks. If we Extract-Method-decompose them independently we lose the visual symmetry that makes a refine of one trivially portable to the other. The plan keeps both flat.
- **`VaultRefreshCoordinator` "5 reasons to change" claim is misleading.** The five concerns are five **phases of one debouncer/poller lifecycle** that share state (`#lastStat`, `#disposed`, timer handles). Extract Class along those axes leaves a coordinator that does nothing but delegate, plus five classes that re-import each other's state. Net negative.
- **`SpellOverrideStore` console.error + early-return on validation failure is dishonest.** The audit calls this Swallowed Command. The caller (`OptionsPanel`) can't distinguish "stored" from "rejected", but in practice every override comes through a UI form that already validates the model exists. The current behavior is "defensive against developer error, silent in production where the UI is correct". A typed-error throw would force every call site to add a `try/catch` that does nothing. Keep — but add an inline `// why` comment.
- **`hydrate` does unchecked structural cast.** Real, but the only data flowing in is what we previously wrote ourselves. The validation cost is real (~20 LOC for a small zod-like check or ~5 LOC of hand-rolled). For a single-user local-disk format under our own control, this is paranoid. Keep, add a `// why` comment about the trust boundary.
- **Riskiest assumption in the audit's recommendations:** that branding `CastId`/`AbsolutePath`/`PluginRelPath`/`VaultRelPath` will catch real bugs. These types only differ by what's-in-the-name today; nobody is currently passing a `castId` where a `spellPath` is expected (the surrounding parameter list would scream). Adding 6+ branded types is signaling not safety.

### User advocate (consumer of the resulting code)

> _How does this code feel to read, modify, integrate with?_

- A future contributor reading `domain/settings/persistence.ts` and seeing `import { App } from 'obsidian'` is misled into thinking domain is a place where Obsidian APIs are normal. Fix.
- A contributor wanting to add a third origin (besides forge/refine) hits the magic-string sentinels in three places. Fix the location (move to `domain/spells/`); a future plan can re-shape to a discriminated union.
- A contributor stepping through `CommandPopup` to add a fourth detail panel scrolls past 9 methods to find `#enterDetail`. Carving out `DetailPanelRouter` makes the entry obvious.
- A contributor reading `CastLogModule.initStartupMaintenance` and seeing four nearly-identical try/catch blocks ("HookMaterializer (remote) failed", "ForgeMaterializer failed", "RefineMaterializer failed", "sweeper.sweep().catch(console.error)") has to read each block to confirm they really are the same shape. Extract `runOrLog(label, task)` once.
- **However:** breaking up `RemoteCastTransport.#execute` makes it _harder_ to read — the linear flow becomes a method dispatch table. Trust the user's intuition here.

### Consensus

- **All four lenses agree on:** fix the dependency-cruiser config; purify `domain/`; relocate the two spell-path constants; port-and-adapter the `CastLogWriter` consumers; brand `ModelId`; carve `DetailPanelRouter` out of `CommandPopup`; extract per-subsystem methods in `initStartupMaintenance`.
- **Tensions resolved in favor of the skeptic:**
  - Long-method violations on linear pipelines (`#execute`, `imprint`, `dispatch`, `#readFromFile`) → keep flat. Long is not a smell when the body is sequential and reads top-to-bottom.
  - `VaultRefreshCoordinator` god-class claim → reject. Phases share state.
  - PO pass beyond `ModelId` → defer. Diminishing returns past the first brand.
  - `ForgeImprinter` Strategy pattern for local/remote → reject. One flag, two branches, stable.

### Critical concerns

- **Integration test coverage must remain green throughout.** Boundary moves (especially `spellScanner` → `infra/`, `fuzzyFilter` → `infra/`, `hydrate` → `infra/`) cross module boundaries that the integration suite exercises end-to-end. Every move ends with `npm run test:integration` passing.
- **The fitness tool fix must land first.** If we drain the violations without restoring CI enforcement, regressions land silently in the next iteration.
- **The `ModelId` brand pass touches ~10 files mechanically.** Land it as one cohesive todo, not piecemeal, to avoid a half-branded state that the compiler can't reason about.

---

## Proposed solution

Six logical sections, in dependency order:

1. **Fitness tool restoration** (1 file) — fixes `.dependency-cruiser.cjs` and adds `npm run arch:check` to the pre-commit chain.
2. **Spell-path-sentinel relocation** (3 files touched directly + 3 consumers re-import) — moves `FORGE_SPELL_PATH` / `REFINE_SPELL_PATH` from `castLog/types.ts` to a new `domain/spells/SystemSpellPaths.ts`. Closes three boundary violations.
3. **Domain purity** (5 files moved/inverted) — relocates `persistence.ts`, `computeVaultMountDefault.ts`, `spellScanner.ts` to `infra/`; replaces `fuzzyFilter.ts` with a pure `rankSpells` port + `infra/obsidianRanker.ts`; defines `SaveScheduler` port in domain, adapts `DebouncedSaver` from `main/`.
4. **CastLog port-and-adapter** (2 ports, 2 consumer rewires) — defines `CastEventSink` in `forge/` (used by `ForgeImprinter`) and `CastResultRecorder` in `cast/` (used by `CastDispatcher`); `main/PopupModule` wires the existing `CastLogWriter` instance to both ports.
5. **`ModelId` branded type pass** — adds the brand to `domain/settings/Settings.ts`; propagates through `CastInput`, `CastDispatchInput`, `CastedEvent`, `OptionsFormSnapshot`, `OptionsSessionEntry`, `SpellOverride`, `ResolvedSpellOptions`, `EffortRow`, `ModelSelect`.
6. **God-class breakups (targeted)** — (a) extract `DetailPanelRouter` from `CommandPopup`; delete `refineCastActionForWiring` dead getter; collapse `suspendKb` flag; replace `phase.kind` with polymorphic `disablesTabBar()`; unify `SpellOptionsDetail` + `RefineOptionsDetail` into a single `OptionsDetail`; tighten `resolveSpellOptions` to a narrower input (kills 12-field stub × 3). (b) extract subsystem methods from `CastLogModule.initStartupMaintenance` with a shared `runOrLog(label, task)` helper.

---

## Components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `domain/spells/SystemSpellPaths.ts` (new) | domain | Owns the two sentinel constants `FORGE_SPELL_PATH`, `REFINE_SPELL_PATH`. Pure module, no imports. |
| `domain/settings/SaveScheduler.ts` (new) | domain | Port: `{ schedule(): void; flush?(): Promise<void> }`. Replaces `DebouncedSaver` import in `SpellOverrideStore`. |
| `domain/spells/RankSpells.ts` (new) | domain | Port: `(query: string, spells: readonly Spell[]) => Spell[]`. Replaces the Obsidian fuzzy-search import. |
| `infra/settingsPersistence.ts` (moved from `domain/settings/persistence.ts`) | infra | Holds `hydrate(saved, app)`. |
| `infra/computeVaultMountDefault.ts` (moved from `domain/settings/`) | infra | Platform detection. |
| `infra/spellScanner.ts` (moved from `domain/spells/`) | infra | Vault scan + parse via `app.vault.getMarkdownFiles()` + frontmatter. |
| `infra/obsidianRanker.ts` (replaces `domain/spells/fuzzyFilter.ts`) | infra | Implements `RankSpells` via Obsidian's `prepareFuzzySearch` + `sortSearchResults`. |
| `forge/CastEventSink.ts` (new port) | forge | `{ recordCasted, recordError }` — only the two methods `ForgeImprinter` calls. |
| `cast/CastResultRecorder.ts` (new port) | cast | `{ recordCasted, recordError }` — only the two methods `CastDispatcher` calls. |
| `domain/settings/ModelId.ts` (new) | domain | `type ModelId = string & { readonly __brand: 'ModelId' }` + `modelId(s: string): ModelId`. |
| `ui/popup/DetailPanelRouter.ts` (new) | ui | Owns the three `#renderXxxDetail` methods; `CommandPopup` delegates. |
| `ui/components/OptionsDetail.ts` (new) | ui | Unifies `SpellOptionsDetail` + `RefineOptionsDetail` parameterized by an `OptionsDetailKind`. |
| `main/StartupMaintenance.ts` (new) | main | Holds `initStartupMaintenance` with `runOrLog(label, task)`; `CastLogModule` delegates. |

---

## Interfaces

```typescript
// domain/settings/SaveScheduler.ts
export interface SaveScheduler {
  schedule(): void;
  flush?(): Promise<void>;
}

// domain/spells/RankSpells.ts
import type { Spell, Sentinel } from './Spell';
export type RankSpells = (
  spells: readonly Spell[],
  sentinels: readonly Sentinel[],
  query: string,
) => (Spell | Sentinel)[];

// domain/spells/SystemSpellPaths.ts
export const FORGE_SPELL_PATH = '<forge>' as const;
export const REFINE_SPELL_PATH = '<refine>' as const;

// forge/CastEventSink.ts
import type { RecordCastedInput, RecordErrorInput } from '../castLog/CastLogWriter';
export interface CastEventSink {
  recordCasted(input: RecordCastedInput): Promise<void>;
  recordError(input: RecordErrorInput): Promise<void>;
}

// cast/CastResultRecorder.ts
import type { RecordCastedInput, RecordErrorInput } from '../castLog/CastLogWriter';
export interface CastResultRecorder {
  recordCasted(input: RecordCastedInput): Promise<void>;
  recordError(input: RecordErrorInput): Promise<void>;
}
// NOTE: structurally identical to CastEventSink. They live in different
// modules and are nominally distinct *because* the audit rule is "forge/
// owns its port; cast/ owns its port". A consumer can satisfy both with
// the same CastLogWriter instance.

// domain/settings/ModelId.ts
export type ModelId = string & { readonly __brand: 'ModelId' };
export function modelId(value: string): ModelId { return value as ModelId; }
```

---

## Data flow

- **Domain purity:** `main.ts` (composition root) calls `infra/settingsPersistence.hydrate(saved, app)` once at startup → passes the resulting `GrimoireData` to domain. Domain has no path back to `obsidian`. `SpellOverrideStore` receives a `SaveScheduler` (constructed in `main/` as a `DebouncedSaver` adapter); the store never imports `infra/`.
- **Spell ranking:** `SpellsPanel` receives a `RankSpells` function injected from `main/` (today implemented by `infra/obsidianRanker`); domain only sees the function type.
- **Cast event recording:** `PopupModule` constructs `ForgeImprinter` with a `CastEventSink`-shaped argument (`() => this.#castLog.activeLogStore()`), and constructs `CastDispatcher` with a `CastResultRecorder`-shaped argument. The single `CastLogStore` instance satisfies both ports. Neither `forge/` nor `cast/` imports from `castLog/`.
- **ModelId:** `Settings.defaultModel: ModelId`, `SpellOverride.model: ModelId`, `CastInput.modelId: ModelId`, `CastDispatchInput.model: ModelId`, `CastedEvent.model: ModelId`, etc. Construction sites are: (a) `DEFAULT_SETTINGS` literal (cast once at module top), (b) `SUPPORTED_MODELS` (cast once at module top), (c) form/UI inputs (cast at parse via `modelId(raw)`), (d) settings hydrate (cast at the trust boundary).

---

## Error handling

- Boundary moves preserve existing error semantics — no swallow → throw promotion in this plan. Swallowed-exception audit items are deferred (most are intentionally swallowed; surfacing them is a UX decision the user has not requested).
- Adding a new error path is out of scope. `SpellOverrideStore.set` keeps its `console.error + return void` behavior with a `// why` comment explaining the silent-rejection contract (UI pre-validates; this is defense-in-depth, not the primary check).
- The fitness-tool restoration sets `npm run arch:check` to **fail on cycles and on disallowed cross-module imports**, restoring CI enforcement.

---

## Technical notes

- **dependency-cruiser config:** the current `.dependency-cruiser.cjs` `extends: "eslint-plugin-import/flat/recommended"` is wrong — that's an ESLint extend, not a depcruise extend. depcruise's `extends` consumes another depcruise config (or one of its bundled presets like `dependency-cruiser/configs/recommended-strict`). Section A's first todo replaces it with hand-rolled `forbidden` rules per the allowed-rule-set table in `docs/design-audits/002-full-architecture.partial.md` (lines 26–32). depcruise v16 supports the `forbidden: [{ name, severity, from, to }]` shape — verified against the installed version in `package.json` (`"dependency-cruiser": "^16.2.1"`).
- **Why we split the `CastLogWriter` consumers into _two_ ports rather than one shared `CastEventSink`:** the audit's rule is "forge → domain only" and "cast → domain, execution, infra". Sharing a single port would force one module to depend on the other (or hoist it to `domain/`, where it doesn't belong because `RecordCastedInput` is a castLog-shaped event). Two structurally-identical ports in two modules is a deliberate small cost for clean direction.
- **Pattern: Port-and-Adapter (Hexagonal) — accepted for items #3, #4, #5.** Step 1 check: dependency direction is the problem; the solution is invert via an interface owned by the depender. Step 3 self-critique: each port has at least one real consumer; the adapter is a non-trivial wiring decision (the saver port for `SpellOverrideStore`, the ranker port, the cast-event ports). Pass.
- **Pattern: State Machine for `CommandPopup` phases — rejected.** Step 1 check: phases exist (`SearchPhase`, `DetailPhase`) but the audit's "Half-Applied State" critique would push us to make phases own their entire host state. Step 3 self-critique: the alternative (two phases that mutate the host through a context bag) works today and the test integration spec pins it; full State pattern requires passing `CommandPopup` state ownership to the phase, which is a bigger redesign than the audit's scope. Defer.
- **Pattern: Strategy for `ForgeImprinter` local/remote — rejected.** Step 1 check: one flag, two branches. Step 3 self-critique: no new strategies on the horizon (the third execution mode would have its own dispatcher, not a third forge variant). Inline + comment beats two new classes.
- **Pattern: Discriminated Union for `CastOrigin` (replace sentinel strings) — rejected for this iteration.** Step 1 check: type-code-via-string is real, and a discriminated union is the textbook fix. Step 3 self-critique: the refactor touches `CastedEvent`, `CastRecord`, `displayName`, `foldEvents`, `ForgeImprinter`, `refineCastSpell`, plus call sites and serialization format. It's a separate larger refactor; the boundary-fix half (move the constants out of `castLog/types`) is independent and that's what we ship now. Defer the shape change to a follow-up plan.
- **Pattern: Value Objects for paths (`AbsolutePath`, `PluginRelPath`, `VaultRelPath`) — rejected.** Step 1 check: paths-as-strings is real PO. Step 3 self-critique: no bug-class history of swapping path variants; the byte-identical `PluginPaths.forgeSpellPathPluginRel` / `forgeSpellPathVaultRel` is a documentation issue (one of them is wrong) not a typing issue. We add a TODO in `PluginPaths` to investigate which of the two is correct; we don't introduce three branded types.
- **The `dispatcher` binding mutation in `CommandPopupBuilder`** (`build()` reads/writes the outer `dispatcher` var) is mentioned in the audit as a smell. Inspected: it's a closed-over `let dispatcher` that gets set inside the builder. Real but trivially refactorable later; left alone in this plan.
- The `OptionsDetail` unification (item #6) is on the critical path because it kills the 12-field-stub × 3 duplication that the audit calls out as Shotgun Surgery. The stub duplication is itself a symptom of `resolveSpellOptions` taking the full `GrimoireSettings`; tightening the parameter to `{ defaultModel, defaultEffort }` is a prerequisite for the unification, so it's done in the same section.

---

## Todos

Total: **34 todos** across 6 sections. Sized for incremental landing. Each section ends with `npm run lint && npm test && npm run test:integration && npm run arch:check` green.

### A. Fitness tool restoration

#### Section briefing

**What this section produces:** a working `.dependency-cruiser.cjs` with hand-rolled `forbidden` rules encoding the allowed-rule-set from `docs/design-audits/002-full-architecture.partial.md` lines 26–32, plus an `arch:check` invocation that fails the build on any current boundary violation. After this section, `npm run arch:check` is red because the boundary violations from sections B–D still exist — that is the goal: the tool now sees them. Sections B–D drive `arch:check` back to green.

**Design context the executor needs upfront:** the bad config today is `extends: "eslint-plugin-import/flat/recommended"` — that's an ESLint preset, not a depcruise preset. depcruise v16's `extends` either references another depcruise config or one of `dependency-cruiser/configs/recommended-*`. We use hand-rolled rules (no `extends`) to encode the allowed-rule-set directly, because the project rules are project-specific.

**Cross-section couplings:** A1 produces a tool that B–D drive to green. A2 is the gate that B–D must satisfy before their respective commits land. None of A1/A2 depend on later sections, but later sections cannot commit without A1's tool being functional.

**Section-level Red criterion:** `npm run arch:check` runs without an "ERROR: Can't resolve" failure, exits non-zero, and prints the existing violations (`domain → obsidian` ×4, `domain → infra` ×1, `forge → castLog` ×2, `refine → castLog` ×1, `cast → castLog` ×1) named per the `forbidden` rule names.

**junior-dev**
- [ ] A1: rewrite `.dependency-cruiser.cjs` — replace the broken `extends` with hand-rolled `forbidden` rules. Encode allowed-from→to per the recap table. Each rule has a `name` (e.g. `domain-is-pure`, `forge-no-castlog`, `cast-no-castlog`, `refine-no-castlog`) and an `error` severity. Verify with `npx depcruise src --config .dependency-cruiser.cjs --output-type err` exits non-zero and prints expected violations. — M, junior-dev
- [ ] A2: add `npm run arch:check` to `.claude/lint-cmd` (so it runs in the pre-commit hook). Verify pre-commit fires arch:check by attempting a no-op commit while violations still exist (commit must be rejected). — S, junior-dev

### B. Spell-path-sentinel relocation

#### Section briefing

**What this section produces:** a new `src/domain/spells/SystemSpellPaths.ts` exporting `FORGE_SPELL_PATH` and `REFINE_SPELL_PATH`; the old declarations in `src/castLog/types.ts` are deleted; every importer is updated. Affects: `src/forge/ForgeImprinter.ts`, `src/refine/refineCastSpell.ts`, `src/castLog/format/displayName.ts`, and `src/ui/components/CastLogRow.ts` (the audit mentions the UI consumes them too).

**Design context the executor needs upfront:** these constants are domain identifiers ("the sentinel for casts originating in the Forge") not castLog-specific values. They were parked in `castLog/types.ts` because that's where the events that carry them live; relocating closes Violations C (forge→castLog spell-path import), D (refine→castLog), and removes one cross-module import from the UI. The literal string values must not change — they appear in serialized cast-log entries on disk.

**Cross-section couplings:** B1 is a prerequisite for any forge/refine grep that A2 will check; B2/B3/B4 must all reference the new location or the build breaks. None of section A depends on B, but B closes architecture violations that A2 will report.

**Section-level Red criterion:** `grep -r "FORGE_SPELL_PATH\|REFINE_SPELL_PATH" src/castLog/types.ts` returns nothing. `npm run arch:check` no longer reports `forge → castLog` for `FORGE_SPELL_PATH` or `refine → castLog`. All tests stay green. The literal values `'<forge>'` and `'<refine>'` are unchanged.

**junior-dev**
- [ ] B1: create `src/domain/spells/SystemSpellPaths.ts` with the two `as const` constants (same values, same names). No other exports. — S, junior-dev
- [ ] B2: re-point `src/forge/ForgeImprinter.ts:2` import to `domain/spells/SystemSpellPaths`. Run unit + integration tests. — S, junior-dev
- [ ] B3: re-point `src/refine/refineCastSpell.ts:2` import. — S, junior-dev
- [ ] B4: re-point `src/castLog/format/displayName.ts` and `src/ui/components/CastLogRow.ts` imports (grep `FORGE_SPELL_PATH\|REFINE_SPELL_PATH` to find all remaining consumers); delete the declarations from `src/castLog/types.ts`. Run `npm run arch:check` — the relevant boundary violations should drop. — M, junior-dev

### C. Domain purity

#### Section briefing

**What this section produces:** `src/domain/` no longer imports from `obsidian` or `src/infra/`. Achieved by: (1) defining two new pure ports in domain (`SaveScheduler`, `RankSpells`); (2) moving three files out of `domain/` to `infra/` (`persistence.ts`, `computeVaultMountDefault.ts`, `spellScanner.ts`); (3) replacing `domain/spells/fuzzyFilter.ts` with an `infra/obsidianRanker.ts` adapter; (4) rewiring `SpellOverrideStore` to take a `SaveScheduler` instead of constructing a `DebouncedSaver`; (5) updating `main/` composition to thread the moved functions and ports.

**Design context the executor needs upfront:** the violations are listed verbatim in `docs/design-audits/002-full-architecture.partial.md` lines 33–44. Key design decision: domain stays primitive-and-port; the platform-specific implementations live in `infra/`; `main/` wires them. For `SpellOverrideStore`: replace `import { DebouncedSaver }` with `import { SaveScheduler }` from a new sibling file in `domain/settings/`; the store calls `saver.schedule()` exactly as today (the existing `DebouncedSaver` already exposes a `schedule()` method, so it satisfies the port structurally — no adapter shim needed). For `fuzzyFilter`: replace the function with a typed port; consumer (`SpellsPanel`) receives the function via injection from `main/`. Today `SpellsPanel` calls `fuzzyFilter` directly — it must be updated to accept a `rankSpells` dep through its constructor or panel construction.

**Cross-section couplings:** C1–C6 are pre-requisites for `arch:check` going green on the `domain → infra` and `domain → obsidian` boundary violations. C5's `SpellsPanel` change touches code that the UI integration tests cover (`spell-cast.spec.ts`, `options-panel-popup.spec.ts`) — those tests will need the harness updated to supply a fake `rankSpells`. C7 is the verification step that links to A's tool. No coupling to D/E/F.

**Section-level Red criterion:** `npm run arch:check` reports zero `domain → *` violations. `domain/` directory grep for `from 'obsidian'` or `from '../../infra/'` returns nothing. Integration tests pass with the harness wiring the moved adapters.

**junior-dev**
- [ ] C1: create `src/domain/settings/SaveScheduler.ts` — port interface `{ schedule(): void; flush?(): Promise<void> }`. JSDoc names the contract. — S, junior-dev
- [ ] C2: edit `src/domain/settings/SpellOverrideStore.ts` — replace `DebouncedSaver` import with `SaveScheduler`; the field type changes; the constructor signature stays the same (test sites pass a real `DebouncedSaver` which satisfies the port). Verify unit tests pass. — S, junior-dev
- [ ] C3: move `src/domain/settings/persistence.ts` → `src/infra/settingsPersistence.ts`. Update all importers (grep `from .*settings/persistence`). Verify tests pass. — S, junior-dev
- [ ] C4: move `src/domain/settings/computeVaultMountDefault.ts` → `src/infra/computeVaultMountDefault.ts`. Update importers (the only one is `infra/settingsPersistence` after C3). — S, junior-dev
- [ ] C5: move `src/domain/spells/spellScanner.ts` → `src/infra/spellScanner.ts`. Update importers (grep `from .*spells/spellScanner`). Verify integration tests pass. — S, junior-dev

**senior-dev**
- [ ] C6: replace `src/domain/spells/fuzzyFilter.ts` with a pure-domain port. Steps: (a) create `src/domain/spells/RankSpells.ts` exporting the `RankSpells` function type; (b) create `src/infra/obsidianRanker.ts` implementing it via Obsidian's `prepareFuzzySearch` + `sortSearchResults` (move the existing 18-line body verbatim); (c) delete `src/domain/spells/fuzzyFilter.ts`; (d) update `src/ui/tabs/SpellsPanel.ts` and any other importers to receive `rankSpells: RankSpells` via constructor / panel-deps injection; (e) wire from `main/PopupModule` (constructs `obsidianRanker` and passes it in). Update integration test harness to supply the ranker. The "senior" judgment here: deciding the SpellsPanel constructor change and updating the test harness wiring. — L, senior-dev
- [ ] C7: run `npm run arch:check` — verify zero `domain → *` violations. — S, junior-dev

### D. CastLog port-and-adapter

#### Section briefing

**What this section produces:** `src/forge/CastEventSink.ts` and `src/cast/CastResultRecorder.ts` — two port interfaces (structurally identical, intentionally separate per the boundary rules — see Technical notes). `ForgeImprinter` and `CastDispatcher` import only their own port; the `CastLogWriter`-typed factory dep changes type but stays a callable returning the same instance. `main/PopupModule` is the wiring node; the `CastLogStore` instance returned by `castLog.activeLogStore()` satisfies both ports structurally.

**Design context the executor needs upfront:** see Technical notes for why two ports rather than one. The audit specifies these moves in `docs/design-audits/002-full-architecture.partial.md` Violations C and E. The ports list only `recordCasted` and `recordError` — the two methods the consumers actually call. `CastLogWriter.readAll()` and any other methods stay on `CastLogWriter` and are not exposed via either port. Critically: do not relocate `RecordCastedInput` / `RecordErrorInput` — they stay where they live (`castLog/CastLogWriter.ts`) and the new port files import the types from there. That is allowed (forge → domain, but here forge imports from castLog _types_ via the port file). Wait — the rule is strict: forge → domain only. So we cannot have `forge/CastEventSink.ts` importing from `castLog/`. The types must move too, or be re-declared in the port file.

**Decision:** declare `RecordCastedInput` and `RecordErrorInput` inline in each port file (they are part of the port contract). Today they live in `castLog/CastLogWriter.ts`; after this section they also exist as part of the port type. `CastLogStore.recordCasted` and `.recordError` are typed against `castLog/CastLogWriter`'s shape; the port shape and the implementation shape happen to align. If they ever diverge, the adapter in `main/` must bridge them — but today the shapes are identical, so no adapter code is required.

**Cross-section couplings:** D depends on B being merged (the constants `FORGE_SPELL_PATH` / `REFINE_SPELL_PATH` must be imported from `domain/spells/` by the time `ForgeImprinter` is touched again, otherwise we re-introduce a boundary violation). D's verification (D5) drives `arch:check` to fully green for the `forge → castLog` and `cast → castLog` rules.

**Section-level Red criterion:** `grep "from '../castLog" src/forge/ src/cast/ -r` returns nothing. `npm run arch:check` reports zero `forge → castLog` and zero `cast → castLog` violations. All tests stay green; the `PopupModule.register` integration test still observes a cast → log path end-to-end.

**junior-dev**
- [ ] D1: create `src/forge/CastEventSink.ts` — port interface + inline `RecordCastedInput` / `RecordErrorInput` shape (copy verbatim from `castLog/CastLogWriter.ts`). JSDoc explaining the port-and-adapter pattern. — S, junior-dev
- [ ] D2: edit `src/forge/ForgeImprinter.ts` — replace `import type { CastLogWriter }` with `import type { CastEventSink }`; field type and constructor dep type change correspondingly. The factory dep stays `() => CastEventSink`. — S, junior-dev
- [ ] D3: create `src/cast/CastResultRecorder.ts` (same shape as D1). — S, junior-dev
- [ ] D4: edit `src/cast/CastDispatcher.ts` — replace `import type { CastLogWriter }` with `import type { CastResultRecorder }`; field type and constructor dep type change. — S, junior-dev

**senior-dev**
- [ ] D5: rewire `src/main/PopupModule.ts` — the two factory callbacks (`logWriter: () => this.#castLog.activeLogStore()`) are unchanged in body but the type annotations on `ForgeImprinterDeps.logWriter` and `CastDispatcherDeps.logWriter` are now the new port types. Verify `CastLogStore` satisfies both ports structurally (TypeScript will tell us). Update the integration-test harness wiring if it constructs imprinter/dispatcher directly (grep `new ForgeImprinter\|new CastDispatcher` under `tests/`). Run `npm run arch:check` — verify zero `forge → castLog` and `cast → castLog` violations. The "senior" judgment: handling any structural mismatch between `CastLogStore`'s method shape and the port shape. — M, senior-dev

### E. ModelId branded type pass

#### Section briefing

**What this section produces:** a new `src/domain/settings/ModelId.ts` exporting `type ModelId = string & { __brand: 'ModelId' }` and a `modelId(s: string): ModelId` constructor. Eight fields across the call graph are re-typed from `string` to `ModelId`: `GrimoireSettings.defaultModel`, `SpellOverride.model`, `SpellSessionEntry.model`, `ResolvedSpellOptions.model`, `SupportedModel.id`, `CastInput.modelId`, `CastDispatchInput.model`, `ForgeFormSnapshot.model`, `OptionsFormSnapshot.model`, `OptionsSessionEntry.model`, `CastedEvent.model`. Construction sites are minimized to four: the `DEFAULT_SETTINGS` literal cast, the `SUPPORTED_MODELS` literal cast, the `hydrate` boundary cast, and the form snapshot constructor.

**Design context the executor needs upfront:** the brand pattern is identical to the existing `SpellPath` brand (`src/domain/spells/SpellPath.ts`) — a string intersected with a `__brand: 'ModelId'` phantom property, with a constructor function. This is the only PO win in this plan (see Considered & Rejected for why `CastId`, `AbsolutePath`, etc. are skipped). Land as one cohesive todo (E2) — half-branded state confuses the compiler with `Type 'string' is not assignable to type 'ModelId'` everywhere.

**Cross-section couplings:** E depends on no other section. E does not affect `arch:check` output. E touches files that B/C/D have also touched, so order matters: land E after D to avoid merge conflicts. E2's UI changes interact with the integration test harness — the existing harness today passes `model: 'claude-sonnet-4-5'` (a string literal) in form snapshots; those literals stay (TypeScript will widen them via the constructor at the harness seam, which becomes one place where `modelId('claude-sonnet-4-5')` is called).

**Section-level Red criterion:** `tsc -noEmit` is clean. `grep "model: string" src/` returns only places where the field is genuinely a non-ModelId string (e.g. a raw form-input value before parsing). The integration test harness type-checks. No runtime behavior change — the brand is erased at runtime.

**junior-dev**
- [ ] E1: create `src/domain/settings/ModelId.ts` — `type ModelId` + `modelId(value: string): ModelId` constructor. JSDoc cross-references `SpellPath` as the sibling pattern. — S, junior-dev

**senior-dev**
- [ ] E2: thread `ModelId` through the listed fields. Order: domain first (Settings.ts → SpellOverride → SpellSessionEntry → ResolvedSpellOptions → SupportedModel.id), then execution (`CastInput.modelId`), then cast/forge/refine (`CastDispatchInput.model`, `ForgeFormSnapshot.model`), then castLog (`CastedEvent.model`, `RecordCastedInput.model`), then UI (`OptionsFormSnapshot.model`, `OptionsSessionEntry.model`, `EffortRow` props, `ModelSelect` props). Construction points: `DEFAULT_SETTINGS` literal (cast via `as ModelId` or `modelId(...)`), `SUPPORTED_MODELS` literal (per entry), `hydrate` boundary (cast the merged `defaultModel`), form snapshot builders (cast the model from form/store). Run `npm test`, `npm run test:integration`, `tsc -noEmit`. The "senior" judgment: deciding where to call the constructor vs. cast directly (rule of thumb: at trust boundaries call the constructor; inside the system the type flows). — L, senior-dev
- [ ] E3: edit integration test harness (`tests/integration/`) to wrap model string literals via `modelId(...)` at the seam (single helper or per-test). Confirm `tsc -noEmit` clean. — S, junior-dev

### F. God-class breakups (targeted)

#### Section briefing

**What this section produces:** two structural breakups, plus the surgical fixes co-located with each.

(F.1) `CommandPopup` extraction: a new `src/ui/popup/DetailPanelRouter.ts` owning the three `#renderXxxDetail` methods (Forge sentinel, Spell options, Refine options) and the `#enterDetail` helper. `CommandPopup` retains phase/search/tab/lifecycle logic and delegates "show detail X" to the router. Co-located surgical fixes: delete the `refineCastActionForWiring` dead getter; delete the `suspendKb` flag (always suspend); add `disablesTabBar(): boolean` to `PopupPhase` and replace the `phase.kind === 'detail'` check in `#createTabBar`; unify `SpellOptionsDetail` + `RefineOptionsDetail` into a single `OptionsDetail` parameterized by an `OptionsDetailKind = 'spell' | 'refine'` value object; tighten `resolveSpellOptions` parameter from `GrimoireSettings` to `{ defaultModel: ModelId; defaultEffort: Effort | null }` (kills the 12-field-stub × 3 duplication).

(F.2) `CastLogModule.initStartupMaintenance` extraction: a new `src/main/StartupMaintenance.ts` (or inline private methods on `CastLogModule` if the extraction-to-new-class feels heavy — junior-dev judgment) with `runRemoteHookMaterializer`, `runForgeMaterializer`, `runRefineMaterializer`, `runScratchSweeper`, and a shared `runOrLog(label: string, task: () => Promise<void>): Promise<void>` helper that does the try/catch/console.error. The 45-LOC method becomes a four-line sequence of `await runOrLog(...)`. Drop forge-materializer construction duplication via `#buildForgeMaterializer()`.

**Design context the executor needs upfront:** the boundaries of `DetailPanelRouter` are: it does NOT take ownership of `CommandPopup`'s phase state; it receives a `PopupPhaseContext`-shaped subset and the three callbacks (`imprintAction`, `castAction`, `refineCastAction`). The router's `renderForge`, `renderSpellOptions`, `renderRefineOptions` methods each: reattach the tab bar, construct the detail panel, call `#enterDetail`. This is genuinely a router, not a state machine. Per Technical notes: the State pattern (phases owning host state) is rejected for this iteration. The `OptionsDetail` unification works because the only meaningful differences between `SpellOptionsDetail` and `RefineOptionsDetail` are: (a) spell vs. refine sentinel path, (b) `executeOnNote` source (form-default for refine, `spell.executeOnNote` for spell), (c) `showExecuteOnNote` flag passed into `OptionsPanel`. An `OptionsDetailKind` discriminated union (`{ kind: 'spell'; spell: Spell }` vs `{ kind: 'refine' }`) captures all three. The tightening of `resolveSpellOptions` is what makes the unification cheap — without it, both classes would still need to fabricate a settings stub.

**Cross-section couplings:** F1 (CommandPopup) depends on E being merged (the `OptionsFormSnapshot.model` field is `ModelId` after E). F2 (CastLogModule) depends on C being merged (the `getSettings` port still points at the moved settings types). The integration test suite covers all three detail-panel entries (`forge-cast.spec.ts`, `spell-cast.spec.ts`, `options-panel-popup.spec.ts`, `forge-sentinel-detail.spec.ts`); F1's extraction must not break any of them. The `OptionsDetail` unification will require touching the integration spec that constructs `SpellOptionsDetail` and/or `RefineOptionsDetail` directly (grep `tests/integration` for both class names) — see F12.

**Section-level Red criterion:** `src/ui/CommandPopup.ts` file size drops below 300 LOC (currently 343). `CommandPopup` no longer has `#renderForgeSentinelDetail`, `#renderOptionsPanel`, `#renderRefineOptionsPanel`, `#enterDetail`, `refineCastActionForWiring`. `src/ui/components/SpellOptionsDetail.ts` and `src/ui/components/RefineOptionsDetail.ts` are deleted; replaced by `src/ui/components/OptionsDetail.ts`. `CastLogModule.initStartupMaintenance` body is ≤ 10 LOC. All unit + integration tests pass.

**ui-integration-tester**
- [ ] F0: write/extend integration test `tests/integration/detail-panel-router.spec.ts` (or augment the existing detail-related specs) pinning: (a) the popup → spell row → ArrowRight → spell-options panel path still mounts the options panel, fires `castAction` on Cast, and routes back to search on Back; (b) the popup → refine sentinel → refine-options panel path still mounts, fires `refineCastAction` on Cast, routes back; (c) the popup → Forge sentinel → forge form path still mounts, fires `imprintAction` on Submit, routes back. These tests pre-exist for the most part — this todo's job is to **verify they still pass against a router-extracted CommandPopup** by re-running them with the harness updated to whatever new construction shape the extracted router needs. The test author marks any test that needs harness changes; the seam contract is documented before F1 lands. — S, ui-integration-tester

**junior-dev**
- [ ] F1: delete `CommandPopup.refineCastActionForWiring` getter (lines 108–112). Confirm no usages (grep). The field `#refineCastAction` is consumed in `#createSpellsPanel` and `#renderRefineOptionsPanel` — the getter is pure dead code. — S, junior-dev
- [ ] F2: collapse `CommandPopup.#enterDetail` `suspendKb` flag — every production call site passes `{ suspendKb: true }`. Remove the param; always `this.#kb.suspend()`. Delete the JSDoc paragraph describing the false branch. — S, junior-dev
- [ ] F3: add `disablesTabBar(): boolean` to `src/ui/popup/PopupPhase.ts`; implement returning `false` in `SearchPhase`, `true` in `DetailPhase`. Replace `this.#currentPhase.kind === 'detail'` in `CommandPopup.#createTabBar` (line 205) with `this.#currentPhase.disablesTabBar()`. Delete the now-unused `kind` field from `PopupPhase` if no other consumers exist (grep). — S, junior-dev
- [ ] F4: tighten `resolveSpellOptions` signature — change the `settings: GrimoireSettings` field on `ResolveOptionsInput` to `settings: { defaultModel: ModelId; defaultEffort: Effort | null }`. Update the three call sites (`SpellOptionsDetail.#resolveOptions`, `RefineOptionsDetail.#resolveOptions`, `OptionsFormState.optionsFormSnapshotFromRefineDefaults`) to pass only `{ defaultModel, defaultEffort }`. Delete the 12-field empty-string stubs from all three. — M, junior-dev
- [ ] F5: edge case — verify `resolveSpellOptions` is not consumed anywhere else (grep). Re-run integration tests covering options resolution (`options-panel.spec.ts`, `options-panel-popup.spec.ts`, `spell-options-detail-execute-on-note.spec.ts`). — S, junior-dev

**senior-dev**
- [ ] F6: create `src/ui/components/OptionsDetail.ts` — unified component parameterized by `OptionsDetailKind = { kind: 'spell'; spell: Spell } | { kind: 'refine' }`. Render method takes a `params` object with: `contentEl`, `scope`, `app`, `overrides`, `sessionMap`, `formDefaults`, `models`, `onBack`, `onCast`, `onOverrideChanged`, `kind`. Internally branches on `kind.kind` for: (a) the spell-path source (`kind.spell.path` vs `REFINE_SPELL_PATH`), (b) the `executeOnNote` source (`kind.spell.executeOnNote` vs `formDefaults.executeOnNote`), (c) the `showExecuteOnNote` flag passed to `OptionsPanel` (true for spell, false for refine). Delete the two old files. — L, senior-dev
- [ ] F7: rewire `CommandPopup.#renderOptionsPanel(spell)` → uses `new OptionsDetail()` with `{ kind: 'spell', spell }`; `CommandPopup.#renderRefineOptionsPanel()` → `new OptionsDetail()` with `{ kind: 'refine' }`. — S, junior-dev
- [ ] F8: create `src/ui/popup/DetailPanelRouter.ts` — class with three public methods: `renderForge(contentEl, scope)`, `renderSpellOptions(contentEl, scope, spell)`, `renderRefineOptions(contentEl, scope)`. Constructor takes: `formDefaults`, `overrides`, `sessionMap`, `app`, `models`, `imprintAction`, `castAction`, `refineCastAction`, `onOverrideChanged: () => void`, `onEnterDetail: (detail: {destroy(): void}, onBack: () => void) => void`, `onExit: () => void`, `reattachTabBar: () => void`. Each method does: `reattachTabBar()` → construct detail → call `onEnterDetail` with destroy + back. — L, senior-dev
- [ ] F9: edit `CommandPopup` — delete `#renderForgeSentinelDetail`, `#renderOptionsPanel`, `#renderRefineOptionsPanel`. Replace with a `#detailRouter: DetailPanelRouter` field constructed in the constructor; the `panel.events.on(...)` handlers in `#createSpellsPanel` call `this.#detailRouter.renderXxx(...)` instead. Keep `#enterDetail` and `#exitDetail` on `CommandPopup` because they touch `this.#currentPhase` / `this.#kb` (host state); router delegates back via the `onEnterDetail` / `onExit` callbacks. Verify file LOC < 300. — M, senior-dev

**junior-dev**
- [ ] F10: extract `CastLogModule` startup methods. Add private methods to `CastLogModule`: `#runRemoteHookMaterializer()`, `#runForgeMaterializer()`, `#runRefineMaterializer()`, `#runScratchSweeper()`. Add `#runOrLog(label: string, task: () => Promise<void>): Promise<void>` that wraps `await task()` in `try/catch (e) { console.error(\`${label} failed\`, e); }`. `initStartupMaintenance()` body becomes: 4 sequential `await this.#runOrLog('HookMaterializer (remote)', () => this.#runRemoteHookMaterializer())` plus the fire-and-forget sweeper. — M, junior-dev
- [ ] F11: extract `CastLogModule.#buildForgeMaterializer(adapter)` — used by both `#runForgeMaterializer()` and `materializeForge()`. Verify both call sites produce identical construction. — S, junior-dev

**senior-dev**
- [ ] F12: update integration test harness — grep `tests/integration` for `SpellOptionsDetail|RefineOptionsDetail` and update construction to use `OptionsDetail` with the appropriate `kind`. Run full suite. — S, senior-dev

---

## Overall effort summary

- **Total todos:** 34
- **Effort breakdown:** S × 21, M × 9, L × 4
- **Tier breakdown:** ui-integration-tester × 1, junior-dev × 22, senior-dev × 11, lead-dev × 0
- **Dominant tier:** junior-dev (most work is mechanical relocation / re-importing / typing)

---

## Considered & Rejected

These audit items were deliberately not addressed in this plan. The skeptic's filter says they fail one of: (a) no concrete bug class prevented, (b) the abstraction adds more cognitive cost than the smell, (c) the code is genuinely linear and reads better flat, (d) only one implementation exists with no second on the horizon.

### Long-method violations on linear pipelines

- **`RemoteCastTransport.#execute` (74 LOC FAIL)** — linear: build request → race with timeout → branch on result. Extract Method chops a top-to-bottom flow into a dispatch table. Net: harder to read.
- **`ForgeImprinter.imprint` (60 LOC FAIL)** — deliberately symmetric with `CastDispatcher.dispatch`. Decomposing either independently destroys the symmetry that lets a developer port a fix from one to the other in seconds.
- **`CastDispatcher.dispatch` (54 LOC FAIL)** — same shape as `imprint`. Linear; keep.
- **`CommandPopupBuilder.build` (55 LOC FAIL)** — three nested arrow lambdas inline. The audit recommends Extract Method per lambda; doing so would require passing the builder's locals (`dispatcher`, `params.app`, etc.) into each method, producing 3 helper methods with 5+ parameters each. The original is clearer.
- **`CastLogStore.#readFromFile` (40 LOC, depth 3 FAIL)** — try/for/try is the natural shape of "read a file, parse line-by-line with malformed-line tolerance". Extract Method `#parseEventLine` is a single function with no other call site; inlining the helper is no worse than the audit's prescription.
- **`OptionsFormState.optionsFormSnapshotFromRefineDefaults` (38 LOC)** — collapses after F4 (`resolveSpellOptions` tightening). No separate todo.

### Wholesale Primitive Obsession beyond `ModelId`

- **`CastId` brand** — no bug-class history of swapping cast IDs with other strings. Cast IDs are constructed at exactly one site (`crypto.randomUUID()`) and never compared cross-type.
- **`AbsolutePath` / `VaultRelPath` / `PluginRelPath` brands** — the `PluginPaths` byte-identical method pair (`forgeSpellPathPluginRel` vs `forgeSpellPathVaultRel`) is a documentation problem, not a typing one. Add a TODO inside `PluginPaths` to investigate which of the two is wrong; do not introduce three branded types touching ~30 files.
- **`PortalEndpoint`, `BasicCredentials`, `LocalCastEnvironment` value objects** — Data Clumps that travel together but are constructed once in `createCaster` and destructured once in the caster. Value-object wrapping adds a type with no methods and a constructor call; no behavior moves with the data.
- **`PortNumber`, `HostName`, `FilesystemPath`, `CliCommand` value objects** — same logic. The setting values are user-edited strings; validation happens at form-submit time, not by type.

### God-class claims with shared state

- **`VaultRefreshCoordinator` (201 LOC, "5 axes of change")** — the five concerns (event subscription, baseline sample, settling window, polling fallback, debounce) are five **phases of one coordinated lifecycle**, sharing `#lastStat`, `#disposed`, and four timer-handle fields. Extract Class along those axes would leave five mutually-coupled tiny classes. Keep.
- **`PluginPaths` Extract Class breakup (`CastLogPaths`, `SpellPaths`, `AgentHooksPaths`)** — 38 LOC class, single cohesive responsibility ("where things live on disk relative to the plugin directory"). Splitting trades one cohesive class for three with the same `pluginDir` dependency.
- **`CastLogModule` (4 reasons to change)** — only the `initStartupMaintenance` axis is genuinely problematic (FAIL). F10/F11 address that. The other three axes (log store wiring, panel deps construction, forge re-materialization) each are 1–2 methods; not god-class evidence.

### Pattern impositions where one branch dominates

- **Strategy for `ForgeImprinter` local/remote** — one flag, two branches, no second strategy on the horizon.
- **Strategy / polymorphism for `displayName.ts` branches** — three branches (forge / refine / live), each formatter is one line; if/else if is shorter than a Strategy table.
- **Strategy for `foldEvents.updateRecordWithEvent`** — three stage branches; same logic.
- **Replace Type Code with Polymorphism for `EffortRow.update` "Case 1/2/3/4" comments** — extract methods inline if the executor wants, but a polymorphic hierarchy for 4 stable cases is overkill. (Audit's `// Case N:` comment cleanup is fine as part of normal change-radius cleanup; not its own task.)
- **Replace `CastOrigin` sentinel strings with discriminated union** — high-extensibility leverage but touches `CastedEvent`, `CastRecord`, `foldEvents`, `displayName`, `ForgeImprinter`, `refineCastSpell`, three UI components, **and the on-disk serialization format** of cast logs. Defer to a follow-up plan with a migration story.

### Documentation issues miscast as design smells

- **`hydrate` unchecked structural cast** — single-user local data we wrote ourselves; runtime validation is paranoid. Add a `// trust boundary` comment instead.
- **`SpellOverrideStore.set` "swallowed command"** — the UI pre-validates; this is defense-in-depth, not the primary check. Add a `// why` comment.
- **`spellOptionsResolver` "silent fallback" via `model || input.models[0]`** — happens only when settings reference a model no longer in `SUPPORTED_MODELS` (model deprecation). Falling back is the right UX. Add a `// why` comment.
- **Various Comments-Restating-Code in `EffortRow`** — not load-bearing, but cleaning them up is a 30-minute pass not worth its own plan section. Leave for next-time-you're-in-the-file cleanup.

### Speculative-generality claims that are actually load-bearing

- **`RefreshCoordinator` and `TickCoordinator` interfaces** — one production impl each, but tests substitute fakes. Interface earns its keep.
- **Optional-port shapes (`writeFile?`, `readFile?`) in castLog classes** — the discriminated-union refactor the audit suggests would push the complexity into the constructor with no test or runtime benefit. Today's non-null-assertion + `adapter` precondition is uglier but works.
- **`ForgeMaterializerPorts` triple injection shape** — borderline; if a quiet day appears, collapse to `{ adapter }` only. Not in this plan.

### Other rejected items

- **`forgeTemplate.ts` resource-as-code refactor** — moving the 45-line template literal to a `.md` resource requires loading via the bundler at startup (esbuild plugin) — complication exceeds benefit.
- **`TypedEmitter.off()` addition** — no observed listener leak; YAGNI.
- **`KeyboardController.bindTrap` LSP fix** — the asymmetry is documented; no incident history of forgetting trap bindings.
- **`mapPortalError` magic number 200** — Extract Constant `MAX_NOTICE_BODY_LENGTH = 200` is fine if the executor wants to do it inside another change; not its own task.
- **`LocalCaster.cast` duplicated-code arms** — both arms construct a flat object; the audit's "base + spread" prescription removes 7 lines of duplication at the cost of a base-object intermediate. Net wash.
- **`SpellOverrideStore.#clampEffort` non-null assertion** — load-bearing precondition documented by the caller-side guard in `set`. The audit's "tighten parameter type" suggestion is fine but cosmetic.
- **`spellScanner` "and" in docstring (SRP)** — after C5 the file moves to `infra/`; the function is a small pipeline (filter → map → sort). Linear, kept.
- **`HookMaterializer.#hooksDir` temporal coupling** — the field is set in `run()` before any `#writeScript()` call by the constructor contract. Replacing with a parameter pass-through is fine if the executor is already there, but not worth its own todo.
