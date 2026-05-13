# 011 — Cast Log Panel

> Complexity: **Medium**. Reader + folder + formatter are mechanical; the refresh coordinator (vault `modify` event vs. mtime-poll fallback) and the tick coordinator both want careful separation. The pitch is precise about scope and explicit about what is out of scope.

## Goal & scope

### Goal
Surface every cast (live + forge) recorded in `cast-log-local.jsonl` and `cast-log-remote.jsonl` inside the Command Popup's Logs tab. The user opens the popup, hits `Tab` to reach **Logs**, and sees a reverse-chronological list of past and in-flight casts with status, model, duration, and a clickable expansion that links back to context notes / affected files. The view stays in sync with on-disk state within ~1 s of any append, and in-flight durations tick once per second while the panel is open.

### In scope
- Read both JSONL files via an extended `CastLogStore` reader API; tolerate missing files; drop unparseable lines silently.
- Fold an event stream into per-`castId` records by stage priority (`casted → in-progress → done|error`, never regress; later fields fill empty slots).
- Reverse-chronological flat list keyed off the `casted` timestamp.
- Inline row: display name (spell name or `Forge: <name>` from first `affectedFiles`, falling back to bare "Forge" in flight), model+effort badge, relative "started" stamp, duration, status badge with colour class.
- Header in-flight count, hidden when zero.
- Click row → toggle expansion; rows independent; expansion keyed by `castId` survives re-renders.
- Expanded body: `castId` (monospace, selectable), context notes (clickable internal links), affected files (clickable internal links), follow-up text (muted), executes-on-note indicator for live spells; em-dash placeholders for fields not yet populated; hide `executeOnNote` row for forge casts.
- Clicking a context-note / affected-file link opens the file in the workspace AND dismisses the popup.
- Real-time refresh: subscribe to vault `modify` filtered to both log paths; re-read, re-fold, re-render on each emission. Fallback: 1.5 s mtime poll active only while panel is open, engaged automatically if the vault-modify probe does not fire within an initial settling window.
- One-second tick (only when panel is open) updates all in-flight durations and relative timestamps in lockstep; cleared on panel hide / popup close.
- Stale in-flight casts render as perpetually in-flight (no timeout correction).
- Replace the placeholder `LogsPanel` (currently rendering hardcoded `{ name: "log 1" }`) with a real `CastLogPanel`. Retire `src/ui/components/LogList.ts`, `src/ui/components/LogRow.ts`, `src/domain/logs/Log.ts` — superseded.

### Out of scope (deferred — pitch's explicit no-gos)
- Keyboard navigation inside the panel (no arrow keys, no Enter-to-toggle, no Tab-within-expanded, no selection cursor). The existing tab-cycle `Tab` key still works.
- Filter input on Logs tab (`f`-to-reveal).
- Deletion (single-row or bulk clear).
- Completion `Notice` toasts.
- Re-cast affordance.
- Diff view / change preview.
- Grouping or sorting controls.
- Log retention / rotation / size cap.
- Stale-cast timeout detection.
- Tooltips / hover cards.
- Reading from `cast-log-remote.jsonl` having any producer yet — the reader handles its absence; a remote producer is a separate iteration.

## Components

| Component | Location | Responsibility |
|---|---|---|
| `CastLogStore.readAll` (extension) | `src/castLog/store.ts` | Read both JSONL files, parse line-by-line, drop bad lines silently. Returns a flat array of valid `CastLogEvent`s. |
| `foldEvents` | `src/castLog/foldEvents.ts` | Pure: `(events: CastLogEvent[]) => CastRecord[]`. Group by `castId`, apply stage-priority rules, sort reverse-chronological by `casted` timestamp. |
| `CastRecord` (type) | `src/castLog/CastRecord.ts` | Per-cast aggregated shape: `castId`, `status`, `spellPath`, `model`, `effort`, `contextNotes`, `followUp?`, `executeOnNote?`, `affectedFiles?`, `castedTs`, `startedTs?`, `endedTs?`, `errorMessage?`. |
| `formatRelativeTime` | `src/castLog/format/relativeTime.ts` | `(then: Date, now: Date) => string`. "just now" / "Xs ago" / "Xm ago" / "Xh ago" / "yesterday" / absolute (e.g. `May 7`) after 7 days. |
| `formatDuration` | `src/castLog/format/duration.ts` | `(ms: number) => string`. "0.4s" / "12s" / "1m 04s" / "1h 02m". |
| `resolveDisplayName` | `src/castLog/format/displayName.ts` | `(record: CastRecord) => string`. Spell `basename` from `spellPath` for live casts; `Forge: <name>` from first `affectedFiles` for completed forge casts; bare `Forge` while in-flight. |
| `statusBadge` | `src/castLog/format/statusBadge.ts` | `(status) => { label, cls }`. Maps `casted|in-progress → neutral`, `done → success`, `error → failure`. |
| `CastLogReader` (interface) | `src/castLog/CastLogReader.ts` | DIP seam consumed by panel: `read(): Promise<CastLogEvent[]>`. Implemented by `CastLogStore`. |
| `CastLogSource` | `src/castLog/CastLogSource.ts` | Composes `CastLogReader` + `foldEvents`. `load(): Promise<CastRecord[]>`. The panel's only data dependency. |
| `RefreshCoordinator` | `src/castLog/RefreshCoordinator.ts` | Subscribes to vault `modify`, filters to the two log paths, debounces (50 ms trailing) and re-fires `onRefresh`. Probes for events within a startup window; if no event arrives where one is expected, escalates to a 1.5 s mtime-poll. Owns its own teardown. |
| `TickCoordinator` | `src/castLog/TickCoordinator.ts` | Starts/stops a 1 s interval; emits `onTick`. Stateless beyond the interval handle. |
| `CastLogPanel` | `src/ui/tabs/CastLogPanel.ts` | `TabPanel` impl. Orchestrates source ↔ refresh ↔ tick ↔ list. Owns the expanded-`castId` set and the in-flight count header. |
| `CastLogList` | `src/ui/components/CastLogList.ts` | Renders the header (in-flight count) + flat row list. Diff-friendly re-render: rebuilds rows on re-fold, but preserves the expanded set via `castId`. |
| `CastLogRow` | `src/ui/components/CastLogRow.ts` | Renders one inline row + expandable body. Knows how to repaint its own relative-time / duration spans on tick without a full re-render. |
| Wiring | `src/main.ts`, `src/ui/CommandPopup.ts` | Construct `CastLogPanel` with `{ source, refresh, tick, openLink, close }` and inject it in place of the stub `LogsPanel`. |
| Files retired | `src/ui/tabs/LogsPanel.ts`, `src/ui/components/LogList.ts`, `src/ui/components/LogRow.ts`, `src/domain/logs/Log.ts` | Deleted — the placeholder list/row + the `{ name: "log 1" }` hardcoded entry. |

