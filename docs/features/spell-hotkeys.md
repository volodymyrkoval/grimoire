# Spell Hotkeys

> `dev/done-029` — 2026-05-19 — Shift-prefixed one- or two-letter hotkeys jump the Command Popup's selection straight to a specific spell or sentinel row during the search phase.

## What it does

A power user who reaches for the same handful of spells dozens of times a day no longer has to type-and-arrow to find them. Each user-authored spell can declare a one- or two-letter hotkey in its frontmatter (`grimoire-hotkey: g`, `grimoire-hotkey: go`), and the two sentinels carry mandatory defaults — **Forge** is `f`, **Refine** is `r`. With the Spells tab focused, pressing **Shift + letter** jumps selection to that row; a follow-up Enter casts it. Single-keypress launches now feel instant for the daily favourites, and the rows that *don't* carry a hotkey become a quiet signal of what hasn't been elevated yet.

Each hotkeyed row renders a small accent-tinted badge near its name. The tab bar grows a right-corner slot that toggles between a muted hint (`Shift + letter for hotkeys`) and an active **buffer indicator** showing the letters typed so far plus a `×` clear button. The buffer holds one or two letters: pressing Shift+letter on an empty buffer fills it with one letter; a second Shift+letter fills it to two; a third *replaces* the buffer with the new letter (replace-on-overflow). An exact match fires immediately; a one-letter buffer that is a valid prefix of a two-letter hotkey waits in normal accent; a buffer that matches nothing tints red. The buffer clears on a successful fire, on Up/Down arrow, on Escape (which is intercepted only while the buffer is non-empty — empty-buffer Escape still closes the modal), on the `×` click, on tab switch to Logs, and on detail-phase entry. Firing a hotkey also clears any in-progress search query so the target row is always reachable even when filtered out.

The Forge dialog (both create and update modes) grows an optional **Hotkey** input that snaps every keystroke to one or two lowercase ASCII letters and rejects everything else silently. The Forge meta-spell is instructed to write `grimoire-hotkey: <value>` into the new file's frontmatter, mirroring the existing `grimoire-execute-on-note` precedent. Collisions are resolved at popup-open: sentinels register first, then vault spells in scan order; later entries that collide or break prefix-disjointness are dropped, and a single `Notice` lists every dropped entry.

## Design decisions

- **`Hotkey` is a branded primitive, validated by `parseHotkey` against `^[a-z]{1,2}$`.** Validation lives in one place; every downstream consumer either holds a non-null `Hotkey` or skips. Rejected: ad-hoc string checks at each entry point.
- **Buffer is plain data, capture is DOM-bound.** A pure `HotkeyBuffer` state machine and a pure `HotkeyRegistry` are unit-testable without happy-dom; `HotkeyCapture` is the only DOM-touching layer. Rejected: a single component owning both state and bindings.
- **Collisions resolve at registry build, not in the dialog.** Sentinels-first + scan-order + load-time `Notice` is deterministic and cheap. Rejected: live collision warnings in the Forge dialog — overhead for a soft rule.
- **Sentinel hotkeys (`f`, `r`) are compile-time constants, not customisable.** Pitch convention; no second use case for customisation yet.
- **No registration framework for future modifiers.** The pitch's no-goes (no Ctrl/Cmd/Alt, no digits, no uppercase) are an explicit YAGNI signal. `HotkeyCapture` exposes a clear `feed(letter)` seam so a future sibling can slot in without a rewrite. Rejected: a `ModifierStrategy` / `Action` registry.
- **`focusRow` clears the search query.** When the buffer fires while the target is filtered out, the only sensible behaviour is to drop the query, re-render, then select. Makes "Shift+f to Forge always lands on Forge" a hard guarantee.
- **`Notice` fires once per registry build, not per popup open.** Build is currently lazy at first popup open and reused; re-opening does not re-spam the collision notice.

## Scope

