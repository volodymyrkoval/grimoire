# Forge Dialog Hotkey Capture

> `dev/done-030` — 2026-05-19 — Replaces the plain-text Hotkey input in the Forge dialog with a button-driven capture surface that maps the authoring motion onto the firing motion and surfaces collisions in place.

## What it does

The Forge dialog's Hotkey field is no longer a text input that swallows keystrokes. It is a button labelled **Hotkey**. Clicking it puts the field into capture mode: the label changes to **Save** and a live chip appears next to it. Bare lowercase letters land in the chip (one or two; a third keystroke is ignored), Backspace removes the last letter, and either **Enter** while the field has focus or a click on **Save** commits the value. A `×` next to the chip cancels the capture without persisting; tabbing away from the field does the same.

In update mode, when the spell being edited already carries a `grimoire-hotkey`, the dialog opens with a persisted chip already shown to the left of the **Hotkey** button. A `×` next to that chip deletes the persisted hotkey from the spell file's frontmatter immediately — outside the dialog's submit flow — so closing the dialog afterwards still leaves the hotkey gone. Successful commits, by contrast, only stage the new value into the submitted snapshot; the spell file itself is rewritten by the Forge update meta-spell.

Commit-time validation runs four checks: the value must be one or two lowercase ASCII letters; it must not be `f` (reserved for Forge) or `r` (reserved for Refine); and it must not collide with any *other* user-authored spell's hotkey at the moment the dialog was opened. Rejection recolours the chip red and renders the violated rule below the button verbatim (`"One or two lowercase letters only."`, `"Reserved for Forge."`, `"Reserved for Refine."`, `"Hotkey already used by <spell name>."`). The field stays in capture mode so the user can correct without re-entering it.

## Design decisions

- **Validator is pure and separable from the DOM.** `validateHotkeyCommit(candidate, selfPath, directory)` returns a tagged result. Reuses `parseHotkey` for the pattern half. Rejected: inline checks inside the field component — would entangle rules with rendering and lose the unit-test seam.
- **Collision picture is a snapshot taken at popup open, not a live subscription.** Built once from the same `Spell[]` that feeds `HotkeyRegistry` and held for the dialog's lifetime. Rejected: live vault watching mid-dialog — out of half-day appetite, and the existing load-time `Notice` from `spell-hotkeys` backstops the case where another window edits during the session.
- **Persisted-chip `×` erases frontmatter immediately, decoupled from form submit.** Clearing a hotkey is a self-contained user intent that does not need to be bundled with the spell-rewrite intent. Rejected: confirm dialog or Undo — half-day scope, and Obsidian file history covers genuine mistakes.
- **`HotkeyCaptureField` is single-purpose, not a generic `ChipCaptureField<T>`.** No second consumer exists today; YAGNI. Extracting a generic chassis later is cheap if a second field appears.
- **No `KeyboardController` bindings.** The field listens via plain DOM `keydown` on its own container so the popup-scope keyboard handler stays untouched across `kb.suspend()` / `kb.resume()`. `Enter` while in capture phase is `preventDefault`-ed so the form-level submit handler does not fire.
- **No auto-focus on the field at dialog open.** Create mode keeps focusing the name input; update mode stays unfocused. Combined with "exit capture on focus loss," this means a user typing into the description textarea cannot accidentally land letters in the hotkey buffer.
- **Both `Save` button and `Enter` commit.** Discoverability for users who find the dialog without reading the pitch; speed for users who know the gesture.

## Scope

**In:**
- Button + chip + capture-state-machine field replacing the plain text Hotkey input in both Forge create and update dialogs.
- Persisted-chip with `×` erase (update mode only) that mutates `grimoire-hotkey` frontmatter via `app.fileManager.processFrontMatter`.
- Commit-time validator covering pattern, reserved-forge, reserved-refine, and other-spell collision, with verbatim inline error copy per reason.
- `HotkeyDirectory` snapshot built once at popup open from the already-scanned spell list and threaded through `DetailPanelRouter` to the field.

