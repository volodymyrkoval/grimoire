# Refine Spell Buildout

> `dev/done-026` · 2026-05-17 · Port the richer three-mode Refine prompt body from the source vault note into the plugin, replacing the stripped-down placeholder.

## What it does

The Refine spell body that gets materialised to `<pluginDir>/refine.md` on every plugin load grew from a ~30-line placeholder into a structured, three-mode prompt. The three modes are Follow directives, Generate, and Expand: Claude reads the active note and decides which applies, using rules carried entirely inside the prompt body. Notably, the Generate (Mode 1) and Expand (Mode 2) procedures become functionally live as a consequence — Refine now does something useful even on a note with no `@cast` directive lines.

The ported body also adds explicit vault-search and web-research orchestration (three parallel research agents with a freshness check and a DuckDuckGo fallback), a writing-style guidance block, and an output-rule discipline that prefers line-level patches over full-body rewrites.

This is a content-only change. No plugin code path moves — not the Spell Picker, options panel, active-note guard, `@cast` marker decorator, cast lifecycle, materialiser, or dispatcher. Only the string returned by the Refine prompt renderer changed. The canonical reference note in the user's vault was updated in lockstep so its embedded prompt body matches what the plugin ships.

## Design decisions

- **Mode detection stays in the prompt, not the plugin.** Claude branches at runtime by reading the note; the plugin has no mode-dispatch, word-counting, or `@cast`-parsing code to add. Mode order and trigger criteria (including the under-50-words rule for Generate and the `@cast`-first precedence) are carried as prompt text.
- **Output rules flip to prefer line-level patches.** The source said "replace the entire note body"; Refine now prefers patching specific lines when the change is local and falls back to full-body replacement only for structural rewrites, with explicit criteria given to Claude. YAML frontmatter is preserved in both modes.
- **Vault-specific bindings dropped.** The progress-protocol logging, the NotebookLM access section, the new-note tag-conventions callout, and a personal ntfy notification URL were all removed — progress and notifications are owned by the cast lifecycle, not the prompt body.
- **No restructuring of the prompt into helpers.** It is one static string with no per-cast variation and no second caller; decomposing it into a builder or per-mode strategy would obscure the document and earn nothing.

## Scope

**In:** Rewriting the Refine prompt string; adapting its tests to assert the new structural anchors and the dropped tokens; updating the canonical vault note in lockstep.

**Out:**
- New modes beyond the three — Translate, Summarise, Critique, etc. belong to user-authored spells, not the built-in.
- Any change to how Refine is invoked (Spell Picker entry, options panel, active-note guard, `@cast` marker, cast lifecycle) — separate concern, all unchanged.
- Plugin-side mode dispatch or word-counting — kept in the prompt by design.
- Tuning the web-research orchestration — the source pattern is the baseline.

## Relationship to existing system

Builds directly on `refine-cast.md` and the Refine materialiser. The materialiser re-renders the now-larger prompt on every load through the same write flow; its tests reference the renderer as a value, not its internal text, so they pass through unchanged. The custom-refine seeding flow (`custom-refine-spell.md`) seeds whatever the current bundled body is, so it now seeds this richer body.

## Behavior changes

- **Refine on a note with no `@cast` lines:** previously the cast required `@cast` directives or a follow-up to do anything → now the Generate and Expand modes are described to Claude, so a directive-free note triggers autonomous generation or expansion. Why: the buildout's whole point was to make Modes 1 and 2 functionally live.
- **Local edits:** previously the prompt instructed Claude to replace the entire note body → now it prefers line-level patches and reserves full-body replacement for structural rewrites. Why: line-level patches are less destructive for local changes.
