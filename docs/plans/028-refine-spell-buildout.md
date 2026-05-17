# 028 — Refine spell buildout

> Pitch: `brain/Grimoire - Refine spell buildout.md`
> Source content: `brain/@agent Collaborate on note.md`
> Canonical reference (lockstep): `brain/Grimoire - Refine Note Spell.md`

## Goal & scope

Port the richer, three-mode Refine prompt body — currently a stripped-down sketch in `src/refine/refineTemplate.ts` — from the user's vault note `@agent Collaborate on note` into the plugin source. The result: the Refine spell body that gets materialised to `<pluginDir>/refine.md` on every load grows from ~30 lines of placeholder to a structured prompt with three fully-described modes (Follow directives, Generate, Expand), explicit vault-search / web-research orchestration, writing style guidance, output-rule discipline that prefers line-level patches, and a step-ordered workflow.

This is a **content-only** change. No plugin code paths change — not Spell Picker, not options panel, not the active-note guard, not the `@cast` marker decorator, not the cast lifecycle, not the materializer, not the dispatcher. Only the string returned by `renderRefineSystemPrompt()` and the snapshot/string-equality tests around it move. As a final step, the canonical reference note `brain/Grimoire - Refine Note Spell.md` is updated in lockstep so its embedded prompt body matches whatever the plugin now ships.

### In scope

- Rewriting the string literal returned by `renderRefineSystemPrompt()` (`src/refine/refineTemplate.ts`) to reflect the new body.
- Adapting `tests/refine/refineTemplate.test.ts` to assert the new structural anchors (mode headings, web-research block, writing style block, output-rule criteria, workflow steps) — string-equality / `toContain` style tests, no new behaviour to verify in the plugin code.
- Updating `brain/Grimoire - Refine Note Spell.md` so its embedded prompt body matches the new `renderRefineSystemPrompt()` output verbatim (lockstep).
- The Mode 1 (Generate) and Mode 2 (Expand) bodies become functionally live as a consequence of the prompt now describing them to Claude — no plugin-side code added; the prompt body itself carries the mode-detection rule and the per-mode procedure.

### Out of scope (per pitch's no-gos and rabbit holes)

- No new modes beyond the three (`Translate`, `Summarise`, `Critique`, etc. → user-authored spells, not built-in).
- No change to how Refine is invoked: Spell Picker entry, options panel, active-note guard, `@cast` marker, cast lifecycle all stand unchanged.
- No plugin-side mode dispatch / word-counting / `@cast` parsing. Mode detection stays in the prompt body, where Claude reads the note and decides.
- No vault-specific bindings carried over: drop `_system/agent-progress-protocol.md`, drop the entire NotebookLM Access section, drop the "Tag conventions for new notes" callout in Mode 3 step 4, drop the personal `ntfy.sh/obsidian-claude-code` notification URL.
- No new MCP tool expectations beyond Refine's current set (Obsidian MCP for vault read/write/search; file-system fallback via `VAULT_MOUNT_PATH`).
- No tuning of web-research orchestration (agent count, role names, freshness check) — the source pattern is the baseline.

## Proposed solution

Port the source `@agent Collaborate on note` body into `renderRefineSystemPrompt()`, applying the six pitch-mandated adaptations:

1. **Marker rename:** every literal `@ai` → `@cast` (Mode detection rule, Mode 3 title, Mode 3 step 1, Mode 3 step 5, any callout referencing the directive marker).
2. **Drop vault-specific bindings:**
   - Drop the Progress Tracking section's `_system/agent-progress-protocol.md` instruction entirely — Refine's progress is owned by the cast lifecycle (`CAST_ID`, hook scripts, cast-log records). The prompt body no longer logs its own `🔄 running` / `✅ done`.
   - Drop the entire NotebookLM Access subsection of "Available MCP Tools."
   - Drop the "Tag conventions for new notes" callout that appears in Mode 3 step 4.
   - Drop the `ntfy.sh/obsidian-claude-code` notification step from the Workflow (final step). Refine's completion notification, if any, is owned by the plugin/cast lifecycle, not the prompt body.