## Interfaces

```ts
// src/castLog/CastRecord.ts
export type CastStatus = 'casted' | 'in-progress' | 'done' | 'error';

export interface CastRecord {
  readonly castId: string;
  readonly status: CastStatus;
  readonly spellPath: string;        // "<forge>" sentinel for forge casts
  readonly model: string;
  readonly effort: Effort | null;
  readonly contextNotes: readonly string[];
  readonly followUp?: string;
  readonly executeOnNote?: boolean;  // present only for live casts
  readonly affectedFiles?: readonly string[];
  readonly castedTs: string;         // ISO — always present (records without a casted event are dropped)
  readonly startedTs?: string;       // ISO — from in-progress event
  readonly endedTs?: string;         // ISO — from done/error event
  readonly errorMessage?: string;
}

// src/castLog/CastLogReader.ts
export interface CastLogReader {
  readAll(): Promise<CastLogEvent[]>;
}

// src/castLog/CastLogSource.ts
export interface CastLogSource {
  load(): Promise<CastRecord[]>;
}

// src/castLog/RefreshCoordinator.ts
export interface RefreshCoordinator {
  start(onRefresh: () => void): void;  // begins watching
  stop(): void;                         // tears everything down
}

// src/castLog/TickCoordinator.ts
export interface TickCoordinator {
  start(onTick: () => void): void;
  stop(): void;
}

// CastLogPanel ctor
export interface CastLogPanelDeps {
  source: CastLogSource;
  refresh: RefreshCoordinator;
  tick: TickCoordinator;
  openLink: (vaultPath: string) => void;   // forwards to app.workspace.openLinkText + popup close
  now: () => Date;                          // injected for testability
}
```

## Data flow

```
plugin onload
  ├── castLogStore = new CastLogStore({ getLogPathAbs (local), getRemoteLogPathAbs })
  └── (in CommandPopup factory)
       castLogPanel = new CastLogPanel({
         source: new CastLogSource({
           reader: castLogStore,                                    // .readAll() resolves BOTH local+remote
           foldEvents,
         }),
         refresh: new VaultRefreshCoordinator({
           vault: app.vault,
           watchedVaultPaths: [<vault-rel local>, <vault-rel remote>],
           watchedAbsPaths:   [<abs local>, <abs remote>],
           pollIntervalMs: 1500,
           debounceMs: 50,
           settlingWindowMs: 3000,
         }),
         tick: new IntervalTickCoordinator({ intervalMs: 1000 }),
         openLink: (path) => { app.workspace.openLinkText(path, '', false); popup.close(); },
         now: () => new Date(),
       })

Popup open → user hits Tab → Logs tab active:
  CastLogPanel.mount(container)
    → source.load()                         // async; while pending render an empty list shell
    → refresh.start(rerenderFn)
    → tick.start(repaintTimestampsFn)
    → CastLogList.render(records, expandedIds, now, onToggle)

Vault append on either log file → vault.modify fires → coordinator debounces (50 ms) → onRefresh
  → source.load() → CastLogList.render(records, expandedIds, now, onToggle)
  (or, if events stay silent, mtime poller covers the gap)

Every 1 s while mounted → tick → CastLogList.repaintTimes(now)
  → for each row: in-flight duration = (now - castedTs), relative "started" stamp re-formatted

User clicks row header → row.toggle() → panel.expandedIds.add/delete(castId) → CastLogList.render(...)

User clicks a context-note or affected-file link in an expanded body
  → openLink(path)
  → app.workspace.openLinkText opens the file
  → popup.close() dismisses the popup (same seam as cast/forge dispatch)

Popup closed / tab switched away from Logs:
  CastLogPanel.unmount() (called from switchTab + Modal.onClose)
    → refresh.stop()
    → tick.stop()
    (in-flight records remain on disk; ticker simply pauses)
```

## Key design decisions

1. **Reader is a thin extension of the existing store, not a new class.** The pitch says "through the existing `CastLogStore` interface". `readAll()` is a single method that returns the union of both files' valid events; missing file → empty list; bad line → silently skipped. Rationale: keeps the foundation/store contract intact; future remote producer adds a writer to the same store, not a new reader.

2. **`CastLogSource` is the panel's single data dependency.** It composes reader + folder. The panel never imports `foldEvents` or `CastLogStore` directly. Rationale: testability — the panel tests stub a single seam. SRP — the reader does I/O, the folder is pure, the source composes them.

