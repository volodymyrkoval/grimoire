# 006 — Spell `executeOnNote` toggle

> Make the active-note prompt clause optional per spell, so spells that produce new files (or otherwise operate without a host note) can be cast without an active editor.

## Goal & scope

Today every cast hard-bails when no note is open and unconditionally prepends `Execute this spell against the note at \`<vaultMountPath>/<activeFilePath>\`.` to the user prompt. This blocks "global" spells (e.g. *create-new-note* or *scaffold-folder*) that don't need a host note.

Add a per-spell boolean `executeOnNote` that:

1. **At forge time** — user picks via a toggle in the Forge sentinel form. The forged meta-spell instructs the LLM to write `grimoire-execute-on-note: <bool>` into the new spell's YAML frontmatter, alongside the existing `tags`.
2. **At scan time** — `spellScanner.getSpells()` reads the frontmatter key and exposes it on the `Spell` object. Missing key defaults to `true` (preserves existing behavior for spells forged before this iteration).
3. **At cast time (Options panel)** — toggle is shown, initial state mirrors the spell's stored value, user can override per cast (override is session-scoped, not persisted to override store).
4. **At dispatch time** — `CastDispatcher.dispatch()`:
   - When `executeOnNote === true` and `activeFilePath === null` → notify and bail (current behavior).
   - When `executeOnNote === true` and `activeFilePath !== null` → prepend the existing sentence (current behavior).
   - When `executeOnNote === false` → never bail, never prepend the sentence. Context notes + follow-up still apply unchanged.

### In scope

- `Spell` domain type extension and frontmatter scanning.
- `buildMetaSpell` extension to instruct the LLM to write the new frontmatter key.
- `ForgeFormSnapshot` + `ForgeSentinelDetail` UI toggle.
- `OptionsFormSnapshot` + `OptionsFormState` + `OptionsPanel` UI toggle.
- `CastDispatcher` conditional prompt and conditional bail.
- `main.ts` wiring (popup → dispatcher payload now carries `executeOnNote`).
- Unit tests for dispatcher branching, scanner frontmatter parsing, meta-spell content.
- UI integration tests for both Forge and SpellOptions toggles.

### Out of scope

- Persisting the user's per-cast override into `SpellOverrideStore` (the store is reserved for model+effort; the toggle is session-only).
- Editing the `executeOnNote` flag on an existing spell from outside the spell's own frontmatter (users edit the markdown file directly — the source of truth is the spell file itself).
- Refining/regenerating spells (no Refine flow exists yet — this is a Forge-only authoring change).
- Migration of existing spell files to add the frontmatter key (default-on-missing handles the read side; users may add it manually if they want to opt out).

## Proposed solution

The flag flows through four layers, each with one well-defined responsibility:

```
Forge UI                                   Spell file (vault)
┌─────────────────────────┐                ┌────────────────────────────┐
│ ForgeSentinelDetail     │                │ ---                        │
│  • toggle (default true)│ ─ buildMetaSpell ─▶  tags: [grimoire/spell] │
│  • ForgeFormSnapshot.   │   instructs      │  grimoire-execute-on-    │
│    executeOnNote        │   LLM to write   │    note: true|false      │
└─────────────────────────┘                  │ ---                        │
                                             └─────────────┬──────────────┘
                                                           │ scan
                                                           ▼
                                             ┌────────────────────────────┐
                                             │ spellScanner.getSpells     │
                                             │  reads frontmatter,        │
                                             │  defaults missing → true   │
                                             └─────────────┬──────────────┘
                                                           │ Spell.executeOnNote
                                                           ▼
Options panel                                CastDispatcher
┌─────────────────────────┐                  ┌────────────────────────────┐
│ OptionsPanel            │                  │ if (eon && active===null)  │
│  • checkbox seeded from │ ─ snapshot.eon ─▶│   bail                     │
│    spell.executeOnNote  │                  │ if (eon)                   │
│  • per-cast override    │                  │   prepend "Execute…"       │
│    (session only)       │                  │ else: skip prepend, allow  │
└─────────────────────────┘                  │   null active              │
                                             └────────────────────────────┘
```

Single source of truth for **what the spell does** = the spell's frontmatter. The Options panel surfaces it as the initial state of a per-cast toggle. The dispatcher receives the *effective* flag as part of its input, so it never reaches back into the spell or settings to re-resolve.

## Components

