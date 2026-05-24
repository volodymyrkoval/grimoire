# 034 — Grimoire Cast Log Deletion

> Pitch: `brain/Grimoire - Cast log deletion.md` (authoritative — design calls already made there are honored, not relitigated).
> Complexity: **Complex** (first mutation path on an append-only store; dual-file read-filter-rewrite; concurrency stance; two destructive UI affordances with two confirmation models, threaded panel → list → row).

## Goal & scope

Add two destructive operations to the Cast Log panel:

1. **Delete one cast** — a per-row control strips every line bearing that cast's `castId` from **both** log files (`cast-log-plugin.jsonl` and `cast-log-agent.jsonl`), preserving all non-matching and unparseable lines. Confirmed **inline** (the control flips to confirm/cancel in place — no modal).
2. **Clear all** — a header-level control empties **both** files after a **dialog** that states how many casts will be removed.

Deletion is **unconditional on status** — in-flight rows (the stale "Queued · 67h" case) are the motivating target. The rewrite is itself a vault `modify`, so the existing `VaultRefreshCoordinator` repaints with no special wiring; the deleting device may also refresh immediately.

### Out of scope (from the pitch's No-gos — keep OUT)

- No keyboard deletion (`Del` / `Shift+Del`) or selection cursor — deferred to the keyboard pitch. **This pitch owns the pointer path only.**
- No filter-scoped clear (no filter exists); clear-all is unconditional = clear everything.
- No undo / trash / soft-delete — lines are gone from disk.
- No retention / rotation / auto-pruning.
- No cross-device delete coordination beyond letting Obsidian Sync's last-modified-wins propagate.
- No log-hygiene sweep for orphaned lines (orphaned `in-progress`/`done` from a deleted in-flight cast accrete harmlessly; the fold already drops events with no `casted` ancestor).
- No file-locking against concurrent hook appends — the race is accepted (see Key design decision 2).

## Proposed solution

Two layers, built bottom-up:

1. **Store mutation layer (`CastLogStore`).** Two new methods on the existing store: `deleteCast(castId)` and `clearAll()`. Both operate over the local path and (when configured) the agent path. The delete is a **raw-line** read-filter-rewrite — it must NOT reuse `readAll()`/`#readFromFile`, because that path silently drops unparseable lines; delete must preserve them. A private `#rewriteFileLines(path, keepLine)` helper reads raw text, splits to lines, keeps lines for which the predicate returns true, and writes the remainder back; a missing file is a no-op. `clearAll()` empties each configured file (write empty / remove), tolerating absence.

2. **UI affordance layer.** `CastLogRow` gains a delete control (hover-revealed on desktop, always-present in the expanded body for mobile) wired to an inline confirm/cancel state machine whose pending state is owned by `CastLogPanel` keyed by `castId` (mirroring the existing expansion `Set<string>` precedent). `CastLogList` gains a clear-all control in its header that opens a new `ClearAllConfirmModal` (a `Modal` subclass stating the count). The panel threads two new callbacks — `onDeleteCast(castId)` and `onClearAll()` — down through list and row; both invoke the store and let the refresh coordinator repaint, with an immediate self-`#reload()` so the deleting device doesn't wait for its own vault event.

## Components

| Component | Responsibility | Location |
|-----------|----------------|----------|
| `CastLogStore` (modify) | New `deleteCast(castId)` + `clearAll()`; private `#rewriteFileLines` / `#emptyFile` raw-line helpers; missing-file tolerance | `src/castLog/store.ts` (existing — extended) |
| `CastLogMutator` (interface) | Read-side mirror of `CastLogReader` for the panel's delete dependency: `{ deleteCast(castId): Promise<void>; clearAll(): Promise<void> }` | `src/castLog/CastLogMutator.ts` (new) |
| `ClearAllConfirmModal` | `Modal` subclass: states "Remove all N casts?" with Cancel / Remove buttons; resolves a callback on confirm | `src/ui/components/ClearAllConfirmModal.ts` (new) |
| `CastLogRow` (delete control) | Renders hover/body delete control; inline confirm/cancel flip; emits `onRequestDelete()` / `onConfirmDelete()` / `onCancelDelete()` | `src/ui/components/CastLogRow.ts` (existing — extended) |
| `CastLogList` (clear-all) | Renders clear-all control in header; threads delete callbacks + pending-confirm state to rows | `src/ui/components/CastLogList.ts` (existing — extended) |
| `CastLogPanel` (orchestration) | Owns `#pendingConfirmIds: Set<string>`; wires `onDeleteCast` / `onClearAll`; immediate `#reload()` after a mutation | `src/ui/tabs/CastLogPanel.ts` (existing — extended) |
| Wiring | `CastLogModule.buildCastLogPanelDeps()` adds `mutator`; `CastLogPanelDeps` gains `mutator` | `src/main/CastLogModule.ts`, `src/ui/tabs/CastLogPanel.ts` |

## Interfaces