3. **Folding is pure and total.** `foldEvents` takes the raw event list and returns sorted records. Stage priority is encoded once. Events without a matching `casted` ancestor are dropped (a `done` without a `casted` is meaningless to display). Rationale: a pure function is the highest-leverage unit test; folding is also where the hardest correctness rules live (priority, "later fields fill empty slots", reverse sort).

4. **Expansion state lives on the panel, keyed by `castId`.** Not on rows, not in the list component. Rationale: re-renders rebuild rows; rows can't own state they don't survive. A `Set<string>` of expanded ids is the only state that persists across refresh/tick.

5. **Refresh and tick are coordinator objects, not free `setInterval` calls inside the panel.** Rationale: SRP and lifecycle correctness. The panel only has to call `start` / `stop`; the coordinators own debounce, fallback escalation, and interval handles. Mocking one in tests doesn't require mocking the other.

6. **Vault-modify-with-fallback is a single coordinator, not a Strategy.** `VaultRefreshCoordinator` registers a `vault.on('modify', …)` handler at start. The handler trips both the immediate refresh AND a sentinel flag indicating "events arrived". If after a settling window (3 s after `start`) no event has been observed AND a poll-based mtime check has detected change, the coordinator engages the 1.5 s mtime poller as a permanent fallback for the session. Considered Strategy with two coordinators; rejected — only one runs at a time and the escalation logic *is* the coordinator's job. (See Technical Notes.)

7. **Tick and refresh are decoupled.** A tick repaints timestamp/duration spans in place; a refresh re-folds and re-renders the list. Tick must not call `source.load`. Rationale: tick fires 60× per minute; reads from disk should fire only when something changed.

8. **`CastLogRow` exposes a `repaintTimes(now)` method.** Row knows which spans hold relative-time and duration text; tick coordinator calls each row in turn. No DOM diffing framework, no virtual DOM — just targeted `textContent` writes. Rationale: minimal cost per tick; the row already has references to the spans from its constructor.

9. **`openLink` is a single injected callback.** It already encapsulates `app.workspace.openLinkText(path, '', false)` AND popup `close()`. The panel and the row treat link-click as one action. Rationale: hides the dual-action contract behind a single seam; the row never imports `app` or popup internals.

10. **Display name for forge casts: `Forge: <basename(first affectedFiles)>` after `done`; bare `Forge` while in-flight.** No probing of follow-up text, no name extraction from the meta-prompt. Rationale: `affectedFiles` is the only stable channel — the meta-prompt rename ("collision-renaming to `<name>-2.md`") means the sanitised name is not necessarily the on-disk name.

11. **Relative time thresholds:** `<10s → "just now"`, `<60s → "Xs ago"`, `<60m → "Xm ago"`, `<24h → "Xh ago"`, `<48h → "yesterday"`, `<7d → "X days ago"`, `≥7d → absolute (e.g. "May 7")`. Rationale: matches the pitch's "3m ago / yesterday / absolute after a few days"; 7 days is the cutoff for "a few".

12. **Duration formatting:** under 1 s → "0.Xs"; 1–59 s → "Xs"; 1–59 min → "Xm YYs"; ≥1 h → "Xh YYm". Rationale: precision where it matters; in-flight casts tick at second resolution and need a sub-second slot only at the very start.

13. **Folding rule for "later fields fill empty slots":** when merging a later event into an existing record, copy any field present in the later event that is absent on the record. Stage priority (`casted < in-progress < done = error`) determines the record's `status`, never regressing. Rationale: events arrive in defined disk order but the fold must not assume it; e.g. a stray `in-progress` after a `done` cannot regress `status` to `in-progress`.

14. **Empty list state.** When `records.length === 0`, render a single muted line ("No casts yet"). Header in-flight count is hidden when zero, but the empty-list line is shown regardless. Rationale: hiding everything looks broken.

## Error handling
- **Reader I/O errors** other than ENOENT (e.g. EACCES): caught, logged via `console.error`, treated as "no events from this file". The other file still loads. Rationale: a broken remote log file must not blank out the local log.
- **JSON.parse failure on a line**: dropped silently. No telemetry, no marker — the pitch is explicit.
- **Missing `castId` or `stage` on an otherwise valid JSON object**: dropped as malformed. The fold never sees these.
- **`vault.on('modify', …)` throws or never fires for `.obsidian/plugins/**`**: caught at registration; coordinator escalates to mtime-poll mode (Decision 6). Rationale: the pitch flags this empirically — committing to the fallback path at design time means the plan does not fork.
- **Tick or refresh fires after panel teardown**: each coordinator's `stop()` clears its handle; any in-flight callback checks a `disposed` flag before touching the DOM. Rationale: an inert callback is the only safe thing; tearing down a callback you've already enqueued is awkward in Node timers.
- **`openLink` to a vault path that no longer exists**: Obsidian's `openLinkText` handles missing files (creates / shows "no such file"). We do not pre-validate. Rationale: Obsidian's behavior is the contract.

## Technical notes