3. **Output Rules flip:** the source says "Replace the entire note body below the YAML frontmatter." Refine **prefers line-level patches** when the change is local — replace specific lines, insert specific lines, leave everything else untouched. Full-body replacement remains an explicit fallback for cases where structural reorganisation (mode 3 splits, sweeping rewrites) makes line-level patches incoherent. The Output Rules section names both modes and gives Claude explicit criteria for choosing.
4. **Keep verbatim after marker rename:** Web Research orchestration (3 parallel agents — Official Sources / Practical Knowledge / Recent Developments — freshness check, DuckDuckGo fallback, "Unverified" callout), Writing Style block (Voice & Style / Structure / Connections / Boundaries), mode boundaries (3-mode order, trigger criteria including the <50-word rule for Mode 1 and the `@cast`-first detection precedence), Workflow step skeleton (read → detect mode → context → research → execute → write).
5. **Keep the mode bodies fuller** than today's placeholder — that is the whole point of the buildout. Each mode keeps its source's step ordering and explicit kinds of vault searches (backlinks via `search_vault_simple("[[note-name]]")`, semantic search via `search_vault_smart`, reading referenced wikilinks).
6. **Lockstep update** of `brain/Grimoire - Refine Note Spell.md` so the code block in that note matches `renderRefineSystemPrompt()`'s new output character-for-character.

The TDD discipline applies: tests assert structural anchors first (mode headings present, marker-rename complete, NotebookLM/ntfy removed, line-level patch criterion present); then the source string is rewritten until the assertions pass. The lockstep note update is a single non-code todo at the end (not test-driven; it lives outside the repo).

## Components

| Component | Location | Responsibility (delta) |
|---|---|---|
| `renderRefineSystemPrompt()` | `src/refine/refineTemplate.ts` | Rewrite the returned string literal to embed the new three-mode body. Signature unchanged: `(): string`. Header comment updated to note "Canonical content reference: `brain/Grimoire - Refine Note Spell.md`" — already present, verify still accurate. |
| `tests/refine/refineTemplate.test.ts` | `tests/refine/refineTemplate.test.ts` | Tests gain new assertions covering the new structural anchors (Mode 1/2/3 headings, Web Research block, Writing Style block, Output Rules line-vs-full criterion, Workflow step ordering, marker rename completeness, dropped sections). Existing assertions (`IMMEDIATE EXECUTION`, `MCP Tools`, `VAULT_MOUNT_PATH`, `@cast`, "exit without modifying nothing requested") are reviewed: keep the ones whose anchor still appears in the new body, replace the ones whose anchor has been restructured. |
| `RefineMaterializer` | `src/refine/RefineMaterializer.ts` | **Untouched.** Re-renders the (now larger) prompt on every plugin load via the same `writeFile` / `mkdir` flow. |
| `tests/refine/RefineMaterializer.test.ts` | `tests/refine/RefineMaterializer.test.ts` | **Untouched.** Existing assertions reference `renderRefineSystemPrompt()` as a value, not its internal anchors — they remain green as the string changes. |
| `brain/Grimoire - Refine Note Spell.md` | Obsidian vault (outside repo) | Lockstep content update — the embedded prompt code block must match `renderRefineSystemPrompt()`'s new output. Updated via Obsidian MCP (`get_vault_file` → filesystem `Edit` at vault root). |

## Data flow

Unchanged from `refine-cast` (018) onward:

```
GrimoirePlugin.onload
  └─► RefineMaterializer.run()
        └─► renderRefineSystemPrompt() → string (now ~10× larger)
        └─► adapter.write(<pluginDir>/refine.md, content)

User casts Refine
  └─► refineCastSpell() → Spell { path: '<refine>', executeOnNote: true }
  └─► CastDispatcher reads systemPromptFilePath = <pluginDir>/refine.md
  └─► Claude Code receives the new three-mode body and executes accordingly
```

The only change in this flow is **what Claude reads at step 4**. Plugin behaviour, file paths, cast lifecycle, log records — all unchanged.

## Interfaces

