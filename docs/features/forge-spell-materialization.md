# Forge Spell Materialization

> `dev/done-017` — 2026-05-15 — Replaces the over-the-wire forge meta-spell with a bundled `forge.md` template that the plugin materializes into the vault on load and on every settings save; both local and remote forge casts now reference the same file.

## What it does

The Forge sentinel previously assembled a ~60-line meta-spell on every submit and shipped that whole block as the cast's user prompt — inline locally as `-p <metaSpell>`, and over the wire to the portal as the `userPrompt` field. After this iteration, the long instructions live in a single file at `<vault>/.obsidian/plugins/grimoire/forge.md`. The plugin renders that file from settings on `onload` and re-renders it after every settings save.

Each forge cast now sends only a small five-line user prompt (description, name, model, effort, executeOnNote) and points the runner at the materialized file. Local casts pass `--system-prompt-file <abs path>`; remote casts send `spellPath: ".obsidian/plugins/grimoire/forge.md"` plus the same small `userPrompt`. The portal looks the path up the same way it looks up any other spell — no special-case handler.

Behaviorally, nothing the user clicks changes. The toasts, the form, the sanitisation, the cast log row that shows `<forge>` — all identical. What changes is the wire and argv shape, and the appearance of a new auto-generated file inside the plugin directory.

## Design decisions

- **File lives at `<pluginDir>/forge.md`**, alongside `agent-hooks/` and the cast-log JSONL files. Plugin dir is already the home for plugin-managed artefacts; it is excluded from Obsidian's file index and from the spell scanner. Rejected: a new top-level `.grimoire/` dir (extra lifecycle, no benefit) and burying the file inside `forgeOutputFolder` (mixes plugin-managed content with user-visible spells).
- **Local mode also uses `--system-prompt-file`**, mirroring remote. One code path, one set of integration assertions, no `if (local) inline else file` branch. Rejected: keeping local inline as a smaller diff — it doubles the branches the imprinter has to test.
- **Per-settings content in the file, per-cast values in `userPrompt`.** The file carries Execution Mode, MCP Tools, the workflow instructions, `spellTag`, `forgeOutputFolder`, and `vaultMountPath`. The five form values stay in the user prompt because they change every cast.
- **Re-materialize eagerly on `onload` and on every settings save**, not per cast. `onload` guarantees the file exists before the popup command is registered; settings save keeps it current. Per-cast re-rendering would force `async imprint()` through the whole popup teardown chain for no observable benefit.
- **Render from TypeScript, not from a bundled `.md` asset.** Matches the existing `hookScripts.ts` pattern; esbuild needs no new loader. Rejected: a text-loader for `.md` literals — premature until a third template appears.
- **`FORGE_SPELL_PATH = '<forge>'` stays purely as a cast-log sentinel.** The string still tags cast-log rows so the panel can recognise "this came from the Forge UI". The `spellPath` that travels to the portal is the real vault-relative path. The two namespaces were already separated by `cast-unification`; this change preserves that separation.

## Scope

**In:**
- New pure renderers `renderForgeSystemPrompt` (in `forgeTemplate.ts`) and `buildForgeUserPrompt`.
- New `ForgeMaterializer` class mirroring `HookMaterializer`'s port shape.
- New `PluginPaths.forgeSpellPathAbs()` / `forgeSpellPathVaultRel()` accessors.
- `ForgeImprinter` rewritten to pass `systemPromptFile` + `spellPath` into the caster.
- Eager materialization wired into `CastLogModule.initStartupMaintenance` and fire-and-forget re-materialization wired into `GrimoireSettingTab` via an `onSettingsSaved` callback.
- `forge.md` gitignored at repo root (it materializes wherever the test vault runs).
- Unit, integration, and edge-case coverage including empty `vaultMountPath` and argv ordering regressions.

**Out:**
- Renaming the `<forge>` cast-log sentinel — still load-bearing for cast-log row identity.
- Bundling `forge.md` as a build-time `.md` asset — deferred until a third template needs the same treatment.
- Per-cast re-materialization — premature; the one-cycle staleness window between a settings save and the immediately-following cast is acceptable and bounded by the 500ms save debounce.
- A portal-side `/forge` endpoint or any portal awareness that this `spellPath` is special — the portal correctly treats it as an ordinary file lookup.
- Fixing the empty-`vaultMountPath` degraded mode — pre-existing edge case, separate concern.

## Relationship to existing system

- **Extends `forge-cast`.** The form, the sanitisation, the toasts, and the cast-log sentinel are unchanged; only the prompt-assembly and caster-invocation step is rewritten. The `forge-cast` live spec was patched in the same commit to describe the new flow.
- **Mirrors `cast-log-foundation`'s hook materialization.** `ForgeMaterializer` is shaped after `HookMaterializer` (same port interface, same `DataAdapter` fallback, same `try/catch + console.error` posture on `onload` failures). Both run inside `CastLogModule.initStartupMaintenance`.
- **Preserves `cast-unification`'s separation** of the cast-log sentinel namespace from the portal-lookup-key namespace. `recordCasted({ spellPath: '<forge>' })` writes the sentinel; `caster.cast({ spellPath: '.obsidian/plugins/grimoire/forge.md' })` carries the real path.
- **Composes with `remote-casting`'s transport.** `RemoteCastTransport`'s body shape already accepted optional `spellPath`; no portal-side schema or handler change was needed. The portal repo received a docs note only.
- **No interaction with `spell-execute-on-note`'s flow.** `executeOnNote` continues to flow through the form snapshot into the user prompt, which the materialized instructions then reference by name.

## Behavior changes

- **Wire body for remote forge:** previously `{ spellPath: '<forge>', userPrompt: '<60-line meta-spell>', … }`. Now `{ spellPath: '.obsidian/plugins/grimoire/forge.md', userPrompt: '<5-line per-cast block>', … }`. Reason: stop pushing the meta-spell on every cast; give the portal a single source of truth on disk.
- **Local subprocess argv for forge:** previously `-p <60-line meta-spell>` with no `--system-prompt-file`. Now `--system-prompt-file <abs path> -p <5-line per-cast block>`. Reason: symmetry with remote; the unified `Caster` interface already supports the file branch via `buildCastArgs`.
- **Plugin `onload` side effects:** in addition to materializing agent hooks and sweeping scratch files, `onload` now writes `<pluginDir>/forge.md`. Failures are caught and logged; the plugin still loads. Reason: the file must exist before any cast is initiated.
- **Settings save side effects:** every persisted change now fire-and-forgets a forge re-render. Reason: the file embeds `spellTag`, `forgeOutputFolder`, and `vaultMountPath`, so settings edits must reach the file before the next cast.
- **`buildMetaSpell.ts` is deleted.** Reason: superseded by `renderForgeSystemPrompt` + `buildForgeUserPrompt` + `ForgeMaterializer`. Existing references in `spell-execute-on-note` and other live specs were patched in the same commit.
