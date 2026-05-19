# Forge Spell Update

> `dev/done-028` — 2026-05-18 — Adds a second Forge mode that rewrites an existing user-authored spell in place, reached from the per-spell options panel and dispatched through a parallel meta-spell.

## What it does

Until this iteration, Forge was strictly a creation tool: it produced a new spell file from a plain-English description, and evolving a spell meant hand-editing markdown. This iteration adds an *update* mode. Opening a user-authored spell's options panel (`ArrowRight` on a spell row) now reveals a third button, **Forge**, below Cast and Reset. Clicking it dismisses the options panel and opens the familiar Forge dialog in update mode for the selected spell.

The dialog differs from create mode in three field-level ways: the spell name is shown as static text rather than an input, the description textarea is repurposed to "what should change about this spell?", and the *Execute on active note* checkbox is replaced by *Apply @cast directives* — a checkbox that appears only when the spell body contains one or more `@cast` lines, defaulted to checked, and labelled with a pluralised count (e.g. *(3 directives found)*). Since `spell-hotkeys` (`dev/done-029`), both modes also carry an optional Hotkey input; in update mode it is pre-filled from the spell's existing `grimoire-hotkey` and clearing it removes the key. Submitting dispatches a Forge update cast: the meta-spell rewrites the spell file in place, preserving frontmatter by default, and (when the checkbox was checked) strips the matched `@cast` lines as part of the rewrite. The Cast Log surfaces the operation with a new label, *Forge (update)*, distinct from the *Forge* label used by create casts.

The Spell Picker's keyboard hot path is untouched. Forge update has no shortcut — the options panel is the mandatory entry point.

## Design decisions

- **Mode is determined by entry point, not by content heuristics.** The dialog renders what it is told; it does not detect intent. Rejected: an "edit existing" toggle on the create-mode dialog, and auto-detect-update-intent from description text — both would split the user's mental model.
- **Spell content is not embedded in the dialog state or user prompt.** Instead, the cast dispatches with `executeOnNote: true` and `activeFilePath` pointing at the spell file, so Claude Code reads the live file at cast time. Rejected: capturing a snapshot of the body at dialog-open time — adds a redundant in-plugin read and creates stale-snapshot risk.
- **`@cast` directive removal is meta-spell-driven, not plugin-driven.** The meta-spell is already rewriting the body; a post-write strip step in the plugin would race with the meta-spell. Single owner for the write.
- **Frontmatter is preserved by default.** The meta-spell carries an explicit instruction to keep `tags`, `grimoire-execute-on-note`, and any other keys unless the description explicitly asks for changes. No silent rewrite.
- **A `SystemSpellRegistry` replaces the existing `if path === <forge> / <refine>` switch in the cast-log display-name resolver.** Adding `<forge:update>` becomes one registration call rather than a third branch — the OCP seam pays off here and for any future system sentinel.
- **Two parallel imprinters share a `SpellImprinter<Snapshot>` interface.** Honest LSP substitutability; the popup builder constructs one of each and binds them to distinct action callbacks. Rejected: a `Template Method` base class — the shared sequence is ~10 lines and the variations are non-trivial.

## Scope

**In:**
- A third button on the options panel for user-authored spells, plus the Forge dialog mode-split.
- A bundled `forge-update.md` meta-spell template, materialised into the plugin directory on load and on every settings save (parallel to `forge.md`).
- A `<forge:update>` cast-log sentinel and a `SystemSpellRegistry`-driven label.
- Conditional *Apply @cast directives* checkbox with pluralised count indicator.

**Out:**
- Edit-history, versioning, backups, diff, or rollback — out of pitch scope; users rely on Obsidian file recovery and git.
- Multi-spell batch update — one spell at a time; no second use case yet.
- A preview / dry-run before cast — the cast streams output to file; the user sees the result in Obsidian.
- Keyboard shortcut for Forge update — the options panel is mandatory, by pitch design.
- Exposure on sentinel rows (Forge / Refine) and sentinel-marked notes — sentinels have their own surfaces; user-authored spells only.
- A user-customisable update template (analogous to Custom Refine) — defer until requested.
- Restructure of `ForgeImprinter`'s caster construction — beyond the one-line `implements SpellImprinter` declaration; the existing caster + logWriter contract stays.

## Relationship to existing system

- **Extends `forge-cast` and `forge-spell-materialization`** — the dialog shell, the imprinter sequence, and the materialisation lifecycle are mirrored, not forked. Both feature docs were patched in the same iteration to describe the second mode.
- **Mounted from `options-panel`** — the panel grows a third button next to Cast and Reset, gated on the spell variant (Refine sentinel does not render it).
- **Reuses `command-popup-ui`'s detail-phase plumbing** — adds a fourth detail variant (`renderForgeUpdate`) alongside the existing three.
- **Reuses `cast-log-foundation`'s sentinel pattern** — `FORGE_UPDATE_SPELL_PATH = '<forge:update>'` joins `<forge>` and `<refine>` in `SystemSpellPaths`.
- **Reuses `cast-log-panel`'s display-name resolver** — the resolver now consults a `SystemSpellRegistry` instead of branching inline, and the registry yields *Forge (update)* for the new sentinel.
- **Reuses Refine's `@cast` regex** — `castDirectiveExtractor` imports `CAST_LINE_REGEX` from the editor decorator's source rather than copying the pattern (single source of truth).

## Behavior changes

- **Cast Log display-name resolution:** previously, the resolver inlined an `if (path === '<forge>') … else if (path === '<refine>') …` switch in `displayName.ts`. Now it delegates to a `SystemSpellRegistry` populated at composition root. Reason: replacing the switch with a registry was a precondition for adding `<forge:update>` without a third branch, and unblocks any future system sentinel.
- **Options panel for spells:** previously rendered Cast and Reset only. Now renders a third *Forge* button below them when the panel is for a user-authored spell (not for the Refine sentinel). Reason: this is the only entry point to update mode by design.
- **Forge dialog callback shape:** previously emitted a single `onSubmit(snapshot)`. Now emits `onCreateSubmit` or `onUpdateSubmit` depending on `mode.kind`. Reason: ISP-correct narrow callbacks; create-mode callers never see update-snapshot plumbing and vice versa.
