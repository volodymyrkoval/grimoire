# 012 — Remote Casting Setup

> Configuration-only pitch. Lay down the settings surface (one execution-mode toggle + five Advanced portal fields) and the read API to consume them. **No dispatch wiring, no URL construction, no connectivity check.** The follow-up pitch will read these values and dispatch remote casts.

## Complexity

🟡 **Medium.** Mechanically simple — six new controls on one tab, one persisted record, no behaviour change downstream — but the surface area touches:

- `GrimoireSettings` shape (new fields, hydration defaults)
- `GrimoireSettingTab.display()` (adds 6 rows + a section heading + divider; current method is 35 LOC and approaching the "long method" smell — small extraction warranted)
- `tests/__mocks__/obsidian.ts` (no `addToggle` shim today)
- `tests/integration/settings-panel.spec.ts` (its hard-coded `childElementCount === 14` assertion will break — must be updated in lockstep)

The breadth justifies full design sections.

## Goal & scope

### In scope

- Add `executionMode: 'local' | 'remote'` to `GrimoireSettings`, default `'local'`.
- Add five Advanced portal fields to `GrimoireSettings`, all default `''`:
  - `portalHost: string`
  - `portalPort: string` *(stored as string — same as every other field; numeric parsing is a follow-up concern)*
  - `portalPath: string`
  - `portalAuthUser: string`
  - `portalAuthPassword: string`
- Render in `GrimoireSettingTab.display()`:
  - **Top of the tab, above the existing seven rows:** an *Execution mode* toggle. Off = `'local'`, On = `'remote'`. Default reflects current persisted value.
  - **Below the existing seven rows:** a horizontal divider + an *Advanced* heading + five new rows (host, port, path, auth user, auth password — in that order).
  - Password row's underlying `<input>` has `type="password"`.
- Persistence through the existing `plugin.save()` → `DebouncedSaver` path. Defaults merge correctly for existing users on update (no field gets retroactively repopulated, `executionMode` stays `'local'`).
- Mock additions: `Setting.addToggle` + a `ToggleComponent` shim with `setValue` / `onChange` / `__triggerChange` matching the existing `TextComponent` / `DropdownComponent` pattern.
- One integration test extending `settings-panel.spec.ts` to pin: toggle write-through, password input is `type="password"`, Advanced fields persist, all 13 rows render in order. Existing assertions (7-row baseline) updated to the new total.

### Out of scope (No-gos enforced)

- No URL construction. No HTTP scheme field. No dispatch wiring. No code path *reads* the new fields this cycle outside the settings tab itself — domain layer remains read-API-ready but unconsumed.
- No connectivity / *Test connection* button.
- No conditional rendering of Advanced fields based on toggle state. All fields visible at all times.
- No collapsible *Advanced* section — plain heading + divider DOM nodes.
- No segmented control alternative to the toggle (deferred per pitch rabbit-hole).
- No OS-keychain integration. Plain plugin-data storage matches the rest of the settings model.
- No mobile UX reshaping around the toggle.
- No reset/import/export UI.
- No validation (port range, hostname syntax, path leading slash) — passive, matches the rest of the tab.

### Acceptance criteria (from pitch "done when")

1. The toggle persists across reloads (round-trips through `hydrate` → `saveData` → next `hydrate`).
2. All five Advanced fields persist across reloads.
3. The password field's input element has `type === 'password'`.
4. Downstream code can read the execution-mode flag *and* the five portal connection fields off `plugin.data.settings.*` with stable typed names — even though nothing reads them yet.

## Proposed solution

Strictly additive. Three files change in `src/`, two test files change.

```
src/domain/settings/Settings.ts          → 6 new fields on GrimoireSettings + DEFAULT_SETTINGS
src/ui/settings/GrimoireSettingTab.ts    → render toggle + heading + 5 rows, extract small helpers
tests/__mocks__/obsidian.ts              → ToggleComponent shim + Setting.addToggle
tests/integration/settings-panel.spec.ts → update row count, add toggle + password + portal assertions
tests/persistence.test.ts                → assert new fields default correctly through hydrate
```

`persistence.hydrate` itself needs **no source change** — `Object.assign(DEFAULT_SETTINGS, s?.settings)` already covers additive fields. We add coverage tests, not code, to verify that.