| Component | Location | Responsibility |
|---|---|---|
| `Spell` (extended) | `src/domain/spells/Spell.ts` | Carries `executeOnNote: boolean` (immutable, from frontmatter). |
| `EXECUTE_ON_NOTE_KEY` constant | `src/domain/spells/Spell.ts` | Single name `'grimoire-execute-on-note'` reused by scanner and meta-spell builder. |
| `spellScanner.getSpells` (extended) | `src/domain/spells/spellScanner.ts` | Reads `frontmatter[EXECUTE_ON_NOTE_KEY]`; defaults missing/non-boolean → `true`. |
| `ForgeFormSnapshot` (extended) | `src/forge/ForgeFormSnapshot.ts` | Adds `executeOnNote: boolean`. |
| `buildMetaSpell` (extended) | `src/forge/buildMetaSpell.ts` | Adds `executeOnNote` to inputs and to the frontmatter instruction emitted in the meta-spell text. |
| `ForgeSentinelDetail` (extended) | `src/ui/components/ForgeSentinelDetail.ts` | Renders a toggle (default checked); includes value in submitted snapshot. |
| `OptionsFormSnapshot` + `OptionsFormState` (extended) | `src/ui/options/OptionsFormState.ts` | Adds `executeOnNote: boolean` field, `setExecuteOnNote(bool)` setter, initial via constructor. |
| `OptionsPanel` (extended) | `src/ui/options/OptionsPanel.ts` | Renders a "Execute on active note" checkbox seeded from formState; mutates state on change; passes through Cast snapshot. |
| `SpellOptionsDetail` (extended) | `src/ui/components/SpellOptionsDetail.ts` | Seeds form state with `spell.executeOnNote`. |
| `CastDispatchInput` + `CastDispatcher.dispatch` (extended) | `src/cast/CastDispatcher.ts` | Adds `executeOnNote: boolean` field; conditional bail and conditional prompt prefix. |
| `main.ts` (wiring) | `src/main.ts` | Threads `executeOnNote` from `Spell` (for direct cast) and from `OptionsFormSnapshot` (for options cast) into the dispatcher payload. |

## Interfaces

```ts
// src/domain/spells/Spell.ts
export const EXECUTE_ON_NOTE_KEY = 'grimoire-execute-on-note';

export interface Spell {
  readonly name: string;
  readonly path: SpellPath;
  readonly executeOnNote: boolean;  // NEW — defaults to true when frontmatter key missing
}
```

```ts
// src/forge/ForgeFormSnapshot.ts
export interface ForgeFormSnapshot {
  description: string;
  name: string;
  model: string;
  effort: Effort | null;
  executeOnNote: boolean;  // NEW
}
```

```ts
// src/forge/buildMetaSpell.ts
export interface MetaSpellInput {
  // ...existing fields...
  executeOnNote: boolean;  // NEW
}
// Output: frontmatter instruction now reads:
//   "Set the file's YAML frontmatter `tags` field to `[<spellTag>]`
//    and add `<EXECUTE_ON_NOTE_KEY>: <true|false>`."
```

```ts
// src/ui/options/OptionsFormState.ts
export interface OptionsFormSnapshot {
  model: string;
  effort: Effort | null;
  contextNotePaths: readonly string[];
  followUp: string;
  executeOnNote: boolean;  // NEW
}
// OptionsFormState gains setExecuteOnNote(value: boolean): void
```

```ts
// src/cast/CastDispatcher.ts
export interface CastDispatchInput {
  // ...existing fields...
  executeOnNote: boolean;  // NEW
}
// dispatch():
//   if (input.executeOnNote && activeFilePath === null) { notify+close; return; }
//   const userPrompt = buildUserPrompt(executeOnNote, vaultMountPath, activeFilePath, ctx, followUp)
//     // when executeOnNote=false: omit the "Execute this spell against the note at …" sentence;
//     // context notes + follow-up unchanged
```

## Data flow

