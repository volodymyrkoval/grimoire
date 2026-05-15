# Refine Marker Styling

> `dev/done-019` — 2026-05-16 — Decorates every editor line whose first character is the literal `@cast` token (case-sensitive, followed by whitespace or end-of-line) with a callout-style visual: muted background tint, accent left border, and a distinct treatment on the `@cast` keyword itself.

## What it does

While the user edits a markdown note, lines that begin with `@cast ` (or bare `@cast` at end-of-line) are highlighted with a tinted background, a thicker accent-coloured left border, and a bold accent on the `@cast` keyword. The treatment is purely visual — `@cast` lines remain plain text in the file, and the decoration disappears the instant the line stops matching (deletion, edit, or the Refine cast scrubbing it out).

The match is strict. Only `@cast` at column 0, followed by whitespace or end-of-line, decorates. Indented variants (`  @cast`, `- @cast`, `> @cast`), substrings (`@casting`, `@castaway`), uppercase forms (`@CAST`), and occurrences inside fenced code blocks or single-backtick inline spans are deliberately left undecorated — code is content, not directive. Colours come entirely from Obsidian theme variables, so the styling adapts to whichever theme the user has active.

Decorations are computed only over the visible viewport and rebuilt on document or viewport changes, so cost stays constant regardless of note size. The extension is registered globally across every CodeMirror editor Obsidian opens; non-markdown editors simply yield no matches.

## Design decisions

- **CodeMirror 6 `ViewPlugin`, not a markdown post-processor.** The pitch deliberately targets the live editor, not the reading view. A `ViewPlugin` plus `registerEditorExtension` is the standard CM6 surface for live-editor decorations and gives instant, per-keystroke updates.
- **Fenced-block suppression via the syntax tree, not a hand-rolled fence counter.** `syntaxTree(state).resolveInner(pos)` ancestor walk asks the markdown parser directly whether a position is inside code. Robust against partial parses (caught and treated as "not in code"); no manual fence-state machine to drift.
- **Inline single-backtick spans suppressed too.** The pitch was silent on this; the project applied the same "code = content" rule. One-line flip in the node-name set if the call ever reverses.
- **Viewport-only scan.** CM6's `view.visibleRanges` keeps work proportional to what is on screen, not to document size. Scrolling re-runs the builder via `viewportChanged`.
- **Theme variables only — no hardcoded palette.** Background uses `--background-modifier-hover`, accent uses `--interactive-accent`. The marker reads correctly on any theme the user installs.
- **Defensive `update` rebuild.** Exceptions from the decoration builder are caught and logged; the plugin falls back to `Decoration.none` rather than crashing the editor. Mirrors the existing `materializeForge().catch(console.error)` pattern in `onload`.
- **Thin `refineMarkerExtension()` factory wrapper kept** over a direct `castMarkerViewPlugin` registration. Lets `main.ts` import one symbol and stay agnostic of future co-installed extensions.

## Scope

**In:**
- Live-editor decoration of bare top-level `@cast` lines.
- Two CSS classes — `grimoire-cast-line` (whole line) and `grimoire-cast-marker` (5-char keyword span) — wired through `Decoration.line` and `Decoration.mark`.
- Word-boundary match (`/^@cast(?=\s|$)/`), case-sensitive.
- Fenced-block and inline-code suppression via the markdown syntax tree.
- Global registration through `Plugin.registerEditorExtension` in `GrimoirePlugin.onload`.
- Theme-variable-driven CSS rules in `src/main.css`.

**Out:**
- Reading-view styling — the pitch explicitly defers it; a separate markdown post-processor is the future home.
- Icon, widget, or wand-glyph decoration — out of pitch; visual treatment is text/border only.
- Settings exposure (toggle, colour override, marker-text override) — premature without a second use case.
- Marker-text variants or aliases (`@imprint`, etc.) — only one matcher exists; YAGNI until a second lands.
- Leading-whitespace, list-marker, or blockquote tolerance — pitch said "line-start" literally; relaxing it later is one regex edit.
- Coupling to cast state, Refine config, or any plugin data — decorations are purely textual.

## Relationship to existing system

- **Completes the `refine-cast` (018) loop.** Refine's prompt instructs Claude to act on `@cast` lines and remove them; this feature gives the user the visual signal that a line *is* a `@cast` directive while they author it. The two features share no runtime coupling — the marker reads the document text, not Refine state.
- **First entry under `src/editor/`.** All prior plugin work lived in `src/domain`, `src/cast`, `src/ui`, `src/main`. The editor leaf depends only on `@codemirror/*` — a deliberately isolated module.
- **New runtime dependency on the markdown syntax tree.** Adds `@codemirror/language` and `@codemirror/lang-markdown` as devDependencies for typing and tests; Obsidian provides both at runtime via the existing `esbuild.config.mjs` externals.
- **Live-editor seam tested under `tests/integration/`.** The rendered-DOM test mounts a real `EditorView` in happy-dom, alongside existing UI integration tests.

## Behavior changes

- **`@cast` lines in the editor.** Previously rendered as plain markdown text indistinguishable from surrounding prose. Now visually marked while the user types, scrolls, or pastes — making Refine's directive lines self-evident without any UI chrome.
- **`GrimoirePlugin.onload` registrations.** Previously registered commands, UI, settings, and the cast-log/popup modules. Now additionally registers one CodeMirror editor extension (wrapped in `try/catch` so a registration failure still allows the plugin to load).