## Components

| Component | Location | Responsibility |
|-----------|----------|---------------|
| `GrimoireSettings` (extended) | `src/domain/settings/Settings.ts` | Pure shape + defaults. Add `executionMode`, `portalHost`, `portalPort`, `portalPath`, `portalAuthUser`, `portalAuthPassword`. |
| `GrimoireSettingTab` (extended) | `src/ui/settings/GrimoireSettingTab.ts` | Renders the toggle, the existing seven rows, the divider + heading, then five Advanced rows. Each control writes through to `plugin.data.settings.<field>` and calls `plugin.save()`. |
| Obsidian mock (extended) | `tests/__mocks__/obsidian.ts` | Adds `ToggleComponent` and wires `Setting.addToggle` to mirror the existing `addText` / `addDropdown` pattern, including `__triggerChange` test affordance. |
| Settings-panel integration spec (extended) | `tests/integration/settings-panel.spec.ts` | Pins the new 13-row seam: order, toggle write-through, password input type, all-five Advanced write-through. |
| Persistence unit spec (extended) | `tests/persistence.test.ts` | Pins additive-default behaviour for all six new fields. |

## Interfaces

### Extended `GrimoireSettings`

```ts
export type ExecutionMode = 'local' | 'remote';

export interface GrimoireSettings {
  // — existing —
  spellTag: string;
  cliCommand: string;
  binaryPath: string;
  forgeOutputFolder: string;
  vaultMountPath: string;
  defaultModel: string;
  defaultEffort: Effort | null;
  // — new (this iteration) —
  executionMode: ExecutionMode;   // default 'local'
  portalHost: string;             // default ''
  portalPort: string;             // default ''  — stored as string, parsed at use time (next pitch)
  portalPath: string;             // default ''
  portalAuthUser: string;         // default ''
  portalAuthPassword: string;     // default ''
}

export const DEFAULT_SETTINGS: GrimoireSettings = {
  // — existing values unchanged —
  spellTag: 'grimoire/spell',
  cliCommand: 'claude',
  binaryPath: '',
  forgeOutputFolder: 'Spells/',
  vaultMountPath: '',
  defaultModel: 'claude-sonnet-4-5',
  defaultEffort: 'medium',
  // — new —
  executionMode: 'local',
  portalHost: '',
  portalPort: '',
  portalPath: '',
  portalAuthUser: '',
  portalAuthPassword: '',
};
```

### `Setting.addToggle` mock shape (test-only)

```ts
class ToggleComponent {
  readonly toggleEl: HTMLInputElement | any; // checkbox in happy-dom; mock element in node
  setValue(value: boolean): this;
  onChange(handler: (value: boolean) => void): this;
  // Test affordance, parallel to TextComponent.__triggerChange:
  __triggerChange(value: boolean): void;
}

// On Setting:
addToggle(callback: (component: ToggleComponent) => void): this;
```

### `GrimoireSettingTab` — internal helpers (no exports change)

```ts
// New private helpers on GrimoireSettingTab (additions only):
#addToggleField(label: string, get: () => boolean, set: (v: boolean) => void): void;
#addPasswordField(label: string, get: () => string, set: (v: string) => void): void;
#renderAdvancedSection(): void; // divider + heading + 5 rows
```

The existing `#addTextField` is reused unchanged for host, port, path, auth user.

## Data flow

```
                ┌────────────────────────────────────────────────┐
                │ GrimoireSettingTab.display()                   │
                │                                                │
   user edits   │   ┌─ toggle (executionMode)                    │
   any row ────▶│   ├─ 7 existing rows                           │
                │   ├─ divider + Advanced heading                │
                │   └─ 5 portal rows (host, port, path, user, pw)│
                │                                                │
                │   each onChange:                               │
                │     plugin.data.settings.<field> = value       │
                │     plugin.save()    ───┐                      │
                └──────────────────────────┼─────────────────────┘
                                           ▼
                                ┌──────────────────────┐
                                │ DebouncedSaver       │
                                │ schedule (500 ms)    │
                                └──────────┬───────────┘
                                           ▼
                                ┌──────────────────────┐
                                │ plugin.saveData(...) │
                                └──────────┬───────────┘
                                           ▼
                                  data.json (disk)

   on reload:  loadData() → hydrate() → DEFAULT_SETTINGS merged under saved values
                            └─ new fields default to 'local' / '' if not present in saved blob
```

