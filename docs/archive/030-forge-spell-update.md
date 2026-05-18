# 030 — Forge Spell Update

> Pitch: `brain/Grimoire - Forge spell update.md`
> Mode: `--deep` (multi-perspective: minimalist, extensibility, devil's-advocate, user-advocate, synthesized into Design)
> Builds on: `003-forge-cast`, `005-options-panel`, `018-forge-spell-materialization`, `019-refine-cast`, `028-refine-spell-buildout`, `029-custom-refine-spell`
> Special emphasis: **SOLID** — every component decision below names the principle it satisfies (or trades off, with reason).

---

## Summary

Today's Forge is one-shot: it generates a brand-new spell file from a plain-English description. After that, evolving a spell means hand-editing markdown. This iteration adds a second mode — *update* — reachable from the per-spell options panel. The same Forge dialog shell is reused with three field-level changes (static name, repurposed description, replaced checkbox), the same materialised meta-spell pipeline runs with a parallel template, and the output writes back to the same spell file in place. `@cast` directives embedded in the spell body are picked up as additional change instructions when the user opts in. Cast Log distinguishes update from create via a new sentinel. The Spell Picker keyboard hot path is untouched.

## Requirements

Traceable to the pitch. **MUST** = ship-blocker; **SHOULD** = strong preference, deferrable under push-back; **WON'T** = out of scope (mirrors pitch's no-gos and rabbit holes).

### MUST

- **R1.** The options panel for a user-authored spell gains a *Forge* button below Cast and Reset.
- **R2.** Clicking *Forge* dismisses the options panel and opens the Forge dialog in *update mode* for the selected spell.
- **R3.** Update-mode Forge dialog differs from create-mode in exactly three field-level changes:
  - **R3a.** *Spell name* field is static text rendering the current spell's name (not an input).
  - **R3b.** *Description* field is repurposed: placeholder/help text reads as "what should change about this spell" (not "what the new spell should do").
  - **R3c.** *Execute on active note* checkbox is replaced by *Apply @cast directives*, conditional on vault state (see R4).
- **R4.** *Apply @cast directives* checkbox visibility mirrors the Custom Refine variant selector's conditional-on-vault-state rule:
  - Zero `@cast` directives in the spell body → checkbox is **not rendered** in the DOM.
  - One or more present → checkbox renders, **defaults to checked**, and shows a count indicator (working copy: `"3 directives found"`).
  - Detection uses the same regex as the editor decorator: `/^@cast(?=\s|$)/` (line-start, case-sensitive — see `src/editor/castLineRegex.ts`).
- **R5.** On submit, a Forge *update* cast runs with: description, `@cast` directives (when checkbox checked), chosen model, chosen effort, **and the spell's current full content** as input to the meta-spell. Local and remote symmetric (same `--system-prompt-file` shape as create-mode per `018`).
- **R6.** The meta-spell — a parallel template materialised the same way create-mode is — produces a rewritten spell body. Output writes back to the **same spell file in place**. No new file, no rename, no backup, no version, no frontmatter rewrite by default.
- **R7.** The Cast Log identifies the cast with a new sentinel `<forge:update>`, distinct from the existing `<forge>` create sentinel. Status transitions, error handling, completion `Notice` behave identically to create-mode Forge.
- **R8.** When *Apply @cast directives* is **checked** AND the cast succeeds, the matched `@cast` lines are removed from the spell's resulting content (same convention as Refine — see `src/refine/refineTemplate.ts` Mode 3 step 5). The meta-spell is told to do this; the plugin does not post-process the file. *(Open question Q3 covers the unchecked case.)*
- **R9.** The Forge button is **not** rendered on:
  - **R9a.** Sentinel rows (Forge / Refine) — sentinels have their own options surfaces; user-authored spells only.
  - **R9b.** Sentinel-marked notes (notes with `sentinel: refine` frontmatter) — they are excluded from the picker anyway per `029`, so this constraint is satisfied by composition; the plan asserts it explicitly with a test.
- **R10.** Update-mode meta-spell preserves frontmatter (`tags`, `grimoire-execute-on-note`, any other keys) **unless** the user's description text explicitly requests changes to it. Implementation: meta-spell text instructs Claude to preserve frontmatter by default.
- **R11.** The keyboard-driven Spell Picker UX is untouched. No new keyboard shortcut for Forge update. Entry is exclusively: ArrowRight on a spell → options panel → Forge button (mouse or Tab+Enter — whatever the panel already supports).

### SHOULD

- **R12.** When the active settings has `executionMode === 'remote'` and `portalHost` is empty, update-mode Forge surfaces the same notice as create-mode (`"Configure portal host in settings before casting remotely."`) and aborts without dispatch — same precondition guard already in `ForgeImprinter`.
- **R13.** Sentinel registration for Cast Log (i.e. "what spell paths are recognised display-sentinels?") should be extended in a way that does not require future sentinel kinds to edit a switch — see Design **OCP** seam. If the current code is a switch, refactor it as part of this iteration (in-scope per the SOLID-debts directive).
- **R14.** The `count indicator` ("N directives found") next to the checkbox label should pluralise correctly ("1 directive found", "2 directives found").

### WON'T (out of scope — pitch no-gos + planner-deferred)

- **W1.** No edit-history / version / branch / backup / diff / rollback — file recovery, git, user's own backup tooling.
- **W2.** No multi-spell batch update. One spell at a time.
- **W3.** No partial preview / dry-run before cast. Cast streams output to file; user sees the result in Obsidian.
- **W4.** No silent frontmatter rewrite. R10 protects this.
- **W5.** No keyboard shortcut from Spell List for Forge update. Configuration step (options panel) is mandatory.
- **W6.** No "edit existing" toggle on the create-mode dialog. Mode is determined by entry point, not by content heuristics.
- **W7.** No exposure on built-in sentinels (Forge / Refine sentinel rows) or sentinel-marked notes — R9.
- **W8.** No auto-detect-update-intent from description in create mode. The dialog the user entered is a contract.
- **W9.** No "set custom forge-update template" surface. The update template is bundled, just like the create template.
- **W10.** No content-shape validation of the user's spell file before update (matches `029`'s "no content validation" principle for custom Refine).
- **W11.** No structural refactor of `ForgeImprinter`'s caster construction beyond what SOLID-debts (D1–D3 in Design) explicitly calls for. The existing caster + logWriter contract stays.

## Proposed solution

Build outside-in over seven sections (A–G). Section ordering reflects dependency: types and constants first, the meta-spell template pair second, the dialog mode-split third, the options-panel Forge button fourth, the update cast pipeline (parallel imprinter) fifth, the cast-log sentinel registry sixth, the docs/drift sweep last.

### Conceptual model

```
                ┌──────────────────────────────────────────────────────────────┐
                │  User-authored spell file in vault                           │
                │  (has tags: [grimoire/spell], NOT sentinel: refine)          │
                └──────────────────────────┬───────────────────────────────────┘
                                           │
                  ArrowRight on row        │  (existing options-panel flow)
                                           ▼
                              ┌──────────────────────────┐
                              │  OptionsPanel (spell)    │
                              │  [Cast] [Reset] [Forge]  │  ← R1: button at bottom
                              └────────────┬─────────────┘
                                           │
                                           │  click Forge
                                           ▼
                         ┌─────────────────────────────────────┐
                         │  ForgeSentinelDetail (update-mode)  │
                         │   - name: static text               │  ← R3a
                         │   - description: "what to change"   │  ← R3b
                         │   - [✓] Apply @cast directives (N)  │  ← R3c, R4
                         │   - model select, effort row        │
                         │   - [Submit]                        │
                         └────────────┬────────────────────────┘
                                      │
                                      │  submit → ForgeUpdateFormSnapshot
                                      ▼
                ┌────────────────────────────────────────────────────┐
                │  ForgeUpdateImprinter                              │
                │   - passes spell path via executeOnNote context    │
                │   - dispatches via Caster + system-prompt-file     │
                │     (parallel meta-spell template forgeUpdate.md)  │
                │   - cast-log sentinel: '<forge:update>'            │
                │   - same on-success / on-failure notice contract   │
                └────────────────────────────────────────────────────┘
```

### Component plan (preview — see Components & Interfaces sections for detail)

A **parallel** create/update story, not a fork: shared dialog shell with a *mode* parameter, two pure template renderers, two pure user-prompt builders, two imprinters that share a common interface, one sentinel registry that consumes both. The dialog mode is a discriminated union so both modes are honest substitutes (LSP). Imprinters share a `SpellImprinter` interface, injected by the popup (DIP). The options panel's *Forge* button is a third action (alongside Cast and Reset), wired to a single new `ForgeUpdateAction` callback (ISP — the panel does not see the full update pipeline). The Cast Log sentinel registry replaces any existing `if path === '<forge>' ... else if path === '<refine>' ...` switch with a Map lookup (OCP — adding `<forge:update>` adds an entry, not a branch).

## Components

| Component | Location | Responsibility | Status |
|---|---|---|---|
| `ForgeMode` discriminated union | `src/forge/ForgeMode.ts` (new) | `{ kind: 'create' } \| { kind: 'update'; spell: Spell; directiveCount: number }` — carries everything the dialog needs to render itself in either mode. Content is NOT captured here; it flows to the cast via `executeOnNote`. Honest LSP-safe substitution. | NEW |
| `forgeUpdateTemplate.ts` | `src/forge/forgeUpdateTemplate.ts` (new) | Pure fn: `renderForgeUpdateSystemPrompt(input: ForgeUpdateSystemPromptInput) => string`. Parallel to existing `renderForgeSystemPrompt`. Returns instructions for updating an existing spell in place, preserving frontmatter by default. | NEW |
| `buildForgeUpdateUserPrompt.ts` | `src/forge/buildForgeUpdateUserPrompt.ts` (new) | Pure fn: builds the small per-cast user prompt for update mode. Inputs: `{ spellPath, spellName, description, applyCastDirectives, directiveCount, model, effort }`. **No `currentContent` or `directives` array** — spell content reaches the meta-spell via `executeOnNote`; the user prompt carries only the change intent and flags. Parallel to existing `buildForgeUserPrompt`. | NEW |
| `ForgeUpdateMaterializer` | `src/forge/ForgeUpdateMaterializer.ts` (new) | Mirrors `ForgeMaterializer` — writes `<pluginDir>/forge-update.md` from `renderForgeUpdateSystemPrompt`. Same lifecycle: `onload` + on every settings save. | NEW |
| `PluginPaths` extension | `src/infra/PluginPaths.ts` (modify) | Add `forgeUpdateSpellPathPluginRel()` and `forgeUpdateSpellPathVaultRel()`, mirroring the forge accessors. | MODIFIED |
| `ForgeUpdateFormSnapshot` | `src/forge/ForgeUpdateFormSnapshot.ts` (new) | Type for `{ spellPath, spellName, description, model, effort, applyCastDirectives, directiveCount }`. **No `currentContent`** — spell content flows to the meta-spell via `executeOnNote`, not embedded in the snapshot. Discriminant-free; the existence of `spellPath` distinguishes it from `ForgeFormSnapshot` for callers that need to. | NEW |
| `SpellImprinter` interface | `src/forge/SpellImprinter.ts` (new) | Common port for create + update. **DIP seam.** `interface SpellImprinter<Snapshot> { imprint(snapshot: Snapshot, settings: GrimoireSettings, close: () => void): void; }`. Existing `ForgeImprinter` declares `implements SpellImprinter<ForgeFormSnapshot>`. New `ForgeUpdateImprinter` declares `implements SpellImprinter<ForgeUpdateFormSnapshot>`. | NEW |
| `ForgeImprinter` | `src/forge/ForgeImprinter.ts` (modify minimally) | Add `implements SpellImprinter<ForgeFormSnapshot>` — no behaviour change. (LSP verification: existing test suite must still pass with no edits.) | MODIFIED (one line) |
| `ForgeUpdateImprinter` | `src/forge/ForgeUpdateImprinter.ts` (new) | Update-mode pipeline: validates remote precondition, builds the per-cast user prompt (no `currentContent`), logs the cast under `<forge:update>` sentinel, dispatches via the existing `Caster` with `forge-update.md` as the system-prompt file **and `executeOnNote: true, activeFilePath: snapshot.spellPath`** — so Claude Code reads the spell content automatically. **Does not** rewrite the file itself — the meta-spell does that via MCP / filesystem fallback, same as create mode. | NEW |
| `castDirectiveExtractor.ts` | `src/forge/castDirectiveExtractor.ts` (new) | Pure fn `countCastDirectives(body: string): number` — used at dialog-open time to populate the checkbox UI. Pure fn `extractCastDirectives(body: string): string[]` — utility, available but not used by the imprinter (Claude Code reads the directives from the spell note via `executeOnNote`). Both use `CAST_LINE_REGEX` from `src/editor/castLineRegex.ts` — **single source of truth** for the regex (no copy-paste). | NEW |
| `SpellContentReader` port | `src/forge/SpellContentReader.ts` (new) | Tiny interface `{ read(path: SpellPath): Promise<string> }`. Default impl wraps `app.vault.cachedRead(file)`. **DIP seam** — keeps `DetailPanelRouter.renderForgeUpdate` import-free of `obsidian` for the directive-counting read. (Spell content itself flows to the meta-spell via `executeOnNote`, not through this reader.) | NEW |
| `FORGE_UPDATE_SPELL_PATH` | `src/domain/spells/SystemSpellPaths.ts` (modify) | Add `export const FORGE_UPDATE_SPELL_PATH = '<forge:update>' as const;` next to existing `FORGE_SPELL_PATH` and `REFINE_SPELL_PATH`. | MODIFIED |
| `SystemSpellRegistry` | `src/castLog/SystemSpellRegistry.ts` (new — promoted from existing switch if any) | `Map<string, { label: string; description?: string }>` plus a `register(path, meta)` and `describe(path)` API. Pre-populated with `<forge>`, `<refine>`, `<forge:update>`. **OCP seam** — adding a new system spell is a registration, not a switch edit. Lives in `castLog/` because the only consumer today is the Cast Log row renderer; if a future consumer appears, lift the file. | NEW |
| Cast Log row renderer | wherever `<forge>` is currently rendered — see Open Q4 | Read via `SystemSpellRegistry.describe(path)` instead of inline branching. | MODIFIED (if a switch is found) |
| `ForgeSentinelDetail` | `src/ui/components/ForgeSentinelDetail.ts` (modify) | Accept `mode: ForgeMode` param. Render name as `<input>` (create) or static `<div>` (update). Re-label/re-placeholder description per mode. Replace `Execute on active note` checkbox with `Apply @cast directives (N)` checkbox **only** when `mode.kind === 'update' && mode.directiveCount > 0`. Submit emits `ForgeFormSnapshot` (create) or `ForgeUpdateFormSnapshot` (update) through two onSubmit callbacks. **ISP seam** — the dialog asks for exactly the callbacks it needs per mode. | MODIFIED |
| `OptionsPanel` | `src/ui/options/OptionsPanel.ts` (modify) | Accept optional `onForgeUpdate?: () => void` dep. When present AND the panel is rendering for a spell (not Refine sentinel), render a third button "Forge" below Cast and Reset. Clicking it calls `onForgeUpdate()`. The panel does not own the dialog logic. **ISP / SRP seam.** | MODIFIED |
| `OptionsDetail` | `src/ui/components/OptionsDetail.ts` (modify) | When `kind.kind === 'spell'`, wire `onForgeUpdate` to a callback that closes the panel and routes to a new `forgeUpdateAction(spell)` callback passed in through params. Refine variant of OptionsDetail does not pass `onForgeUpdate`. | MODIFIED |
| `DetailPanelRouter` | `src/ui/popup/DetailPanelRouter.ts` (modify) | Accept a new `forgeUpdateAction: ForgeUpdateAction` dep (alias `(spell: Spell) => void`). Add a `renderForgeUpdate(contentEl, scope, spell)` method that reads spell content via the `SpellContentReader` port, builds a `ForgeMode` discriminator with `kind: 'update'`, mounts `ForgeSentinelDetail`, and wires `onSubmit` to the update-snapshot callback. Pass `forgeUpdateAction` down from `OptionsDetail` via `onForgeUpdate` plumbing. | MODIFIED |
| `CommandPopup` | `src/ui/CommandPopup.ts` (modify) | Accept new `forgeUpdateAction: ForgeUpdateAction` constructor param; thread through to `DetailPanelRouter`. **DIP** — the popup does not construct the update imprinter, just forwards the action. | MODIFIED |
| `CommandPopupBuilder` | `src/ui/popup/CommandPopupBuilder.ts` (modify) | Construct one `ForgeUpdateImprinter` and produce the `forgeUpdateAction` closure that calls `updateImprinter.imprint(snapshot, settings, close)`. Inject `forgeUpdateSpellPaths()` (parallel to existing `forgeSpellPaths()`). | MODIFIED |
| `main.ts` | `src/main.ts` (modify) | Construct `ForgeUpdateMaterializer` and run on `onload` + on settings save (mirror existing forge materializer wiring in `CastLogModule`). Wire `forgeUpdateSpellPaths` thunk into the popup builder. Construct a `SpellContentReader` from `app.vault` and inject into the popup builder. | MODIFIED |
| `CastLogModule` | `src/main/CastLogModule.ts` (modify) | Materialize forge-update file alongside forge file. One extra `ForgeUpdateMaterializer` constructed in `initStartupMaintenance` and re-run in a new `materializeForgeUpdate()` method — **parallel to the existing `materializeForge()`, which is kept unchanged** (Q5 decision: two methods with a similar name pattern, no rename). | MODIFIED |

