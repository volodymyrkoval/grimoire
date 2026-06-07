# 041 — Capture MCP writes in `affectedFiles`

> Close the systematic hook-coverage gap that leaves `affectedFiles: []` on every refine cast. Broaden the `PostToolUse` matcher in the documented `settings.local.json` template, and rewrite the path extractor in `post-tool-use.sh` to scan all `tool_input` string values for `.md` paths instead of reading only the native `file_path` key.

## Goal & scope

When a cast writes vault notes via an Obsidian MCP server (any name, any alias — `mcp__obsidian-mcp-tools__create_vault_file`, `mcp__obsidian__vault_write`, `mcp__my-vault__patch_vault_file`, …) the `Stop` hook currently logs `affectedFiles: []` because:

1. The user-side `settings.local.json` matcher only fires `post-tool-use.sh` for `Write|Edit|MultiEdit|NotebookEdit` — MCP tool names never match.
2. Even if the hook fired, the extractor reads `tool_input.file_path` only — MCP servers use `filepath`, `path`, `target`, `note_path`, etc.

Both legs of the gap are documented in `docs/features/cast-progress-events.md` ("Paths captured through Obsidian MCP tools are not in this list yet") and `docs/archive/010-cast-progress-events.md` ("MCP-tool capture in `affectedFiles` — flagged as Rabbit hole; deferred"). The refine flow (`refineTemplate.ts` lines 26–37) explicitly prefers MCP writes, so the gap is the common case, not the corner case.

### In scope

- Rewrite `renderPostToolUseScript` so the embedded Python one-liner walks every top-level string value in `tool_input`, keeping any value that ends in `.md`. Dedupe inside the one-liner; emit one path per output line.
- Cap each candidate string at a length bound (default **512 chars**) before the suffix check, so a long `content` body in `patch_vault_file` cannot dump prose into `affectedFiles`.
- Update the existing happy-path unit tests in `tests/castLog/hookScripts.test.ts` to reflect the new extractor invariants (string-set walk, `.md` filter, 512-char cap).
- Add integration tests in `tests/castLog/hookScripts.integration.test.ts` that prove: extraction works for MCP-shaped payloads with `filepath` / `path` / `target` keys; the `content` body of `patch_vault_file` does not leak into `affectedFiles`; multiple `.md` values in one call are all captured; non-`.md` strings (`Bash` commands, search queries) are filtered out.
- **Matcher ownership: documented-only.** Update `README.md`'s `settings.local.json` template so the `PostToolUse` matcher reads `Write|Edit|MultiEdit|NotebookEdit|mcp__.*` (matches native built-ins **and** any MCP tool — generically, no server name hardcoded). Add a short migration callout above the JSON block. The plugin does **not** start managing or writing `settings.local.json`. (Rationale captured in Key design decisions below — same trap as the 009 `--settings` replace-vs-merge rabbit hole.)
- Live-spec follow-up to `docs/features/cast-progress-events.md` after `/done`: remove the "Paths captured through Obsidian MCP tools are not in this list yet" sentence; record the matcher migration.

### Out of scope

- **Plugin-managed `settings.local.json`.** Considered and rejected (see Key design decisions). Writing into a user-owned file we don't currently materialise breaks the existing "user wires hooks once" contract and risks clobbering permissions / deny-lists / other hooks the user has added.
- **Auto-detecting the user's existing matcher.** No `data.json` migration code, no parsing of `settings.local.json`, no Obsidian Notice nagging the user. The README change is the migration UX.
- **`.canvas` / non-`.md` vault files in `affectedFiles`.** YAGNI — no consumer surfaces non-`.md` writes today; the existing `Write|Edit` matcher already biases toward `.md` in practice.
- **Recursive walk of nested `tool_input` objects.** Top-level string values only. MCP tools the user has surfaced in the wild keep file paths at the top level (`filepath`, `path`, `note_path`). A nested-object MCP tool can be addressed when one shows up.
- **`PreToolUse` capture.** Same boundary as 010 — only successful tool calls count, and MCP results land on `PostToolUse` after the server confirms.
- **Windows PowerShell variant of the hook.** Same boundary as 010.
- **Backfilling old log lines.** No migration of historical `affectedFiles: []` records.

### Acceptance criteria