No fan-out, no observers, no derived state. Six new fields, each behaves exactly like the existing five text rows.

## Error handling

No new error paths. Specifically:

- No validation → no validation errors to surface.
- No I/O at edit time → no I/O errors.
- Hydration uses the existing additive-merge contract; missing fields take defaults. Malformed `executionMode` values are *not* coerced (deferred — same posture as `defaultModel` per `docs/features/settings-panel.md`). Documented in Technical Notes.

## Key design decisions

1. **`executionMode` is a string-literal union, not a boolean.** Leaves room for a third dispatch path (e.g. `'queued'`) without a data migration. Cost: one extra type alias. Pitch flagged segmented-control as a possible v2 widget — string-literal storage supports either widget choice unchanged.
2. **`portalPort` is `string`, not `number`.** Every other text-input setting is `string`; parsing at the URL-construction site (next pitch) is the natural seam. Storing as number now would require a parse step in the settings tab and special-casing empty-vs-zero — both speculative.
3. **All Advanced fields render unconditionally.** Pitch is explicit. Avoids the UX trap of "where did my saved fields go when I toggled off."
4. **Password masking via `input.type = 'password'`, not a custom widget.** Obsidian's `TextComponent.inputEl` is accessible; flipping the type attribute is one line. No new widget class, no styling hooks.
5. **Heading + divider are plain DOM (`containerEl.createEl('hr')`, `containerEl.createEl('h3', { text: 'Advanced' })`), not `Setting.setHeading()`.** The current code never uses `setHeading`, and the mock would need a separate shim. Plain DOM keeps the mock surface minimal.
6. **`hydrate` is not modified.** `Object.assign(DEFAULT_SETTINGS, s?.settings)` already covers additive fields. Adding code "just in case" would be untested speculative defence; adding a test that pins the existing behaviour is the honest move.
7. **No defaults-migration code.** Existing users on update get `executionMode: 'local'` and `portal*: ''` automatically through the merge — no explicit migration step.
8. **Order is fixed:** toggle (top) → 7 existing rows → divider → *Advanced* heading → host → port → path → auth user → auth password. The integration test pins this order by index.

## Technical notes

- **Design-patterns pass:** Strategy considered for "field types" (text/toggle/password) — rejected: three concrete cases, one consumer, YAGNI. Adding three small private helpers on the tab class is cheaper than a Strategy interface.
- **Design-rubric pass:** `GrimoireSettingTab.display()` is currently 35 LOC; after additions it would push ~70 LOC if inlined. Extract `#renderAdvancedSection()` to keep `display()` skim-readable.
- **Mock parity:** `ToggleComponent` must mirror `TextComponent`'s dual-environment branch (happy-dom path + node-mock path) so unit tests under `tests/persistence.test.ts` keep running in `environment: 'node'`.
- **Integration-spec breakage is intentional:** `settings-panel.spec.ts` line 32 hard-codes `childElementCount === 14`. After this iteration that becomes 26 (1 toggle + 7 existing + heading + divider + 5 new = 13 `Setting` instances × 2 child els, plus 2 plain-DOM children for divider + heading). The exact target is verified by the integration test, not pre-computed in the plan — counted in the Red criterion only as "all rows render in the documented order."
- **Hydration coercion of `executionMode`:** deferred. Matches the existing `defaultModel` posture documented in `docs/features/settings-panel.md` ("Saved unknown `defaultModel` ids are not coerced in `hydrate`"). If a future invalid value lands in `data.json`, the toggle reflects "off" only when value is exactly `'local'`; any other string would currently render undefined toggle state. Flagged as deferred edge case below.
- **Password at rest:** plain plugin-data storage. Pitch rabbit-hole explicitly accepts this for v1.

### Deferred edge cases

