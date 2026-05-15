# 019 — Refine Cast

> Wire the Refine sentinel's Enter trigger (from the list and from inside the configured dialog) to the shared cast pipeline. Supplies the hardcoded Refine prompt body, an active-note guard, and a `<refine>` cast-log sentinel. No autonomous modes, no `@cast` parsing in the plugin, no Custom Refine Script, no CodeMirror decoration.

**Complexity:** Complex (multi-component touching the cast pipeline, two trigger paths converging on one orchestration, a new cast-log sentinel, a prompt-body owned by the plugin, an active-note guard at the right layer, and integration coverage at two UI seams).

**Flag:** `--deep` — multi-perspective synthesis below.

## Problem (verbatim from pitch)

The Refine sentinel now opens a configuration dialog, but Enter is a no-op. Casting itself — subprocess invocation, `castId` generation, cast-log writes, status transitions — is unwired. All the machinery already exists from Spell casting and Forge cast; this phase plugs Refine into it and supplies the hardcoded prompt that gives the cast its meaning.

## Appetite

Small. Spell casting and Forge cast already establish the casting primitives — subprocess spawn, `castId` threading, `CastLogStore` writes, status lifecycle. The new work is a Refine-specific prompt body in plugin source, an Enter handler that routes through the shared pipeline, an active-note guard, and a prompt rule that makes the no-instruction case a no-op. Weekend appetite.

## Solution

When the user presses Enter on the Refine sentinel in the Spell Picker — whether directly from the spell list or after configuring options in the dialog — the plugin spawns a cast that targets the currently active note. The cast travels the same pipeline as a spell cast or a forge cast: `castId` minted, initial record written via the active `CastLogWriter`, Claude Code invoked with the spell, status transitioning `casted → in-progress → done` (or `error`) under the existing rules. The Cast Log surfaces the entry exactly as it would for any other cast. Model, effort, and context notes come from the persisted Refine defaults — or the in-dialog overrides if the user opened and adjusted the options panel — using the synthetic-key persistence wired in the previous phase (`REFINE_SENTINEL_PATH = '<grimoire-sentinel:refine>'`).

The Refine prompt body lives in plugin source as a hardcoded function (`renderRefinePrompt()` in `src/refine/refinePrompt.ts`), parallel to Forge's `renderForgeSystemPrompt`. It is not a vault file in this iteration. The canonical content reference is `brain/Grimoire - Refine Note Spell`; the actual string lives next to the code.

Two guards bound the trigger. First, Refine requires an active note. If no markdown file is open in the workspace when Enter fires on the sentinel, the cast does not start: an Obsidian `Notice` reports the failure (`"Refine needs an open note"`) and the picker stays open. The guard applies whether Enter fires from the list or from inside the configured dialog. Second, the prompt itself short-circuits the no-instruction case. If the active note contains no `@cast` lines and the follow-up textarea is empty, the prompt instructs Claude Code to read the note, observe that nothing has been requested, and exit without modifying any file. This is a property of the prompt, not the plugin — the cast runs to completion in the log, but the note is untouched.

When `@cast` lines are present, the prompt directs Claude Code to act on each line in document order and then remove every `@cast` line from the note. When a follow-up is provided, it is treated as a global instruction applied across the note. Both can be present simultaneously; `@cast` lines drive localised, in-text edits, while the follow-up frames the cast as a whole.

The active note's path is passed to Claude Code as the target file, matching the existing spell-casting convention. Context notes, model, and effort flow through the same parameters that spell casting already wires.

## Rabbit holes (do not enter)

- **No mode detection in the plugin.** Plugin does not count words, parse `@cast` lines, or inspect note content to decide what to do. Judgement lives in the prompt body.
- **No new casting primitive for Refine.** If the shared `Caster` / `CastDispatcher` does not cleanly accept Refine's shape, extend the shared primitive — do not fork it.
- **Active-note check belongs in the trigger handler**, not in the prompt. Catch missing-note before any subprocess fires.

## No-gos

- No autonomous modes (Generate / Expand) — deferred. Refine cast requires either `@cast` lines or a follow-up to do anything.
- No CodeMirror decoration of `@cast` lines.
- No Custom Refine Script. Prompt is hardcoded in plugin source.
- No re-cast affordance on Refine entries in the Cast Log. Existing log behaviour applies unchanged.

## Edge-case decisions (clarified up front)

The pitch enumerates the load-bearing edge cases; no `AskUserQuestion` round was needed because the pitch resolves each one explicitly. Recording them here as the basis for concrete todos rather than implicit dev-agent discovery:

- **No active markdown file** → `new Notice('Refine needs an open note')`; popup stays open; no `castId`, no log write, no caster invocation. Guard fires in the builder-layer `refineCastAction` callback, not in `CastDispatcher` (whose existing `executeOnNote && activeFilePath === null` guard would close the popup — wrong semantics for Refine).
- **Active file is non-markdown** (e.g. an image or a PDF preview) → treated as "no active markdown file"; same Notice + popup-stays-open. Use `app.workspace.getActiveFile()` and check the file exists; `app.workspace.getActiveFile()` returns `TFile | null` and we additionally require a `.md` extension to be considered a valid Refine target.
- **No `@cast` lines AND empty follow-up** → cast runs to completion (`casted → in-progress → done`); note untouched. Property of the prompt, not the plugin. The prompt body explicitly instructs Claude Code to exit without modifying any file in this case.
- **`@cast` lines present, empty follow-up** → prompt instructs Claude Code to act on each `@cast` line in document order and then remove every `@cast` line from the note.
- **`@cast` lines present AND follow-up present** → both apply: `@cast` lines drive local edits; follow-up is the global instruction across the note. The prompt enumerates both.
- **Follow-up present, no `@cast` lines** → follow-up applied to the whole note as a global instruction.
- **`activeFilePath` changes between Enter and cast-arg-build** → cast carries the path resolved *at the moment the guard fired* (i.e. the builder captures `app.workspace.getActiveFile()?.path` once, before constructing the dispatch input). Subsequent workspace changes do not race the cast.
- **Refine cast invoked from dialog with `executeOnNote: false` in snapshot** → ignored. Refine always targets the active note semantically. The dispatch input is constructed with `executeOnNote: true` regardless of the snapshot. The checkbox in the Refine OptionsPanel stays visible (we do not hide it in this iteration — see Open questions); its toggle persists into session map but the cast trigger overrides.
- **`@cast` line removal under failure** → if the cast errors mid-execution, the note may have partial `@cast` line removals. Prompt instructs Claude Code to remove lines only after acting; partial failure is left as-is (no rollback). Documented behavior, not a bug.
- **Refine cast against a note still being saved** → out of scope; the plugin trusts Obsidian's filesystem consistency for the read path. Same as spell-cast today.
- **Remote mode + empty `portalHost`** → existing `CastDispatcher` guard fires; popup stays open per current behavior. Refine inherits this without change.
- **Concurrent Refine triggers** → each invocation mints its own `castId` and spawns independently. No locking. Same as forge.
- **Refine prompt body must stay under 30 lines** to keep the inline-mode `userPrompt` payload reasonable. Migration to a materialized `refine.md` (mirroring 018 forge-spell-materialization) is documented as a future seam — Technical notes.

## Proposed solution (overview)

Six sections, outside-in, sequenced to make each section's Red criterion independently verifiable:

1. **Section A — Refine prompt body + new cast-log sentinel.** Pure functions and constants. `renderRefinePrompt()`, `buildRefineUserPrompt(input)`, `REFINE_SPELL_PATH = '<refine>'` in `castLog/types.ts`, and the synthetic Refine `Spell` factory for the dispatcher (`refineCastSpell(): Spell`). `displayName.ts` extended to recognize `<refine>` as "Refine". No UI, no wiring — all unit-test territory.

2. **Section B — Extend `CastDispatchInput` with optional inline system-prompt prepend.** Add `systemPromptInline?: string` to `CastDispatchInput`. `CastDispatcher.dispatch` prepends `${systemPromptInline}\n\n` to the user prompt when set. Behavior unchanged when omitted — existing spell-cast and forge-cast call sites pass nothing.

3. **Section C — Builder-layer `refineCastAction` orchestration.** Extend `CommandPopupBuilder` and `CommandPopupParams` with a new `refineCastAction: (snapshot: OptionsFormSnapshot) => void` callback. Builder constructs the dispatch input: resolves active note (guard → `Notice` + bail-out if missing); builds the synthetic Refine `Spell`; builds the Refine system-prompt body via `renderRefinePrompt()`; calls `dispatcher.dispatch(...)` with `systemPromptInline` set and `executeOnNote: true`. The dispatcher's existing pipeline (record + notify + close + caster.cast) handles the rest.

4. **Section D — Wire the two Refine triggers in `CommandPopup`.** Rename the `dismiss-refine` event to `refine-cast` in `SpellEvents` (the name now describes what it does: triggers a Refine cast, no longer merely dismisses). `SpellsPanel.confirm(refineIndex)` emits the renamed event. `CommandPopup`'s `panel.events.on('refine-cast', ...)` handler builds a default snapshot (mirroring the spell-list Enter snapshot: defaults + executeOnNote=true) and calls `refineCastAction(snapshot)`. `RefineOptionsDetail.onCast(snapshot)` (the dialog path) now also calls `refineCastAction(snapshot)`. Both paths converge.

5. **Section E — Integration tests at the two seams.** `tests/integration/refine-cast.spec.ts` covers: list-Enter on Refine → `refineCastAction` invoked with default snapshot; dialog-Cast → `refineCastAction` invoked with form snapshot; missing-active-note → `Notice` shown, popup stays open, `castAction` and `refineCastAction` *not* called. The existing `tests/integration/refine-options-panel.spec.ts` D5-2 and D5-4 (which pinned the placeholder dismiss-only behavior) are rewritten to assert the new dispatch-and-close behavior.

6. **Section F — Live-spec + drift.** New `docs/features/refine-cast.md`. Drift sweep on `docs/features/refine-note-dialog.md` (move "Enter dismisses, no cast pipeline" notes into the past tense + cross-link), `docs/features/command-popup-ui.md` (state-diagram row for Refine sentinel now triggers cast), `docs/features/cast-log-foundation.md` (add `<refine>` to the sentinel list).

## Components

