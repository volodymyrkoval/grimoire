# Grimoire Cast Log Deletion

> `dev/done-032` — 2026-05-24 — Adds two destructive operations to the Cast Log panel: delete a single cast (inline confirm) and clear the entire log (count-stating dialog), both rewriting the underlying JSONL files.

## What it does

The Logs tab can now remove casts, not just display them. Each row carries a delete control — hover-revealed on desktop, always present in the expanded body so it stays reachable on mobile. Clicking it flips the control to an in-place confirm/cancel pair (no modal) without toggling the row's expansion; confirming strips every line bearing that cast's `castId` from both log files and the row disappears at once. Cancelling returns to idle and touches nothing.

The list header gains a clear-all control, shown whenever any casts exist. Clicking it opens a dialog stating the live count ("Remove all 23 casts?"); confirming empties both log files and drops the panel to its "No casts yet" state, while cancelling leaves everything intact.

Deletion is unconditional on status — the motivating case is the stale "Queued · 67h" row that never received its `done` event, so in-flight rows are deletable like any other. After either operation the deleting device repaints immediately rather than waiting for its own vault event; the existing refresh coordinator also fires from the rewrite, and that second repaint is harmless.

## Design decisions

- **Delete is a raw-line rewrite, not a parse-and-rewrite.** The read path used for display silently drops unparseable and blank lines; deletion reads the raw file text, keeps every line whose `castId` does not match (treating any parse failure as "keep"), and writes the remainder back. This preserves unrelated and malformed lines — without it, deleting one cast would silently mutate everything else. This is the load-bearing correctness rule of the iteration.
- **No locking against concurrent appends.** A wholesale rewrite racing a hook append can clobber a line, but a lost line merely folds to an in-flight row — exactly the state the panel already surfaces honestly. The window is milliseconds around a deliberate, infrequent action, and the log foundation declined locking on the same `O_APPEND` reasoning.
- **Pending-confirm state lives on the panel, keyed by `castId`** — a `Set<string>` mirroring the existing expansion-state precedent. Rows are rebuilt on every refresh and tick, so a row cannot own confirm state it would not survive; the panel re-derives each row's confirm state at render time.
- **Single delete confirms inline; clear-all uses a dialog.** Two fixed call sites with two fixed confirmation models — no Strategy abstraction, since nothing is selected at runtime.
- **`CastLogMutator` is a separate interface from the read-side `CastLogReader`.** The panel's destructive dependency does not carry `readAll`; the store implements both. Keeps the delete dependency segregated and independently stubbable in tests.
- **Missing files never error.** Both operations treat an absent file (mobile, an unwritten agent log) as empty, mirroring the reader's existing absence tolerance. A write failure mid-rewrite surfaces a `Notice` and a console error, clears the pending-confirm state regardless, and does not crash the panel.

## Scope

**In:**
- Per-row delete with inline confirm/cancel, reaching both desktop (hover) and mobile (expanded body).
- Header clear-all behind a count-stating dialog.
- Store methods `deleteCast(castId)` and `clearAll()` that operate across the local and (when configured) agent log files via raw-line rewrite / empty.
- Immediate self-refresh after either mutation, on top of the coordinator-driven repaint.

**Out:**
- Keyboard deletion (`Del` / `Shift+Del`) and a selection cursor — deferred to the keyboard pitch; this iteration owns the pointer path only.
- Filter-scoped clear — no filter exists yet, so clear-all is unconditionally clear-everything.
- Undo, trash, or soft-delete — an explicit no-go; deleted lines are gone from disk.
- Retention, rotation, or auto-pruning — premature; not justified by any current use case.
- Cross-device delete coordination beyond Obsidian Sync's last-modified-wins propagation — out of the plugin's reach.
- File-locking against concurrent hook appends — the race is deliberately accepted (see Design decisions).

## Relationship to existing system

- **Extends `cast-log-panel`.** That iteration shipped the read-only Logs view and listed deletion among its deferred concerns; this iteration delivers it, threading two new callbacks (`onDeleteCast`, `onClearAll`) from the panel down through the list and row.
- **Extends the `cast-log-foundation` store.** `CastLogStore` already owned the append-only JSONL writes and the merged reader; it now also implements the new `CastLogMutator` interface. The same store instance is wired in as both reader and mutator.
- **Mirrors the panel's existing expansion-state pattern** — the new pending-confirm `Set<string>` lives where the expansion `Set<string>` already lives, for the same re-render-survival reason.
- **Adds `ClearAllConfirmModal`**, a `Modal` subclass built in `onOpen` in the same style as the existing popup modals, using the Setting-based heading API rather than raw heading elements.

## Behavior changes

- **Logs tab rows:** previously display-and-expand only; now each row also offers delete with inline confirmation. *Why:* removing a cast — especially a stale in-flight row — was the panel's most-requested missing affordance.
- **Logs tab header:** previously showed only the in-flight count and hid itself when that count was zero; now also carries a clear-all control kept visible whenever any casts exist, independent of the count's visibility. *Why:* clear-all must stay reachable even in a done-only list where the count header would otherwise be hidden.