```ts
// src/castLog/CastLogMutator.ts (new)
/** Removes cast log lines from persistent storage. The panel's destructive-action dependency. */
export interface CastLogMutator {
  /** Removes every line whose castId matches, across all configured log files.
   *  Non-matching and unparseable lines are preserved. Missing files are a no-op. */
  deleteCast(castId: string): Promise<void>;
  /** Empties every configured log file. Missing files are a no-op. */
  clearAll(): Promise<void>;
}

// src/castLog/store.ts — CastLogStore implements CastLogMutator
async deleteCast(castId: string): Promise<void>;   // orchestrates #rewriteFileLines per configured path
async clearAll(): Promise<void>;                    // orchestrates #emptyFile per configured path
#configuredPaths(): string[];                       // [local] or [local, agent] depending on getAgentLogPathAbs
#rewriteFileLines(path: string, keepLine: (line: string) => boolean): Promise<void>; // raw read→filter→write; missing = no-op
#emptyFile(path: string): Promise<void>;            // write '' (or remove) via adapter; missing = no-op
#lineMatchesCastId(line: string, castId: string): boolean; // parse JSON; false (preserve) on unparseable or non-match

// src/ui/components/ClearAllConfirmModal.ts (new) — extends Modal
constructor(app: App, count: number, onConfirm: () => void);
// onOpen() orchestrates #renderMessage() → #renderButtons(); Remove → onConfirm() + close(); Cancel → close()

// src/ui/tabs/CastLogPanel.ts — CastLogPanelDeps gains:
mutator: CastLogMutator;

// CastLogList.render(...) signature gains:
//   onDeleteCast: (castId: string) => void
//   onClearAll: () => void
//   pendingConfirmIds: Set<string>
//   onRequestConfirm: (castId: string) => void
//   onCancelConfirm: (castId: string) => void

// CastLogRow.render(...) / .update(...) gain a delete-control descriptor:
interface RowDeleteControl {
  pendingConfirm: boolean;
  onRequestDelete: () => void;   // idle → confirming (panel adds castId to #pendingConfirmIds, re-render)
  onConfirmDelete: () => void;   // confirming → invoke onDeleteCast(castId)
  onCancelDelete: () => void;    // confirming → idle (panel removes castId, re-render)
}
```

## Data flow

**Delete one cast (happy path):**
```
row delete control click
  → onRequestDelete()  → panel.#pendingConfirmIds.add(castId) → #renderList()
  → row now shows confirm/cancel
confirm click
  → onConfirmDelete() → panel.#handleDeleteCast(castId)
      → mutator.deleteCast(castId)            // store: #rewriteFileLines(local), #rewriteFileLines(agent)
      → panel.#pendingConfirmIds.delete(castId)
      → panel.#reload()                        // immediate self-refresh (don't wait for vault event)
  → row disappears (record gone after re-fold)
  (VaultRefreshCoordinator ALSO fires later from the modify — idempotent re-render)
```

**Clear all:**
```
header clear-all click
  → panel.#handleClearAll()
      → new ClearAllConfirmModal(app, count=records.length, onConfirm).open()
  Remove click in modal
      → onConfirm() → mutator.clearAll() → #emptyFile(local), #emptyFile(agent)
      → panel.#reload()  → list renders "No casts yet"
  Cancel click → modal closes, nothing changes
```

**Rewrite preservation (store internal):**
```
#rewriteFileLines(path, keepLine):
  raw = read(path)            // missing → return (no-op)
  lines = raw.split('\n')
  kept = lines.filter(l => l.trim() === '' ? <preserve-blank-policy> : keepLine(l))
  write(path, kept.join('\n'))
  // keepLine for deleteCast = !#lineMatchesCastId(l, castId)
  // unparseable line → #lineMatchesCastId returns false → keepLine true → PRESERVED
```

## Error handling

- **Missing file** (mobile; cast that never reached a hook; agent log absent): both `deleteCast` and `clearAll` treat a missing file as empty and **never error** — mirror the existing `#readFromFile` ENOENT tolerance. The `adapter.exists()` check gates the read/write.
- **Unparseable line on rewrite:** preserved untouched (the predicate returns "keep"). Quietly discarding junk would turn a delete into a silent mutation of unrelated data (pitch Rabbit hole).
- **Write failure** (disk error mid-rewrite): surface via `console.error` and a `Notice('Could not delete cast — see console')`; do not swallow silently, but do not crash the panel. The pending-confirm state is cleared regardless so the row is not stuck.
- **Concurrent hook append during rewrite:** accepted, not guarded (Key design decision 2). No lock, no retry.
- **Mid-confirm repaint** (1 s tick or refresh coordinator repaints a row that is mid-confirm): the pending-confirm `Set<string>` lives on the panel keyed by `castId`, so a repaint re-derives the confirm state from the panel rather than losing it (Key design decision 4).

## Key design decisions

1. **Delete uses a RAW-LINE rewrite, not `readAll()`/`foldEvents`.** The existing read path silently drops unparseable lines and blank lines. Delete must preserve unparseable lines (pitch Rabbit hole), so it operates on the raw file text with a per-line `castId` matcher, never the parsed event stream. `#lineMatchesCastId` parses each line in isolation and returns `false` (→ keep) on any parse failure or `castId` mismatch. **This is the load-bearing correctness rule of the whole iteration.**