| Component | Location | Responsibility | Status |
|---|---|---|---|
| `renderRefinePrompt` | `src/refine/refinePrompt.ts` (NEW) | Pure fn `(): string`. Returns the hardcoded Refine system-prompt body. No inputs in this iteration — content is fully static, no per-settings substitution. | NEW |
| `buildRefineUserPrompt` | `src/refine/buildRefineUserPrompt.ts` (NEW) | Pure fn `(input: RefineUserPromptInput) => string` returning the per-cast preamble. Inputs: `activeFilePath: string`, `vaultMountPath: string`, `contextNotePaths: readonly string[]`, `followUp: string`. **Note:** this duplicates `CastDispatcher.#buildUserPrompt`'s output shape — if we go with `systemPromptInline` (Key design decision §2), this function is unnecessary and the existing dispatcher per-cast prompt is reused verbatim. See §2; if §2 lands as planned, this file is NOT created. Documented here to make the alternative visible. **Decision: not created. The dispatcher's existing per-cast prompt is reused.** | DEFERRED — alternative path; not created |
| `REFINE_SPELL_PATH` | `src/castLog/types.ts` (EXT) | New `'<refine>' as const`. Cast-log sentinel mirroring `FORGE_SPELL_PATH`. Distinct from `REFINE_SENTINEL_PATH` (override key, in `src/domain/spells/Spell.ts`). | NEW |
| `refineCastSpell` | `src/refine/refineCastSpell.ts` (NEW) | Factory `(): Spell` returning `{ name: 'Refine', path: spellPath(REFINE_SPELL_PATH), executeOnNote: true }`. Used by the dispatch input builder so `recordCasted({ spellPath: '<refine>' })` writes the right sentinel and the dispatcher's standard pipeline works unchanged. | NEW |
| `resolveDisplayName` | `src/castLog/format/displayName.ts` (EXT) | Recognize `<refine>` and return `'Refine'`. Mirror the `<forge>` branch (no `affectedFiles` decoration for Refine in this iteration — Refine modifies the active note, not the spell file; affectedFiles handling deferred). | MODIFIED |
| `CastDispatchInput` | `src/cast/CastDispatcher.ts` (EXT) | Add `readonly systemPromptInline?: string`. When present, `#buildUserPrompt`'s output is prepended with `${systemPromptInline}\n\n`. Behavior with field omitted is unchanged. | MODIFIED |
| `CastDispatcher.dispatch` | `src/cast/CastDispatcher.ts` | Read `input.systemPromptInline` and prepend if set. Single conditional, ~3 LOC. No new branches in caster invocation or guard logic. | MODIFIED |
| `SpellEvents` | `src/domain/spells/SpellEvents.ts` | Rename `"dismiss-refine": void` → `"refine-cast": void`. **Breaking change inside the plugin** — all emit sites and listeners updated. The name now matches behavior. | MODIFIED |
| `SpellsPanel.confirm` | `src/ui/tabs/SpellsPanel.ts` | Emit `'refine-cast'` instead of `'dismiss-refine'` when the Refine sentinel is confirmed. One-line change. | MODIFIED |
| `CommandPopup` | `src/ui/CommandPopup.ts` | (a) `panel.events.on('refine-cast', ...)`: build default snapshot from `formDefaults` + `executeOnNote: true`, then call `refineCastAction(snapshot)`. (b) `#renderRefineOptionsPanel`: replace `onCast: () => this.dismiss()` with `onCast: (snap) => this.#refineCastAction(snap)`. Add `refineCastAction: RefineCastAction` to `CommandPopupParams` and `#refineCastAction` private field. The `dismiss()` method remains (called by `refineCastAction` indirectly via popup close in the dispatcher flow). | MODIFIED |
| `CommandPopupParams` | `src/ui/CommandPopup.ts` | Add `refineCastAction: RefineCastAction` field. Type: `export type RefineCastAction = (snapshot: OptionsFormSnapshot) => void;`. | MODIFIED |
| `CommandPopupBuilder` | `src/ui/popup/CommandPopupBuilder.ts` | Construct the `refineCastAction` closure: (i) read active file via `this.#deps.app.workspace.getActiveFile()`; if null or non-md, `new Notice('Refine needs an open note')` and return; (ii) build dispatch input: spell = `refineCastSpell()`, `executeOnNote: true`, `systemPromptInline: renderRefinePrompt()`, plus snapshot fields + `settings: this.#deps.plugin.data.settings`; (iii) call `dispatcher.dispatch(...)`. | MODIFIED |
| `PopupModule` | `src/main/PopupModule.ts` | Pass `refineCastAction` builder-equivalent into `CommandPopupBuilder`; otherwise unchanged. (Detail: the wiring happens inside `CommandPopupBuilder.build()` since `Notice` and `dispatcher` are both already available there. `PopupModule` does not gain new fields.) | UNCHANGED — touched only as a sanity grep |
| `RefineOptionsDetail` | `src/ui/components/RefineOptionsDetail.ts` | UNCHANGED in shape. The `onCast` callback semantics shift (from "dismiss only" to "trigger Refine cast"), but the type signature `(snapshot: OptionsFormSnapshot) => void` is unchanged. Only the call site in `CommandPopup.#renderRefineOptionsPanel` is updated. | UNCHANGED |
| `OptionsPanel` / `OptionsFormState` / `OptionsSessionMap` / `SpellOverrideStore` | (existing) | UNCHANGED. Refine inherits the panel UI and snapshot semantics unchanged. | UNCHANGED |

## Interfaces

### Refine prompt body (verbatim shape)

```ts
// src/refine/refinePrompt.ts
/**
 * Returns the hardcoded Refine system-prompt body sent as an inline prepend on the
 * dispatch user-prompt. Static text — no settings or per-cast substitutions in this
 * iteration. Canonical content reference: brain/Grimoire - Refine Note Spell.
 *
 * Future migration: if this body grows beyond ~30 lines, mirror the forge-spell-
 * materialization pattern — render once to <pluginDir>/refine.md on plugin onload,
 * pass via systemPromptFile + spellPath instead of inline.
 */
export function renderRefinePrompt(): string;
```

