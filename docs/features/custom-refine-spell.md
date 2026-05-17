# Custom Refine Spell

> `dev/done-027` — 2026-05-17 — Users can supply their own Refine prompt by marking a vault note with `sentinel: refine` in its frontmatter. Settings picks the active variant; the Refine OptionsPanel can override it per cast.

## What it does

Refine's prompt body used to be hardcoded in the plugin and materialised to `<pluginDir>/refine.md` on every load. Power users who wanted to inject MCP tools, vault-specific context, or a different writing style had to fork the plugin. This iteration lets them author a Refine variant as an ordinary vault note: add `sentinel: refine` to the frontmatter and the note becomes a selectable Refine template.

A new **Custom Refine spell** section in Settings lists every sentinel-marked note (with *Default (built-in)* pinned first). A **Create from default** button writes a fresh note into the Forge output folder containing the current bundled Refine body wrapped in the sentinel envelope, then selects it as the active Refine. When a custom Refine is active, an **Open** link appears that navigates to the note in the current Obsidian leaf.

The Refine OptionsPanel grows a conditional dropdown below the Cast button, listing the same variants. It is visible only when at least one sentinel-marked note exists, and overrides the Settings default for the current cast only. At dispatch time, the prompt file is resolved as **per-cast override → Settings active → bundled default**. If the chosen file has been deleted, made unreadable, or lost its `sentinel: refine` frontmatter, the cast falls back to the bundled default and posts the Notice `"Custom Refine spell not found — using default"`.

## Design decisions

- **Frontmatter sentinel is the sole discovery signal.** Rejected: filename pattern, tag, dedicated directory scan. Adding a second mechanism would split the user's mental model; the frontmatter key is also the natural seam for a future `sentinel: forge`.
- **Sentinel-marked notes are excluded from the Spell Picker** even when they carry the spell tag. Without this, the same note would appear as both a castable spell and an active Refine option.
- **Resolution happens at dispatch time, not at popup-open or hydration time.** Hydration cannot validate paths because the metadata cache is not yet populated on `onload`; a single resolver call inside `refineCastAction` gives one Notice path that handles missing / unreadable / un-marked all the same.
- **One Notice text regardless of fallback reason.** The reason field (`missing` / `unreadable` / `sentinel-removed`) is informative for tests but never surfaced — a single string keeps the user model simple.
- **Custom files live in `forgeOutputFolder`, not a new setting.** The user already understands where Forge writes; reusing that accessor avoids a premature `customRefineFolder` field.
- **`Vault.create`, not `DataAdapter.write`.** `Vault.create` updates Obsidian's index synchronously so the new file is immediately visible to the next sentinel scan; the lower-level writer would force a settle-and-retry loop.
- **Per-cast override lives in the existing `OptionsSessionMap`.** A new `refinePathOverride?: string | null` field on the Refine session entry reuses the existing session lifecycle (cleared on popup close, on Reset). `undefined` = no per-cast choice; `null` = explicit *Default (built-in)*; string = a specific variant.
- **Switcher placement below the Cast button, no keyboard binding.** The control is a "tweak you reach for," not a step in the keyboard flow. Keeps the high-frequency Refine cast hot path (`Enter` on the Refine row) untouched.
- **No auto-migration when the bundled body changes.** Existing custom files stay frozen by design — re-running *Create from default* produces a new file from the new bundled body. Users own their vault content.
- **No content validation, no editor surface.** The plugin treats custom files as opaque. *Open* navigates to the note in the existing Obsidian leaf; nothing else is built.

## Scope

**In:**

- `refineSentinelScanner` (vault scan + `isRefineSentinel` predicate) and a shared `refineSentinel` constants module.
- `resolveRefinePath` — pure resolver implementing the per-cast → Settings → bundled cascade.
- `CustomRefineSeeder` — writes a sentinel-marked note containing the current bundled Refine body (with the materialiser's auto-generated envelope stripped), handling name collisions with a bounded `Custom Refine`, `Custom Refine 1`, … probe.
- `CustomRefineSection` rendered between General and Advanced in Settings; new `activeRefinePath: string | null` field on `GrimoireSettings`.
- `RefineVariantSelect` mounted below the Cast button in the Refine OptionsPanel, wired through the existing `OptionsDetail` / `OptionsPanel` seam.
- `refineCastAction` (in `CommandPopupBuilder`) routes through `resolveRefinePath` and emits the fallback Notice.
- `getSpells` filter that excludes sentinel-marked notes from the Spell Picker.
- New integration suites for the variant select, the Settings section, and the cast resolution; new unit suites for the scanner, resolver, and seeder.

**Out:**

- Editor integration (live preview, content validation, custom editor surface) — pitch defers; the plugin treats custom files as opaque.
- Auto-migration of existing custom files when the bundled body changes — would override user-owned content; explicit re-seed is the gesture.
- Surfacing custom Refines in the Forge dialog — Forge authors *new* spells; Custom Refine edits the *existing* default. Separate concerns.
- "Set as default" affordance inside the OptionsPanel switcher — Settings remains the single source of truth for the active default.
- Cross-session persistence of the per-cast override — within a session the session map remembers it; across sessions it resets to the Settings default. Matches existing per-cast model/effort behaviour.
- Keyboard binding for the OptionsPanel switcher — sits past the Cast button by design, outside the keyboard flow.
- A symmetric `sentinel: forge` mechanism — the key is forward-compatible but Forge customisation has different content-shape concerns and waits for its own pitch.
- Aggressive cleanup of stale `activeRefinePath` at hydration — silent settings mutation on every restart is worse than a per-cast fallback Notice.

## Relationship to existing system

- **Extends `refine-cast` (019/028).** Same dispatch pipeline and cast-log row identity (`<refine>`); the new resolver supplies the `systemPromptFilePath` instead of the hardcoded bundled path. `RefineMaterializer` and the bundled `refine.md` remain untouched and become the *Default (built-in)* target.
- **Extends `settings-panel` (002/011).** Adds a third section between General and Advanced; the existing integration test's element-count expectation was updated in this iteration.
- **Extends `refine-note-dialog` (017) and `options-panel` (005).** Reuses `OptionsDetail` (the unified spell/refine coordinator from `audit-002-rework`), `OptionsPanel`, `OptionsFormState`, and `OptionsSessionMap`. The session entry gains one optional field.
- **Touches `live-spells-and-casting` (004).** `getSpells` now additionally filters out sentinel-marked notes — the only change to the scanner since `spell-execute-on-note`.
- **Reuses `forgeOutputFolder` setting** for seeder output. Forge itself is unchanged.

## Drift report

Updated (in `dev/done-027` itself, by the executor's planned drift sweep):
- `docs/features/refine-cast.md`: added a *Resolution rules* section describing the cascade and fallback Notice.
- `docs/features/refine-note-dialog.md`: noted the conditional dropdown below the Cast button.
- `docs/features/settings-panel.md`: described the new *Custom Refine spell* section and split the *In* list per iteration.

Updated by this live-spec pass:
- `docs/features/live-spells-and-casting.md`: the "any tagged file is a spell" claim drifted — sentinel-marked notes are now excluded even when tagged.
- `docs/features/options-panel.md`: the *Refine sentinel variant* section did not mention the new switcher below Cast.

No drift detected in `CLAUDE.md`, `README.md`, or other top-level docs — Custom Refine is additive to user-facing surfaces those files describe.