2. **Concurrency stance: accept the race, no locking.** A wholesale rewrite racing an external hook append can clobber a line. Losing is already an accepted state — a cast missing its `done` folds to a perpetually in-flight row, exactly what the panel surfaces honestly. The window is milliseconds around a deliberate, infrequent action; the foundation declined locking on the same `O_APPEND` reasoning. **Do not add a lockfile, retry, or read-after-write check.**

3. **Status never gates deletion.** Any row is deletable including in-flight ones — this is the motivating case (the stale row), not an edge case. The fold cannot distinguish a running cast from a dead one, so there is no honest place to draw a "protected" line. The rejected guard (disabling delete on in-flight rows) is recorded as rejected; **do not reintroduce it.**

4. **Pending-confirm state lives on the panel, keyed by `castId`** — a `Set<string>` mirroring the existing `#expandedIds` precedent. Rows are rebuilt on every refresh/tick, so a row cannot own state it does not survive (pitch Rabbit hole "Confirm-state in a re-rendering list"). The panel derives each row's confirm state from the set at render time.

5. **Single delete = inline confirm; clear-all = dialog.** Fixed by the pitch. Inline confirm flips the control in place (no modal). Clear-all raises a `Modal` stating the count before emptying. No Strategy abstraction over the two — they are two fixed call sites (design-patterns: Strategy rejected, YAGNI).

6. **`CastLogMutator` is a separate interface from `CastLogReader`.** The panel already depends on `CastLogSource` (read). The destructive surface is a distinct capability with a distinct stub in tests; `CastLogStore` implements both. Keeps Interface Segregation — the panel's delete dependency does not carry `readAll`.

7. **Immediate self-`#reload()` after mutation, in addition to the coordinator.** The deleting device repaints without waiting for its own vault event to round-trip (pitch "Self-refresh"). The later coordinator-driven re-render is idempotent.

8. **Delete control reachability: hover on desktop, always-in-body on mobile.** `Platform.isDesktop` (available from the obsidian mock) gates a hover-reveal CSS class on the header control; the expanded body always carries a delete control so mobile (no hover) stays reachable. Both routes share one `RowDeleteControl` descriptor.

## Technical notes

- **No Node.js native APIs** (`fs`/`path`/`child_process`) — use the injected `adapter` (Obsidian `DataAdapter`) exactly as the existing store's `#appendLine`/`#readFile` do. The delete/clear helpers reuse the same `adapter.exists` / `adapter.read` / `adapter.write` / `adapter.remove` surface.
- **Never disable `obsidianmd/*` ESLint rules.** The clear-all control and modal use `new Setting(el).setName(...).setHeading()` / `.addButton(...)` rather than `createEl('h3', ...)`.
- **DOM listener cleanup convention:** all new `addEventListener` calls pass `{ signal }` from an `AbortController` (matches `OptionsPanel`, `ForgeSentinelDetail`, `RefineVariantSelect`). The row's delete-control listeners must be torn down on row re-render/removal.
- **`Platform` import** from `obsidian` (mock exposes `Platform = { isDesktop: true }`).
- **Modal pattern:** the obsidian mock's `Modal` provides `contentEl`, `open()`, `close()`, `onOpen()`, `onClose()`. `ClearAllConfirmModal` follows the same construction style as `CommandPopup` (subclass, build in `onOpen`).
- **Store path set:** `#configuredPaths()` returns `[getLogPathAbs()]`, plus `getAgentLogPathAbs()` when that port is present — mirroring `readAll()`'s existing guard at `store.ts:81`.
- **Blank-line policy on rewrite:** the existing `#readFromFile` skips blank lines on read; appends add a trailing `\n`. The rewrite should normalise to no trailing-blank duplication — `kept.filter(l => l !== '')` for the JSON lines then `join('\n') + '\n'` if non-empty, else `''`. (Junior-dev: settle the exact trailing-newline shape against a round-trip test — append then delete-other then read.)

### Patterns considered and rejected (design-patterns pass)
- **Command pattern** for delete/clear — rejected: no undo, no queue, no log of operations (undo is an explicit no-go). Two plain async methods. YAGNI.
- **Strategy** for inline-vs-dialog confirmation — rejected: two fixed call sites, no runtime selection; the pitch hard-wired each affordance to its confirmation model.
- **GoF State pattern** for the row confirm state — rejected: a 2-state idle↔confirming toggle derived from a panel-owned `Set<string>`; a State class hierarchy is overkill. Plain keyed state (mirrors expansion precedent).
- **Template Method (class hierarchy)** for the per-file rewrite — rejected as a hierarchy; expressed instead as one private helper `#rewriteFileLines(path, keepLine)` taking a predicate. The skeleton (read→filter→write→tolerate-missing) is shared by passing the predicate, no subclassing.

## Perspective synthesis