The function returns a string covering, in order:
1. Execution Mode callout (IMMEDIATE EXECUTION — NO QUESTIONS, mirroring forge's preamble verbatim — same `> [!danger]` block).
2. MCP Tools section (Obsidian MCP first, fallback to filesystem via `VAULT_MOUNT_PATH`).
3. **The Refine workflow:** "You are refining the active note. Read it. If the note contains lines starting with `@cast`, treat each as a localised instruction; act on them in document order, then remove every `@cast` line from the note. If a follow-up instruction is provided in the user prompt, treat it as a global instruction across the note. If neither `@cast` lines nor a follow-up is present, observe that nothing has been requested and exit without modifying any file."
4. Output rule: write back to the active note path (which is given in the user prompt).

The dev agent fetches the precise wording from `brain/Grimoire - Refine Note Spell` via the obsidian MCP `get_vault_file` tool when writing A1 — the planner does not pre-author the text; the dev agent treats the vault note as the source of truth for the body content. The four invariants above ARE the test contract for A3.

### `REFINE_SPELL_PATH` cast-log sentinel

```ts
// src/castLog/types.ts (added below FORGE_SPELL_PATH)
/** Sentinel spell path for casts originating from the Refine sentinel (not a live spell). */
export const REFINE_SPELL_PATH = '<refine>' as const;
```

Separate from `REFINE_SENTINEL_PATH = '<grimoire-sentinel:refine>'` (in `src/domain/spells/Spell.ts`), which is the *override-storage* key. The two namespaces serve different purposes and stay separate:

| Constant | File | Used for |
|---|---|---|
| `REFINE_SENTINEL_PATH` | `src/domain/spells/Spell.ts` | Override-storage key in `SpellOverrideStore` and `OptionsSessionMap` — persists Refine's model/effort defaults |
| `REFINE_SPELL_PATH` | `src/castLog/types.ts` | Cast-log row identity (`recordCasted({ spellPath: '<refine>' })`); recognized by `resolveDisplayName` and CastLogRow rendering |

### `refineCastSpell` factory

```ts
// src/refine/refineCastSpell.ts
import { spellPath, type SpellPath } from '../domain/spells/SpellPath';
import { REFINE_SPELL_PATH } from '../castLog/types';
import type { Spell } from '../domain/spells/Spell';

/**
 * Synthetic Spell-shaped object for routing the Refine cast through CastDispatcher.
 * `path` is the cast-log sentinel (writes `'<refine>'` to recordCasted).
 * `executeOnNote: true` reflects Refine's invariant: always targets the active note.
 */
export function refineCastSpell(): Spell;
```

Returns `{ name: 'Refine', path: spellPath(REFINE_SPELL_PATH), executeOnNote: true }`.

### `CastDispatchInput` extension

```ts
// src/cast/CastDispatcher.ts (additive field)
export interface CastDispatchInput {
  spell: Spell;
  model: string;
  effort: Effort | null;
  contextNotePaths: readonly string[];
  followUp: string;
  settings: GrimoireSettings;
  activeFilePath: string | null;
  executeOnNote: boolean;
  /**
   * Optional inline system-prompt prepended to the dispatcher-built user prompt.
   * When present, the final caster input's userPrompt is `${systemPromptInline}\n\n${perCastPrompt}`.
   * Used by Refine cast (which has no materialized system-prompt file in this iteration).
   * Live spells and forge cast leave this undefined and rely on systemPromptFile semantics.
   */
  readonly systemPromptInline?: string;
}
```

Implementation inside `dispatch`:

```ts
const perCastPrompt = this.#buildUserPrompt(...);
const userPrompt = input.systemPromptInline !== undefined
  ? `${input.systemPromptInline}\n\n${perCastPrompt}`
  : perCastPrompt;
// ... pass userPrompt into caster.cast(...)
```

When `systemPromptInline` is set, the dispatcher does NOT also set `systemPromptFile` on the `CastInput` passed to `caster.cast` — Refine is inline-mode. For live spell-cast (which today builds `systemPromptFile = vaultMountPath/spell.path`), the inline field is omitted, behavior unchanged.

The dispatcher decides `systemPromptFile` as follows: `systemPromptFile = isRemote || systemPromptInline !== undefined ? undefined : ${vaultMountPath}/${spell.path}`. (Today's logic is `isRemote ? undefined : ${vaultMountPath}/${spell.path}` — the new clause adds an `|| systemPromptInline !== undefined`.)

### `SpellEvents` rename

```ts
// src/domain/spells/SpellEvents.ts
export type SpellEvents = {
  cast: Spell;
  sentinel: Sentinel;
  "open-options": Spell;
  "open-refine-options": void;
  "refine-cast": void;          // was: "dismiss-refine"
};
```

### `CommandPopup` callback addition

```ts
// src/ui/CommandPopup.ts
/** Callback signature for triggering a Refine cast (from list-Enter or dialog-Cast). */
export type RefineCastAction = (snapshot: OptionsFormSnapshot) => void;

export interface CommandPopupParams {
  app: App;
  spellTag: string;
  imprintAction: ImprintAction;
  castAction: CastAction;
  refineCastAction: RefineCastAction;   // NEW
  defaults: FormDefaults;
  overrides: SpellOverrideStore;
  sessionMap: OptionsSessionMap;
  castLogPanelDeps: Omit<CastLogPanelDeps, 'openLink'>;
}
```

`CommandPopup` stores `#refineCastAction` and wires it into two places:

```ts
// in #createSpellsPanel
panel.events.on('refine-cast', () => {
  const snapshot: OptionsFormSnapshot = {
    model: this.#formDefaults.defaultModel,
    effort: this.#formDefaults.defaultEffort,
    contextNotePaths: [],
    followUp: '',
    executeOnNote: true,        // Refine always targets the active note
  };
  this.#refineCastAction(snapshot);
});

// in #renderRefineOptionsPanel
detail.render({
  // ...
  onCast: (snap) => this.#refineCastAction(snap),
  // ...
});
```

Note: the list-Enter path does **not** consult `SpellOverrideStore` or `OptionsSessionMap` for the snapshot — it builds a pure-defaults snapshot. This matches today's behaviour: the spell-list Enter path uses `optionsFormSnapshotFromDefaults(this.#formDefaults, spell)`. For Refine, the only difference is `executeOnNote: true` instead of `spell.executeOnNote`.

**Wait — this contradicts the pitch:** "Model, effort, and context notes come from the persisted Refine defaults — or the in-dialog overrides if the user opened and adjusted the options panel — using the synthetic-key persistence wired in the previous phase." The list-Enter snapshot must consult `SpellOverrideStore` at `REFINE_SENTINEL_PATH` so persisted user defaults take effect.

**Corrected snapshot construction for list-Enter:**

```ts
panel.events.on('refine-cast', () => {
  const snapshot = optionsFormSnapshotFromRefineDefaults(
    this.#formDefaults,
    this.#overrides,
    this.#sessionMap,
  );
  this.#refineCastAction(snapshot);
});
```

Where `optionsFormSnapshotFromRefineDefaults` is a small new helper that resolves model/effort via the existing `resolveSpellOptions` cascade (session → override → settings) keyed on `REFINE_SENTINEL_PATH`, and pulls `contextNotePaths` / `followUp` from the session map's `REFINE_SENTINEL_PATH` entry if present, else `[]` / `''`. `executeOnNote` is hardcoded `true`.

This mirrors how `RefineOptionsDetail.#resolveOptions` and `#buildFormState` already work — same resolver, same session lookup — so the list-Enter path produces the same defaults the dialog-Cast path would on first open. Reuse `resolveSpellOptions` directly; no new resolver.

The helper:

```ts
// src/ui/options/OptionsFormState.ts (additive export)
import { REFINE_SENTINEL_PATH } from '../../domain/spells/Spell';

export function optionsFormSnapshotFromRefineDefaults(
  defaults: FormDefaults,
  overrides: SpellOverrideStore,
  sessionMap: OptionsSessionMap,
  models: readonly SupportedModel[],
): OptionsFormSnapshot {
  const resolved = resolveSpellOptions({
    spellPath: REFINE_SENTINEL_PATH,
    session: sessionMap,
    overrides,
    settings: { defaultModel: defaults.defaultModel, defaultEffort: defaults.defaultEffort,
                spellTag: '', cliCommand: '', binaryPath: '', forgeOutputFolder: '',
                vaultMountPath: '', executionMode: 'local',
                portalHost: '', portalPort: '', portalPath: '',
                portalAuthUser: '', portalAuthPassword: '' },
    models,
  });
  const sessionEntry = sessionMap.get(REFINE_SENTINEL_PATH);
  return {
    model: resolved.model,
    effort: resolved.effort,
    contextNotePaths: sessionEntry?.contextNotePaths ?? [],
    followUp: sessionEntry?.followUp ?? '',
    executeOnNote: true,
  };
}
```

The `settings` stub shape mirrors `RefineOptionsDetail.#resolveOptions` (which already uses an empty-fields object — only `defaultModel` / `defaultEffort` are read by the resolver in this code path). The two call sites share the same construction; consider extracting `RefineOptionsDetail.#resolveOptions` and this helper into a single `resolveRefineOptions` function in a future cleanup. **For this iteration, keep them parallel** — extracting would broaden the diff and is not load-bearing.

`models` is already accessible in `CommandPopup` via the existing `SUPPORTED_MODELS` import.

### `CommandPopupBuilder` orchestration

```ts
// src/ui/popup/CommandPopupBuilder.ts (added closure)
import { Notice } from 'obsidian';
import { refineCastSpell } from '../../refine/refineCastSpell';
import { renderRefinePrompt } from '../../refine/refinePrompt';

// inside build(), alongside imprintAction and castAction closures:
const refineCastAction: RefineCastAction = (snapshot) => {
  const activeFile = this.#deps.app.workspace.getActiveFile();
  if (!activeFile || activeFile.extension !== 'md') {
    new Notice('Refine needs an open note');
    return;
  }
  dispatcher.dispatch({
    spell: refineCastSpell(),
    model: snapshot.model,
    effort: snapshot.effort,
    contextNotePaths: snapshot.contextNotePaths,
    followUp: snapshot.followUp,
    settings: this.#deps.plugin.data.settings,
    activeFilePath: activeFile.path,
    executeOnNote: true,           // overrides snapshot — Refine always targets active note
    systemPromptInline: renderRefinePrompt(),
  });
};
```

The `Notice` import is added to `CommandPopupBuilder.ts`. `PopupModule.ts` already imports `Notice`; the builder taking the same dep is consistent.

The `activeFile.extension !== 'md'` guard uses Obsidian's `TFile.extension` (lower-case, no leading dot — see `obsidian.d.ts`). The mock at `tests/__mocks__/obsidian.ts` must support this field; verify when writing E1.

## Data flow

### List-Enter Refine cast (happy path, local)

```
User: focus Refine sentinel row → Enter
  → SearchPhase.handleEnter → spellsPanel.confirm(refineIndex)
  → SpellsPanel: Refine branch → emit 'refine-cast'
  → CommandPopup 'refine-cast' handler:
        snapshot = optionsFormSnapshotFromRefineDefaults(defaults, overrides, sessionMap, models)
        refineCastAction(snapshot)
  → CommandPopupBuilder refineCastAction:
        activeFile = app.workspace.getActiveFile()
        activeFile === null || ext !== 'md' ? new Notice('Refine needs an open note'); return
        dispatcher.dispatch({
          spell: refineCastSpell(),             // path = '<refine>'
          executeOnNote: true,
          activeFilePath: activeFile.path,
          systemPromptInline: renderRefinePrompt(),
          ...snapshot fields,
        })
  → CastDispatcher.dispatch:
        executeOnNote && activeFilePath === null guard: passes (path is non-null)
        executionMode === 'remote' && portalHost.trim() === '' guard: passes (local)
        castId = generateId()
        perCastPrompt = #buildUserPrompt(true, vaultMountPath, activeFilePath, contextNotes, followUp)
                      = 'Execute this spell against `<vault>/<active>`. Follow-up: …'  (if any)
        userPrompt = `${systemPromptInline}\n\n${perCastPrompt}`
        logWriter.recordCasted({ castId, spellPath: '<refine>', model, effort, contextNotes, followUp, executeOnNote: true })
        notify('Casting \'Refine\'…')
        close()                                  // popup dismisses (popup.close() routes through phase override
                                                 // but we're in search phase → super.close())
        caster.cast({ castId, modelId: model, effort,
                      userPrompt,
                      systemPromptFile: undefined,    // inline mode
                      vaultMountPath,
                      spellPath: '<refine>',          // synthetic; remote ignores; cast-log already wrote
                    }, { onAccepted, onFailure })
  → LocalCaster: spawn claude with -p "<userPrompt>" --model … --effort …
  → on exit 0: onAccepted({}) → notify('Spell cast'); no second recordCasted (no jobId)
  → on exit ≠0: onFailure(stderrTail) → logWriter.recordError(...); notify('Cast failed: …')
```

### Dialog-Cast Refine cast

Same as list-Enter from `refineCastAction` downward. The differences upstream:

```
User: focus Refine → ArrowRight → fill options panel → Cast button (or Mod+Enter)
  → OptionsPanel: sessionMap.put(REFINE_SENTINEL_PATH, current); deps.onCast(current)
  → RefineOptionsDetail params.onCast(snapshot)
  → CommandPopup #renderRefineOptionsPanel onCast handler: this.#refineCastAction(snapshot)
  → (then identical to list-Enter from refineCastAction onward)
```

The `OptionsPanel` is in detail phase, so when the dispatcher's `close()` fires, the popup's `close()` override routes through `interceptClose() → exitDetail()` — which returns the popup to search phase and stays open. But we want the popup to fully dismiss after a Refine cast (consistent with spell-cast from the options panel, which today also stays open after cast — see live-spec `options-panel.md`).

Wait — re-reading current code: `CommandPopup.#renderOptionsPanel` `onCast: (snap) => this.#castAction(spell, snap)`. The `castAction` invokes `dispatcher.dispatch` which calls `close()` (= `popup.close()`). The popup is in detail phase → `interceptClose()` returns true → `exitDetail()` runs → popup stays open, returns to search. So spell-cast from the options panel **exits to search** today; popup stays open. The user then sees the cast log update on the search-phase Logs tab.

For Refine, the existing 017 `onCast: () => this.dismiss()` calls `super.close()` directly, fully closing the modal. The pitch is silent on which behavior to keep for the new cast-dispatching Refine path. Two options:

- **Option α:** Match spell-cast — exit to search after Refine cast. User stays in popup; can switch to Logs tab to watch progress. Consistent with spell-cast UX.
- **Option β:** Match the placeholder behavior 017 shipped — fully dismiss after Refine cast. User returns to editor.

The pitch's phrasing: "When the user presses Enter on the Refine sentinel in the Spell Picker — whether directly from the spell list or after configuring options in the dialog — the plugin spawns a cast that targets the currently active note." It doesn't explicitly say "dismiss" or "stay open". The 017 live-spec for refine-note-dialog says: "Activation closes the popup. `Enter` on the Refine row dismisses the modal directly. Cast (button click or `Cmd/Ctrl+Enter`) from inside the Refine options panel also fully dismisses the modal." That was the placeholder behavior — but it set a user-facing expectation.

**Decision: Option β — fully dismiss.** Rationale:
- 017's UX contract is "Refine activation closes the popup." Changing it to "exits to search like spell-cast" diverges from that contract for no clear win.
- Refine's natural target is the editor (where the active note lives) — users want to return to it and watch their note change.
- The Cast Log is still accessible by re-opening the popup; no information loss.

Implementation: `refineCastAction` is invoked from both paths. The dispatcher's `close()` invocation is `() => popup.close()` (per `CommandPopupBuilder.build` line 59). Today, this routes through the override and stays open in detail phase. For Refine, we want full dismiss. **Two sub-options:**
- β1: have the builder pass a `close` closure to the dispatcher specifically for Refine that calls `popup.dismiss()` (super.close) instead of `popup.close()`. But `dispatcher` is constructed once per popup (`createDispatcher: (close) => new CastDispatcher({...})`), with `close` baked in. We'd need a second dispatcher for Refine or a per-dispatch close override.
- β2: keep the dispatcher's `close = popup.close()`. After `dispatcher.dispatch(...)` returns, the `refineCastAction` closure additionally calls `popup.dismiss()`. The dispatcher's `close()` will have already exit-to-searched the popup (in detail phase) or no-op (in search phase, where it fully closed). Then `popup.dismiss()` fully closes from either state. Idempotent — `dismiss()` calls `super.close()` which is safe to call after `super.close()`.
- β3: don't pass `close` to the dispatcher at all; let `refineCastAction` handle popup dismissal itself. Requires the dispatcher to NOT call `close()` for Refine. But the dispatcher's `close` is hardcoded, not per-dispatch.

**Decision: β2.** The `refineCastAction` calls `dispatcher.dispatch(input)` (synchronous), then `popup.dismiss()`. The `popup` reference is captured via `let popup: CommandPopup; popup = ...` pattern already in use in `CommandPopupBuilder` (see line 31-59). Add to the builder:

```ts
const refineCastAction: RefineCastAction = (snapshot) => {
  const activeFile = this.#deps.app.workspace.getActiveFile();
  if (!activeFile || activeFile.extension !== 'md') {
    new Notice('Refine needs an open note');
    return;
  }
  dispatcher.dispatch({ ... });
  popup.dismiss();        // fully closes after dispatch; idempotent if dispatcher's close() already ran
};
```

The `dispatcher.dispatch` synchronously calls `notify` + `close()` + `caster.cast` (the cast is then async). By the time `popup.dismiss()` runs, the dispatcher's `close()` has already executed; the popup may or may not have fully closed depending on its phase. `dismiss()` is idempotent and always ensures full closure. Documented in Key design decisions §3.

### Active-note guard

```
User: focus Refine → Enter (no active note in workspace)
  → SearchPhase.handleEnter → spellsPanel.confirm(refineIndex)
  → SpellsPanel: 'refine-cast' emitted
  → CommandPopup → refineCastAction(snapshot)
  → CommandPopupBuilder:
        activeFile = app.workspace.getActiveFile() === null
        new Notice('Refine needs an open note')
        return                                 // popup stays open; no log write, no caster invocation
```

`logWriter.recordCasted` is NOT called for this path — no cast was ever initiated. The Cast Log is clean. The user sees the toast and is still in the popup, focused on Refine.

## Error handling

| Failure | Response |
|---|---|
| No active markdown file | `Notice('Refine needs an open note')`; popup stays open. No log write. No caster invocation. |
| Active file is non-markdown | Same as above. The `activeFile.extension !== 'md'` guard catches it. |
| Remote mode + empty `portalHost` | Existing `CastDispatcher` guard fires; same Notice text as today (`'Configure portal host in settings before casting remotely.'`); popup stays open (dispatcher returns before `close()`). Refine path inherits this unchanged. |
| Cast spawn failure / non-zero exit | Routed through `LocalCaster.onFailure` → dispatcher's `onFailure` → `recordError` + `Notice('Cast failed: …')`. Cast Log shows the error entry under spellPath=`<refine>`. |
| Both `exit` and `error` fire | `CastSpawner.safeResolve` race-condition guard, unchanged. |
| `renderRefinePrompt()` throws | Cannot — it returns a static string. Defensive: even if a future change adds substitution, a throw at this point would surface as a synchronous error in `refineCastAction`; document in unit test for the function. |
| Concurrent Refine triggers (rapid Enter, Enter, Enter) | Each invocation mints its own `castId`. Three independent casts spawn. Dispatcher's `close()` runs three times; first call dismisses the popup, second/third are no-ops. Same semantics as spell-cast. |
| Refine cast against a note currently being saved | Out of scope; Obsidian's vault adapter handles consistency. |
| `activeFile.path` changed between guard and dispatcher invocation | Cannot — synchronous; captured before `dispatcher.dispatch` and stored in the local `activeFile` variable; subsequent workspace changes do not race. |
| `SpellEvents` rename breaks downstream consumers | Confirmed at planning time that `'dismiss-refine'` has exactly two consumers: `SpellsPanel.confirm` (emit) and `CommandPopup.#createSpellsPanel` (listen). Both updated in scope. Grep-assert in E1 confirms no straggler. |
| Existing integration test `tests/integration/refine-options-panel.spec.ts` D5-2 / D5-4 fail | They will. They pin the placeholder dismiss-only behavior (D5-2: form submit → modal fully closed with no cast; D5-4: Enter on Refine row → modal fully closed with no cast). Section E rewrites them to: D5-2 → form submit dispatches a Refine cast (assert `dispatcher.dispatch` called once, then modal closed); D5-4 → Enter on Refine row with active note dispatches and closes; with no active note shows Notice and stays open. |

## Perspective synthesis (deep)

### Minimalist consensus

Cut:
- No `RefineImprinter` class — `CastDispatcher.dispatch` accepts the Refine shape with one new optional field.
- No `RefineMaterializer` — the prompt is static text, sent inline.
- No new event family — rename existing `dismiss-refine` to `refine-cast`; semantics carry the diff, not a parallel event.
- No `buildRefineUserPrompt` separate function — the dispatcher's existing `#buildUserPrompt` produces exactly the per-cast preamble Refine needs.
- No mode detection, no `@cast` parsing, no inline marker styling in plugin (no-gos).

Keep:
- `renderRefinePrompt()` pure function (necessary — owns the prompt body).
- `REFINE_SPELL_PATH` constant + display-name branch (necessary — cast-log row identity).
- `refineCastSpell()` factory (necessary — gives the dispatcher a `Spell` with the right `path`).
- `CastDispatchInput.systemPromptInline` field (necessary — minimal extension point).
- `optionsFormSnapshotFromRefineDefaults` helper (necessary — list-Enter snapshot must respect persisted defaults per pitch).

### Extensibility

The seams that future iterations will reach for:
- **Custom Refine Script** (rabbit hole, no-go for now): replace `renderRefinePrompt()` with `resolveRefinePromptSource(settings, vault)` returning either the built-in or a user-authored file's contents. One-method swap; the call site in `CommandPopupBuilder.refineCastAction` stays identical.
- **Materialize Refine to `refine.md`** if the inline payload becomes too large for remote casts: introduce `RefineMaterializer`, `forgeSpellPathPluginRel`-equivalent on `PluginPaths`, wire into `CastLogModule.initStartupMaintenance`. The dispatcher call site changes from `systemPromptInline: renderRefinePrompt()` to `systemPromptFile/spellPath` pair — the same kind of swap forge made in 018.
- **Autonomous Generate/Expand modes** (rabbit hole, no-go for now): add a `RefineMode` enum to `RefineCastAction`'s snapshot or pass through the OptionsPanel; the prompt body branches; the active-note guard relaxes for Generate.
- **`@cast` directive parsing in the plugin** (no-go for now): add a preprocess step in `refineCastAction` that scans the active note before invoking the dispatcher. The dispatcher itself does not change.

The plan does not pre-build any of these seams. It does keep them cheap to add: each is a one-call-site swap.

### Devil's advocate (the load-bearing perspective)

**Risks identified and their mitigations:**

1. **Active-note guard at wrong layer would silently close the popup on a missing-note error.** The pitch demands "the picker stays open" — but `CastDispatcher`'s existing `executeOnNote && activeFilePath === null` guard calls `this.#close()` (= `popup.close()`), which closes the popup. **Mitigated:** the Refine guard fires *before* the dispatcher (in `CommandPopupBuilder.refineCastAction`), so the dispatcher never sees the null-path case for Refine.

2. **`SpellEvents` rename is a breaking change inside the plugin.** Two emit sites (`SpellsPanel.confirm`) and two listen sites (`CommandPopup.#createSpellsPanel`). Plus tests. **Mitigated:** D2 + D3 update all four in scope; E1 grep-asserts no straggler reference.

3. **Two existing integration tests pin the placeholder behavior** (`refine-options-panel.spec.ts` D5-2, D5-4). They will fail until rewritten. **Mitigated:** E2 is scheduled in the same section as the new integration test (E1) so the suite is green at section boundary.

4. **The list-Enter snapshot defaults question.** Pitch says "persisted Refine defaults …". If the list-Enter path bypasses `SpellOverrideStore`, persisted defaults are silently ignored. **Mitigated:** `optionsFormSnapshotFromRefineDefaults` resolves via the same cascade (session → override → settings) used by `RefineOptionsDetail`. Tested at A6 + integration test E1 with override pre-loaded.

5. **`executeOnNote` from the snapshot is overridden to `true` in the dispatch input.** If the user toggles the checkbox to false in the Refine OptionsPanel (which is still visible — 017 didn't hide it), they may expect their preference to be respected. **Documented behavior, not a bug.** The pitch enforces "Refine requires an active note"; `executeOnNote: false` is incoherent for Refine. Documented in Edge cases + Open questions. Future iteration may hide the checkbox for Refine.

6. **Inline `userPrompt` payload over remote = repeating the 018 problem.** The Refine prompt body sits on top of every remote Refine cast. **Acknowledged trade-off** (Technical notes). Bounded: Refine prompt is shorter than forge's was; Refine is invoked less often than spell-cast; future iteration migrates to `refine.md` materialization with a one-method swap.

7. **The dispatcher's `close()` runs in detail phase, exits to search.** After a dialog-Cast Refine, the popup would stay open by default (matching spell-cast UX). The pitch contract from 017 is "fully dismisses the modal." **Mitigated:** `refineCastAction` calls `popup.dismiss()` after `dispatcher.dispatch` returns. `dismiss()` is idempotent and bypasses the close-override. Documented in Key design decisions §3.

8. **`CastDispatchInput.systemPromptInline` is a new optional field on a hot interface.** Risk: future call sites forget to set it for Refine-like shapes. **Mitigated:** there is exactly one call site that sets it (the Refine builder closure); spell-cast and forge-cast call sites are unchanged. The field is optional; absence is the safe default.

9. **`refineCastSpell()` is a synthetic `Spell` whose `path` is the cast-log sentinel `<refine>`, not a real vault path.** If a future dispatcher branch tried to resolve `spell.path` against the vault (e.g. to read frontmatter), it would fail. **Mitigated:** the dispatcher never reads anything from `spell.path` beyond logging it via `recordCasted({ spellPath: spell.path })` and passing it through to `CastInput.spellPath` (for remote, where the portal looks it up). For Refine + remote, the portal would try to look up `<refine>` and fail. **Open question — see Open questions.**

10. **Concurrent Refine triggers.** Mentioned in Edge cases; same semantics as spell-cast. No mitigation needed.

### User-advocate

The user-facing surface this iteration changes:

- **Enter on Refine row now casts.** With an active markdown note open: the user sees `Casting 'Refine'…` toast, the popup closes, and (locally) shortly thereafter `Spell cast` toast. Without an active markdown note: `Refine needs an open note` Notice; popup stays open.
- **Cast in Refine OptionsPanel now casts.** Same toasts; popup fully dismisses (mirroring 017's contract).
- **Cast Log shows `Refine` rows.** Display name resolves to `Refine` (mirroring `Forge`).
- **Persistence works.** A user who set their Refine default model to Opus once: Enter-from-list uses Opus next time, even without re-opening the OptionsPanel.

Friction points kept low:
- The Notice text is short and actionable.
- The popup dismissal contract matches 017's user-trained expectation.
- The cast log row labels are descriptive (`Refine`) rather than opaque (`<refine>`).

### Synthesis: critical concerns (consensus)

| Concern | Decision |
|---|---|
| Active-note guard placement | Builder layer, before dispatcher (Devil's advocate #1). |
| Prompt delivery: inline vs materialized | Inline, with a documented migration seam (Devil's advocate #6, Minimalist). |
| Snapshot defaults for list-Enter | Resolve via override-cascade keyed on `REFINE_SENTINEL_PATH` (User-advocate, Devil's advocate #4). |
| `executeOnNote` override | Forced to `true` in dispatch input; checkbox not hidden this iteration (Devil's advocate #5). |
| Popup dismissal after cast | Always full-dismiss via `popup.dismiss()` after dispatch returns (Devil's advocate #7, 017's contract). |
| Cast-log sentinel `<refine>` vs override-key `<grimoire-sentinel:refine>` | Stay separate; two namespaces (Minimalist, all). |
| `refineCastSpell().path = '<refine>'` over the wire for remote | Open question — see Open questions. |

## Key design decisions

1. **`CastDispatchInput` gains one optional field, not a new method.** `systemPromptInline?: string` is the minimal extension that preserves the shared casting primitive (pitch rabbit hole: "do not invent a new casting primitive for Refine"). Live spells and forge-cast omit the field; behavior unchanged. The dispatcher's `dispatch` method has one new conditional (~3 LOC) and one new branch in `systemPromptFile` selection (~1 LOC). Tested at B3 (unit) + E1 (integration).

2. **Refine prompt is sent inline via `userPrompt`, not materialized to a file.** Two reasons: (a) pitch says "lives next to the code"; (b) the prompt is static — no settings or per-cast substitution — so file-on-disk gains nothing over an inline string. The trade-off (Refine prompt traverses the wire on every remote Refine cast) is acknowledged in Technical notes and Devil's advocate #6. The migration seam is one call-site swap in `CommandPopupBuilder.refineCastAction`.

3. **`popup.dismiss()` after `dispatcher.dispatch()` is how Refine cast fully closes the modal.** The dispatcher's `close = popup.close()` is route-through-override. For Refine's "always fully dismiss" contract (017 carryover), `refineCastAction` calls `popup.dismiss()` (= `super.close()`) immediately after `dispatcher.dispatch` returns. `dismiss()` is idempotent — calling it after the dispatcher's `close()` has already ran is safe (`super.close()` checks `containerEl.parentElement`).

4. **The Refine cast-log sentinel is `<refine>` (new), separate from the override-storage key `<grimoire-sentinel:refine>` (existing).** Mirrors the forge-cast pattern where `FORGE_SPELL_PATH = '<forge>'` is the cast-log sentinel and Refine's `REFINE_SENTINEL_PATH = '<grimoire-sentinel:refine>'` is the override-storage key. Two namespaces because they serve different purposes: one identifies cast-log rows; the other keys persistence. Co-locate the two in their respective files (`castLog/types.ts` and `domain/spells/Spell.ts`) — do not unify.

5. **Active-note guard is at the `CommandPopupBuilder.refineCastAction` layer, not the dispatcher.** The existing `CastDispatcher.dispatch` guard (`executeOnNote && activeFilePath === null`) calls `this.#close()`, which dismisses the popup — wrong semantics for Refine ("the picker stays open"). The Refine-specific guard fires in the closure before invoking the dispatcher. The dispatcher's guard remains untouched and continues to govern spell-cast.

6. **`SpellEvents.dismiss-refine` renamed to `refine-cast`.** The event name now describes what it does: triggers a Refine cast. Renaming is a small, search-able diff; leaving the name `dismiss-refine` while it actually fires a cast would invite confusion. Two emit sites and two listen sites, all updated in scope (Section D).

7. **`executeOnNote: true` is forced for Refine, regardless of snapshot.** The user can toggle the checkbox in the Refine OptionsPanel (it stays visible — 017 didn't hide it), but the toggle is ignored by the dispatch input. The pitch enforces "Refine requires an active note" universally; `executeOnNote: false` for Refine is incoherent. The checkbox visibility is left for a future cleanup iteration to address.

8. **`optionsFormSnapshotFromRefineDefaults` is a new helper that mirrors `RefineOptionsDetail`'s resolver call.** The list-Enter path consults `SpellOverrideStore` + `OptionsSessionMap` (via `resolveSpellOptions` keyed on `REFINE_SENTINEL_PATH`) so persisted defaults take effect, per the pitch. A future cleanup may extract a shared `resolveRefineOptions` from `RefineOptionsDetail.#resolveOptions` and this helper — out of scope here.

9. **The dispatcher's `systemPromptFile` is omitted when `systemPromptInline` is set.** Mutually exclusive: one or the other, never both. Local CLI args for Refine: `-p <userPrompt with prepended Refine body>` only — no `--system-prompt-file`. Documented in B3 unit test.

10. **`Notice` import lives in `CommandPopupBuilder`, not in `CommandPopup`.** The popup is structural UI; the builder is the composition root for the popup + dependency wiring. `PopupModule` already imports `Notice` (for the dispatcher's `notify` callback). The builder taking the same dep is consistent and keeps `CommandPopup` free of `Notice`.

## Patterns considered (design-patterns skill, Step 1 applied)

| Pattern | Decision | Reason |
|---|---|---|
| **Strategy** for caster mode selection (local vs remote) | **Already applied** in cast-unification (014); not new here. The dispatcher consumes a `Caster` via its `caster()` thunk — Refine inherits this seam unchanged. |
| **Factory function** for `refineCastSpell()` | **Adopted** — pure function, mirrors `optionsFormSnapshotFromDefaults`. A class would be ceremony for one no-arg constructor. |
| **Template Method** between Refine and spell-cast dispatch flows | **Rejected** — the two flows already share the dispatcher; the only divergence is the `systemPromptInline` field, which is data, not a template hole. |
| **Adapter** wrapping the dispatcher for Refine-specific input shaping | **Rejected** — adding `systemPromptInline` directly to `CastDispatchInput` is one field; an adapter class would obscure the single divergence. |
| **Observer / event emitter** for `refine-cast` | **Already applied** — reuses the existing `TypedEmitter<SpellEvents>` pattern. The new event member is one line. |
| **Command** for Refine cast trigger | **Rejected** — a single `refineCastAction` callback is a Command-shaped object already (closure carrying state); wrapping it in a class adds no testability or composition. |
| **State pattern** for Refine cast lifecycle (`casted → in-progress → done`) | **Already implemented** at the cast-log layer (`foldEvents` in `castLog/`); Refine inherits unchanged. |
| **Decorator** around the dispatcher to add the Refine guard | **Rejected** — the guard is one `if` statement before the dispatcher call. A decorator class would invert the dependency direction (dispatcher would not know about its decorator) but add a class for a 3-line gain. YAGNI. |
| **Builder** for `CastDispatchInput` | **Rejected** — the input shape is already a plain object with named fields. A builder adds a fluent API for no concrete win; the Refine call site constructs it once. |
| **Materializer** (mirroring `ForgeMaterializer`) | **Considered + rejected** — the Refine prompt is static text. Per Devil's advocate #6 and Key design decision §2, inline mode wins on simplicity; the materializer pattern is the documented future migration. |
| **Repository** for Refine override persistence | **Already applied** — `SpellOverrideStore` indexed by `SpellPath` keys (including `REFINE_SENTINEL_PATH`). Refine inherits unchanged. |

Patterns deliberately not invoked: Visitor (no traversal hierarchy), Chain of Responsibility (no chain), Mediator (no central coordinator beyond the existing `CommandPopupBuilder`).

## Design-rubric Section 7 self-critique

- **Q: Does each new component have one reason to change?**
  - `renderRefinePrompt`: changes only if the Refine prompt body changes.
  - `refineCastSpell`: changes only if the synthetic-spell shape for Refine changes (e.g. if `Spell` interface grows a required field).
  - `REFINE_SPELL_PATH` constant: changes only if the cast-log sentinel string changes.
  - `optionsFormSnapshotFromRefineDefaults`: changes only if the snapshot-resolution rule for the list-Enter path changes.
  - `CastDispatchInput.systemPromptInline` field: changes only if the inline-system-prompt-prepend semantics change.
  - `CommandPopupBuilder.refineCastAction`: changes only if the Refine cast orchestration (guard → dispatch → dismiss) changes.
  Yes for each.

- **Q: Are dependencies pointed away from volatility?**
  - `src/refine/refinePrompt.ts` — pure string; no deps.
  - `src/refine/refineCastSpell.ts` — depends on stable `Spell` interface and stable `REFINE_SPELL_PATH` constant.
  - `CastDispatcher` (stable) gets one optional field — additive, backward-compatible.
  - `CommandPopupBuilder` (volatile composition root) depends on `Spell.ts`, `SpellPath.ts`, `castLog/types.ts`, `refine/*` — all upstream-stable.
  - `CommandPopup` (volatile UI) gets one new param and one new event handler — additive.

- **Q: Is the interface small enough that mocking is cheap?**
  - `RefineCastAction` is a one-arg callback — `vi.fn()` suffices.
  - `renderRefinePrompt()` is no-arg — direct call.
  - `refineCastSpell()` is no-arg — direct call.
  - The dispatcher's new field is optional — existing mocks don't need updating.

- **Q: Are we creating abstractions that have only one implementation?**
  - `RefineCastAction` is a type alias for one callable; not an interface with multiple impls. ✓
  - `renderRefinePrompt` is a function, not an interface. ✓
  - `refineCastSpell` is a factory function. ✓
  - No premature polymorphism.

- **Q: What is the worst-case test for each public seam?**
  - `renderRefinePrompt()`: assert the returned string contains the four invariants (Execution Mode, MCP Tools, Refine workflow, output rule). Substring checks; not snapshot.
  - `refineCastSpell()`: assert returned shape `{ name: 'Refine', path: '<refine>', executeOnNote: true }`.
  - `REFINE_SPELL_PATH`: equality assertion.
  - `optionsFormSnapshotFromRefineDefaults`: pre-load `SpellOverrideStore` with a Refine override; assert returned snapshot reflects it; pre-load nothing → returned snapshot reflects `FormDefaults`.
  - `CastDispatchInput.systemPromptInline`: unit test on `CastDispatcher.dispatch` — when set, the caster's `CastInput.userPrompt` starts with the inline string; when unset, behaves identically to today.
  - `CommandPopupBuilder.refineCastAction`: integration test — Enter on Refine with active note dispatches with the right shape; without active note shows Notice and does not dispatch.

- **Q: Is there any temporal coupling?**
  - `refineCastAction` captures `activeFile` once; subsequent workspace changes do not race. ✓
  - The `popup.dismiss()` call after `dispatcher.dispatch` is order-dependent but synchronous; documented. ✓
  - `renderRefinePrompt()` is a pure function; no temporal coupling.

- **Q: Could we cut any of this and still ship?**
  - `optionsFormSnapshotFromRefineDefaults` could be inlined into the popup's `refine-cast` event handler. Extracting it lets the helper be unit-tested in isolation and creates a single function-name to grep. Worth keeping.
  - `refineCastSpell()` could be inlined into the builder's `refineCastAction`. Same reasoning: testable, greppable.
  - `CastDispatchInput.systemPromptInline` is the bare minimum extension; cannot cut.
  - The `<refine>` cast-log sentinel cannot be cut — without it, Refine rows would appear in the cast log as `<refine>` (or whatever raw path string), not `Refine`.

## Technical notes

### Open questions (planner cannot resolve from pitch alone)

1. **Remote Refine + `spellPath` over the wire.** `RemoteCaster` passes `input.spellPath` to `RemoteCastTransport`, which sends it to the portal. For Refine, `input.spellPath` would be `<refine>` (the cast-log sentinel) — the portal would attempt to look this up as a vault path and fail. **Resolution paths:**
   - **(a)** `CastDispatcher.dispatch` passes `undefined` for `spellPath` when `systemPromptInline` is set, regardless of `spell.path`. This makes remote-Refine an inline-mode cast (no spell-file lookup). The portal already supports optional `spellPath`. ✓
   - **(b)** Materialize `refine.md` like forge.md and pass a real path. Bigger scope; deferred.
   - **(c)** Hard-block remote Refine in this iteration; show a Notice "Refine is local-only".
   - **Decision: (a)** — the dispatcher omits `spellPath` from `CastInput` when `systemPromptInline` is set. Documented in B3 unit test ("when systemPromptInline is set, caster receives `spellPath: undefined`"). Verified against `src/execution/Caster.ts:6` ("Spell file path — omitted for inline casts such as forge meta-spells") — the optional-spellPath pattern is already in place from cast-unification (014) and was the pre-018 forge behavior.

2. **Hiding the `executeOnNote` checkbox in the Refine OptionsPanel.** Pitch is silent; 017 left it visible as a placeholder. With 019 forcing `executeOnNote: true` in the dispatch input regardless of the checkbox state, the checkbox is now misleading UI. **Defer to a future iteration** — modifying `RefineOptionsDetail` to hide the checkbox is a separable polish change; doing it in 019 broadens the diff. Documented as an out-of-scope future item.

3. **Cast Log row affordances for Refine entries.** Pitch: "No re-cast affordance on Refine entries in the Cast Log. The existing log behaviour applies unchanged." Existing `CastLogRow` has special handling for `FORGE_SPELL_PATH` (`record.spellPath === FORGE_SPELL_PATH || record.executeOnNote !== true) return`). For Refine, `record.executeOnNote === true` and `record.spellPath === REFINE_SPELL_PATH`. The current `CastLogRow` line 196 logic would (a) skip the special path for `<forge>` (not Refine's path), and (b) not skip the executeOnNote branch (Refine has it true). **Verify in section A** that Refine entries render correctly without modification — if `CastLogRow` requires a Refine branch to render the cast-log entry sensibly, that's an additional A-section todo. Today's behavior likely Just Works because the function returns early for `executeOnNote !== true || spellPath === FORGE_SPELL_PATH`; for Refine (`executeOnNote: true`, `spellPath: <refine>`), execution continues to the live-spell branch, which would try to resolve a vault file at `<refine>` — and fail to find one. **Pre-emptive todo (A4):** extend the early-return in `CastLogRow` line 196 to also skip when `spellPath === REFINE_SPELL_PATH`. Document in A4.

### Dependencies

- No new runtime deps. No new dev deps.
- All Obsidian APIs used (`App`, `Notice`, `TFile.extension`, `Workspace.getActiveFile`) are existing.

### Test strategy

- **Unit tests:** `renderRefinePrompt` (substring invariants), `refineCastSpell` (shape), `REFINE_SPELL_PATH` (equality), `resolveDisplayName` for `<refine>` (returns `'Refine'`), `optionsFormSnapshotFromRefineDefaults` (override-cascade behavior), `CastDispatcher.dispatch` with `systemPromptInline` set (prepend + `systemPromptFile === undefined` + `spellPath === undefined` to the caster).
- **Integration tests:** new `tests/integration/refine-cast.spec.ts` covering the four primary paths (list-Enter happy, list-Enter no-note, dialog-Cast happy, dialog-Cast no-note). Existing `tests/integration/refine-options-panel.spec.ts` D5-2 and D5-4 rewritten in scope.
- **No mutation testing pass** triggered in scope; the iteration's quality gate is `npm test` + `npm run test:integration` + `npm run lint`.

### Migration & ordering

1. Section A lands first — pure additions (prompt body, sentinel constant, factory, display-name branch). Zero cross-cutting changes.
2. Section B — additive `CastDispatchInput` field; existing dispatcher tests stay green.
3. Section C — `CommandPopupBuilder` and `CommandPopupParams` extension; existing tests need the new param added with a `vi.fn()` default in the harness.
4. Section D — event rename + popup wiring; the rename ripples to `SpellsPanel` emit, `CommandPopup` listen, and `tests/SpellsPanel.test.ts` + `tests/integration/refine-options-panel.spec.ts`.
5. Section E — integration tests; the new spec is green; the rewritten D5-2 / D5-4 are green.
6. Section F — live-specs.

### Future-migration seam

If the inline-`userPrompt` approach (Key design decision §2) becomes a bottleneck (remote payload size, prompt body growing), migrate to materialization:
- Add `src/refine/RefineMaterializer.ts` (mirrors `ForgeMaterializer`).
- Add `PluginPaths.refineSpellPathVaultRel()` / `refineSpellPathAbs()`.
- Wire into `CastLogModule.initStartupMaintenance` and `materializeRefine()` (mirroring forge's `materializeForge()`).
- Swap `systemPromptInline: renderRefinePrompt()` for `systemPromptFile: paths.refineSpellPathAbs` + `spellPath: paths.refineSpellPathVaultRel` in `CommandPopupBuilder.refineCastAction`.
- Remove `CastDispatchInput.systemPromptInline` once no remaining call sites use it.

Total migration footprint: ~80 LOC across 4 files + tests. Not in scope here.

---

## Todos

### A. Refine prompt body, cast-log sentinel, synthetic spell, display-name branch

#### Section briefing

**What this section produces:** four new files and three extensions. Files: `src/refine/refinePrompt.ts` (pure `renderRefinePrompt(): string`), `src/refine/refineCastSpell.ts` (factory `refineCastSpell(): Spell`), and unit-test files `tests/refine/refinePrompt.test.ts` + `tests/refine/refineCastSpell.test.ts`. Extensions: `REFINE_SPELL_PATH` added to `src/castLog/types.ts`; `resolveDisplayName` recognizes `<refine>` in `src/castLog/format/displayName.ts`; `CastLogRow.ts` line 196 early-return adds the Refine sentinel.

**Design context the executor needs upfront:** see Interfaces → `REFINE_SPELL_PATH` and `refineCastSpell`. See Key design decisions §4 (two separate namespaces — cast-log sentinel `<refine>` vs override-storage `<grimoire-sentinel:refine>`) and §7 (Refine `executeOnNote: true` is the synthetic spell's invariant). The Refine prompt body content's canonical reference is `brain/Grimoire - Refine Note Spell` — use `mcp__obsidian-mcp-tools__get_vault_file` with the path `Grimoire - Refine Note Spell.md` (or `Grimoire - Refine Note Spell` — try both) to fetch verbatim wording for the body. The function `renderRefinePrompt()` returns a static string with the four sections in order: (1) Execution Mode IMMEDIATE EXECUTION callout; (2) MCP Tools (Obsidian MCP first, filesystem fallback via VAULT_MOUNT_PATH); (3) Refine workflow (read note → if `@cast` lines: act + remove; if follow-up: apply globally; if neither: exit no-op); (4) Output rule (write back to the active note path given in the user prompt).

**Cross-section couplings:**
- A1 (refinePrompt.ts) is consumed by C2 (`CommandPopupBuilder.refineCastAction`) which calls `renderRefinePrompt()`.
- A2 (`REFINE_SPELL_PATH`) is consumed by A3 (`refineCastSpell` uses it as the path), A5 (`resolveDisplayName` branches on it), A6 (`CastLogRow` early-return checks it).
- A3 (`refineCastSpell`) is consumed by C2 (builder constructs the dispatch input with it).
- No coupling outward to B/D/E/F.

**Section-level Red criterion:**
- `tests/refine/refinePrompt.test.ts` asserts `renderRefinePrompt()` returns a non-empty string containing each of: `IMMEDIATE EXECUTION`, `MCP Tools`, `VAULT_MOUNT_PATH`, `@cast`, `follow-up` (case-insensitive search), and an instruction phrase covering the no-instruction exit case (e.g. `nothing has been requested` or `exit without modifying`). The exact wording is dev-agent's call, sourced from `brain/Grimoire - Refine Note Spell`. Test asserts on stable substrings, not full-string snapshot.
- `tests/refine/refineCastSpell.test.ts` asserts: `refineCastSpell()` returns `{ name: 'Refine', path: spellPath('<refine>'), executeOnNote: true }`; two consecutive calls return objects with `===`-equal `path` (constant identity).
- `tests/castLog/types.test.ts` (extend or create) asserts `REFINE_SPELL_PATH === '<refine>'`.
- `tests/castLog/format/displayName.test.ts` (extend) — a `CastRecord` with `spellPath: '<refine>'` returns `'Refine'`; with `spellPath: '<refine>'` AND `affectedFiles: ['x.md']` still returns `'Refine'` (no file-decoration for Refine in this iteration, mirroring the documented decision in Components).
- `tests/CastLogRow.test.ts` (extend) — a record with `spellPath: '<refine>'` and `executeOnNote: true` short-circuits the same early-return that handles `<forge>`, i.e. the navigation-affordance branch is skipped (mirror existing Forge test assertion).
- `npm test` green; `npm run lint` green.

**junior-dev**
- [ ] A1: create `src/refine/refinePrompt.ts` exporting `renderRefinePrompt(): string`. Fetch the canonical body content from `brain/Grimoire - Refine Note Spell` via `mcp__obsidian-mcp-tools__get_vault_file`. Render the body in the four-section order (Execution Mode → MCP Tools → Refine workflow → Output rule) per the Section briefing. Add a top-of-file JSDoc noting: (a) canonical content reference; (b) future migration seam (mirror forge-spell-materialization if the body grows beyond ~30 lines or becomes settings-dependent). — M, junior-dev
- [ ] A2: in `src/castLog/types.ts`, after the existing `FORGE_SPELL_PATH` line (line 57), add `export const REFINE_SPELL_PATH = '<refine>' as const;` with a one-line JSDoc mirroring `FORGE_SPELL_PATH`'s ("Sentinel spell path for casts originating from the Refine sentinel (not a live spell)."). — S, junior-dev
- [ ] A3: create `src/refine/refineCastSpell.ts` exporting `refineCastSpell(): Spell` per Interfaces. Imports: `spellPath` from `../domain/spells/SpellPath`, `REFINE_SPELL_PATH` from `../castLog/types`, `type Spell` from `../domain/spells/Spell`. Body returns `{ name: 'Refine', path: spellPath(REFINE_SPELL_PATH), executeOnNote: true }`. JSDoc explains the synthetic-spell role for routing through `CastDispatcher`. — S, junior-dev
- [ ] A4: create `tests/refine/refinePrompt.test.ts` and `tests/refine/refineCastSpell.test.ts` per the Red criterion above. — S, junior-dev
- [ ] A5: extend `src/castLog/format/displayName.ts` — add an `if (record.spellPath === REFINE_SPELL_PATH) return 'Refine';` branch immediately after the existing `FORGE_SPELL_PATH` branch (line 20). Update `tests/castLog/format/displayName.test.ts` with the two new assertions (with and without `affectedFiles`). — S, junior-dev
- [ ] A6: extend `src/ui/components/CastLogRow.ts` line 196 — change `if (record.spellPath === FORGE_SPELL_PATH || record.executeOnNote !== true) return;` to `if (record.spellPath === FORGE_SPELL_PATH || record.spellPath === REFINE_SPELL_PATH || record.executeOnNote !== true) return;`. Imports add `REFINE_SPELL_PATH` from `../../castLog/types`. Update `tests/CastLogRow.test.ts` with a Refine assertion mirroring the existing Forge one. — S, junior-dev

### B. Extend `CastDispatchInput` with `systemPromptInline`

#### Section briefing

**What this section produces:** modified `src/cast/CastDispatcher.ts` — `CastDispatchInput` gains optional `readonly systemPromptInline?: string;`. `dispatch()` reads the field, prepends `${systemPromptInline}\n\n` to the per-cast prompt, and omits both `systemPromptFile` AND `spellPath` from the `CastInput` passed to `caster.cast` when `systemPromptInline` is set. Existing spell-cast and forge-cast paths leave the field undefined and behave identically to today.

**Design context the executor needs upfront:** see Interfaces → `CastDispatchInput` extension. Key design decisions §1 (one optional field, not a new method), §9 (`systemPromptFile` and `spellPath` are both omitted when `systemPromptInline` is set — mutually exclusive inline mode). Open question §1 (remote Refine path: dispatcher omits `spellPath` when `systemPromptInline` is set; verified consistent with `src/execution/Caster.ts:6`). Read `src/cast/CastDispatcher.ts` lines 71–106 — that's the exact span to modify.

Existing dispatcher logic (line 89):
```ts
systemPromptFile: isRemote ? undefined : `${settings.vaultMountPath}/${spell.path}`,
```
becomes:
```ts
const useInline = input.systemPromptInline !== undefined;
// ...
userPrompt: useInline ? `${input.systemPromptInline}\n\n${userPromptBase}` : userPromptBase,
systemPromptFile: useInline || isRemote ? undefined : `${settings.vaultMountPath}/${spell.path}`,
spellPath: useInline ? undefined : spell.path,
```

**Cross-section couplings:**
- B depends on A2 (`REFINE_SPELL_PATH`) only via the conceptual model — B doesn't import the constant directly; the dispatcher is path-agnostic.
- B is a prerequisite for C (the builder's `refineCastAction` calls `dispatcher.dispatch` with `systemPromptInline` set).
- B's existing-test impact: `tests/CastDispatcher.test.ts` must continue to pass without modification — the new field is optional. `tests/CommandPopupBuilder.test.ts` (if extant) and `tests/integration/spell-cast.spec.ts` should also be unaffected (they don't set the new field).

**Section-level Red criterion:**
- `tests/CastDispatcher.test.ts` (extend) adds three new test cases:
  - (a) `dispatch` called with `systemPromptInline: 'SYS_BODY'` and a normal spell: the caster's received `CastInput.userPrompt` starts with `'SYS_BODY\n\n'` and contains the existing per-cast preamble after.
  - (b) Same call: `CastInput.systemPromptFile === undefined` AND `CastInput.spellPath === undefined`.
  - (c) `dispatch` called WITHOUT `systemPromptInline`: `CastInput.userPrompt` does NOT start with `\n\n` (no spurious prepend); `CastInput.systemPromptFile === '<vault>/<path>'` for local; `CastInput.spellPath === spell.path`. (This is a regression-pin on existing behavior.)
- `npm test` green.

**senior-dev**
- [ ] B1: in `src/cast/CastDispatcher.ts`, add `readonly systemPromptInline?: string;` to `CastDispatchInput` interface with a JSDoc per Interfaces. — S, senior-dev
- [ ] B2: in `src/cast/CastDispatcher.ts` `dispatch()` body, introduce `const useInline = input.systemPromptInline !== undefined;`. After building `userPrompt` via `#buildUserPrompt`, conditionally prepend: `const finalUserPrompt = useInline ? \`${input.systemPromptInline}\\n\\n${userPrompt}\` : userPrompt;`. Pass `finalUserPrompt` into the `caster.cast` `CastInput`. Change `systemPromptFile` to `useInline || isRemote ? undefined : \`${settings.vaultMountPath}/${spell.path}\``. Change `spellPath` on the `CastInput` to `useInline ? undefined : spell.path`. — M, senior-dev
- [ ] B3: extend `tests/CastDispatcher.test.ts` with the three test cases in the Red criterion above. — M, senior-dev

### C. Builder-layer `refineCastAction` orchestration

#### Section briefing

**What this section produces:** modified `src/ui/CommandPopup.ts` — adds `RefineCastAction` exported type, `refineCastAction` field to `CommandPopupParams`, private `#refineCastAction` storage. Modified `src/ui/popup/CommandPopupBuilder.ts` — builds the `refineCastAction` closure (active-note guard → dispatch with synthetic Refine spell + `systemPromptInline` → `popup.dismiss()`). Modified `src/ui/options/OptionsFormState.ts` — adds `optionsFormSnapshotFromRefineDefaults` helper. Tests for the helper plus the closure-shape contract.

**Design context the executor needs upfront:** see Interfaces → `CommandPopup` callback addition and `CommandPopupBuilder` orchestration. Key design decisions §3 (`popup.dismiss()` after `dispatcher.dispatch` to fully close — idempotent), §5 (active-note guard is at the builder, not the dispatcher), §7 (`executeOnNote: true` is forced regardless of snapshot), §8 (`optionsFormSnapshotFromRefineDefaults` resolves via the same cascade `RefineOptionsDetail` uses), §10 (`Notice` import lives in builder, not popup). Data flow → all three flows (list-Enter happy, dialog-Cast happy, missing-note guard).

The `Notice` import is added to `CommandPopupBuilder.ts` — already imported in `PopupModule.ts:1`. The `TFile.extension` check is on `app.workspace.getActiveFile()?.extension !== 'md'` (per Edge cases). Verify the obsidian mock exposes `extension` on the mock TFile shape — see `tests/__mocks__/obsidian.ts` and update if needed (D-section if missing).

The new helper `optionsFormSnapshotFromRefineDefaults` lives in `src/ui/options/OptionsFormState.ts` (alongside the existing `optionsFormSnapshotFromDefaults`). It takes `(defaults, overrides, sessionMap, models)`; constructs the same `resolveSpellOptions` call `RefineOptionsDetail.#resolveOptions` makes (with the same empty-`settings`-stub workaround keyed on `REFINE_SENTINEL_PATH`); pulls `contextNotePaths` and `followUp` from the session map's `REFINE_SENTINEL_PATH` entry; forces `executeOnNote: true`.

**Cross-section couplings:**
- C1 (RefineCastAction type) is the type the rest of C depends on.
- C2 (`#refineCastAction` field on popup) consumes C1.
- C3 (`optionsFormSnapshotFromRefineDefaults` helper) is consumed by D2 (popup's `'refine-cast'` handler — Section D).
- C4 (builder closure) consumes A1 (`renderRefinePrompt`), A3 (`refineCastSpell`), B (dispatcher's new field).
- C does NOT yet wire the popup's `refine-cast` event handler (that's D2) or the `RefineOptionsDetail.onCast` rewiring (that's D3). C only adds the callback infrastructure; D consumes it.
- Test harnesses (`tests/integration/harness.ts`, `tests/CommandPopup.test.ts`) need `refineCastAction: vi.fn()` added to their `CommandPopup` construction — done in C5.

**Section-level Red criterion:**
- `tests/refine/optionsFormSnapshotFromRefineDefaults.test.ts` asserts: (a) with no override and empty session map, the returned snapshot has `model === defaults.defaultModel`, `effort === defaults.defaultEffort`, `contextNotePaths === []`, `followUp === ''`, `executeOnNote === true`; (b) with an override set at `REFINE_SENTINEL_PATH` for `{model: 'claude-opus-4', effort: 'high'}`, returned snapshot reflects the override; (c) with a session-map entry at `REFINE_SENTINEL_PATH` for `{contextNotePaths: ['foo.md'], followUp: 'do it'}`, returned snapshot reflects those values; (d) `executeOnNote` is always `true` regardless of inputs (no input can flip it).
- `tests/CommandPopup.test.ts` (extend) — `CommandPopupParams` requires `refineCastAction` field; constructing the popup without it is a TS compile error (verified via test code).
- `tests/integration/harness.ts` — `createPopupHarness` accepts optional `refineCastAction?: RefineCastAction` and threads it into the popup constructor (default `vi.fn()`).
- `npm test` green; `npm run lint` green; `npm run test:integration` green (existing integration tests continue to pass with the new default).

**junior-dev**
- [ ] C1: in `src/ui/CommandPopup.ts`, add `export type RefineCastAction = (snapshot: OptionsFormSnapshot) => void;` near the other action-type exports. Add `refineCastAction: RefineCastAction` to `CommandPopupParams`. Add `readonly #refineCastAction: RefineCastAction;` field. In the constructor, assign `this.#refineCastAction = params.refineCastAction;`. No wiring of `#refineCastAction` to events or `RefineOptionsDetail` yet — that's D. — S, junior-dev
- [ ] C2: in `src/ui/options/OptionsFormState.ts`, add `optionsFormSnapshotFromRefineDefaults` per Interfaces. Import `REFINE_SENTINEL_PATH` from `../../domain/spells/Spell`, `resolveSpellOptions` from `../../domain/settings/spellOptionsResolver`, and types as needed. The function body mirrors `RefineOptionsDetail.#resolveOptions` + `#buildFormState` — copy the resolver call (with the same empty-`settings`-stub keyed on `REFINE_SENTINEL_PATH`) and the session-map lookup. Return the snapshot with `executeOnNote: true`. — M, junior-dev
- [ ] C3: create `tests/refine/optionsFormSnapshotFromRefineDefaults.test.ts` covering the four assertions in the Red criterion. Use the same `SUPPORTED_MODELS` import as the production code; pre-load `SpellOverrideStore` and `OptionsSessionMap` per case. — M, junior-dev
- [ ] C4: extend `tests/integration/harness.ts` `createPopupHarness` to accept optional `refineCastAction?: RefineCastAction` and pass it (default `vi.fn()`) into the `CommandPopup` construction. Add the type import at the top. — S, junior-dev

**senior-dev**
- [ ] C5: in `src/ui/popup/CommandPopupBuilder.ts`, add a `refineCastAction` closure inside `build()` immediately before the `dispatcher` is constructed (the existing `let popup; popup = new CommandPopup({...})` pattern stays — the closure references both `popup` and `dispatcher` via closure capture, both of which are in scope by the time the closure fires at runtime). Closure body per Interfaces: active-note guard via `app.workspace.getActiveFile()` (check both `null` and `extension !== 'md'`); if guard fails, `new Notice('Refine needs an open note')` and `return`; else build dispatch input with `spell: refineCastSpell()`, `executeOnNote: true`, `systemPromptInline: renderRefinePrompt()`, and `activeFilePath: activeFile.path`, plus the snapshot's model/effort/contextNotePaths/followUp + `settings: this.#deps.plugin.data.settings`; call `dispatcher.dispatch(input)`; call `popup.dismiss()`. Pass `refineCastAction` into the `CommandPopup({...})` constructor params. Imports added: `Notice` from `obsidian`, `refineCastSpell` from `../../refine/refineCastSpell`, `renderRefinePrompt` from `../../refine/refinePrompt`. — M, senior-dev

### D. Wire two Refine triggers in `CommandPopup`; rename `dismiss-refine` → `refine-cast`

#### Section briefing

**What this section produces:** modified `src/domain/spells/SpellEvents.ts` (rename event). Modified `src/ui/tabs/SpellsPanel.ts` (`confirm` emits the new name). Modified `src/ui/CommandPopup.ts` — `panel.events.on('refine-cast', ...)` handler builds the refine snapshot via `optionsFormSnapshotFromRefineDefaults` and calls `this.#refineCastAction(snapshot)`. `#renderRefineOptionsPanel`'s `onCast: () => this.dismiss()` is replaced with `onCast: (snap) => this.#refineCastAction(snap)` — the dialog path now dispatches a cast instead of merely dismissing.

**Design context the executor needs upfront:** see Interfaces → `SpellEvents` rename and `CommandPopup` callback addition. Key design decisions §6 (rename `dismiss-refine` → `refine-cast` is in-scope and the only two emit/listen sites are touched). Data flow → list-Enter and dialog-Cast both converge on `refineCastAction`. After this section, the modal-dismiss behavior on Refine (017's contract) is preserved by `popup.dismiss()` inside `refineCastAction` (Section C).

**Cross-section couplings:**
- D1 (event rename) is consumed by D2 (popup's listener) and D3 (emit site in SpellsPanel).
- D2 + D3 + D4 land together in one section; if split, intermediate states break the suite.
- D depends on C (the `refineCastAction` infrastructure must be in place to wire to).
- E (integration tests) depends on D being green.

**Section-level Red criterion:**
- `tests/SpellsPanel.test.ts` (update) — the existing test that asserts `'dismiss-refine'` is emitted on Refine `confirm` is updated to assert `'refine-cast'`. No new test added; the rename is a one-for-one swap.
- `tests/CommandPopup.test.ts` (update or add) — a unit test asserting that emitting `'refine-cast'` on the spells panel invokes the popup's `#refineCastAction` with a snapshot resolved via `optionsFormSnapshotFromRefineDefaults` (mock the helper or assert the snapshot fields match the defaults+overrides setup).
- `tests/integration/refine-options-panel.spec.ts` D5-2 ("Cast inside Refine options panel fully closes the modal") — rewritten in this section's todos to assert `refineCastAction` is called once with the form snapshot, AND the modal is fully closed afterward.
- `tests/integration/refine-options-panel.spec.ts` D5-4 ("Enter on Refine sentinel fully closes the modal") — rewritten to assert: with active note, `refineCastAction` is called once with the resolved-defaults snapshot AND modal is closed; this todo's update is the "happy path with active note" version. The "no active note" assertion lives in Section E's new spec.
- Grep-assert: `grep -rn "dismiss-refine" src/ tests/` returns nothing.
- `npm test` green; `npm run test:integration` green.

**junior-dev**
- [ ] D1: in `src/domain/spells/SpellEvents.ts`, rename `"dismiss-refine": void;` to `"refine-cast": void;` (preserve the surrounding JSDoc; update it to "fired when the Refine sentinel is confirmed and a cast should be dispatched"). — S, junior-dev
- [ ] D2: in `src/ui/tabs/SpellsPanel.ts` `confirm()`, change `this.events.emit("dismiss-refine")` to `this.events.emit("refine-cast")`. Update the JSDoc for the method to reflect the new semantics ("triggers a Refine cast"). Update `tests/SpellsPanel.test.ts` accordingly. — S, junior-dev
- [ ] D3: in `src/ui/CommandPopup.ts` `#createSpellsPanel`, replace `panel.events.on("dismiss-refine", () => this.close());` with `panel.events.on("refine-cast", () => { const snapshot = optionsFormSnapshotFromRefineDefaults(this.#formDefaults, this.#overrides, this.#sessionMap, SUPPORTED_MODELS); this.#refineCastAction(snapshot); });`. Imports add `optionsFormSnapshotFromRefineDefaults` from `./options/OptionsFormState`. — S, junior-dev
- [ ] D4: in `src/ui/CommandPopup.ts` `#renderRefineOptionsPanel`, replace `onCast: () => this.dismiss(),` with `onCast: (snap) => this.#refineCastAction(snap),`. — S, junior-dev
- [ ] D5: update `tests/integration/refine-options-panel.spec.ts` D5-2 to assert: form submit invokes the harness's `refineCastAction` `vi.fn()` once with the OptionsPanel's snapshot AND the modal `containerEl.parentElement` is `null` (modal fully closed by the `popup.dismiss()` inside `refineCastAction`). For this to work, the harness's `refineCastAction` must actually be wired to a function that closes the popup — in this test, set `refineCastAction: vi.fn(() => h.modal.dismiss())` so the assertion is exercised. Alternatively, accept that the harness's default `vi.fn()` does not close the modal, and split the assertion: assert the `refineCastAction` was called (the contract) and separately assert that when `refineCastAction` calls `popup.dismiss()`, the modal closes (the popup's contract). Pick one approach; document in the test file's preamble. — S, junior-dev
- [ ] D6: update `tests/integration/refine-options-panel.spec.ts` D5-4 to assert: with an active markdown note in the workspace mock, pressing Enter on the Refine sentinel invokes the harness's `refineCastAction` `vi.fn()` once with the resolved-defaults snapshot. Defer the "modal fully closed" assertion to the same conditional logic as D5 — if the harness's mock closes via `popup.dismiss()`, assert it; else assert the call only. (The "no active note" branch is in Section E.) — S, junior-dev
- [ ] D7: grep-assert: `grep -rn "dismiss-refine" src/ tests/` returns nothing. Document in commit body. — S, junior-dev

### E. Integration tests: new `refine-cast.spec.ts` at the two seams

#### Section briefing

**What this section produces:** new file `tests/integration/refine-cast.spec.ts` covering the Refine cast trigger seam end-to-end through `CommandPopupBuilder`. Unlike D5 (which tests at the `CommandPopup` level via the harness), this spec tests the *full* builder + popup + dispatcher path — including the active-note guard, the dispatch input shape, and the modal-closure behavior. Two harnesses are needed: (a) the existing `createPopupHarness` (which constructs the popup directly with a stubbed `refineCastAction`) — useful for D5/D6 in Section D; (b) a new builder-level harness or a one-off in-test construction that uses `CommandPopupBuilder` with a real `dispatcher` whose `caster` is stubbed.

**Design context the executor needs upfront:** see Data flow → all three flows. Key design decisions §5 (guard at builder), §3 (`popup.dismiss()` after dispatch). Active-note resolution uses `app.workspace.getActiveFile()` — the obsidian mock at `tests/__mocks__/obsidian.ts` must expose `getActiveFile` returning a `TFile`-like shape with `.path` and `.extension`. If the mock lacks `extension`, extend it in scope. The dispatcher's `caster` thunk is stubbed via `vi.spyOn(CastRunner.prototype, 'run')` (the pattern from cast-unification J4); the `RemoteCaster` path is not exercised in this spec (its own integration spec already covers it).

**Cross-section couplings:**
- E depends on A, B, C, D all green.
- E1 (the new spec) is the section's primary deliverable; the **ui-integration-tester** group owns it.
- E2 (mock extension if needed) is in scope only if `tests/__mocks__/obsidian.ts` lacks `getActiveFile()` returning a fileable shape with `extension`.

**Section-level Red criterion:**

`tests/integration/refine-cast.spec.ts` covers:
1. **List-Enter happy path with active markdown note.** Pre-condition: `app.workspace.getActiveFile()` returns `{ path: 'notes/today.md', extension: 'md' }`; settings.executionMode = 'local'; `vi.spyOn(CastRunner.prototype, 'run')`. Navigate to Refine sentinel (ArrowUp from index 0 wraps to 11). Press Enter. Assert: `CastRunner.run` called once; the `CastRunInput.userPrompt` STARTS WITH the Refine prompt body (assert via `toContain('IMMEDIATE EXECUTION')` or similar substring); the `userPrompt` ALSO CONTAINS `Execute this spell against \`<vault>/notes/today.md\``; `CastRunInput` has no `systemPromptFile` (inline mode); the cast-log writer's `recordCasted` was called once with `spellPath: '<refine>'`; the modal's `containerEl.parentElement === null` (fully closed).
2. **List-Enter no-active-note guard.** Pre-condition: `app.workspace.getActiveFile()` returns `null`. Press Enter on Refine. Assert: `Notice` was constructed with `'Refine needs an open note'` (check `Notice.instances[Notice.instances.length - 1].message`); `CastRunner.run` NOT called; `recordCasted` NOT called; modal stays open (`containerEl.parentElement !== null`); still in search phase.
3. **List-Enter non-markdown-active-file guard.** Pre-condition: `app.workspace.getActiveFile()` returns `{ path: 'image.png', extension: 'png' }`. Press Enter on Refine. Assert: same as case 2.
4. **Dialog-Cast happy path with active markdown note.** Pre-condition: same as case 1. Navigate to Refine; press ArrowRight; verify options panel is mounted; submit the form (form submit event). Assert: `CastRunner.run` called once; `userPrompt` starts with the Refine prompt body; `recordCasted` called with `spellPath: '<refine>'`; modal fully closed.
5. **Dialog-Cast no-active-note guard.** Pre-condition: same as case 2. Navigate to Refine → ArrowRight → submit form. Assert: `Notice('Refine needs an open note')`; `CastRunner.run` NOT called; modal still open (the options panel may or may not still be visible — assert only on the cast-not-fired contract).
6. **List-Enter override persistence — happy path.** Pre-condition: case 1 setup + pre-load `SpellOverrideStore` with `REFINE_SENTINEL_PATH → {model: 'claude-opus-4', effort: 'high'}`. Press Enter on Refine. Assert: `CastRunner.run`'s input has `modelId: 'claude-opus-4'` and `effort: 'high'` — proving the list-Enter snapshot consulted the override store.
7. **Refine cast-log row displays as `Refine`.** Pre-condition: case 1 setup, plus a fake `recordCasted` writer captures the call. After the cast runs, simulate a cast-log read via `resolveDisplayName` on the captured record; assert returned string is `'Refine'`.

`npm run test:integration` green.

**ui-integration-tester**
- [ ] E1: write `tests/integration/refine-cast.spec.ts` containing the seven test cases above. Use the `createPopupHarness` to construct the popup BUT replace the harness's default `refineCastAction: vi.fn()` with a real builder-style closure — either (a) construct the `CommandPopupBuilder` directly for these tests (recommended; mirrors how `forge-cast.spec.ts` works for the end-to-end builder path) OR (b) inline-construct a `refineCastAction` that mirrors the builder closure verbatim. Document the choice in the test file's preamble. Use `vi.spyOn(CastRunner.prototype, 'run')` to capture the cast input. Use `Notice.instances` (set up via `beforeEach(() => { Notice.instances.length = 0; })`) to assert Notice contents. For the `recordCasted` assertion, inject a stubbed `CastLogWriter` (`{ recordCasted: vi.fn(), recordError: vi.fn() }`) via the harness or builder. — M, ui-integration-tester

**junior-dev**
- [ ] E2: read `tests/__mocks__/obsidian.ts`. If `App.workspace.getActiveFile` returns a shape lacking `extension`, extend the mock to return `{ path, extension }` (extracting `extension` from the path's basename — `.split('.').pop()`). Add a setter on the mock (e.g. `setActiveFile(fileOrNull)`) so tests can configure pre-conditions inline. If the mock already supports this shape, the todo is a no-op — mark done with a one-line commit message noting verification. — S, junior-dev

### F. Live-specs and drift sweep

#### Section briefing

**What this section produces:** new live-spec `docs/features/refine-cast.md` describing the shipped iteration (what it does, key components, data flow, edge cases, relationship to existing system). Drift updates on: `docs/features/refine-note-dialog.md` (017's spec — note the Enter / dialog-Cast paths now dispatch instead of dismissing, with a forward link to refine-cast.md), `docs/features/command-popup-ui.md` (state-diagram row for Refine sentinel + the "User-facing behavior" table — `Enter on Refine sentinel` now reads "Dispatch a Refine cast against the active note (Notice if no active note)" instead of "Close the popup"), `docs/features/cast-log-foundation.md` (add `<refine>` to the cast-log sentinel list alongside `<forge>`). `CLAUDE.md` and `README.md` checked for drift (likely no drift — they don't reference Refine in detail today).

**Design context the executor needs upfront:** This is a Section F (docs-only) housekeeping pass. The live-spec for 019 follows the `feature-doc-rubric` skill structure: What it does / Design decisions / Scope (in/out) / Relationship to existing system / Behavior changes. Cap at ~100 lines. Source of truth for the iteration's content is this plan + the squashed commit.

**Cross-section couplings:** F depends on A–E being final and committed.

**Section-level Red criterion:**
- `docs/features/refine-cast.md` exists and follows the feature-doc-rubric structure (matches `forge-spell-materialization.md`'s shape).
- `docs/features/refine-note-dialog.md` "Behavior changes" section gains a "since 019" addendum or its "What it does" paragraph is updated to reflect that Enter now casts.
- `docs/features/command-popup-ui.md` state diagram or behavior table reflects "Enter on Refine sentinel → dispatch cast" (specifics depend on the file's structure — sweep when writing F1).
- `docs/features/cast-log-foundation.md` references both `<forge>` and `<refine>` sentinels.
- Grep-assert: `grep -rn "dismiss-refine\|dismisses the modal directly\|Enter dismisses" docs/features/` returns either nothing or only historical-context mentions.
- `npm run lint` clean (Markdown files unaffected by ESLint but the lint command should not regress).

**junior-dev**
- [ ] F1: create `docs/features/refine-cast.md` per the `feature-doc-rubric` shape, mirroring `docs/features/forge-spell-materialization.md`. Sections: header with `dev/done-019`, "What it does", "Design decisions" (link to this plan's Key design decisions), "Scope (in/out)", "Relationship to existing system" (extends `cast-unification`, mirrors `forge-cast`, reuses `refine-note-dialog` from 017), "Behavior changes" (Enter on Refine row now casts; Cast inside Refine OptionsPanel now casts; new `<refine>` cast-log sentinel; no-active-note Notice). Cap at ~100 lines. — M, junior-dev
- [ ] F2: update `docs/features/refine-note-dialog.md` "Behavior changes" section. Add an addendum after the existing paragraphs: "**Since 019 (refine-cast):** `Enter` on the Refine row and Cast/Mod+Enter inside the Refine OptionsPanel now dispatch a Refine cast against the active note (with a `Notice` if no active note is open) instead of merely dismissing the modal. See `refine-cast.md`." — S, junior-dev
- [ ] F3: update `docs/features/command-popup-ui.md` — if the "User-facing behavior" table has a row "`Enter` on Refine sentinel | Close the popup (no detail, no cast)" (per 017's E2 todo), change it to "`Enter` on Refine sentinel | Dispatch a Refine cast against the active note; `Notice` if no active note open". Add a row for "Cast/Mod+Enter inside Refine OptionsPanel | Dispatch a Refine cast (same as Enter on row); fully closes the modal afterward". Update the state-diagram code block if present: the Refine sentinel transition now reads `Enter on Refine sentinel → refineCastAction()`. — S, junior-dev
- [ ] F4: update `docs/features/cast-log-foundation.md` — if it enumerates cast-log sentinels (search for `FORGE_SPELL_PATH` or `<forge>`), add `<refine>` to the same list with a one-line description ("Sentinel for casts originating from the Refine sentinel"). If the file does not enumerate sentinels, skip this todo — mark done with a one-line commit message noting the verification. — S, junior-dev

## Overall effort summary

- **Total todos:** 25
  - A: 6 (5S, 1M)
  - B: 3 (1S, 2M)
  - C: 5 (2S, 3M)
  - D: 7 (7S)
  - E: 2 (1M, 1S)
  - F: 4 (1M, 3S)

- **By size:** S × 19, M × 6, L × 0
- **By tier:** junior-dev × 22, senior-dev × 2, ui-integration-tester × 1, lead-dev × 0

**Why this tier distribution:**
- Most todos describe an already-decided change (file, location, signature, test contract) — junior-dev territory.
- Two senior-dev todos: **B2** (modifying `CastDispatcher.dispatch` — a hot, integration-critical method that affects every cast path; the change is small but the judgment call about `systemPromptFile` and `spellPath` mutual exclusivity carries risk if mis-implemented), and **C5** (the `CommandPopupBuilder.refineCastAction` closure — coordinates the active-note guard, dispatch input construction, and popup dismissal; one of the few non-trivial composition points).
- One **ui-integration-tester** todo (**E1**) writing the failing red integration test for the whole pipeline at the popup + builder + dispatcher seam. This is the section's Red criterion owner.
- No lead-dev: the design questions are closed in this plan, no concurrency/perf, no unknown root cause.

## Dispatch

Section order: A → B → C → D → E → F.

Within Section C, dispatch order is **junior-dev (C1–C4)** → **senior-dev (C5)**: junior lands the type, helper, and harness extension; senior lands the builder closure that consumes them.

Section E groups: **ui-integration-tester (E1)** first owns the section Red criterion → **junior-dev (E2)** lands the mock extension if needed (note: E2 may need to land *before* E1 if the mock is required to make E1 testable — the executor will read `tests/__mocks__/obsidian.ts` first and decide order; either way, both must be green before F).

All other sections are single-tier.

## Risks

1. **The `brain/Grimoire - Refine Note Spell` note may not exist or may be sparse.** Mitigation: A1's executor first attempts to fetch the note; if it's missing or insufficient, the executor falls back to authoring a body from the pitch's Solution section (which is itself prescriptive enough — `@cast` lines, follow-up, no-instruction-exit, active-note target). Document the fallback in the file's JSDoc.

2. **`tests/integration/refine-options-panel.spec.ts` D5-2 and D5-4 are rewritten in scope.** The rewritten assertions in D5/D6 must remain compatible with the existing test's overall structure (harness setup, navigation). Risk: the harness's `refineCastAction: vi.fn()` does not call `popup.dismiss()`, so the "modal closed" assertion only holds when the test explicitly wires the mock to call dismiss. **Mitigation:** D5 todo explicitly addresses this dual-assertion approach.

3. **The Refine prompt's no-instruction-exit behavior is a prompt property, not testable in plugin tests.** Mitigation: substring assertion in A4 verifies the prompt contains the no-instruction-exit instruction; end-to-end verification requires running Claude Code against a note (out of scope). Document in F1.

4. **Remote-mode Refine sends an inline `userPrompt` ~30 lines long over the wire on every cast.** Acknowledged trade-off; documented future migration in Technical notes. Not a blocker.

5. **`executeOnNote: true` override silently ignores the OptionsPanel checkbox toggle for Refine.** UX risk: a user who toggles the checkbox off and clicks Cast expects executeOnNote=false to apply, but the dispatch input forces true. Documented as Open question §2; defer the checkbox-hiding fix to a future iteration.

6. **`SpellEvents.dismiss-refine` rename is breaking inside the plugin.** Two emit sites, two listen sites, plus tests. Mitigation: D2 + D3 + D4 + D5 + D6 land in one section; D7 grep-asserts no straggler.

7. **The `refineCastSpell().path = '<refine>'` is a synthetic that the `RemoteCaster` would pass to the portal as `spellPath`** if not omitted by the dispatcher. Mitigation: B2 explicitly sets `spellPath: undefined` on the `CastInput` when `systemPromptInline` is set — verified in B3 unit test case (b).

## Open questions (carried forward for the dev agent / orchestrator)

1. **Should the `executeOnNote` checkbox in the Refine OptionsPanel be hidden in this iteration?** Plan defers it; the checkbox stays visible but its toggle is ignored. If user feedback strongly objects, hiding it is a follow-up iteration.

2. **Should remote-mode Refine cast be supported at all in this iteration?** Plan supports it via inline `userPrompt` (`systemPromptInline` → caster receives `spellPath: undefined`). If the portal's contract requires a non-null `spellPath` (verify against `grimoire-portal/src/cast/...`), remote-mode Refine would 400. **Verification step in B3:** the dispatcher's behavior with `systemPromptInline` set sets `spellPath: undefined` on the `CastInput`; the portal must accept the optional field. Spot-checked against the current code (`src/execution/Caster.ts:6` says `spellPath` is optional for inline casts; this is the same shape forge had pre-018). **Resolution: supported.** If the portal regresses on optional-spellPath, that's a separate iteration's concern.

3. **Should the Refine cast-log row have a click-to-open-active-note affordance?** Currently `CastLogRow` has a navigation affordance for live spells (line 196 early-return). Forge entries skip it. Refine entries will also skip it (A6 todo). Future iteration may add "click Refine row → open the note Refine modified" — out of scope here.

reviewed @ planning
