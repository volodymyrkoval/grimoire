# Setting API Migration — popup form rows

Migrate the three popup-modal form components (`OptionsPanel`, `CastModelSection`,
`ForgeSentinelDetail`) from hand-rolled `createEl/createDiv` + custom CSS to Obsidian's
native `Setting` API, so every field renders as a theme-adaptive `.setting-item` row.

## Complexity

**Complex.** Single visual goal, but three interacting components, a shared sub-section
(`CastModelSection`) used by two callers, two custom widgets that do not map to a
standard control (context-notes pills, `HotkeyCaptureField`), and a **large, tightly
DOM-coupled test suite** (12+ spec files) that asserts exact class names, queryable
element types, `data-grimoire` attributes, and sibling ordering. The risk is entirely in
not breaking those tests while changing the DOM underneath them. No new behaviour.

## Goal & scope

**In scope**
- Replace field-by-field DOM construction in `OptionsPanel`, `CastModelSection`,
  `ForgeSentinelDetail` with `new Setting(container).setName(...).addX(...)`.
- Mount `EffortRow` into a `Setting.controlEl` (same pattern as `GrimoireSettingTab`).
- Remove CSS classes that become unused after the migration.

**Out of scope (explicit)**
- Any behaviour change: form-state wiring, events, keyboard bindings, snapshot shapes,
  override/session semantics, submit-enable rules — all unchanged.
- `GrimoireSettingTab` / `CustomRefineSection` — already on the Setting API.
- The context-notes pills widget internals and `HotkeyCaptureField` internals — they stay
  custom (see Decision D3).
- The multi-button action row (Cast/Reset/Forge, Imprint/Submit) — stays a custom
  `.grimoire-button-row` (see Decision D2).
- `RefineVariantSelect` — left as-is this iteration (it mounts label+select directly into
  the form). Noted as deferred so its `.grimoire-field-label` class is NOT removed.

## Proposed solution

For each text/textarea/dropdown/toggle field, replace the manual element + label + custom
class with a `Setting` row. Preserve the **observable contract** every test depends on:

- The `<form>` wrapper stays (`form.options-panel`, `form.forge-sentinel-form`) — `Setting`
  rows are appended *into* the form, exactly as raw fields are today.
- Every element a test queries by tag (`textarea`, `select`, `input[type="text"]`) stays
  reachable via `form.querySelector(...)` because `Setting` builds those same native
  elements inside `controlEl`, which lives inside the form.
- Every `data-grimoire` attribute (`execute-on-note`, `apply-cast-directives`,
  `set-as-default`, `spell-name`) is re-applied to the inner element of the new control
  (`toggleEl` / a static div) so existing selectors keep matching.

This is a **structure-preserving migration at the seam**: same form, same queryable
leaves, same data attributes — only the wrapping/labelling/CSS changes.

## Components

| Component | Responsibility | Location |
|---|---|---|
| `OptionsPanel` | Spell-cast options form: context-notes (custom), follow-up textarea, executeOnNote toggle, mounts `CastModelSection`, action button row | `src/ui/options/OptionsPanel.ts` |
| `CastModelSection` | Shared model dropdown + effort row + "Set as default" toggle with reactive visibility | `src/ui/options/CastModelSection.ts` |
| `ForgeSentinelDetail` | Forge create/update form: name (text or static), description textarea, executeOnNote/apply-directives toggle, model dropdown + effort row, hotkey field (custom), action row | `src/ui/components/ForgeSentinelDetail.ts` |
| `styles.css` | Plugin CSS — classes for the now-removed manual field layout | `styles.css` |

## Interfaces (unchanged — migration is internal)

No public method signature changes. `render(...)`, `mount(...)`, `destroy(...)`,
`resetToSnapshot(...)` keep their exact parameters. The change is confined to the private
`#build*` DOM-builder methods inside each class.

The contract that DOES matter is the **DOM contract** consumed by tests — treat this as the
load-bearing interface:

| Selector / assertion | Consumed by | Must survive |
|---|---|---|
| `form.options-panel` (class equals) | options-panel.spec, refine-options-panel.spec, spell-options-detail-*.spec | yes |
| `form.forge-sentinel-form` (`form.className === 'forge-sentinel-form'`, exact) | ForgeSentinelDetail.test, forge-sentinel-detail*.spec | yes — must remain the ONLY class |
| `form.querySelector('textarea' / 'select' / 'input[type="text"]')` | all form specs | yes |
| `input[type="checkbox"][data-grimoire="execute-on-note"]` | options-panel.spec B1-B4, ForgeSentinelDetail.test E0.*, forge-sentinel-detail.spec | yes |
| `input[data-grimoire="set-as-default"]` | options-panel.spec A5/A6, refine-options-panel.spec D5-5 | yes |
| `input[type="checkbox"][data-grimoire="apply-cast-directives"]` + `.closest('label').textContent` contains "(N directive(s) found)" | forge-sentinel-detail-update.spec A3* | yes — toggle's label text must carry the directive copy |
| `[data-grimoire="spell-name"]` (static name in update mode) | forge-sentinel-detail-update.spec A2a | yes |
| `label:has(input[type="checkbox"])` whose `.style.display` is `''`/`'none'` (the set-as-default visibility toggle) | options-panel.spec A1/A2/A3/A9, refine-options-panel.spec D5-6 | **conditionally — see Decision D5; this is the one assertion likely to need a rewrite** |
| effort-row container precedes `button[type="submit"]` among `form.children` | forge-sentinel-detail.spec D1e/E0.5 | **conditionally — see Decision D5** |
| `.grimoire-effort-row` present/absent by model | many | yes (EffortRow owns this class; unchanged) |
| `.grimoire-hotkey-field` wrapper between back button and form; chip/button/clear classes | forge-hotkey-capture.spec C2b etc. | yes (hotkey field stays custom — Decision D3) |
| `button[type="submit"]` text 'Cast'/'Imprint'/'Submit'; `button[type="button"]` text 'Reset' | options-panel.spec, forge specs | yes (button row stays custom — Decision D2) |
| `input.context-notes-search`, `.context-notes-pill` | options-panel.spec A1 | yes (pills stay custom — Decision D3) |

## Data flow (unchanged)

Field input → component's existing event binding → `formState.setX(...)` / local field →
snapshot on submit. The Setting API's `addToggle(t => t.onChange(...))` /
`addText(t => t.onChange(...))` callbacks replace the manual `addEventListener` calls, but
route into the **same** formState setters. For controls where a test fires a raw DOM event
(`checkbox.dispatchEvent(new Event('change'))`), the migration must keep a real
`change`/`input` listener on the inner element — see Decision D6.

## Error handling

No new error surfaces. The submit-enable rule in `ForgeSentinelDetail` update mode
(`#updateSubmitButtonState`) and the reactive "Set as default" visibility in
`CastModelSection` (`#updateReactive`) are behaviour and stay byte-for-byte identical;
only the elements they read/write move into Setting-built nodes.

## Technical notes

### Key design decisions

- **D1 — Structure-preserving migration (not a free rewrite).** Tests are the source of
  truth (project philosophy: "Docs are truth", strict TDD). The migration keeps the
  `<form>` wrapper and every queryable leaf + `data-grimoire` attribute. Rationale: the
  goal is *visual* theme compatibility, not a contract change; preserving the DOM contract
  keeps ~90% of the suite green and shrinks the blast radius to a handful of genuinely
  layout-dependent assertions.

- **D2 — Action button row stays custom.** Cast must be `type="submit"` to drive
  `form.onsubmit`; `Setting.addButton`'s `ButtonComponent` does not expose submit
  semantics, and the mock's `ButtonComponent` has no `setButtonText`-to-`type` path. The
  `.grimoire-button-row` div with raw `<button>`s is retained below the Setting rows.
  Considered: converting to `Setting.addButton` — **rejected**: would force manual
  `buttonEl.type = 'submit'` poking plus a mock extension, for a row that is visually fine
  and theme-neutral already (uses `mod-cta`).