## Interfaces

```ts
// src/forge/ForgeMode.ts
import type { Spell } from '../domain/spells/Spell';

export type ForgeMode =
  | { kind: 'create' }
  | {
      kind: 'update';
      spell: Spell;
      directiveCount: number;     // 0 → Apply @cast checkbox hidden; content flows via executeOnNote
    };

// src/forge/SpellImprinter.ts
import type { GrimoireSettings } from '../domain/settings/Settings';
export interface SpellImprinter<Snapshot> {
  imprint(snapshot: Snapshot, settings: GrimoireSettings, close: () => void): void;
}

// src/forge/ForgeUpdateFormSnapshot.ts
import type { Effort } from '../domain/settings/Settings';
import type { ModelId } from '../domain/settings/ModelId';
import type { SpellPath } from '../domain/spells/SpellPath';
export interface ForgeUpdateFormSnapshot {
  readonly spellPath: SpellPath;
  readonly spellName: string;          // for status notice text
  readonly description: string;
  readonly model: ModelId;
  readonly effort: Effort | null;
  readonly applyCastDirectives: boolean;
  readonly directiveCount: number;     // for the user-prompt flags; content flows via executeOnNote
  // No currentContent: spell file is provided to the meta-spell via executeOnNote/activeFilePath
}

// src/forge/forgeUpdateTemplate.ts
export interface ForgeUpdateSystemPromptInput {
  readonly vaultMountPath: string;
}
export function renderForgeUpdateSystemPrompt(input: ForgeUpdateSystemPromptInput): string;

// src/forge/buildForgeUpdateUserPrompt.ts
// No currentContent or directives: spell content reaches the meta-spell via executeOnNote.
export interface ForgeUpdateUserPromptInput {
  readonly spellPath: string;
  readonly spellName: string;
  readonly description: string;
  readonly applyCastDirectives: boolean;
  readonly directiveCount: number;
  readonly model: string;
  readonly effort: Effort | null;
}
export function buildForgeUpdateUserPrompt(input: ForgeUpdateUserPromptInput): string;

// src/forge/SpellContentReader.ts
import type { SpellPath } from '../domain/spells/SpellPath';
export interface SpellContentReader {
  read(path: SpellPath): Promise<string>;
}

// src/forge/castDirectiveExtractor.ts
export function countCastDirectives(body: string): number;
export function extractCastDirectives(body: string): string[];

// src/forge/ForgeUpdateImprinter.ts
import type { Caster } from '../execution/Caster';
import type { CastEventSink } from './CastEventSink';
export interface ForgeUpdateImprinterDeps {
  notify: (msg: string) => void;
  caster: () => Caster;
  logWriter: () => CastEventSink;
  forgeUpdateSpellPaths: () => { absForCaster: string; vaultRelForPortal: string };
  generateId?: () => string;
}
export class ForgeUpdateImprinter implements SpellImprinter<ForgeUpdateFormSnapshot> {
  constructor(deps: ForgeUpdateImprinterDeps);
  imprint(snapshot: ForgeUpdateFormSnapshot, settings: GrimoireSettings, close: () => void): void;
}

// src/castLog/SystemSpellRegistry.ts
export interface SystemSpellMeta {
  readonly label: string;            // e.g. "Forge", "Forge (update)", "Refine"
  readonly description?: string;     // optional long-form for tooltips/aria
}
export class SystemSpellRegistry {
  register(path: string, meta: SystemSpellMeta): void;
  describe(path: string): SystemSpellMeta | undefined;
  isSystemSpell(path: string): boolean;
}

// src/ui/popup/DetailPanelRouter.ts (extended)
export type ForgeUpdateAction = (spell: Spell) => void;
export interface DetailPanelRouterDeps {
  // ... existing ...
  forgeUpdateAction: ForgeUpdateAction;
  spellContentReader: SpellContentReader;
}

// src/ui/options/OptionsPanel.ts (extended)
export interface OptionsPanelDeps {
  // ... existing ...
  /** Present iff this panel renders for a user-authored spell. Hides the Forge button otherwise. */
  onForgeUpdate?: () => void;
}

// src/ui/components/ForgeSentinelDetail.ts (extended)
export interface ForgeSentinelDetailParams {
  contentEl: HTMLElement;
  mode: ForgeMode;                                   // NEW
  callbacks: {
    onBack: () => void;
    onCreateSubmit: (snapshot: ForgeFormSnapshot) => void;          // active when mode.kind==='create'
    onUpdateSubmit: (snapshot: ForgeUpdateFormSnapshot) => void;    // active when mode.kind==='update'
  };
  defaults: FormDefaults;
}
```

## Data flow

### Open update-mode Forge dialog

```
User clicks Forge button on OptionsPanel for spell X
  → OptionsDetail.onForgeUpdate()
  → CommandPopup exits options detail, then routes to detailRouter.renderForgeUpdate(contentEl, scope, spell)
  → content = await spellContentReader.read(spell.path)  // quick read for directive count only
  → directiveCount = countCastDirectives(content)
  → mode = { kind: 'update', spell, directiveCount }     // no currentContent stored
  → new ForgeSentinelDetail(scope).render({ contentEl, mode, callbacks: { ..., onUpdateSubmit }, defaults })
  → onEnterDetail(detail, onExit)
```

### Submit update cast

```
ForgeSentinelDetail submit (update mode)
  → callbacks.onUpdateSubmit({
      spellPath, spellName, description,
      model, effort, applyCastDirectives, directiveCount,
    })
  → DetailPanelRouter wrapper → updateAction(snapshot)
  → updateImprinter.imprint(snapshot, settings, close)
      ├── if remote && portalHost empty → notify + return
      ├── castId = generateId()
      ├── userPrompt = buildForgeUpdateUserPrompt({
      │     spellPath, spellName, description,
      │     applyCastDirectives, directiveCount,
      │     model, effort
      │   })
      ├── logWriter.recordCasted({
      │     castId,
      │     spellPath: FORGE_UPDATE_SPELL_PATH,    // '<forge:update>'
      │     model, effort, contextNotes: [],
      │     executeOnNote: true,
      │   })
      ├── notify(remote ? "Updating '<name>' on portal…" : "Updating '<name>'…")
      ├── close()                                  // dialog dismisses
      └── caster.cast(
            { castId, spellPath: paths.vaultRelForPortal, modelId, effort,
              userPrompt, systemPromptFile: paths.absForCaster, vaultMountPath,
              executeOnNote: true,
              activeFilePath: snapshot.spellPath   // CastDispatcher adds note context
            },
            { onAccepted, onFailure }              // same callback shape as create
          )
```

### Cast Log identification

```
Cast Log row renderer reads event.spellPath
  → registry.describe(event.spellPath)
      "<forge>"        → { label: "Forge",           description: "spell creation" }
      "<refine>"       → { label: "Refine",          description: "note refinement" }
      "<forge:update>" → { label: "Forge (update)",  description: "spell rewrite" }
      otherwise        → undefined → render path as-is (user spell)
```

## Error handling

| Failure | Behaviour |
|---|---|
| Remote mode with empty portalHost | Notice `"Configure portal host in settings before casting remotely."`, no dispatch. **Same as create-mode.** |
| Spell file unreadable at dialog-open time | `spellContentReader.read` throws → `DetailPanelRouter.renderForgeUpdate` catches, posts `Notice("Could not read spell content")`, returns without entering detail phase. Options panel re-renders (or stays as-is). |
| Spell deleted between dialog open and submit | The cast dispatches with `activeFilePath: spellPath` via `executeOnNote`. Claude Code will attempt to read the now-missing file; the cast will fail with a file-not-found error. That failure reaches `onFailure`, which triggers `logWriter.recordError` and a `"Forge update failed: …"` notice. The spell file is unchanged. (Accepted: read-once divergence tracking is out of scope per Q6.) |
| Spell modified between dialog open and submit | The cast dispatches with `activeFilePath` pointing to the current on-disk version — whatever it contains at cast time. The meta-spell sees the latest content (possibly diverged from what the user described against). Documented as accepted divergence (Q6). |
| Cast fails (non-zero exit / portal 4xx-5xx) | Notice `"Forge update failed: <msg>"` (parallels existing `"Forge failed: ..."`). Log entry's `recordError({ castId, message })`. Spell file is **not** touched by the plugin — it stays as it was before the cast started. The meta-spell may have partially written; this is the same risk as today's create-mode partial write. |
| `@cast` directive checkbox checked but zero directives extracted (race: directives stripped between dialog open and submit by an editor extension) | `directives = []`, user prompt includes a "0 directives" marker; meta-spell proceeds with description-only updates. Notice path unchanged. |
| User submits with empty description AND `applyCastDirectives = false` | Frontend-level guard: submit button disabled until description is non-empty OR (`applyCastDirectives` AND `directiveCount > 0`). Surfaces no notice — the submit just doesn't fire. *(Edge case decision recorded in Q7.)* |
| Sentinel registry lookup miss for a known system path | `describe()` returns `undefined` → Cast Log renderer falls back to displaying the raw path. No throw. **OCP win:** adding `<forge:update>` is a register call, not a branch edit. |