- Invalid `executionMode` value loaded from disk (e.g. `data.json` hand-edited to `'banana'`). Pitch is silent; pitch posture is passive validation everywhere; matches the deferred `defaultModel` coercion. **Decision: do not coerce.** Document in live-spec.
- Whitespace-only portal fields (e.g. `portalHost: '   '`). Pitch is silent; URL construction is a follow-up pitch's concern. **Decision: do not trim.** Persist verbatim.
- Toggle flipped during cast (race): no cast dispatch path consumes the value this cycle, so unreachable. **Decision: not applicable until follow-up.**

## Todos

### A. Domain shape — `Settings.ts`

#### Section briefing

1. **What this section produces:** Adds six fields to `GrimoireSettings` and `DEFAULT_SETTINGS` in `src/domain/settings/Settings.ts`, plus an `ExecutionMode` type alias. No new file. Implements the `Extended GrimoireSettings` shape under Interfaces verbatim.
2. **Design context the executor needs upfront:** Key design decision #2: "`portalPort` is `string`, not `number`." Key design decision #1: "`executionMode` is a string-literal union, not a boolean." Both are non-negotiable for this section — do not "improve" them to `number` or `boolean`.
3. **Cross-section couplings:**
   - `A1` is consumed by `B1`, `C1`, `D1`, `E1` — every later section reads the field names from this section. Field naming established here is final; downstream sections cite this section by name, not reinvent.
4. **Section-level Red criterion:** A TypeScript compile of the whole project succeeds after the shape change. No persistence test or settings-tab test runs yet; the change is type-shape only. Verified by `npm run build` succeeding and `npm test -- tests/persistence.test.ts` still passing (existing tests must not break — additive change).

**junior-dev**

- [ ] A1: Add `executionMode: ExecutionMode` and the five `portal*: string` fields to `GrimoireSettings` in `src/domain/settings/Settings.ts`. Export `type ExecutionMode = 'local' | 'remote'`. Extend `DEFAULT_SETTINGS` with `executionMode: 'local'` and `''` for each portal field. Order matches Interfaces section. — S, junior-dev

### B. Persistence — hydrate coverage

#### Section briefing

1. **What this section produces:** New test cases appended to `tests/persistence.test.ts`. No production source changes — `Object.assign(DEFAULT_SETTINGS, s?.settings)` already handles additive fields; this section pins that behaviour. Implements acceptance criterion 1 (toggle round-trip) and 2 (Advanced fields round-trip) at the unit level.
2. **Design context the executor needs upfront:** Key design decision #6: "`hydrate` is not modified." If a test fails and the fix is in `persistence.ts`, stop and escalate — the design says hydrate is closed; only the test or the defaults are wrong. Key design decision #7: "No defaults-migration code." A saved blob without the new fields must produce defaults, not throw.
3. **Cross-section couplings:**
   - `B1`, `B2`, `B3` depend on `A1` — read field names from Section A.
   - None outbound. Section B is unit-level and feeds nothing downstream.
4. **Section-level Red criterion:** `npm test -- tests/persistence.test.ts` passes with at least three new cases: (i) `hydrate(undefined, app)` yields `executionMode === 'local'` and `''` for all five portal fields; (ii) `hydrate({ settings: { executionMode: 'remote', portalHost: 'h', portalPort: '8080', portalPath: '/g', portalAuthUser: 'u', portalAuthPassword: 'p' }}, app)` yields each value back unmodified; (iii) `hydrate({ settings: { portalHost: 'h' }}, app)` yields `portalHost: 'h'` with all other new fields at their defaults.

**junior-dev**

- [ ] B1: Add hydrate test case (h): `hydrate(undefined, app)` defaults all six new fields per `DEFAULT_SETTINGS`. — S, junior-dev
- [ ] B2: Add hydrate test case (i): saved blob with all six new fields populated round-trips unmodified. — S, junior-dev
- [ ] B3: Add hydrate test case (j): partial saved blob (only `portalHost`) leaves the other five new fields at defaults. — S, junior-dev

### C. Obsidian mock — `addToggle` shim

#### Section briefing

