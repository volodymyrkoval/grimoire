# 020 — Refine marker styling

## Goal & scope

Decorate every line whose **first character** is the literal `@cast` token (case-sensitive, followed by whitespace or end-of-line) inside the Obsidian editor with a callout-style visual: muted background tint, a thicker left-border accent, and a distinct treatment on the `@cast` keyword itself. Decorations come from a CodeMirror 6 `ViewPlugin` registered through `Plugin.registerEditorExtension`. All colours reference existing Obsidian CSS variables; no hardcoded palette. Lines inside fenced code blocks are *not* decorated — the fenced-block check is delegated to CM6's syntax tree (`@codemirror/language` → `syntaxTree`), not a hand-rolled fence counter. Decorations update live as the document changes.

**In scope:**
- One `ViewPlugin` decorating `@cast` lines in any CM6 editor Obsidian opens.
- Word-boundary match: `@cast` followed by `\s` or end-of-line. Avoids decorating `@casting`, `@castaway`.
- Fenced-code-block suppression via `syntaxTree(state).resolveInner(pos)` ancestor walk.
- Token-level decoration on the `@cast` keyword (`Decoration.mark`) layered over a line-level decoration (`Decoration.line`).
- CSS rules in `src/main.css` referencing only Obsidian theme variables.
- Registration call wired into `GrimoirePlugin.onload`.
- Unit tests over the decoration builder (regex + state-driven `DecorationSet` shape) and an integration test that mounts a real `EditorView` in happy-dom and asserts the rendered DOM gains the expected classes.

**Out of scope (per pitch):**
- Reading-view styling (markdown post-processor) — pitch explicitly defers.
- Icon / widget / wand glyph decoration — pitch explicitly out.
- Settings exposure (toggle, colour override, marker-text override).
- Marker-text variants (`@cast` only; no aliases).
- Inline code spans (single-backtick `` `@cast` ``) — see Edge cases #1 for the decision.
- Coupling to cast state, Refine config, or any plugin data.

## Proposed solution

Three pieces:

1. **`@cast` line detection** — a small pure helper module that, given an `EditorState`, builds a `DecorationSet`: walks visible ranges, for each line tests a single anchored regex, calls a fenced-block predicate on the matching line range, and emits `Decoration.line({ class })` + `Decoration.mark({ class })` on the keyword span.

2. **CM6 `ViewPlugin`** — wraps the helper. `update(u: ViewUpdate)` rebuilds the decoration set when `u.docChanged || u.viewportChanged`. Exposes `decorations` via the standard `decorations` accessor pattern.

3. **CSS** in `src/main.css` — adds three rules keyed on `cm-line.grimoire-cast-line`, `.grimoire-cast-line` (callout-style background + left border), and `.grimoire-cast-marker` (keyword treatment). All values reference `var(--…)` theme tokens.

Wire-up: `GrimoirePlugin.onload` adds one call: `this.registerEditorExtension(refineMarkerExtension())`. No other plugin module changes.

## Components

| Component | Responsibility | Location |
|---|---|---|
| `castLineRegex` | Single anchored regex matching `^@cast(?=\s|$)`. Exported constant. | `src/editor/castLineRegex.ts` |
| `isInsideFencedCodeBlock(state, pos)` | Returns `true` when `pos`'s syntax-tree ancestry contains a fenced code block node. Pure; takes `EditorState`. | `src/editor/isInsideFencedCodeBlock.ts` |
| `buildCastDecorations(view)` | Pure-ish builder. Walks `view.visibleRanges`, applies regex per line, calls `isInsideFencedCodeBlock`, emits `Decoration.line` + `Decoration.mark` via `RangeSetBuilder`. Returns `DecorationSet`. | `src/editor/buildCastDecorations.ts` |
| `castMarkerViewPlugin` | `ViewPlugin.fromClass(...)` instance — constructor calls builder, `update` rebuilds on `docChanged \|\| viewportChanged`. Exposes `decorations`. | `src/editor/castMarkerViewPlugin.ts` |
| `refineMarkerExtension` | Factory returning a CM6 `Extension` (array) ready for `registerEditorExtension`. Wraps `castMarkerViewPlugin` and any future co-installed extensions. | `src/editor/refineMarkerExtension.ts` |
| CSS rules | `.cm-line.grimoire-cast-line { … }` and `.grimoire-cast-marker { … }` referencing only theme variables. | `src/main.css` (append; rebuilds to `styles.css` via esbuild) |
| Plugin wire-up | One `this.registerEditorExtension(refineMarkerExtension())` call in `onload`. | `src/main.ts` |

## Interfaces

```ts
// src/editor/castLineRegex.ts
export const CAST_LINE_REGEX: RegExp; // /^@cast(?=\s|$)/

// src/editor/isInsideFencedCodeBlock.ts
import type { EditorState } from '@codemirror/state';
export function isInsideFencedCodeBlock(state: EditorState, pos: number): boolean;

// src/editor/buildCastDecorations.ts
import type { EditorView } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
export function buildCastDecorations(view: EditorView): DecorationSet;

// src/editor/castMarkerViewPlugin.ts
import type { ViewPlugin } from '@codemirror/view';
export const castMarkerViewPlugin: ViewPlugin<{ decorations: DecorationSet }>;

// src/editor/refineMarkerExtension.ts
import type { Extension } from '@codemirror/state';
export function refineMarkerExtension(): Extension;
```