**In:**
- One- or two-letter Shift-prefixed hotkeys on user-authored spells via `grimoire-hotkey` frontmatter, plus mandatory sentinel defaults (`f` Forge, `r` Refine).
- Hotkey badges on the Spell row, on the Forge sentinel row, and on the Refine sentinel row.
- Tab-bar right-corner hint slot that swaps between a muted hint and an active buffer indicator (letters + `×`).
- Optional Hotkey input on the Forge create and update dialogs, threaded through both meta-spell user prompts and the create / update system-prompt templates.
- One `Notice` at registry build listing every dropped hotkey with its reason.

**Out:**
- **Cast Log hotkeys** — no row-level keyboard navigation exists on the Logs tab yet; would need a different selection model.
- **Hotkeys longer than two letters, uppercase, digits, symbols, or other modifiers (Ctrl/Cmd/Alt)** — premature; no second use case to motivate the additional surface.
- **Settings-level hotkey reassignment, sentinel customisation, auto-suggestion** — separate concerns; the pitch is explicit on user-authored-only customisation via frontmatter.
- **Live collision warnings in the Forge dialog** — soft rule, runtime resolution is sufficient; deferred until a user actually requests it.
- **Persistent buffer across popup open/close cycles** — pitch treats the buffer as a search-phase artefact; persistence would surprise more than help.
- **A row-level hotkey badge for rows without a hotkey** — the asymmetry between hotkeyed and unhotkeyed rows is itself the signal the pitch wants.

## Relationship to existing system

- **Extends `command-popup-ui`** — adds a hotkey capture layer to the Spells-tab search phase, a new right-corner slot in `TabBar`, badge rendering on `SpellRow` / `SentinelRow`, and a new Escape interception path (only while the buffer is non-empty). The doc's keyboard table and detail-phase teardown notes were patched in the same iteration.
- **Extends `forge-cast` and `forge-spell-update`** — the Forge dialog (both modes) grows an optional Hotkey field; `ForgeFormSnapshot` and `ForgeUpdateFormSnapshot` grow a `hotkey: Hotkey | null` field; both meta-spell user prompts and system-prompt templates carry the new value. Both docs were patched in the same iteration.
- **Mirrors `spell-execute-on-note`** — `grimoire-hotkey` joins `grimoire-execute-on-note` as a frontmatter-stored, dialog-set, scanner-read, best-effort key. Same compliance model: missing or malformed key means no hotkey.
- **Reuses `SpellsPanel`** — a new `focusByRowIndex` accessor moves selection by global row index; the capture layer calls it on a hotkey hit.
- **Composes with `clickable-options-chip` and the existing override-dot conventions** — the new badge sits in the row's name block adjacent to the existing chrome without disturbing layout or the `↵ cast · → options` hint.

## Behavior changes

- **Escape in the Spells-tab search phase:** previously always closed the modal. Now, when the hotkey buffer is non-empty, the first Escape clears the buffer and the modal stays open; a second Escape (now with an empty buffer) closes it as before. Reason: the buffer is a transient input mode; Escape is the natural reset that doesn't require the user to learn a new key.
- **Up/Down arrow in the search phase:** previously moved selection only. Now, if the buffer is non-empty, the arrow press also clears the buffer in the same gesture (navigation still happens). Reason: arrow navigation implies the user has abandoned hotkey input.
- **`ForgeFormSnapshot` and `ForgeUpdateFormSnapshot`:** previously carried `name`, `description`, `model`, `effort`, `executeOnNote` (+ update-mode extras). Now also carry `hotkey: Hotkey | null`. Reason: required to thread the new field through to the meta-spell prompts.
- **Forge create and update system-prompt templates:** previously instructed the LLM to write `grimoire-execute-on-note` only. Now also instruct it to write `grimoire-hotkey: <value>` when provided, and (in update mode) to remove the key when cleared. Reason: makes the new field survive a Forge round-trip.