- **D3 — Custom widgets stay standalone.** Context-notes pills (`ContextNotesInput`) and
  `HotkeyCaptureField` are bespoke state machines, not single-value controls. They remain
  standalone layout blocks. The hotkey field's `.grimoire-hotkey-field` wrapper and its
  back-button→wrapper→form ordering are pinned by tests and must not move. Considered:
  mounting them into a `Setting.controlEl` — **rejected**: no theme benefit (the inner
  widget DOM is what the theme can't style anyway) and it breaks the pinned ordering tests.

- **D4 — EffortRow into `Setting.controlEl`.** Mirrors the proven `GrimoireSettingTab`
  pattern (`new Setting(el).setName('Default effort'); effortRow.mount(setting.controlEl, …)`).
  `EffortRow` keeps creating its `.grimoire-effort-row` wrapper unchanged.

- **D5 — Two assertions are layout-dependent and get rewritten in their own Red step.**
  Under the Setting API the set-as-default control is a `ToggleComponent` built inside
  `controlEl`, not a hand-built `<label><input type=checkbox></label>`, so
  `label:has(input[type="checkbox"])` and the "hide the *label*" mechanism no longer have a
  natural target. **Decision:** make the *Setting row element* (`setting.settingEl`) the
  visibility target — store a reference to it and toggle `settingEl.style.display`, and
  update the affected tests to query the row by a stable hook
  (`[data-grimoire="set-as-default"]`'s `.closest('.setting-item')`, or a
  `data-grimoire="set-as-default-row"` attribute added to `settingEl`). Likewise the
  effort-row-before-submit ordering tests assume effort and submit are siblings under the
  form; with a Setting row wrapping the model/effort the nesting changes, so those two
  ordering specs (`D1e`, `E0.5`) are rewritten to assert the effort `.setting-item`
  precedes the button row instead of raw `form.children` index math. Every other test is
  preserved by D1. Rationale: these two are *physically* incompatible with `.setting-item`
  layout; rewriting them honestly (still red-first) is correct, whereas contorting the DOM
  to satisfy `label:has` would defeat the theme-compatibility goal.

- **D6 — Keep real DOM event listeners reachable.** Tests fire
  `el.dispatchEvent(new Event('change'|'input'))` directly on the inner element. The mock's
  `ToggleComponent.onChange` stores a JS callback but does NOT attach a DOM listener, and
  `TextComponent` likewise. So for any control a test drives via raw `dispatchEvent`, the
  builder must ALSO attach a native listener on the inner element (`toggleEl`, `inputEl`,
  textarea) — or the migrated code must read the element's live value on submit rather than
  rely solely on the Setting callback. Concretely: keep the existing
  `addEventListener('change'/'input', …)` on the inner element after building the control,
  rather than moving all wiring into the Setting `.onChange` lambda. This is the single
  highest-risk correctness item and is why the toggle/textarea todos are senior-dev.

- **D7 — `Setting` import.** `OptionsPanel.ts`, `CastModelSection.ts`,
  `ForgeSentinelDetail.ts` do not currently import `Setting`. Add
  `import { Setting } from 'obsidian'` to each migrated file.

### Design-patterns pass (Step 1 checklist, per component)

- **Builder** — already the de-facto pattern (`#build*` methods). The Setting API is itself
  a fluent builder; keep the existing private-method decomposition. No new pattern.
- **Strategy** — considered for the create-vs-update name field in `ForgeSentinelDetail`
  (text input vs static div). **Rejected: YAGNI** — a single `if (mode.kind === 'create')`
  branch already exists and is clear; two modes do not justify a strategy hierarchy.
- **Template Method** — considered for unifying the three components' "render form" shape.
  **Rejected**: they differ enough (forge has hotkey + submit-enable rule; options has
  pills + reset/cast) that a shared template would be a false abstraction. The shared piece
  is already extracted as `CastModelSection`.
- No other GoF pattern earns its place; this is a mechanical structural migration.

### Constraints

- ESLint `obsidianmd/no-manual-html-headings`: section headers ("Cast model settings",
  "Model settings") currently use `createSpan(..., 'grimoire-section-label')`. If converting
  a header to a heading, use `new Setting(el).setName('…').setHeading()` — never `createEl('h3')`.
  (For this migration the section labels may simply stay as spans or become a `.setHeading()`
  Setting; either is acceptable — see C-section briefing.)
- No Node.js native APIs (project rule) — not relevant here, pure DOM.
- Mock `Setting` (tests/__mocks__/obsidian.ts) already supports
  `setName/setDesc/setHeading/addText/addDropdown/addToggle/addButton` and exposes
  `settingEl`/`controlEl`. **It does not attach DOM listeners** (D6) — this is the gotcha.

## Perspective synthesis

- **Minimalist:** The smallest viable version migrates ONLY the plain single-value fields
  (follow-up, description, model dropdown, the toggles) and leaves pills, hotkey, and the
  button row exactly as-is. That is precisely the scope chosen — nothing extra.
- **Extensibility (10×):** If more spell-option fields are added later, they become one more
  `new Setting(...)` call — strictly additive, no seam to regret. The shared
  `CastModelSection` already absorbs the model/effort growth axis.
- **Devil's advocate:** The riskiest assumption is "the Setting mock behaves like real
  Obsidian." It does for element creation, but NOT for DOM events (D6) and NOT for
  `label:has` layout (D5). Both are surfaced as explicit todos with senior-dev tier. Second
  risk: a forgotten `data-grimoire` re-application silently nulls a selector and turns a
  whole spec red — mitigated by doing one component at a time, tests green between each.
- **User advocate:** End-user gain is real (rows inherit any theme). Developer-integration
  gain: future fields are one-liners. The rough edge is the two rewritten assertions; the
  plan rewrites them honestly rather than hiding the change.

---

## Todos

> Sections are ordered by dependency: shared `CastModelSection` first (both other
> components mount it), then `OptionsPanel`, then `ForgeSentinelDetail`. Each component
> section opens with a `ui-integration-tester` group that pins the post-migration DOM
> contract (the Red criterion), then a dev group that performs the migration to green.
> No scaffolding section is needed — no new files are created; all work edits existing files.

### A. CastModelSection → Setting rows

#### Section briefing

**What this section produces.** Edits `src/ui/options/CastModelSection.ts` only. Converts
the model `<select>`, the "Set as default" checkbox, and the section header to `Setting`
rows; mounts the existing `EffortRow` into a `Setting.controlEl`. Public surface
(`mount/resetToSnapshot/destroy` — see Interfaces, unchanged) is preserved. Adds
`import { Setting } from 'obsidian'` (Decision D7).

**Design context the executor needs upfront.** Decision D4 (verbatim): "Mirrors the proven
`GrimoireSettingTab` pattern (`new Setting(el).setName('Default effort');
effortRow.mount(setting.controlEl, …)`). `EffortRow` keeps creating its `.grimoire-effort-row`
wrapper unchanged." Decision D5 (verbatim, key constraint): "make the *Setting row element*
(`setting.settingEl`) the visibility target — store a reference to it and toggle
`settingEl.style.display`", and add a `data-grimoire="set-as-default-row"` attribute to that
`settingEl` so tests can find it. Decision D6 (verbatim, key constraint): "for any control a
test drives via raw `dispatchEvent`, the builder must ALSO attach a native listener on the
inner element (`toggleEl` …)". The set-as-default checkbox is driven by raw
`checkbox.dispatchEvent(new Event('change'))` in options-panel.spec A5/A6 and
refine-options-panel.spec D5-5 — so the built toggle's inner input MUST carry both
`data-grimoire="set-as-default"` and a real `change` listener.

**Cross-section couplings.**
- A3/A4 are depended on by B (OptionsPanel) and C (ForgeSentinelDetail): both mount
  `CastModelSection` (B) or replicate the model-row pattern (C). The `.grimoire-effort-row`
  class and the model `<select>` reachability via `form.querySelector('select')` established
  here are consumed by the model-select keyboard tests in B (A10/A11) and C (D1d) — A must
  not rename or re-nest the `<select>` out of `form.querySelector('select')` reach.
- A4 (set-as-default visibility via `settingEl`) is the change that forces the test rewrite
  in A0; B's options-panel.spec also queries this control, so A0 must update BOTH
  options-panel.spec and refine-options-panel.spec assertions that use
  `label:has(input[type="checkbox"])`.

**Section-level Red criterion.** With CastModelSection migrated and mounted in a bare
container: the model dropdown is reachable as a `<select>` under the container with one
`<option>` per `SUPPORTED_MODELS` entry; `[data-grimoire="set-as-default"]` resolves to a
checkbox `<input>` that fires `overrides.set/clear` when its `change` event is dispatched;
the set-as-default row is hidden (`display: none`) when `snapshotEqualsCurrent` is true and
shown when the model differs and snapshot effort is non-null; the effort `.grimoire-effort-row`
appears for effort-bearing models and is absent for Haiku. The integration suite
(`options-panel.spec`, `refine-options-panel.spec`) is green.

**ui-integration-tester**
- [ ] A0: Rewrite the set-as-default visibility assertions in `tests/integration/options-panel.spec.ts` (A1, A2, A3, A9) and `tests/integration/refine-options-panel.spec.ts` (D5-6) to locate the control row via `[data-grimoire="set-as-default"]`'s `.closest('.setting-item')` (or the `data-grimoire="set-as-default-row"` hook from A4) and assert its `.style.display`, replacing `label:has(input[type="checkbox"])`. Land these as failing-first against the un-migrated code (they should fail to find `.setting-item`), pinning the new contract — M, ui-integration-tester

**senior-dev**
- [ ] A1: In `#buildHeader`, replace the `createSpan(..., 'grimoire-section-label')` with a `Setting`-based section label/heading (`new Setting(container).setName('Cast model settings').setHeading()` or a plain Setting name row) — verify against `obsidianmd/no-manual-html-headings` — S, senior-dev
- [ ] A2: In `#buildModelSelect`, build the model row as `new Setting(container).setName('Model')` and mount the existing `buildModelSelect({ container: setting.controlEl, … })` into `controlEl`; ensure `setting.controlEl` (hence the `<select>`) remains reachable via `form.querySelector('select')`. Keep the existing `kb` arrow-key wiring intact — M, senior-dev (depends on A1 above)
- [ ] A3: In `#buildEffortContainer`, replace the raw `createDiv()` effort container with `new Setting(container).setName('Effort')` and `this.#effortRow.mount(setting.controlEl, …)` per Decision D4; keep lazy-mount/unmount behaviour and the `.grimoire-effort-row` class untouched — M, senior-dev (depends on A2 above)
- [ ] A4: In `#buildSetAsDefaultCheckbox`, build the row as `new Setting(container)` with `addToggle`; re-apply `dataset['grimoire'] = 'set-as-default'` to the toggle's inner input AND attach a real `change` listener on it (Decision D6); store `setting.settingEl` (tagged `data-grimoire="set-as-default-row"`) as the visibility target and update `#updateReactive` to toggle `settingEl.style.display` instead of `#checkboxLabel.style.display` (Decision D5) — M, senior-dev (depends on A4 wiring consumed by `#updateReactive`)
- [ ] A5: Edge cases — Haiku (no effort options): effort row absent, set-as-default row stays hidden even when model differs from a null-effort snapshot (the `effortPersistable` rule); model with effort: row present and visibility toggles. Confirm `resetToSnapshot` still sets `#select.value`. Verify against options-panel.spec A7 and the reactive-visibility specs — S, senior-dev

### B. OptionsPanel → Setting rows

#### Section briefing

**What this section produces.** Edits `src/ui/options/OptionsPanel.ts` only. Converts the
follow-up textarea and the executeOnNote checkbox to `Setting` rows; leaves context-notes
pills (custom), the action button row (custom), and the `CastModelSection.mount(...)` call
exactly as they are. Adds `import { Setting } from 'obsidian'`. The `<form class="options-panel">`
wrapper and the back-button/nav-bar stay.

**Design context the executor needs upfront.** Decision D1 (verbatim): "The `<form>` wrapper
stays … `Setting` rows are appended *into* the form, exactly as raw fields are today."
Decision D3 (verbatim): context-notes pills "remain standalone layout blocks." Decision D2
(verbatim): the action row "is retained below the Setting rows." Decision D6 (verbatim, key
constraint): "keep the existing `addEventListener('change'/'input', …)` on the inner element
rather than moving all wiring into the Setting `.onChange` lambda." The follow-up textarea is
driven by `textarea.dispatchEvent(new Event('input'))` (options-panel.spec A4/A8) and the
executeOnNote checkbox by `dispatchEvent(new Event('change'))` (B1-B4) — both inner elements
need real listeners and the textarea must stay reachable via `form.querySelector('textarea')`.

**Cross-section couplings.**
- B depends on A2/A3/A4: `OptionsPanel.#buildFormControls` calls
  `this.#castModelSection.mount(form, …)`; the model/effort/set-as-default rows in the
  rendered options panel come from Section A. B1 (this section) must not duplicate or move
  them.
- B0's executeOnNote assertions overlap the contract A0 touches in the same spec file
  (`options-panel.spec.ts`); coordinate so A0 and B0 edits to that file do not collide —
  A0 owns the set-as-default rows, B0 owns the executeOnNote/textarea rows.
- The executeOnNote `data-grimoire="execute-on-note"` attribute and its absence in refine
  mode (refine-options-panel.spec C6, OptionsPanel.test "showExecuteOnNote: false") are
  pinned — B1 must keep the `showExecuteOnNote` gate and the attribute.

**Section-level Red criterion.** With OptionsPanel migrated: `form.options-panel` exists and
contains a reachable `textarea` whose `input` event routes to `formState.setFollowUp`; an
`input[type="checkbox"][data-grimoire="execute-on-note"]` whose `change` event routes to
`formState.setExecuteOnNote` and is absent when `showExecuteOnNote === false`; the
context-notes search input (`input.context-notes-search`) and Cast(`type=submit`)/Reset
buttons remain; Cast/Reset/Cmd+Enter behaviour is unchanged. `options-panel.spec.ts` and
`OptionsPanel.test.ts` are green.

**ui-integration-tester**
- [ ] B0: Audit `tests/integration/options-panel.spec.ts` (A1, A4, A8, B1-B4) and `tests/OptionsPanel.test.ts` for any assertion that breaks once follow-up + executeOnNote become Setting rows; where the textarea/checkbox is still reachable via `form.querySelector` and `[data-grimoire="execute-on-note"]`, no change is needed — assert that and add a focused test pinning that the executeOnNote control's inner input fires `formState.setExecuteOnNote` on a raw `change` event (Decision D6). Land failing-first if it exposes a gap — S, ui-integration-tester

**senior-dev**
- [ ] B1: In `#buildFollowUpInput`/`#bindFollowUpInput`, build the follow-up as `new Setting(form).setName('Follow-up')` with `addTextArea` (or keep a textarea inside `controlEl`); keep the placeholder 'Follow-up', keep the value reachable via `form.querySelector('textarea')`, and keep a real `input` listener calling `formState.setFollowUp` (Decision D6). Cast/Reset still read/clear `followUpInput.value` — preserve that reference — M, senior-dev
- [ ] B2: In `#buildExecuteOnNoteCheckbox`/`#bindExecuteOnNote`, build the toggle as `new Setting(form).setName('Run on active note')` with `addToggle`; re-apply `dataset['grimoire'] = 'execute-on-note'` to the inner input, attach a real `change` listener calling `formState.setExecuteOnNote`, keep `checkbox.checked` settable for Reset (B4), and keep the whole row gated behind `eonState.visible` so it is absent when `showExecuteOnNote === false` — M, senior-dev
- [ ] B3: Leave the "Context notes" label + `ContextNotesInput` mount, the `.grimoire-button-row` (Cast/Reset/Forge/RefineVariant), `#bindFormSubmit`, `#bindCastKey`, and `#bindReset` unchanged; verify Reset still resets the migrated follow-up + executeOnNote controls (their stored element references must survive the migration) — S, junior-dev

### C. ForgeSentinelDetail → Setting rows

#### Section briefing

**What this section produces.** Edits `src/ui/components/ForgeSentinelDetail.ts` only.
Converts the name field (text input in create mode / static name display in update mode),
the description textarea, the executeOnNote and apply-cast-directives checkboxes, the model
dropdown and effort row to `Setting` rows. Leaves the back button, the `HotkeyCaptureField`
block (custom), the model-select keyboard wiring, the submit button row (custom), and the
`#updateSubmitButtonState` enable rule unchanged. Adds `import { Setting } from 'obsidian'`.

**Design context the executor needs upfront.** Decision D1 (verbatim, key constraint):
`form.className === 'forge-sentinel-form'` "must remain the ONLY class" — Setting rows go
*inside* this form, the form itself stays a plain `createEl('form', { cls: 'forge-sentinel-form' })`.
Decision D3 (verbatim): the hotkey field "wrapper and its back-button→wrapper→form ordering
are pinned by tests and must not move." Decision D4 (verbatim): EffortRow mounts into a
`Setting.controlEl`. Decision D5 (verbatim): the effort-row-before-submit ordering specs
"are rewritten to assert the effort `.setting-item` precedes the button row." Decision D6
(verbatim): inner elements driven by raw `dispatchEvent` need real listeners. Specific pins:
the static name in update mode must keep `[data-grimoire="spell-name"]`; the
apply-cast-directives toggle's surrounding label text must contain "(N directive(s) found)"
and `castCheckbox.closest('label').textContent` must still find it; the name `input[type="text"]`
must keep `.focus()` on create-mode render (ForgeSentinelDetail.test "focuses the name input").

**Cross-section couplings.**
- C parallels A: ForgeSentinelDetail builds its OWN model dropdown + effort row (it does NOT
  use `CastModelSection`). The model-row pattern and the `Setting.controlEl` + `EffortRow`
  approach established in A2/A3 should be reused verbatim here — C5/C6 mirror A2/A3. No code
  dependency, but keep the two implementations consistent.
- C0 rewrites the ordering specs `D1e` (forge-sentinel-detail.spec) and `E0.5`
  (forge-sentinel-detail.spec); these are the two assertions Decision D5 flags as
  layout-incompatible. C0 also must not disturb the hotkey-field ordering specs
  (forge-hotkey-capture.spec C2b) — those stay green because the hotkey block is untouched
  (Decision D3).

**Section-level Red criterion.** With ForgeSentinelDetail migrated: `form.forge-sentinel-form`
(class exactly equal) contains, in create mode, a reachable name `input[type="text"]`
(placeholder 'Name', focused on render) and a `textarea` (placeholder 'Description'); in
update mode a `[data-grimoire="spell-name"]` static display and a textarea (placeholder
'What should change about this spell?'); an `execute-on-note` toggle in create mode and an
`apply-cast-directives` toggle (with "(N directive(s) found)" label text) in update mode
with directives; a model `<select>` reachable via `form.querySelector('select')` with arrow
navigation intact; a `.grimoire-effort-row` that mounts/unmounts by model and sits before the
submit button row; the submit-enable rule and snapshot shapes unchanged. `ForgeSentinelDetail.test.ts`,
`forge-sentinel-detail.spec.ts`, `forge-sentinel-detail-update.spec.ts`, and
`forge-hotkey-capture.spec.ts` are green.

**ui-integration-tester**
- [ ] C0: Rewrite the effort-row-before-submit ordering assertions in `tests/integration/forge-sentinel-detail.spec.ts` (`D1e`, `E0.5`) to assert the effort `.setting-item` (or its `.grimoire-effort-row`) precedes the submit `.grimoire-button-row` via `compareDocumentPosition`, replacing the raw `form.children` index math (Decision D5). Confirm via running the suite that the name/description/checkbox/static-name/directive-label assertions across `ForgeSentinelDetail.test.ts`, `forge-sentinel-detail.spec.ts`, `forge-sentinel-detail-update.spec.ts` are expressible against the new Setting DOM; pin a new test that the `apply-cast-directives` toggle inner input fires `#handleApplyCastDirectivesChange` on a raw `change` event. Land failing-first — M, ui-integration-tester

**senior-dev**
- [ ] C1: Migrate `#buildNameField` (create) to `new Setting(form).setName('Name')` + `addText`, keeping placeholder 'Name', `input.focus()` on render, type `text`, and reachability via `form.querySelector('input[type="text"]')`; attach a real listener only if behaviour needs it (name is read on submit, so a stored `inputEl` reference suffices) — M, senior-dev
- [ ] C2: Migrate `#buildStaticNameField` (update) to a `Setting` row whose `controlEl`/`nameEl` holds a div carrying `dataset['grimoire'] = 'spell-name'` and the spell name text; keep "Updating spell:" framing reachable. Must satisfy forge-sentinel-detail-update.spec A2a (`input[placeholder="Name"]` absent, `[data-grimoire="spell-name"]` present) — S, senior-dev
- [ ] C3: Migrate `#buildDescriptionField` to `new Setting(form).setName(...)` + `addTextArea`, preserving the two placeholders ('Description' / 'What should change about this spell?'), the `#descInput` reference, and the `input` listener driving `#handleDescriptionInput` (the submit-enable rule) — M, senior-dev
- [ ] C4: Migrate `#buildExecuteOnNoteCheckbox` and `#buildApplyCastDirectivesCheckbox` to `addToggle` rows; re-apply `dataset['grimoire']` (`execute-on-note` / `apply-cast-directives`) to the inner input, attach real `change` listeners (`#handleExecuteOnNoteChange` / `#handleApplyCastDirectivesChange`, Decision D6), and ensure the directive copy "(N directive(s) found)" is in text that `castCheckbox.closest('label').textContent` resolves (forge-sentinel-detail-update.spec A3b/A4). Keep the create-vs-update gating in `#buildCheckbox` — M, senior-dev
- [ ] C5: Migrate `#buildModelSectionHeader` + `#buildModelSelect` to a `Setting` header/row mounting `buildModelSelect({ container: setting.controlEl, … })`; keep the `kb` arrow-key wiring and `<select>` reachability (ForgeSentinelDetail.test keyboard-cycling specs, forge-sentinel-detail.spec D1d) — M, senior-dev (depends on C3 above for form ordering)
- [ ] C6: Migrate `#initEffortRow` to mount `EffortRow` into a `Setting.controlEl` (Decision D4); preserve lazy mount/unmount-by-model and the `.grimoire-effort-row` class, and ensure the effort row precedes the submit button row (the C0-rewritten ordering assertions) — M, senior-dev (depends on C5 above)
- [ ] C7: Leave `#buildBackButton`, `#buildHotkeyCaptureField` (+ `.grimoire-hotkey-field` wrapper), `#buildSubmitButton` (`.grimoire-button-row`, submit/disable), and `#wireSubmitHandler` unchanged; verify the full forge suite incl. `forge-hotkey-capture.spec.ts` and the snapshot-shape specs are green — S, junior-dev

### D. CSS cleanup

#### Section briefing

**What this section produces.** Edits `styles.css` only. Removes the CSS rules that styled
the now-removed manual field layout, after Sections A–C have replaced those elements with
`.setting-item` rows. No new CSS — the goal is for theme `.setting-item` rules to take over.

**Design context the executor needs upfront.** Decision D2/D3 (verbatim consequence): the
button row, hotkey field, context-notes pills, and segmented control stay custom — their CSS
classes MUST be kept. `RefineVariantSelect` is out of scope (deferred) and still emits
`.grimoire-field-label` — that class MUST be kept. Only classes proven unused by a
codebase-wide grep after A–C land may be removed.

**Cross-section couplings.**
- D depends on A, B, C all being complete and green: a class can only be deleted once the
  code that emitted it is gone. D1 must grep `src/` for each candidate class before deleting.
- D must NOT remove `.grimoire-field-label` (still used by `RefineVariantSelect`, out of
  scope) or `.grimoire-hotkey-*`, `.context-notes-*`, `.grimoire-button-row`,
  `.grimoire-forge-btn`, `.grimoire-refine-inline`, `.grimoire-segmented*`, `.grimoire-nav-bar`
  (all still emitted by retained custom code).

**Section-level Red criterion.** After cleanup, `npm run lint` passes, `npm run arch:check`
passes, and the full unit + integration suites stay green. A grep of `src/` finds zero
emitters of each removed class. Candidate classes to remove (verify each with grep first):
`.options-panel` (+ its `select/textarea/input` descendant rules), `.forge-sentinel-form`
(+ descendant rules) **only if** `form.forge-sentinel-form`'s own class is still emitted but
its descendant field-styling rules are dead — keep the bare `.forge-sentinel-form` selector
if the class remains on the form; remove only the now-dead descendant rules,
`.grimoire-checkbox-row`, `.grimoire-section-label` (if A1/C5 replaced both header spans).

**junior-dev**
- [ ] D1: Grep `src/` for each candidate class (`options-panel`, `forge-sentinel-form` descendant rules, `grimoire-checkbox-row`, `grimoire-section-label`, `grimoire-field-label`); delete from `styles.css` only the rules whose class has zero emitters in `src/` after A–C. Explicitly KEEP `.grimoire-field-label` (RefineVariantSelect, out of scope), all `.grimoire-hotkey-*`, `.context-notes-*`, `.grimoire-button-row`, `.grimoire-forge-btn`, `.grimoire-refine-inline`, `.grimoire-segmented*`, `.grimoire-nav-bar`, `.grimoire-effort-row`. Run lint + arch:check + both test suites green — S, junior-dev

---

## Effort summary

- **Total:** 17 todos — S: 7, M: 10, L: 0
- **By tier:** ui-integration-tester: 3, junior-dev: 2, senior-dev: 12, lead-dev: 0
- **Dominant tier: senior-dev.** This is unusual for a "mechanical" migration, but justified:
  every dev todo carries the Decision D6 correctness hazard (Setting mock does not attach DOM
  listeners, so naive `.onChange`-only wiring passes the build but fails the raw-`dispatchEvent`
  tests) plus the data-attribute-preservation requirement. Once D6's pattern is established in
  Section A, the later toggle/text todos are arguably junior-dev — the orchestrator may
  downgrade C1/C2/C3/C7-adjacent work to junior-dev after seeing the A-section pattern land.
  The two `ui-integration-tester` rewrite todos (A0, C0) own the only genuinely
  layout-incompatible assertions; everything else is preserved by Decision D1.