- **Minimalist:** The smallest viable cut is the store's two methods plus the per-row delete; clear-all is the larger surface (modal + header control). But both are in the pitch's "done when" and the appetite explicitly budgets the dual UI. Nothing further to cut — the raw-line rewrite is irreducible (it is the one hard correctness rule).
- **Extensibility (10×):** The `CastLogMutator` interface is the seam a future Portal-Service-backed store or a filtered/scoped clear would extend. Keeping it separate from `CastLogReader` means a future "clear filtered view" (when a filter lands) adds a method without bloating the read interface. The `#rewriteFileLines(path, predicate)` helper already generalises to "delete by predicate," so scoped clear is a predicate swap, not a rewrite.
- **Devil's advocate (riskiest assumption):** The riskiest failure mode is the rewrite silently corrupting the file — dropping unparseable lines, mangling the trailing newline, or rewriting the wrong file. Mitigation: the raw-line path with explicit preservation, and a round-trip test (append → delete-other-cast → read-all → original survivors intact, unparseable junk intact). Second risk: a row stuck mid-confirm after a repaint — mitigated by panel-owned keyed state.
- **User advocate (feel):** The inline confirm must not be a jarring modal for a single row; the flip-in-place keeps the list stable. The clear-all dialog must state the real count ("Remove all 23 casts?") so the user knows the blast radius. The stale "Queued · 67h" row — the whole motivation — must be deletable in two clicks (delete → confirm). Immediate self-refresh means the row vanishes instantly, not after a poll cycle.

---

## Todos

> Build order: store mutation (scaffolding + logic) → UI scaffolding → row delete affordance (tester-led) → clear-all affordance (tester-led) → wiring. The store layer has no UI seam; the UI sections carry `ui-integration-tester` groups per the UI-integration rule (the plan touches `src/ui/**` components).

### A. Store scaffolding — `CastLogMutator` interface (no tester — scaffolding-only)

#### Section briefing

1. **What this section produces** — `src/castLog/CastLogMutator.ts`: the new `CastLogMutator` interface (`deleteCast`, `clearAll`) — see Interfaces. No logic, just the contract that Section B implements and Section H injects.
2. **Methods produced** — interface only, no method bodies. `CastLogMutator.deleteCast(castId): Promise<void>`; `CastLogMutator.clearAll(): Promise<void>`.
3. **Design context the executor needs upfront** — Key design decision 6: "`CastLogMutator` is a separate interface from `CastLogReader`" — the panel's destructive dependency must not carry `readAll` (Interface Segregation).
4. **Cross-section couplings** — None.
5. **Section-level Red criterion** — the file exists and exports an interface importable by `store.ts` (B) and `CastLogPanel.ts` (H) without a type error.

**junior-dev**
- [x] A1: Create `src/castLog/CastLogMutator.ts` exporting the `CastLogMutator` interface with `deleteCast(castId: string): Promise<void>` and `clearAll(): Promise<void>`, JSDoc per the Interfaces block (preserve non-matching + unparseable lines; missing files no-op). — S, junior-dev

### B. Store mutation — `deleteCast` + `clearAll` (no tester — pure store logic, unit-tested in `tests/`)

#### Section briefing

1. **What this section produces** — extends `src/castLog/store.ts`: `CastLogStore` now `implements CastLogMutator` via `deleteCast` and `clearAll`, plus private raw-line helpers. Unit tests in `tests/castLog/`. Implements `CastLogMutator` from A (see Interfaces).
2. **Methods produced** —
   - `CastLogStore.deleteCast(castId)` — orchestrate raw-line rewrite across all configured paths.
     - `CastLogStore.deleteCast() → #configuredPaths() → #rewriteFileLines(path, keepLine) [per path]`
   - `CastLogStore.clearAll()` — orchestrate empty across all configured paths.
     - `CastLogStore.clearAll() → #configuredPaths() → #emptyFile(path) [per path]`
   - `CastLogStore.#configuredPaths()` — return `[local]` or `[local, agent]` depending on `getAgentLogPathAbs` presence.
   - `CastLogStore.#rewriteFileLines(path, keepLine)` — raw read → split → filter by predicate → write remainder; missing file = no-op.
   - `CastLogStore.#emptyFile(path)` — empty the file via adapter; missing file = no-op.
   - `CastLogStore.#lineMatchesCastId(line, castId)` — parse one line; return false (→ preserve) on unparseable or non-match, true only on exact `castId` match.
3. **Design context the executor needs upfront** — Key design decision 1 (verbatim): "Delete uses a RAW-LINE rewrite, not `readAll()`/`foldEvents` … operates on the raw file text with a per-line `castId` matcher … returns `false` (→ keep) on any parse failure or `castId` mismatch. This is the load-bearing correctness rule." Also Key design decision 2 (accept the race — no lock/retry) and Technical note "Blank-line policy on rewrite."
4. **Cross-section couplings** — B implements the A1 interface (`CastLogStore implements CastLogMutator`). No other section couplings — B is consumed by H (wiring) but does not depend on it.
5. **Section-level Red criterion** — unit tests prove: (a) `deleteCast` removes only matching-castId lines from both files; (b) unparseable + blank + non-matching lines survive; (c) missing agent file is a no-op (no throw); (d) `clearAll` empties both files; (e) `clearAll` tolerates a missing file. Tests stub `adapter` (or `readFile`/`appendLine`-style ports) — never real disk.