1. **What this section produces:** Adds a `ToggleComponent` class and `Setting.addToggle(callback)` method to `tests/__mocks__/obsidian.ts`. Scaffolding only — no Settings tab consumer wires through until Section E.
2. **Design context the executor needs upfront:** Technical note "Mock parity": `ToggleComponent` must mirror `TextComponent`'s dual-environment branch (happy-dom path + node-mock path) so unit tests in `environment: 'node'` keep working. In happy-dom, back the toggle with `document.createElement('input')` of `type="checkbox"`; expose `.toggleEl` and a `__triggerChange(boolean)` test affordance parallel to `TextComponent.__triggerChange`. In node, use `createMockElement()` and stash the current boolean in a private field.
3. **Cross-section couplings:**
   - `C1` is consumed by `D0` and `E1` — both rely on `addToggle` being available on `Setting` and on `__triggerChange` driving the `onChange` handler.
4. **Section-level Red criterion:** Existing `tests/integration/settings-panel.spec.ts` still passes (the toggle shim must not regress text/dropdown rendering). A trivial assertion like `new Setting(containerEl).addToggle(t => t.setValue(true).onChange(() => {}))` runs in both `environment: 'node'` and `environment: 'happy-dom'` without throwing.

**junior-dev**

- [ ] C1: Add `ToggleComponent` class to `tests/__mocks__/obsidian.ts` (constructor takes `containerEl`; methods `setValue(boolean): this`, `onChange(handler): this`, `__triggerChange(boolean): void`; dual-environment branch matching `TextComponent`). Add `Setting.addToggle(callback)` that constructs the component into `this.controlEl` and invokes the callback. — S, junior-dev

### D. Settings tab seam — integration tests (Red) and implementation (Green)

#### Section briefing

1. **What this section produces:**
   - **D0 (tester):** New assertions appended to `tests/integration/settings-panel.spec.ts` pinning the toggle, the password input type, the Advanced rows' write-through, and the new total row count + order. Also updates the existing line-32 `childElementCount === 14` assertion to the new expected total.
   - **D1–D6 (devs):** Implementation in `src/ui/settings/GrimoireSettingTab.ts` to make D0 green: toggle row at the top, divider + heading after row 7, five Advanced rows in order, password row with `type="password"`, helper extraction per Key design decision #5.
2. **Design context the executor needs upfront:**
   - Key design decision #3: "All Advanced fields render unconditionally." Do not branch rendering on `executionMode`.
   - Key design decision #4: "Password masking via `input.type = 'password'`." Use `TextComponent`'s `inputEl` — flip the `type` attribute inside the `addText` callback. Do not invent a new component.
   - Key design decision #5: "Heading + divider are plain DOM (`containerEl.createEl('hr')`, `containerEl.createEl('h3', { text: 'Advanced' })`)." Do not use `Setting.setHeading()`.
   - Key design decision #8 (fixed order): toggle (top) → 7 existing rows → divider → *Advanced* heading → host → port → path → auth user → auth password.
3. **Cross-section couplings:**
   - `D0` depends on `C1`: the tester needs `addToggle` available in the mock to drive toggle changes via `__triggerChange`.
   - `D0` depends on `A1`: assertions reference field names by string.
   - `D1`–`D6` depend on `A1`: implementation writes to `plugin.data.settings.<new field>`.
   - `D0`'s row-count assertion: the existing integration spec asserts `childElementCount === 14` (7 `Setting`s × 2). After this iteration the container has: 1 toggle Setting (+2 children) + 7 existing Settings (+14) + 1 `<hr>` (+1) + 1 `<h3>` (+1) + 5 new Settings (+10) = **28 children**. The tester pins this exact count; the dev implementation must produce it.
4. **Section-level Red criterion:** `npm run test:integration -- settings-panel` is **red** after D0 lands and **green** after D1–D6 land. Specifically green means: (a) `containerEl.childElementCount === 28`; (b) `containerEl.querySelector('input[type="checkbox"]')` exists and `__triggerChange(true)` flips `plugin.data.settings.executionMode` to `'remote'` and calls `plugin.save()`; (c) `containerEl.querySelector('input[type="password"]')` exists, is the auth-password row's input, and `__triggerChange('secret')` writes `plugin.data.settings.portalAuthPassword === 'secret'` + calls save; (d) the five Advanced text inputs (host, port, path, auth user) each write through to their named field and call save; (e) Advanced rows appear after the 7 existing rows, after the `<hr>` and `<h3>` nodes, in the documented order.

**ui-integration-tester**

