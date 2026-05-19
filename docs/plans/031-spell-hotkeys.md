# Spell hotkeys

> Source pitch: `brain/Grimoire - Spell hotkeys.md`. Complexity: Complex (`--deep`). Touches frontmatter parsing, the Forge dialog (create + update), the spell-row chrome, the popup keyboard pipeline, the tab-bar chrome, and Escape semantics. Three days of appetite per the pitch.

## Goal & scope

### What

Add one- or two-letter Shift-prefixed hotkeys that jump the popup's selection to a specific spell or sentinel row in the Spells tab during the search phase.

- Two sentinels carry **mandatory hard-coded defaults**: Forge → `f`, Refine → `r`.
- User-authored spells declare a hotkey in frontmatter (`grimoire-hotkey: g` / `grimoire-hotkey: go`).
- The Forge dialog (both create and update modes) exposes a hotkey field so authors set it without editing frontmatter.
- Each hotkeyed row renders a small badge near the name.
- A hotkey **buffer** captures Shift+letter presses, evaluates against a registered-hotkey set, and either fires (focus the row), waits for a second letter (prefix of a two-letter hotkey), or shows an error tint.
- The tab-bar's right corner alternates between a quiet hint (`Shift + letter for hotkeys`) when the buffer is empty and a buffer indicator (buffered letters + `×` clear button) when the buffer has content.
- Reset gestures: Escape (empty-buffer case keeps current popup Escape semantics), `×` click, Up/Down arrows. Implicit resets: Tab to Logs, popup close, successful fire.

Out:
- Cast Log hotkeys (no row-level keyboard navigation there yet).
- Multi-character hotkeys > 2 letters; uppercase/digits/symbols.
- Settings-level hotkey reassignment, sentinel customisation, modifier alternatives (Ctrl/Cmd/Alt).
- Auto-suggested hotkeys for new spells.
- Live collision warnings in the dialog. (Runtime resolution is sentinels-first, scan-order next, with a `Notice` on collision at plugin load.)
- Persistent buffer across popup open/close cycles.
- A user-customisable Settings preference for the hint, the modifier, the lowercase rule, or buffer mechanics.
- A row-level hotkey badge for rows without a hotkey.

### Why