**junior-dev**
- [x] B1: Add `#configuredPaths(): string[]` returning `[getLogPathAbs()]` plus `getAgentLogPathAbs()` when the port is present (mirror the guard at `store.ts:81`). Unit-test both-present and local-only. — S, junior-dev
- [x] B2: Add `#lineMatchesCastId(line: string, castId: string): boolean` — `JSON.parse` in a try/catch; on throw or when parsed has no matching `castId`, return `false`; return `true` only on exact match. Unit-test: matching line → true; non-matching → false; unparseable `"{not json"` → false; blank → false. — S, junior-dev
- [x] B3: Add `#rewriteFileLines(path, keepLine: (line) => boolean): Promise<void>` — guard `adapter.exists(path)` (missing → return); read raw; split on `'\n'`; keep lines where `keepLine(line)` is true (preserve blanks/unparseable per the predicate); write back with the trailing-newline shape settled by a round-trip test (Technical note "Blank-line policy"). Unit-test missing-file no-op and preservation of unparseable line. — M, junior-dev
- [x] B4: Add `#emptyFile(path): Promise<void>` — guard `adapter.exists(path)` (missing → no-op); write `''` via adapter. Unit-test missing-file no-op and existing-file emptied. — S, junior-dev
- [x] B5: Add `async deleteCast(castId)` orchestrating `#rewriteFileLines(path, (line) => !this.#lineMatchesCastId(line, castId))` for each `#configuredPaths()`. Declare `CastLogStore implements CastLogMutator`. Unit-test: matching lines removed from BOTH files; non-matching/unparseable survive; agent-file-absent is a no-op. — M, junior-dev
- [x] B6: Add `async clearAll()` orchestrating `#emptyFile(path)` for each `#configuredPaths()`. Unit-test: both files emptied; missing agent file tolerated. — S, junior-dev
- [x] B7 (edge cases): Unit-test the full round-trip — append three `casted` lines (two castIds) + one unparseable junk line via the existing `recordCasted`/raw write, `deleteCast` one castId, then `readAll()` returns exactly the survivors AND a raw read still contains the junk line. Also: `deleteCast` of a castId present in NEITHER file is a clean no-op. — M, junior-dev

### C. UI scaffolding — `ClearAllConfirmModal` shell + deps plumbing (no tester — file shells / type stubs)

#### Section briefing

1. **What this section produces** — `src/ui/components/ClearAllConfirmModal.ts` (new `Modal` subclass shell — see Interfaces) and the `mutator: CastLogMutator` field added to `CastLogPanelDeps` in `src/ui/tabs/CastLogPanel.ts`. Type stubs only; behaviour lands in D/F/H.
2. **Methods produced** —
   - `ClearAllConfirmModal.constructor(app, count, onConfirm)` — store deps.
   - `ClearAllConfirmModal.onOpen()` — orchestrate render. `onOpen() → #renderMessage() → #renderButtons()`.
   - `ClearAllConfirmModal.#renderMessage()` — render "Remove all N casts?" heading/text via `new Setting(...).setName(...).setHeading()`.
   - `ClearAllConfirmModal.#renderButtons()` — render Cancel (→ `close()`) and Remove (→ `onConfirm()` then `close()`) via `.addButton(...)`.
3. **Design context the executor needs upfront** — Key design decision 5: "single delete = inline confirm; clear-all = dialog." Technical note: never disable `obsidianmd/*` — use `new Setting(el).setName(...).setHeading()` not `createEl('h3', ...)`.
4. **Cross-section couplings** — C provides `CastLogPanelDeps.mutator` consumed by H1; C provides `ClearAllConfirmModal` consumed by F (clear-all wiring). No reverse dependency.
5. **Section-level Red criterion** — `ClearAllConfirmModal` compiles and `new`s with `(app, count, onConfirm)`; `CastLogPanelDeps` type now has `mutator: CastLogMutator`; existing panel tests still construct (they will need the new dep — see coupling note for D/F).

**junior-dev**
- [x] C1: Create `src/ui/components/ClearAllConfirmModal.ts` — `extends Modal`, constructor `(app, count: number, onConfirm: () => void)`, with `onOpen()` orchestrating `#renderMessage()` → `#renderButtons()` (method shells; bodies in F). Import `Modal`, `Setting` from `obsidian`. — S, junior-dev
- [x] C2: Add `mutator: CastLogMutator` to `CastLogPanelDeps` in `src/ui/tabs/CastLogPanel.ts` and import the interface from `../../castLog/CastLogMutator`. Do not yet call it. — S, junior-dev

### D. Per-row delete affordance (tester owns the Red criterion; devs make it green)

#### Section briefing

