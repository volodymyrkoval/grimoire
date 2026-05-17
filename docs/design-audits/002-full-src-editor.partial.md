---
shard: src-editor
verdict: REWORK
violation_count: 2
---

# Design Audit Partial: src/editor

## Threshold Violations

- src/editor/buildCastDecorations.ts:23-34 — Nesting depth > 2 — `buildCastDecorations` reaches depth 3: `for` (visibleRanges) > `while` (pos <= to) > `if` (match && !isInsideFencedCodeBlock). Refactoring move: Extract Method — pull the per-line decoration emission into a helper (`emitCastDecorationsForLine(builder, state, line)`), and/or replace the `for`+`while` document walk with `Extract Method` `forEachVisibleLine(view, fn)`, flattening the body to depth 1.
- src/editor/isInsideFencedCodeBlock.ts:15-25 — Nesting depth > 2 — `isInsideFencedCodeBlock` reaches depth 3: `try` > `while (node)` > `if (FENCED_OR_INLINE_CODE_NODES.has(...))`. Refactoring move: Replace Nested Conditional with Guard Clauses / Extract Method — split into `resolveNodeChain(state, pos)` (try/catch returning an iterable of node names) and a flat `chain.some(name => FENCED_OR_INLINE_CODE_NODES.has(name))` check.

## Violations by Smell

### God Class
None detected.

### Long Method
None detected. All function bodies are ≤ 20 LOC.

### Feature Envy
None detected.

### Data Clumps
None detected.

### Primitive Obsession
None detected. `pos: number` and `line.from: number` are CodeMirror's native position type — domain-neutral at this layer.

### Divergent Change
None detected.

### Shotgun Surgery
None detected.

### Message Chains
None detected. `state.doc.lineAt(pos)` and `syntaxTree(state).resolveInner(pos, 1)` are two-hop calls into stable CM6 APIs, not domain message chains.

### Middle Man
None detected. `refineMarkerExtension()` returns `[castMarkerViewPlugin]` — a one-element array — but it is the documented extension-point seam, not a delegation wrapper.

### Leaky Abstraction
None detected. CM6 types stay inside `src/editor/`; nothing exports `EditorView`/`EditorState` outward through this shard's public surface.

### SRP violation
None detected. Each module has a single reason to change: regex shape, fenced-code detection, decoration assembly, view-plugin lifecycle, extension wiring.

### DIP violation
None detected.

### ISP violation
None detected.

### OCP violation
None detected.

### LSP violation
None detected.

## Verdict
REWORK
