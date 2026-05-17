---
shard: architecture
verdict: REWORK
violation_count: 9
---

# Design Audit Partial: Architecture

## Fitness Tool Findings

`npx depcruise src --config .dependency-cruiser.cjs --output-type err` failed to start:

```
ERROR: Can't resolve 'eslint-plugin-import/flat/recommended' in '/Users/volodymyrkoval/WebstormProjects/grimoire_3'
```

The repo's `.dependency-cruiser.cjs` references an `extends` config that is not installed/exported by the present `eslint-plugin-import` version. Architecture fitness is therefore **not enforced** by the configured tool. Fix the config (drop the bad `extends`, or pin a compatible plugin version) so circular/orphan rules actually run in CI. Manual checks below proceed.

## Dependency Direction Violations

Allowed rule set (recap):
- `domain/` → nothing (pure domain, no infra/ui/obsidian imports)
- `execution/` → `domain/` only
- `infra/` → nothing outside itself
- `cast/` → `domain/`, `execution/`, `infra/`
- `castLog/` → `domain/`, `infra/`
- `forge/` → `domain/`
- `refine/` → `domain/`, `cast/`
- `editor/` → `domain/`, `cast/`, `refine/`
- `ui/` → `domain/`, `cast/`, `castLog/`, `forge/`, `refine/`, `infra/`, `execution/`
- `main/` → anything

### Violation A — `domain/` depends on `infra/` (domain must be pure)

- **`src/domain/settings/SpellOverrideStore.ts:3`** — `import { DebouncedSaver } from "../../infra/DebouncedSaver"`. Domain pulls in an infrastructure utility. Rule: `domain/` → nothing. **Refactoring move:** Invert the dependency. Define a `SaveScheduler` port in `domain/` (`{ schedule(fn): void; flush(): Promise<void> }`) and pass a `DebouncedSaver` adapter from `main/` at composition time. Move `DebouncedSaver` wiring out of the store constructor.

### Violation B — `domain/` depends on `obsidian` (host SDK is infrastructure)

Domain is described as "pure domain". `obsidian` is the host runtime — importing it into domain leaks platform concerns directly into the model. Four offenders:

- **`src/domain/settings/persistence.ts:1`** — `import { App } from 'obsidian'`. **Refactoring move:** Extract Class — move `hydrate`/persistence to `infra/SettingsRepository.ts` (or `main/`); domain owns only the `GrimoireData` shape and `DEFAULT_SETTINGS`.
- **`src/domain/settings/computeVaultMountDefault.ts:1`** — `import { App, Platform, FileSystemAdapter } from 'obsidian'`. **Refactoring move:** This is platform detection, not domain logic. Move to `infra/computeVaultMountDefault.ts` and inject the resolved string into domain at startup.
- **`src/domain/spells/spellScanner.ts:1`** — `import { App, TFile } from 'obsidian'`. **Refactoring move:** Vault scanning is I/O. Move `spellScanner` to `infra/` (or a new `spells/scanner` adapter under `main/`); domain owns the `Spell` shape, not the discovery mechanism.
- **`src/domain/spells/fuzzyFilter.ts:1`** — `import { prepareFuzzySearch, sortSearchResults } from 'obsidian'`. **Refactoring move:** Replace with a pure ranker (or inject a `ScoreFn` port). Today domain is using the Obsidian search engine as a library — that's a Leaky Abstraction. Either inline a pure fuzzy ranker or move this file to `infra/`/`ui/`.

### Violation C — `forge/` reaches into `castLog/` (forbidden)

Rule: `forge/` → `domain/` only.

- **`src/forge/ForgeImprinter.ts:2`** — `import { FORGE_SPELL_PATH } from '../castLog/types'`. **Refactoring move:** Move Field — `FORGE_SPELL_PATH` is a domain identifier, not a castLog concern. Relocate the constant to `domain/spells/Spell.ts` (or a new `domain/spells/SystemSpellPaths.ts`) and re-import from there in both forge and castLog.
- **`src/forge/ForgeImprinter.ts:7`** — `import type { CastLogWriter } from '../castLog/CastLogWriter'`. **Refactoring move:** Define a `CastSink` / `CastEventRecorder` port in `forge/` (or `execution/`) describing the two methods forge actually calls; let `main/` supply a `CastLogWriter`-shaped adapter. Forge stops knowing the castLog module exists.

### Violation D — `refine/` reaches into `castLog/` (forbidden)

Rule: `refine/` → `domain/`, `cast/`.