## Key design decisions

### SOLID seams

This subsection answers the user's explicit ask: per component, name the SRP / OCP / LSP / ISP / DIP principle satisfied, and where we're consciously trading off.

#### 1. **SRP — Single responsibility per component**

| Component | One reason to change |
|---|---|
| `forgeUpdateTemplate.ts` | The bundled update meta-spell prompt text changes. |
| `buildForgeUpdateUserPrompt.ts` | The shape of the small per-cast block changes (e.g. add a field). |
| `ForgeUpdateImprinter` | The orchestration sequence of an update cast changes (validate → log → notify → cast). |
| `ForgeUpdateMaterializer` | Where/when the file is written changes. |
| `castDirectiveExtractor.ts` | The `@cast` regex or extraction rule changes (today it points at `castLineRegex.ts`; if a future iteration parameterises the regex, this module is the entry point — and exactly one place to touch). |
| `SpellContentReader` | The way the plugin reads spell content changes (e.g. switch to `Vault.read` vs `cachedRead`). |
| `SystemSpellRegistry` | The set of recognised system spell paths changes. |
| `ForgeSentinelDetail` | The dialog DOM / field layout changes. **One** widget; the *mode* is a parameter, not a second responsibility. |
| `OptionsPanel` (Forge button addition) | The set of buttons on the panel changes. Adding a third button is consistent with the panel's existing responsibility (render the controls); the panel does not absorb cast-pipeline responsibility because `onForgeUpdate` is just a callback. |

> If you can name two reasons for a class to change, split it. The most plausible borderline is `ForgeUpdateImprinter`: it both *validates remote precondition* and *orchestrates the cast*. We accept that pairing because validation is a one-line guard at the entry of the orchestration sequence — extracting it would be ceremony with one caller. (Documented as a deliberate non-split.)

#### 2. **OCP — Open for extension, closed for modification**

Three OCP seams, ordered by leverage:

- **`SystemSpellRegistry` (Cast Log)** — biggest win. Today, if any `if path === '<forge>' ... else if path === '<refine>' ...` switch exists in the Cast Log row renderer, this iteration replaces it with `registry.describe(path)`. Adding `<forge:update>` becomes one `register('<forge:update>', { label: 'Forge (update)' })` call at startup — no branch edit. Future `<forge:*>` kinds register the same way. **In-scope refactor regardless of whether the switch exists today** — see *SOLID debts* §D1 below.
- **`ForgeMode` discriminated union** — the dialog's create/update split. A new mode (`{ kind: 'translate'; ... }`) extends the union; the dialog's mount-time switch handles the new case in one place; nothing existing changes signature. Today's dialog code may have implicit field-level branches on `mode.kind === 'create'`; we accept that bounded mode-switch as the *single* point of extension. (Refer to design-patterns Strategy decision below.)
- **`SpellImprinter<S>` interface** — adding a *third* imprinter kind (e.g. forge-translate) is "implement the interface + register the action with the popup builder" — no edit to existing imprinters.

#### 3. **LSP — Honest substitutability**

- **`ForgeImprinter` and `ForgeUpdateImprinter` both implement `SpellImprinter<S>`.** Each is honest: neither throws `NotImplemented`, neither requires callers to `instanceof`-check. The popup builder constructs one of each and binds them to distinct action callbacks; the seam where they meet is the action callback, not a polymorphic switch.
- **`ForgeMode` cases are honest substitutes** for the dialog — both rendered through the same `ForgeSentinelDetail.render(...)` entry point, both producing a snapshot through one of two clearly-named callbacks. The dialog does not silently render a half-form in update mode; it renders a complete update-mode form. No callers need `instanceof` or `kind`-checks outside the dialog itself and the router (which fan in to dispatch the appropriate action).

#### 4. **ISP — No fat interfaces**

- **`OptionsPanel.OptionsPanelDeps`** is already a structured options bag (model, effort, context notes, follow-up, executeOnNote, refine-variant-select, etc.). Adding `onForgeUpdate?: () => void` (optional, single-callback) is the narrowest possible extension. The panel does not learn about *update-snapshot shapes* or *imprinters* or *meta-spell paths* — only about the existence of an action to dispatch.
- **`ForgeSentinelDetailParams.callbacks`** narrows from a single `onSubmit` to two narrowly-typed callbacks: `onCreateSubmit(ForgeFormSnapshot)` and `onUpdateSubmit(ForgeUpdateFormSnapshot)`. This is ISP-correct: callers in create mode never deal with update-snapshot type plumbing and vice versa. The dialog body internally dispatches to the right callback based on `mode.kind`. *(Alternative considered: one `onSubmit(snapshot: ForgeFormSnapshot | ForgeUpdateFormSnapshot)` — rejected because it forces every caller to discriminate, defeating ISP.)*
- **`SpellContentReader`** is a one-method interface — the canonical ISP minimum. Mocked trivially in tests; backed by `app.vault.cachedRead` in production.

#### 5. **DIP — Depend on abstractions**

