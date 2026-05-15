# Cast Log Panel

> `dev/done-010` — 2026-05-14 — Replaces the placeholder Logs tab with a live, auto-refreshing reverse-chronological view of every cast (live + forge) recorded in the local and remote JSONL log files.

## What it does

Opening the Command Popup and pressing `Tab` to reach the **Logs** tab now shows the user's actual cast history. Each row condenses one cast into a single line: display name (spell basename, or `Forge: <file>` for forge casts), model + effort badge, a relative timestamp ("just now" → "3m ago" → "yesterday" → absolute date after 7 days), elapsed or final duration, and a status badge (Queued / Running / Done / Failed). A small header above the list reports how many casts are still in flight, and hides itself when zero. When no events have been logged yet, the panel shows a muted "No casts yet" line.

Clicking a row toggles an expanded body underneath that shows the `castId` (monospace, selectable), context notes and affected files (each rendered as a clickable internal link), the follow-up text, and — for live casts only — an executes-on-note indicator. Clicking any of those links both opens the file in the workspace and dismisses the popup, in one action. Rows expand independently, and the expanded set survives the auto-refresh.

The panel stays in sync with disk in two ways. It subscribes to Obsidian's vault `modify` event filtered to the two log files; if no event arrives within a settling window but a stat poll detects a change, it permanently engages a 1.5 s mtime poller for the rest of the session. Separately, while the Logs tab is open a 1 s ticker repaints relative-time and in-flight duration spans in place. Both stop the moment the tab is hidden or the popup closes.

## Design decisions

- **`CastLogSource` is the panel's single data dependency.** It composes a reader (the existing `CastLogStore`, extended with `readAll()`) and a pure `foldEvents` function. The panel never touches the store or fold directly — one stubbable seam for tests, three single-responsibility units in production.
- **Folding is pure and total.** Events without a matching `casted` ancestor are dropped; stage priority (`casted < in-progress < done = error`) means a stray late event cannot regress a record's status; later events fill empty fields rather than overwrite. Encoded once, so the hardest correctness rules live in a function with no I/O.
- **Vault-modify with a single self-escalating coordinator, not a Strategy.** Only one refresh mode runs at a time and the escalation logic *is* the coordinator's job; splitting it into pluggable strategies would invert ownership. The fallback exists because `vault.on('modify', …)` reliability for files under `.obsidian/plugins/**` is the one empirical risk the plan flagged.
- **Refresh and tick are separate coordinators.** Tick fires 60× per minute and must never trigger a disk read; refresh fires only when something changed. Different cadences, different responsibilities, different mock surfaces in tests.
- **Expansion state lives on the panel, keyed by `castId`.** Re-renders rebuild row DOM, so rows cannot own state they do not survive. A `Set<string>` on the panel is the only state that persists across refresh and tick.
- **`CastLogRow.repaintTimes(now)` updates spans in place.** No DOM diffing framework, no virtual DOM — the row already holds references to its relative-time and duration spans, so each tick is a handful of `textContent` writes.
- **`openLink` is a single injected callback** that wraps `workspace.openLinkText` *and* popup `close()`. The row treats link-click as one action and never imports `app` or popup internals.
- **Forge display name comes only from `affectedFiles`.** No probing of follow-up text or meta-prompt; the meta-spell's own collision-rename logic means the sanitised name is not necessarily the on-disk name. While a forge cast is in flight, the name is the bare word `Forge`.

## Scope

**In:**
- Reading both `cast-log-plugin.jsonl` and `cast-log-agent.jsonl` via an extended `CastLogStore.readAll()`; missing files tolerated, malformed lines silently dropped.
- Reverse-chronological flat list keyed off the `casted` timestamp; in-flight count header; per-row expansion; "No casts yet" empty state.
- Real-time refresh via vault `modify` with mtime-poll fallback; 1 s tick for live timestamps, scoped to while the panel is mounted.
- Clicking context-note or affected-file links opens the file and dismisses the popup.
- Retirement of the placeholder `LogsPanel`, `LogList`, `LogRow`, and `domain/logs/Log.ts` modules.

**Out:**
- Keyboard navigation inside the panel (arrows, Enter-to-toggle, Tab-within-expanded) — deferred per pitch; the existing tab-cycle still reaches Logs.
- Filter input on the Logs tab — deferred; no second use case beyond list filtering.
- Deletion, recast, completion toasts, diff view, grouping/sorting — each its own concern, deferred until prompted by use.
- Stale-cast timeout detection — in-flight rows remain in-flight forever; no producer of stale state to react to yet.
- Tooltips and hover cards — premature; expansion already carries the detail.
- A producer for `cast-log-agent.jsonl` — the reader handles the file's absence; a writer is a separate iteration tied to remote casting.
- Log retention, rotation, or size cap — premature; revisit once vaults accumulate enough events to matter.

## Relationship to existing system

- **First consumer of `cast-log-foundation`'s JSONL contract.** The `CastLogStore` foundation laid the schema and the `casted` / `error` writers; this iteration adds the `readAll()` reader method on the same class.
- **Consumes the full four-stage stream completed by `cast-progress-events`.** The fold expects `casted` → `in-progress` → `done` arriving from the plugin and the hook scripts respectively; the displayed status, started timestamp, and `affectedFiles` all flow from that stream.
- **Replaces the stub Logs tab described in `command-popup-ui`.** The `Tab` keystroke still cycles to Logs, but the panel now mounts `CastLogPanel` instead of `LogsPanel`. The popup also gained a `unmount()` hook on `TabPanel` so `Modal.onClose` can tear down the refresh + tick coordinators.
- **Mirrors the construction style used by `live-spells-and-casting` and `forge-cast`.** Coordinators and source are built in `main.ts`, threaded through `CommandPopupParams`, and the popup adds the popup-owned `openLink` closure at the seam.

## Behavior changes

- **Logs tab content:** previously rendered a hardcoded `{ name: "log 1" }` row that toggled an empty expand. Now reads from the JSONL files and renders real cast history with status, duration, and expansion. Reason: the tab existed only as a placeholder for this iteration.
- **`TabPanel` interface:** previously had no lifecycle teardown method. Now exposes an optional `unmount()` called by the popup on `onClose`. Reason: the Logs tab owns refresh and tick coordinators that must stop when the popup closes.
- **`CommandPopupParams`:** previously took no log-panel deps. Now takes `castLogPanelDeps` (`source`, `refresh`, `tick`, `now`), with the popup itself adding `openLink` at the seam. Reason: composition stays in `main.ts`; the popup stays unaware of the store, fold, or coordinator internals.
- **Plugin `onload`:** previously constructed only the local-log writer. Now also wires a remote-log path on the store and constructs the source + refresh + tick coordinators per popup open. Reason: the reader is one method on the store, but the panel needs the full coordinator set live for the popup's lifetime.