CSS class contract (locked — referenced from both CSS and TS):
- `grimoire-cast-line` — applied via `Decoration.line({ class: 'grimoire-cast-line' })`. CM6 adds it to the wrapping `.cm-line` element.
- `grimoire-cast-marker` — applied via `Decoration.mark({ class: 'grimoire-cast-marker' })` over the 5-char `@cast` range.

## Data flow

```
Obsidian.Plugin.onload
  └─► registerEditorExtension(refineMarkerExtension())
                                    │
        ┌───────────────────────────┘
        ▼
  EditorView creates plugin instance per editor
        │
        ▼
  ViewPlugin.constructor(view) ─► buildCastDecorations(view) ─► DecorationSet
        │
        ▼
  CM6 renders .cm-line elements with `grimoire-cast-line` class
        │
        ▼ (user types / pastes / Refine cast removes @cast lines)
        ▼
  ViewPlugin.update(u) — if u.docChanged || u.viewportChanged:
        └─► buildCastDecorations(u.view) ─► new DecorationSet ─► CM6 re-renders
```

Inside `buildCastDecorations`:

```
for range of view.visibleRanges:
  for each line in [range.from, range.to]:
    text = line.text
    m = CAST_LINE_REGEX.exec(text)
    if !m: continue
    if isInsideFencedCodeBlock(state, line.from): continue
    builder.add(line.from, line.from, Decoration.line({class: 'grimoire-cast-line'}))
    builder.add(line.from, line.from + 5, Decoration.mark({class: 'grimoire-cast-marker'}))
return builder.finish()
```

Note ordering: `Decoration.line` ranges must be added before `Decoration.mark` ranges that start at the same position when both target the same offset — `RangeSetBuilder` requires monotonically non-decreasing `from` and, for equal `from`, line decorations before mark decorations (line decorations have `startSide = -Infinity`). The builder enforces this; if a violation surfaces during dev, switch to `Decoration.set([...], sort=true)`.

## Error handling

- `syntaxTree` returns a partial tree during parsing — `isInsideFencedCodeBlock` must tolerate the `Tree` not yet having the leaf at `pos`. Walk up from `resolveInner(pos, 1)`; if walk yields no node, return `false` (decorate by default; worst case is one frame of mis-decoration during very large pastes — corrected on next viewport update).
- `buildCastDecorations` must never throw. If regex/syntax-tree throws, log via `console.error` and return `Decoration.none` — never leave the editor without decorations crashed.
- Plugin registration call in `onload` is wrapped in a `try/catch` consistent with existing `materializeForge().catch(console.error)` pattern: a thrown extension factory must not break plugin load.

## Technical notes

