# Audit 002 Rework

> `dev/done-020` — 2026-05-17 — Drains the high-leverage violations from design-audit 002: restores the architecture fitness tool, purifies `domain/`, breaks up two real god classes, and brands `ModelId` — while leaving long-but-linear code alone.

## What it does

Restores `dependency-cruiser` as a working CI gate (it had been mis-configured with an ESLint preset, so it silently produced no errors). Once the tool was honest again, the iteration drained the violations the audit flagged as high-leverage, in six sequential sections: fitness tool restoration, sentinel relocation, domain purity, cast-log port/adapter, `ModelId` brand pass, and two targeted god-class breakups.

No user-visible behavior changes. The plugin still scans spells, casts, and logs the same way; the only externally observable change is that `npm run arch:check` now runs in the pre-commit hook (via `.claude/lint-cmd`) and fails the commit on disallowed cross-module imports.

For maintainers: `domain/` no longer imports `obsidian` or `infra/`. `forge/` and `cast/` no longer reach into `castLog/`. The `CommandPopup` class shrank below 300 LOC and delegates detail-panel rendering to a new `DetailPanelRouter`. `SpellOptionsDetail` and `RefineOptionsDetail` collapsed into a single parameterized `OptionsDetail`. `ModelId` is now a branded string mirroring the existing `SpellPath` pattern.

## Design decisions

- **Hand-rolled `forbidden` rules in `.dependency-cruiser.cjs`, no `extends`** — the previous config extended `eslint-plugin-import/flat/recommended`, which is an ESLint preset, not a depcruise preset. Project rules are project-specific; bundled presets would not encode the `domain → infra` ban anyway.
- **Two structurally-identical ports (`CastEventSink` in `forge/`, `CastResultRecorder` in `cast/`) rather than one shared port** — the boundary rule is "each module owns its dependency direction". A shared port would force one module to depend on the other or be hoisted into `domain/`, where a castLog-shaped event type does not belong.
- **`ModelId` is the only Primitive Obsession win taken** — `CastId`, `AbsolutePath`, `VaultRelPath`, `PluginRelPath`, `PortalEndpoint`, `BasicCredentials` were rejected: no incident history of swapped values, and six extra brands would touch ~30 files for signalling rather than safety.
- **`CommandPopup` extraction stops at `DetailPanelRouter`** — the audit also called for `PopupEventWiring` and `PhaseContextBuilder`; both are speculative. Only the three `#renderXxxDetail` methods + `#enterDetail` were genuinely a router.
- **`OptionsDetail` discriminated-union (`{ kind: 'spell'; spell } | { kind: 'refine' }`) rather than a synthetic `Spell` for refine** — the only differences between the two old classes were the sentinel path, the `executeOnNote` source, and the `showExecuteOnNote` flag. A union captured all three without inventing a fake spell.
- **`resolveSpellOptions` tightened to `{ defaultModel, defaultEffort }`** — the previous `GrimoireSettings` parameter forced three call sites to build a 12-field empty-string stub. Tightening the contract deleted the duplication and was a prerequisite for the `OptionsDetail` unification.

## Scope

**In:**

- `.dependency-cruiser.cjs` rewrite + `arch:check` wired into pre-commit.
- Sentinel constants `FORGE_SPELL_PATH` / `REFINE_SPELL_PATH` moved from `castLog/types.ts` to `domain/spells/SystemSpellPaths.ts`. String values unchanged.
- `domain/` purified: `persistence.ts`, `computeVaultMountDefault.ts`, `spellScanner.ts` moved to `infra/`; `fuzzyFilter.ts` replaced by a pure `RankSpells` port + `infra/obsidianRanker.ts`; `SaveScheduler` port introduced for `SpellOverrideStore`.
- `CastEventSink` / `CastResultRecorder` ports added; `ForgeImprinter` and `CastDispatcher` import only their own port.
- `ModelId` brand threaded through `Settings`, `SpellOverride`, `CastInput`, `CastDispatchInput`, `CastedEvent`, `OptionsFormSnapshot`, `OptionsSessionEntry`, `EffortRow`, `ModelSelect`.
- `DetailPanelRouter` extracted from `CommandPopup`. `OptionsDetail` replaces `SpellOptionsDetail` + `RefineOptionsDetail`. `CastLogModule.initStartupMaintenance` decomposed into named subsystem methods sharing a `runOrLog` helper. Surgical fixes: dead `refineCastActionForWiring` getter deleted, `suspendKb` flag collapsed (always suspend), `phase.kind === 'detail'` replaced by polymorphic `phase.disablesTabBar()`.

**Out:**

- Wholesale Primitive Obsession beyond `ModelId` — deferred; no bug-class history justifies six extra brands.
- Breaking up `RemoteCastTransport.#execute`, `ForgeImprinter.imprint`, `CastDispatcher.dispatch`, `CastLogStore.#readFromFile`, `CommandPopupBuilder.build` — linear pipelines; chopping makes them harder to read.
- `VaultRefreshCoordinator` god-class breakup — its five "axes" are five phases of one lifecycle sharing state; splitting produces mutually-coupled tiny classes.
- Replacing `FORGE_SPELL_PATH` / `REFINE_SPELL_PATH` with a `CastOrigin` discriminated union — bigger refactor that touches the on-disk cast-log serialization format; deferred to a follow-up plan with a migration story. The boundary half (relocate constants) is independent and shipped now.
- Comments-restating-code sweeps, `TypedEmitter.off()`, `forgeTemplate.ts` resource extraction — YAGNI or below the bar for a standalone task.

## Relationship to existing system

- Replaces the inert `dependency-cruiser` configuration; `npm run arch:check` now enforces module boundaries on every commit.
- The sentinel relocation contradicts the location previously documented in `cast-log-foundation` and `refine-cast`. Updated.
- The port/adapter inversion sits between the consumers documented in `forge-cast` / `cast-unification` and the `CastLogStore` documented in `cast-log-foundation`. Wiring is unchanged; the type at the seam is now port-shaped.
- `OptionsDetail` unifies the two coordinators previously documented in `options-panel`, `refine-note-dialog`, and `spell-execute-on-note`. The `OptionsPanel` UI underneath is untouched.
- `DetailPanelRouter` is an internal carve-out of `CommandPopup`; the popup's external surface (`CommandPopupParams`, the `castAction` / `imprintAction` / `refineCastAction` callbacks) is unchanged.
- The `ModelId` brand mirrors the existing `SpellPath` brand documented in `live-spells-and-casting`.