- **Vault-modify reliability for `.obsidian/plugins/**` is the one empirical risk.** Decision 6 commits the coordinator to a fallback. Implementation order in section E makes this safe: the vault-modify path is implemented first and verified; if probing during integration testing shows events don't fire for plugin-dir files, the mtime poller is already in the same module and engages without a re-plan.
- **`Vault.on` is the only Obsidian event API used.** The mock at `tests/__mocks__/obsidian.ts` will need `vault.on('modify', cb): EventRef` and `vault.offref(ref)` added for the integration tests. This is a test-mock extension, not a production code change beyond what's described.
- **`Workspace.openLinkText` mock**: needed on `Workspace` for the link-click integration test. Pure stub returning void.
- **The 1.5 s mtime poll** uses `fs.promises.stat` — same `node:fs` dep already pulled in by `store.ts`. No new runtime dependencies.
- **Patterns considered (design-patterns skill):**
  - *Observer* — used for vault `modify` → refresh. Native: `vault.on(...)` is the Obsidian-side publish. Justified.
  - *Strategy for refresh modes (events vs poll)* — considered, rejected. Only one mode is active at a time, and the escalation logic *is* the coordinator's responsibility. Splitting would invert ownership. The fallback is internal state, not pluggable behavior.
  - *Template method on `TabPanel`* — considered, rejected. `LogsPanel` and `SpellsPanel` differ enough (search vs no-search, sentinels vs none, refresh+tick vs static) that a shared base would either be empty or speculative. YAGNI.
  - *State pattern for panel phase* — considered, rejected. The panel has no phase machine — mount → live → unmount. CommandPopup has phases; CastLogPanel does not.
  - *Decorator on `CastLogStore` for reading* — considered, rejected. The reader is a method on the same class, not a wrapping concern. Two methods on one class is fine; the store's responsibility ("read/write the cast log") is unchanged.
- **Design-rubric self-critique answered:**
  - *Single reason to change per component?* Yes — reader (file format), folder (fold rules), formatters (UX wording), refresh (event mechanism), tick (cadence), panel (orchestration). Six axes, six classes.
  - *Are dependencies pointing inward?* `CastLogPanel` depends on `CastLogSource` (interface), `RefreshCoordinator` (interface), `TickCoordinator` (interface), `openLink: (path) => void`, `now: () => Date`. No transitive imports of `obsidian` from the source/folder/formatter modules. Only the panel and the `VaultRefreshCoordinator` know about `App`/`Vault`.
  - *Can each component be unit-tested?* Folder + formatters: trivially (pure functions). Source: stub reader + fold. Coordinators: inject a fake `Vault` and a fake interval. Panel: integration test with mocked `App.vault.on` and a fake source.
  - *Are interfaces minimal?* `CastLogSource.load()` is one method; `CastLogReader.readAll()` is one method; coordinators expose `start/stop`. No surface beyond what each consumer needs.
  - *Anywhere we'd predict pain at 10×?* If the log grows past ~10k events per file, parse cost becomes noticeable. Out of scope (retention is deferred), but `readAll` returning an array is the right shape to swap for a streaming reader later. The fold is O(n).

## Effort summary
**Total: 25 todos** — S:16 M:8 L:1
**Tier mix:** junior-dev:16, senior-dev:4, lead-dev:0, ui-integration-tester:5

Junior-dev dominates because most of the surface is mechanical: pure formatters, a fold function with well-defined rules, row/list DOM components, and most wiring. The senior-dev concentration is the refresh coordinator (vault-events + mtime fallback — the one L todo) and the cross-cutting wiring updates in `main.ts` / `CommandPopup`. Sections C, D, and E open with a `**ui-integration-tester**` group where a component seam is being introduced; scaffolding-only sections (A, B, F, G) do not.

---

## Todos

### A. Domain types & folding (pure)

#### Section briefing
1. **What this section produces** — three new modules: `src/castLog/CastRecord.ts` (record type), `src/castLog/foldEvents.ts` (pure fold), and a small companion `src/castLog/stagePriority.ts` (`casted=0, in-progress=1, done=2, error=2`). See **Interfaces** for the `CastRecord` shape and **Components** for locations.
2. **Design context the executor needs upfront** — Decision 3: *folding is pure and total; events without a matching `casted` ancestor are dropped*. Decision 13: *later fields fill empty slots; stage priority never regresses*. Sort is reverse-chronological by `castedTs`. The fold takes a flat `CastLogEvent[]` (already parsed; deduplication of bad lines is the reader's job, not the fold's).
3. **Cross-section couplings** — `C2` (in section C) consumes `foldEvents`'s output via `CastLogSource`. `A3`'s sort order is what `D` rows assume. No other section depends on internals.
4. **Section-level Red criterion** — `foldEvents` has passing unit tests for: single `casted` → record with `status='casted'`; `casted → in-progress` → `status='in-progress'`, `startedTs` set; `casted → in-progress → done` → `status='done'`, `endedTs` + `affectedFiles` set; `casted → error` → `status='error'`, `errorMessage` set; out-of-order arrival cannot regress status; missing `casted` ancestor → record dropped; reverse-chronological sort by `castedTs`. No I/O, no DOM.

**junior-dev**
- [ ] A1: create `src/castLog/CastRecord.ts` exporting `CastStatus` and `CastRecord` exactly as written in the Interfaces section above — S, junior-dev
- [ ] A2: create `src/castLog/stagePriority.ts` exporting `const STAGE_PRIORITY: Record<CastLogStage, number>` with `casted=0, in-progress=1, done=2, error=2` and a helper `isTerminal(stage): boolean` (true for done/error) — S, junior-dev
- [ ] A3: create `src/castLog/foldEvents.ts` implementing `foldEvents(events: CastLogEvent[]): CastRecord[]` per Decision 13: group by `castId`; drop groups with no `casted` event; for each group, start the record from the `casted` event (sets `castedTs`, `spellPath`, `model`, `effort`, `contextNotes`, `followUp?`, `executeOnNote?`); apply later events in order, copying any field absent on the record, and updating `status` only when the incoming stage has higher priority than current; output sorted by `castedTs` descending. Companion test file exhausting Red criterion above plus: empty input → `[]`; two casts merge independently; `in-progress` after `done` does not regress; `error` carries `errorMessage` and `endedTs`; `done` carries `affectedFiles` and `endedTs` — M, junior-dev

### B. Formatters (pure)