- **Add devDependency `@codemirror/language`** (^6.x). Already listed in `esbuild.config.mjs` externals (line 25); Obsidian provides it at runtime. Needed for `syntaxTree` typing and (for tests) running the markdown parser in happy-dom. Confirm Obsidian's bundled version matches via a quick smoke check during the dev cycle.
- **Fenced-code-block detection via `syntaxTree`.** Walk `resolveInner(pos, 1)` upward and check `node.type.name` against the set `{ 'FencedCode', 'CodeBlock', 'HyperMD-codeblock', 'HyperMD-codeblock-begin', 'HyperMD-codeblock-end', 'inline-code' }`. Use a constant set so the check is one `Set.has`. The exact node names produced by Obsidian's markdown parser differ slightly by version — write the integration test to capture the node names actually emitted, then derive the set from observed reality. The set lives in `isInsideFencedCodeBlock.ts` as a private constant.
- **Inline code (single backticks) included in the same suppression set** (`inline-code`). The pitch is silent on this; suppressing matches the "code = content, not directive" principle (rabbit hole #2). Surfaced in Edge cases #1 below for orchestrator confirmation.
- **Viewport-only scan, not full-doc.** Standard CM6 pattern; constant cost regardless of document size. The pitch's "live as the user types or pastes" requirement is satisfied by `u.viewportChanged` rebuilds — scrolling re-runs the builder over the new viewport.
- **All CM6 editors get the extension** — `registerEditorExtension` applies globally, no markdown gating. Non-markdown CM6 editors rarely contain `@cast` lines; the regex returns no matches in their case, no DOM impact.
- **No `Plugin` mock changes are required for unit tests** of the four `src/editor/*.ts` modules — they take CM6 types directly and can be exercised by constructing real `EditorState`/`EditorView` instances. The integration test that drives the registered extension does require the obsidian mock to expose `registerEditorExtension`; see todos H1.
- **Patterns considered & rejected** (design-patterns Step 1):
  - *Strategy* (pluggable matcher) — rejected: only one matcher (`@cast`) exists and the pitch's No-go #4 forbids variants. YAGNI.
  - *Decorator* (stack multiple decoration sources) — rejected: only one decoration source. The `refineMarkerExtension` factory is a thin alias, not a decorator chain.
  - *Observer / EventEmitter* (notify cast pipeline) — rejected: pitch explicitly says no coupling to cast state.
  - *Visitor* (over the syntax tree) — rejected: a single ancestor walk via `resolveInner` is clearer than a Lezer visitor.
  - *Builder* (decoration set construction) — accepted: CM6's `RangeSetBuilder` is exactly this pattern, used as-is.
- **Design-rubric §7 self-critique answers:**
  1. *One reason to change per component* — regex (the literal), fenced-block predicate (syntax-tree shape), decoration builder (decoration topology), view plugin (CM6 lifecycle), extension factory (registration shape), CSS (visual tokens). Six reasons, six files.
  2. *Change-impact radius* — adding a second marker (e.g. `@imprint`) would extend the regex and add CSS classes; the fenced-block predicate and view-plugin lifecycle are untouched. Adding reading-view styling would add a *new* module and is out of scope.
  3. *Dependency direction* — `src/editor/*` depends only on `@codemirror/*`. Nothing in `src/editor/*` imports from `src/domain`, `src/cast`, `src/ui`, etc. Pure leaf. Direction OK.
  4. *Abstraction justification* — the only seam is `refineMarkerExtension()`. Justification: lets `main.ts` import a single symbol and stay agnostic of internal composition; allows future extensions (a second decoration source) without editing `main.ts`. Concrete second use case is *not* yet planned — kept anyway because the cost is one tiny file (4 lines). If reviewer flags, collapse into direct `registerEditorExtension(castMarkerViewPlugin)` call.
  5. *Deletability test* — `refineMarkerExtension.ts` could collapse into `castMarkerViewPlugin`'s export. Kept for the wire-up clarity above.
  6. *Name smell* — no `Manager`, `Helper`, `Utils`. `buildCastDecorations` is a verb. `isInsideFencedCodeBlock` is a predicate. `castMarkerViewPlugin` is a noun naming the CM6 plugin. OK.
  7. *Testability* — each module testable in isolation. `castLineRegex` is a constant. `isInsideFencedCodeBlock` takes `EditorState` directly. `buildCastDecorations` takes `EditorView` (constructible in happy-dom). `castMarkerViewPlugin` exercised via the integration test that mounts a real view. No mocking of CM6 needed.
  8. *What would a reviewer flag?* — (a) "Why a separate `refineMarkerExtension.ts` when it's a one-liner?" → answered in #4. (b) "What happens during partial markdown parse?" → §error-handling. (c) "Are class names namespaced enough?" → `grimoire-cast-line` / `grimoire-cast-marker` carry the project prefix; OK.

## Edge cases (decided defaults — orchestrator should confirm with user)

1. **Inline code spans** (single-backtick `` `@cast` ``): **suppressed**, treated like fenced blocks. Surfaces the same "code = content" rule. If user wants them decorated, flip the set in `isInsideFencedCodeBlock.ts` — one-line change. *Test: H3-edge1.*
2. **Word-boundary match**: required. `@cast` must be followed by whitespace or end-of-line (`/^@cast(?=\s|$)/`). `@casting`, `@castaway`, `@castnet` do **not** decorate. *Test: D2.*
3. **Leading whitespace / list markers / blockquotes**: **not tolerated**. `@cast` must be character 0 of the raw line. `  @cast`, `- @cast`, `> @cast` do **not** decorate. Matches the pitch's "line-start" phrasing literally. *Test: D3.*
4. **Scan scope**: viewport-only. *Test: G1 verifies via `EditorView.visibleRanges` injection.*
5. **Editor scope**: all CM6 editors (default `registerEditorExtension` behaviour). *Test: H1 just verifies registration happens; non-markdown editors aren't separately tested.*
6. **Empty `@cast` line** (`@cast` followed by nothing — no space, just EOL): decorated. `(?=\s|$)` matches end-of-input.
7. **`@cast\n` mid-paste**: decorated as soon as the paste commits and the view updates; no debouncing.
8. **`@cast` removed by Refine cast or any other write**: decoration disappears on next view update. No manual cleanup needed (CM6 owns the `DecorationSet` lifetime).
9. **Plugin unload**: `registerEditorExtension` extensions are auto-removed by Obsidian's plugin lifecycle. No code needed in `onunload`.

## Deferred edge cases (orchestrator to surface)

None — every applicable edge case has a default decision above. The orchestrator should confirm Edge cases #1 (inline code) and #3 (leading whitespace) explicitly with the user before dev starts, since both have plausible alternatives.

## Todos

### A. Dependency & scaffolding

#### Section briefing

**What this section produces:** adds `@codemirror/language` to `devDependencies` in `package.json`, runs `npm install`, and creates empty TypeScript file shells under `src/editor/` for the five modules in the Components table (no logic, just exported names and type imports so subsequent sections compile). No tests yet.

**Design context the executor needs upfront:** `@codemirror/language` is already declared external in `esbuild.config.mjs` (line 25). It is provided by Obsidian at runtime; we add the devDep purely for typing and test-runner consumption. Exact module surface used: `syntaxTree` from `@codemirror/language`.

**Cross-section couplings:** None. All later sections import from these scaffolded files; if file names diverge from those listed in the Components table, every later todo's import paths break.

**Section-level Red criterion:** `npm install` succeeds; `tsc -noEmit -skipLibCheck -p tsconfig.build.json` passes; `import { CAST_LINE_REGEX } from '../src/editor/castLineRegex'` (and the four sibling imports) resolve without "module not found" errors.

**junior-dev**

- [x] A1: add `@codemirror/language` `^6.10.0` to `devDependencies` in `package.json`; run `npm install`; commit `package.json` and `package-lock.json` together — S, junior-dev
- [x] A2: create `src/editor/castLineRegex.ts` exporting `export const CAST_LINE_REGEX = /^@cast(?=\s|$)/;` — S, junior-dev
- [x] A3: create `src/editor/isInsideFencedCodeBlock.ts` with signature `export function isInsideFencedCodeBlock(state: EditorState, pos: number): boolean { return false; }` (stub returning `false`; real logic lands in B2) — S, junior-dev
- [x] A4: create `src/editor/buildCastDecorations.ts` with signature `export function buildCastDecorations(view: EditorView): DecorationSet { return Decoration.none; }` (stub; real logic lands in D-section) — S, junior-dev
- [x] A5: create `src/editor/castMarkerViewPlugin.ts` with `export const castMarkerViewPlugin = ViewPlugin.fromClass(class { decorations = Decoration.none; update() {} }, { decorations: v => v.decorations });` (stub; real `update`/constructor land in F-section) — S, junior-dev
- [x] A6: create `src/editor/refineMarkerExtension.ts` with `export function refineMarkerExtension(): Extension { return [castMarkerViewPlugin]; }` — S, junior-dev
- [x] A7: confirm `npm run build` and `npm test` both still pass with the stubs in place (no test changes yet) — S, junior-dev

### B. Fenced-code-block detection

#### Section briefing

**What this section produces:** real logic in `src/editor/isInsideFencedCodeBlock.ts` — a pure predicate that walks `syntaxTree(state).resolveInner(pos, 1)` ancestry checking against a set of node-type names known to indicate "inside fenced/inline code." Unit tests cover the three cases: outside any code, inside a fenced block, inside an inline code span.

**Design context the executor needs upfront:** The exact node-type names Obsidian's markdown parser emits depend on the bundled `@codemirror/lang-markdown` version. The accepted set per Technical Notes is `{ 'FencedCode', 'CodeBlock', 'HyperMD-codeblock', 'HyperMD-codeblock-begin', 'HyperMD-codeblock-end', 'inline-code' }` — but the test must capture the actually-emitted names by snapshotting `node.type.name` walks on real markdown inputs and assert against the observed set. Tolerate partial trees: if `resolveInner` returns a position-less node, return `false`.

**Cross-section couplings:** D-section's `buildCastDecorations` calls this predicate. The contract is `(EditorState, pos) => boolean` — must not change. B's exit criterion includes "no other modules touched yet."

**Section-level Red criterion:** Given an `EditorState` built from `EditorState.create({ doc, extensions: [markdown()] })`, `isInsideFencedCodeBlock` returns `true` for a `pos` inside a triple-backtick block and inside a single-backtick span, and `false` for prose. Stryker survives no mutation that swaps `true`/`false` returns.

**junior-dev**

- [x] B1: add unit test `tests/editor/isInsideFencedCodeBlock.test.ts` covering three positives (fenced block body, fenced block fence line, inline code span) and three negatives (plain prose, blank line, line ending in single backtick) — M, junior-dev
- [x] B2: implement `isInsideFencedCodeBlock` in `src/editor/isInsideFencedCodeBlock.ts` — walk `syntaxTree(state).resolveInner(pos, 1)` upward via `cursor.parent()`; check each `node.type.name` against `FENCED_OR_INLINE_CODE_NODES = new Set(['FencedCode', 'CodeBlock', 'HyperMD-codeblock', 'HyperMD-codeblock-begin', 'HyperMD-codeblock-end', 'inline-code'])`; return `true` on first hit, `false` if walk exhausts; tolerate a null/undefined cursor by returning `false` — M, junior-dev
- [x] B3: cross-check the set against the actual node names by logging `node.type.name` during one test run; if observed names differ, update both the set and the live-spec — S, junior-dev

### C. Cast line regex tests

#### Section briefing

**What this section produces:** unit tests that pin the behaviour of `CAST_LINE_REGEX` across the word-boundary, leading-whitespace, and case-sensitivity dimensions. No production code changes — the regex was finalised in A2.

**Design context the executor needs upfront:** Per Edge cases #2 and #3, the regex is `/^@cast(?=\s|$)/`. It is case-sensitive (no `i` flag), anchored to line start (`^`), and requires a trailing whitespace or end-of-input. The test must verify each axis independently so a single mutation to flag/anchor/lookahead is caught.

**Cross-section couplings:** None. The regex is consumed by D's builder but tested standalone here.

**Section-level Red criterion:** Eight assertions pass: matches `@cast`, `@cast foo`, `@cast\n`; rejects `@casting`, `@castaway`, `@CAST`, ` @cast` (leading space), `text @cast`. A mutation that drops the `^`, drops the lookahead, or adds an `i` flag fails at least one assertion.

**junior-dev**

- [x] C1: add `tests/editor/castLineRegex.test.ts` with the eight assertions above; each as a separate `it(...)` so failures pinpoint which axis broke — S, junior-dev (985b6b7)

### D. Decoration builder

#### Section briefing

**What this section produces:** real implementation of `buildCastDecorations` that turns a real `EditorView` into a `DecorationSet`. Unit tests construct an `EditorView` (or just `EditorState` + manual builder invocation) over fixture documents and assert on the resulting `DecorationSet`'s ranges and class assignments.

**Design context the executor needs upfront (copied verbatim from Data flow):**

> Inside `buildCastDecorations`:
> ```
> for range of view.visibleRanges:
>   for each line in [range.from, range.to]:
>     text = line.text
>     m = CAST_LINE_REGEX.exec(text)
>     if !m: continue
>     if isInsideFencedCodeBlock(state, line.from): continue
>     builder.add(line.from, line.from, Decoration.line({class: 'grimoire-cast-line'}))
>     builder.add(line.from, line.from + 5, Decoration.mark({class: 'grimoire-cast-marker'}))
> return builder.finish()
> ```

Class names are locked: `grimoire-cast-line` and `grimoire-cast-marker` — see Interfaces. `RangeSetBuilder` requires non-decreasing `from`; line decorations at offset `N` must be added before mark decorations at offset `N` (line decorations have `startSide = -Infinity`).

**Cross-section couplings:** D2 (word-boundary), D3 (line-start), D4 (fenced-block suppression) directly encode Edge cases #1, #2, #3 — those edge cases must remain consistent with C-section's regex tests and B-section's predicate behaviour. D5's class-name assertions are the contract that F-section's CSS rules and H-section's integration test rely on; changing them breaks both.

**Section-level Red criterion:** Given a fixture document with a mix of `@cast`-prefixed prose lines, fenced-block `@cast` lines, inline-code `@cast` spans, indented `@cast` lines, and `@casting` lines, the returned `DecorationSet` contains exactly one `line` + one `mark` decoration pair per *bare top-level* `@cast` line — no others — and the class names match the locked contract.

**senior-dev**

- [x] D1: red test — fixture doc with three `@cast` lines (top, middle, bottom) and prose between; `buildCastDecorations(view)` returns a `DecorationSet` containing exactly three `Decoration.line` ranges and three `Decoration.mark` ranges; line decoration class is `grimoire-cast-line`, mark class is `grimoire-cast-marker`; mark ranges are each exactly 5 chars wide starting at column 0 — M, senior-dev
- [x] D2: red test — `@casting foo` and `@castaway` lines yield zero decorations (word-boundary edge case #2) — S, senior-dev
- [x] D3: red test — `  @cast` (leading spaces), `- @cast` (list marker), `> @cast` (blockquote) yield zero decorations (line-start edge case #3) — S, senior-dev
- [x] D4: red test — `@cast` inside a triple-backtick fenced block yields zero decorations; `@cast` inside a single-backtick inline span yields zero decorations (Edge cases #1) — M, senior-dev
- [x] D5: implement `buildCastDecorations` per the data-flow snippet above; iterate `view.visibleRanges`, use `state.doc.lineAt(from)` / `line.number` increment loop, call `CAST_LINE_REGEX.exec(line.text)`, call `isInsideFencedCodeBlock(state, line.from)`, add to `RangeSetBuilder` in the correct order (line then mark). All D1–D4 tests green — M, senior-dev
- [x] D6: red+green — viewport-only invariant: construct a view whose `visibleRanges` covers only lines 1–10 of a 100-line doc that has `@cast` on lines 5 and 50; result has exactly one line+mark pair (line 5), nothing for line 50 — M, senior-dev
- [x] D7: red+green — empty `@cast` line (just `@cast\n`) yields a line + mark decoration; an `@cast` with no newline at end-of-file also decorates (Edge case #6) — S, senior-dev

### E. CSS rules

#### Section briefing

**What this section produces:** three CSS rules appended to `src/main.css` that style `.cm-line.grimoire-cast-line`, `.grimoire-cast-line`, and `.grimoire-cast-marker` using only Obsidian theme variables. Built output `styles.css` is regenerated by esbuild via the existing `src/main.css` entry point (see `esbuild.config.mjs` line 16); do not edit `styles.css` directly. No tests in this section — visual outcome is covered by the integration test in H verifying classes are applied.

**Design context the executor needs upfront (from pitch verbatim):**

> All colours come from Obsidian's existing CSS variables — the same accent and background tokens that power native callouts, tags, and link styling. … No hardcoded colour values.

Variables already used in `src/main.css`: `--background-modifier-hover`, `--background-modifier-active-hover`, `--background-modifier-border`, `--interactive-accent`, `--text-on-accent`, `--text-muted`, `--text-normal`, `--text-faint`, `--color-green`, `--color-red`. Recommended palette for `@cast` (warm/accent family, mirrors callout aesthetic): background `--background-modifier-hover` (muted tint), left border `--interactive-accent` (the accent the theme already uses for actionable UI), marker text `--interactive-accent` with `font-weight: 600`. The plugin name on the keyword should remain readable on the tinted background — pick a variable, not a literal.

**Cross-section couplings:** Class names `grimoire-cast-line` and `grimoire-cast-marker` must match D5 verbatim. If D-section renames a class, this section's rule selectors must follow.

**Section-level Red criterion:** `src/main.css` contains exactly three new rule blocks, each referencing only `var(--…)` for colour-bearing properties (background, border-color, color); `npm run build` regenerates `styles.css` without errors; opening Obsidian with the plugin and creating a `@cast foo` line shows a tinted background, left border, and accent-coloured keyword (this last check is dev-time visual; not automated). `grep -E '#[0-9a-fA-F]{3,6}|rgb\(|hsl\(' src/main.css` (limited to the new rules) returns no matches.

**junior-dev**

- [x] E1: append three rules to `src/main.css`:
  ```css
  .cm-line.grimoire-cast-line {
      background-color: var(--background-modifier-hover);
      border-left: 3px solid var(--interactive-accent);
      padding-left: 6px;
  }
  .grimoire-cast-marker {
      color: var(--interactive-accent);
      font-weight: 600;
  }
  ```
  Verify no literal colour values; verify selectors match the locked class names from D5 — S, junior-dev
- [x] E2: run `npm run build`; verify `styles.css` regenerated and contains the new selectors; do not edit `styles.css` by hand — S, junior-dev

### F. ViewPlugin lifecycle

#### Section briefing

**What this section produces:** real `castMarkerViewPlugin` implementation — a `ViewPlugin.fromClass(...)` whose constructor calls `buildCastDecorations(view)` and whose `update(u)` rebuilds the decoration set when `u.docChanged || u.viewportChanged`. The plugin exposes `decorations` via the standard accessor passed as the second arg to `ViewPlugin.fromClass`. Also: real `refineMarkerExtension()` factory returning `[castMarkerViewPlugin]`.

**Design context the executor needs upfront:** CM6 `ViewPlugin.fromClass(Class, spec)` — `spec.decorations: (value) => value.decorations` is how CM6 reads the decoration field. Constructor receives `EditorView`. `update(u: ViewUpdate)` is called on every transaction. `u.docChanged` is `true` when document mutated; `u.viewportChanged` when scroll/resize changed visible ranges. Both warrant a rebuild because viewport-only scanning means scrolling reveals previously off-screen `@cast` lines.

**Cross-section couplings:** F1 verifies the constructor builds decorations; F2 verifies `update` rebuilds. Both depend on D5's `buildCastDecorations` being green. F3 (the `refineMarkerExtension` factory) is consumed by I-section's plugin wire-up — must export the exact symbol `refineMarkerExtension` as a function (not a value).

**Section-level Red criterion:** A unit test that constructs an `EditorView` with `castMarkerViewPlugin` installed and a `@cast foo\n@cast bar` document sees the plugin's `decorations` field populated with two line+mark pairs; after dispatching a transaction that replaces line 1 with prose, `decorations` shrinks to one pair.

**junior-dev**

- [x] F1: red test in `tests/editor/castMarkerViewPlugin.test.ts` — construct an `EditorView` with `[castMarkerViewPlugin]` and doc `@cast hello\nplain prose`; assert `view.plugin(castMarkerViewPlugin)!.decorations.size === 2` (one line + one mark) — M, junior-dev (e0179d8)
- [x] F2: red test — same view, dispatch `view.dispatch({ changes: { from: 0, to: 11, insert: 'plain again' } })` so the first line no longer matches; assert `view.plugin(...)!.decorations.size === 0` — M, junior-dev (e0179d8)
- [x] F3: red test — `refineMarkerExtension()` returns an array (or `Extension`) containing `castMarkerViewPlugin`; installing the result in an `EditorView` produces decorations equivalent to installing the plugin directly — S, junior-dev (e0179d8)
- [x] F4: implement `castMarkerViewPlugin` using `ViewPlugin.fromClass(class { decorations: DecorationSet; constructor(view) { this.decorations = buildCastDecorations(view); } update(u) { if (u.docChanged || u.viewportChanged) this.decorations = buildCastDecorations(u.view); } }, { decorations: v => v.decorations })`; F1–F3 green — M, junior-dev (e0179d8)
- [x] F5: defensive wrap — make `update` swallow exceptions from `buildCastDecorations` (per Error handling): wrap the rebuild in `try/catch`, on catch call `console.error('refine-marker-styling: decoration build failed', err)` and assign `this.decorations = Decoration.none`. Add a unit test that monkey-patches `isInsideFencedCodeBlock` to throw and asserts the editor remains responsive (no thrown error reaches the dispatch caller) — M, junior-dev (e0179d8)

### G. Mock obsidian — registerEditorExtension

#### Section briefing

**What this section produces:** extends `tests/__mocks__/obsidian.ts`'s `Plugin` class with a `registerEditorExtension = vi.fn();` method so the existing `main.test.ts` and integration tests can spy on the call. Tiny change isolated to the mock surface.

**Design context the executor needs upfront:** The real Obsidian `Plugin.registerEditorExtension(extension: Extension): void` API is at `node_modules/obsidian/obsidian.d.ts:4866`. The mock currently lists `loadData`, `saveData`, `addCommand`, `addSettingTab` (lines 267–270). Add one more `vi.fn()` method in the same style.

**Cross-section couplings:** Section I's `main.test.ts` change uses this mock method to verify the call. If the mock signature diverges from the real API (e.g. accepts a callback instead of an Extension), I-section's assertion shapes break.

**Section-level Red criterion:** `new Plugin(app).registerEditorExtension` exists and is a `vi.fn()`; calling it with any argument does not throw; `expect(plugin.registerEditorExtension).toHaveBeenCalled()` works.

**junior-dev**

- [x] G1: add `registerEditorExtension = vi.fn();` to the `Plugin` class in `tests/__mocks__/obsidian.ts` (place it next to the existing `addCommand` line). Add a one-line JSDoc above the field documenting it as the CM6 extension registration stub — S, junior-dev

### H. Integration test — full editor wiring

#### Section briefing

**What this section produces:** one UI-integration-style test under `tests/integration/refine-marker-styling.spec.ts` that mounts a real `EditorView` (with `castMarkerViewPlugin` plus the markdown language extension) into a happy-dom container, sets a document with mixed content, and asserts on the rendered DOM that:
- `.cm-line.grimoire-cast-line` exists for top-level `@cast` lines (one per match);
- `.grimoire-cast-marker` span exists inside each;
- No `.grimoire-cast-line` for `@cast` lines inside fenced blocks, inline code spans, or word-boundary failures (`@casting`).

Also: a separate small unit-level test verifies that `GrimoirePlugin.onload` calls `plugin.registerEditorExtension` once with a value containing `castMarkerViewPlugin`.

**Tier-group decision (per orchestrator's question on `ui-integration-tester` vs unit):** This is a CM6 ViewPlugin decoration test. The seam under test is "editor mounts → plugin observes doc → DOM gets classes." That seam is genuinely a UI component-seam (CM6 → DOM, with the plugin as the integrator) and benefits from the rendered-DOM assertion style. happy-dom supports enough of the DOM that CM6 renders, and the rest of the codebase already runs integration tests in this environment. Use the `**ui-integration-tester**` tier-group for the DOM-rendered seam test (H2). The pure-decoration-set unit checks live under D-section as junior/senior-dev work.

**Design context the executor needs upfront:** `tests/integration/setup.ts` polyfills Obsidian's DOM extension methods (`createEl`, `addClass`, etc.) on `HTMLElement.prototype`. Importing `EditorView` from `@codemirror/view` and `markdown` from `@codemirror/lang-markdown` (note: not installed — see H1) should work in happy-dom because both are pure ESM/CJS modules with no DOM API beyond standard Node/happy-dom support. If `@codemirror/lang-markdown` is too heavy or breaks, fall back to constructing an `EditorState` directly and querying the `DecorationSet` without an actual `EditorView` mount — at the cost of testing fewer integration layers. Decision recorded inline: prefer mounting `EditorView` for true seam coverage; fall back only if happy-dom blocks it.

**Cross-section couplings:**
- H2 depends on F4 (`castMarkerViewPlugin` builds decorations in constructor) and E1 (CSS classes named correctly) and B2 (fenced-block predicate working).
- H4's call-site assertion depends on I3's `registerEditorExtension` call existing in `main.ts`. Order: I3 must land before H4 turns green (or H4 stays red as the section's Red criterion driving I3 in).

**Section-level Red criterion:** Running `npm run test:integration` shows a new `refine-marker-styling.spec.ts` suite. Inside it:
- `tc1` mounts a view with `@cast foo\n\nplain\n\`\`\`\n@cast inside\n\`\`\`\n@casting outside\n\`@cast inline\`\n` and asserts: exactly one `.cm-line.grimoire-cast-line` exists, exactly one `.grimoire-cast-marker` exists inside it, both `@cast inside` (fenced) and `@casting outside` (word-boundary) and `` `@cast inline` `` (inline span) lines lack the classes.
- `tc2` dispatches a transaction adding `\n@cast new` to the doc and re-asserts: now two `.cm-line.grimoire-cast-line` elements exist.
- `tc3` dispatches a transaction removing the first `@cast` line and re-asserts: only one `.cm-line.grimoire-cast-line` remains.
- `tc4` calls `new GrimoirePlugin(app); await plugin.onload();` and asserts `plugin.registerEditorExtension` was called at least once with an argument whose stringified form (or runtime probe) references `castMarkerViewPlugin`.

**ui-integration-tester**

- [x] H1: add `@codemirror/lang-markdown` `^6.x` to `devDependencies` and run `npm install`. (Already external in esbuild; needed only for tests to parse markdown into a real syntax tree.) Confirm it imports cleanly in happy-dom by adding a temporary smoke `it('imports', () => { expect(markdown).toBeDefined(); })` and removing it after green — S, ui-integration-tester
- [x] H2: write the rendered-DOM integration test `tests/integration/refine-marker-styling.spec.ts` covering tc1, tc2, tc3 above. Use `document.body.appendChild` to mount the `EditorView`. Wait one microtask after `view.dispatch` before asserting (CM6 batches DOM updates synchronously, but the spec should call `view.requestMeasure()` or `await Promise.resolve()` to be safe) — M, ui-integration-tester
- [x] H3-edge1: add `tc-edge1` to the same spec — assert that `` `@cast inline` `` (single-backtick inline code) does not produce `.grimoire-cast-line`, locking Edge case #1's "inline code suppressed" decision — S, ui-integration-tester
- [x] H4: add `tc4` to `tests/main.test.ts` (existing file) — call `plugin.onload`, assert `plugin.registerEditorExtension` was called with a non-null argument. Do not assert deep structure (the exact `Extension` shape is internal); just call-count and arg-non-null — S, ui-integration-tester

### I. Plugin wire-up

#### Section briefing

**What this section produces:** one line added to `GrimoirePlugin.onload` (`src/main.ts`) — `this.registerEditorExtension(refineMarkerExtension());` — wrapped in a try/catch consistent with the existing `materializeForge().catch(console.error)` pattern in the same file.

**Design context the executor needs upfront:** Existing `onload` (see `src/main.ts:21-27`) is a 4-line orchestration that loads data, builds paths, initialises cast log, builds popup module, and registers UI. The new line is independent of all four — it should land in `#registerUI` (line 71) or as a standalone call alongside it. Pick `#registerUI` since it already groups Obsidian-side registrations.

The factory `refineMarkerExtension` returns a CM6 `Extension`. Failures during the factory call (extremely unlikely — it's a `[plugin]` array literal) must not break plugin load; wrap in try/catch logging `console.error('refine-marker-styling: extension registration failed', err)`.

**Cross-section couplings:** I3's call is the green driver for H4. I1's import path depends on A6 having created `refineMarkerExtension.ts`. Order: I lands after H4 is written (red) and turns it green.

**Section-level Red criterion:** `GrimoirePlugin.onload` imports `refineMarkerExtension` from `./editor/refineMarkerExtension` and calls `this.registerEditorExtension(refineMarkerExtension())` exactly once. H4 turns green. All other plugin tests still pass.

**senior-dev**

- [x] I1: add `import { refineMarkerExtension } from './editor/refineMarkerExtension';` to `src/main.ts` — S, senior-dev (3548a59)
- [x] I2: in `#registerUI`, after `popupModule.register(this);`, add `try { this.registerEditorExtension(refineMarkerExtension()); } catch (err) { console.error('refine-marker-styling: extension registration failed', err); }` — S, senior-dev (3548a59)
- [x] I3: confirm `npm test`, `npm run test:integration`, `npm run lint`, `npm run build`, `npm run arch:check` all green — S, senior-dev (3548a59)

## Overall effort summary

- Total todos: **30** (A1–A7 = 7, B1–B3 = 3, C1 = 1, D1–D7 = 7, E1–E2 = 2, F1–F5 = 5, G1 = 1, H1–H4 = 4 inc. H3-edge1)
- Effort: S = 17, M = 13, L = 0
- Tiers: junior-dev = 19, senior-dev = 7, ui-integration-tester = 4, lead-dev = 0

Junior dominates: most of the work is mechanical (scaffolding, regex tests, CSS, mock extension, plugin wire-up). Senior-dev owns the decoration-builder section where the CM6 `RangeSetBuilder` ordering and viewport semantics need active judgement, plus the plugin wire-up (touches `main.ts`, the composition root). UI-integration-tester owns the rendered-DOM seam test that locks the contract end-to-end.

## Sequencing & dispatch order

1. **A** (scaffolding, junior) — everything depends on the empty file shells.
2. **B** (fenced-block predicate, junior) — independent of C; can run in parallel after A.
3. **C** (regex tests, junior) — independent; can run in parallel after A.
4. **D** (decoration builder, senior) — depends on B (predicate). C's tests need not be green to start D, but should both green before F.
5. **E** (CSS, junior) — depends on D's locked class names.
6. **F** (ViewPlugin lifecycle, junior) — depends on D5 green.
7. **G** (mock extension, junior) — independent; can run any time before H.
8. **H** (integration tests, ui-integration-tester) — depends on F, E, G. H4 stays red until I3 lands.
9. **I** (plugin wire-up, senior) — last; turns H4 green.

## Perspective notes

Plan complexity is Medium. No multi-perspective sweep done. Minimalist note: the `refineMarkerExtension.ts` wrapper file is borderline-deletable (collapses into the view-plugin export); kept for symmetry with the registration call. Extensibility note: a future second marker (`@imprint`?) extends the regex into an array and adds a `Map<RegExp, classNames>` — the seam to add it is in `buildCastDecorations`, not in the view plugin or factory. Devil's advocate: the biggest risk is `@codemirror/lang-markdown`'s node-type names diverging from the bundled set Obsidian ships at runtime — mitigated by B3 capturing actual names. User-advocate: with viewport-only scanning and live updates the user gets the "instruction, not content" gestalt the pitch asks for; failure mode is one frame of flicker on huge pastes, acceptable.

reviewed @ 3548a59