No new interfaces. The only contract is `renderRefineSystemPrompt(): string`, which keeps its signature.

## Error handling

No change. Materializer's existing try/catch in `onload` continues to swallow failures and log them so the plugin still loads. A larger prompt body raises no new failure modes — `DataAdapter.write` handles arbitrary-length strings.

## Technical notes

- **Source content is the authoritative skeleton.** The full source body is reproduced in the pitch context for this plan. Use it as the porting baseline; apply the six adaptations exactly as listed in "Proposed solution"; do not invent additional sections or reorder the mode boundaries.
- **Order of authoring matters.** Write the tests' new assertions first (red), then update the source string until green. The string-equality nature of the test (Refine prompt is itself a string literal) makes the Red→Green cycle compress to "add assertion → run → fail → edit template → run → pass."
- **Anchor selection for tests.** Pick stable phrases that capture the *intent* of each ported section, not coincidental wording. Examples:
  - `"Mode 1: Generate"` and `"Mode 2: Expand"` and `"Mode 3: Follow"` — mode-heading anchors.
  - `"fewer than 50 words"` — Mode 1's trigger criterion.
  - `"@cast"` (case-sensitive) and *absence of* `"@ai"` — marker rename.
  - `"search_vault_simple"` and `"search_vault_smart"` — vault-search step ordering anchor.
  - `"3 parallel agents"` or `"Agent 1 — Official Sources"`, `"Agent 2 — Practical Knowledge"`, `"Agent 3 — Recent Developments"` — Web Research orchestration anchors.
  - `"Freshness Check"` — preserved verbatim.
  - `"Unverified"` callout body — preserved verbatim, present in the fallback.
  - `"Writing Style"` heading + key phrases like `"Feynman-style"`, `"wikilinks"`, `"do not introduce tangential knowledge"`.
  - `"line-level patch"` (or whatever phrasing the new Output Rules section adopts) and an explicit `"full-body replacement"` fallback mention — proves the flip happened.
  - **Absence assertions:** the body must NOT contain `"NotebookLM"`, must NOT contain `"agent-progress-protocol"`, must NOT contain `"ntfy.sh"`, must NOT contain `"@ai"`. These pin the dropped-bindings adaptations.