#### Section briefing
1. **What this section produces** — four pure modules under `src/castLog/format/`: `relativeTime.ts`, `duration.ts`, `displayName.ts`, `statusBadge.ts`. All depend only on `CastRecord` (section A) and stdlib `Date`. No DOM, no Obsidian imports.
2. **Design context the executor needs upfront** — Decision 10 (display name: spell basename for live, `Forge: <basename of first affectedFiles>` for completed forge, bare `Forge` while in-flight; `spellPath === '<forge>'` is the sentinel from `castLog/types.ts`). Decision 11 (relative time thresholds: just now / Xs / Xm / Xh / yesterday / X days ago / absolute after 7 d). Decision 12 (duration format: 0.Xs / Xs / Xm YYs / Xh YYm). Statuses map: `casted|in-progress → neutral`, `done → success`, `error → failure`.
3. **Cross-section couplings** — `D` rows call these formatters. No other coupling.
4. **Section-level Red criterion** — each formatter has a unit-test file. `relativeTime` tests cover all 7 bands and the boundary moments (10 s, 60 s, 1 h, 24 h, 48 h, 7 d). `duration` tests cover all 4 bands including 0 ms and large hours. `displayName` tests cover: live spell → basename without extension; completed forge with `affectedFiles[0] === 'Spells/Foo.md'` → `Forge: Foo`; in-flight forge (no `affectedFiles`) → `Forge`; forge with empty `affectedFiles` array → `Forge`. `statusBadge` tests cover all four statuses → `{ label, cls }`.

**junior-dev**
- [ ] B1: create `src/castLog/format/relativeTime.ts` exporting `formatRelativeTime(then: Date, now: Date): string` per Decision 11. Edge cases: `then` in the future (treat as "just now"); exactly-at-threshold (the lower band wins, e.g. 60 s → "1m ago"). Companion test — S, junior-dev
- [ ] B2: create `src/castLog/format/duration.ts` exporting `formatDuration(ms: number): string` per Decision 12. Edge cases: 0 → "0.0s"; negative (clamp to 0); padding two-digit seconds and minutes in compound formats. Companion test — S, junior-dev
- [ ] B3: create `src/castLog/format/displayName.ts` exporting `resolveDisplayName(record: CastRecord): string` per Decision 10. Import `FORGE_SPELL_PATH` from `castLog/types.ts`. Spell name = basename of `spellPath` with `.md` stripped. Companion test — S, junior-dev
- [ ] B4: create `src/castLog/format/statusBadge.ts` exporting `statusBadge(status: CastStatus): { label: string; cls: string }` — labels: "Queued" / "Running" / "Done" / "Failed"; classes: `is-neutral` / `is-neutral` / `is-success` / `is-failure`. Companion test — S, junior-dev

### C. Reader + source composition

#### Section briefing
1. **What this section produces** — extends `src/castLog/store.ts` with a `readAll(): Promise<CastLogEvent[]>` method; introduces `src/castLog/CastLogReader.ts` (interface) and `src/castLog/CastLogSource.ts` (composition). Existing writer code is untouched.
2. **Design context the executor needs upfront** — Decision 1: *reader is an extension of the existing store, not a new class*. Decision 2: *`CastLogSource` is the panel's single data dependency; the panel never imports `foldEvents` or the store directly*. The store currently only owns `getLogPathAbs` for the local file — add a parallel `getRemoteLogPathAbs?: () => string` (optional; when absent, only local is read). Missing files → empty list. Bad JSON lines → dropped silently per pitch.
3. **Cross-section couplings** — `G1` wiring in `main.ts` constructs `new CastLogStore({ getLogPathAbs, getRemoteLogPathAbs })` with a `path.join(pluginDirAbs, 'cast-log-remote.jsonl')` resolver (file does not exist yet — that is the point). `D`'s panel consumes `CastLogSource.load()`.
4. **Section-level Red criterion** — `CastLogStore.readAll` returns the union of valid events from both files; missing files yield `[]`; lines that fail `JSON.parse` are dropped; lines missing `castId` or `stage` are dropped; integration test confirms `CastLogSource.load()` returns a sorted `CastRecord[]` end-to-end against a `readFile` stub.

**ui-integration-tester**
- [ ] C0: integration test at the `CastLogSource` seam: given a stub `CastLogReader` returning a mixed event list spanning two casts (one done, one in-progress), assert `source.load()` resolves with two `CastRecord`s in correct reverse-chronological order, with statuses and timestamps correctly folded. Place under `tests/integration/cast-log-source.spec.ts`. Does NOT exercise the real file system — stubs the reader entirely — S, ui-integration-tester

**junior-dev**
- [ ] C1: extend `CastLogStorePorts` with optional `getRemoteLogPathAbs?: () => string` and `readFile?: (path: string) => Promise<string>` (defaulting to `node:fs/promises#readFile`); add `readAll(): Promise<CastLogEvent[]>` method that reads both paths (if defined), tries each, treats ENOENT as empty, logs other errors via `console.error`, splits by `\n`, drops empty lines, parses each, drops lines that fail to parse or lack `castId`/`stage`. Unit test — M, junior-dev
- [ ] C2: create `src/castLog/CastLogReader.ts` (interface only) and `src/castLog/CastLogSource.ts` (class `CastLogSource` implementing `load()` by calling `reader.readAll()` then `foldEvents()`). Wire `CastLogStore implements CastLogReader` (already satisfies via `readAll`). Unit test confirms `load()` calls reader then fold, returns the result — S, junior-dev

### D. CastLogPanel + DOM rendering (replaces stub LogsPanel)