- **`src/refine/refineCastSpell.ts:2`** — `import { REFINE_SPELL_PATH } from '../castLog/types'`. **Refactoring move:** Same as Violation C's `FORGE_SPELL_PATH` — move `REFINE_SPELL_PATH` to `domain/spells/` (it is a domain concept identifying a built-in spell, not a castLog concept). castLog re-imports from domain afterwards.

### Violation E — `cast/` reaches into `castLog/` (forbidden)

Rule: `cast/` → `domain/`, `execution/`, `infra/`.

- **`src/cast/CastDispatcher.ts:4`** — `import type { CastLogWriter } from '../castLog/CastLogWriter'`. **Refactoring move:** Extract Interface in cast (`CastResultRecorder` / `CastEventSink`) that exposes only the methods the dispatcher calls; `main/` wires a `CastLogWriter` instance to that port. Same fix shape as Violation C; the dispatcher should not know that logging is the consumer.

## Circular Dependency Violations

None at the module-pair level. The configured fitness tool (`dependency-cruiser`) is broken and could not confirm file-level cycles — see Fitness Tool Findings. Recommend re-running once `.dependency-cruiser.cjs` is fixed.

## Cross-Module Smell Violations

### Feature Envy

- **`src/forge/ForgeImprinter.ts`** — depends on `castLog/types` (`FORGE_SPELL_PATH`), `castLog/CastLogWriter`, and `execution/Caster`. Of the three external collaborators two live in `castLog/`. The class spends as much time orchestrating castLog persistence as it does forge-imprint logic. **Refactoring move:** Move Method — push the "record forge cast started / completed" calls behind a forge-owned port (`ForgeOutcomeSink`); main wires the castLog adapter. Forge stops being envious of castLog internals.
- **`src/refine/refineCastSpell.ts`** — its only non-domain external symbol is `REFINE_SPELL_PATH` from `castLog/types`. The constant is conceptually a domain identifier; refine is currently reaching into castLog because castLog is where someone parked the literal. **Refactoring move:** Move Field to `domain/spells/`, eliminating the cross-module reach entirely (see Violation D).

### Leaky Abstraction

- **`src/domain/spells/fuzzyFilter.ts`** — exposes Obsidian's `prepareFuzzySearch`/`sortSearchResults` semantics via a function that lives in `domain/`. Any caller of `fuzzyFilter` is implicitly coupled to Obsidian's matching algorithm. **Refactoring move:** Define a pure `rankSpells(query, spells): Spell[]` in domain with deterministic semantics; if Obsidian fuzzy matching is desired, implement that ranker in `infra/` and inject it.
- **`src/domain/settings/persistence.ts` + `computeVaultMountDefault.ts`** — `App`/`FileSystemAdapter`/`Platform` types from the Obsidian SDK cross into `domain/`. Domain is no longer host-agnostic. **Refactoring move:** Push these modules out of `domain/` into `infra/` (see Violation B). Domain consumes only primitives + value objects.
- **`castLog/types.ts` as a junk drawer for spell-path constants** — `FORGE_SPELL_PATH` and `REFINE_SPELL_PATH` are declared in `castLog/types.ts` but consumed by `forge/`, `refine/`, and `ui/components/CastLogRow.ts`. These constants identify built-in spells, not log events. Their presence in castLog is the source of three cross-module reaches (Violations C, D, plus ui import). **Refactoring move:** Move Field to `domain/spells/Spell.ts` (or a new `domain/spells/SystemSpellPaths.ts`).

### God Module

None at this granularity. `castLog/` is the largest module (16 files) but the files are cohesive around log read/write/refresh/format; responsibilities are split, not piled into one file. `ui/` is wide but partitioned (`tabs/`, `popup/`, `components/`, `widgets/`, `options/`, `settings/`). No single module is doing the work of three.

Note: `main/CastLogModule.ts` is named "Module" and imports 12 collaborators — but its role is composition, which is allowed for `main/`. It is a wiring node, not a domain god class. No violation.

## Verdict

REWORK

9 dependency-direction violations across four boundary crossings (`domain ← infra`, `domain ← obsidian` ×4, `forge → castLog` ×2, `refine → castLog`, `cast → castLog`), plus a broken architecture-fitness configuration that lets these regressions land without CI noise. The dominant theme: `domain/` is not actually pure (it imports the Obsidian SDK and `infra/`), and `castLog/types.ts` is being used as a dumping ground for domain identifiers, creating reach-arounds from `forge/`, `refine/`, and `cast/`. Fix the fitness tool first, then drain the four offenders in priority order: relocate the spell-path constants to `domain/spells/` (kills three violations at once), then evict `obsidian` from `domain/` (four files), then port-and-adapter the `CastLogWriter` consumers (forge + cast).
