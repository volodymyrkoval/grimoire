# Refine Note Dialog

> `dev/done-016` — 2026-05-15. Promotes the Refine sentinel in the Spell Picker to dialog parity with an authored spell — keyboard hint chip, options panel via Right, persisted per-Refine overrides — without invoking any cast pipeline.

## What it does

In the Spells tab of the Command Popup, the Refine sentinel row now advertises the same `↵ cast · → options` chip as a spell row. Pressing `ArrowRight` while it is highlighted slides into the same options form that authored spells use — model, effort, context notes, follow-up, executeOnNote, and the conditional "Set as default" checkbox. The Forge sentinel is unchanged and does not display the chip.

Persistence flows through the existing `SpellOverrideStore`: toggling "Set as default" stores model + effort under a reserved synthetic path so re-opening Refine pre-fills with the user's last default. Re-opening within the same Obsidian session also restores last-cast values via the existing session map.

Activation closes the popup. `Enter` on the Refine row dismisses the modal directly. Cast (button click or `Cmd/Ctrl+Enter`) from inside the Refine options panel also fully dismisses the modal — it does not dispatch a cast, write a cast record, generate a `castId`, or invoke Claude Code. The dismissal is the only side effect on the cast surface this iteration.

## Design decisions

- **Reserved synthetic `SpellPath` (`<grimoire-sentinel:refine>`).** Angle brackets are path-impossible on Windows and avoided elsewhere, so the key cannot collide with a real vault file. Keeps Refine overrides inside the existing `Record<string, SpellOverride>` map — no second persistence pipeline.
- **Dedicated `RefineOptionsDetail` coordinator, not a synthetic `Spell`.** The plan proposed routing a fake `Spell` through `SpellOptionsDetail`; the shipped implementation split a separate `RefineOptionsDetail` class that mounts the same `OptionsPanel` without inventing a `Spell` object. `OptionsPanel`, `OptionsFormState`, `OptionsSessionMap`, and `SpellOverrideStore` are reused unchanged.
- **Shared `appendRowHint(el)` helper.** Both `SpellRow` and the Refine `SentinelRow` draw the chip from one function so chip vocabulary cannot drift between the two row types. Forge keeps no chip via a `showHint: false` default.
- **`CommandPopup.dismiss()` bypasses the close-override.** The popup's `close()` is intercepted in detail phase to return to search (correct for authored spells, which keep the modal open after a cast). Refine has no follow-up, so its `onCast` calls `dismiss()` to call `super.close()` directly. The authored-spell exit-to-search behavior is untouched.
- **Hint chip text ships verbatim — no Refine-specific verb.** The chip vocabulary is shared across the picker; the verb mismatch ("cast" vs. dismiss) is intentional visual consistency.
- **`executeOnNote: false` is a placeholder.** Nothing reads it for Refine this iteration; the future cast pipeline will decide Refine semantics.

## Scope

**In:**
- Hint chip on the Refine sentinel row (rendered via shared helper).
- `ArrowRight` on Refine → `RefineOptionsDetail` → same `OptionsPanel` form.
- Per-Refine `model` / `effort` override persistence keyed on the synthetic path.
- `Enter` on Refine and Cast/`Cmd+Enter` from inside Refine options → modal fully dismissed.
- Two new no-payload `SpellEvents` (`open-refine-options`, `dismiss-refine`).
- Deletion of the now-unreachable `#renderGenericSentinelDetail` path.

**Out:**
- Refine cast dispatch / `castId` / cast-record / Claude Code invocation — *the entire cast pipeline for Refine is the next iteration's concern*.
- Mode detection from the active note (word count, `@cast` lines) — *the dialog does nothing the user does not directly drive*.
- `@cast` directive parsing or CodeMirror inline-marker styling — *editor-decoration is a separate future phase*.
- Refine-specific prompt body — *no prompt is written or referenced this iteration*.
- A fork of `OptionsPanel` / `SpellOptionsDetail` — *the panel UI is reused unchanged; only the coordinator differs*.
- Override-dot on the Refine row — *`SpellList` paints dots only on `SpellRow`; extending it for a single sentinel is premature*.
- Chip on the Forge sentinel — *the pitch asks for chips on Refine only; changing Forge would touch shipped, tested UI*.

## Relationship to existing system

- Extends `command-popup-ui`: replaces the old generic-sentinel detail variant with a Refine options variant; the state diagram and detail-variants list now reflect three variants (Forge / Spell options / Refine options).
- Reuses `options-panel` end-to-end (form, snapshot rule, resolver tier cascade, override store) through a dedicated coordinator.
- Adds a `REFINE_SENTINEL_PATH` constant co-located with the `Spell` type so future sentinels with persisted state can follow the same lexical convention.
- The new `dismiss()` method on `CommandPopup` complements the existing `close()`-override; only the Refine path uses it today.

## Behavior changes

- **`Enter` on the Refine sentinel:** previously opened a generic detail view (`<h2>` + `<p>Type: refine` + Back). Now fully dismisses the popup. *Why:* the generic detail was a placeholder; the pitch defines `Enter` on Refine as the explicit dismissal gesture for the row.
- **`ArrowRight` on the Refine sentinel:** previously a no-op (binding gated to spell rows only). Now opens the Refine options panel. *Why:* parity with authored-spell rows is the iteration's goal.
- **Refine sentinel row appearance:** previously rendered without a keyboard-hint chip. Now displays the shared `↵ cast · → options` chip. *Why:* row-level parity with authored spells; Forge stays chip-less because the pitch is silent on it.
- **`#renderGenericSentinelDetail` deleted from `CommandPopup`:** its sole caller (Refine via the `sentinel` event) was rerouted to the new path. *Why:* dead-code deletion in the same change keeps the popup's detail variants enumerable.