- **`ForgeUpdateImprinter` depends on `Caster`, `CastEventSink`, `notify`-fn, `forgeUpdateSpellPaths`-thunk.** Same DIP shape as today's `ForgeImprinter`. No `obsidian` import in the imprinter.
- **`DetailPanelRouter` depends on `SpellContentReader` (interface), not `App` directly for the spell-read step.** This is a new boundary — today the router takes `app: App` only for OptionsDetail's vault search via ContextNotesInput. Adding `spellContentReader: SpellContentReader` to the deps keeps the read step injectable. Tests construct a stub; production wires `{ read: (p) => app.vault.cachedRead(app.vault.getAbstractFileByPath(p) as TFile) }`.
- **`CommandPopupBuilder` is the composition root** for both imprinters and the reader. It constructs concrete instances and hands their *callable form* (closures) to the popup. The popup is a consumer, not a constructor. (Same pattern that's already in place for create-mode Forge per `018`/`003`.)
- **`ForgeUpdateMaterializer` depends on a `ForgeUpdateSystemPromptInput` thunk + write ports**, not on settings shape directly. Same materializer shape as `ForgeMaterializer` per `018`.

### SOLID debts in current Forge code (in-scope refactors)

The pitch's "parallel template" language papers over a couple of latent debts. They become in-scope here, not deferred:

- **D1 — Cast Log sentinel rendering**. A two-arm `if/else if` switch exists in `src/castLog/format/displayName.ts:20-33` (confirmed via Q4 audit): `if (record.spellPath === FORGE_SPELL_PATH)` → `"Forge: <file>"` / `"Forge"`, then `if (record.spellPath === REFINE_SPELL_PATH)` → `"Refine"`. Adding `<forge:update>` without refactoring would make it a three-arm switch — OCP violation. Section F replaces this with `SystemSpellRegistry` and a single `registry.describe(path)?.label` lookup. F0 audit step is a confirmation pass (the shape is already known).
- **D2 — `ForgeImprinter` does not declare a contract.** Today it's a concrete class. Declaring `implements SpellImprinter<ForgeFormSnapshot>` is one line and a public statement of LSP intent. **In-scope, one-line change** — does not alter behaviour and the existing test suite must still pass without edits (LSP check).
- **D3 — The directive-count read at dialog-open is a new `obsidian` boundary in the router.** Rather than thread `App` deeper for this read, this iteration extracts `SpellContentReader` as a small port (DIP) and confines the `obsidian` import to the composition root. The router's existing `app: App` field is retained for ContextNotesInput's vault search — it's already a leak, but tightening that is out of scope here. Note: the `SpellContentReader` is *not* used by the imprinter (spell content flows via `executeOnNote`); its sole consumer is `DetailPanelRouter.renderForgeUpdate` for directive counting. **In-scope: do not propagate the `obsidian` import leak to a new code path.**

### Other key decisions

- **K1. Mode entry point is the only mode signal** (mirrors pitch decision; reinforces OCP-by-entry-point rather than content heuristics). The dialog renders what it is told; the dialog does not detect.
- **K2. Spell content is NOT embedded in the dialog state or user prompt.** Instead, `executeOnNote: true` with `activeFilePath: spell.path` is passed to `CastDispatcher`, which generates "Execute this spell against the note at `<path>`." Claude Code reads the live file content at cast time. *Rationale:* (a) eliminates a redundant in-plugin read and `currentContent` field; (b) leverages the existing `executeOnNote` mechanism already used by regular casts; (c) the meta-spell always operates on the on-disk version at cast time — no stale snapshot risk. A quick `cachedRead` is still done at dialog-open time, but solely to count `@cast` directives for the checkbox UI (Q2 decision).
- **K3. The `@cast` directive removal is meta-spell-driven, not plugin-driven** (R8). *Rationale:* the meta-spell is already rewriting the body; injecting a post-write "strip lines" step in the plugin would race with the meta-spell's write. Single owner.
- **K4. The "spell-list cleanup" convention is delegated to the meta-spell instructions** in `forgeUpdateTemplate.ts`. Mirror Refine's Mode 3 step 5 wording ("Remove all `@cast` lines after processing"). Templates are tested with substring assertions so future copy-edits don't silently drop the rule.
- **K5. `<forge:update>` is the cast-log sentinel; `forge-update.md` is the materialised file name.** Two namespaces, kept separate (same pattern `018` established for `<forge>` vs `forge.md`).
- **K6. The dialog's *Apply @cast directives* checkbox does NOT keyboard-trap.** Mouse / Tab / Space — same as any browser checkbox. No `KeyboardController` binding. *Rationale:* parallel to the OptionsPanel Refine variant select decision per `029` — controls past the main action are out of the keyboard flow.
- **K7. The Forge button on the OptionsPanel is **placed below Reset**** (per pitch). Implementation: `OptionsPanel.#buildFormControls` appends the button after the existing button row, in its own row. CSS class `grimoire-forge-update-row` for any future styling hook.
- **K8. The forge-update meta-spell prompt explicitly preserves frontmatter by default** (R10). Embedded instruction: *"Preserve YAML frontmatter exactly — including `tags`, `grimoire-execute-on-note`, and any other keys — unless the user's description explicitly requests changes to it."* Verbatim in template; tested by substring assertion.
- **K9. The forge-update meta-spell prompt instructs Claude to use line-level patches when local, full body rewrite when structural** (parallel to Refine's Output Rules section, per `019`/`refineTemplate.ts`). Mirroring keeps the implementation predictable for users who already understand Refine.

### Patterns considered (design-patterns Step 1 + Step 3 self-critique)

| Pattern | Decision | Reason |
|---|---|---|
| **Strategy** for `ForgeMode` rendering | *Adopted in spirit, not as a class hierarchy.* | The dialog has two modes today. A `ForgeModeRenderer { renderName, renderDescription, renderCheckbox }` strategy would split the dialog across two files for two cases — ceremony with no second adopter beyond the test seam. The discriminated union + small `if (mode.kind === 'update')` branches inside the dialog is the right size. Step 3 self-critique: revisit if a third mode lands. |
| **Strategy** for `SpellImprinter` | *Adopted.* `SpellImprinter<S>` is the strategy interface; create and update imprinters are concrete strategies; the popup builder is the context that selects which to invoke per user gesture. Step 3 self-critique: this is the textbook case — two implementations with the same call shape, selected by entry point. |
| **Template Method** for the two imprinters' shared sequence (validate remote → generate id → build prompt → log → notify → close → cast) | *Rejected — YAGNI.* The shared sequence is ~10 lines and the variations are non-trivial (different snapshot type, different user-prompt builder, different sentinel, different paths). A base class would push too many type parameters and lifecycle hooks into a shape that only two classes use. Code duplication of ~10 well-tested lines is cheaper than the abstraction. Step 3 self-critique: extract a `BaseImprinter` only if a third imprinter arrives. |
| **Registry** for system spell sentinels (`SystemSpellRegistry`) | *Adopted.* OCP seam; one register call per system spell. Step 3 self-critique: passes — adding a new system spell is purely additive. |
| **Adapter** for `SpellContentReader` over `app.vault.cachedRead` | *Adopted.* DIP seam; one-method interface; trivial production impl; trivial test stub. Step 3 self-critique: passes — alternative (`app: App` passed deeper) would propagate `obsidian` import into the imprinter, breaking the node-only test environment. |
| **Observer** for "spell content changed → refresh dialog" | *Rejected.* Read-once snapshot is the design (K2). Observer machinery would invite the very TOCTOU surface K2 rules out. |
| **Factory** for `ForgeUpdateImprinter` | *Rejected.* Constructed once in `CommandPopupBuilder` with stable deps. Factory would add a layer with one client. |
| **Decorator** on `ForgeImprinter` to "add update behaviour" | *Rejected — wrong shape.* Update is not a behavioural extension of create; it has a different input shape, different sentinel, different prompt. Forcing a decorator would either widen create's interface or hide update behind one (ISP violation). |
| **Memento** for spell file content snapshot | *Considered, rejected as a class.* The captured content lives inside the `ForgeMode.update` variant — that's a memento in spirit. A dedicated `SpellContentMemento` class adds nothing. |
| **Command** for `forgeUpdateAction` | *Effectively adopted via the callable type.* `ForgeUpdateAction = (spell: Spell) => void` is the command shape; no class wrapper needed (matches existing `CastAction` / `RefineCastAction` / `ImprintAction` conventions per `003`/`005`). |

## Perspective synthesis (multi-perspective sweep)

Four perspectives applied to the pitch.

### Minimalist

- *Cut candidates considered:* the `Apply @cast directives` checkbox (the user could just remove the lines themselves before clicking Forge); the `directiveCount` indicator on the checkbox label; the new `<forge:update>` Cast Log sentinel (could reuse `<forge>`); the `SystemSpellRegistry` refactor.
- *Verdict:*
  - **Keep** the `Apply @cast directives` checkbox + count indicator — this is the headline ergonomic of the pitch ("annotate the change"). Removing it collapses the feature to "describe the change" only.
  - **Keep** the `<forge:update>` sentinel — distinguishing the two operations in the Cast Log is what makes the log a useful audit trail. Conflating them re-creates the "what did I cast on this spell?" ambiguity the log was built to solve.
  - **Keep** the `SystemSpellRegistry` refactor — it's the *enabling* shape that makes adding the new sentinel a one-line registration. Without it, this iteration's sentinel addition is a switch edit and the next iteration's is another switch edit.
- *Cuts taken:* no Forge-button keyboard shortcut, no pre-cast diff preview, no version/backup, no batch update, no `executionMode === 'remote' && portalHost === ''` UX beyond the existing notice.

### Extensibility

- *Tested at 10×:* user with 50 spells, each updated multiple times across sessions — Cast Log entries multiply but each row is independent; no per-spell aggregation needed. The `forge-update.md` materialiser writes one file per onload; cost is invariant in spell count.
- *Seam for future `<forge:translate>` / `<forge:split>` / `<forge:merge>`:* `SystemSpellRegistry.register()` + a new `ForgeXImprinter` implementing `SpellImprinter<XSnapshot>` + a new `ForgeMode.kind === 'translate'` discriminator + a new `forgeXAction` callback on the popup. Five known extension points, each linear in size.
- *Seam for user-supplied update template (analogous to Custom Refine in `029`):* not built. If users request it, the same scanner + resolver + variant-select pattern lifts cleanly (and the `SystemSpellRegistry` already knows about `<forge:update>` — adding a "custom forge-update file" doesn't disturb the sentinel taxonomy). **Out of scope here.**
- *Decision:* do not pre-build the parametric template path. Add it when the second customisation kind ships (mirrors `029`'s scanner-parametrisation decision).

### Devil's advocate

- *Riskiest assumption:* the meta-spell can reliably rewrite a spell file in place without corrupting frontmatter. **Mitigated** by K8 — explicit preserve-frontmatter instruction in the template + a substring-asserted test on the template.
- *Hidden failure mode 1:* the user opens the update dialog, the spell file is mutated by an external process (sync, another editor), the user submits. **Documented as accepted** under K2 — read-once snapshot is the intended contract. The Cast Log row records the cast; the user can compare against backup/git.
- *Hidden failure mode 2:* the meta-spell's MCP-write fails midway, leaving the spell partially overwritten. **Identical to today's create-mode partial-write risk**; the meta-spell's instructions include "write the file" as the final step, atomic per Obsidian's `Vault.create`. We do not introduce write-side journaling.
- *Hidden failure mode 3:* the user submits with no description AND with `applyCastDirectives = false` (R/H — submitting an empty change). **Mitigated** by the submit-button disable rule in Error handling.
- *Hidden failure mode 4:* the user submits with `applyCastDirectives = true` but the spell body's `@cast` lines were stripped between dialog open and submit. **Handled** — `extractCastDirectives` returns `[]`; meta-spell user prompt notes "0 directives"; cast proceeds with description-only effect; the meta-spell's "remove `@cast` lines" instruction has nothing to remove. No crash, no notice, expected behaviour.
- *Hidden failure mode 5:* race between dialog-open's `await spellContentReader.read(...)` and the user clicking Forge a second time. **Mitigated:** Forge button click is a synchronous handler; the second click happens on a still-mounted options panel. The first click's read is in-flight; if it completes after the second click, the popup is already in detail phase and the result is unused. Acceptable. *(Alternative considered: disable the Forge button while read is in-flight. Rejected — single-frame timings make this a non-issue in practice; complicates the panel for no observed benefit.)*
- *Hidden failure mode 6:* the new `forge-update.md` materialiser races with the existing `forge.md` materialiser. **No race**: they write different files; concurrent invocation is acceptable (`DataAdapter.write` is atomic enough; same write pattern as today's two-cast-log files).

### User advocate

- *Smoothest path:* Right-arrow on spell → options panel → click Forge → dialog opens with the spell's name shown statically → type "tighten structure section" → checkbox visible because the spell already has two `@cast` lines, defaulted on → click Submit. Toast confirms; spell file updates in place; cast log row appears with "Forge (update)" label.
- *Friction points:*
  - The Forge button is below Cast and Reset — mouse-only by default. **Accepted** per K6 — the pitch explicitly de-emphasises this control.
  - The dialog is title-less but the static name field plus the description's repurposed placeholder should make mode obvious. **Verify with the integration test.** If a future user complaint emerges, add a small "Updating: <name>" sublabel — out of scope here.
  - Empty description + unchecked checkbox = disabled submit. The disabled state must read as intentional, not broken — use the same disabled style the rest of the plugin uses (no custom message). **Verify with the integration test.**
  - The cast log row label "Forge (update)" — discoverable, distinguishable from "Forge". Consider an icon hint later if Cast Log gets crowded. Out of scope.
- *Verdict:* the surface is small, opt-in (must enter the options panel to reach it), and reads consistent with the existing Refine/Forge patterns. No friction points that warrant scope additions.

### Synthesis

All four perspectives agree on the shape: parallel template + parallel imprinter + dialog-mode discriminator + Forge button below Cast/Reset + `<forge:update>` sentinel via registry + read-once snapshot. Tensions resolved:

- *Minimalist vs Extensibility on `SystemSpellRegistry`:* extensibility wins — the registry is the one structural addition that pays off twice (this iteration's sentinel + the next one).
- *Devil's-advocate vs User-advocate on submit-button-disable:* user-advocate's "disabled must look intentional" satisfied by the integration test, not by custom UX.
- *Minimalist vs User-advocate on the directive-count indicator:* user-advocate wins — the count is the difference between "checkbox is mystery-meat" and "checkbox tells the user there's something to apply".

## Technical notes

- **Where to read the spell body for directive counting.** Use `app.vault.cachedRead(file)` (not `Vault.read`). Only needed once at dialog-open time, solely to call `countCastDirectives`. The result is discarded after the count — `currentContent` is NOT stored. The meta-spell receives the live file via `executeOnNote: true, activeFilePath: spell.path` passed to `CastDispatcher`. `CastDispatcher` already generates "Execute this spell against the note at `<vaultMountPath>/<path>`." — the imprinter just sets both flags.
- **`SpellPath` → `TFile` conversion.** `app.vault.getAbstractFileByPath(path)`; type-check via `instanceof TFile`. Wrap in the `SpellContentReader` production impl so callers stay typed against the port.
- **`forge-update.md` content.** Stand up the template with explicit invariants: (a) "Update an existing spell file in place" headline; (b) "Preserve YAML frontmatter exactly … unless the user's description explicitly requests changes" (K8); (c) "If `@cast` directives are present in the user prompt, follow them as authoritative change instructions, then remove the `@cast` lines from the final body" (K3, K4); (d) "Prefer line-level patches when the change is local; full-body rewrite only when structural" (K9); (e) standard `vaultMountPath` MCP fallback (parallel to `018`'s create template).
- **`buildForgeUpdateUserPrompt` shape.** A small structured block (parallel to `buildForgeUserPrompt`). **No `currentContent` or `directives` array** — spell content reaches Claude via `executeOnNote`; directives are visible in the note itself:
  ```
  Follow the workflow in your system prompt for these inputs:

  - **Target spell path:** <spellPath>
  - **Target spell name:** <spellName>
  - **Model:** <model>
  - **Effort:** <effort | n/a>
  - **Apply @cast directives:** <true|false>
  - **Directive count:** <N>
  - **Description (what should change):**
  > <description>
  ```
  Pure function; tested with substring assertions for each field header + edge cases (`effort: null` → `n/a`; `applyCastDirectives: false` with `directiveCount: 0`).
- **`countCastDirectives` and `extractCastDirectives`** import `CAST_LINE_REGEX` from `src/editor/castLineRegex.ts`. They iterate body lines (`body.split('\n')`), test each against the regex (which is line-start anchored), and either count or push the full original line text into the result. Lines whose body starts with `@cast` but does not end at whitespace or EOL (e.g. `@casting`) are correctly excluded by the regex's `(?=\s|$)` lookahead.
- **Materializer lifecycle.** Mirror `018`'s `ForgeMaterializer` exactly — `CastLogModule.initStartupMaintenance` awaits both materializers. Settings save fires each via its own method: the existing `materializeForge()` is **unchanged**; the new `materializeForgeUpdate()` runs the `ForgeUpdateMaterializer` in parallel (Q5 decision: two separate methods with similar name pattern, no rename of the existing one).
- **Cast log sentinel rendering.** The detail of *what* this changes depends on the audit step (F0). Possibilities:
  - If a switch exists in the row renderer: extract → registry; one removed branch + one new `register` call.
  - If a lookup table exists: add a `<forge:update>` entry; no other change.
  - If sentinel labels are computed inline at multiple call sites: extract the lookups to a single helper that consults the registry. **One pass** to centralise.
- **Submit button disable rule.** `description.trim().length > 0 || (applyCastDirectives && directiveCount > 0)`. Implementation: reactively update `submitBtn.disabled` on `input` events from the description textarea and `change` events from the checkbox. Keep the rule colocated with `wireSubmitHandler` in `ForgeSentinelDetail`.
- **Cast Log "Forge (update)" label text** is registered exactly once in the registry. Pluralisation of the directive-count indicator on the dialog checkbox label is exactly once in `ForgeSentinelDetail` (R14).
- **Test environment.** Unit tests live in `tests/forge/` (node env). UI integration tests live in `tests/integration/` (happy-dom). The existing `tests/__mocks__/obsidian.ts` mock already exports `Vault`, `TFile`, `Notice`, `Modal`, `Scope` — no mock additions required for this plan. **`Vault.cachedRead`** is the only new method that may or may not be already mocked; if not, the mock needs one method (`cachedRead: vi.fn(async () => '')`). Verify in A2.
- **ESLint.** `obsidianmd/no-manual-html-headings` — N/A here (no headings in the dialog or buttons). `@typescript-eslint/no-misused-promises` — watch the Forge button's onClick if it ever awaits the spell-content read directly (it shouldn't; the await lives in the router, not in the panel).

## Open questions — all resolved

- **Q1. `@cast` directive regex.** ✅ **Decided:** use `/^@cast(?=\s|$)/` from `src/editor/castLineRegex.ts` verbatim. No stricter pattern.
- **Q2. Spell-file read timing / content embedding.** ✅ **Decided:** do NOT embed spell content in the user prompt. Pass `executeOnNote: true, activeFilePath: snapshot.spellPath` to `CastDispatcher` — Claude Code reads the live file. A `cachedRead` is still done at dialog-open time solely to count `@cast` directives for the checkbox UI; the content is discarded after the count. See K2.
- **Q3. Behaviour when `@cast` directives are present but checkbox unchecked.** ✅ **Decided:** **preserve** — the meta-spell sees `applyCastDirectives: false` and leaves `@cast` lines in the rewritten body unchanged.
- **Q4. Cast Log sentinel switch — does it exist today?** ✅ **Confirmed:** yes, an `if/else if` switch exists in `src/castLog/format/displayName.ts:20-33`. Section F's OCP refactor is fully warranted.
- **Q5. `CastLogModule.materializeForge()` rename.** ✅ **Decided:** **no rename**. Keep `materializeForge()` unchanged; add a new parallel method `materializeForgeUpdate()`. Two separate methods with a similar name pattern.
- **Q6. Spell modified between dialog open and submit.** ✅ **Decided:** accept divergence. The cast operates on the on-disk state at cast time (via `executeOnNote`). No change-detection notice.
- **Q7. Submit-button disable rule.** ✅ **Decided:** disable when description is empty AND (`applyCastDirectives` is false OR `directiveCount === 0`).
- **Q8. Active note vs closed note.** ✅ **Decided:** spell does not need to be open. The `cachedRead` for directive counting and `executeOnNote` path both work regardless of editor state.
- **Q9. Model/effort defaults for the update dialog.** ✅ **Decided:** global/spell defaults apply as usual — the dialog shows the same model/effort selector as the regular Forge dialog (not the panel's live transient values). User can change before submitting.
- **Q10. Static name field UX.** ✅ **Decided:** plain `<div>` — a small `<label>Updating spell:</label>` above and the spell name as non-form text below. Not a disabled `<input>`.

## Todos

Each todo: `- [ ] <id>: <description> — <S|M|L>, <tier>`. Tier groups dispatch in plan-listed order. Within each section, `**ui-integration-tester**` → `**junior-dev**` → `**senior-dev**` → `**lead-dev**`.

### A. Domain scaffolding — types, sentinel constant, path accessors

#### Section briefing

**What this section produces:** the new `FORGE_UPDATE_SPELL_PATH` constant on `SystemSpellPaths.ts`; the `forgeUpdateSpellPathPluginRel()` / `forgeUpdateSpellPathVaultRel()` accessors on `PluginPaths`; the new `ForgeMode` discriminated union; the new `ForgeUpdateFormSnapshot` interface; the new `SpellImprinter<S>` interface; the `implements SpellImprinter<ForgeFormSnapshot>` one-line addition on existing `ForgeImprinter` (LSP debt D2). No UI changes. No new behaviour observable outside compile-time checks and unit tests.

**Design context the executor needs upfront:**
- `SystemSpellPaths.ts` already exports `FORGE_SPELL_PATH = '<forge>'` and `REFINE_SPELL_PATH = '<refine>'`. Add a third `FORGE_UPDATE_SPELL_PATH = '<forge:update>' as const` *next to them* (one file, one section).
- `PluginPaths` already exposes `forgeSpellPathPluginRel()` / `forgeSpellPathVaultRel()` and the same pair for refine. The new accessors return `normalizePath(\`${this.#pluginDir}/forge-update.md\`)` — exact mirror.
- `ForgeMode` is a tiny discriminated union (see Interfaces). Keep in its own file under `src/forge/`.
- `ForgeUpdateFormSnapshot` is a plain interface; goes in its own file alongside the existing `ForgeFormSnapshot.ts`.
- `SpellImprinter<S>` interface is a one-method generic. Goes in `src/forge/SpellImprinter.ts`.
- The `implements SpellImprinter<ForgeFormSnapshot>` addition on `ForgeImprinter` is **purely declarative** — no method body changes. The existing test suite must remain green with zero edits (LSP check).

**Cross-section couplings:**
- A1 (`FORGE_UPDATE_SPELL_PATH`) is consumed by E (`ForgeUpdateImprinter` log-write call) and F (`SystemSpellRegistry` registration).
- A2 (`PluginPaths` accessors) is consumed by E (imprinter's path thunk) and F (materializer wiring in `main.ts`).
- A3 (`ForgeMode`) is consumed by C (dialog mode-split) and D (router's `renderForgeUpdate`).
- A4 (`ForgeUpdateFormSnapshot`) is consumed by C (dialog `onUpdateSubmit` callback type) and E (imprinter signature).
- A5 (`SpellImprinter<S>`) is consumed by E (`ForgeUpdateImprinter` declaration); A6 (`implements SpellImprinter<ForgeFormSnapshot>` on existing `ForgeImprinter`) is the LSP debt fix.
- None of A's todos depend on each other; safe to land in one commit.

**Section-level Red criterion:** `npm test`, `npm run lint`, `npm run arch:check` all green. New files exist at the documented paths. `FORGE_UPDATE_SPELL_PATH === '<forge:update>'`. `PluginPaths.forgeUpdateSpellPathVaultRel()` returns the normalized path. `ForgeImprinter` now declares `implements SpellImprinter<ForgeFormSnapshot>` and the existing `tests/ForgeImprinter.test.ts` passes **without modification** (LSP gate).

**junior-dev**

- [x] A1: add `export const FORGE_UPDATE_SPELL_PATH = '<forge:update>' as const;` to `src/domain/spells/SystemSpellPaths.ts`, immediately below `REFINE_SPELL_PATH`. — S, junior-dev
- [x] A2: extend `src/infra/PluginPaths.ts` with `forgeUpdateSpellPathPluginRel(): string` and `forgeUpdateSpellPathVaultRel(): string`, both returning `normalizePath(\`${this.#pluginDir}/forge-update.md\`)`. JSDoc each, mirroring the existing forge accessors. Extend `tests/PluginPaths.test.ts` with two cases proving the accessors return the normalized path. — S, junior-dev
- [x] A3: create `src/forge/ForgeMode.ts` exporting the `ForgeMode` discriminated union per Interfaces. Import `Spell` from `src/domain/spells/Spell.ts`. — S, junior-dev
- [x] A4: create `src/forge/ForgeUpdateFormSnapshot.ts` exporting the `ForgeUpdateFormSnapshot` interface per Interfaces. Import `Effort` and `ModelId` and `SpellPath` from their existing homes. — S, junior-dev
- [x] A5: create `src/forge/SpellImprinter.ts` exporting the `SpellImprinter<S>` generic interface per Interfaces. JSDoc: "DIP seam for create/update Forge pipelines. Either implementation must honestly satisfy the `imprint` contract — no `NotImplemented` throws, no callers needing `instanceof`." — S, junior-dev
- [x] A6: add `implements SpellImprinter<ForgeFormSnapshot>` to the class declaration of `ForgeImprinter` in `src/forge/ForgeImprinter.ts`. **Do not change any method body or import.** `tests/ForgeImprinter.test.ts` must pass unchanged (LSP gate). — S, junior-dev
- [x] A7: confirm `npm test`, `npm run lint`, `npm run arch:check` all green. — S, junior-dev

### B. Pure template rendering + cast-directive extraction

#### Section briefing

**What this section produces:** the two new pure-function modules: `src/forge/forgeUpdateTemplate.ts` exporting `renderForgeUpdateSystemPrompt` and `src/forge/buildForgeUpdateUserPrompt.ts` exporting `buildForgeUpdateUserPrompt`; and the cast-directive extractor at `src/forge/castDirectiveExtractor.ts`. All three are pure (no I/O, no DOM, no `obsidian` import). Plus the `SpellContentReader` interface declaration (the production adapter wires up in section G).

**Design context the executor needs upfront:**
- `renderForgeUpdateSystemPrompt(input)` returns a long template literal string parallel in shape to `renderForgeSystemPrompt` (see `src/forge/forgeTemplate.ts` for the shape). Must contain the load-bearing substrings per K8 and K9 (preserve frontmatter; line-level patches preferred; `@cast` directive removal). Must contain the MCP/`VAULT_MOUNT_PATH` fallback section parallel to create-mode. Must NOT contain any per-cast values (`description`, `name`, etc.).
- `buildForgeUpdateUserPrompt(input)` returns the structured block from Technical notes. Substring-assertion-friendly: each section has a stable header. Pure function; tested with the matrix `(directives === null) | (directives === []) | (directives === [...])` × `(effort === null) | (effort set)`.
- `castDirectiveExtractor.ts` imports `CAST_LINE_REGEX` from `src/editor/castLineRegex.ts` — **no copy of the regex**. `countCastDirectives(body)` returns the line count; `extractCastDirectives(body)` returns the matched lines verbatim (full original line text including leading `@cast` and trailing args).
- `SpellContentReader` interface declaration only — the production adapter is wired in G (composition root). Tests inject a stub.

**Cross-section couplings:**
- B1 (`renderForgeUpdateSystemPrompt`) consumed by E (`ForgeUpdateMaterializer.run` calls it).
- B3 (`buildForgeUpdateUserPrompt`) consumed by E (`ForgeUpdateImprinter.imprint` calls it).
- B5 (`castDirectiveExtractor`) consumed by D (`DetailPanelRouter.renderForgeUpdate` calls `countCastDirectives` at dialog-open time) and E (`ForgeUpdateImprinter.imprint` calls `extractCastDirectives` when `applyCastDirectives === true`).
- B7 (`SpellContentReader` interface) consumed by D (router dep), E (not directly; the router pre-reads and hands content as part of `ForgeMode.update`), G (composition root wires the production adapter).

**Section-level Red criterion:** `tests/forge/forgeUpdateTemplate.test.ts`, `tests/forge/buildForgeUpdateUserPrompt.test.ts`, `tests/forge/castDirectiveExtractor.test.ts` all exist and pass. Each load-bearing substring identified in Technical notes is covered by exactly one `toContain` assertion (no snapshot files). `npm test`, `npm run lint`, `npm run arch:check` all green.

**junior-dev**

- [x] B1: create `src/forge/forgeUpdateTemplate.ts` exporting `ForgeUpdateSystemPromptInput` and `renderForgeUpdateSystemPrompt(input)`. Body must contain: (a) `Auto-generated by Grimoire ForgeUpdateMaterializer. Do not edit — overwritten on every plugin load and settings save.` banner in `%%` block; (b) Execution Mode callout (IMMEDIATE EXECUTION); (c) MCP Tools section with `vaultMountPath` substituted; (d) **explicit preserve-frontmatter instruction** (verbatim K8 wording); (e) **explicit `@cast` directive-removal instruction** matching Refine Mode 3 step 5 wording; (f) **prefer line-level patches** rule (K9). Must NOT contain `description`, `name`, `model`, `effort`, `applyCastDirectives`, `currentContent`, or `directiveCount` (those live in the user prompt). — M, junior-dev
- [x] B2: create `tests/forge/forgeUpdateTemplate.test.ts` with one `toContain` per invariant in B1's spec (Execution Mode, MCP Tools, `vaultMountPath` substitution, preserve-frontmatter sentence, `@cast` removal sentence, line-level-patches sentence, banner present, no leakage of per-cast names). Mirror the shape of `tests/forge/forgeTemplate.test.ts`. — S, junior-dev
- [x] B3: create `src/forge/buildForgeUpdateUserPrompt.ts` exporting `ForgeUpdateUserPromptInput` and `buildForgeUpdateUserPrompt(input)` per Interfaces. **No `currentContent` or `directives` fields** — spell content flows via `executeOnNote`. Structured block per Technical notes: spellPath, spellName, model, effort, applyCastDirectives, directiveCount, description. `effort === null` renders as `n/a`. — S, junior-dev
- [x] B4: create `tests/forge/buildForgeUpdateUserPrompt.test.ts` covering: spellPath/spellName/model/effort/description appear; `effort: null` → `n/a` branch; `effort` set branch; `applyCastDirectives: true` and `false` branches; `directiveCount` rendered; description appears as quoted block; **no `currentContent` or directives list present in output** (regression guard). — S, junior-dev
- [x] B5: create `src/forge/castDirectiveExtractor.ts` exporting `countCastDirectives(body: string): number` and `extractCastDirectives(body: string): string[]`. Both import `CAST_LINE_REGEX` from `src/editor/castLineRegex.ts` — **no duplicate regex literal**. Implementation: `body.split('\n').filter(line => CAST_LINE_REGEX.test(line))` → `.length` for count, the array itself for extract. — S, junior-dev
- [x] B6: create `tests/forge/castDirectiveExtractor.test.ts` covering: empty body → 0 / `[]`; body with no `@cast` lines → 0 / `[]`; one `@cast tighten the structure` line → 1 / `['@cast tighten the structure']`; multiple directives in document order; `@casting` and `@castaway` and indented `  @cast foo` correctly excluded (regex `^@cast(?=\s|$)`); `@cast` alone on a line (no args) → 1 / `['@cast']`. — S, junior-dev
- [x] B7: create `src/forge/SpellContentReader.ts` exporting the `SpellContentReader` interface per Interfaces. One-method interface; JSDoc names the DIP intent. No production adapter in this section — that lives in G. — S, junior-dev
- [x] B8: confirm `npm test`, `npm run lint`, `npm run arch:check` all green. — S, junior-dev

### C. Dialog mode-split — ForgeSentinelDetail learns `ForgeMode`

#### Section briefing

**What this section produces:** modifies `src/ui/components/ForgeSentinelDetail.ts` to accept a `mode: ForgeMode` parameter on `render(...)` and to render either the create-mode form (today's behaviour, intact) or the update-mode form (static name, repurposed description, `Apply @cast directives` checkbox in place of `Execute on active note`). Two narrowly-typed callbacks: `onCreateSubmit` and `onUpdateSubmit`. Submit-button disable rule per K7/Q7. Pluralised count indicator per R14. No new wiring into the popup yet — that lands in D.

**Design context the executor needs upfront:**
- Current dialog calls `callbacks.onSubmit(snapshot: ForgeFormSnapshot)` (see `ForgeSentinelDetail.ts` line 137). New shape: `callbacks: { onBack, onCreateSubmit, onUpdateSubmit }`. The dialog's internal submit dispatch chooses one based on `mode.kind` (a single `if (mode.kind === 'update') { onUpdateSubmit(...) } else { onCreateSubmit(...) }` at the submit handler — the *only* mode-switch in the file).
- Static name field (update mode, R3a): render as a `<div>` with a small `<label>Updating spell:</label>` above and the spell's name as text below (per Q10 default). No `<input>`; no focus management for it.
- Description field (R3b): same `<textarea>`, but the placeholder string is mode-dependent: `'Description'` (create) → `'What should change about this spell?'` (update).
- Checkbox swap (R3c, R4): in update mode AND `mode.directiveCount > 0`, replace the `Execute on active note` checkbox with one labelled `'Apply @cast directives'` plus a count indicator suffix `' (N directive found)'` for `N === 1` or `' (N directives found)'` for `N !== 1`. The checkbox defaults to `checked`. When `mode.directiveCount === 0`, the checkbox is **not rendered**. In create mode, the existing `Execute on active note` checkbox renders unchanged.
- Submit-button disable rule (Q7 default): `description.trim().length > 0 || (applyCastDirectives && mode.directiveCount > 0)`. Reactive: re-evaluate on `input` (description) and `change` (checkbox). In create mode the rule degrades to "always enabled" (the existing behaviour). Disabled state: `submitBtn.disabled = true` plus the standard browser disabled style.
- Update-mode model/effort defaults (Q9 default): D will pass the panel's live snapshot model/effort as `FormDefaults`. The dialog code itself does not branch on this — it just renders the defaults it's given.
- Update-mode submit builds the snapshot from: `mode.spell.path` / `mode.spell.name`, the description textarea, model select, effort row, the checkbox value, and `mode.directiveCount`. **No `currentContent`** — it was never stored in the mode; spell content flows via `executeOnNote`.

**Cross-section couplings:**
- C depends on A3 (`ForgeMode`) and A4 (`ForgeUpdateFormSnapshot`).
- C0 (integration test) defines the Red criterion that C1-C5 implement to satisfy. D's `renderForgeUpdate` consumes the new param shape; D's router is *not* exercised in C — the integration test mounts the dialog directly with a stub `ForgeMode`.
- D's existing call to `ForgeSentinelDetail.render({ contentEl, callbacks: { onBack, onSubmit }, defaults })` in `DetailPanelRouter.renderForge` (line 64-66) needs to be updated to the new callback shape — that update is part of D, not C (C does not break the existing call site; D's senior-dev replaces the callsite alongside the create-mode test edits).
- **However**, breaking the call site IS in C unless the executor lands C+D together. Per the planner convention (Section briefings name the coupling): C's todo C1 includes a transitional shim — accept the new `mode` param and the new `callbacks` shape, but also accept the old `callbacks: { onBack, onSubmit }` shape via a `callbacks: NewShape | OldShape` overload, deprecation-tagged. **OR** the executor lands C and D in one commit. The latter is cleaner — recommended.

**Section-level Red criterion:** `tests/integration/forge-sentinel-detail-update.spec.ts` (new) covers, with happy-dom and a stub `ForgeMode`:
1. `mode.kind === 'create'`: dialog renders today's shape exactly — `<input>` for name (not a `<div>`), placeholder `'Description'`, `Execute on active note` checkbox present and checked, submit fires `onCreateSubmit` with `ForgeFormSnapshot`.
2. `mode.kind === 'update'`, `directiveCount === 0`: dialog renders static `<div>` for name (not `<input>`), description placeholder is `'What should change about this spell?'`, **no** `Execute on active note` checkbox, **no** `Apply @cast directives` checkbox, submit fires `onUpdateSubmit` with `ForgeUpdateFormSnapshot` (including `applyCastDirectives: false`, `directiveCount: 0`).
3. `mode.kind === 'update'`, `directiveCount === 3`: dialog renders the `Apply @cast directives` checkbox defaulted to `checked` with label suffix `' (3 directives found)'`; toggling the checkbox flips `applyCastDirectives` in the submitted snapshot; submit fires `onUpdateSubmit` with `directiveCount: 3`.
4. `mode.kind === 'update'`, `directiveCount === 1`: label suffix is `' (1 directive found)'` (singular pluralisation, R14).
5. Submit-button disable rule (update mode): with empty description AND checkbox unchecked → disabled; type description → enabled; clear description → disabled; check checkbox (with `directiveCount > 0`) → enabled even with empty description.
6. The captured snapshot in update mode carries `spellPath`, `spellName`, and `directiveCount` verbatim from `mode`. **No `currentContent`** in snapshot (spell content flows via `executeOnNote`).

Existing `tests/integration/forge-sentinel-detail.spec.ts` must remain green — assertion #1 above is its current behaviour, just re-verified through the new mode shape.

**ui-integration-tester**

- [x] C0: write `tests/integration/forge-sentinel-detail-update.spec.ts` covering the six assertions above. Use `vi.fn()` for `onBack`, `onCreateSubmit`, `onUpdateSubmit`. Construct `mode` as a plain object (create or update variant). Mount the dialog with `new ForgeSentinelDetail(new Scope())` and call `render(...)` against a `document.createElement('div')`. — M, ui-integration-tester

**senior-dev**

- [x] C1: modify `src/ui/components/ForgeSentinelDetail.ts` to accept `mode: ForgeMode` in `ForgeSentinelDetailParams`. Change `callbacks` to `{ onBack; onCreateSubmit: (s: ForgeFormSnapshot) => void; onUpdateSubmit: (s: ForgeUpdateFormSnapshot) => void }`. Add private mode storage. — M, senior-dev (5695214)
- [x] C2: in `ForgeSentinelDetail.render`, branch the name-field renderer on `mode.kind`: create → existing `#buildNameField` returning `<input>`; update → new `#buildStaticNameField(mode.spell.name)` returning a `<div>`. Branch the description placeholder on `mode.kind`. The submit handler reads the right snapshot shape and calls the right callback. — M, senior-dev (5695214)
- [x] C3: in `ForgeSentinelDetail.render`, replace the unconditional `#buildExecuteOnNoteCheckbox` call with a mode-aware version: create → existing checkbox; update + `directiveCount > 0` → new `#buildApplyCastDirectivesCheckbox(directiveCount)`; update + `directiveCount === 0` → no checkbox. Implement the singular/plural label per R14. Internal state field `#applyCastDirectives: boolean` defaults `true`. — M, senior-dev (5695214)
- [x] C4: implement the submit-button disable rule per Q7 default. Track in a private `#updateSubmitButtonState(description, applyCastDirectives, directiveCount)` method; call from the description textarea's `input` listener and the checkbox's `change` listener; on initial render, call once with the starting values. In create mode the rule degrades to "always enabled" (omit the bindings or have the method no-op when `mode.kind === 'create'`). — M, senior-dev (5695214)
- [x] C5: update the existing `tests/integration/forge-sentinel-detail.spec.ts` to use the new `callbacks` shape (`onCreateSubmit` in place of `onSubmit`). Existing assertions (renders the name input, description textarea, model select, execute-on-note checkbox; submits with a `ForgeFormSnapshot`) remain — they just reference the new callback name. — S, senior-dev (5695214)
- [x] C6: confirm C0 GREEN, existing `tests/integration/forge-sentinel-detail.spec.ts` GREEN after the rename, `npm test`, `npm run lint`, `npm run arch:check`, `npm run test:integration` all green. — S, senior-dev (5695214)

### D. OptionsPanel Forge button + DetailPanelRouter.renderForgeUpdate

#### Section briefing

**What this section produces:** modifies `src/ui/options/OptionsPanel.ts` to render a third button "Forge" below Cast and Reset when `deps.onForgeUpdate` is supplied. Modifies `src/ui/components/OptionsDetail.ts` to wire `onForgeUpdate` only for the spell variant (not Refine sentinel). Modifies `src/ui/popup/DetailPanelRouter.ts` to accept a `forgeUpdateAction: ForgeUpdateAction` dep and a `spellContentReader: SpellContentReader` dep, and to add a `renderForgeUpdate(contentEl, scope, spell)` method that reads the spell content (async), counts directives, constructs `ForgeMode.update`, mounts `ForgeSentinelDetail` with the new callback shape, and wires `onUpdateSubmit` to the action. The existing `renderForge(contentEl, scope)` is updated for the new callback shape (`onCreateSubmit` in place of `onSubmit`). `CommandPopup` accepts a new `forgeUpdateAction` constructor param and a new `spellContentReader` constructor param (or constructs the reader from `app.vault` — see Q-prefix note: composition root vs popup; default = composition root, so popup takes both as params).

**Design context the executor needs upfront:**
- Per K7, the Forge button placement: in `OptionsPanel.#buildFormControls`, after the existing button row (`grimoire-button-row` containing Cast and Reset), append a new row `<div class="grimoire-forge-update-row">` containing the Forge button. The button calls `deps.onForgeUpdate()` on click. **Render only when `deps.onForgeUpdate !== undefined`** — Refine variant doesn't pass it, so the button doesn't appear.
- `OptionsDetail.#createPanel` already builds `OptionsPanelDeps`. When `params.kind.kind === 'spell'`, add `onForgeUpdate: () => params.onForgeUpdate(params.kind.spell)`. Add `onForgeUpdate?: (spell: Spell) => void` to `OptionsDetailParams`. When `kind.kind === 'refine'`, do not pass `onForgeUpdate` to the panel.
- `DetailPanelRouter.renderSpellOptions` already builds `OptionsDetail` params; add `onForgeUpdate: (spell) => { this.#deps.onExit(); this.renderForgeUpdate(contentEl, scope, spell); }`. The `onExit()` call dismisses the options panel before the dialog mounts, satisfying R2's "dismisses the options panel and opens the Forge dialog".
- `renderForgeUpdate` reads spell content via `await this.#deps.spellContentReader.read(spell.path)` — **for directive counting only** (the content is discarded after `countCastDirectives`). On read failure: `new Notice('Could not read spell content'); this.#deps.onExit();` return. On success: call `countCastDirectives(content)`, build `ForgeMode.update = { kind: 'update', spell, directiveCount }` (**no `currentContent`**), mount `ForgeSentinelDetail`, pass global `formDefaults` for model/effort (Q9 decision: user adjusts in dialog).
- `CommandPopup` constructor params: add `forgeUpdateAction: ForgeUpdateAction` and `spellContentReader: SpellContentReader` to `CommandPopupParams`. Thread through to `DetailPanelRouter` deps. Update `tests/CommandPopup.test.ts` callsites to pass `vi.fn()` and `{ read: vi.fn(async () => '') }` respectively.
- Update `tests/integration/harness.ts` (or equivalent) to accept and forward `forgeUpdateAction?`, `spellContentReader?` options (defaults: `vi.fn()`, `{ read: vi.fn(async () => '') }`).

**Cross-section couplings:**
- D depends on C (new `ForgeSentinelDetail` callback shape).
- D depends on A3 (`ForgeMode`), A4 (`ForgeUpdateFormSnapshot`), B5 (`countCastDirectives`), B7 (`SpellContentReader`).
- D's `forgeUpdateAction` is constructed in G (composition root); D only accepts it. D's `spellContentReader` is constructed in G too.
- D's `renderForgeUpdate` is the user-visible seam; D0 pins it at the popup-integration level.
- The Forge button on Refine's OptionsPanel **must not** render — D0-c pins this regression.

**Section-level Red criterion:** `tests/integration/forge-update-popup.spec.ts` (new) covers:
1. (D0-a) Open popup → ArrowRight on first spell row → options panel renders Cast, Reset, AND Forge buttons (in that DOM order).
2. (D0-b) Click Forge → options panel dismisses, `spellContentReader.read` was called once with the spell's path, dialog renders in update mode (static name, repurposed description placeholder, `Apply @cast directives` checkbox visible iff content contains `@cast` lines).
3. (D0-c) Open popup → ArrowDown to Refine sentinel → ArrowRight (opens Refine options panel) → no Forge button is present in the DOM (regression guard).
4. (D0-d) Submit the update dialog → `forgeUpdateAction` invoked once with the spell argument; the dialog's `onUpdateSubmit` snapshot was forwarded by the router (assert by spying `forgeUpdateAction = vi.fn()` and inspecting the captured snapshot via the test harness — see below for the wiring).
5. (D0-e) `spellContentReader.read` throws → `Notice` posted with text `'Could not read spell content'`; popup returns to search phase; no dialog mounted.

Existing `tests/integration/options-panel.spec.ts` and `tests/integration/options-panel-popup.spec.ts` (or equivalents) remain green.

**Note on snapshot assertion for D0-d:** the simplest seam is to spy on `forgeUpdateAction` (which receives only `spell`) — the snapshot itself is consumed by the action's downstream wiring (E's imprinter). If a finer assertion is needed, the harness can spy on the router's internal dispatcher; flag as a Q to the executor if D0-d proves brittle.

**ui-integration-tester**

- [x] D0: write `tests/integration/forge-update-popup.spec.ts` covering the five assertions above. Use the existing popup test harness; extend it to forward `forgeUpdateAction?` and `spellContentReader?` (default: `vi.fn()` and a stub returning a body with two `@cast` lines for the directive-count assertion). — M, ui-integration-tester

**senior-dev**

- [x] D1: modify `src/ui/options/OptionsPanel.ts` per K7: add `onForgeUpdate?: () => void` to `OptionsPanelDeps`; in `#buildFormControls`, after the existing `buttonRow`, conditionally create a `grimoire-forge-update-row` div and a `'Forge'` button (`type="button"`) whose click handler calls `deps.onForgeUpdate?.()`. — S, senior-dev (f027282)
- [x] D2: modify `src/ui/components/OptionsDetail.ts`: add `onForgeUpdate?: (spell: Spell) => void` to `OptionsDetailParams`. In `#createPanel`, when `params.kind.kind === 'spell' && params.onForgeUpdate`, pass `onForgeUpdate: () => params.onForgeUpdate!(params.kind.spell)` to `OptionsPanel.render` deps. Otherwise omit. — S, senior-dev (f027282)
- [x] D3: modify `src/ui/popup/DetailPanelRouter.ts`: add `forgeUpdateAction: ForgeUpdateAction` and `spellContentReader: SpellContentReader` to `DetailPanelRouterDeps`. Export `ForgeUpdateAction = (spell: Spell) => void` from the same module (parallel to existing action types). In `renderSpellOptions`, pass `onForgeUpdate: (spell) => { exit(); void this.renderForgeUpdate(contentEl, scope, spell); }` to OptionsDetail params. — S, senior-dev (f027282)
- [x] D4: implement `DetailPanelRouter.renderForgeUpdate(contentEl, scope, spell)` per Design context: `reattachTabBar`, async-read content, on success build `ForgeMode.update`, mount `ForgeSentinelDetail` with the new callback shape, wire `onUpdateSubmit: (snapshot) => { this.#deps.forgeUpdateAction(spell); /* snapshot flows via the dialog's wiring; see E */ exit(); }`. Refer to the E section for how the snapshot reaches the imprinter — D's job is to *capture and forward* the snapshot via a per-dialog closure that the imprinter receives. **Implementation detail:** the cleanest wiring is `forgeUpdateAction = (spell, snapshot) => imprinter.imprint(snapshot, settings, close)` — i.e. extend `ForgeUpdateAction = (spell: Spell, snapshot: ForgeUpdateFormSnapshot) => void`. Adjust the type accordingly. — M, senior-dev (f027282)
- [x] D5: update `DetailPanelRouter.renderForge` for the new `ForgeSentinelDetail` callback shape (`onCreateSubmit` instead of `onSubmit`). Pass `mode: { kind: 'create' }` and `callbacks: { onBack: exit, onCreateSubmit: (snap) => { this.#deps.imprintAction(snap); exit(); }, onUpdateSubmit: () => { /* never called in create mode */ } }`. — S, senior-dev (f027282)
- [x] D6: modify `src/ui/CommandPopup.ts`: add `forgeUpdateAction: ForgeUpdateAction` and `spellContentReader: SpellContentReader` to `CommandPopupParams`. Store on private fields. Thread into `DetailPanelRouter` deps in `#buildRouter`. Export `ForgeUpdateAction` re-export from `CommandPopup.ts` per the existing convention. — S, senior-dev (f027282)
- [x] D7: update `tests/CommandPopup.test.ts` and `tests/integration/harness.ts` (or equivalent) to pass `forgeUpdateAction: vi.fn()` and `spellContentReader: { read: vi.fn(async () => '') }` in all `CommandPopup` constructions. — S, senior-dev (f027282)
- [x] D8: confirm D0 GREEN, existing options-panel tests GREEN, `npm test`, `npm run lint`, `npm run arch:check`, `npm run test:integration` all green. — S, senior-dev (f027282)

### E. ForgeUpdateMaterializer + ForgeUpdateImprinter

#### Section briefing

**What this section produces:** `src/forge/ForgeUpdateMaterializer.ts` mirroring `ForgeMaterializer` exactly (one file, one `run()` method, same ports interface). `src/forge/ForgeUpdateImprinter.ts` implementing `SpellImprinter<ForgeUpdateFormSnapshot>`. Both with unit-test coverage mirroring the existing materializer + imprinter test files.

**Design context the executor needs upfront:**
- `ForgeUpdateMaterializer` shape is a direct mirror of `ForgeMaterializer` (see `src/forge/ForgeMaterializer.ts`): same `Ports` interface (writeFile?, mkdir?, adapter?), same guard logic, same `run()` body. The only differences: `getForgePathAbs` → `getForgeUpdatePathAbs`; `getSettings` returns `ForgeUpdateSystemPromptInput` (smaller — only `vaultMountPath`); render call uses `renderForgeUpdateSystemPrompt` from B1.
- `ForgeUpdateImprinter` shape parallels `ForgeImprinter` (see `src/forge/ForgeImprinter.ts`) with these specific differences:
  - **Snapshot type**: `ForgeUpdateFormSnapshot` instead of `ForgeFormSnapshot`.
  - **Validation**: remote precondition guard identical (`isRemote && portalHost.trim() === ''` → notify and return). **No** name-sanitisation step (spell already exists).
  - **`userPrompt`**: built by `buildForgeUpdateUserPrompt` (B3). Inputs include `currentContent` from snapshot, `directives` from `applyCastDirectives ? extractCastDirectives(currentContent) : null`.
  - **Log entry sentinel**: `FORGE_UPDATE_SPELL_PATH` instead of `FORGE_SPELL_PATH`.
  - **Notice text**: `"Updating '<spellName>' on portal…"` or `"Updating '<spellName>'…"`; on success `"Spell '<spellName>' updated"`; on failure `"Forge update failed: <msg>"` (mirrors create's strings with the verb changed). Remote variant uses the existing pattern of routing failure messages through `isRemote ? msg : 'Forge update failed: ' + msg`.
  - **Paths thunk**: `forgeUpdateSpellPaths()` from PluginPaths (A2), parallel to existing `forgeSpellPaths()`.
- `ForgeUpdateImprinter` **implements `SpellImprinter<ForgeUpdateFormSnapshot>`** (LSP — A5 contract).
- **No code duplication via base class** (Template Method rejected — see Patterns considered). The shared sequence between create and update imprinters is small and the variations are non-trivial; duplicate the ~15 lines.

**Cross-section couplings:**
- E depends on A1 (`FORGE_UPDATE_SPELL_PATH`), A2 (`PluginPaths` accessors), A4 (`ForgeUpdateFormSnapshot`), A5 (`SpellImprinter`), B1 (`renderForgeUpdateSystemPrompt`), B3 (`buildForgeUpdateUserPrompt`), B5 (`extractCastDirectives`).
- E1 (materializer) and E2 (its tests) are independent of E3 (imprinter) and E4 (its tests) — can land in either order, but together is cleaner.
- E's imprinter is constructed in G (composition root); E does not wire it.

**Section-level Red criterion:** `tests/forge/ForgeUpdateMaterializer.test.ts` and `tests/forge/ForgeUpdateImprinter.test.ts` exist and cover the cases listed below. `npm test`, `npm run lint`, `npm run arch:check` all green.

**junior-dev**

- [x] E1: create `src/forge/ForgeUpdateMaterializer.ts` mirroring `src/forge/ForgeMaterializer.ts` shape. Same ports interface (renamed: `getForgeUpdatePathAbs`, `getSettings: () => ForgeUpdateSystemPromptInput`). Same guard. Same `run()` body, calling `renderForgeUpdateSystemPrompt` from B1. — S, junior-dev (c10f767)
- [x] E2: create `tests/forge/ForgeUpdateMaterializer.test.ts` mirroring `tests/forge/ForgeMaterializer.test.ts`. Cover: mkdir called once with the plugin dir; writeFile called once with the forge-update file path; content matches `renderForgeUpdateSystemPrompt` for given settings; rejection on writeFile propagates; default ports construct without error. — S, junior-dev (c10f767)

**senior-dev**

- [x] E3: create `src/forge/ForgeUpdateImprinter.ts` implementing `SpellImprinter<ForgeUpdateFormSnapshot>`. Body parallels `ForgeImprinter.imprint` per Design context. Use `FORGE_UPDATE_SPELL_PATH` for the log-write sentinel. Use `buildForgeUpdateUserPrompt` (no `currentContent`/`directives`). Pass **`executeOnNote: true, activeFilePath: snapshot.spellPath`** to `caster.cast` — CastDispatcher generates the note context instruction. Notice strings as specified in Design context. — M, senior-dev (bfc2e4f)
- [x] E4: create `tests/forge/ForgeUpdateImprinter.test.ts` covering: remote-without-portal-host → notify + return + no cast; happy path local → notify with "Updating" → close → logWriter.recordCasted with `FORGE_UPDATE_SPELL_PATH` → cast called with `systemPromptFile` + `spellPath` + **`executeOnNote: true` + `activeFilePath` matching `snapshot.spellPath`**; happy path remote → notify with "on portal…" + onAccepted re-records with `portalCastId`; failure path → logWriter.recordError + notify with "Forge update failed:" prefix; `applyCastDirectives: true` and `false` → reflected in `buildForgeUpdateUserPrompt` call. Stub the `Caster`, `CastEventSink`, and `notify`. Stub `forgeUpdateSpellPaths` to return literal paths. — M, senior-dev (bfc2e4f)
- [x] E5: confirm `npm test`, `npm run lint`, `npm run arch:check` all green. — S, senior-dev (bfc2e4f)

### F. SystemSpellRegistry — Cast Log sentinel taxonomy (OCP debt fix)

#### Section briefing

**What this section produces:** an audit step (`F0`) to determine whether the current Cast Log row renderer contains a switch on `spellPath`, followed by the introduction of `src/castLog/SystemSpellRegistry.ts` and the refactor (if needed) of the renderer to consult the registry. Three pre-registrations on plugin onload: `<forge>` → `{ label: "Forge" }`, `<refine>` → `{ label: "Refine" }`, `<forge:update>` → `{ label: "Forge (update)" }`. The plugin's existing inline sentinel handling (whatever shape it has) becomes a registry lookup.

**Design context the executor needs upfront:**
- This section's *first* step is an audit. The plan defers the structural decision to the audit because the current code shape is unknown — the planner read `SystemSpellPaths.ts` (a tiny constants file) but did not find a sentinel-rendering switch on grep. The audit confirms.
- Three audit outcomes:
  1. **A switch exists** (e.g. `if (spellPath === '<forge>') return 'Forge'`): extract to `SystemSpellRegistry`, refactor the call site to `registry.describe(path)?.label ?? path`, add the three registrations.
  2. **A lookup table already exists** (e.g. a `Map` or `Record`): rename / promote the table to `SystemSpellRegistry`, add `<forge:update>` registration.
  3. **No centralised rendering** (each call site inlines the label): create `SystemSpellRegistry`, centralise the call sites to consult it, add the three registrations.
- In all three outcomes, the result is a single `SystemSpellRegistry` instance, populated at startup (in `main.ts`), with the three pre-registrations. **The OCP win is the registry pattern, not the specific extraction shape.**
- Test coverage: a unit test for `SystemSpellRegistry` (`register`, `describe`, `isSystemSpell`, unknown-path returns undefined). Existing Cast Log row tests (if any) updated to inject a registry instance or to assert the new label string `"Forge (update)"`.

**Cross-section couplings:**
- F depends on A1 (`FORGE_UPDATE_SPELL_PATH`).
- F is independent of B, C, D, E in terms of compile dependencies — but F's Red criterion (the new label appears in the Cast Log when a `<forge:update>` event is recorded) is best verified via an end-to-end test that requires E's imprinter to be wired (G). Therefore F lands *after* G in the dispatch order to make the Cast Log assertion testable end-to-end. F's unit-level work (registry + refactor) can land before G; the Cast Log integration assertion lands as part of F's verification step.

**Section-level Red criterion:** `SystemSpellRegistry` exists with the three pre-registrations at plugin startup. `tests/castLog/SystemSpellRegistry.test.ts` (new) is green. If a Cast Log row renderer test exists, it covers `<forge:update>` → `"Forge (update)"` (extended). `npm test`, `npm run lint`, `npm run arch:check` all green. **Manual or integration verification:** when a Forge update cast runs (via G's wiring), the Cast Log row shows "Forge (update)" — the audit step F0 captures whether this can be asserted via existing harness or requires a new test.

**senior-dev**

- [x] F0: audit step. **Pre-confirmed:** two-arm `if/else if` switch in `src/castLog/format/displayName.ts:20-33`. Run `grep -rn "FORGE_SPELL_PATH\|REFINE_SPELL_PATH" src/castLog src/ui` to confirm there are no other call sites. Outcome 1 (switch exists) applies — proceed with the refactor in F2. Document any additional call sites found in the F2 commit message. — S, senior-dev (dfead71)
- [x] F1: create `src/castLog/SystemSpellRegistry.ts` per Interfaces (`register`, `describe`, `isSystemSpell`). Stateless API — the instance holds the map. Pre-register nothing in the class itself; registrations happen at construction time in `main.ts`. — S, senior-dev (dfead71)
- [x] F2: based on F0's finding, refactor the call site(s) to consult `SystemSpellRegistry`. If a switch exists → replace with `registry.describe(path)?.label ?? path`. If a lookup table exists → migrate its content into the registry. If neither → identify the most natural single seam in the Cast Log row renderer and route through the registry. **Keep the change minimal** — this is a structural refactor, not a feature change. — M, senior-dev (dfead71)
- [x] F3: create `tests/castLog/SystemSpellRegistry.test.ts` covering: empty registry → `describe` returns undefined for any path; `register` then `describe` round-trip; `isSystemSpell` returns true after registration; `register` with duplicate path overwrites (or throws — implementer's call, document); multiple registrations independent. — S, senior-dev (dfead71)
- [x] F4: if F0 found existing tests on the Cast Log row renderer, extend them with a `<forge:update>` → `"Forge (update)"` case. If no such tests exist, **do not** invent a new test file in F — the integration test in G's verification will cover this end-to-end. — S, senior-dev (dfead71)
- [x] F5: confirm `npm test`, `npm run lint`, `npm run arch:check` all green. — S, senior-dev (dfead71)

### G. Composition — main.ts wiring + Cast Log end-to-end assertion

#### Section briefing

**What this section produces:** wires every piece together at the composition root. `main.ts` constructs `ForgeUpdateMaterializer` and adds it to `CastLogModule.initStartupMaintenance` alongside the existing forge materializer (renaming `materializeForge` → `materializeForgeFiles` per Q5 default). `main.ts` constructs `ForgeUpdateImprinter` and a `SpellContentReader` adapter over `app.vault`, and passes both to `CommandPopupBuilder`. `CommandPopupBuilder` constructs the `forgeUpdateAction` closure (signature: `(spell, snapshot) => updateImprinter.imprint(snapshot, settings, close)`) and threads it plus the reader into `CommandPopup`. `main.ts` constructs the `SystemSpellRegistry` instance and pre-registers `<forge>`, `<refine>`, `<forge:update>` at onload. An end-to-end UI integration test asserts the full flow: ArrowRight on a spell → click Forge → fill description → submit → `forgeUpdateAction` runs through the imprinter → cast dispatched with the right system-prompt-file path → Cast Log shows `"Forge (update)"`.

**Design context the executor needs upfront:**
- `SpellContentReader` production adapter:
  ```ts
  const spellContentReader: SpellContentReader = {
    read: async (path) => {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) throw new Error(`Spell not found: ${path}`);
      return this.app.vault.cachedRead(file);
    },
  };
  ```
- `CastLogModule.materializeForge` → `materializeForgeFiles`: extend the existing method to await both materializers (forge + forge-update) in parallel via `Promise.all`. If they were sequential before, keep sequential — the order doesn't matter (independent files), but mirror the existing pattern.
- `CastLogModule.initStartupMaintenance` constructs both materializers and awaits both `run()` calls. Same try/catch shape — both rejections logged via `console.error`, plugin continues to load.
- `CommandPopupBuilder`: construct one `ForgeUpdateImprinter` (per popup instance, since the existing `ForgeImprinter` is also per-instance in current code — verify in the implementation; mirror precedent). Build the `forgeUpdateAction` closure capturing `updateImprinter`, `plugin.data.settings`, and `() => popup.close()`. Pass it plus the `spellContentReader` (constructed in `main.ts`, passed in) into `CommandPopup` via `CommandPopupParams`.
- `SystemSpellRegistry` instance lives on the plugin (or is passed to `CommandPopupBuilder` if the Cast Log renderer needs it through a different path — F0 will have determined the exact wiring). Three `registry.register(...)` calls at onload.

**Cross-section couplings:**
- G depends on every previous section. Lands last.
- G's end-to-end test (G0) verifies the Cast Log row asserted in F's design.

**Section-level Red criterion:** `tests/integration/forge-update-end-to-end.spec.ts` (new) covers the full flow end-to-end (with a stubbed `Caster` so no subprocess fires): open popup → ArrowRight → click Forge → dialog opens in update mode (asserted by static name field present) → fill description → submit → assert `Caster.cast` was called once with `systemPromptFile` matching `<vaultMountPath>/<pluginDir>/forge-update.md` and `spellPath` matching the vault-relative form, and `userPrompt` containing the description text and the spell path; assert `CastEventSink.recordCasted` was called with `spellPath: '<forge:update>'`; assert the Cast Log row renderer (or a `describe(path).label` lookup, depending on F0) yields `"Forge (update)"` for this event. Existing `tests/main.test.ts` extended for the new wiring (constructs both materializers, passes `forgeUpdateAction` + `spellContentReader` into the popup builder). `npm test`, `npm run lint`, `npm run arch:check`, `npm run test:integration` all green.

**ui-integration-tester**

- [x] G0: write `tests/integration/forge-update-end-to-end.spec.ts` per the Red criterion above. Use a real `ForgeUpdateImprinter` with a stubbed `Caster` (assert `cast` calls), a stubbed `CastEventSink` (assert `recordCasted` / `recordError`), and a stubbed `SpellContentReader` returning a spell body with at least one `@cast` line (so the directive-count assertion is non-trivial). — M, ui-integration-tester

**senior-dev**

- [x] G1: modify `src/main/CastLogModule.ts`: in `initStartupMaintenance`, construct and `await run()` on a `ForgeUpdateMaterializer` alongside the existing `ForgeMaterializer`. **Keep `materializeForge()` unchanged.** Add a new `materializeForgeUpdate()` method that fires the `ForgeUpdateMaterializer` (parallel to `materializeForge()`; same fire-and-forget pattern). Both methods called from `initStartupMaintenance` and from the settings-save callback. — M, senior-dev (e9d94f9)
- [x] G2: update `src/main.ts` per Design context: build the `ForgeUpdateSystemPromptInput` thunk (only `vaultMountPath`), pass the new `forgeUpdateSpellPaths` thunk to `PopupModule` (mirror the existing `forgeSpellPaths` thunk wiring), construct the `SpellContentReader` adapter, construct the `SystemSpellRegistry` instance and pre-register three sentinels, update the `GrimoireSettingTab` settings-save callback to also call `castLogModule.materializeForgeUpdate()` alongside the existing `materializeForge()` call. — M, senior-dev (e9d94f9)
- [x] G3: modify `src/main/PopupModule.ts` (or wherever `CommandPopupBuilder` is constructed) to accept and forward `forgeUpdateSpellPaths` and `spellContentReader`. — S, senior-dev (e9d94f9)
- [x] G4: modify `src/ui/popup/CommandPopupBuilder.ts` per Design context: accept `forgeUpdateSpellPaths` and `spellContentReader` in `CommandPopupBuilderDeps`; construct one `ForgeUpdateImprinter` in `build()`; produce the `forgeUpdateAction` closure (signature `(spell, snapshot) => updateImprinter.imprint(snapshot, this.#deps.plugin.data.settings, () => popup.close())`); pass `forgeUpdateAction` and `spellContentReader` into `CommandPopup` via the new params. — M, senior-dev (e9d94f9)
- [x] G5: extend `tests/main.test.ts` with two cases: (a) onload constructs `ForgeUpdateMaterializer` and awaits its `run()`; (b) the popup builder receives a `spellContentReader` and a `forgeUpdateSpellPaths` thunk that, when invoked, returns paths derived from `vaultMountPath` and `PluginPaths.forgeUpdateSpellPathVaultRel()`. — M, senior-dev (e9d94f9)
- [x] G6: confirm G0 GREEN, all existing tests GREEN, `npm test`, `npm run lint`, `npm run arch:check`, `npm run test:integration` all green. — S, senior-dev (e9d94f9)

### H. Documentation drift sweep

#### Section briefing

**What this section produces:** updates to `docs/features/forge-cast.md` and `docs/features/forge-spell-materialization.md` to describe the new update flow alongside create. Optionally adds a short new `docs/features/forge-spell-update.md` if `/spec` won't be run after `/done` to produce one. (Default: rely on `/spec`; this section only patches drift in existing docs.) `README.md` and `CLAUDE.md` scanned for drift; patched only if needed.

**Design context the executor needs upfront:** mirror Section G's docs-drift convention from `029`. Patch in-place; do not invent new sections in unrelated docs. Reference plan 030 by number.

**Cross-section couplings:** H runs after A–G are merged so the docs reflect what shipped.

**Section-level Red criterion:** `docs/features/forge-cast.md` mentions both modes; `docs/features/forge-spell-materialization.md` mentions the second materialized file (`forge-update.md`). `npm run lint` clean (markdown not linted, but cheap safety check).

**junior-dev**

- [x] H1: read `docs/features/forge-cast.md` and `docs/features/forge-spell-materialization.md`. Apply minimal in-place edits to describe the update mode alongside create. Reference plan 030 by number. Do not duplicate the plan's contents — link by reference. — S, junior-dev (00549e4)
- [x] H2: confirm `npm run lint`, `npm run arch:check` still pass. — S, junior-dev (00549e4)

---

## Out of scope

Mirrors the pitch's no-gos plus planner-deferred items:

- **No edit-history / versioning / branching / backup / diff / rollback.** Users rely on Obsidian file recovery, git, or their own backup tooling.
- **No multi-spell batch update.** One spell at a time.
- **No partial preview / dry-run.** Cast streams output; user sees the result.
- **No silent frontmatter rewrite.** Meta-spell instruction preserves frontmatter by default; user must explicitly request changes in the description.
- **No new keyboard shortcut.** Forge button is the only entry point; must enter the options panel first.
- **No "edit existing" toggle on the create-mode dialog.** Mode is by entry point.
- **No exposure on built-in sentinels or sentinel-marked notes.**
- **No auto-detect-update-intent from description text in create mode.**
- **No user-customisable update template** (analogous to Custom Refine in `029`). Out of scope here; future iteration if requested.
- **No content-shape validation of the user's spell file before update.**
- **No structural refactor of `ForgeImprinter`'s caster construction** beyond the D2 `implements` declaration. The existing caster + logWriter contract stays.
- **No `Vault.read` vs `cachedRead` toggle exposed to users.** The plugin chooses `cachedRead` (Technical notes); not a configuration.
- **No file-write journaling.** Same risk profile as today's create-mode partial-write; meta-spell owns the write atomically per Obsidian's `Vault.create`.

## Overall effort summary

- **Total todos:** 38 across 8 sections (A:7, B:8, C:6 incl. 1 tester, D:8 incl. 1 tester, E:5, F:5, G:6 incl. 1 tester, H:2)
- **Effort distribution:** S × 23, M × 15, L × 0
- **Tier distribution:**
  - `junior-dev` × 16 (sections A, B, E1–E2, H — scaffolding, pure functions, materializer mirror, doc drift)
  - `senior-dev` × 19 (sections C, D, E3–E5, F, G — dialog mode split, popup wiring, imprinter, registry refactor, composition root)
  - `ui-integration-tester` × 3 (C0, D0, G0 — one per UI seam: dialog mode-split, popup→panel→dialog wiring, end-to-end imprinter dispatch + Cast Log label)
  - `lead-dev` × 0 (no concurrency, no perf-critical paths, no security reasoning, no unknown root cause; SOLID seams are mechanical once decided)

Junior-dev handles the scaffolding-and-mirror work: new constants, new types, two pure templates, two pure builders, the materializer mirror, doc sweep. Senior-dev owns the four judgement-heavy seams: the dialog mode-split (C — branches the dialog without forking it), the popup/router wiring (D — three modified files, one new test seam), the imprinter (E3 — non-trivial parallel of an existing class with deliberate code duplication), the registry-extraction refactor (F — depends on audit outcome), and the composition root (G — five files, end-to-end test). Three integration-tester invocations pin the three UI seams. No lead-dev because every design question is closed in this plan; the work is mechanical-with-judgement, not unknown-with-judgement.

## Sequencing & dispatch order

1. **A** (junior) — types, constants, accessors, LSP-debt fix on `ForgeImprinter`.
2. **B** (junior) — pure templates + cast-directive extractor + `SpellContentReader` interface.
3. **C** (tester then senior) — dialog mode-split. Owns the first UI seam Red criterion.
4. **D** (tester then senior) — Forge button on OptionsPanel + DetailPanelRouter.renderForgeUpdate. Owns the second UI seam Red criterion.
5. **E** (junior on materializer, senior on imprinter) — `ForgeUpdateMaterializer` + `ForgeUpdateImprinter` + unit tests.
6. **F** (senior) — `SystemSpellRegistry` + Cast Log refactor (depends on F0 audit).
7. **G** (tester then senior) — composition root wiring + end-to-end test. Owns the third UI seam Red criterion (which also pins F's structural change).
8. **H** (junior) — docs drift.

If parallelism is desired after A lands: B, C, D, E, F can run in any order with respect to each other up until G needs all of them. (D needs C's new callback shape; C+D commit together is recommended.)

## Done-when

- The options panel for a user-authored spell shows a *Forge* button below Cast and Reset (R1).
- Clicking it opens the Forge dialog in update mode: static name field, repurposed description, conditional `Apply @cast directives (N)` checkbox (R2–R4).
- Submitting the dialog dispatches a Forge update cast with the spell's captured content, the description, and (optionally) the extracted `@cast` directives (R5).
- The meta-spell rewrites the spell file in place; on success with the checkbox checked, the `@cast` lines are removed (R6, R8).
- The Cast Log row shows `"Forge (update)"` for the cast, distinguishable from `"Forge"` (R7, R13).
- Sentinel-marked notes and sentinel rows (Forge/Refine) do not expose the Forge button (R9).
- Frontmatter is preserved on update unless the description explicitly asks otherwise (R10).
- The Spell Picker keyboard hot path is unchanged (R11).
- All new unit tests green (`tests/forge/forgeUpdateTemplate.test.ts`, `tests/forge/buildForgeUpdateUserPrompt.test.ts`, `tests/forge/castDirectiveExtractor.test.ts`, `tests/forge/ForgeUpdateMaterializer.test.ts`, `tests/forge/ForgeUpdateImprinter.test.ts`, `tests/castLog/SystemSpellRegistry.test.ts`). Three new integration specs green (`tests/integration/forge-sentinel-detail-update.spec.ts`, `tests/integration/forge-update-popup.spec.ts`, `tests/integration/forge-update-end-to-end.spec.ts`). Existing test suites unmodified-or-minimally-updated and green.
- `npm test`, `npm run lint`, `npm run arch:check`, `npm run test:integration` all green.
- `docs/features/forge-cast.md` and `docs/features/forge-spell-materialization.md` describe the update mode (drift patched in H).
- LSP gate: existing `tests/ForgeImprinter.test.ts` passes unchanged after A6's `implements SpellImprinter<ForgeFormSnapshot>` declaration.
- OCP gate: no `if/switch` on `spellPath` for sentinel labels remains in the Cast Log row renderer; `SystemSpellRegistry` is the single source of truth (verified by F's audit + refactor + G's end-to-end test).

reviewed @ 00549e4