1. **What this section produces** — extends `src/ui/components/CastLogRow.ts` (delete control + inline confirm flip), `src/ui/components/CastLogList.ts` (threads delete callbacks + pending-confirm state to rows), and `src/ui/tabs/CastLogPanel.ts` (owns `#pendingConfirmIds`, wires `#handleDeleteCast`). Implements the `RowDeleteControl` descriptor and the extended `render`/`update` signatures — see Interfaces.
2. **Methods produced** —
   - `CastLogPanel.#handleRequestConfirm(castId)` — add castId to `#pendingConfirmIds`, re-render.
   - `CastLogPanel.#handleCancelConfirm(castId)` — remove castId, re-render.
   - `CastLogPanel.#handleDeleteCast(castId)` — orchestrate the delete. `#handleDeleteCast() → mutator.deleteCast() → #pendingConfirmIds.delete() → #reload()` (with a try/catch surfacing a `Notice` on failure and clearing pending state regardless — Error handling).
   - `CastLogList.render(...)` — extended to forward `pendingConfirmIds`, `onDeleteCast`, `onRequestConfirm`, `onCancelConfirm` into each row's `RowDeleteControl`.
   - `CastLogRow.#buildDeleteControl(host, control)` — render the delete control (idle: a delete button; confirming: confirm + cancel buttons) bound via `{ signal }` from the row's `AbortController`.
   - `CastLogRow` header path → `#buildDeleteControl` on the header (hover-revealed, `Platform.isDesktop`-gated CSS class); body path → `#buildDeleteControl` in the expanded body (always present).
3. **Design context the executor needs upfront** — Key design decision 4 (verbatim): "Pending-confirm state lives on the panel, keyed by `castId` — a `Set<string>` mirroring the existing `#expandedIds` precedent. Rows are rebuilt on every refresh/tick, so a row cannot own state it does not survive." Key design decision 3: status never gates deletion (no in-flight guard). Key design decision 7: immediate self-`#reload()` after mutation. Key design decision 8: hover on desktop, always-in-body on mobile.
4. **Cross-section couplings** —
   - D depends on B5: `#handleDeleteCast` calls `mutator.deleteCast` whose contract (both-file removal, preservation) is defined in B5.
   - D depends on C2: `CastLogPanelDeps.mutator` is the field threaded into `#handleDeleteCast`.
   - D1 (tester) constrains D2–D6: the row delete control must NOT consume the row-header click that toggles expansion — the delete control is a distinct child whose click `stopPropagation()`s so it does not toggle the row (the header click handler at `CastLogRow.#buildHeader` adds the toggle listener to the whole header).
5. **Section-level Red criterion** — an integration test: mounting the panel with a record + a stub mutator, clicking the row's delete control flips it to confirm/cancel without toggling expansion; clicking confirm calls `mutator.deleteCast(castId)` exactly once with the right id and the row disappears after `#reload()`; clicking cancel returns to idle and never calls the mutator; the pending-confirm state survives a `refresh.fire()` repaint mid-confirm.

**ui-integration-tester**
- [x] D0: integration test at `tests/integration/cast-log-delete-row.spec.ts` — seam: `CastLogPanel` → real `CastLogList`/`CastLogRow` via a `FakeCastLogMutator` (`deleteCast` vi.fn, `clearAll` vi.fn) injected through deps. Assert: (a) delete control present per row; (b) clicking it flips to confirm/cancel and does NOT toggle `is-expanded`; (c) confirm → `deleteCast` called once with that castId, row gone after reload; (d) cancel → no mutator call, control back to idle; (e) mid-confirm `refresh.fire()` preserves the confirm state (panel-keyed). — M, ui-integration-tester

**junior-dev**
- [x] D2: Add `#pendingConfirmIds = new Set<string>()` to `CastLogPanel`, plus `#handleRequestConfirm(castId)` (add + `#renderList()`) and `#handleCancelConfirm(castId)` (delete + `#renderList()`), mirroring `#handleToggle`. — S, junior-dev
- [x] D3: Add `#handleDeleteCast(castId)` to `CastLogPanel` orchestrating `await this.#deps.mutator.deleteCast(castId)` → `#pendingConfirmIds.delete(castId)` → `#reload()`, wrapped in try/catch that on failure shows `new Notice('Could not delete cast — see console')`, `console.error`s, and clears the pending id regardless (Error handling). — M, junior-dev
- [x] D4: Extend `CastLogList.render(...)` to accept `pendingConfirmIds`, `onDeleteCast`, `onRequestConfirm`, `onCancelConfirm` and build a `RowDeleteControl` per record (`pendingConfirm: pendingConfirmIds.has(castId)`, the three callbacks closing over `castId`), passing it into `row.render(...)` / `row.update(...)`. Thread the same args from `CastLogPanel.#renderList()`. — M, junior-dev