**Out:**
- **Auto-focus on the Hotkey field at dialog open.** Pitch rabbit hole — the primary input is description, and auto-focus would invert that.
- **Animations on rejection (flash, shake).** Pitch rabbit hole — colour change carries the signal already.
- **Undo / toast / confirm for the persisted-chip `×` erase.** Self-contained intent; file history is the recovery path.
- **Suggestion helpers ("pick another letter", "steal from spell X").** Out of pitch scope; the plain rejection text is the design.
- **Non-letter input (digits, symbols, uppercase, modifiers, function keys, arrows).** Same no-go list as `spell-hotkeys`; no second use case yet.
- **Prefix-relationship check in the dialog.** `f` and `fo` coexist legitimately at runtime, so a dialog-level prefix check would forbid valid pairs.
- **Live mid-dialog tracking of vault changes from other windows.** Half-day appetite; load-time `Notice` backstops it.
- **Replacing or modifying the plugin-load collision `Notice`** from `spell-hotkeys`. Frontmatter hand-edits still need that backstop.
- **A Settings-panel hotkey surface.** Separate concern; the pitch is explicit on dialog-only authoring.

## Relationship to existing system

- **Replaces the Forge-dialog half of `spell-hotkeys`.** The optional Hotkey *input* described in that doc is now the Hotkey *button-and-chip surface*. The snapshot shape (`hotkey: Hotkey | null`), the meta-spell prompts, the frontmatter key, the runtime registry, and the load-time `Notice` are all untouched.
- **Extends `forge-cast` and `forge-spell-update`.** Both dialog modes mount the new field; create mode starts empty, update mode pre-fills the persisted chip from `mode.spell.hotkey`. The submission contract for both flows is unchanged.
- **Threads through `command-popup-ui`.** A `HotkeyDirectory` snapshot factory and a `HotkeyEraser` callback are added to `DetailPanelRouter` deps. `CommandPopup` builds the directory at open-time from the same spell scan that feeds `HotkeyRegistry`; `CommandPopupBuilder` constructs the eraser around `app.fileManager.processFrontMatter`.
- **New mock surface for integration tests.** `tests/__mocks__/obsidian.ts` grows `App.fileManager.processFrontMatter`, an in-memory `__filesByPath` registry, and `getAbstractFileByPath`. The new `tests/integration/forge-hotkey-capture.spec.ts` exercises all state-machine transitions, the rejection copy, the focus rabbit hole, the snapshot integrity contract, and the eraser-failure UX. The previous `tests/integration/spell-hotkeys-forge.spec.ts` is retired (it asserted plain-text-input behaviour that no longer exists).

## Behavior changes

- **Forge dialog Hotkey field shape:** previously a plain `<input>` that lowercase-filtered keystrokes and capped length at 2. Now a button-driven capture surface with explicit `Save` / `×` / persisted-chip affordances. Reason: typing letters into a textbox does not rhyme with the keybinding gesture it produces, collisions were deferred to plugin-load `Notice` far from the authoring intent, and clearing required select-and-delete with no explicit affordance.
- **Hotkey collision feedback timing:** previously surfaced only at next plugin/popup load via the `Notice` from `spell-hotkeys`. Now also surfaced inline at commit time inside the Forge dialog, naming the colliding spell. The load-time `Notice` remains as a backstop for frontmatter hand-edits. Reason: feedback at the moment of authoring is more actionable than feedback at next load.
- **Update-mode hotkey clearing:** previously required submitting the Forge update form with the input emptied, so the meta-spell rewrote the file. Now the persisted-chip `×` deletes the `grimoire-hotkey` key directly via `processFrontMatter`, with no Forge cast involved and no Cast Log entry. Reason: clearing a hotkey is a self-contained intent that should not be bundled with a spell-body rewrite, mirroring how other frontmatter hand-edits also bypass the log.