- `tests/castLog/hookScripts.test.ts` passes the new content-assertions on the rendered `post-tool-use.sh`.
- `tests/castLog/hookScripts.integration.test.ts` passes new integration scenarios for: MCP `filepath` extraction, MCP `path` extraction, multiple `.md` values in one call, `content`-body suppression via the length cap, non-`.md` strings (e.g. `Bash` command, search query) filtered out, native `Write` still extracts `file_path` (regression).
- The existing 4 integration tests for `post-tool-use.sh` (`Write` happy path, apostrophes/unicode, empty `tool_input`, two concurrent casts) continue to pass without modification.
- `README.md` shows the broadened matcher in the `settings.local.json` template; a one-line migration callout above the block names the change.
- `npm run lint`, `npm test`, `npm run test:integration` all exit 0.

### Edge cases (resolved up front — single `AskUserQuestion` not required at this complexity)

The proposed approach already names the dimensions; encoding each as a concrete decision below.

- **Empty `tool_input`** — Python `d.get("tool_input", {})` defaults to `{}`; the comprehension yields `[]`; no scratch write. Preserves the existing D8 invariant.
- **Non-`.md` string values** — filtered by `.endswith(".md")`. Bash commands, search queries, integers, booleans, nested objects all dropped.
- **Long `content` body in `patch_vault_file`** — capped at 512 chars before the `endswith` check. A patch body containing a stray `foo.md` reference is dropped because the whole value exceeds the cap. Path strings are short (Obsidian vault paths are typically < 200 chars).
- **`content` exactly under 512 chars and ending in `.md`** — extremely degenerate; deferred. The cap is a heuristic, not a guarantee. The dedup at `stop.sh` collapses one stray duplicate harmlessly.
- **Multiple `.md` values in one call** — extracted, deduped inside the Python one-liner (`sorted(set(...))`), emitted one-per-line. `stop.sh`'s downstream `sort -u` collapses any cross-call duplicates.
- **Unicode / apostrophes in paths** — Python `json.load` handles JSON-escape; `print` writes UTF-8; existing D7 invariant still holds.
- **`python3` unavailable** — `|| true` falls through; that tool-call's path is dropped silently. Same graceful degradation as today.
- **Tool call with a top-level string value `"foo.md"` that is NOT a vault path** (e.g. a search-result snippet) — false positive, accepted. The MCP servers surveyed don't surface such shapes at the top level today; if one does, address with a per-key allowlist in a follow-up.
- **Matcher fires for `Bash`, `Grep`, `WebFetch`, etc.** — the broadened matcher `Write|Edit|MultiEdit|NotebookEdit|mcp__.*` keeps native non-file tools out. (We explicitly do not use `.*` — see Key design decisions.)
- **User has not updated their `settings.local.json`** — refine casts continue to surface empty `affectedFiles` until they do. The README callout is the migration UX; no in-plugin nag.

## Proposed solution

### High-level shape

```
                ┌────────────────────────────────────────────────────────┐
                │ post-tool-use.sh                                        │
                │  reads stdin JSON                                       │
                │  ↓                                                       │
                │  python3 -c '<extractor>'                               │
                │   ├── parse json                                         │
                │   ├── ti = d.get("tool_input", {})                       │
                │   ├── candidates = [v for v in ti.values()              │
                │   │                  if isinstance(v, str)              │
                │   │                  and len(v) <= 512                  │
                │   │                  and v.endswith(".md")]             │
                │   ├── for p in sorted(set(candidates)): print(p)        │
                │  ↓                                                       │
                │  one line per .md path appended to $SCRATCH             │
                └────────────────────────────────────────────────────────┘
                                       │
                                       ▼
                       stop.sh — unchanged; sort -u still
                       dedupes across the whole cast lifetime
```

### Components

| Component | Location | Responsibility |
|---|---|---|
| `renderPostToolUseScript` (modified) | `src/castLog/hookScripts.ts` | Returns a shell script whose embedded `python3 -c` walks `tool_input` for `.md` strings instead of reading `file_path`. Pure function. |
| `extractMdPathsPython` (new local const) | `src/castLog/hookScripts.ts` | A module-private string constant holding the Python one-liner body. Kept out of the renderer's interpolation for readability and grep-ability. |
| `MCP_PATH_VALUE_MAX_LEN` (new exported const) | `src/castLog/hookScripts.ts` | The 512-char cap exposed as a named const so tests can assert on it. |
| `tests/castLog/hookScripts.test.ts` (modified) | tests | New content-assertions: rendered script contains the `tool_input` traversal, the cap value, the `.endswith(".md")` filter, the `sorted(set(...))` dedup. |
| `tests/castLog/hookScripts.integration.test.ts` (modified) | tests | New scenarios: MCP `filepath` key, MCP `path` key, multiple `.md` values, `content`-body suppression, native `Write` regression, non-`.md` strings dropped. |
| `README.md` (modified) | docs | `PostToolUse` matcher in the `settings.local.json` JSON template broadened to `Write|Edit|MultiEdit|NotebookEdit|mcp__.*`; one-line migration callout above the JSON block. |