#### Section briefing
1. **What this section produces** — three new UI modules: `src/ui/tabs/CastLogPanel.ts` (replaces `src/ui/tabs/LogsPanel.ts`), `src/ui/components/CastLogList.ts`, `src/ui/components/CastLogRow.ts`. Plus deletion of the obsolete stub modules (D7).
2. **Design context the executor needs upfront** — Decision 4: *expansion state lives on the panel, keyed by `castId`; rebuilds preserve the set*. Decision 8: *`CastLogRow.repaintTimes(now)` lets ticker update spans in place without re-rendering*. Decision 9: *`openLink` is one injected callback that wraps `openLinkText` + popup close*. Decision 14: *empty list shows muted "No casts yet"; in-flight header count hidden when zero*. The panel implements `TabPanel` (see `src/ui/tabs/TabPanel.ts`); `filter(query)` is a no-op (pitch defers filter input), but must still return `0` to satisfy the contract. `move()`, `confirm()`, `updateSelection()` are also no-ops returning sensible defaults — pitch defers keyboard navigation.
3. **Cross-section couplings** — `D0`'s integration test depends on `C2` (`CastLogSource`) being available so the panel can be constructed against a stub source. `D6` consumes `B1–B4` formatters. `E1` (refresh coordinator) and `F1` (tick coordinator) are injected by `G` wiring; the panel only calls `start`/`stop` on each. `G2` is the corresponding wiring change.
4. **Section-level Red criterion** — mount the panel against a stub source returning two records (one done with two `affectedFiles`, one in-flight). Assert: header reads "1 in flight"; two rows visible with correct display names, badges, durations; clicking a row toggles `is-expanded` and reveals body with `castId`, context-notes links, affected-files links, follow-up, executeOnNote; clicking an affected-file link calls `openLink(path)`; calling `tick.fire()` (test hook) updates the in-flight row's duration text without rebuilding rows; calling `refresh.fire()` re-reads from the source and re-renders, preserving the expanded set; mounting against `[]` shows "No casts yet" and no header count.

**ui-integration-tester**
- [ ] D0: integration test `tests/integration/cast-log-panel.spec.ts` — mount the panel in a happy-dom container against a `FakeCastLogSource` (returns a fixed `CastRecord[]`), a `FakeRefreshCoordinator` (exposes `.fire()` to trigger `onRefresh`), and a `FakeTickCoordinator` (exposes `.fire()`). Assertions per Red criterion above. Use the existing integration setup pattern from `tests/integration/options-panel.spec.ts` for harness style — M, ui-integration-tester
- [ ] D1: integration test (same file): clicking a context-note link in an expanded body calls injected `openLink` exactly once with that path; verifies single call covers both the workspace-open AND popup-dismiss contract (single seam) — S, ui-integration-tester
- [ ] D2: integration test (same file): expansion survives a refresh — expand row A, fire `refresh` (source now returns the same records plus a third), assert row A is still `is-expanded` while rows B and C are not — S, ui-integration-tester