1. **Forge:** user toggles checkbox → `ForgeFormSnapshot.executeOnNote` is set on submit → `ForgeImprinter.imprint` passes through to `buildMetaSpell` → meta-spell text instructs the LLM to write `grimoire-execute-on-note: <bool>` into the new spell's frontmatter.
2. **Scan:** `getSpells()` reads each markdown file's frontmatter; for each file, looks up `frontmatter[EXECUTE_ON_NOTE_KEY]`; if `=== true` or `=== false` use it, otherwise default to `true`. Returns enriched `Spell` objects.
3. **Direct cast (Enter on spell row):** `main.ts` `castAction` builds `CastDispatchInput` with `executeOnNote: spell.executeOnNote`.
4. **Options cast:** `SpellOptionsDetail` seeds `OptionsFormState` with `executeOnNote: spell.executeOnNote`. `OptionsPanel` renders a checkbox bound to formState. On Cast, `OptionsFormSnapshot.executeOnNote` flows into `optionsCastAction` → `CastDispatchInput.executeOnNote`.
5. **Dispatch:** branch on `executeOnNote` for both the null-active-file guard and the prompt prefix.

## Error handling

- **Missing/invalid frontmatter key:** scanner treats anything other than the literal booleans `true`/`false` (after Obsidian's YAML parsing) as missing → defaults to `true`. No warning, no console noise — this is the documented "missing means note-bound" path.
- **Spell file modified mid-session:** Obsidian's metadata cache is the source. We don't subscribe to cache events for this iteration; the popup re-scans on open via `getSpells`. A spell whose flag changed while the popup is open will read stale until next reopen — acceptable for v1.
- **Options panel seed vs. spell change:** `SpellOptionsDetail` reads `spell.executeOnNote` once at construction. If the underlying spell file changes while the detail is open, the checkbox reflects the value at panel-open time — the existing model/effort fields have the same property, so this is consistent with the rest of the panel.
- **`buildMetaSpell` LLM compliance:** the meta-spell *instructs* the LLM to write the frontmatter key; we cannot guarantee compliance. If the LLM omits the key, the scanner defaults to `true` — the resulting spell will behave as a note-bound spell. The user can edit the file to fix it. We do not add post-forge validation in this iteration.

## Technical notes

- **Default-on-missing = `true`** is intentional. Every spell in the vault before this iteration was implicitly note-bound; flipping the default to `false` would silently change cast prompts for existing spells. The `true` default is the backward-compatible choice and matches the typical case (most spells operate on a note).
- **Per-cast override is session-only, not persisted.** The user's `OptionsFormState` toggle is the *intended cast value* for this invocation. We do not extend `SpellOverrideStore` because the override store is currently a model+effort store; broadening its schema is out of scope. If the user wants the spell to permanently change behavior, they edit the spell's frontmatter — single source of truth.
- **Strategy pattern considered for prompt building — rejected.** Variation is one sentence on/off; two strategy classes would be overengineering. A single inline conditional in `#buildUserPrompt` is the right shape (YAGNI).
- **Builder pattern considered for `CastDispatchInput` — rejected.** It's already a parameter object with fewer than ten fields; callers in `main.ts` are explicit and short. No builder needed.
- **Domain layer cannot import from UI** — `Spell` lives in `src/domain/spells/`, the constant `EXECUTE_ON_NOTE_KEY` lives there too, the meta-spell builder (in `src/forge/`) imports the constant from the domain. Dependency direction matches the existing `dependency-cruiser` rules.
- **Frontmatter key naming** — `grimoire-execute-on-note` (kebab-case, plugin-prefixed) avoids collisions with user frontmatter and matches Obsidian community convention. Defined as a single exported constant so a rename is a one-line change.
- **`SpellOverride` schema unchanged** — only `model`+`effort` continue to be persisted there; the new flag never enters that path.
- **Scanner edge:** Obsidian's metadata cache returns `frontmatter` as a plain object; YAML `true`/`false` come through as JS booleans. `frontmatter[EXECUTE_ON_NOTE_KEY] === true` is the positive check; we coerce non-boolean values to the default rather than to `Boolean(...)` because `'false'` (string) would otherwise become `true`.

## Todos

### A. Domain: extend `Spell` and scanner

#### Section briefing

1. **What this section produces** — modifies `src/domain/spells/Spell.ts` to add the `executeOnNote: boolean` field on the `Spell` interface and to export `EXECUTE_ON_NOTE_KEY = 'grimoire-execute-on-note'`. Modifies `src/domain/spells/spellScanner.ts` so `getSpells` reads `frontmatter[EXECUTE_ON_NOTE_KEY]` and falls back to `true` when missing or not strictly `true`/`false`. See Interfaces section for exact shape.
2. **Design context the executor needs upfront** — from Technical notes: "Default-on-missing = `true` is intentional. Every spell in the vault before this iteration was implicitly note-bound." From Error handling: "Scanner treats anything other than the literal booleans true/false as missing → defaults to true. No warning, no console noise." From Technical notes: "we coerce non-boolean values to the default rather than to `Boolean(...)` because `'false'` (string) would otherwise become `true`."
3. **Cross-section couplings** —
   - A1 is a prerequisite for B1 (`CastDispatchInput.executeOnNote` is the same boolean as `Spell.executeOnNote`), C2 (meta-spell uses `EXECUTE_ON_NOTE_KEY`), D1 (`OptionsFormSnapshot.executeOnNote`), and E1 (main.ts threads `spell.executeOnNote`).
   - A2 is the producer of the value that B1 consumes; their boolean semantics must agree (`true` = note-bound).
4. **Section-level Red criterion** — unit tests in `tests/spellScanner.test.ts` (new) prove that: (a) a spell file with `grimoire-execute-on-note: true` in frontmatter yields `Spell.executeOnNote === true`; (b) `false` yields `false`; (c) missing key yields `true`; (d) a string `'false'` yields `true` (coercion guard). The `EXECUTE_ON_NOTE_KEY` constant is importable from `src/domain/spells/Spell.ts`.

**junior-dev**

- [x] A1: Add `executeOnNote: boolean` to the `Spell` interface in `src/domain/spells/Spell.ts`. Export `export const EXECUTE_ON_NOTE_KEY = 'grimoire-execute-on-note';` from the same file. Update no other code yet — this todo is type-only and will break downstream call sites that construct `Spell` literals; that's expected and fixed in subsequent todos. — S, junior-dev
- [x] A2: Extend `getSpells` in `src/domain/spells/spellScanner.ts` to read `frontmatter[EXECUTE_ON_NOTE_KEY]` from the metadata cache. Read rule: if value is strictly `=== true` use `true`; if strictly `=== false` use `false`; for any other value (including `undefined`, strings, numbers) use `true`. Include the resolved boolean in each returned `Spell`. Add a new `tests/spellScanner.test.ts` with cases: (i) frontmatter has `grimoire-execute-on-note: true` → spell.executeOnNote === true; (ii) `: false` → false; (iii) key absent → true; (iv) value is the string `'false'` → true (coercion guard); (v) value is `0` → true. Mock the obsidian `App` the same way existing scanner-adjacent tests do. — M, junior-dev (9bb7593)

### B. Cast dispatcher: conditional bail and conditional prompt

#### Section briefing

1. **What this section produces** — modifies `src/cast/CastDispatcher.ts` to add `executeOnNote: boolean` to `CastDispatchInput` and to make both the null-active-file guard and the "Execute this spell against the note at …" prompt prefix conditional on that flag. Updates `tests/CastDispatcher.test.ts` to cover both branches. See Interfaces section for the new field; see Data flow step 5 for the branching rules.
2. **Design context the executor needs upfront** — from Goal & scope: "When `executeOnNote === true` and `activeFilePath === null` → notify and bail. When `executeOnNote === false` → never bail, never prepend the sentence. Context notes + follow-up still apply unchanged." From Technical notes: "Strategy pattern considered for prompt building — rejected. Variation is one sentence on/off; a single inline conditional in `#buildUserPrompt` is the right shape." Existing tests in `tests/CastDispatcher.test.ts` currently pass `Spell` literals via `as Spell` casts; those casts can stay (executeOnNote is set on the dispatch input, not read from the spell inside the dispatcher).
3. **Cross-section couplings** —
   - B1 depends on A1: `CastDispatchInput.executeOnNote` has the same boolean semantics as `Spell.executeOnNote` (`true` = note-bound).
   - B1 is consumed by E1 and E2: `main.ts` callers must thread the new field into the dispatch input or B1 will break the build.
4. **Section-level Red criterion** — `tests/CastDispatcher.test.ts` covers four behavioral pairs: (i) `executeOnNote: true` + `activeFilePath: null` → notify "Open a note to cast against", close, runner not invoked (existing behavior preserved); (ii) `executeOnNote: false` + `activeFilePath: null` → runner invoked, `userPrompt` does NOT contain "Execute this spell against the note at"; (iii) `executeOnNote: false` + `activeFilePath: 'notes/x.md'` → runner invoked, `userPrompt` does NOT contain the "Execute this spell against the note at" sentence (the flag wins over presence of an active file); (iv) `executeOnNote: true` + `activeFilePath: 'notes/x.md'` → existing prompt-prefix behavior unchanged. Context notes and follow-up sentences are present in (ii)/(iii) when supplied.

**senior-dev**

- [x] B1: Add `executeOnNote: boolean` to `CastDispatchInput`. In `dispatch()`: gate the `activeFilePath === null` bail on `input.executeOnNote === true`. Refactor `#buildUserPrompt` to accept the flag and to omit the leading "Execute this spell against the note at …" sentence when `executeOnNote === false`; context-notes and follow-up clauses are unchanged. When `executeOnNote === false` and there are no context notes and no follow-up, the prompt is the empty string — that is acceptable and the runner should still be invoked (the system prompt file carries the spell body). Update `tests/CastDispatcher.test.ts` with the four behavioral cases enumerated in the Red criterion above. Existing seven test cases must stay green by adding `executeOnNote: true` to their input literals (they all assert the existing note-bound behavior). — M, senior-dev (77657a8)

### C. Forge meta-spell: emit frontmatter instruction

#### Section briefing

1. **What this section produces** — modifies `src/forge/ForgeFormSnapshot.ts` to add `executeOnNote: boolean`, `src/forge/buildMetaSpell.ts` to accept the new field on `MetaSpellInput` and to extend the frontmatter instruction at step 3 of the meta-spell body, and `src/forge/ForgeImprinter.ts` to thread the new field into `buildMetaSpell`. See Interfaces section for the exact `MetaSpellInput` and `ForgeFormSnapshot` shapes. See `src/forge/buildMetaSpell.ts` line 52 for the existing frontmatter instruction.
2. **Design context the executor needs upfront** — from Technical notes: "Frontmatter key naming — `grimoire-execute-on-note` (kebab-case, plugin-prefixed) avoids collisions with user frontmatter… Defined as a single exported constant so a rename is a one-line change." From Error handling: "buildMetaSpell instructs the LLM to write the frontmatter key; we cannot guarantee compliance. If the LLM omits the key, the scanner defaults to true." The constant `EXECUTE_ON_NOTE_KEY` from Section A must be imported — do not hard-code the string `'grimoire-execute-on-note'` in `buildMetaSpell.ts`.
3. **Cross-section couplings** —
   - C2 depends on A1: imports `EXECUTE_ON_NOTE_KEY` from `src/domain/spells/Spell.ts` rather than hard-coding the literal.
   - C3 depends on D1 indirectly: forge UI submits `ForgeFormSnapshot` with the new field; the imprinter is the consumer that bridges UI → meta-spell.
4. **Section-level Red criterion** — `tests/buildMetaSpell.test.ts` covers: (i) `executeOnNote: true` input → output text contains a literal occurrence of `` `grimoire-execute-on-note: true` `` (or equivalent unambiguous instruction substring); (ii) `executeOnNote: false` → output contains the same instruction with `false`; (iii) the existing tags-instruction line still appears (no regression). `tests/ForgeImprinter.test.ts` covers: imprint passes the snapshot's `executeOnNote` through to `buildMetaSpell`'s input.

**junior-dev**

- [x] C1: Add `executeOnNote: boolean` to `ForgeFormSnapshot` in `src/forge/ForgeFormSnapshot.ts`. — S, junior-dev
- [x] C2: Add `executeOnNote: boolean` to `MetaSpellInput` in `src/forge/buildMetaSpell.ts`. Import `EXECUTE_ON_NOTE_KEY` from `../domain/spells/Spell`. Extend the frontmatter instruction at step 3 of the returned text so it tells the LLM to set both `tags: [${spellTag}]` AND `${EXECUTE_ON_NOTE_KEY}: ${executeOnNote}`. Keep the rest of the meta-spell body unchanged. Update `tests/buildMetaSpell.test.ts` with the three cases listed in the Red criterion above. — M, junior-dev
- [x] C3: Update `ForgeImprinter.imprint`'s `getMetaSpell` private method in `src/forge/ForgeImprinter.ts` to pass `executeOnNote: snapshot.executeOnNote` into `buildMetaSpell`. Update `tests/ForgeImprinter.test.ts` with one new case asserting that `buildMetaSpell` is called (or its output contains evidence of) the snapshot's `executeOnNote` value. — S, junior-dev

### D. Options panel: per-cast toggle (UI integration first)

#### Section briefing

1. **What this section produces** — modifies `src/ui/options/OptionsFormState.ts` to add `executeOnNote: boolean` to `OptionsFormSnapshot` and to add a `setExecuteOnNote(value: boolean): void` method that emits via the existing `#emit` channel. Modifies `src/ui/options/OptionsPanel.ts` to render a labelled checkbox bound to that state. Modifies `src/ui/components/SpellOptionsDetail.ts` to seed the form state's `executeOnNote` from `spell.executeOnNote`. Modifies `src/ui/options/OptionsSessionMap.ts`'s `OptionsSessionEntry` to round-trip the field across re-opens. See Interfaces section for the exact snapshot shape.
2. **Design context the executor needs upfront** — from Technical notes: "Per-cast override is session-only, not persisted. The user's `OptionsFormState` toggle is the intended cast value for this invocation. We do not extend `SpellOverrideStore`." From Data flow step 4: "`SpellOptionsDetail` seeds `OptionsFormState` with `executeOnNote: spell.executeOnNote`." The new checkbox is independent of the existing "Set as default" checkbox — it has its own label, its own state, and is **always visible** (not hidden behind `snapshotEqualsCurrent`). Place it in form-DOM order between the follow-up textarea and the "Set as default" label so it reads as a cast-time switch, not a persistence switch.
3. **Cross-section couplings** —
   - D0 (integration test) defines the Red criterion the senior-dev work in D2/D3/D4 must satisfy.
   - D1 depends on A1: `Spell.executeOnNote` is the seed source.
   - D5 depends on E2: the dispatched cast snapshot's `executeOnNote` must round-trip into `CastDispatchInput.executeOnNote`. (Wired in section E.)
   - The Reset button in `OptionsPanel.#buildResetButton` must reset `executeOnNote` back to the snapshot/spell value, mirroring how it resets model/effort/contextNotePaths/followUp. The integration test asserts this.
4. **Section-level Red criterion** — `tests/integration/options-panel.spec.ts` (extended) proves: (i) the panel renders a checkbox with a visible label "Execute on active note" inside `form.options-panel`; (ii) when the panel is mounted with `executeOnNote: false` in initial form state the checkbox starts unchecked; with `true` it starts checked; (iii) clicking the checkbox flips `formState.snapshot().executeOnNote` and the next Cast emits an `OptionsFormSnapshot` carrying the new value; (iv) Reset restores the checkbox to the snapshot's seeded value. The existing A1 test ("renders all expected controls") is updated to assert the new checkbox's presence by a stable selector (e.g. `input[type="checkbox"][data-grimoire="execute-on-note"]`).

**ui-integration-tester**

- [x] D0: Integration test in `tests/integration/options-panel.spec.ts` covering the four Red-criterion behaviors above. Use the existing `mountPanel` harness; extend it to accept an optional `executeOnNote` for both `formState` initial and `snapshot` (passed through `OptionsFormState` constructor). Use a stable DOM hook for the new checkbox — recommend `data-grimoire="execute-on-note"` on the input element so the test selector is stable across DOM-order refactors. Do NOT modify production code in this todo. — S, ui-integration-tester

**junior-dev**

- [x] D1: Add `executeOnNote: boolean` to `OptionsFormSnapshot` in `src/ui/options/OptionsFormState.ts`. Add `setExecuteOnNote(value: boolean): void` that updates the field and calls `this.#emit()`. Initial value is read from the constructor's `initial.executeOnNote`. Update `snapshot()` to include the field. Update `tests/OptionsFormState.test.ts` with cases for: initial seed, `setExecuteOnNote(true|false)` mutation + listener notification, snapshot round-trip. — S, junior-dev
- [x] D2: Add `executeOnNote: boolean` to `OptionsSessionEntry` in `src/ui/options/OptionsSessionMap.ts` so per-spell session storage round-trips the field. No method changes — the `put`/`get` flow already accepts the entry shape. Update `tests/OptionsSessionMap.test.ts` if it asserts the entry shape exhaustively. — S, junior-dev
- [x] D3: Update `src/ui/components/SpellOptionsDetail.ts` `#buildFormState` to seed `executeOnNote` from `params.spell.executeOnNote`, with session entry value taking precedence when present (mirrors the existing `contextNotePaths`/`followUp` pattern). — S, junior-dev (327809c)

**senior-dev**

- [x] D4: In `src/ui/options/OptionsPanel.ts` `#buildFormControls`, add a labelled checkbox for `executeOnNote`. Place it in DOM order between the follow-up `textarea` and the "Set as default" label. Tag the input with `data-grimoire="execute-on-note"` for test stability. Bind: initial `checked` from `formState.snapshot().executeOnNote`; `change` event calls `formState.setExecuteOnNote(checkbox.checked)`. The label text is "Execute on active note". This checkbox is independent of the "Set as default" visibility logic — always visible. Extend `#buildResetButton` so Reset also calls `formState.setExecuteOnNote(snapshot-or-spell-default)` — reuse the same seed value the panel was constructed with (extend `OptionsSnapshot`'s contract OR pass the seed via the form-state initial value, your call; document the choice in a one-line code comment). Make D0 green. — M, senior-dev (8f8ab82)

### E. Forge UI: forge-time toggle (UI integration first)

#### Section briefing

1. **What this section produces** — modifies `src/ui/components/ForgeSentinelDetail.ts` to render an "Execute on active note" checkbox (default checked) and to include its value in the submitted `ForgeFormSnapshot`. Updates `tests/ForgeSentinelDetail.test.ts` and the integration spec for the new field. The downstream pipe (snapshot → imprinter → meta-spell) is already done by Section C; this section only owns the UI surface.
2. **Design context the executor needs upfront** — from Goal & scope step 1: "user picks via a toggle in the Forge sentinel form. The forged meta-spell instructs the LLM to write `grimoire-execute-on-note: <bool>`." The toggle's default is checked (i.e. `executeOnNote: true`) to match the scanner's missing-key default and to match the dominant case of note-bound spells. Place the checkbox in DOM order between the description textarea and the model select, OR between the model select and the effort row — pick one and keep `D1e`-style ordering invariants intact (the existing test `D1e` asserts that the effort row mounts before the Submit button when switching Haiku→Sonnet; the new checkbox must not break that invariant).
3. **Cross-section couplings** —
   - E0 (integration test) defines the Red criterion for E1.
   - E1 depends on C1: the new field on `ForgeFormSnapshot`. C1 must land before E1.
   - E1 is consumed by C3: the imprinter reads `snapshot.executeOnNote`.
4. **Section-level Red criterion** — `tests/integration/forge-sentinel-detail.spec.ts` (extended) proves: (i) the form renders a checkbox with a stable hook (recommend `data-grimoire="execute-on-note"`) inside `form.forge-sentinel-form`; (ii) the checkbox starts checked by default; (iii) submitting the form with the checkbox left at default emits an `onSubmit` payload containing `executeOnNote: true`; (iv) unchecking the checkbox and submitting emits `executeOnNote: false`; (v) the existing `D1e` ordering test (effort row before Submit when switching Haiku→Sonnet) still passes — the new checkbox must not be inserted between the effort row and the Submit button.

**ui-integration-tester**

- [x] E0: Integration test in `tests/integration/forge-sentinel-detail.spec.ts` covering the five Red-criterion behaviors above (re-running the existing `D1e` ordering case is acceptable as a regression guard, or extending it to assert the checkbox sits outside the effort-row → Submit sequence). Use a stable DOM hook for the checkbox. Do NOT modify production code in this todo. — S, ui-integration-tester

**senior-dev**

- [x] E1: In `src/ui/components/ForgeSentinelDetail.ts`, add a labelled checkbox (label text "Execute on active note", input tagged with `data-grimoire="execute-on-note"`) defaulting to `checked = true`. Track its state on a private field (mirroring `#currentEffort`). Include `executeOnNote: <field>` in the `onSubmit` payload in `#wireSubmitHandler`. Place the checkbox in DOM order such that `D1e`'s effort-row → Submit invariant is preserved (recommend: between description textarea and model select, OR right before the Submit button — your judgment, but document in a one-line code comment). Update `tests/ForgeSentinelDetail.test.ts` with one new unit case: submit emits `executeOnNote: true` when default, `false` when toggled. Make E0 green. — M, senior-dev (7d75550)

### F. Wire dispatcher input in `main.ts`

#### Section briefing

1. **What this section produces** — modifies `src/main.ts` `createCommandPopup` to thread `executeOnNote` into both dispatcher call sites (`castAction` for direct cast and `optionsCastAction` for options cast). See `src/main.ts` lines 76–84 (castAction) and 88–96 (optionsCastAction).
2. **Design context the executor needs upfront** — from Data flow steps 3 and 4: direct cast reads `spell.executeOnNote`; options cast reads `snap.executeOnNote` (the per-cast override from `OptionsFormSnapshot`).
3. **Cross-section couplings** —
   - F1 depends on A1, B1, and D1: it cannot compile until `Spell.executeOnNote`, `CastDispatchInput.executeOnNote`, and `OptionsFormSnapshot.executeOnNote` all exist.
   - F1 is the integration point that converts the standalone changes in A/B/C/D/E into an end-to-end working flow.
4. **Section-level Red criterion** — `tests/main.test.ts` (existing) continues to pass; `tests/integration/spell-cast.spec.ts` and `tests/integration/options-panel-popup.spec.ts` continue to pass after threading. Add one assertion per existing top-level integration spec verifying that the `CastDispatcher.dispatch` mock receives an input with `executeOnNote` set (value matters: direct = `true` for default-true spell; options = whatever the panel snapshot carried).

**junior-dev**

- [x] F1: In `src/main.ts` `createCommandPopup`, thread `executeOnNote: spell.executeOnNote` into the `castAction` `dispatcher.dispatch({...})` call, and thread `executeOnNote: snap.executeOnNote` into the `optionsCastAction` call. Update `tests/main.test.ts` (or whichever test pins the dispatch payload) and the integration specs in `tests/integration/spell-cast.spec.ts` and `tests/integration/options-panel-popup.spec.ts` to assert the field is present on the dispatched input. — S, junior-dev (085d07c)

### G. End-to-end integration coverage

#### Section briefing

1. **What this section produces** — one new integration test file or extension that exercises the full vertical: a forged spell with `executeOnNote: false` in its frontmatter, scanned by `getSpells`, surfaced in the popup, cast via the options panel, dispatched with no active file, prompt does not contain the "Execute this spell against the note at" sentence, runner invoked.
2. **Design context the executor needs upfront** — from Goal & scope step 4 (dispatch behavior matrix); from Data flow (full pipe). Reuse existing harness helpers in `tests/integration/harness.ts`.
3. **Cross-section couplings** — depends on every prior section. This is the section that proves the whole vertical works.
4. **Section-level Red criterion** — a new test in `tests/integration/spell-cast.spec.ts` (or a new `tests/integration/execute-on-note.spec.ts`) sets up: a mocked spell with `executeOnNote: false`, no active file, casts via direct-cast path. Asserts: dispatcher's runner is invoked (no early bail), and the captured `userPrompt` does NOT contain the "Execute this spell against the note at" sentence. A second case sets `executeOnNote: true` with no active file and asserts the bail (notify + close, runner not invoked).

**ui-integration-tester**

- [ ] G1: Integration test as described in the Red criterion above. Use `tests/integration/harness.ts` helpers; mock `getSpells` (or seed via the existing fixture) to return a spell with `executeOnNote: false`. Two cases: (a) `false` + no active file → runner invoked, prompt missing the active-note sentence; (b) `true` + no active file → notify + close, runner NOT invoked. — M, ui-integration-tester

## Edge cases (explicit checklist for each implementing dev agent)

- **Empty/null:** missing `grimoire-execute-on-note` frontmatter key → defaults to `true` (covered in A2 tests).
- **Type coercion:** YAML string `'false'`, number `0`, array — all default to `true` (covered in A2 tests).
- **Boundary:** `executeOnNote: false` + no context notes + no follow-up → empty user prompt; runner still invoked (covered in B1 test).
- **Order-of-operations:** Reset on options panel must reset `executeOnNote` along with the other fields (covered in D0 test).
- **DOM ordering:** new checkbox in Forge form must not break the existing `D1e` invariant (effort row before Submit); covered in E0.
- **Concurrency:** spell file edited while options panel open — out of scope for v1 (documented in Error handling).

## Effort summary

- **Total: 13 todos** across 7 sections.
- **By size:** S = 8, M = 5, L = 0.
- **By tier:** junior-dev = 7, senior-dev = 3, lead-dev = 0, ui-integration-tester = 3.
- **Dispatch order:** A → B → C → D (D0 first, then D1–D4) → E (E0 first, then E1) → F → G.
- Junior-dev dominates because the design questions (frontmatter key name, default value, prompt-omission shape, UI placement constraints) are all closed in Interfaces / Technical notes / Section briefings. Senior-dev only owns the UI seams in OptionsPanel and ForgeSentinelDetail (D4, E1) and the dispatcher branching with prompt regeneration (B1).

reviewed @ 7d75550