A power user navigates the spell picker dozens of times per day. Fuzzy search is fine for occasional access; single-keypress launches make the daily handful (`f` for Forge, `r` for Refine, `g` for one's daily Generate spell) feel instant. The asymmetry between hotkeyed and unhotkeyed rows itself becomes a signal: muscle memory accumulates around the few rows the user actually elevates.

## Proposed solution

A new domain primitive (`Hotkey`, validated as `^[a-z]{1,2}$`) flows end-to-end:

1. **Source.** Sentinels carry compile-time constants (`SENTINEL_HOTKEYS = { forge: 'f', refine: 'r' }`). User-authored spells carry an optional `grimoire-hotkey` frontmatter string read by the scanner.
2. **Registry.** A pure `HotkeyRegistry` is built once on popup open from the in-memory `Spell[]` + sentinel list. It applies the deterministic resolution rule (sentinels first, then vault spells in scan order), drops collisions, and emits a single `Notice` listing the dropped entries. The registry exposes `lookup(buffer: string): RegistryHit` returning `'exact' | 'prefix' | 'miss'` plus the resolved target.
3. **Buffer model.** A pure `HotkeyBuffer` state machine, separate from any DOM, encodes the empty/one/two-letter transitions described in the pitch (`append`, `replaceOnOverflow`, `clear`). It has no opinion on Shift — the popup decides which keys to feed it.
4. **Capture layer.** Within the Spells tab + search phase, a `HotkeyCapture` component owns the Shift+letter bindings. It feeds the buffer, asks the registry to evaluate, and emits one of three outcomes: fire (focus the row index, then clear), waiting (re-render indicator in accent), error (re-render indicator in error). It also subscribes to "reset triggers" (Escape if buffer non-empty, `×` click, ArrowUp/ArrowDown) and to "implicit reset" lifecycle events (Tab switch, popup close, after fire).
5. **Chrome.** The Spell Picker grows a `.spell-hotkey-badge` element in the name block; the tab bar grows a `.hotkey-hint-slot` rendered into its right corner. The slot is a `HotkeyHintSlot` widget owned by `CommandPopup`, swapping between hint text and buffer-indicator content based on `HotkeyBuffer` state and active tab.
6. **Forge dialog field.** `ForgeSentinelDetail` gains an optional `hotkey` input with the validation regex enforced inline (rejected input snaps back to empty); both create and update snapshots learn a `hotkey` field. The forge meta-spell's system+user prompts teach the LLM to emit `grimoire-hotkey: <value>` when present; `ForgeUpdateImprinter` follows the same pattern.

The capture layer is a single object that subscribes to phase + tab transitions; the registry is rebuilt only when the popup is opened. The buffer is plain data, fully testable without DOM. The chrome is purely a render of buffer + registry state.

## Multi-perspective synthesis

Four perspectives were considered (minimalist, extensibility, devil's advocate, user advocate). Summary:

### Consensus

- **Hotkey is a small typed primitive, not a string.** All perspectives agree: validation belongs in one place (`Hotkey.parse`) and the rest of the system consumes a non-null `Hotkey` or skips. This collapses the lowercase/length/charset rule to a single check used by frontmatter reads, Forge dialog input, registry construction, and badge render.
- **Buffer is plain data, capture is DOM-bound.** Separating the state machine from key handling means the pitch's replace-on-overflow rule, the prefix-of-two-letter rule, and the error/normal evaluation can be unit-tested without happy-dom or Obsidian.
- **Collisions resolve at registry build, never live.** The user advocate, devil's advocate, and minimalist agree: live collision detection in the dialog is overhead for a soft rule. Sentinels-first + scan-order + load-time Notice is sufficient and deterministic. (Pitch concurs explicitly.)
- **No Shift modifier rendered anywhere.** Pitch convention is non-negotiable; perspectives concur the letter alone is the visual element.

### Tensions

- **Extensibility wanted** an action-pipeline (`Action[]` with priority + modifier registration) so future Ctrl-prefixed actions slot in cleanly. **Minimalist** rejected — no second use case exists. Resolution: shape `HotkeyCapture` as one component with a clear seam (`feed(letter: string)`) so a future Ctrl variant is a sibling, not a rewrite. We do **not** invent a registration framework or a `Modifier → Action` map.
- **User advocate** worried the buffer's "replace on overflow" rule is surprising — typing `xy` when neither is registered should arguably blank the buffer faster. **Devil's advocate** countered: surprise is one keystroke from recovery (Escape, arrows, or any matching Shift+letter), and the pitch's rule is explicit. Resolution: implement the pitch literally and rely on the error-tint to signal "this isn't matching."
- **Devil's advocate** raised: holding Shift while typing `fo` then releasing Shift mid-word leaves the buffer at `f` until another Shift+letter or reset; subsequent unmodified `o` flows to search. The pitch states this explicitly — implement as written. Tests must cover this exact interleaving.
- **Extensibility** asked whether `HotkeyRegistry` should be persistent across popup opens (so the load-time `Notice` doesn't re-fire each open). Resolution: yes — rebuilding on every open would surface the Notice repeatedly during a single session for every collision. Build once on plugin `onload` (or first popup open), expose `rebuild()` for vault-modify events. Pitch says "surface the collision on plugin load," so plugin-load is the explicit trigger.
- **User advocate** asked: when a user types Shift+`f` and a one-letter `f` is registered (Forge), does it fire instantly or wait to see if `fo` follows? The pitch is explicit: exact match fires immediately. A two-letter hotkey starting with `f` cannot register if `f` is taken — the registry guarantees prefix-disjointness, so there is never a wait/fire ambiguity at the buffer-evaluation step.

### Critical concerns

- **Capture must not leak Shift into the search input.** Today the search input captures `oninput`, and `KeyboardController` bindings on `Modal.scope` run before the DOM input event. The capture binding must `preventDefault` (which `KeyboardController.bind` already does on `return true` from handler) — but only when on the Spells tab in search phase. On Logs, on detail phases, the capture is uninstalled.
- **Detail phase must not capture Shift.** `CommandPopup.#enterDetail` already calls `kb.suspend()`. The hotkey capture is owned by the popup keyboard scope, so suspend tears down its bindings too. On `kb.resume()` after exitDetail, the bindings come back — and the buffer is cleared (implicit reset on detail entry).
- **Two-letter hotkey starting with a one-letter winner blocks registration, but not the other way around.** If `f` is reserved by Forge sentinel and a user spell declares `fo`, the spell's hotkey is dropped at registry build. Conversely, if a user spell registers `fo` first and another spell tries `f`, the second is dropped — but sentinels register first, so `f` always wins for Forge. The collision Notice names every dropped entry.
- **Re-rendering the hint vs. buffer indicator must not interfere with tab clicks.** The slot is rendered into the tab bar, not the search input area; tab-click handlers are on `.modal-tab` elements and stay independent.
- **Forge dialog hotkey field must not break the existing keyboard navigation.** The input is a plain text input inside the form; Obsidian Scope's ArrowUp/Down bindings for the model select (`buildModelSelect`) are unaffected. The capture is off during detail phase.

### Recommended approach

Build the domain primitives (Hotkey, Registry, Buffer) first, fully unit-tested. Layer the capture component on the existing popup keyboard pipeline. Add the chrome (badge + hint slot) once the buffer state is observable. Wire the Forge dialog field last — it is the smallest piece and depends on nothing else. The Notice fires once at registry construction at popup open (debounced to once per registry-rebuild, which itself fires only on rescan).

## Components

| Component | Location | Responsibility |
|---|---|---|
| `Hotkey` (branded type + `parseHotkey`) | `src/domain/spells/Hotkey.ts` (new) | Validates one/two lowercase ASCII letters. Returns `Hotkey | null`. Single source of truth for the rule. |
| `HOTKEY_FRONTMATTER_KEY` constant | `src/domain/spells/Hotkey.ts` (new) | Exports `'grimoire-hotkey'`. Mirrors `EXECUTE_ON_NOTE_KEY`. |
| `SENTINEL_HOTKEYS` constant | `src/domain/spells/Hotkey.ts` (new) | `{ forge: parseHotkey('f')!, refine: parseHotkey('r')! }`. Compile-time defaults; pitch says sentinel hotkeys are not customisable. |
| `Spell.hotkey` field | `src/domain/spells/Spell.ts` (modified) | Optional `Hotkey | null` on the `Spell` interface. |
| `getSpells` frontmatter read | `src/infra/spellScanner.ts` (modified) | Reads `frontmatter[HOTKEY_FRONTMATTER_KEY]` through `parseHotkey`; ignores invalid values silently (no console noise). |
| `HotkeyRegistry` | `src/ui/popup/hotkey/HotkeyRegistry.ts` (new) | Builds a deterministic map from `Spell[] + Sentinel[]` to row-targets. Drops collisions (sentinels first, then scan order), exposes `lookup(buffer): RegistryHit`. Pure; no DOM, no Notice — collision report is returned data. |
| `HotkeyBuffer` | `src/ui/popup/hotkey/HotkeyBuffer.ts` (new) | Pure state machine: empty / one-letter / two-letter, with `append(letter)` implementing the replace-on-overflow rule and `clear()`. Emits an event each transition (via `TypedEmitter` reuse). |
| `HotkeyCapture` | `src/ui/popup/hotkey/HotkeyCapture.ts` (new) | DOM-bound. Owns Shift+letter bindings on a `KeyboardController`. Feeds `HotkeyBuffer`, consults `HotkeyRegistry`, dispatches three outcomes via callbacks (`onFire(rowIndex)`, `onWaiting`, `onError`). Installs/uninstalls on tab switch and phase transitions. |
| `HotkeyHintSlot` | `src/ui/components/HotkeyHintSlot.ts` (new) | Pure render. Given `(activeTab, bufferState, evaluation)`, paints either the muted hint (`Shift + letter for hotkeys`), or the buffer indicator (`<letters> ×`). Owns the `×` click handler that calls `onClear()`. |
| `SpellRow` badge | `src/ui/components/SpellRow.ts` (modified) | Renders `.spell-hotkey-badge` inside `.spells-row-name` when `spell.hotkey !== null`. Positioned to the left of the override dot. |
| `SentinelRow` badge | `src/ui/components/SentinelRow.ts` (modified) | Same badge for Forge and Refine sentinels (always present, since both carry mandatory defaults). |
| `TabBar` slot | `src/ui/components/TabBar.ts` (modified) | Grows a `.modal-tab-bar-right` container after the tab labels; takes an optional `slot: HTMLElement` parameter at render time. `CommandPopup` injects the `HotkeyHintSlot`'s element. |
| `CommandPopup` wiring | `src/ui/CommandPopup.ts` (modified) | Owns the `HotkeyRegistry`, `HotkeyBuffer`, `HotkeyCapture`, and `HotkeyHintSlot`. Wires arrow-key bindings to clear the buffer when non-empty. Re-installs capture on Spells tab + search phase entry; uninstalls on Logs tab / detail phase. |
| `SpellsPanel.focusByRowIndex` | `src/ui/tabs/SpellsPanel.ts` (modified) | New public method: given a global row index (spells [0..len) + sentinels [len..len+2)), update selection and scroll into view. Capture calls this on fire. |
| Collision `Notice` | `src/main/PopupModule.ts` (modified) | Builds the registry once at popup-module construction (deferred to first popup open is acceptable), fires one `new Notice('Hotkey collisions: <list>')` if any dropped entries. |
| `ForgeFormSnapshot.hotkey` + Forge field | `src/forge/ForgeFormSnapshot.ts`, `src/ui/components/ForgeSentinelDetail.ts` (modified) | Optional `hotkey: Hotkey | null`. The dialog input rejects non-matching values inline (typing snaps to lowercase, blocks non-letters, caps at length 2). |
| `ForgeUpdateFormSnapshot.hotkey` | `src/forge/ForgeUpdateFormSnapshot.ts` (modified) | Optional `hotkey: Hotkey | null`. Seeded from the existing spell's `spell.hotkey`. |
| Forge meta-spell prompts | `src/forge/buildForgeUserPrompt.ts`, `src/forge/buildForgeUpdateUserPrompt.ts`, `src/forge/forgeTemplate.ts`, `src/forge/forgeUpdateTemplate.ts` (modified) | Carry the hotkey value in the user prompt and instruct the LLM (system prompt) to write `${HOTKEY_FRONTMATTER_KEY}: <value>` when non-null. Best-effort, mirroring `grimoire-execute-on-note`. |
| Styles | `styles.css` + `src/main.css` (modified) | `.spell-hotkey-badge` (monospace, accent-tinted, padding 1–2px), `.modal-tab-bar-right` (flex push to right), `.hotkey-hint`, `.hotkey-buffer-indicator`, `.is-error` modifier (uses `--color-red` like cast-log-status-badge does). |

## Interfaces

### Domain

```ts
// src/domain/spells/Hotkey.ts
export type Hotkey = string & { __brand: 'Hotkey' };
export const HOTKEY_FRONTMATTER_KEY = 'grimoire-hotkey' as const;
export function parseHotkey(raw: unknown): Hotkey | null; // ^[a-z]{1,2}$ only
export const SENTINEL_HOTKEYS: { readonly forge: Hotkey; readonly refine: Hotkey };
```

### Registry

```ts
// src/ui/popup/hotkey/HotkeyRegistry.ts
export type RegistryTarget =
  | { kind: 'spell'; spell: Spell; rowIndex: number }     // index inside the unfiltered list
  | { kind: 'sentinel'; sentinel: Sentinel; rowIndex: number };

export type RegistryHit =
  | { state: 'exact'; target: RegistryTarget }
  | { state: 'prefix' }
  | { state: 'miss' };

export interface CollisionReport {
  readonly dropped: ReadonlyArray<{ hotkey: Hotkey; ownerName: string; reason: 'sentinel-takes-precedence' | 'first-spell-wins' | 'prefix-blocked' }>;
}

export class HotkeyRegistry {
  static build(spells: readonly Spell[], sentinels: readonly Sentinel[]): { registry: HotkeyRegistry; collisions: CollisionReport };
  lookup(buffer: string): RegistryHit;
  size(): number;
}
```

### Buffer

```ts
// src/ui/popup/hotkey/HotkeyBuffer.ts
export type BufferState = { letters: ''; status: 'empty' }
                       | { letters: string /* length 1 or 2 */; status: 'normal' | 'error' };

export class HotkeyBuffer {
  state(): BufferState;
  append(letter: string): void; // pitch's replace-on-overflow rule
  clear(): void;
  setEvaluation(status: 'normal' | 'error'): void; // capture flips this after lookup
  on(event: 'change', cb: (state: BufferState) => void): void;
}
```

### Capture

```ts
// src/ui/popup/hotkey/HotkeyCapture.ts
export interface HotkeyCaptureDeps {
  scope: Scope;                        // popup's keyboard scope
  buffer: HotkeyBuffer;
  registry: HotkeyRegistry;
  focusRow: (rowIndex: number) => void;
}

export class HotkeyCapture {
  install(): void;   // binds Shift+a..Shift+z on scope
  uninstall(): void; // unbinds
}
```

### Chrome

```ts
// src/ui/components/HotkeyHintSlot.ts
export interface HotkeyHintSlotDeps {
  container: HTMLElement;
  onClear: () => void;
}
export class HotkeyHintSlot {
  constructor(deps: HotkeyHintSlotDeps);
  renderHint(): void;                       // empty buffer state
  renderIndicator(letters: string, status: 'normal' | 'error'): void;
  hide(): void;                              // Logs tab / detail phase
}
```

### Forge form

```ts
// ForgeFormSnapshot / ForgeUpdateFormSnapshot — add:
readonly hotkey: Hotkey | null;
```

## Data flow

```
Plugin onload / popup open
        │
        ▼
spellScanner.getSpells(app, tag)        ── reads HOTKEY_FRONTMATTER_KEY through parseHotkey
        │
        ▼
HotkeyRegistry.build(spells, sentinels) ── sentinels-first, scan-order, prefix-disjoint
        │
        ▼
CollisionReport.dropped not empty?      ── new Notice('Hotkey collisions: …') (once)
        │
        ▼
CommandPopup constructor
        │
        ▼  Spells tab + search phase
HotkeyCapture.install() (Shift+a..z on Modal.scope)

Runtime — user presses Shift+f:
  KeyboardController dispatch → capture.feed('f')
        → HotkeyBuffer.append('f')        // empty → 'f'
        → registry.lookup('f')
            ├─ exact:  buffer.clear() (after fire),  spellsPanel.focusByRowIndex(target.rowIndex), hintSlot.renderHint()
            ├─ prefix: buffer.setEvaluation('normal'), hintSlot.renderIndicator('f', 'normal')
            └─ miss:   buffer.setEvaluation('error'),  hintSlot.renderIndicator('f', 'error')

Runtime — user presses ArrowDown while buffer non-empty:
  searchPhase.handleArrow(1) runs normally
  capture observes the same dispatch (sibling binding) → buffer.clear() → hintSlot.renderHint()

Runtime — user presses Escape while buffer non-empty:
  capture intercepts Escape → buffer.clear() → hintSlot.renderHint() → preventDefault (modal stays open)
  Otherwise Obsidian's default Escape closes the modal as today.

Runtime — user clicks × in indicator:
  hintSlot's onClear → buffer.clear() → hintSlot.renderHint()

Runtime — Tab to Logs:
  switchTab → capture.uninstall(), buffer.clear(), hintSlot.hide()
  switchTab back to Spells → capture.install(), hintSlot.renderHint()

Runtime — enter detail phase:
  kb.suspend() tears down all bindings (including capture's)
  buffer.clear(), hintSlot.hide()
  exitDetail → kb.resume() restores popup bindings; capture re-installs on Spells tab; hintSlot.renderHint()

Runtime — popup close:
  onClose → unmount; buffer/capture/hintSlot are garbage-collected with the modal

Authoring — Forge dialog:
  ForgeSentinelDetail's hotkey input → on input, snap to lowercase, drop non-letters, cap at length 2
  snapshot.hotkey = parseHotkey(input.value)  // null if empty
  ForgeImprinter → buildForgeUserPrompt includes hotkey;
    forge meta-spell instructs LLM to write `grimoire-hotkey: <hotkey>` when non-null
```

## Error handling

| Failure | Strategy |
|---|---|
| Frontmatter value is not a one/two lowercase-letter string (e.g. `G`, `g1`, `goose`, `true`, array) | Silently treated as no hotkey. No console noise, no Notice. The user sees no badge. |
| Two spells declare the same one-letter hotkey | Sentinels register first (so the sentinel pair `f`/`r` always wins). Among spells, the first-in-scan-order wins. The loser is reported in `CollisionReport`. |
| User spell declares `fo` while sentinel reserves `f` | `fo` is dropped — `f` blocks all two-letter hotkeys starting with `f`. Reported as `'prefix-blocked'`. |
| User spell declares `f` while another spell already reserves `fo` | Spell scan order decides — if `fo` registered first, `f` would be dropped (`'prefix-blocked'` going the other direction). Sentinels are immune (they register before any vault scan). |
| `CollisionReport.dropped` non-empty at popup open | One `Notice` listing every dropped entry: `Hotkey collisions: '<hotkey>' on '<ownerName>' (reason)`. Pitch's "renegotiate via frontmatter" implies the user reads the Notice and edits frontmatter. |
| Forge dialog user types `Goose` | The input filter snaps each keystroke to lowercase and caps at length 2 — the user sees `go` in the field. No error toast. |
| Forge dialog user types `1` | Non-letter input rejected silently — the input stays at its prior value (the `oninput` handler restores it). |
| Forge dialog `hotkey` empty at submit | `snapshot.hotkey = null`. The meta-spell's user prompt carries `null`, the system prompt's instruction is skipped, and the new spell file has no `grimoire-hotkey` frontmatter key. |
| Capture installed during search phase but user is in Logs tab | `HotkeyCapture` checks the popup's active tab on every keypress; on Logs, the handler returns `false` so Shift+letter falls through to the search input as today. (Or — preferred — capture is `uninstall`ed when Logs is active, so the binding isn't on `scope` at all.) |
| Capture active but user releases Shift mid-sequence | No issue — the buffer holds its state until another Shift+letter or a reset trigger. Plain `o` (no Shift) flows to search as today. |
| `focusRow(rowIndex)` called when the target row is filtered out by the search query | Behaviour decision (see Technical notes #6): clear the search query first (so the target row is visible), then focus. This is the only way "Shift+f to Forge while typing in search" stays usable. |
| Plugin-data corruption (e.g. invalid registry from third-party meddling) | Registry is rebuilt from `Spell[]`, which itself is rebuilt from frontmatter on every popup open — corruption is self-healing. No persistence layer. |

## Technical notes

1. **Hotkey is branded, not a type alias.** A `string & { __brand: 'Hotkey' }` brand means the only way to obtain a `Hotkey` is through `parseHotkey`. The compiler enforces "validated value" everywhere downstream.
2. **`HotkeyRegistry` is immutable; rebuild via `static build`.** The pitch says "sentinels register first, then vault spells in scan order, with a Notice on collision." We model this as a single pure build step, not mutation. Rebuilding (e.g. on a future "rescan vault" trigger) returns a new instance.
3. **Notice is fired once per build, at popup-module construction (deferred to first popup open is acceptable).** The pitch says "on plugin load." We interpret this as "once per registry build" — currently the registry is built lazily on popup open and reused. If a rescan trigger is added later, the Notice would re-fire — acceptable.
4. **The capture component owns Shift+a..Shift+z bindings only.** 26 bindings on `Modal.scope`. `KeyboardController` already supports modifier arrays. Reuse it. No special-casing of other letters (digits, symbols — pitch forbids them).
5. **Arrow keys clear the buffer.** The arrow bindings live in `SearchPhase`; we add a buffer-clear step at the start of `handleArrow`. Pitch: "Navigating the list with arrow keys (Up, Down) clears the buffer; the arrow performs its normal navigation in the same gesture." Both happen on the same keypress.
6. **`focusRow` clears the search query.** When the buffer fires and the target row is currently filtered out, the only sensible behaviour is to clear `#searchQuery`, re-render, then select. This satisfies "Shift+f to Forge always lands you on Forge, regardless of prior typing." We make this an explicit decision and add a test for it.
7. **Detail phase tears down the capture.** `kb.suspend()` already unbinds everything on `Modal.scope`. The capture's bindings go with them. On `kb.resume()`, we re-install — but the buffer is implicitly cleared on detail entry (pitch: "implicit resets — Tab switching to Logs, the popup closing, a successful fire — clear the buffer without ceremony" — detail entry is conceptually similar; the buffer is a search-phase artefact).
8. **Hint slot lives in `TabBar`, not in the search input area.** The TabBar grows a right-aligned container; `CommandPopup` injects the hint slot's element after constructing the TabBar. Toggling between Spells and Logs hides/shows the slot.
9. **`Modifier` array on `KeyboardController.bind` uses `'Shift'`.** Obsidian's Modifier type accepts `'Shift'` directly. The mock `Scope` already handles arbitrary modifier strings (LIFO bucket per `[modifiers].sort()::key`).
10. **Tests need a happy-dom-level Shift dispatch.** `harness.pressKey('f', ['Shift'])` already works — the mock `Scope.dispatch(key, modifiers)` accepts a modifier array.
11. **No registration framework / strategy pattern for capture.** Per design-patterns Step 3 self-critique — there is exactly one capture (Shift+letter), and the pitch's no-goes forbid other modifiers. Adding a `ModifierStrategy` interface or `Action` registry would be speculative; the pitch's no-goes are an explicit YAGNI signal. Reserve the right to extract a seam only when a second use case appears. Rejected explicitly.
12. **State pattern for buffer is overkill.** Three transitions, one class, one `letters: string` field. A `BufferState` interface with `EmptyState`, `OneLetterState`, `TwoLetterState` classes would add four files for no clarity gain. Rejected.
13. **Observer for buffer→hint slot.** A simple `on('change', cb)` is sufficient and is already the project's idiom (`TypedEmitter`). The hint slot subscribes; the popup wires it. No `EventEmitter` framework needed.
14. **Forge update flow: snapshot is seeded from `spell.hotkey`.** `DetailPanelRouter.renderForgeUpdate` already passes `mode.spell` to `ForgeSentinelDetail`. The dialog reads `mode.spell.hotkey` when in update mode to pre-populate the input. Empty input on submit = removing the hotkey (the meta-spell is instructed to delete the frontmatter key if `hotkey === null` in update mode).
15. **Meta-spell prompts.** Both `forge.md` and `forge-update.md` system prompts add a one-line instruction in step 3 ("set `${HOTKEY_FRONTMATTER_KEY}: <value>` if provided; remove it if cleared in update mode"). The user prompt adds `**Hotkey:** <value or 'none'>` line. Mirrors `executeOnNote` precedent.
16. **Cast log integration.** None. The pitch says hotkeys do not extend to the Cast Log. We add no Cast Log columns, no badges, no display-name suffixes.
17. **CSS variables.** The badge uses `var(--interactive-accent)` for the accent tint, `var(--font-ui-smaller)` for size, `var(--font-monospace)` for the monospace family. The error tint reuses `var(--color-red)` (already used by `cast-log-status-badge.is-failure`).
18. **Architecture fitness.** `dependency-cruiser` rules: `src/ui/popup/hotkey/` may depend on `src/domain/**`; nothing in `src/domain/**` may depend on `src/ui/**`. Existing rules likely already enforce this; verify in arch:check after wiring.

## Todos

### A. Domain primitives — `Hotkey`, frontmatter key, sentinel defaults

#### Section briefing

- **What this section produces:** A new module `src/domain/spells/Hotkey.ts` exporting `Hotkey` (branded type), `parseHotkey`, `HOTKEY_FRONTMATTER_KEY`, and `SENTINEL_HOTKEYS`. A modified `src/domain/spells/Spell.ts` adds an optional `hotkey: Hotkey | null` field. A modified `src/infra/spellScanner.ts` reads the frontmatter key. Unit tests live in `tests/domain/Hotkey.spec.ts` and `tests/infra/spellScanner.spec.ts`.
- **Design context the executor needs upfront:** From Technical notes #1: "Hotkey is branded, not a type alias. The only way to obtain a Hotkey is through `parseHotkey`." From Error handling: invalid frontmatter values are silently treated as no hotkey — "No console noise, no Notice." Validation rule is the pitch's "one or two lowercase ASCII letters" → regex `^[a-z]{1,2}$`.
- **Cross-section couplings:** None — this section is the bottom of the dependency stack. Sections C, D, E, F all import from this module but no todo here depends on any later todo.
- **Section-level Red criterion:** `parseHotkey` unit tests cover all rejections (uppercase, digits, symbols, length 3, empty string, non-string inputs); `Spell.hotkey` type-checks; `getSpells` returns `spell.hotkey === parseHotkey('g')` for a spell whose frontmatter has `grimoire-hotkey: g` and `null` for missing, malformed, or invalid values.

**junior-dev**
- [ ] A1: create `src/domain/spells/Hotkey.ts` exporting `Hotkey` (branded type `string & { __brand: 'Hotkey' }`), `HOTKEY_FRONTMATTER_KEY = 'grimoire-hotkey'`, `parseHotkey(raw: unknown): Hotkey | null` (regex `^[a-z]{1,2}$`, returns `raw as Hotkey` on match, `null` otherwise — including non-string inputs), and `SENTINEL_HOTKEYS = { forge: parseHotkey('f')!, refine: parseHotkey('r')! }` with `as const`. — S, junior-dev
- [ ] A2: unit tests in `tests/domain/Hotkey.spec.ts` cover `parseHotkey` accepting `'a'`, `'z'`, `'aa'`, `'zz'`, `'fo'`; rejecting `''`, `'A'`, `'Aa'`, `'1'`, `'a1'`, `'abc'`, `'a-'`, `null`, `undefined`, `42`, `true`, `[]`, `{}`. Verify `SENTINEL_HOTKEYS.forge === 'f'` and `.refine === 'r'`. — S, junior-dev
- [ ] A3: extend `Spell` interface in `src/domain/spells/Spell.ts` with `readonly hotkey: Hotkey | null`. Update the import comment block at the top to mention the new field if a JSDoc surface mentions field count. No behaviour change. — S, junior-dev
- [ ] A4: modify `src/infra/spellScanner.ts` `getSpells` to read `cache?.frontmatter?.[HOTKEY_FRONTMATTER_KEY]` and apply `parseHotkey`. The new `Spell` literal includes `hotkey: parseHotkey(cache?.frontmatter?.[HOTKEY_FRONTMATTER_KEY])`. — S, junior-dev
- [ ] A5: unit tests in `tests/infra/spellScanner.spec.ts` (extend existing file if present, else create) — a tagged file with `grimoire-hotkey: 'g'` resolves to `spell.hotkey === 'g'`; with `grimoire-hotkey: 'GO'` resolves to `null`; with `grimoire-hotkey: 'goose'` resolves to `null`; with no key resolves to `null`. — S, junior-dev

### B. Buffer state machine — `HotkeyBuffer`

#### Section briefing

- **What this section produces:** A new module `src/ui/popup/hotkey/HotkeyBuffer.ts` exporting `BufferState` and `HotkeyBuffer`. Unit tests in `tests/ui/popup/hotkey/HotkeyBuffer.spec.ts`.
- **Design context the executor needs upfront:** From the pitch's Capture rule: "Buffer empty → the letter becomes the buffer (one character). Buffer holds one letter → the new letter joins it (two characters). Buffer holds two letters → the new letter replaces the buffer entirely (one character, fresh start)." From Interfaces (Buffer): the state shape is `{ letters: ''; status: 'empty' }` or `{ letters: string; status: 'normal' | 'error' }`. `setEvaluation` flips status only when there are letters. Reuses the project's `TypedEmitter` (see `src/infra/TypedEmitter.ts`).
- **Cross-section couplings:** None within this section. Sections D and E consume `HotkeyBuffer` but those couplings are stated in their briefings.
- **Section-level Red criterion:** Unit tests cover all three append transitions (empty→1, 1→2, 2→1-replace), `clear()` from any state, `setEvaluation` flipping `normal`↔`error` only when non-empty, and that the `change` event fires on every state-mutating call. No DOM, no Obsidian imports.

**junior-dev**
- [ ] B1: create `src/ui/popup/hotkey/HotkeyBuffer.ts` exporting `BufferState` (discriminated union from Interfaces) and `HotkeyBuffer` class with private `#state: BufferState = { letters: '', status: 'empty' }`, `#emitter = new TypedEmitter<{ change: BufferState }>()`. — S, junior-dev
- [ ] B2: implement `state(): BufferState`, `on(event: 'change', cb): void`, `clear()` (set state to `{ letters: '', status: 'empty' }`, emit), `setEvaluation(status: 'normal' | 'error')` (no-op when current state is `'empty'`, otherwise update status and emit). — S, junior-dev
- [ ] B3: implement `append(letter: string)` — exactly the pitch's three rules: `'empty'` → `{ letters, status: 'normal' }`; one-letter → `{ letters: prev+letter, status: 'normal' }`; two-letter → `{ letters, status: 'normal' }` (replace, length 1). Always emit change. — S, junior-dev
- [ ] B4: unit tests cover each transition explicitly: append from empty (length 1, status normal); from one-letter (length 2, status normal); from two-letter (length 1, status normal — replace-on-overflow, original two letters discarded); clear from each of the three states; setEvaluation('error') from each (no-op on empty); setEvaluation('normal') from error state restores normal; change event fires on every call that mutates and does not fire on setEvaluation when state is empty. — S, junior-dev

### C. Registry — `HotkeyRegistry`

#### Section briefing

- **What this section produces:** A new module `src/ui/popup/hotkey/HotkeyRegistry.ts` exporting `RegistryTarget`, `RegistryHit`, `CollisionReport`, and `HotkeyRegistry`. Unit tests in `tests/ui/popup/hotkey/HotkeyRegistry.spec.ts`.
- **Design context the executor needs upfront:** From the pitch's Validation paragraph: "Sentinels register first, then vault spells in scan order; later registrations that collide are dropped." Pitch's matching rules: "If a one-letter hotkey `f` is registered, no two-letter hotkey starting with `f` can register." From Interfaces (Registry): `lookup` returns `exact` / `prefix` / `miss`. `RegistryTarget.rowIndex` is the **global row index** (spells [0..len), sentinels [len..len+2)) — the popup uses this index directly with `SpellsPanel.focusByRowIndex`.
- **Cross-section couplings:** None — this is pure data construction. D consumes registry output via `lookup`; F consumes `CollisionReport` to emit the Notice. Both are detailed in their own briefings.
- **Section-level Red criterion:** Unit tests cover sentinels-first ordering, scan-order tie-breaking, the prefix-disjoint rule in both directions (one-letter blocks subsequent two-letter starting with the same letter; two-letter blocks subsequent one-letter equal to its first letter), and `lookup` correctly distinguishing `'exact'` / `'prefix'` / `'miss'` against a built registry. `CollisionReport.dropped` enumerates every dropped entry with its reason.

**junior-dev**
- [ ] C1: create `src/ui/popup/hotkey/HotkeyRegistry.ts` exporting the types `RegistryTarget`, `RegistryHit`, `CollisionReport` per Interfaces. — S, junior-dev
- [ ] C2: implement `HotkeyRegistry.build(spells, sentinels): { registry, collisions }` — iterate sentinels first using `SENTINEL_HOTKEYS[sentinel.kind]` for `kind === 'forge' | 'refine'` (skip `'separator'`), then iterate spells in array order using `spell.hotkey` (skip null). Maintain a `Map<Hotkey, RegistryTarget>`. Reject any new entry whose hotkey is already present OR whose insertion would violate prefix-disjointness (one-letter present and new is two-letter starting with that letter; two-letter present whose first letter equals the new one-letter). Track every rejection in `CollisionReport.dropped` with reason `'sentinel-takes-precedence'` (loser is non-sentinel, winner is sentinel), `'first-spell-wins'` (both non-sentinel, exact-match collision), or `'prefix-blocked'` (prefix-disjointness violation). Sentinel rowIndex = `spells.length + sentinelIndex`. — M, junior-dev
- [ ] C3: implement `lookup(buffer: string): RegistryHit` — `'exact'` if `buffer` is in the map; else `'prefix'` if `buffer.length === 1` and some registered hotkey starts with `buffer` (necessarily a two-letter hotkey); else `'miss'`. Implement `size()` returning the map size. — S, junior-dev
- [ ] C4: unit tests cover: sentinels-only (build with `[]` spells → `f`, `r` both registered as sentinel targets); sentinel + colliding spell (`f`-tagged spell → dropped, reason `'sentinel-takes-precedence'`); two spells with same one-letter (`g`, `g`) → second dropped, reason `'first-spell-wins'`; prefix block forward (`f` sentinel + `fo` spell → `fo` dropped, reason `'prefix-blocked'`); prefix block backward (no sentinel `g`; spell A has `go`, spell B has `g` later in scan → B dropped, reason `'prefix-blocked'`); `lookup('f')` on built registry returns `exact`; `lookup('g')` when only `go` registered returns `prefix`; `lookup('xy')` returns `miss`; `lookup('')` returns `miss`. — M, junior-dev

### D. Capture — `HotkeyCapture`

#### Section briefing

- **What this section produces:** A new module `src/ui/popup/hotkey/HotkeyCapture.ts` exporting `HotkeyCaptureDeps` and `HotkeyCapture`. An integration test in `tests/integration/spell-hotkeys-capture.spec.ts`.
- **Design context the executor needs upfront:** From Technical notes #4: "The capture component owns Shift+a..Shift+z bindings only. 26 bindings on `Modal.scope`." From Technical notes #7: "Detail phase tears down the capture." From the pitch's Capture rule: "If the buffer matches a registered hotkey exactly → fire (focus the matching row), clear the buffer. Else if prefix → render normal accent. Else → render error." From Technical notes #6: "`focusRow` clears the search query." Capture must call `focusRow(target.rowIndex)` then `buffer.clear()` on exact match — order matters because clearing the buffer fires a state event the hint slot uses to revert to the hint.
- **Cross-section couplings:** D depends on B (`HotkeyBuffer`) and C (`HotkeyRegistry`). D's `focusRow` callback wires to `SpellsPanel.focusByRowIndex` from G2; D's install/uninstall lifecycle is driven by F's tab/phase wiring. The integration test D0 asserts the seam contract that G2 and F1–F3 must honour.
- **Section-level Red criterion:** Integration test boots a popup harness, registers a spell with `hotkey: 'g'`, presses `Shift+g`, and asserts the selected row becomes that spell (via harness.selectedRowName). A `Shift+x` press (no registered hotkey) leaves selection unchanged but the harness can observe the buffer indicator in error state. A `Shift+f` then `Shift+o` sequence with `fo` registered fires on the second press. The unit tests of `HotkeyCapture` cover the buffer feed loop in isolation (no DOM) by injecting a fake `Scope`.

**ui-integration-tester**
- [ ] D0: integration test `tests/integration/spell-hotkeys-capture.spec.ts` — pin the capture seam end-to-end. Cases: (i) build a harness with one spell whose mocked frontmatter carries `grimoire-hotkey: 'g'`, press `Shift+g`, assert `selectedRowName()` is that spell; (ii) press `Shift+f` on default harness (Forge sentinel), assert `selectedRowName()` is `'Forge'`; (iii) press `Shift+x` (no match), assert `.hotkey-buffer-indicator.is-error` present and selection unchanged; (iv) build harness with a spell `hotkey: 'fo'` — note that `f` sentinel will block this, so use a spell `hotkey: 'go'` instead, press `Shift+g` then `Shift+o`, assert spell focused only after second press; (v) press `Shift+f` while typed text in search has filtered Forge out, assert search clears and Forge is focused. — S, ui-integration-tester

**senior-dev**
- [ ] D1: create `src/ui/popup/hotkey/HotkeyCapture.ts` with constructor taking `HotkeyCaptureDeps`. `install()` registers 26 `kb.bind(['Shift'], letter, handler)` bindings via a new `KeyboardController` (or reuses an injected one — prefer injecting the popup's `KeyboardController` so suspend/resume already covers teardown). Each handler calls `#feed(letter)` and returns `true` (consumed). — M, senior-dev (depends on B, C)
- [ ] D2: implement `#feed(letter)` — `buffer.append(letter)`; then `const hit = registry.lookup(buffer.state().letters)`; switch on `hit.state`: `'exact'` → `focusRow(hit.target.rowIndex)`; `buffer.clear()` after focusRow; `'prefix'` → `buffer.setEvaluation('normal')`; `'miss'` → `buffer.setEvaluation('error')`. The hint-slot re-render happens reactively via the buffer's `change` event subscription wired in section F. — M, senior-dev
- [ ] D3: implement `uninstall()` — release the 26 bindings. If using a dedicated `KeyboardController`, call `unbindAll()`. — S, senior-dev
- [ ] D4: make D0 green. Wiring (G2 `focusByRowIndex`, F1 capture install/uninstall, F2 search-clear-on-focus, F3 hint slot) lands in those sections; D's contribution here is the capture's feed logic. — wire-up only, covered by D1–D3.

### E. Chrome — badge + hint slot

#### Section briefing

- **What this section produces:** A new module `src/ui/components/HotkeyHintSlot.ts`. Modified `src/ui/components/SpellRow.ts` and `src/ui/components/SentinelRow.ts` (badge rendering). Modified `src/ui/components/TabBar.ts` (right-aligned slot container). Modified `styles.css` and `src/main.css`. Unit/integration tests for the chrome live in `tests/integration/spell-hotkeys-chrome.spec.ts`.
- **Design context the executor needs upfront:** From Technical notes #8: "Hint slot lives in `TabBar`, not in the search input area. The TabBar grows a right-aligned container; `CommandPopup` injects the hint slot's element after constructing the TabBar." From the pitch's "Top-bar hint and buffer indicator" section: hint copy is exactly `Shift + letter for hotkeys`, muted text; indicator is monospace letters in normal-accent or error colour, followed by a `×` clear button. From No-gos: never render the Shift modifier inside the badge or buffer indicator.
- **Cross-section couplings:** Badge in SpellRow consumes `spell.hotkey` from A3; SentinelRow uses `SENTINEL_HOTKEYS[sentinel.kind]` from A1. The TabBar slot is wired by F1 (CommandPopup). The hint-slot's `onClear` callback wires to `HotkeyBuffer.clear()` in F4.
- **Section-level Red criterion:** Integration test boots a popup harness with a spell carrying `hotkey: 'g'`, asserts `.spell-hotkey-badge` with text `'g'` is rendered in that spell's row. Forge sentinel row carries badge `'f'`, Refine carries `'r'`. The tab-bar contains `.modal-tab-bar-right > .hotkey-hint` with text `Shift + letter for hotkeys` on the Spells tab; clicking the Logs tab hides it. After dispatching `Shift+x` to make the buffer error, the slot contains `.hotkey-buffer-indicator.is-error` with text starting with `x` and a `×` button. Clicking `×` restores the hint.

**ui-integration-tester**
- [ ] E0: integration test `tests/integration/spell-hotkeys-chrome.spec.ts` — pin badge presence/absence rules: a spell with `hotkey: 'g'` renders `.spell-hotkey-badge` text `'g'` in its row; a spell with `hotkey: null` does not render the badge; Forge row renders `.spell-hotkey-badge` text `'f'`; Refine renders `'r'`. Pin hint-slot behaviour: on initial open, `.modal-tab-bar-right .hotkey-hint` is present on the Spells tab with text matching `/Shift \+ letter for hotkeys/`; clicking the Logs tab removes the slot content (or hides it); switching back to Spells restores the hint. — S, ui-integration-tester

**junior-dev**
- [ ] E1: extend `SpellRow.render` in `src/ui/components/SpellRow.ts` — after `#appendName`, if `spell.hotkey !== null`, append `<span class="spell-hotkey-badge">{spell.hotkey}</span>` into the same `nameBlock` element, **before** the `#appendOverrideDot` call (badge sits adjacent to name on the left side, per pitch). — S, junior-dev
- [ ] E2: extend `SentinelRow.render` in `src/ui/components/SentinelRow.ts` — accept an optional `hotkey: Hotkey | null` parameter (callers pass `SENTINEL_HOTKEYS[sentinel.kind] ?? null` for `forge` / `refine`, `null` for `separator`). If non-null, append `<span class="spell-hotkey-badge">{hotkey}</span>` after `#appendName` (before description). — S, junior-dev
- [ ] E3: extend `SpellList.#buildSentinelRows` to pass `SENTINEL_HOTKEYS[sentinel.kind] ?? null` to `SentinelRow.render`. — S, junior-dev
- [ ] E4: extend `TabBar.render` — accept an optional `rightSlot?: HTMLElement` parameter; after building tabs, create a `.modal-tab-bar-right` child div and append `rightSlot` into it if provided. No behaviour change when omitted. — S, junior-dev

**senior-dev**
- [ ] E5: create `src/ui/components/HotkeyHintSlot.ts` per Interfaces. Implement `renderHint()` (clears container, creates `<span class="hotkey-hint">Shift + letter for hotkeys</span>`); `renderIndicator(letters, status)` (clears container, creates `.hotkey-buffer-indicator` with `.is-error` modifier when `status === 'error'`, a `<span class="hotkey-buffer-letters">{letters}</span>`, and a `<button class="hotkey-buffer-clear" type="button">×</button>` whose click handler calls `deps.onClear()`); `hide()` (empties container). Idempotent re-render. — M, senior-dev
- [ ] E6: add CSS to `styles.css` and `src/main.css` (keep both in sync — bundler emits styles.css): `.spell-hotkey-badge` (monospace via `var(--font-monospace)`, accent colour via `var(--interactive-accent)`, `font-size: var(--font-ui-smaller)`, `padding: 0 4px`, `border-radius: 3px`, `background: transparent`); `.modal-tab-bar` becomes `flex` (already is) with `.modal-tab-bar-right { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; }`; `.hotkey-hint { color: var(--text-muted); font-size: var(--font-ui-smaller); }`; `.hotkey-buffer-indicator { font-family: var(--font-monospace); color: var(--interactive-accent); display: inline-flex; align-items: center; gap: 4px; }`; `.hotkey-buffer-indicator.is-error { color: var(--color-red); }`; `.hotkey-buffer-clear { all: unset; cursor: pointer; color: var(--text-muted); }`. — S, senior-dev

### F. Popup wiring — install capture, render slot, focus row, fire Notice

#### Section briefing

- **What this section produces:** Modified `src/ui/CommandPopup.ts` (owns `HotkeyRegistry`, `HotkeyBuffer`, `HotkeyCapture`, `HotkeyHintSlot`; lifecycle wiring), modified `src/ui/popup/SearchPhase.ts` (clear buffer on arrow keys; intercept Escape when buffer non-empty), modified `src/ui/tabs/SpellsPanel.ts` (add `focusByRowIndex`), modified `src/main/PopupModule.ts` (build registry, fire collision Notice). Integration test `tests/integration/spell-hotkeys-lifecycle.spec.ts`.
- **Design context the executor needs upfront:** From Technical notes #2 + #3: "Registry is built once per popup module construction (or first popup open). Notice fires once per build." From Technical notes #5: "Arrow keys clear the buffer. We add a buffer-clear step at the start of `handleArrow`. Both happen on the same keypress." From Technical notes #6: "`focusRow` clears the search query." From Technical notes #7: "Detail phase tears down the capture via `kb.suspend()`." From the pitch's Reset triggers: "Escape clears the buffer; the popup stays open" only when buffer is non-empty — otherwise Escape's regular behaviour (close popup) is preserved.
- **Cross-section couplings:** F1 depends on D1–D3 (HotkeyCapture API) and E5 (HotkeyHintSlot API). F2 depends on G2 (SpellsPanel.focusByRowIndex). F3 (Escape interception) modifies SearchPhase but does not affect DetailPhase's Escape handling. F4 (hint-slot subscription) consumes the `change` event from B2. F5 (Notice) reads `CollisionReport` from C2.
- **Section-level Red criterion:** Integration test asserts: (i) on popup open with two colliding spells (both `hotkey: 'g'`), exactly one `Notice` is created with a message containing `'g'` and both spell names; (ii) pressing `Shift+f` followed by `ArrowDown` shows the buffer-cleared state (hint visible, indicator gone) and selection has advanced from Forge; (iii) pressing `Escape` while buffer has content clears the buffer and the modal stays open (`modal.contentEl.isConnected === true`); (iv) pressing `Escape` while buffer is empty closes the modal as before; (v) switching to detail (enter Forge) and back leaves the buffer empty and the hint visible; (vi) switching to Logs tab hides the slot, switching back shows it.

**ui-integration-tester**
- [ ] F0: integration test `tests/integration/spell-hotkeys-lifecycle.spec.ts` — pin the lifecycle contract per the Red criterion above. Use harness extensions where needed (add helpers in `harness.ts` to read `.hotkey-hint`, `.hotkey-buffer-indicator`, `.hotkey-buffer-clear`, and to assert the slot visibility on tab switches). For (i), construct the harness with two spells whose mocked frontmatter both contain `grimoire-hotkey: 'g'` and assert `Notice.instances` (from the obsidian mock) contains exactly one matching entry after popup open. — M, ui-integration-tester

**senior-dev**
- [ ] F1: in `src/ui/CommandPopup.ts`, instantiate `HotkeyBuffer`, build `HotkeyRegistry` from `this.#spellsPanel`'s spells + the sentinel list (expose a `spells()` getter on `SpellsPanel` that returns `[...this.#allSpells]` if needed — see G1), instantiate `HotkeyHintSlot` mounted into a freshly-created element, instantiate `HotkeyCapture` with deps `{ scope: this.scope, buffer, registry, focusRow: (i) => this.#focusRow(i) }`. The registry build moves to `PopupModule` (see F5) — `CommandPopup` accepts a pre-built registry via constructor params. — M, senior-dev (depends on D, E)
- [ ] F2: implement `CommandPopup.#focusRow(index)` — set `this.#searchQuery = ''`; reset spells panel filter (`this.#spellsPanel.reset()`); call `this.#spellsPanel.focusByRowIndex(index)` (G2); call `this.#render()` to re-paint with cleared query; selection state is restored via SearchInput's `restoreSelection`. — M, senior-dev
- [ ] F3: in `SearchPhase.handleArrow`, before the existing logic, if `this.#ctx.hotkeyBuffer().state().status !== 'empty'`, call `this.#ctx.hotkeyBuffer().clear()`. Add `hotkeyBuffer()` to `PopupPhaseContext`. In `SearchPhase`, add `handleEscape(): boolean` (new method on `PopupPhase`): if buffer non-empty, clear and return `true` (consumed, preventDefault); else return `false` (fall through to existing Modal close). Bind `Escape` in `CommandPopup.#bindKeys` to `this.#currentPhase.handleEscape()`. DetailPhase's `handleEscape` returns `false` so existing detail-back behaviour via `interceptClose` is unchanged. — M, senior-dev
- [ ] F4: in `CommandPopup`, subscribe to `buffer.on('change', state)` — render hint slot accordingly: empty → `hintSlot.renderHint()`; non-empty → `hintSlot.renderIndicator(state.letters, state.status)`. Wire `hintSlot.deps.onClear = () => buffer.clear()`. On tab switch to Logs: `hintSlot.hide()`, `buffer.clear()`, `capture.uninstall()`. On tab switch back to Spells: `capture.install()`, `hintSlot.renderHint()`. On `#enterDetail`: `buffer.clear()`, `hintSlot.hide()` (capture is auto-torn-down via `kb.suspend`). On `#exitDetail`: re-install capture (it's auto-rebound via `kb.resume` if using the popup's `#kb` controller — verify with test), `hintSlot.renderHint()`. — M, senior-dev
- [ ] F5: in `src/main/PopupModule.ts`, after `getSpells` (which is called inside `SpellsPanel` constructor today — needs minor refactor: build the spells list once in `PopupModule` and pass to `CommandPopup`, OR add a callback for "after spells are scanned" that returns the list to `PopupModule` so it can build the registry). Decision: build `HotkeyRegistry` lazily on first popup open inside `PopupModule.#openPopup`, by calling `getSpells(app, spellTag)` once there and passing both the spell array and the pre-built registry into `CommandPopupBuilder`. Emit `new Notice('Hotkey collisions: …')` if `collisions.dropped.length > 0`, listing each dropped entry. Cache the registry per-module so re-opening the popup does not refire the Notice (use a `WeakMap<spellsArray, Registry>` or simply a `#registry: HotkeyRegistry | null` field rebuilt only when the spell list array reference changes — for simplicity, rebuild on every popup open but only emit Notice on first build, gating with a `#hasShownCollisionNotice: boolean` field). — M, senior-dev (depends on C)

### G. SpellsPanel — expose spells, add focusByRowIndex

#### Section briefing

- **What this section produces:** Modified `src/ui/tabs/SpellsPanel.ts` adding a `spells(): readonly Spell[]` accessor and a `focusByRowIndex(index: number): void` method. No new files.
- **Design context the executor needs upfront:** From SpellsPanel today: index `[0, #filteredSpells.length)` is a spell; `[#filteredSpells.length, +2)` is a sentinel. Per Technical notes #6, `focusByRowIndex` is called *after* the popup clears the search query and resets the filter — so by the time it runs, `#filteredSpells === #allSpells` and the index is over the full list. The method updates `#lastSelectedIndex`, calls `#spellList?.updateSelection(prev, next)`, and scrolls the new selection into view.
- **Cross-section couplings:** G1 (`spells()` accessor) is consumed by F5 (registry build in PopupModule reads spells directly — actually it reads via `getSpells`, so G1 may be unused; keep it only if it simplifies tests). G2 (`focusByRowIndex`) is consumed by F2 (CommandPopup.#focusRow) and tested via D0 and F0.
- **Section-level Red criterion:** Unit (or integration) test asserts that after `panel.focusByRowIndex(5)`, the row at index 5 has class `.is-selected` and the previously-selected row no longer does. A second test calls `panel.focusByRowIndex(panel.length - 1)` (last sentinel) and asserts the last sentinel row is selected.

**junior-dev**
- [ ] G1: add `spells(): readonly Spell[]` accessor to `SpellsPanel` returning `this.#allSpells`. Used by tests; PopupModule already calls `getSpells` directly. Drop this todo if not consumed after F5 lands — but it costs nothing and unblocks test introspection. — S, junior-dev
- [ ] G2: add `focusByRowIndex(index: number): void` to `SpellsPanel` — `const prev = this.#lastSelectedIndex; this.#lastSelectedIndex = index; this.#spellList?.updateSelection(prev, index);` Idempotent when `prev === index`. — S, junior-dev

### H. Forge dialog — hotkey field (create + update)

#### Section briefing

- **What this section produces:** Modified `src/forge/ForgeFormSnapshot.ts` and `src/forge/ForgeUpdateFormSnapshot.ts` (add `hotkey: Hotkey | null`). Modified `src/ui/components/ForgeSentinelDetail.ts` (new input field, snapshot wiring). Modified `src/forge/buildForgeUserPrompt.ts`, `src/forge/buildForgeUpdateUserPrompt.ts` (carry hotkey), `src/forge/forgeTemplate.ts`, `src/forge/forgeUpdateTemplate.ts` (instruct LLM to write the frontmatter key). Integration test `tests/integration/spell-hotkeys-forge.spec.ts`; unit-level coverage for the input filter in `tests/forge/forgeHotkeyInput.spec.ts` if extracted.
- **Design context the executor needs upfront:** From Error handling: "Forge dialog user types `Goose` → the input filter snaps each keystroke to lowercase and caps at length 2 — the user sees `go` in the field. No error toast." Pitch's No-gos: "Do not enforce uniqueness in the dialog." From Technical notes #14: "Forge update flow: snapshot is seeded from `spell.hotkey`. Empty input on submit = removing the hotkey (the meta-spell is instructed to delete the frontmatter key if `hotkey === null` in update mode)." From Technical notes #15: meta-spell prompts mirror the `executeOnNote` precedent.
- **Cross-section couplings:** H consumes `Hotkey` and `parseHotkey` from A1. H does **not** depend on D/E/F (the dialog field is independent of capture/chrome/wiring). The forge dialog's hotkey value flows through the user prompt and meta-spell to a future scan, so the runtime feedback loop is "next popup open." No coupling to G.
- **Section-level Red criterion:** Integration test: submitting the Forge create form with hotkey value `'g'` invokes `imprintAction` with `snapshot.hotkey === 'g'`. Submitting with the input empty invokes with `snapshot.hotkey === null`. Typing `'GoOsE'` results in input value `'go'`. Typing `'1a'` results in input value `'a'` (digits rejected). Forge update mode pre-fills the input with `spell.hotkey` when present. User prompt string contains `**Hotkey:** g` when set and `**Hotkey:** none` when null.

**ui-integration-tester**
- [ ] H0: integration test `tests/integration/spell-hotkeys-forge.spec.ts` — pin the dialog seam. Cases: (i) navigate to Forge create, type `'g'` into the hotkey input, submit, assert `imprintAction` called with `snapshot.hotkey === 'g'`; (ii) submit with empty hotkey input → `snapshot.hotkey === null`; (iii) type `'Go'` → input value reads `'go'` (snap to lowercase); (iv) type `'1'` then `'a'` → input value reads `'a'` (digit rejected, letter accepted); (v) type `'abc'` → input value reads `'ab'` (capped at 2); (vi) build a harness for forge-update mode (reuse patterns from `tests/integration/forge-update-end-to-end.spec.ts`) with a spell whose hotkey is `'r'` — assert the input is pre-filled with `'r'`; clear it and submit → `snapshot.hotkey === null`. — M, ui-integration-tester

**senior-dev**
- [ ] H1: add `readonly hotkey: Hotkey | null` to `ForgeFormSnapshot` and `ForgeUpdateFormSnapshot`. — S, junior-dev
- [ ] H2: in `ForgeSentinelDetail`, add a `#buildHotkeyField(form)` method that creates a labelled `<input type="text" maxlength="2" placeholder="Hotkey (1-2 letters, optional)">` after the description field and before the model section header. Add `#hotkey: string = ''` (raw string; the snapshot calls `parseHotkey` at submit). For update mode, seed `#hotkey = mode.spell.hotkey ?? ''`. Wire an `input` event handler that filters keystrokes: `const filtered = input.value.toLowerCase().replace(/[^a-z]/g, '').slice(0, 2); if (filtered !== input.value) input.value = filtered; this.#hotkey = filtered;`. — M, senior-dev
- [ ] H3: in `#snapshotCreate()` and `#snapshotUpdate()`, add `hotkey: parseHotkey(this.#hotkey)`. — S, junior-dev
- [ ] H4: in `src/forge/buildForgeUserPrompt.ts`, accept `hotkey: Hotkey | null` in `ForgeUserPromptInput` and append a `- **Hotkey:** ${hotkey ?? 'none'}` line. Mirror in `buildForgeUpdateUserPrompt.ts`. — S, junior-dev
- [ ] H5: in `ForgeImprinter.imprint` and `ForgeUpdateImprinter.imprint`, thread `snapshot.hotkey` into the user-prompt builder calls. — S, junior-dev
- [ ] H6: in `src/forge/forgeTemplate.ts` (`renderForgeSystemPrompt`), update step 3's frontmatter instructions to include: "If a hotkey is provided in the user prompt, also set `${HOTKEY_FRONTMATTER_KEY}: <hotkey>` in the frontmatter." Mirror in `forgeUpdateTemplate.ts` with an additional sentence for update mode: "If the hotkey value is `none`, remove the `${HOTKEY_FRONTMATTER_KEY}` key from the frontmatter; otherwise set it to the provided value." Import `HOTKEY_FRONTMATTER_KEY` and use template substitution. — M, senior-dev

### I. Live-spec touch-ups (descriptive only — no separate dev work)

#### Section briefing

- **What this section produces:** Notes for `/spec` to pick up after `/done`. No file writes in this iteration — the feature-documenter agent will write `docs/features/spell-hotkeys.md` and patch related docs (`command-popup-ui.md`, `forge-spell-update.md`, `spell-execute-on-note.md`) at iteration close. This section captures the intent so the spec author has a checklist.
- **Design context the executor needs upfront:** N/A — no dev work in this iteration.
- **Cross-section couplings:** None.
- **Section-level Red criterion:** N/A — handled by `/spec` post-`/done`. This section exists only as a planning artefact to remind us which docs become stale.

**No todos.** Hand-off note for the `/spec` step:
- New live-spec: `docs/features/spell-hotkeys.md`.
- Patch `docs/features/command-popup-ui.md` — Spells tab now carries a right-corner hint slot; Spell rows may carry a hotkey badge; Escape semantics now include "clear buffer when non-empty."
- Patch `docs/features/forge-spell-update.md` and `docs/features/forge-cast.md` — Forge dialog now carries an optional hotkey field; snapshot shape grows a `hotkey` field.
- Patch `docs/features/spell-execute-on-note.md` (if it surveys all frontmatter keys) — list `grimoire-hotkey` alongside `grimoire-execute-on-note`.

## Deferred edge cases

None — every edge case identified in the pitch and the multi-perspective pass is wired into a todo above.

## Overall effort summary

Counts (excluding D4 wire-up tag and Section I which has no todos):

- **A:** 5 todos (5 junior-dev). S×5.
- **B:** 4 todos (4 junior-dev). S×4.
- **C:** 4 todos (3 junior-dev, 1 junior-dev M). S×3, M×1.
- **D:** 4 todos (1 ui-integration-tester S, 3 senior-dev: M, M, S).
- **E:** 6 todos (1 ui-integration-tester S, 3 junior-dev S, 2 senior-dev: M, S).
- **F:** 5 todos (1 ui-integration-tester M, 4 senior-dev: M×4).
- **G:** 2 todos (2 junior-dev S).
- **H:** 7 todos (1 ui-integration-tester M, 3 senior-dev: M×2, M, and 3 junior-dev S).

Totals:
- Total todos: **37** (excluding I).
- Effort: **S: 24, M: 13, L: 0.**
- Dev tier mix: **junior-dev: 18, senior-dev: 14, ui-integration-tester: 5, lead-dev: 0.**
- ui-integration-tester groups: 4 (one per Section D, E, F, H).

The plan front-loads cheap, isolated work (A, B, C, G are nearly entirely junior-dev). Senior-dev concentrates in D (capture wiring), F (popup lifecycle), E5 (hint slot), H2/H6 (dialog input filter + meta-spell prompts). No lead-dev escalation expected — there is no concurrency, no security-sensitive surface, no cross-module invariant requiring opus-level reasoning.