- [ ] D0: Update `tests/integration/settings-panel.spec.ts`: replace the `childElementCount === 14` assertion with `=== 28` and add assertions for toggle write-through, password input `type === 'password'`, each Advanced field's write-through (host/port/path/user/password), and DOM order (`<hr>` and `<h3 class?=... textContent="Advanced">` appear between the 7th existing Setting and the 1st Advanced Setting). — M, ui-integration-tester

**junior-dev**

- [ ] D1: Add `#addToggleField(label, get, set)` private helper to `GrimoireSettingTab` mirroring `#addTextField`'s shape (new `Setting`, `.setName(label)`, `.addToggle(t => t.setValue(get()).onChange(v => { set(v); this.#plugin.save(); }))`). — S, junior-dev
- [ ] D2: Add `#addPasswordField(label, get, set)` private helper. Same as `#addTextField` but inside the `addText` callback, set `t.inputEl.type = 'password'` after wiring value/onChange. — S, junior-dev
- [ ] D3: In `display()`, render the toggle row first via `#addToggleField('Execution mode', () => settings.executionMode === 'remote', v => { settings.executionMode = v ? 'remote' : 'local'; })`. Keep the existing seven rows immediately after, unchanged. — S, junior-dev
- [ ] D4: Add `#renderAdvancedSection()` private method that appends, in order: `this.containerEl.createEl('hr')`, `this.containerEl.createEl('h3', { text: 'Advanced' })`, then five rows via `#addTextField` (host, port, path, auth user) and `#addPasswordField` (auth password). — S, junior-dev
- [ ] D5: Call `this.#renderAdvancedSection()` at the end of `display()`, after the effort row. — S, junior-dev
- [ ] D6: Confirm `npm run lint` + `npm test` + `npm run test:integration` all pass. No source changes outside `src/domain/settings/Settings.ts`, `src/ui/settings/GrimoireSettingTab.ts`, `tests/__mocks__/obsidian.ts`, `tests/persistence.test.ts`, `tests/integration/settings-panel.spec.ts`. — S, junior-dev

### E. Read-API smoke — pin downstream-readability

#### Section briefing

1. **What this section produces:** One small assertion appended to `tests/persistence.test.ts` (or a new minimal test file under `tests/` if the executor judges that cleaner) that demonstrates a hydrated `GrimoireData` exposes every new field by name with stable types. This satisfies acceptance criterion 4 ("downstream code can read … with stable typed names, even though nothing reads them yet").
2. **Design context the executor needs upfront:** The follow-up pitch will consume these fields by name from `plugin.data.settings`. The test exists to lock the names so a rename in this iteration breaks the test, not the future pitch. It's a single `expect.objectContaining({...})` assertion against a fresh `hydrate(undefined, app)`.
3. **Cross-section couplings:**
   - `E1` depends on `A1` (field names) and on `B1`/`B2`/`B3` already being green.
4. **Section-level Red criterion:** Test asserts that `hydrate(undefined, app).settings` has all six new keys present and typed (`typeof executionMode === 'string'`, `executionMode === 'local' || executionMode === 'remote'`, the five portal fields are strings). Passes after Section A is implemented.

**junior-dev**

- [ ] E1: Append a hydrate test case to `tests/persistence.test.ts`: `expect(result.settings).toEqual(expect.objectContaining({ executionMode: 'local', portalHost: '', portalPort: '', portalPath: '', portalAuthUser: '', portalAuthPassword: '' }))`. — S, junior-dev

## Overall effort

| Effort | Count |
|--------|-------|
| S      | 11    |
| M      | 1     |
| L      | 0     |

| Tier                  | Count |
|-----------------------|-------|
| junior-dev            | 11    |
| senior-dev            | 0     |
| lead-dev              | 0     |
| ui-integration-tester | 1     |

The plan is dominated by junior-dev work because every design question (field shapes, defaults, ordering, helper extraction, password masking technique, plain-DOM heading) is closed at planning time. The single ui-integration-tester todo (D0) defines the Red criterion for Section D; D1–D6 are mechanical implementation to make it green.

## Next

First todo: **A1** — extend `GrimoireSettings` and `DEFAULT_SETTINGS` per Interfaces. Handoff to junior-dev via `/implement`.