**senior-dev**
- [x] D5: Extend `CastLogRow` with `#buildDeleteControl(host, control: RowDeleteControl)` rendering idle (delete button → `onRequestDelete`) vs confirming (confirm → `onConfirmDelete`, cancel → `onCancelDelete`) from `control.pendingConfirm`; bind listeners via the row's `AbortController` `{ signal }`; the control's click handlers `stopPropagation()` so the header toggle does not fire (coupling D1). Render one in the header (hover-reveal class gated by `Platform.isDesktop`) and one always in the expanded body (Key design decision 8). Make D0 green. — M, senior-dev (6f4250b)

### E. Clear-all header control scaffolding (no tester — list-header structure only)

#### Section briefing

1. **What this section produces** — extends `src/ui/components/CastLogList.ts`: the header (`.cast-log-header`, currently only the in-flight count) gains a clear-all control element. This section adds the control's DOM + an `onClearAll` callback param threaded from the panel; the modal-opening behaviour lands in F.
2. **Methods produced** —
   - `CastLogList.#renderClearAllControl(host, onClearAll)` — render the clear-all control into the header, listener bound via `{ signal }`; click → `onClearAll()`.
   - `CastLogList.render(...)` / `#updateHeader(...)` — extended to take and forward `onClearAll`, and to keep the control present whenever records exist (hidden in the empty "No casts yet" state alongside the existing `is-hidden` header logic).