### Interfaces

`renderPostToolUseScript` keeps its current signature; the change is purely in the rendered body.

```ts
// src/castLog/hookScripts.ts — modified
export const MCP_PATH_VALUE_MAX_LEN = 512;

export function renderPostToolUseScript(args: { scratchDirAbs: string }): string;
```

The Python extractor (literal body):

```python
import sys, json
d = json.load(sys.stdin)
ti = d.get("tool_input", {})
if isinstance(ti, dict):
    paths = sorted({
        v for v in ti.values()
        if isinstance(v, str) and len(v) <= 512 and v.endswith(".md")
    })
    for p in paths:
        print(p)
```

The shell wrapper:

```sh
#!/bin/sh
set -e
[ -z "$CAST_ID" ] && exit 0
SCRATCH_DIR="<abs>"
mkdir -p "$SCRATCH_DIR"
SCRATCH="$SCRATCH_DIR/$CAST_ID.paths"
python3 -c '<extractor>' 2>/dev/null >> "$SCRATCH" || true
exit 0
```

Note the contract shift: the script no longer guards with `if [ -n "$FILE_PATH" ]` because Python writes zero lines when there are no matches — empty stdout, empty append. The `>> "$SCRATCH"` line is unconditional.

### Data flow

1. Claude Code fires `PostToolUse` for any tool whose name matches `Write|Edit|MultiEdit|NotebookEdit|mcp__.*` (user's `settings.local.json`).
2. `post-tool-use.sh` reads the payload on stdin: `{"tool_name":"…","tool_input":{…},"tool_response":{…}}`.
3. The embedded Python:
   - parses the JSON;
   - takes `tool_input.values()`;
   - keeps strings ≤ 512 chars ending in `.md`;
   - dedupes (sorted set), prints one per line.
4. Each printed line appends to `$SCRATCH_DIR/$CAST_ID.paths`.
5. `stop.sh` (unchanged) drains the scratch, runs `sort -u`, prefixes-strips against `VAULT_ROOT`, JSON-encodes into the `done` line's `affectedFiles`.

### Error handling

- **`python3` missing or crashes** — `|| true` keeps the script exit code 0; that tool-call's paths are dropped. Same graceful degradation as today.
- **Malformed JSON on stdin** — `json.load` raises, captured by `2>/dev/null || true`, dropped. Same as today.
- **`tool_input` is not an object** (e.g. some MCP server returns an array) — `isinstance(ti, dict)` short-circuits to no output.

### Technical notes

#### Key design decisions

1. **Matcher ownership: documented-only.** Plugin does **not** materialise `settings.local.json`. Same rationale as 009/010: `settings.local.json` is user-owned and mixes permissions, deny-lists, and the user's own hooks. The plugin would have to merge a JSON file structurally rather than write fresh content; that's a maintenance burden disproportionate to the one-line change a user has to make. README callout is the migration UX, matching how the file was introduced in the first place (010 already asked users to add three hook entries by hand).
2. **`mcp__.*` over `.*` in the matcher.** A bare `.*` would fire for every tool call (`Bash`, `Grep`, `WebSearch`, …) — cheap (one Python subprocess each, dropped immediately because the strings don't end in `.md`), but noisy in Claude Code's own hook log and burns wall-clock on every Bash subshell. Explicit `mcp__.*` keeps the matcher honest: it fires only for tools that could write vault notes.
3. **Top-level string scan over named-key allowlist.** The constraint is "no MCP server names hardcoded". The matching corollary is "no MCP parameter names hardcoded". `filepath`, `path`, `target`, `note_path`, `file_path`, `vault_path` — every server picks its own. A blanket scan over `tool_input.values()` filtered by `.endswith(".md")` is generic and grep-stable. Cost: occasional false positive (see edge case below); benefit: works for any MCP server the user happens to mount.
4. **512-char length cap on candidate strings.** A `patch_vault_file` call can carry a multi-KB `content` body. A naive scan would treat that whole blob as a candidate path. The cap is a cheap, deterministic filter — vault paths are short (commonly < 200 chars, well under 512); patch bodies are not. The cap is exposed as `MCP_PATH_VALUE_MAX_LEN` so tests can assert on it and a future change has one knob to turn.
5. **`sorted(set(...))` inside Python.** Two reasons. (a) Stable output regardless of dict iteration order (which is insertion-order in Python 3.7+, but stability across MCP server impls is not promised). (b) Pre-dedupes the per-call paths so that a tool returning the same path under two keys (e.g. `path` and `target`) yields one line.
6. **One line per path on stdout.** Existing `stop.sh` reads the scratch with `sort -u` line-by-line. The script-to-script contract is unchanged.
7. **Pure renderer — no I/O, no module state.** Same shape as the other renderers in `hookScripts.ts`. The Python body is a const string; the shell body is a template literal; the function is a string concat. Tests assert on the returned string.
8. **No new dependency.** `python3` is already a precondition (010); the Python stdlib (`json`, `sys`) is enough.

#### Patterns considered (per `design-patterns` skill, Step 1 checklist)

- **Strategy** for extractor variants (native-keys-only vs. all-strings vs. MCP-only) — *rejected*: there's exactly one extractor now; YAGNI. The "fallback to file_path" behaviour is naturally subsumed by the all-strings scan because native `Write` puts the path under `file_path` (a string), which the scan picks up anyway.
- **Chain of Responsibility** between "try file_path → try filepath → try path → …" — *rejected*: the all-strings scan is one pass; the chain is the wrong shape.
- **Template Method** between the three hook scripts — *rejected for the same reason as 010*: the shapes diverge (no-stdin / stdin-parse / scratch-drain). Renderer functions sharing string constants is enough.
- **Dependency Injection** at the script level (inject the extractor) — *rejected*: the extractor is shell-embedded data, not a TypeScript collaborator. The TS-side already injects the writeFile / mkdir ports at `HookMaterializer`.
- **Singleton / Module const** for the Python source — *applied*: `extractMdPathsPython` const, mirroring how 010 used path constants.

#### Design-rubric self-critique (Section 7)

- **Q1 ("one reason to change") — component level.** `renderPostToolUseScript` has one reason to change: the on-disk shape of the script. ✓
- **Q1 — method level.** The function builds a string. No god-method risk: it's a single template literal interpolated with two constants (`shellEscape(scratchDirAbs)`, the Python body). No helpers needed.
- **Q2 — god object?** No. Renderer remains pure.
- **Q3 — dependencies one-directional?** Yes. The Python const is a module-private string; renderer reads it; nothing reads the renderer's output except `HookMaterializer` (unchanged) and the integration tests.
- **Q4 — contract-change cascade?** Changing `MCP_PATH_VALUE_MAX_LEN` touches one site. Changing the extractor's Python body touches one site. The shell wrapper is unchanged. ✓
- **Q5 — unit-testable in isolation?** Yes. The renderer returns a string; tests grep it. The integration tests run real `sh` against fixtures — same harness as 010.
- **Q6 — abstractions invented for later?** No. No allowlist, no per-key whitelist, no MCP-server-specific shim. The scan is the whole design.
- **Q7 — module boundaries honest?** Yes. The change lives entirely in `src/castLog/hookScripts.ts`; tests in `tests/castLog/hookScripts*.test.ts`; docs in `README.md`. No new file, no new module.

#### Dependencies

- No new npm packages.
- `python3` already a precondition (010); no change.

#### Test stubbing

- Unit tests: assert on string content of the renderer output.
- Integration tests: real `sh` + `python3` via `child_process.spawnSync`, same harness already established in `hookScripts.integration.test.ts`.

## Todos

### A. Renderer rewrite (`src/castLog/hookScripts.ts`)

#### Section briefing

**What this section produces:**
- Modifies `src/castLog/hookScripts.ts`:
  - Adds an exported const `MCP_PATH_VALUE_MAX_LEN = 512`.
  - Adds a module-private const string `extractMdPathsPython` holding the Python one-liner (multi-line OK; embedded verbatim into the rendered script via `python3 -c`).
  - Rewrites the body of `renderPostToolUseScript` so the rendered script invokes `python3 -c '<extractMdPathsPython>'` and unconditionally appends stdout to `$SCRATCH`.

**Methods produced:**
- `renderPostToolUseScript(args)` — pure function; returns the rendered shell script string. Single template literal; no helpers needed.

**Design context the executor needs upfront (verbatim from Key design decisions):**
- Decision #3: "Top-level string scan over named-key allowlist." The Python iterates `tool_input.values()`, not specific keys.
- Decision #4: "512-char length cap on candidate strings."
- Decision #5: "`sorted(set(...))` inside Python."
- Decision #6: "One line per path on stdout."

The Python body (paste verbatim):

```python
import sys, json
d = json.load(sys.stdin)
ti = d.get("tool_input", {})
if isinstance(ti, dict):
    paths = sorted({v for v in ti.values() if isinstance(v, str) and len(v) <= 512 and v.endswith(".md")})
    for p in paths:
        print(p)
```

Shell-quoting note: the Python is embedded via `python3 -c '<body>'` — the body must not contain single quotes. The body above uses only double-quoted strings; safe as-is.

**Cross-section couplings:**
- B (integration tests) consumes A's output. Any change to the renderer's Python body must keep B green.
- D (README update) is independent.

**Section-level Red criterion:** `tests/castLog/hookScripts.test.ts` proves the rendered string contains: (1) `python3 -c` invocation; (2) `tool_input` token; (3) `isinstance(ti, dict)`; (4) the literal `512` (or whatever value `MCP_PATH_VALUE_MAX_LEN` resolves to — assert against the exported const, not the literal); (5) `endswith(".md")`; (6) `sorted({` (the set-comprehension dedup); (7) the script still contains `mkdir -p "$SCRATCH_DIR"`, `SCRATCH="$SCRATCH_DIR/$CAST_ID.paths"`, and ends with `exit 0\n` (regression on the un-changed envelope).

**junior-dev**
- [ ] A1: Add failing test in `tests/castLog/hookScripts.test.ts` (under the existing `renderPostToolUseScript` `describe`): assert `renderPostToolUseScript({ scratchDirAbs: '/abs/scratch' })` contains the substring `'isinstance(ti, dict)'`. — S, junior-dev
- [ ] A2: Add failing test: rendered script contains `'endswith(".md")'`. — S, junior-dev
- [ ] A3: Add failing test: rendered script contains the substring `String(MCP_PATH_VALUE_MAX_LEN)` (import `MCP_PATH_VALUE_MAX_LEN` from `src/castLog/hookScripts`). Asserting via the exported const rather than the literal `'512'` keeps the test in sync if the cap changes. — S, junior-dev
- [ ] A4: Add failing test: rendered script contains `'sorted({'` (the set-comprehension dedup token). — S, junior-dev
- [ ] A5: Add failing test: rendered script no longer references the old `file_path` extraction shape — assert `result` does **not** contain the substring `'.get("tool_input",{}).get("file_path"'` (this is the exact substring from the current renderer; the rewrite removes it). Pin to the legacy shape so the test doesn't false-positive on a rewrite that still uses `file_path` as one of several keys. — S, junior-dev
- [ ] A6: Regression: keep the existing `'mkdir -p "$SCRATCH_DIR"'`, `'tool_input'`, and trailing-`'exit 0\n'` assertions in the file green (no change required — just don't delete them). — S, junior-dev
- [ ] A7: Implement: in `src/castLog/hookScripts.ts`, add `export const MCP_PATH_VALUE_MAX_LEN = 512;`. Add module-private `const extractMdPathsPython = \`<python body>\`;` using the verbatim body from Section briefing. The cap value inside the Python body must reference `${MCP_PATH_VALUE_MAX_LEN}` interpolated at TS template-literal time so the two stay in sync (i.e. interpolate the const into the const string). — S, junior-dev
- [ ] A8: Implement: rewrite the body of `renderPostToolUseScript` so the rendered shell script invokes `python3 -c '${extractMdPathsPython}' 2>/dev/null >> "$SCRATCH" || true` in place of the existing `FILE_PATH=$(...)` / `if [ -n "$FILE_PATH" ]` block. Remove the now-dead `FILE_PATH` variable. Keep the surrounding `mkdir -p`, `SCRATCH=` assignment, and `exit 0` lines unchanged. Make A1–A5 green. — M, junior-dev
- [ ] A9: Verify the existing `tests/castLog/hookScripts.test.ts` test `'contains file_path reference'` (line 58–61) still passes — the Python source body still contains the string `"file_path"` only if a key happens to be named that. **Remove this test** instead: the new extractor does not depend on the `file_path` key by name. Replace it with the A5 assertion (already added). — S, junior-dev

### B. Integration tests for the new extractor (`tests/castLog/hookScripts.integration.test.ts`)

#### Section briefing

**What this section produces:**
Six new `it(...)` blocks inside the existing `describe('post-tool-use.sh', ...)` block in `tests/castLog/hookScripts.integration.test.ts`. Each block follows the existing pattern: materialise the script via the real renderer, run via `runShell` with crafted stdin and `CAST_ID=abc`, assert on the scratch-file contents.

**Methods produced:** No new helpers — uses the existing `mkTempDir`, `materializeScript`, `runShell` from the file's top.

**Design context the executor needs upfront (verbatim):**
- Decision #3: top-level string scan; Decision #4: 512-char cap; Decision #5: dedupe inside Python.
- The integration tests exercise `/bin/sh` + `python3` directly; if `python3` is absent the suite skips (existing harness assumption).
- The scratch file contents may have lines in `sorted()` order — assert on a sorted-and-deduped expectation, not on input order.

**Cross-section couplings:**
- B depends on A (renderer rewrite) producing scripts that actually run. B fails until A is done.
- B's scenarios cover the exact gap surfaced by the user's bug report — without these, the fix is not provable.

**Section-level Red criterion:** Six integration scenarios pass against real `/bin/sh`:
1. MCP `filepath` key (singular) — stdin `{"tool_name":"mcp__obsidian-mcp-tools__create_vault_file","tool_input":{"filepath":"notes/foo.md","content":"# hello\nbody"},"tool_response":{}}` → scratch contains `notes/foo.md\n` and **not** `# hello\nbody`.
2. MCP `path` key — stdin `{"tool_name":"mcp__my-vault__update_active_file","tool_input":{"path":"notes/bar.md"},"tool_response":{}}` → scratch contains `notes/bar.md\n`.
3. Multiple `.md` values in one call — stdin `{"tool_name":"mcp__x__move_note","tool_input":{"source":"a.md","target":"b.md"},"tool_response":{}}` → scratch contains both lines, sorted: `a.md\nb.md\n`.
4. `content`-body suppression via length cap — stdin where `tool_input.content` is a 600-char string ending in `.md` and `tool_input.filepath` is `"notes/foo.md"` → scratch contains only `notes/foo.md\n` (the long `content` is dropped).
5. Non-`.md` strings filtered — stdin `{"tool_name":"Bash","tool_input":{"command":"echo hi","description":"say hi"},"tool_response":{}}` → scratch file is empty or absent.
6. Native `Write` regression — stdin from the existing D4 test (`{"tool_name":"Write","tool_input":{"file_path":"foo/bar.md"},"tool_response":{}}`) → scratch contains `foo/bar.md\n` (the existing test from `tests/castLog/hookScripts.integration.test.ts:127` should continue to pass with the new extractor; if the new extractor breaks it, A is wrong).

**senior-dev**
- [ ] B1: Add integration test for scenario 1 (MCP `filepath` extracted, sibling `content` suppressed). Materialise `post-tool-use.sh` via real `renderPostToolUseScript`. Assert scratch file at `<scratchDir>/abc.paths` equals exactly `'notes/foo.md\n'` (no extra lines from the `content` field). — S, senior-dev
- [ ] B2: Add integration test for scenario 2 (MCP `path` key). Assert scratch file equals `'notes/bar.md\n'`. — S, senior-dev
- [ ] B3: Add integration test for scenario 3 (multiple `.md` values, sorted dedup). Build stdin with `{source:"b.md", target:"a.md"}` (intentionally out of insertion order). Assert scratch file equals `'a.md\nb.md\n'` (sorted ascending; sorted dedup inside Python). — S, senior-dev
- [ ] B4: Add integration test for scenario 4 (length cap). Build stdin with `content` = `'x'.repeat(600) + '.md'` (606 chars, ends in `.md`) and `filepath` = `'notes/foo.md'`. Assert scratch file equals `'notes/foo.md\n'` — the 606-char string is dropped because it exceeds 512. — S, senior-dev
- [ ] B5: Add integration test for scenario 5 (non-`.md` strings dropped). Build stdin for a `Bash` tool with no `.md`-suffixed values. Assert scratch file is absent or empty. — S, senior-dev
- [ ] B6: Verify the existing D4 test for native `Write` (line 127–141 of the same file) continues to pass without modification. If it breaks, A is wrong — escalate; do not patch the test. — S, senior-dev
- [ ] B7: Edge regression: existing D7 unicode/apostrophe test (`docs/it's a test/日本.md`) — confirm it still passes. The new extractor's `endswith(".md")` is byte-suffix safe in Python 3 (operates on the str object); JSON-decoded values are `str`, not `bytes`. — S, senior-dev
- [ ] B8: Edge regression: existing D8 empty-`tool_input` test — confirm scratch is empty/absent. The new extractor short-circuits on `isinstance(ti, dict)` plus empty `.values()`. — S, senior-dev

### C. Update unit-test expectations affected by the rewrite

#### Section briefing

**What this section produces:** Removes the stale `'contains file_path reference'` test in `tests/castLog/hookScripts.test.ts` (line 58–61) that asserts the rendered script contains the literal `file_path` token — invalid after the rewrite, since the new extractor does not name `file_path` anywhere. The replacement assertions land in Section A (A5 specifically pins absence of the old shape).

**Methods produced:** None. Test-file edit only.

**Design context the executor needs upfront:** A5 added a stronger replacement assertion (`not.toContain('.get("tool_input",{}).get("file_path"')`). C deletes the now-redundant weak assertion to keep the suite honest.

**Cross-section couplings:**
- C depends on A5 having landed.
- None of B's tests reference the deleted token.

**Section-level Red criterion:** `tests/castLog/hookScripts.test.ts` has no `it('contains file_path reference', …)` assertion. `npm test` still passes (no other test depended on it).

**junior-dev**
- [ ] C1: Delete the test block `it('contains file_path reference', …)` at lines 58–61 of `tests/castLog/hookScripts.test.ts`. Confirm `npm test` still passes (A1–A5 cover the new invariants; A5 covers the absence of the old shape). — S, junior-dev

### D. README matcher migration

#### Section briefing

**What this section produces:** Modifies `README.md` to broaden the `PostToolUse` matcher in the `settings.local.json` JSON template from `"Write|Edit|MultiEdit|NotebookEdit"` to `"Write|Edit|MultiEdit|NotebookEdit|mcp__.*"`. Adds a one-line migration callout immediately above the JSON block.

**Methods produced:** None. Docs edit only.

**Design context the executor needs upfront (verbatim from Key design decisions):**
- Decision #1: "Matcher ownership: documented-only." Plugin does not write `settings.local.json`.
- Decision #2: "`mcp__.*` over `.*`." Keeps the matcher narrow enough to avoid firing on `Bash` / `Grep` / `WebSearch` / native non-file tools.

Current README block (lines 53–62):

```
"PostToolUse": [
  { "matcher": "Write|Edit|MultiEdit|NotebookEdit", "hooks": [{ "type": "command", "command": "sh .obsidian/plugins/grimoire/agent-hooks/post-tool-use.sh" }] }
],
```

Target:

```
"PostToolUse": [
  { "matcher": "Write|Edit|MultiEdit|NotebookEdit|mcp__.*", "hooks": [{ "type": "command", "command": "sh .obsidian/plugins/grimoire/agent-hooks/post-tool-use.sh" }] }
],
```

Migration callout (insert immediately above the JSON code fence at line 38, after the paragraph ending in "every tool call"):

> **Already have a `settings.local.json` from a prior Grimoire version?** Replace the `PostToolUse` `matcher` value with `"Write|Edit|MultiEdit|NotebookEdit|mcp__.*"`. Without `mcp__.*` in the matcher, MCP-based vault writes (the default for Refine) never reach the Cast Log's `affectedFiles`.

**Cross-section couplings:**
- D is independent of A, B, C — purely a docs change.
- D's wording follows the existing README voice (terse, two sentences max for callouts).

**Section-level Red criterion:** `README.md` shows the broadened matcher exactly once, and the migration callout sits immediately above the JSON block. `git diff README.md` shows two changes: one substring replacement in the code block, one paragraph insertion above it.

**junior-dev**
- [ ] D1: Edit `README.md` line 58: replace `"matcher": "Write|Edit|MultiEdit|NotebookEdit"` with `"matcher": "Write|Edit|MultiEdit|NotebookEdit|mcp__.*"`. — S, junior-dev
- [ ] D2: Insert the migration callout paragraph (one blockquote, exactly the wording in Section briefing) immediately above the opening `\`\`\`json` fence currently at line 38. — S, junior-dev
- [ ] D3: Confirm no other README block references the old matcher. Grep `README.md` for `'Write|Edit|MultiEdit|NotebookEdit'` — should yield exactly one match (the line just edited, now with `|mcp__.*` appended). — S, junior-dev

### E. Cleanup + lint + suites

#### Section briefing

**What this section produces:** Runs lint and both test suites; confirms zero new failures, zero new lint violations.

**Methods produced:** None.

**Design context the executor needs upfront:** None — hygiene.

**Cross-section couplings:** None — depends on A–D.

**Section-level Red criterion:** `npm run lint`, `npm test`, `npm run test:integration` all exit 0. `git diff --stat` lists changes only in `src/castLog/hookScripts.ts`, `tests/castLog/hookScripts.test.ts`, `tests/castLog/hookScripts.integration.test.ts`, `README.md`.

**junior-dev**
- [ ] E1: Run `npm run lint`; fix any new violations. — S, junior-dev
- [ ] E2: Run `npm test`; confirm 0 failures, 0 unintentionally-skipped tests. — S, junior-dev
- [ ] E3: Run `npm run test:integration`; confirm 0 failures. — S, junior-dev

## Overall effort summary

- **Total todos:** 23
- **Effort:** S × 22, M × 1, L × 0
- **Dev tiers:** junior-dev × 15, senior-dev × 8 (all in Section B — shell-level integration scenarios share the judgment cost of crafting realistic MCP stdin fixtures), lead-dev × 0
- **No `ui-integration-tester` group** — there is no UI surface; the entire effect is shell-script behaviour and a docs edit.

**Why senior-dev appears at all:**
- **Section B** (integration scenarios): each test crafts an MCP-shaped JSON stdin fixture and asserts the byte-exact scratch file content. The fixture shape encodes a real-world assumption about MCP tool input shapes; getting the regex / length-cap / dedup assertions right requires understanding how the Python extractor will round-trip the input. Keeping the section under one tier (senior-dev across B1–B8) avoids handoff cost.
- All other sections are mechanical: A is grep-assertions on a string the executor authored; C is a deletion; D is a substring replacement; E is `npm` invocations.

## Risks and follow-ups

- **False-positive paths from search-result snippets.** A future MCP tool that surfaces note bodies (not paths) under a top-level string key ending in `.md` would leak. Mitigation: per-key allowlist as a follow-up if it shows up. Not on the roadmap today.
- **`affectedFiles` will grow for refine casts.** A refine cast that reads ten backlinks via MCP `read_note` (returns `{path: 'x.md', content: '…'}` perhaps) could surface those reads as writes if the matcher mistakes a read for a write. Mitigation: the `mcp__.*` matcher still fires on `PostToolUse`, but Claude Code's `PostToolUse` is only for tool *invocations*, not reads-vs-writes semantics — i.e. if the MCP server names a read tool `mcp__obsidian__vault_read` and we capture its `tool_input.path`, that path would be wrongly logged as "affected". **Open question for the reviewer**: should we narrow the matcher to write-shaped MCP tools (e.g. `mcp__.*write.*|mcp__.*create.*|mcp__.*patch.*|mcp__.*update.*|Write|Edit|MultiEdit|NotebookEdit`)? **Plan decision: no, keep `mcp__.*`.** Reasons: (a) tool-naming discipline varies per server — narrowing locks us back into per-server assumptions; (b) the `affectedFiles` field is best-effort observability, not an audit log — over-capture is acceptable; (c) the `Write|Edit|MultiEdit|NotebookEdit` precedent already includes `Read`-adjacent shapes (e.g. `Edit` reads-then-writes). Documented for the reviewer to challenge.
- **Mutation testing** (`/mutate`) should target `hookScripts.ts` after this lands — particularly the Python const string and the `MCP_PATH_VALUE_MAX_LEN` boundary.
- **Live-spec update** after `/done`: patch `docs/features/cast-progress-events.md` to remove the "Paths captured through Obsidian MCP tools are not in this list yet" sentence and add a note about the matcher migration.
- **`python3` availability** remains an unresolved precondition; document in the same live-spec pass.
