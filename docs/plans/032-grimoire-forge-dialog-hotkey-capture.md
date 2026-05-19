# Forge dialog hotkey capture

> Source pitch: `brain/Grimoire - Forge dialog hotkey capture.md`. Half-a-day appetite. Follow-up to `031-spell-hotkeys` (`dev/done-031`). Complexity: **Medium** (`--deep`). One component (`ForgeSentinelDetail`), two flows (create + update), one new side-effect path (immediate frontmatter erase in update mode), one new commit-time validation (collision against other vault spells). Re-runs the full multi-perspective pass because the seam between "UI authoring surface" and "vault-state-aware validator" is new even though the surface area is small.

## Goal & scope

### What

Replace the plain text `Hotkey` input inside `ForgeSentinelDetail` with a button-driven capture surface. The dialog's "shape" changes; nothing downstream of the snapshot does.

Three states for the new surface:

1. **Default (no captured value).** A button labelled `Hotkey`. In update mode, if `mode.spell.hotkey` is non-null at render time, a persisted chip precedes the button: monospace, accent-tinted, with a `×` to its right that **deletes the persisted hotkey immediately** (mutates the spell file's frontmatter, removes the chip, leaves the button alone).
2. **Capture (button clicked).** Button label changes to `Save`. A live chip appears next to the button. Bare lowercase letters land in the chip (no Shift). Backspace removes the last letter. `Enter` (with the dialog focused) or clicking `Save` commits. A `×` button appears next to the chip; clicking it during capture **cancels the edit without persisting** — restores the previously-saved chip if any, otherwise returns to default state.
3. **Rejected commit.** On invalid commit, the chip recolours red, an inline error appears below the button naming the violated rule. The dialog stays in capture state. No animation.

Validation at commit time:

- Pattern: exactly one or two lowercase ASCII letters (reuses `parseHotkey`).
- Not `f` (reserved for Forge sentinel).
- Not `r` (reserved for Refine sentinel).
- Not an exact-string match against any *other* user-authored spell's `grimoire-hotkey`. (In update mode, the spell being edited is excluded from the check — re-saving its own current hotkey is a no-op success, not a collision.)
- No prefix-relationship check. `f` and `fo` coexist legitimately at runtime; the dialog does not police prefixes.

Out:

- Auto-focus the capture state when the dialog opens (explicit pitch rabbit hole — primary input is description).
- Animations on rejection (flash, shake).
- Undo / toast / two-step confirm for the persisted-chip `×` delete.
- Suggestion helpers ("pick another letter", "steal from spell X").
- Non-letter input (digits, symbols, uppercase, modifiers, function keys, arrows).
- Replacing or modifying the load-time collision Notice from `spell-hotkeys` (frontmatter hand-edits still bypass the dialog).
- Settings-panel hotkey surface.
- Storage-layer changes — `grimoire-hotkey`, `parseHotkey`, sentinel resolution, the runtime registry all stay exactly as `spell-hotkeys` left them.

### Why

The plain text input borrowed from forms doesn't rhyme with the keybinding gesture it produces. Three concrete frictions:

1. Typing letters into a box vs. pressing a key to fire feels like unrelated motions.
2. Collision feedback is deferred to plugin-load `Notice`, far from the author's original intent.
3. Clearing requires select-and-delete; no explicit affordance.

A button → chip → bare-letter capture loop maps the authoring motion onto the firing motion, surfaces collisions in place, and makes "remove this hotkey" a single click.

## Proposed solution

A new component, `HotkeyCaptureField`, owns the button + chip + capture state machine + commit validation, and replaces the `#buildHotkeyField` block inside `ForgeSentinelDetail`. The field accepts:

- `mode: ForgeMode` — to know whether a persisted hotkey may exist and which spell path is "self" for collision exclusion.
- `validator: HotkeyCommitValidator` — pure function `(candidate: string, selfPath: SpellPath | null) => HotkeyCommitResult`. Encapsulates pattern, sentinel, and other-spell collision checks. Lives in `src/forge/hotkeyCommitValidator.ts` with full unit-test coverage (node env).
- `eraser: HotkeyEraser | null` — async callback for the persisted-chip `×` click in update mode. Wraps `app.fileManager.processFrontMatter` at the host side. `null` in create mode (the dialog never has a persisted value to erase before commit).
- `onChange(hotkey: Hotkey | null)` — informs the parent which value to put into the submitted snapshot. The parent stores it in `#hotkey` and reads it during snapshot construction (replacing today's `parseHotkey(this.#hotkey)` call).

The validator is wired at host construction time via a `HotkeyDirectory` interface:

```
interface HotkeyDirectory {
  /** Returns hotkeys currently in use by user-authored spells, keyed by SpellPath. */
  inUse(): ReadonlyMap<SpellPath, Hotkey>;
}
```

`CommandPopupBuilder` constructs the directory from the already-scanned spell list (the same list that feeds `HotkeyRegistry.build` at popup open) and passes a `() => HotkeyDirectory` snapshot factory through to `DetailPanelRouter` → `ForgeSentinelDetail` → `HotkeyCaptureField`. Snapshot is taken at dialog-open time; mid-dialog vault changes are not tracked (out of scope, half-day appetite).

The eraser is wired at host side using `app.fileManager.processFrontMatter(file, fm => delete fm['grimoire-hotkey'])`. The mock currently lacks `fileManager` — added in this iteration (one junior todo on the harness).

The chip and capture state machine are pure data inside `HotkeyCaptureField`. The component re-renders its slot based on `FieldState`:

```
type FieldState =
  | { phase: 'default'; persisted: Hotkey | null }
  | { phase: 'capture'; buffer: string; previous: Hotkey | null; error: string | null }
```

Transitions are deterministic, testable, and small.

## Multi-perspective synthesis

Four perspectives considered: minimalist, extensibility, devil's advocate, user advocate.

### Consensus

- **Validator is pure, separable, unit-testable.** All four agree: the rule set (pattern, two reserved letters, other-spell-set membership) is the obvious test seam; do not entangle it with the DOM. `parseHotkey` already exists for the pattern half — reuse it.
- **`HotkeyDirectory` snapshot at dialog open, not live.** None of the perspectives want a live vault subscription mid-dialog. The collision picture is taken once at open and used by the validator until close. If the user adds a colliding hotkey in another window during the dialog session, the load-time Notice still backstops at next popup open.
- **No prefix policing.** Pitch is explicit and all perspectives concur: prefix coexistence is already a runtime feature (`f` and `fo` both fire), so a dialog-level prefix check would forbid legitimate pairs.
- **Persisted-chip `×` mutates frontmatter immediately, no Undo.** Pitch says so; no perspective argued for a confirm/undo step in half-a-day scope. The frontmatter is recoverable via Obsidian's own file-history if the user genuinely needs it.

### Tensions

- **Extensibility wanted** a generic `ChipCaptureField<T>` so future fields (tag selector, model picker) could share the chrome. **Minimalist rejected**: nothing else needs it today; YAGNI. **Resolution:** ship `HotkeyCaptureField` as a single-purpose component. It is small enough that extracting a generic chassis later is cheap if a second consumer appears.
- **User advocate** worried that "press the button, then type letters" introduces a hidden state — a user who clicks the button and walks away to type description text might land letters into the capture field unintentionally. **Devil's advocate** agreed this is the failure mode of "field with implicit keyboard focus." **Resolution:** the capture state binds keys to the **field itself** (the button's containing element), not to the dialog scope. The component traps `keydown` only while it owns DOM focus. The pitch's "the dialog has the user's keyboard exclusively" reads as a description of the modal's exclusivity from the OS, not of the field's exclusivity from sibling inputs. If focus leaves the chip area (Tab to description, click on textarea), the field exits capture state without persisting (treat as a `×` cancel). Tested in the integration suite.
- **Minimalist** asked whether the `Save` button is necessary at all — `Enter` could be the only commit gesture. **User advocate** countered: discoverability. A user who finds the dialog without reading the pitch needs a visible commit affordance. **Resolution:** keep both. `Save` button click and `Enter`-while-focused both commit. The button label change from `Hotkey` to `Save` is itself the discoverability cue.
- **Devil's advocate** raised: the persisted-chip `×` mutates the file *behind* the dialog's submit flow. If the user clicks `×` then closes the dialog without submitting, the hotkey is gone but the snapshot was never dispatched — does this leave the system in a coherent state? **Resolution:** yes. The hotkey is frontmatter on the spell file; the dialog's submit dispatches a *Forge update meta-spell cast*, which can change *other* parts of the spell. Clearing the hotkey is a self-contained user intent ("I want this hotkey gone") that does not need to be bundled with the spell-rewrite intent. Documented as a design decision below.
- **Extensibility** asked whether the collision check should consider sentinel hotkeys as "in use by name." **Minimalist** said no — they're already handled as the two reserved-letter rules. **Resolution:** the validator emits distinct rejection reasons (`reserved-forge`, `reserved-refine`, `collision`) so the inline error text can be specific without conflating the two cases. Pitch agrees: "Reserved for Forge", "Reserved for Refine", "Hotkey already used by *spell name*".

### Critical concerns

- **Keyboard scope leak.** `ForgeSentinelDetail` runs inside a detail phase where `kb.suspend()` has removed all popup-scope bindings. The new field must not add bindings to the popup scope (that would interfere on `kb.resume()` post-exitDetail). It binds via plain DOM `addEventListener('keydown', …)` on its own container element, never via `KeyboardController`. This matches the existing description-textarea behaviour.
- **Focus management.** Pitch rabbit hole: do not auto-focus. The field's button is reachable by Tab or click. The dialog continues to focus the name input on open in create mode (today's behaviour) and nothing in update mode (today's behaviour). The capture state's "exit on focus loss" rule means tabbing away cancels — confirmed safe because the dialog never auto-Tabs into the field.
- **`Enter` ambiguity.** The form already binds `submit` (Enter from a focusable field that isn't the textarea). When the capture state is active and the button has focus, `Enter` must commit the *field*, not submit the *form*. Achieved by intercepting `Enter` at the field's keydown handler with `preventDefault()` + `stopPropagation()` while in capture phase. When the field is not in capture phase, `Enter` propagates normally and the form's submit handler decides what to do.
- **Update mode field initial state.** When `mode.kind === 'update'` and `mode.spell.hotkey !== null`, the field starts in `{ phase: 'default', persisted: mode.spell.hotkey }`. The `onChange(mode.spell.hotkey)` is fired once at mount so the parent's `#hotkey` is initialised correctly without the user touching the field — protecting the existing snapshot-on-submit contract (submit without touching the field preserves the existing hotkey).
- **Snapshot contract is unchanged.** `ForgeFormSnapshot.hotkey: Hotkey | null` and `ForgeUpdateFormSnapshot.hotkey: Hotkey | null` keep their types and meaning. The meta-spell templates from `031-spell-hotkeys` keep working unchanged.
- **Erase + cancel-without-submit.** If the user clicks `×` on a persisted chip (erase fires → frontmatter mutated → chip removed) and then closes the dialog via Back/Escape, the persisted hotkey is gone but no Forge update cast ran. This is intentional: the erase is a complete unit of intent. The Cast Log gets no entry for the erase. Documented; no special handling.

### Recommended approach

Build inside-out:

1. Pure validator (`hotkeyCommitValidator.ts`) — junior, unit tests only.
2. `HotkeyDirectory` snapshot construction at popup-builder layer — junior, unit tests.
3. Mock harness extension (`fileManager.processFrontMatter`) — junior.
4. `HotkeyCaptureField` component — senior, plus the integration tester group below.
5. Wire `HotkeyCaptureField` into `ForgeSentinelDetail`, delete the old `#buildHotkeyField` body — senior.
6. Wire the `HotkeyDirectory` snapshot factory + eraser through `DetailPanelRouter` and `CommandPopupBuilder` — junior (plumbing) + senior (decision points around what to pass and when to snapshot).
7. Styles for chip and button — junior.

## Components

| Component | Location | Responsibility |
|---|---|---|
| `HotkeyCommitValidator` (pure fn + types) | `src/forge/hotkeyCommitValidator.ts` (new) | Pure: `(candidate: string, selfPath: SpellPath \| null, directory: HotkeyDirectory) => HotkeyCommitResult`. No DOM, no async. |
| `HotkeyDirectory` (interface + builder) | `src/forge/HotkeyDirectory.ts` (new) | `{ inUse(): ReadonlyMap<SpellPath, Hotkey> }`. Built at popup-open from the same `Spell[]` that `HotkeyRegistry.build` consumes. |
| `HotkeyCaptureField` | `src/ui/components/HotkeyCaptureField.ts` (new) | The new button + chip + capture-state-machine widget. Owns its own DOM-scoped keydown listeners. |
| `ForgeSentinelDetail` | `src/ui/components/ForgeSentinelDetail.ts` (edited) | Replaces `#buildHotkeyField` body with a `HotkeyCaptureField` mount. Snapshot construction unchanged. |
| `DetailPanelRouter` | `src/ui/popup/DetailPanelRouter.ts` (edited) | Threads `hotkeyDirectoryFactory: () => HotkeyDirectory` and `hotkeyEraser: HotkeyEraser` into both `renderForge` and `renderForgeUpdate`. |
| `CommandPopup` | `src/ui/CommandPopup.ts` (edited) | Builds `HotkeyDirectory` from the `spells` already scanned in `onOpen()` and passes it (and an `eraser`) into the router deps. |
| `CommandPopupBuilder` | `src/ui/popup/CommandPopupBuilder.ts` (edited) | Constructs the `HotkeyEraser` closure that calls `app.fileManager.processFrontMatter`. |
| `tests/__mocks__/obsidian.ts` | (edited) | Add `App.fileManager.processFrontMatter` mock; add `__filesByPath` map so tests can register a `TFile` for `processFrontMatter` to receive. |

## Interfaces

```ts
// src/forge/HotkeyDirectory.ts
import type { Hotkey } from '../domain/spells/Hotkey';
import type { SpellPath } from '../domain/spells/SpellPath';
import type { Spell } from '../domain/spells/Spell';

export interface HotkeyDirectory {
  /** Snapshot of hotkeys in use by user-authored spells at the moment the directory was built. */
  inUse(): ReadonlyMap<SpellPath, Hotkey>;
}

export function buildHotkeyDirectory(spells: readonly Spell[]): HotkeyDirectory {
  const map = new Map<SpellPath, Hotkey>();
  for (const s of spells) if (s.hotkey !== null) map.set(s.path, s.hotkey);
  return { inUse: () => map };
}
```

```ts
// src/forge/hotkeyCommitValidator.ts
import type { Hotkey } from '../domain/spells/Hotkey';
import type { SpellPath } from '../domain/spells/SpellPath';
import type { HotkeyDirectory } from './HotkeyDirectory';

export type HotkeyCommitResult =
  | { ok: true; hotkey: Hotkey }
  | { ok: false; reason: 'pattern' | 'reserved-forge' | 'reserved-refine' | 'collision'; collidingSpellName?: string };

export function validateHotkeyCommit(
  candidate: string,
  selfPath: SpellPath | null,
  directory: HotkeyDirectory,
): HotkeyCommitResult;
```

```ts
// src/ui/components/HotkeyCaptureField.ts
import type { Hotkey } from '../../domain/spells/Hotkey';
import type { SpellPath } from '../../domain/spells/SpellPath';

export type HotkeyEraser = (spellPath: SpellPath) => Promise<void>;

export interface HotkeyCaptureFieldParams {
  container: HTMLElement;
  initialPersisted: Hotkey | null;       // create mode: always null. update mode: mode.spell.hotkey.
  selfPath: SpellPath | null;            // create mode: null. update mode: mode.spell.path.
  directory: HotkeyDirectory;
  validator: typeof validateHotkeyCommit;
  eraser: HotkeyEraser | null;           // null in create mode; the field never renders the persisted chip then.
  onChange: (hotkey: Hotkey | null) => void;
}

export class HotkeyCaptureField {
  render(params: HotkeyCaptureFieldParams): void;
  destroy(): void;                       // removes its keydown listener and DOM nodes
}
```

```ts
// src/ui/components/ForgeSentinelDetail.ts — params surface
export interface ForgeSentinelDetailParams {
  contentEl: HTMLElement;
  mode: ForgeMode;
  callbacks: {
    onBack: () => void;
    onCreateSubmit: (snapshot: ForgeFormSnapshot) => void;
    onUpdateSubmit: (snapshot: ForgeUpdateFormSnapshot) => void;
  };
  defaults: FormDefaults;
  hotkey: {                              // NEW grouped param
    directory: HotkeyDirectory;
    eraser: HotkeyEraser;                // always provided; field only invokes it in update mode
  };
}
```

```ts
// src/ui/popup/DetailPanelRouter.ts — new deps
export interface DetailPanelRouterDeps {
  // …existing fields…
  hotkeyDirectoryFactory: () => HotkeyDirectory;   // called once per detail render
  hotkeyEraser: HotkeyEraser;
}
```

## Data flow

```
Popup open (CommandPopup.onOpen)
  → refreshSpells() → spells: readonly Spell[]
  → buildHotkeyCapture(spells)            // existing
  → buildHotkeyDirectory(spells)          // NEW — same input list, cheap O(n)
  → store directory on popup for the open lifecycle

Detail entry (renderForge / renderForgeUpdate)
  → DetailPanelRouter passes directory + eraser into ForgeSentinelDetail.render({ ..., hotkey: { directory, eraser } })
  → ForgeSentinelDetail mounts HotkeyCaptureField with initialPersisted = (update ? mode.spell.hotkey : null)
  → HotkeyCaptureField fires onChange(initialPersisted) once so #hotkey reflects the persisted value

User clicks Hotkey button
  → field enters capture phase, button label → "Save"
  → keydown listener bound on field container
  → bare lowercase letter pressed → append to buffer (max 2)
  → Backspace → remove last letter
  → Tab / focus loss → cancel (field returns to { phase: 'default', persisted: previous })
  → Enter / Save click → validator(buffer, selfPath, directory)
        → ok       → onChange(hotkey); field returns to { phase: 'default', persisted: hotkey }
        → !ok      → field stays in capture; chip recolours red; error text rendered below button

User clicks × on persisted chip (default phase, update mode only)
  → eraser(selfPath) → app.fileManager.processFrontMatter(file, fm => delete fm['grimoire-hotkey'])
  → on resolve: field state → { phase: 'default', persisted: null }; onChange(null)
  → on reject: keep persisted; surface error below the button (uses same error slot)

User clicks × in capture phase
  → cancel: field state → { phase: 'default', persisted: previous }
  → no onChange (snapshot already holds `previous`)

User submits the Forge form (existing path)
  → #snapshotCreate / #snapshotUpdate reads #hotkey (now updated via onChange) and emits unchanged Hotkey | null
```

## Error handling

- **Pattern violation at commit** (`""`, `"X"`, `"123"`, `"abc"`, `"a1"`, etc.): inline error "One or two lowercase letters only." Chip recoloured red.
- **Reserved-Forge** (`"f"`): inline error "Reserved for Forge." Chip red.
- **Reserved-Refine** (`"r"`): inline error "Reserved for Refine." Chip red.
- **Collision with another spell**: inline error "Hotkey already used by *<spell name>*." Chip red. Spell name resolved from the directory entry whose value equals the candidate.
- **Eraser failure** (file not found, write error): inline error "Could not clear hotkey." Persisted chip retained. The error slot is shared with commit errors; the field reuses it.
- **Self-match in update mode**: not an error. Saving the same letter the spell already has resolves as `ok` — `onChange(samevalue)` is a no-op for the snapshot, and the field returns to default-with-persisted.
- **Non-letter keydown in capture phase** (digit, symbol, Shift, Ctrl, function key): silently ignored. No error text. The capture state remains open.

## Technical notes

- **Storage layer untouched.** `HOTKEY_FRONTMATTER_KEY`, `parseHotkey`, `Hotkey` brand, `SENTINEL_HOTKEYS`, sentinel-first registry resolution, plugin-load Notice — all stay. Validation reuses `parseHotkey` for the pattern check.
- **Snapshot type untouched.** `ForgeFormSnapshot.hotkey` and `ForgeUpdateFormSnapshot.hotkey` keep `Hotkey | null`. Meta-spell prompts and frontmatter writes are unaffected.
- **Erase is a side effect outside the snapshot pipeline.** The pitch is explicit that `×` on a persisted chip should erase immediately, decoupled from the form submission. This means the Cast Log is **not** updated for the erase action (consistent with how frontmatter hand-edits are also invisible to the log). Documented above and surfaced in the live-spec at `/spec` time.
- **Directory snapshot at dialog open.** Mid-session vault changes (another window adding a colliding hotkey) are not reflected. Justified by half-day appetite and the existing load-time Notice backstop.
- **No new `KeyboardController` bindings.** Field uses DOM `keydown` on its own container. Prevents leakage into the popup scope after `kb.resume()`.
- **Pattern decisions (`design-patterns` Step 1):**
  - **State pattern (FieldState union):** *accepted* — three distinct phases with different DOM and key handling; a `phase` switch is the natural representation. Inline `switch (state.phase)` in `render()`; no class hierarchy.
  - **Strategy for the validator:** *rejected* — only one validation algorithm exists; a function is sufficient. (YAGNI; would resurrect if a second meta-spell needed different rules.)
  - **Template Method base for capture fields:** *rejected* — single use site; trivial duplication if a second field appears.
  - **Observer/Emitter from the field outward:** *rejected* — a single `onChange` callback covers all parent needs. No need for `TypedEmitter` here.
  - **Snapshot pattern for `HotkeyDirectory`:** *accepted* — opening the dialog takes a snapshot; field uses it for the dialog's lifetime; no live binding to vault state. Matches `spell-hotkeys`' "build registry once" decision.
- **Design-rubric self-critique highlights (Section 7):**
  - *SRP per component?* Yes. Validator: rules only. Directory: snapshot only. Field: UI + state machine. Detail panel: form composition. Router: wiring.
  - *Dependency direction?* `HotkeyCaptureField` depends on the validator function (imported) and the directory interface (typed) and an eraser (callback) — no DOM-less component depends on the field. Reversal-safe.
  - *Testability?* All four new units (validator, directory, field, eraser-callback) are independently testable: validator and directory in the node env, field via happy-dom integration tests, eraser via a mocked `fileManager.processFrontMatter`.
  - *Open/Closed?* Adding a new validation rule (e.g. "max 10 spell-bound hotkeys per vault") is a one-line addition inside the validator function, no other file changes. The `HotkeyCommitResult.reason` union is `'pattern' | 'reserved-forge' | 'reserved-refine' | 'collision'`; growing it would require updating the inline-error mapping in the field — acceptable for a 4-state enum.
  - *Liskov violations?* None — no inheritance introduced.
  - *Interface segregation?* `HotkeyDirectory` exposes one method (`inUse`). `HotkeyEraser` is a single-callable. `HotkeyCaptureField` exposes `render` + `destroy`. None forces callers to depend on methods they don't use.
  - *DI hygiene?* All dependencies passed as constructor / render params; no `app.fileManager` reference inside the field.
  - *God-class risk?* `ForgeSentinelDetail` already at ~257 lines; this iteration removes ~16 lines (`#buildHotkeyField` body) and adds ~5 (a mount call + a `HotkeyCaptureField` field) — net contraction. New file `HotkeyCaptureField.ts` is the focused home for the new behaviour.

## Todos

### A. Pure validator + directory (no DOM, no I/O)

#### Section briefing

**What this section produces.** Two new files under `src/forge/`:
- `HotkeyDirectory.ts` exports the `HotkeyDirectory` interface and `buildHotkeyDirectory(spells)` constructor (see Interfaces).
- `hotkeyCommitValidator.ts` exports `HotkeyCommitResult` and `validateHotkeyCommit(candidate, selfPath, directory)` (see Interfaces).

Both consumed first by their own unit tests, later by `HotkeyCaptureField` (Section D).

**Design context the executor needs upfront.** From Technical notes: *Validation reuses `parseHotkey` for the pattern check.* From Components: *Built at popup-open from the same `Spell[]` that `HotkeyRegistry.build` consumes — cheap O(n).* From Error handling: rejection reasons are `'pattern' | 'reserved-forge' | 'reserved-refine' | 'collision'`; the spell name for a collision is the name of the directory entry whose value equals the candidate. Validator must exclude `selfPath` from the collision check so re-saving a spell's own existing hotkey is `ok`.

**Cross-section couplings.** None within this section; A1 and A2 are independent of each other and of all other sections. A1 is consumed by B1 (popup wiring) and D2 (field validator call). A2 is consumed by B1 (popup wiring) and D2 (field validator call).

**Section-level Red criterion.** Vitest unit tests in `tests/forge/HotkeyDirectory.spec.ts` and `tests/forge/hotkeyCommitValidator.spec.ts` pass. Coverage includes: empty spell list yields empty map; non-null hotkeys are mapped by path; `selfPath` excludes the editing spell from collision; pattern rejection for empty / uppercase / digit / 3-letter / symbol; both reserved letters rejected with their distinct reasons; collision returns the colliding spell's name verbatim from the directory.

**junior-dev**

- [ ] A1: Create `src/forge/HotkeyDirectory.ts` exporting `HotkeyDirectory` interface and `buildHotkeyDirectory(spells: readonly Spell[]): HotkeyDirectory` per Interfaces. Add `tests/forge/HotkeyDirectory.spec.ts` covering: (a) empty list → empty `inUse()` map, (b) spells with `hotkey: null` excluded, (c) spells with non-null `hotkey` mapped by `path`, (d) `inUse()` returns the same `Map` instance across calls (snapshot, not lazy). — S, junior-dev
- [ ] A2: Create `src/forge/hotkeyCommitValidator.ts` exporting `HotkeyCommitResult` (per Interfaces) and `validateHotkeyCommit(candidate, selfPath, directory)`. Implementation: call `parseHotkey(candidate)` → null → `{ ok: false, reason: 'pattern' }`. Then check `candidate === 'f'` → `reserved-forge`, `candidate === 'r'` → `reserved-refine`. Then iterate `directory.inUse()` looking for an entry where value === candidate and key !== selfPath; if found, return `{ ok: false, reason: 'collision', collidingSpellName: <derive from spells> }`. Note: directory only exposes path→hotkey; the spell *name* is not in the directory. **Resolve this:** extend `HotkeyDirectory` to also expose `nameOf(path: SpellPath): string`. Add to A1's interface and builder accordingly (small back-edit). Update A1's tests to cover `nameOf` lookup. Add `tests/forge/hotkeyCommitValidator.spec.ts` covering: pattern rejections (`""`, `"A"`, `"1"`, `"ab1"`, `"abc"`, `"a-"`), `reserved-forge` for `"f"`, `reserved-refine` for `"r"`, collision happy path with `collidingSpellName` correctly populated, self-match returns `ok` when `selfPath` matches the colliding entry's path, valid two-letter accept (`"go"`). — M, junior-dev

### B. Wire `HotkeyDirectory` into popup lifecycle

#### Section briefing

**What this section produces.** Mutations to `src/ui/CommandPopup.ts`, `src/ui/popup/DetailPanelRouter.ts`, `src/ui/popup/CommandPopupBuilder.ts` that thread a `HotkeyDirectory` snapshot built at popup open into the detail-render path; and a `HotkeyEraser` callback constructed once at builder layer. No new files. Field interface from Interfaces applies: `DetailPanelRouterDeps` gains `hotkeyDirectoryFactory` and `hotkeyEraser`; `ForgeSentinelDetailParams` gains a `hotkey: { directory, eraser }` group.

**Design context the executor needs upfront.** From Data flow: *buildHotkeyDirectory(spells) — same input list, cheap O(n) — store directory on popup for the open lifecycle.* The same `spells` argument that `#buildHotkeyCapture(spells)` already receives is reused here. From Technical notes: *Directory snapshot at dialog open. Mid-session vault changes are not reflected.* The factory returns the popup-lifetime snapshot; each detail render gets the same snapshot. From Components: the eraser is constructed in `CommandPopupBuilder` using `app.fileManager.processFrontMatter(file, fm => delete fm['grimoire-hotkey'])`. `file` is obtained via `app.vault.getAbstractFileByPath(spellPath)` with an `instanceof TFile` guard.

**Cross-section couplings.** B1 depends on A1, A2 (imports both). B1 is consumed by D5 (`ForgeSentinelDetail` receives `hotkey` group via the router). B2 produces the `HotkeyEraser` used by D3 (the field's `×`-on-persisted-chip click path); B2 must use `app.fileManager.processFrontMatter` rather than the lower-level adapter — relies on C1 having extended the mock first for the integration tests. C1 must land before B2's tests are written.

**Section-level Red criterion.** New / updated unit tests assert: (a) `CommandPopup.onOpen()` constructs a `HotkeyDirectory` from the scanned spells exactly once per open; (b) `DetailPanelRouter.renderForge` and `renderForgeUpdate` pass the directory through to `ForgeSentinelDetail.render` (verified via spy on the detail constructor or render params); (c) `CommandPopupBuilder` constructs an eraser that, when called with a SpellPath, looks up the file via `app.vault.getAbstractFileByPath` and calls `app.fileManager.processFrontMatter` with a function that deletes the `grimoire-hotkey` key. Existing integration tests for the detail panel keep passing (eraser/directory are passed but unused by the unchanged forms in this section).

**junior-dev**

- [ ] B1: Add `hotkeyDirectoryFactory: () => HotkeyDirectory` and `hotkeyEraser: HotkeyEraser` to `DetailPanelRouterDeps` in `src/ui/popup/DetailPanelRouter.ts`. In both `renderForge` and `renderForgeUpdate`, call `this.#deps.hotkeyDirectoryFactory()` once and pass `{ directory, eraser: this.#deps.hotkeyEraser }` into `detail.render({ ..., hotkey: { directory, eraser } })`. Update `ForgeSentinelDetailParams` in `src/ui/components/ForgeSentinelDetail.ts` to declare the new `hotkey` group (mark optional during this transitional commit so existing tests compile, until Section D removes the optional marker). Existing tests must keep passing. — M, junior-dev
- [ ] B2: In `src/ui/CommandPopup.ts`, build the `HotkeyDirectory` snapshot at popup-open time from the same `spells` consumed by `#buildHotkeyCapture(spells)`; store it on a private field. Add a `hotkeyDirectoryFactory: () => this.#hotkeyDirectory` to the `DetailPanelRouter` deps wired in `#buildRouter`. In `src/ui/popup/CommandPopupBuilder.ts`, construct `hotkeyEraser: (path) => { const file = this.#deps.app.vault.getAbstractFileByPath(path); if (!(file instanceof TFile)) return Promise.reject(new Error('spell file not found')); return this.#deps.app.fileManager.processFrontMatter(file, fm => { delete fm['grimoire-hotkey']; }); }` and pass it through to `CommandPopup` via a new constructor param `hotkeyEraser: HotkeyEraser`, which the popup then passes into the router deps. Add a constant `HOTKEY_FRONTMATTER_KEY` import from `src/domain/spells/Hotkey.ts` and use it instead of the string literal. — M, junior-dev

### C. Mock harness extension

#### Section briefing

**What this section produces.** Mutations to `tests/__mocks__/obsidian.ts` so integration tests under `tests/integration/` can exercise the eraser. Adds `App.fileManager` with a `processFrontMatter` method, and a `__filesByPath` map plus `__registerFile(file: TFile)` helper so tests can register a file that the mocked `getAbstractFileByPath` and `processFrontMatter` can find. The mocked `processFrontMatter` invokes the callback against a stored `frontmatter` object on the registered file shim, mutating it in place.

**Design context the executor needs upfront.** From Technical notes: tests for the eraser must verify the `delete fm['grimoire-hotkey']` mutation. The mock is a behavioural double, not a real frontmatter parser — it stores frontmatter as an in-memory object on the registered file and exposes it via `getAbstractFileByPath`. From Components: `app.vault.getAbstractFileByPath` doesn't exist on the current mock either; this section adds it alongside `__filesByPath`.

**Cross-section couplings.** C1 is a precondition for the eraser-touching tests in B2 and the integration tests in D. Land C1 first.

**Section-level Red criterion.** A small smoke test (`tests/__mocks__/obsidian-fileManager.spec.ts`) demonstrates: registering a file with frontmatter `{ 'grimoire-hotkey': 'g' }`, calling `app.fileManager.processFrontMatter(file, fm => delete fm['grimoire-hotkey'])`, then reading `file.frontmatter` shows the key removed. `app.vault.getAbstractFileByPath('spells/x.md')` returns the registered `TFile` instance; unregistered paths return `null`.

**junior-dev**

- [ ] C1: Extend `tests/__mocks__/obsidian.ts`. Add `class FileManager { processFrontMatter = vi.fn(async (file, fn) => { fn(file.frontmatter ??= {}); }); }`. Add `fileManager = new FileManager()` to `App`. Add `private __filesByPath = new Map<string, TFile>()` and a `__registerFile(file: TFile)` helper on `App` that sets the file into the map and exposes a `frontmatter` field initialised to `{}`. Add `getAbstractFileByPath = vi.fn((p: string) => this.__filesByPath.get(p) ?? null)` to `App.vault`. Add `tests/__mocks__/obsidian-fileManager.spec.ts` verifying the smoke flow described in the Red criterion. — S, junior-dev

### D. UI integration tests for `HotkeyCaptureField` and Forge dialog wiring

#### Section briefing

**What this section produces.** A new component `src/ui/components/HotkeyCaptureField.ts` and an integration suite that exercises it from outside in both create and update flows. The Section D tester group defines the Red criterion; the senior-dev group implements `HotkeyCaptureField` and rewires `ForgeSentinelDetail` to mount it.

**Design context the executor needs upfront.** From Proposed solution: *`FieldState` is the union `{ phase: 'default'; persisted: Hotkey | null } | { phase: 'capture'; buffer: string; previous: Hotkey | null; error: string | null }`. Transitions are deterministic.* From Critical concerns: *`Enter` ambiguity — when in capture phase the field must `preventDefault()` + `stopPropagation()` on Enter; outside capture phase, Enter propagates so the form-level submit handler runs.* From Critical concerns: *Field binds via plain DOM `addEventListener('keydown', …)` on its own container element, never via `KeyboardController`.* From Critical concerns: *On mount, fire `onChange(initialPersisted)` once so the parent's `#hotkey` reflects the persisted value without the user touching the field.* From Critical concerns: *Capture exit on focus loss — if focus leaves the field container, treat as `×` cancel (no persist).* From Error handling: chip recolours red on rejection; inline error text below the button names the violated rule with the exact copy variants from the pitch ("One or two lowercase letters only.", "Reserved for Forge.", "Reserved for Refine.", "Hotkey already used by *<spell name>*.", "Could not clear hotkey.").

**Cross-section couplings.** D0 (the tester group) depends on A1, A2, C1 having landed. D1-D6 (senior-dev) depend on D0's red criterion being established. D5 (rewire `ForgeSentinelDetail`) drops the optional marker added to `ForgeSentinelDetailParams.hotkey` in B1 and removes the legacy `#buildHotkeyField` body — touches the snapshot construction lines that still call `parseHotkey(this.#hotkey)`; those lines keep their shape (the parent still owns `#hotkey: Hotkey | null` now, no parse needed because the field emits a validated `Hotkey | null`). D6 (eraser failure UX) depends on C1's mock supporting a rejected `processFrontMatter` call.

**Section-level Red criterion.** New integration spec `tests/integration/forge-hotkey-capture.spec.ts` covers, mounted via the existing happy-dom harness, every state-machine transition listed in the pitch:

1. Default state with no persisted hotkey: only a button labelled "Hotkey", no chip, no `×`.
2. Default state with persisted hotkey (update mode): chip preceding the button, `×` to the right of the chip, button labelled "Hotkey".
3. Click button → capture state: button label changes to "Save", capture chip appears.
4. Bare lowercase letter keystroke → buffer chip updates with the letter; second letter extends to two; third letter is ignored or replaces per the pitch (`pitch silent on this — implement: ignore 3rd; document inline in component`).
5. Backspace removes the last letter from the buffer.
6. `Enter` while capture state owns focus → commit → if valid, return to default with new persisted; the form's submit handler does NOT fire.
7. Click `Save` → same as Enter.
8. Click `×` during capture → cancel (no onChange persist; previous chip restored).
9. Click `×` on persisted chip in update mode → eraser callback invoked with `selfPath`; on success chip vanishes; `onChange(null)` fired.
10. Invalid commit: pattern (e.g. `""`), reserved-forge (`"f"`), reserved-refine (`"r"`), collision (a configured directory entry). Chip recolours red; error text matches the pitch copy exactly; field stays in capture state.
11. Self-save in update mode (committing the spell's own existing hotkey) → `ok`; `onChange` invoked with the same `Hotkey`; chip returns to default-persisted styling.
12. Tab away from the field → cancel as in case 8.
13. Auto-focus rabbit hole: opening the Forge dialog never sends `document.activeElement` to the Hotkey button or chip; it stays on the name input (create) or unfocused (update — matches today's behaviour).
14. Snapshot integrity: submitting the form after a successful field commit yields a snapshot whose `hotkey` matches the captured value; submitting without touching the field in update mode yields a snapshot whose `hotkey` matches `mode.spell.hotkey` verbatim.
15. Wiring in update mode: the eraser passed into `ForgeSentinelDetail` is the one received from `DetailPanelRouterDeps.hotkeyEraser`. Verified via a spy.

**ui-integration-tester**

- [ ] D0: Write `tests/integration/forge-hotkey-capture.spec.ts` covering the 15 cases above. Mount `ForgeSentinelDetail` (or `HotkeyCaptureField` directly where the seam is the field itself, per ui-test-rubric guidance — but D0's primary surface is the dialog wiring) using the existing harness pattern from `tests/integration/forge-sentinel-detail.spec.ts` and `forge-sentinel-detail-update.spec.ts`. Construct an in-memory `HotkeyDirectory` test double via `buildHotkeyDirectory([...])`. Use `app.__registerFile` to register the editing spell's file with `frontmatter: { 'grimoire-hotkey': 'g' }` for the eraser path. Assertions exercise the listed transitions, the rejection copy verbatim, the focus rabbit hole, the snapshot integrity contract, and the eraser-callback identity check (the spy approach is fine). Tests should fail until D1–D6 land. — L, ui-integration-tester

**senior-dev**

- [ ] D1: Create `src/ui/components/HotkeyCaptureField.ts` implementing the surface in Interfaces. State held internally as the `FieldState` union from Technical notes; rendering is a `switch (state.phase)` that rebuilds the field's container. On mount: render initial DOM, fire `onChange(initialPersisted)` once, attach a single `keydown` listener on the container, and attach a `focusout` listener that fires the cancel transition when `event.relatedTarget` is outside the container. Capture-phase keystroke rules: bare letter `[a-z]` (no Shift, no Ctrl/Meta) → append (cap at 2 letters; third keystroke ignored — comment inline citing the pitch's silence and the choice); `Backspace` → drop last letter; `Enter` → commit (and `preventDefault()` + `stopPropagation()`); other keys → ignore. The component owns no `KeyboardController` instance. — L, senior-dev
- [ ] D2: Wire commit validation in `HotkeyCaptureField`: on Enter / Save click, call `validateHotkeyCommit(buffer, selfPath, directory)`. On `ok`: call `onChange(result.hotkey)`, transition to `{ phase: 'default', persisted: result.hotkey }`. On `!ok`: keep `phase: 'capture'`, set `state.error` to the inline copy mapped from `result.reason` (with `collidingSpellName` interpolation for `'collision'`), recolour chip red. Map the four reasons to the exact pitch strings; centralise the mapping in a small `errorCopyFor(reason, collidingSpellName?)` function exported alongside the component for test access. — M, senior-dev (depends on D1)
- [ ] D3: Wire `×` handlers in `HotkeyCaptureField`: in `phase: 'capture'`, `×` click → transition to `{ phase: 'default', persisted: previous }` (no `onChange`; parent's `#hotkey` already reflects `previous`). In `phase: 'default'` with `persisted !== null`, `×` click → call `await eraser(selfPath)`; on resolve: transition to `{ phase: 'default', persisted: null }` + `onChange(null)`; on reject: keep persisted, render error "Could not clear hotkey." inline below the button (reuse the error slot). Note in inline comment that `eraser` is invoked only in update mode (the field never renders the persisted-chip `×` when `selfPath === null` because there is no persisted value to erase). — M, senior-dev (depends on D1)
- [ ] D4: Render chip styling in `HotkeyCaptureField`: monospace + accent (`var(--interactive-accent)`) for persisted and capture-normal states; muted red (`var(--text-error)`) for rejected. Reuse `.spell-hotkey-badge` styling cues but introduce distinct class names (`.grimoire-hotkey-chip`, `.grimoire-hotkey-chip.is-error`, `.grimoire-hotkey-button`, `.grimoire-hotkey-clear`) so the existing row-badge styles aren't perturbed. Append the new selectors to `styles.css`. Verify no animation (pitch rabbit hole). — S, senior-dev
- [ ] D5: Rewire `ForgeSentinelDetail` to mount `HotkeyCaptureField` in `#buildHotkeyField` instead of the plain `<input>`. Remove the in-place lowercase filter and `maxLength=2` hack. `ForgeSentinelDetailParams.hotkey` becomes required (drop the optional marker added in B1). Adapt `#hotkey` field type to `Hotkey | null`; remove the `parseHotkey(this.#hotkey)` calls in `#snapshotCreate` / `#snapshotUpdate` (the field already emits a validated `Hotkey | null` via `onChange`). Update the field's `destroy()` call inside `ForgeSentinelDetail.destroy()` so the keydown listener is detached. Verify existing tests in `forge-sentinel-detail.spec.ts` and `forge-sentinel-detail-update.spec.ts` still pass (snapshot shape unchanged) — adjust only the few tests that reach into the now-removed plain text input. — M, senior-dev (depends on D1, D2, D3)
- [ ] D6: Cover the eraser-failure path in the integration suite by configuring the mocked `processFrontMatter` to reject once. Assert: chip stays persisted; error text "Could not clear hotkey." appears below the button; subsequent successful `×` click clears as normal. Add as an additional case inside `forge-hotkey-capture.spec.ts`. — S, senior-dev (depends on D3, C1)

### E. Documentation and live-spec follow-up

#### Section briefing

**What this section produces.** A note in this plan's file mentioning that `/spec` after `/done` will need to extend `docs/features/spell-hotkeys.md` (and possibly `forge-cast.md` / `forge-spell-update.md`) to describe the new authoring surface. No code changes — purely a hand-off marker for the documenter agent. This section is a single todo and exists so the orchestrator does not skip the documenter dispatch at `/done` time.

**Design context the executor needs upfront.** From `spell-hotkeys.md`: the existing live-spec describes the *plain text input* on the Forge dialog. After this iteration ships, that paragraph is stale. The feature-documenter at `/spec` time will see the squashed commit and decide whether to patch `spell-hotkeys.md` directly or grow a new feature doc. This todo is just a reminder, not a code change.

**Cross-section couplings.** None.

**Section-level Red criterion.** This is a no-code marker todo. "Done" means the todo is ticked off after the orchestrator confirms `/spec` was run post-`/done` and the docs-writer has reviewed the impacted files. There is no automated assertion.

**junior-dev**

- [ ] E1: After `/done` and `/spec`, verify `docs/features/spell-hotkeys.md`'s paragraph beginning "The Forge dialog (both create and update modes) grows an optional **Hotkey** input that snaps every keystroke…" has been replaced (by the feature-documenter) with a description of the new button-driven capture surface, including the persisted-chip `×` erase path and the four rejection reasons. No file edits expected from this todo directly. — S, junior-dev

## Effort summary

- **S:** 5 (A1, C1, D4, D6, E1)
- **M:** 5 (A2, B1, B2, D2, D3, D5) — *count: 6, recount:* A2, B1, B2, D2, D3, D5 = 6 M
- **L:** 2 (D0, D1)

Corrected totals: **S: 5, M: 6, L: 2** (13 todos).

Dev-tier mix:
- **junior-dev:** 6 (A1, A2, B1, B2, C1, E1)
- **senior-dev:** 6 (D1, D2, D3, D4, D5, D6)
- **ui-integration-tester:** 1 (D0)
- **lead-dev:** 0

Senior-dev concentration is in Section D (the new component and its dialog rewire), which is the only place real design judgment lives in this iteration. Everything else is mechanical wiring or pure-function rule encoding.