**junior-dev**
- [ ] D3: create `src/ui/components/CastLogRow.ts` — constructor `(container, record, expanded: boolean, now: Date, onToggle: () => void, onOpenLink: (path: string) => void)`. Builds: row `.cast-log-row` with `.cast-log-row-header` (display name span, model+effort badge span `.cast-log-model-badge`, relative-time span `.cast-log-started`, duration span `.cast-log-duration`, status badge span using `statusBadge`) and `.cast-log-row-body` (initially hidden via no `is-expanded`). Body contains: `.cast-log-castid` (monospace, `<code>` element, selectable text); `.cast-log-context-notes` section with each note as a clickable `<a>` link; `.cast-log-affected-files` section ditto; `.cast-log-follow-up` (muted); for live casts, `.cast-log-execute-on-note` row with check/cross indicator (suppressed when `spellPath === FORGE_SPELL_PATH`); em-dash `—` placeholder spans where data not yet present. Header clickable → `onToggle()`. Link clicks → `onOpenLink(path)`. Expose `repaintTimes(now: Date): void` updating `.cast-log-started` and (for in-flight) `.cast-log-duration` text in place. Expose `el: HTMLElement` and `castId: string` for the list. No unit test (covered by D0–D2) — M, junior-dev
- [ ] D4: create `src/ui/components/CastLogList.ts` — constructor `(container, openLink)`. Owns `.cast-log-header` (in-flight count) and `.cast-log-list` (rows wrapper). Method `render(records: CastRecord[], expandedIds: Set<string>, now: Date, onToggle: (castId: string) => void): void` — empties the list, builds new rows, sets header text (`"<n> in flight"` or hides element when 0), renders "No casts yet" when records empty. Method `repaintTimes(now: Date): void` — calls each row's `repaintTimes`. Method `getRowCastIds(): string[]` (for tests). No unit test — M, junior-dev
- [ ] D5: create `src/ui/tabs/CastLogPanel.ts` implementing `TabPanel`. Constructor takes `CastLogPanelDeps`. `mount(container)`: builds a `CastLogList`, calls `source.load()`, on resolve calls `list.render(records, this.expandedIds, this.deps.now(), this.handleToggle)`; calls `refresh.start(() => this.reload())` and `tick.start(() => this.list?.repaintTimes(this.deps.now()))`. Stores `expandedIds: Set<string>`. `handleToggle(castId)`: toggle membership, call `list.render(...)` with current records (cached from last `load`). `reload()`: re-`source.load()` then re-render preserving `expandedIds`. `filter()` returns `0`. `move()` returns `current`. `confirm()`, `updateSelection()`, `reset()` are no-ops. `length` returns `0` (panel doesn't participate in selection). Add a private `unmount()` method that calls `refresh.stop()` + `tick.stop()` + sets a `disposed` flag (callbacks must check). Document at the top of the file: keyboard navigation is intentionally absent per pitch. No unit test (covered by D0–D2) — M, junior-dev
- [ ] D6: wire `B1–B4` formatters into row rendering. Concretely: `CastLogRow` calls `resolveDisplayName(record)`, `formatRelativeTime(new Date(record.castedTs), now)`, `formatDuration(durationMs(record, now))` where `durationMs = (record.endedTs ? Date.parse(record.endedTs) : now.getTime()) - Date.parse(record.castedTs)`, `statusBadge(record.status)`. Place `durationMs` as a small helper either in the row file or `src/castLog/format/durationMs.ts` (preferred — pure, testable). Companion test for `durationMs` if extracted — S, junior-dev
- [ ] D7: delete `src/ui/tabs/LogsPanel.ts`, `src/ui/components/LogList.ts`, `src/ui/components/LogRow.ts`, `src/domain/logs/Log.ts`. Update `src/ui/CommandPopup.ts` imports to remove the old `LogsPanel` import (replacement import wiring lands in G2). Run `npm test` and `npm run lint`; if any existing test files target the deleted modules, remove them in the same commit — S, junior-dev

### E. Refresh coordinator (vault-modify + mtime fallback)

#### Section briefing
1. **What this section produces** — `src/castLog/RefreshCoordinator.ts` (interface) and `src/castLog/VaultRefreshCoordinator.ts` (implementation). The panel injects this; it wraps the vault-modify event subscription and the 1.5 s mtime-poll fallback.
2. **Design context the executor needs upfront** — Decision 6: *vault-modify-with-fallback is a single coordinator, not a Strategy. The handler trips both the immediate refresh AND a "events arrived" sentinel; after a 3 s settling window with no event AND a polled mtime change, engage the 1.5 s mtime poller as a permanent session fallback*. Decision 7: *tick and refresh are decoupled — refresh must not run on the tick path*. The vault paths to watch are the two log files **as vault-relative paths** (`.obsidian/plugins/grimoire/cast-log-local.jsonl` and `…cast-log-remote.jsonl`); `vault.on('modify', file => file.path === …)` filtering. The mtime poller uses absolute filesystem paths via `fs.promises.stat`.
3. **Cross-section couplings** — `D5` calls `refresh.start(reloadCb)` from `mount` and `refresh.stop()` from `unmount`. `G1` wiring constructs the coordinator with both path tuples (vault-relative + absolute) and the `app.vault` reference.
4. **Section-level Red criterion** — unit tests pass: subscribing fires `onRefresh` (debounced 50 ms) when a `modify` event arrives for either watched path; modify events for other paths are ignored; `stop()` unregisters the handler; after `start()` if no event arrives within 3 s but the stat-poller detects an mtime change, the poller fires `onRefresh` and continues polling at 1.5 s; events arriving after fallback engages still fire `onRefresh` and do NOT cause double-fires within the debounce window.

**ui-integration-tester**
- [ ] E0: integration test `tests/integration/cast-log-refresh.spec.ts` — at the coordinator seam with a fake `Vault` (records `on('modify', cb)` and exposes `.fire(file)`), assert that `start(cb)` registers a handler, firing a `modify` for a watched path debounces and calls `cb` once, firing for an unwatched path is ignored, and `stop()` calls `vault.offref`. The mtime-poll fallback path is unit-tested in `E2`, not here (depends on `fs.stat` which is fiddly to integrate-test) — S, ui-integration-tester

**senior-dev**
- [ ] E1: create `src/castLog/RefreshCoordinator.ts` (interface) and `src/castLog/VaultRefreshCoordinator.ts`. Constructor takes `{ vault: Vault, watchedVaultPaths: readonly string[], watchedAbsPaths: readonly string[], pollIntervalMs: number, debounceMs: number, settlingWindowMs: number, stat?: (p: string) => Promise<{ mtimeMs: number }>, setInterval?, clearInterval?, setTimeout?, clearTimeout? }` — all timer/stat ports defaulted to real implementations for production, injected for tests. `start(onRefresh)`: register `vault.on('modify', file => …)`, capture the `EventRef`. Maintain `eventsObserved: boolean` and `lastStat: Map<string, number>` (mtimeMs per abs path). Schedule a settling-window timer that polls all stat paths once at `settlingWindowMs`; if any mtime differs from `lastStat` AND `!eventsObserved`, engage permanent polling (`setInterval(pollIntervalMs)`). All `onRefresh` calls go through a shared debouncer (`debounceMs` trailing). `stop()`: `vault.offref(ref)`, clear timeout, clear interval, set `disposed` flag. Unit tests covering all branches — L, senior-dev
- [ ] E2: edge-case unit test suite for `VaultRefreshCoordinator`: (a) stat error on a watched path during initial sample → treats as unchanged baseline 0 and logs; (b) `start()` called twice without `stop()` → throws (clear contract); (c) `onRefresh` callback throws → coordinator does not unsubscribe; (d) handler fires after `stop()` is queued mid-debounce → does not invoke callback (disposed guard); (e) mtime poller detects no change → does not fire callback — S, senior-dev

### F. Tick coordinator (1 s, decoupled from refresh)

#### Section briefing
1. **What this section produces** — `src/castLog/TickCoordinator.ts` (interface) and `src/castLog/IntervalTickCoordinator.ts` (implementation). The panel injects this; it owns a single `setInterval` and emits `onTick`.
2. **Design context the executor needs upfront** — Decision 5: *coordinators, not free `setInterval` calls inside the panel*. Decision 7: *tick is decoupled from refresh; the tick handler must not call `source.load`*. The panel binds `tick.start(() => list.repaintTimes(now()))`. The interval starts on `start`, stops on `stop`, is single-shot (calling `start` twice asserts).
3. **Cross-section couplings** — `D5` calls `tick.start/stop` from mount/unmount. `G1` wiring constructs with `intervalMs: 1000`.
4. **Section-level Red criterion** — unit tests pass: `start(cb)` arranges for `cb` to be called every `intervalMs` (verified via injected fake timers); `stop()` clears the interval; calling `start` twice without `stop` throws; callback throwing does not stop the interval; `stop` is idempotent.

**junior-dev**
- [ ] F1: create `src/castLog/TickCoordinator.ts` (interface) and `src/castLog/IntervalTickCoordinator.ts` with constructor `{ intervalMs: number, setInterval?, clearInterval? }` (timer ports injectable). Implement `start(onTick)` / `stop()` per Red criterion. Unit test covering all the criterion cases plus: callback that throws — interval continues; `stop` called before `start` is a no-op — S, junior-dev

### G. Wiring (main.ts + CommandPopup + obsidian mock)

#### Section briefing
1. **What this section produces** — extended `tests/__mocks__/obsidian.ts` (Vault event surface + Workspace.openLinkText), updated `src/main.ts` (extra `getRemoteLogPathAbs` on the store; constructs source/refresh/tick coordinators and passes them into the popup), and updated `src/ui/CommandPopup.ts` (constructs `CastLogPanel` with deps, threads `openLink` through to combine `openLinkText` + `close`, tears the panel down on `onClose`).
2. **Design context the executor needs upfront** — Decision 9: *`openLink` is one injected callback that combines `openLinkText` + popup close*. The popup gains one new constructor param: `castLogPanelDeps` of type `Omit<CastLogPanelDeps, 'openLink'>` (the popup wires `openLink` itself because it owns the `close()` route — but `main.ts` provides `source` / `refresh` / `tick` / `now`). The Logs tab construction in `CommandPopup#createSpellsPanel`'s sibling code path must change from `new LogsPanel()` (zero-arg) to `new CastLogPanel({ ...deps, openLink })`.
3. **Cross-section couplings** — **G3 must dispatch before D0–D2 and E0 integration tests** can run, since those tests touch `vault.on` and `workspace.openLinkText` on the mock. `G1` is constrained by `D5`'s constructor and `E1`/`F1`'s constructors — must dispatch after D, E, F. `G2` is constrained by `D5` (uses `CastLogPanel`) — must dispatch after D.
4. **Section-level Red criterion** — `npm test` and `npm run test:integration` green end-to-end; opening the popup, switching to Logs tab, asserting the panel mounts and shows whatever the fake source returns; clicking an affected-file link both opens the file AND closes the popup (verified by the existing modal-lifecycle integration pattern).

**junior-dev**
- [ ] G3: extend `tests/__mocks__/obsidian.ts`: add `vault.on(event: 'modify', cb: (file: { path: string }) => void): EventRef` and `vault.offref(ref: EventRef): void` (real list of subscribers internally, exposed `__fireModify(path)` helper); add `Workspace.openLinkText = vi.fn((path: string, source: string, newLeaf?: boolean) => void)`. Verify existing integration tests still pass — S, junior-dev

**senior-dev**
- [ ] G1: update `src/main.ts` to construct `CastLogStore({ getLogPathAbs, getRemoteLogPathAbs: () => path.join(pluginDirAbs, 'cast-log-remote.jsonl') })`; in `openCommandPopup`, build `castLogPanelDeps = { source: new CastLogSource({ reader: this.castLogStore, foldEvents }), refresh: new VaultRefreshCoordinator({ vault: this.app.vault, watchedVaultPaths: [<vault-relative local>, <vault-relative remote>], watchedAbsPaths: [<abs local>, <abs remote>], pollIntervalMs: 1500, debounceMs: 50, settlingWindowMs: 3000 }), tick: new IntervalTickCoordinator({ intervalMs: 1000 }), now: () => new Date() }`; pass `castLogPanelDeps` into the popup constructor. Compute vault-relative paths from `manifest.dir` + filename (do not hardcode `.obsidian/plugins/grimoire`). Unit test in `tests/main.test.ts` covering construction wiring — M, senior-dev
- [ ] G2: update `src/ui/CommandPopup.ts` — add `castLogPanelDeps: Omit<CastLogPanelDeps, 'openLink'>` to `CommandPopupParams`; replace `new LogsPanel()` with `new CastLogPanel({ ...this.#castLogPanelDeps, openLink: (path) => { this.app.workspace.openLinkText(path, '', false); this.close(); } })`. On `Modal.onClose`, call the cast-log panel's `unmount()` to tear coordinators down (introduce a `unmount?: () => void` optional method on `TabPanel` and call it on `panels.forEach(p => p.unmount?.())` from `onClose`). Update `tests/CommandPopup.test.ts` and `tests/integration/harness.ts` `createPopupHarness` to construct deps stubs — M, senior-dev

---

## Dispatch order

Within each section, group order is fixed: `ui-integration-tester` → `junior-dev` → `senior-dev`. Across sections, the dependency-aware order is:

1. **G3** — mock extension (so D/E integration tests can run).
2. **A** — pure types + fold.
3. **B** — pure formatters.
4. **C** — reader + source (depends on A).
5. **F** — tick coordinator (no dependencies on A–C; can run in parallel with E if dispatched separately).
6. **E** — refresh coordinator (no dependencies on A–C; runs in parallel with F).
7. **D** — panel + DOM (depends on A, B, C, and the E/F interfaces being in place).
8. **G1, G2** — main.ts + CommandPopup wiring (depends on everything above).

The orchestrator dispatches one tier-group at a time per `/implement` invocation, in the order printed within each section.