3. **Design context the executor needs upfront** — Technical note: never disable `obsidianmd/*`; the header control is a button, not a heading, so a plain element/`ButtonComponent` is fine. The existing `#updateHeader` hides the whole header when in-flight count is zero — the clear-all control must stay reachable whenever there are records (decouple control visibility from the in-flight-count visibility).
4. **Cross-section couplings** — E provides the `onClearAll` seam consumed by F1 (which supplies the modal-opening handler) and the panel handler in F. E's control must remain visible when records exist even though the in-flight count header may be hidden — F's test depends on the control being clickable in a done-only list.
5. **Section-level Red criterion** — with records present, the list header contains a clear-all control element; clicking it invokes the `onClearAll` callback (a vi.fn in this section's unit check); in the empty state no clear-all control is shown.

**junior-dev**
- [x] E1: Extend `CastLogList` with `#renderClearAllControl(host, onClearAll)` and an `onClearAll` param on `render(...)`; render the control in the list header so it is present whenever `records.length > 0` (independent of the in-flight-count `is-hidden` toggle), hidden in the empty state. Bind the click via `{ signal }`. Thread `onClearAll` from `CastLogPanel.#renderList()` as a passthrough for now. — M, junior-dev (17aa613)

### F. Clear-all confirmation + execution (tester owns the Red criterion; devs make it green)

#### Section briefing

1. **What this section produces** — fills in `ClearAllConfirmModal` (C1 shell) bodies and wires `CastLogPanel.#handleClearAll()` to open it and call `mutator.clearAll()` on confirm. Uses the E1 `onClearAll` seam.
2. **Methods produced** —
   - `ClearAllConfirmModal.#renderMessage()` — "Remove all N casts?" via `new Setting(contentEl).setName(...).setHeading()` (count interpolated).
   - `ClearAllConfirmModal.#renderButtons()` — Cancel → `close()`; Remove → `onConfirm()` then `close()`, via `.addButton(...)`.
   - `CastLogPanel.#handleClearAll()` — orchestrate. `#handleClearAll() → new ClearAllConfirmModal(app, count, onConfirm).open()`; the `onConfirm` closure orchestrates `mutator.clearAll() → #reload()` in a try/catch (Notice on failure).
   - `CastLogPanel` deps gain `app` (for the modal) — thread through `CastLogPanelDeps`/wiring if not already present.
3. **Design context the executor needs upfront** — Key design decision 5 (clear-all = dialog stating the count), Key design decision 7 (immediate self-`#reload()`), pitch "done when": clear-all "after a count-stating confirmation, empties both logs and drops the panel to its 'No casts yet' state." Error handling: clear-all write failure → Notice, no crash.
4. **Cross-section couplings** —
   - F depends on E1: the `onClearAll` callback wired in E1 is bound to `#handleClearAll` here.
   - F depends on B6: `mutator.clearAll()` contract (both files emptied, missing tolerated) defined in B6.
   - F depends on C1: `ClearAllConfirmModal` shell.
   - F1 (tester) constrains F2/F3: the modal's Remove button must call `clearAll` exactly once and the panel must drop to "No casts yet" after reload; Cancel must call `clearAll` zero times.
5. **Section-level Red criterion** — an integration test: clicking the header clear-all opens a modal whose text contains the live count; clicking Remove calls `mutator.clearAll()` once and the panel re-renders to "No casts yet"; clicking Cancel calls `clearAll` zero times and leaves the rows intact.

**ui-integration-tester**
- [x] F0: integration test at `tests/integration/cast-log-clear-all.spec.ts` — seam: `CastLogPanel` → `CastLogList` header control → real `ClearAllConfirmModal` → `FakeCastLogMutator`. Assert: (a) clear-all control present when records exist; (b) clicking opens a modal whose text includes the count (e.g. "all 2"); (c) Remove → `clearAll()` called once → panel shows "No casts yet" after reload; (d) Cancel → `clearAll()` zero calls, rows intact; (e) clear-all control absent in the initial empty state. — M, ui-integration-tester

**junior-dev**
- [x] F2: Implement `ClearAllConfirmModal.#renderMessage()` ("Remove all ${count} casts?" via `new Setting(this.contentEl).setName(...).setHeading()`) and `#renderButtons()` (Cancel → `close()`; Remove → `onConfirm()` then `close()` via `.addButton`). Wire `onOpen()` to call both. — M, junior-dev

**senior-dev**
- [x] F3: Add `app` to `CastLogPanelDeps` (and thread it through wiring) and implement `CastLogPanel.#handleClearAll()` — `new ClearAllConfirmModal(this.#deps.app, this.#records.length, onConfirm).open()`, where `onConfirm` orchestrates `await mutator.clearAll()` → `#reload()` in a try/catch (Notice + console.error on failure). Bind it to E1's `onClearAll`. Make F0 green. — M, senior-dev (aebf276)

### G. Styling (no tester — CSS only)

#### Section briefing

1. **What this section produces** — `styles.css` rules for the row delete control (hover-reveal on desktop, always-visible in body), the inline confirm/cancel layout, and the header clear-all control. No TS.
2. **Methods produced** — none (CSS).
3. **Design context the executor needs upfront** — Key design decision 8: hover-reveal on desktop (a `.cast-log-row:hover` rule on the header control), always-visible in the expanded body. The `Platform.isDesktop` class from D5 toggles whether the header control participates in hover-reveal.
4. **Cross-section couplings** — G depends on the class names emitted by D5 (header delete control, body delete control) and E1 (header clear-all control). Names must match what those todos render.
5. **Section-level Red criterion** — visual only; no automated Red. The header delete control is hidden until row hover on desktop; the body delete control and the header clear-all control are always visible when present.

**junior-dev**
- [x] G1: Add `styles.css` rules: hide the header delete control until `.cast-log-row:hover` (desktop-class-gated), keep the body delete control and the inline confirm/cancel buttons laid out inline, and style the header clear-all control. Class names must match those emitted by D5 and E1. — S, junior-dev

### H. Wiring (no tester — composition root; covered by existing full-stack refresh integration test)

#### Section briefing

1. **What this section produces** — `src/main/CastLogModule.ts`: `buildCastLogPanelDeps()` adds `mutator: this.#pluginCastLogStore` (the store already implements `CastLogMutator` after B) and `app: this.#app`. This closes the seam so the real panel gets the real store's delete/clear methods.
2. **Methods produced** — `CastLogModule.buildCastLogPanelDeps()` — extended to include `mutator` and `app` in the returned deps object (no new helper; one-line additions to the existing return).
3. **Design context the executor needs upfront** — Key design decision 6: the store implements both `CastLogReader` (via `CastLogSource`) and `CastLogMutator`; the same `#pluginCastLogStore` instance is the mutator. Key design decision 7: panel does the immediate reload; no extra wiring needed for the coordinator (it already watches both paths).
4. **Cross-section couplings** —
   - H depends on B5/B6: `#pluginCastLogStore` must implement `CastLogMutator` before it can be passed as `mutator`.
   - H depends on C2/F3: `CastLogPanelDeps` must already declare `mutator` and `app`.
5. **Section-level Red criterion** — the existing `tests/integration/cast-log-refresh.spec.ts` (full-stack) still passes, and a delete/clear performed through the real wired panel reaches the real store. Confirm `CastLogPanelDeps` is fully satisfied at the `CommandPopup` construction site (no missing-dep type error).

**junior-dev**
- [x] H1: In `CastLogModule.buildCastLogPanelDeps()`, add `mutator: this.#pluginCastLogStore` and `app: this.#app` to the returned object. Verify `CommandPopup`/`CommandPopupBuilder` construct without a missing-dep type error and the existing cast-log integration tests stay green. — S, junior-dev (aebf276)
- [x] H2 (edge cases): Extend or add a full-stack integration check that a delete through the wired panel removes the cast's lines from both real (stubbed-adapter) files and the panel repaints, and a clear-all empties both — exercising the real store ↔ real panel seam end to end. — M, junior-dev (0d35354)

## Overall effort summary

- **Total:** 21 todos — S: 10, M: 11, L: 0
- **By tier:** ui-integration-tester: 2 (D0, F0) · junior-dev: 15 · senior-dev: 2 (D5, F3) · lead-dev: 0
- **Dominant tier:** junior-dev. The store mutation logic (Section B) is the correctness core but is fully prescribed (raw-line rewrite with a named predicate, missing-file no-op, preservation rule) — mechanical to implement against the unit tests, hence junior-dev. Only the two seam-wiring todos that make the integration tests green (the row delete control's event-propagation interaction with the existing header-toggle handler; the clear-all modal + panel-state orchestration) carry enough cross-component judgment for senior-dev. No lead-dev: the one genuinely hard call (the concurrency stance) is decided by the pitch and explicitly forbids locking/retry, so there is no concurrency code to reason about.

reviewed @ b8d1a48
fixed @ 94dd485