- **Writing style section is verbatim** after marker rename — no editorialising. Same for Web Research block.
- **Output Rules — explicit choice criteria.** The flipped section must give Claude something concrete to decide on, not just "prefer patches." Suggested criteria language (planner's recommendation; senior-dev may refine wording while preserving substance):
  > **Prefer line-level patches** when the change is local: replacing specific lines, inserting specific lines, fixing specific phrases, adding paragraphs at specific anchors. Leave everything else untouched.
  >
  > **Fall back to full-body replacement** only when the change is structural: re-ordering whole sections, splitting the note, merging sections, or rewriting so much that line-level patches would lose coherence.
  >
  > Preserve the YAML frontmatter exactly in either case. Preserve the note filename.
- **Header comment.** The existing JSDoc on `renderRefineSystemPrompt` already names `brain/Grimoire - Refine Note Spell` as the canonical content reference. Keep it; update no further unless the body wording changes the comment's accuracy.
- **No new dependencies, no new files, no new exports.** Architecture fitness (`npm run arch:check`) and the plugin bundle size are unaffected by ~3 KB of additional string content.
- **Lockstep note update is a non-code change** — kept as the final todo so it's not blocked by the dev tests passing. The note lives in the user's Obsidian vault; the executor (junior-dev) uses Obsidian MCP `get_vault_file` to read, then `Edit` at the vault path to update. The vault path is resolved once via `mcp__obsidian-mcp-tools__get_server_info`. **The embedded prompt code block in the canonical note must match `renderRefineSystemPrompt()` byte-for-byte** modulo language-fence wrapping.
- **Patterns considered & rejected (design-patterns Step 1):**
  - *Template / Builder split* (decompose the prompt into per-section helpers, compose at render time) — rejected: the prompt is one static string, has no per-cast variation, and no second caller. Decomposing earns nothing and obscures the document's narrative. The pitch's "afternoon appetite" framing argues against architectural restructuring.
  - *Strategy* (one strategy per mode body) — rejected: modes do not vary at plugin-render time; Claude branches at runtime by reading the note. The plugin has nothing to dispatch.
  - *Observer / Event* (re-materialise when settings change) — rejected: the prompt is settings-independent. Materializer's existing on-load re-render covers reloads.
- **Design-rubric §7 self-critique answers:**
  1. *One reason to change per component* — `refineTemplate.ts` changes when prompt content changes; the test file changes when assertions need to track new anchors; the materializer changes when write semantics change (not in this plan); the canonical note changes in lockstep with the template. Four reasons, four artefacts.
  2. *Change-impact radius* — adding a fourth mode in the future would extend the template string and add one more anchor assertion. The plugin code remains untouched (no mode dispatch in the plugin). Out of scope here, but the seam is well-placed.
  3. *Dependency direction* — `refineTemplate.ts` is a pure leaf (no imports). `RefineMaterializer` depends on it. `main.ts` depends on `RefineMaterializer`. One-way. Direction OK.
  4. *Abstraction justification* — `renderRefineSystemPrompt()` exists as a function (rather than a top-level `const`) only so its caller can be mocked / spied in tests and so its render is lazy. Justification still holds.
  5. *Deletability test* — could the function inline into `RefineMaterializer.run()`? Technically yes, but the separation lets the test file import the string directly without instantiating the materializer. Kept.
  6. *Name smell* — `renderRefineSystemPrompt` is a verb naming a pure render. No `Manager`/`Helper`/`Utils`. OK.
  7. *Testability* — the function is pure, deterministic, no side effects. Testable with one import and `toContain`/`not.toContain` assertions. Trivial.
  8. *What would a reviewer flag?* — (a) "Why ship a 3 KB string in plugin source rather than load it from a file?" → because the materializer needs *one* source of truth and shipping it as a TS string keeps it in the bundle (no runtime fetch, no missing-file failure mode); (b) "Why not parametrise marker name?" → the pitch's no-gos forbid marker variants. (c) "Should we lint the string for the dropped tokens?" → covered by the absence assertions in the test file.

## Edge cases (decided defaults)

1. **Backtick / escape collisions in the template literal.** The new body contains many code-fence triple-backticks (Web Research fallback shows a `> [!warning] Unverified` block; the markdown body contains code samples). The TS template literal uses backtick string syntax — every literal backtick inside must be escaped. The executor adds the body inside a backtick-delimited template literal and escapes interior backticks with `\``, including those inside the unverified-callout's code fence. Tests will catch escape mistakes immediately as the materialised file becomes malformed markdown or the string fails to compile. *Anchor: a test that asserts the rendered body contains the substring `` ``` `` (a markdown code fence) at least once — proves backtick-escape worked.*
2. **`@cast` substring inside word-boundary failure cases.** The new body itself, as a string, contains literal `@cast` mentions in the Mode-detection rule. Tests using `toContain('@cast')` continue to pass. The absence-assertion `not.toContain('@ai')` is the marker-rename's pinning test. The executor scans the entire ported text for `@ai` survivors during authoring.
3. **Frontmatter preservation under line-level patches.** The Output Rules section instructs Claude to preserve YAML frontmatter under both patch modes. Anchor: `toContain('frontmatter')` plus a second assertion that names YAML (`toContain('YAML')`).
4. **Empty note targeted by Mode 1.** Source's Mode 1 says "fewer than 50 words of actual content." That phrasing ports as-is — Claude does the word count. Anchor: `toContain('fewer than 50 words')` or the exact phrase the executor lands on.
5. **Note with both `@cast` lines and substantial content (>50 words).** Mode 3 wins per the source's "first match wins" precedence rule. Anchor: `toContain('first match wins')` or equivalent phrasing.
6. **Structural directive that does not need research.** The source's Mode 3 step 2 says "Run web research only for factual/content directives — skip for purely structural operations (split, merge, reorganize)." Ports as-is. Anchor: `toContain('structural')` and `toContain('skip')` in close proximity (or a single phrase).
7. **MCP tools unavailable at runtime.** Source already covers the fallback (file-system tools, `VAULT_MOUNT_PATH`). Existing test assertion `toContain('VAULT_MOUNT_PATH')` survives — keep it.
8. **Web search tools (`WebSearch`/`WebFetch`) unavailable.** Source covers DuckDuckGo curl fallback + the "Unverified" callout. Ports as-is.
9. **Note splitting (Mode 3) without vault-tag policy.** The source's "Tag conventions for new notes" callout is dropped (one of the vault-specific bindings). The note-splitting step itself remains, simply without the dropped callout. The new body either omits the callout entirely or replaces it with a generic "Create new notes with whatever frontmatter convention the surrounding notes use" sentence — the executor picks the lighter touch consistent with the pitch's "for a user we have never met" filter.
10. **Lockstep note already drifted.** The canonical note in the vault today reflects the *current* placeholder body. After the template ships its new content, the canonical note must be rewritten to match. The executor reads the new `renderRefineSystemPrompt()` output, wraps it in the canonical note's existing code-fence container (whatever the surrounding narrative says), and writes back. If the canonical note has substantive narrative around the code block that no longer makes sense after the swap, light editorial fixes are allowed — keep them minimal.

---

## Todos

### A. Test scaffolding for new prompt body anchors

#### Section briefing

**What this section produces:** new assertions in `tests/refine/refineTemplate.test.ts` that pin every structural anchor the new body must carry — and every legacy token the new body must NOT carry. The existing six assertions are reviewed; ones whose anchor still appears in the new body stay, ones whose anchor has been restructured are replaced. The test file ends red until B's template rewrite lands.

**Design context the executor needs upfront:** the source `@agent Collaborate on note` body is reproduced in the plan context (see plan-028's user prompt). Test anchors per Technical Notes:
- presence: `"Mode 1: Generate"`, `"Mode 2: Expand"`, `"Mode 3: Follow"`, `"fewer than 50 words"`, `"@cast"`, `"search_vault_simple"`, `"search_vault_smart"`, `"Agent 1"`, `"Agent 2"`, `"Agent 3"`, `"Official Sources"`, `"Practical Knowledge"`, `"Recent Developments"`, `"Freshness Check"`, `"Unverified"`, `"Writing Style"`, `"Feynman"`, `"wikilink"`, `"line-level patch"` (or planner-suggested phrasing — see Technical Notes), `"full-body replacement"`, `"frontmatter"`, `"YAML"`, `"VAULT_MOUNT_PATH"`, `"IMMEDIATE EXECUTION"`, `"first match wins"` (or equivalent precedence phrase).
- absence: `"@ai"` (marker rename pin), `"NotebookLM"`, `"agent-progress-protocol"`, `"ntfy.sh"`, `"Tag conventions for new notes"`.
- shape: rendered body contains at least one markdown code fence (` ``` `) — proves backtick escapes in the template literal compiled correctly.

**Cross-section couplings:** A's assertions are the Red criterion for B. B is not done until every A-section assertion passes. The exact wording of the Output Rules section (line-level vs full-body language) is decided in B and may require A's anchors to be loosened — if the executor picks slightly different phrasing for "line-level patch," update both the test anchor and the template in the same commit (still TDD-compliant: a single assertion's wording is the test's choice, not the production code's; the assertion documents *intent*, not the source's exact letter).

**Section-level Red criterion:** `npm test` shows `tests/refine/refineTemplate.test.ts` with ~25 assertions (the six original ones reviewed-and-reshaped + ~20 new ones), of which the new presence/absence assertions are RED against the current placeholder body. Existing assertions that survive the review remain green; everything else is red.

**junior-dev**

- [ ] A1: review the six existing assertions in `tests/refine/refineTemplate.test.ts`; keep `IMMEDIATE EXECUTION`, `MCP Tools` (or whichever phrasing the new body adopts for the tools section — the source uses `Available MCP Tools`), `VAULT_MOUNT_PATH`, `@cast`; remove or restructure `MCP Tools` and the "exit without modifying" assertion (whose phrasing is gone from the new body — the new body doesn't ask Claude to no-op; the autonomous modes always do *something*). Document each kept/removed assertion with a one-line comment naming why — S, junior-dev
- [ ] A2: add presence assertions (one `it(...)` per anchor or grouped under one `it('contains the three mode headings')` etc.) covering: `Mode 1: Generate`, `Mode 2: Expand`, `Mode 3: Follow`, `fewer than 50 words`, `search_vault_simple`, `search_vault_smart`, `Agent 1` and `Agent 2` and `Agent 3`, `Official Sources` and `Practical Knowledge` and `Recent Developments`, `Freshness Check`, `Unverified`, `Writing Style`, `Feynman`, `wikilink`, `frontmatter`, `YAML` — S, junior-dev
- [ ] A3: add presence assertions for the Output Rules flip: `line-level patch` (or equivalent — executor may rename to whatever B lands on, but the assertion documents the intent that line-level patches are the preferred mode) AND `full-body replacement` (or equivalent fallback phrasing). Use a comment to mark this assertion as the pin for the pitch's Output Rules adaptation — S, junior-dev
- [ ] A4: add absence assertions (one per dropped binding) using `expect(result).not.toContain(...)`: `@ai`, `NotebookLM`, `agent-progress-protocol`, `ntfy.sh`, `Tag conventions for new notes` — S, junior-dev
- [ ] A5: add a shape assertion — `expect(result).toContain('\`\`\`')` (rendered body contains at least one markdown code fence) — proving backtick-escape in the template literal compiled correctly when B lands — S, junior-dev
- [ ] A6: confirm `npm test` runs the file, and that the new assertions fail (RED) while existing kept-assertions still pass. Do NOT touch `src/refine/refineTemplate.ts` in this section — S, junior-dev

### B. Template rewrite — port the new body

#### Section briefing

**What this section produces:** the new contents of `src/refine/refineTemplate.ts`'s returned string literal, embedding the ported three-mode body with the six pitch-mandated adaptations applied. After this section, every assertion added in A is GREEN.

**Design context the executor needs upfront (copied verbatim from Proposed solution):**

> 1. **Marker rename:** every literal `@ai` → `@cast`.
> 2. **Drop vault-specific bindings:** drop `_system/agent-progress-protocol.md` reference in Progress Tracking, drop NotebookLM Access subsection, drop "Tag conventions for new notes" callout in Mode 3 step 4, drop `ntfy.sh/obsidian-claude-code` in Workflow.
> 3. **Output Rules flip:** prefer line-level patches when changes are local; fall back to full-body replacement when restructuring; give Claude explicit criteria for choosing; preserve YAML frontmatter in both modes.
> 4. **Keep verbatim** (after marker rename): Web Research orchestration (3 parallel agents, role names, freshness check, DuckDuckGo fallback, Unverified callout), Writing Style block (Voice & Style / Structure / Connections / Boundaries), mode boundaries (3-mode order, trigger criteria), Workflow step skeleton.
> 5. **Keep mode bodies fuller** than today's placeholder — that is the point.
> 6. Lockstep note update in section C, not here.

The new body lives inside the existing template literal in `renderRefineSystemPrompt()`. Backticks inside the body must be escaped with `\``. The function's JSDoc reference to `brain/Grimoire - Refine Note Spell` stays. The `%% Auto-generated by Grimoire RefineMaterializer. Do not edit — overwritten on every plugin load and settings save. %%` envelope at top of the rendered body stays (it is materialiser metadata, not source content). The `Begin execution now.` footer at the bottom stays.

**Cross-section couplings:** B is the green driver for every assertion added in A. If an A-section assertion uses phrasing the executor decides against (e.g. A3's `line-level patch` vs an alternative wording chosen here), update *both* the assertion and the template in the same commit — the assertion's job is to pin intent, not lock the executor into a specific phrase. Document any such co-edit with a commit-message line referring to A3 (or whichever assertion).

**Section-level Red criterion:** `npm test` shows `tests/refine/refineTemplate.test.ts` fully green. `npm run lint` passes. `npm run build` regenerates the bundle without TS errors. Manual smoke: print `renderRefineSystemPrompt()` length — expect 4–8 KB (vs current ~1 KB), with three mode headings, Web Research orchestration, Writing Style, Output Rules with line-vs-full criteria, and the Workflow ordering visible by eye.

**senior-dev**

- [ ] B1: rewrite the template literal in `src/refine/refineTemplate.ts`. Start from the `@agent Collaborate on note` source body (reproduced in the plan-028 context). Apply the six adaptations as listed in the Section briefing. Preserve the `%%` envelope and `Begin execution now.` footer. Escape every interior backtick (note the Unverified callout contains a markdown code fence — that fence must survive). Run `npm test` until every A-section assertion is green; iterate on phrasing as needed. Keep the JSDoc comment's "Canonical content reference: brain/Grimoire - Refine Note Spell" line accurate — M, senior-dev
- [ ] B2: edge case — verify the rendered string is well-formed markdown by writing it to a scratch file (`/tmp/refine-rendered.md`) and visually scanning for unclosed code fences, unbalanced callouts, or escape artefacts. No production change here unless the scan finds problems — S, senior-dev
- [ ] B3: confirm `npm test`, `npm run lint`, `npm run build`, `npm run arch:check` all green — S, senior-dev

### C. Lockstep update — canonical reference note

#### Section briefing

**What this section produces:** the embedded prompt code block in `brain/Grimoire - Refine Note Spell.md` (in the user's Obsidian vault, not this repo) is updated to match `renderRefineSystemPrompt()`'s new output. This is a non-code change executed outside the repo; no tests pin it. The pitch explicitly calls it out as a lockstep update — shipped content is what users cast against, and the canonical note documents what gets shipped.

**Design context the executor needs upfront:** the canonical note is at the Obsidian vault path `brain/Grimoire - Refine Note Spell.md`. It contains narrative paragraphs and at least one fenced code block that holds the Refine prompt body (currently the placeholder). The vault root is resolved once via `mcp__obsidian-mcp-tools__get_server_info` (cache for the call). The executor:
1. Reads the current note via `mcp__obsidian-mcp-tools__get_vault_file`.
2. Reads the new prompt body by calling `renderRefineSystemPrompt()` (e.g. via a one-off `node -e "console.log(require('./src/refine/refineTemplate').renderRefineSystemPrompt())"` after `npm run build` — or by reading the materialised `refine.md` from the plugin directory after `npm run dev`).
3. Replaces the existing code block's contents with the new prompt body, preserving the surrounding narrative and the code-fence language hint.
4. Writes back via filesystem `Edit` at the absolute vault path (since the user's memory says "filesystem write is faster than MCP for writes").
5. If the surrounding narrative references content that no longer exists in the new body (e.g. mentions the "exit without modifying" no-op, or references `@ai`), apply minimal editorial fixes to keep the narrative consistent. Do not invent new narrative.

**Cross-section couplings:** C depends on B being green (so the new body is the one being mirrored). C produces no test signal — it is a single manual sync step.

**Section-level Red criterion:** the canonical note's code block, read fresh after the write, equals the output of `renderRefineSystemPrompt()` modulo the code-fence language hint and any leading/trailing markdown the canonical note wraps it in. Surrounding narrative either still makes sense or has been minimally edited to do so.

**junior-dev**

- [ ] C1: resolve the vault root via `mcp__obsidian-mcp-tools__get_server_info` (one call, cache the path). Read `brain/Grimoire - Refine Note Spell.md` via `mcp__obsidian-mcp-tools__get_vault_file`. Locate the fenced code block containing the current placeholder Refine prompt body — S, junior-dev
- [ ] C2: extract the new prompt body — either by invoking `renderRefineSystemPrompt()` in a one-off node REPL or by reading the materialised file at `<vault>/.obsidian/plugins/grimoire/refine.md` after `npm run dev`. Confirm it matches the body in `src/refine/refineTemplate.ts` (sanity check; should be identical) — S, junior-dev
- [ ] C3: replace the code-block contents in `brain/Grimoire - Refine Note Spell.md` with the new body. Preserve the code-fence language hint (`markdown` or whatever the existing fence uses). Write back via filesystem `Edit` at the absolute vault path. Verify by re-reading the note — S, junior-dev
- [ ] C4: scan the surrounding narrative in the canonical note for sentences that reference dropped content (`@ai` marker, NotebookLM, "exit without modifying if nothing requested", ntfy notification, `_system/agent-progress-protocol`, "Tag conventions for new notes"). Apply minimal editorial fixes so the narrative still reads correctly. Do not invent new narrative or expand the note's scope — S, junior-dev

---

## Overall effort summary

- Total todos: **13** (A: 6, B: 3, C: 4)
- Effort: S = 11, M = 2, L = 0
- Tiers: junior-dev = 10, senior-dev = 3, lead-dev = 0, ui-integration-tester = 0

Junior dominates: most of the work is mechanical (writing test anchors, executing the lockstep sync). Senior-dev owns the template rewrite itself — the section that requires judgement about phrasing for the Output Rules flip, escaping backticks correctly inside the template literal, and adapting source language ("for a user we have never met") for sections like Mode 3's note-splitting step where the dropped tag-conventions callout leaves a small gap. No `ui-integration-tester` work — this is a string-content change, not a UI seam.

## Sequencing & dispatch order

1. **A** (test scaffolding, junior) — write the assertions red. No template changes here.
2. **B** (template rewrite, senior) — turn A green. Whole-section judgement on phrasing and structure.
3. **C** (lockstep note update, junior) — depends on B being shipped. Outside the repo; no test signal; single sync pass.

## Tests

- `tests/refine/refineTemplate.test.ts` — gains ~20 new assertions. End state: ~25 assertions covering structural anchors of the new body (presence + absence + shape).
- `tests/refine/RefineMaterializer.test.ts` — **untouched**; its assertions reference `renderRefineSystemPrompt()` as a value, not its internal anchors, so they pass through the content change unaffected.
- No new test files. No integration test changes — the cast pipeline, materializer, and `@cast` decorator are out of scope.

## Done-when

- `renderRefineSystemPrompt()` returns the new three-mode body with all six adaptations applied (marker rename, dropped vault bindings, Output Rules flip, preserved Web Research orchestration, preserved Writing Style, preserved Workflow skeleton).
- `tests/refine/refineTemplate.test.ts` is green with the new presence/absence/shape assertions in place.
- `npm test`, `npm run lint`, `npm run build`, `npm run arch:check` all green.
- `brain/Grimoire - Refine Note Spell.md`'s embedded prompt code block matches `renderRefineSystemPrompt()`'s output; surrounding narrative is consistent.
- No code paths outside `src/refine/refineTemplate.ts` and its sibling test file have changed.

## Perspective notes

Plan complexity is Simple→Medium (content port, no architectural change). No multi-perspective sweep done.

**Minimalist note:** the test file could shrink to two assertions — "contains every Mode N heading" and "contains none of the dropped tokens" — instead of ~20. Kept the larger set because each assertion documents one pitch-mandated adaptation, and the cost of one extra `it(...)` line is negligible. A reviewer who prefers leaner tests may collapse on review.

**Extensibility note:** if a future iteration adds a fourth mode (despite the current no-go), the seam is purely template-literal text — extend the string, add a presence assertion. No new module, no new export.

**Devil's-advocate note:** the biggest risk is template-literal escape mistakes — an unescaped backtick mid-string compiles but ships a broken `refine.md`. Mitigated by A5's "rendered body contains a code fence" assertion plus B2's scratch-file visual check. A secondary risk is anchor drift: the executor lands different phrasing in B than A's assertions assume. Mitigated by allowing same-commit edits to both assertion and template (TDD discipline preserved — the assertion documents intent, not letter).

**User-advocate note:** end-user impact is "Refine cast now does something useful even when I haven't written `@cast` lines." Mode 1 and Mode 2 going functionally live is the headline. The user experience around invocation, options panel, and cast-log is completely unchanged — no relearning, no surprise.
