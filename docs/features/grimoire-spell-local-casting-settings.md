# Spell-Local Casting Settings

> `dev/done-034` — 2026-05-27 — Per-spell model/effort overrides move out of the plugin data store and into each spell's own frontmatter, under a namespaced, provider-anchored `grimoire-casting` key.

## What it does

A spell now records how it casts inside its own top-of-file YAML frontmatter, under the key `grimoire-casting`. The block names a **provider** (always `claude-code` today), a **model** (always present), and optionally an **effort** level (present only when the chosen model supports it). The spell file becomes the single source of truth for its own casting parameters; the plugin's data store keeps only vault-wide settings.

At cast launch — whether the user opens the options panel or presses Enter from the spell list — the resolver reads the block and falls back to the global default **value by value**: model from the block, effort from the block when valid for that model. If the block is absent, malformed, missing its model, or names a provider the plugin no longer recognises (a stale binding), the fallback is **wholesale** — provider, model, and effort all come from the global default together, with no partial inheritance.

The options panel writes the block to the spell's frontmatter when the user casts after changing the model or effort, and only when the values actually differ from what is already stored. The non-default notification dot on a spell row now lights from the presence of this frontmatter block. The Forge sentinel stamps the block into newly created spells via its system-prompt instruction. A one-time migration on plugin load folds any existing data-store overrides into their spell files and retires those records.

## Design decisions

- **Provider is the anchor; effort is optional.** The block is forward-compatible with future multi-provider work without building any provider machinery now. Effort's absence is never treated as a default — it simply means the bound model has no effort concept.
- **Two pure functions kept separate, not folded.** `resolveSpellOptions` still owns the session→source→settings cascade ordering; the new `resolveCastingForSpell` owns the frontmatter-vs-default value policy (wholesale-vs-per-value, stale provider). Conflating them would push I/O-shaped policy into the cascade.
- **Frontmatter read/write modelled as narrow callback ports**, mirroring the existing `HotkeyWriter`/`HotkeyEraser` seam — rejected a full repository abstraction or Strategy hierarchy as heavier than the problem needs.
- **`SpellOverrideStore` is retained, not deleted.** The Refine sentinel is a synthetic path with no backing file, so it cannot carry frontmatter; its override stays in the data store. Only real-spell records were migrated out.
- **Writes are change-gated.** The panel compares the about-to-write block against the current stored block and skips the write when they match, to avoid thrashing Obsidian Sync on every cast.
- **All file access goes through `app.vault` / `app.metadataCache` / `app.fileManager`** (`processFrontMatter` for writes) — no Node file APIs.

## Scope

**In:** the `grimoire-casting` frontmatter shape and trust-boundary parser; the pure value-policy resolver; read/write/erase frontmatter ports; resolver wiring in the options panel and the Enter-from-list path; the panel write-target swap and notification-dot source; Forge stamping; the one-time idempotent migration.

**Out:**
- **Provider machinery** (adapters, a registry, a Strategy hierarchy) — only one provider exists; the shape is forward-compatible but builds none of it (premature, YAGNI).
- **A `defaultProvider` field on `GrimoireSettings`** — the global default's shape belongs to the Settings work; the single provider id stays a local constant here (separate concern).
- **MCP / access-control config in the spell** — those belong in provider config files (separate concern).
- **Removing `spellOverrides` entirely** — retained for the Refine sentinel, which has no backing file (deliberate scope boundary).
- **Concurrent-write locking** — `processFrontMatter` already serialises per file at the Obsidian layer (deferred, no own locking added).
- **A notification dot for the Refine sentinel** — the dot is only painted on spell rows, never sentinel rows (out of scope as before).

## Relationship to existing system

- **Replaces the per-spell override tier's *source*** described in `options-panel` and `command-popup-ui`: for real spells, the model/effort override now lives in frontmatter rather than in `SpellOverrideStore`. The three-tier pre-fill order (session → override → settings) is unchanged in shape — only the override tier's backing store moved.
- **Repurposes "Set as default"** in the options panel: it now writes the vault-wide default, not a per-spell record (see Behavior changes).
- **Extends Forge** (`forge-spell-materialization`): the system-prompt template's create instruction now also stamps the `grimoire-casting` block alongside the existing `tags` and `grimoire-execute-on-note` keys.
- **Keeps the Refine sentinel on the data store** (`refine-note-dialog`): its override is unaffected and still flows through the retained `SpellOverrideStore`.
- **Builds on** `cast-unification`'s single cast action — both the panel and the Enter-from-list paths feed the same `CastDispatcher` with already-resolved `{ model, effort }`, so no separate remote read path was needed.

## Behavior changes

- **"Set as default" target:** previously wrote a per-spell record into `SpellOverrideStore` (model+effort for that one spell). Now writes the plugin-wide `defaultModel`/`defaultEffort` in settings. Why: a default is a vault-wide concern by definition; the per-spell record's job is now done by the always-written frontmatter block.
- **Enter-from-list resolution:** previously built the cast snapshot from settings defaults only, so a spell's saved overrides applied solely when the panel was open. Now it reads the spell's `grimoire-casting` block and resolves through it. Why: the frontmatter block is the spell's own source of truth, so it should apply on every cast path, not just the panel.
- **Notification-dot source:** previously lit from `SpellOverrideStore.has(path)`. Now lit from the presence of a `grimoire-casting` block in the spell's frontmatter. Why: the override moved to frontmatter, so the dot must read from there.
- **Override storage location:** previously `data.json` → `spellOverrides[path]`, keyed by vault path. Now the spell file's own frontmatter. Why: a path key orphans on rename/relocate, is stripped when copied across vaults, and can be clobbered by Sync's last-modified-wins; co-locating with the prompt fixes all three. A one-time load-time migration folds existing records in and drops the per-spell records (the Refine sentinel record is left intact).
