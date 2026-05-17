# 029 — Custom Refine Spell

> Pitch: `brain/Grimoire - Custom Refine spell.md`
> Mode: `--deep` (multi-perspective: minimalist, extensibility, devil's advocate, user advocate)
> Builds on: `018-forge-spell-materialization`, `019-refine-cast`, `028-refine-spell-buildout`
> Related: `017-refine-note-dialog`, `025-sentinel-descriptions`

---

## Problem

The Refine prompt body is hardcoded in plugin source (`src/refine/refineTemplate.ts`) and materialised to `<pluginDir>/refine.md` on every plugin load. For most users, the bundled three-mode prompt is enough. Power users want to extend it — inject MCP tools, vault-specific context, custom mode logic, alternative writing styles — and today their only option is fork-and-rebuild.

The future-backlog item *"Allow users to extend the Refine Note spell"* has been waiting for a concrete shape. This iteration delivers it, with the integration constraint that the keyboard-driven Spell Picker — already optimised for the high-frequency Refine cast hot path — must not absorb a configuration option that most users never touch.

## Goals & non-goals

### Goals

- Users can mark any vault markdown note as a Refine-prompt template via a single frontmatter attribute (working name `sentinel: refine`).
- Settings gains a *Custom Refine spell* section with: a dropdown listing every sentinel-marked note (with `Default (built-in)` pinned first), a *Create from default* action button, and a contextual *Open* link visible only when a custom Refine is selected.
- The Refine OptionsPanel gains a conditional dropdown at the very bottom — below the Cast button — that lists the same options and overrides the Settings default for the current cast only. Renders only when at least one sentinel-marked note exists.
- Refine cast pipeline resolves the prompt file at dispatch time: per-cast → Settings → bundled default. Missing/unreadable/un-marked custom file emits a `Notice` and falls back to the bundled default.
- Sentinel-marked notes are excluded from the Spell Picker scan (they never appear as castable spells even if they also carry the spell tag).
- *Create from default* writes a fresh note to the existing Forge output folder containing the current bundled Refine body, sets `sentinel: refine` in its frontmatter, and selects it as the active Refine.

### Non-goals (per pitch's no-gos and rabbit holes)

- No editor integration: no live preview, no validation of prompt content, no custom editor surface. The *Open* link navigates to the note in the current Obsidian leaf.
- No automatic migration: when the bundled default body changes (e.g. via a future plan-NNN), existing custom files stay frozen. Re-running *Create from default* produces a new file from the new default.
- No surfacing of custom Refines inside the Forge dialog — Forge authors *new* spells from descriptions; Custom Refine edits the *existing* default.
- No "set as default" affordance inside the OptionsPanel switcher — Settings is the authoritative source of truth for the default.
- No second discovery convention (filename pattern, tag, directory scan). The frontmatter attribute is the sole signal.
- No cross-session persistence of the per-cast OptionsPanel choice. Within a session the existing `OptionsSessionMap` remembers it; across sessions it resets to the Settings default.
- No symmetry-by-default with Custom Forge Script. The sentinel attribute is *designed* to extend to `sentinel: forge` later, but Forge customisation has different content-shape concerns and waits for its own pitch.
- No gating of *Create from default* on the active Refine being default. Pressing it with a custom already selected is a valid gesture — it produces a new starting point.
- No keyboard binding for the OptionsPanel switcher. It sits past the Cast button, outside the keyboard flow, by design.
- No change to the existing keyboard-driven hot path: `Enter` on the Refine sentinel still fires an immediate cast using the resolved Settings default; the panel switcher only enters the picture when the user opens the options panel via Right arrow.

## Constraints

- TypeScript / esbuild / vitest. UI integration tests via happy-dom against `tests/__mocks__/obsidian.ts`.
- No Node.js native APIs (`fs`, `path`, `child_process`). All vault I/O via `DataAdapter` / `FileSystemAdapter` / vault APIs.
- ESLint `obsidianmd/no-manual-html-headings` — use `new Setting(el).setName('…').setHeading()`. No `createEl('h3', …)`.
- Pre-commit hook runs `lint → arch:check → test`. UI integration suite runs at `/done`.
- The existing `<pluginDir>/refine.md` materialisation by `RefineMaterializer` on every plugin load is preserved untouched — it is what *Default (built-in)* resolves to, and what *Create from default* copies from.

## Proposed solution

### Conceptual model

```
                ┌────────────────────────────────────────────────────┐
                │  Vault state (read-only signal for plugin)         │
                │  Notes with frontmatter `sentinel: refine`         │
                └─────────────────┬──────────────────────────────────┘
                                  │ scanned at:
                ┌─────────────────┼─────────────────┐
                │                 │                 │
       Settings render    SpellPicker scan   Refine OptionsPanel render
       (dropdown items)   (exclude from)     (conditional dropdown)

       Active default                         Per-cast override
       ──────────────                         ─────────────────
       data.settings                          OptionsSessionMap
         .activeRefinePath:                     entry for REFINE_SENTINEL_PATH
         string | null                          .refinePathOverride?: string | null

                                  │
                                  ▼
                       Resolver at dispatch time
                       (refineCastAction):
                       per-cast → settings → bundled
                                  │
                                  ▼
                       systemPromptFilePath argument
                       to CastDispatcher
```

### Component plan

A single new domain helper (`refineSentinelScanner`) for vault-state discovery. A new Settings section (extending `GrimoireSettingTab`). A small *Create from default* materialiser (`CustomRefineSeeder`) that uses the existing `renderRefineSystemPrompt()` plus a frontmatter prepender plus `sanitiseSpellName` + the Obsidian vault APIs to write the file. A new conditional widget (`RefineVariantSelect`) mounted at the bottom of the Refine variant of `OptionsPanel`. A new persistence field `activeRefinePath` in `GrimoireSettings`. An extension to `OptionsSessionEntry` with `refinePathOverride`. A resolver function (`resolveRefinePath`) called by `refineCastAction` in `CommandPopupBuilder`. The existing `RefineMaterializer` stays untouched.

### Behavioural changes (at a glance)

| Surface | Before | After |
|---|---|---|
| Spell Picker scan | Notes with `tags: [grimoire/spell]` appear | Same, BUT notes with `sentinel: refine` are excluded even if tagged |
| Settings panel | Spell tag, CLI, … | Adds a *Custom Refine spell* section with dropdown + button + conditional Open link |
| Refine OptionsPanel | Context notes / follow-up / model / effort / Cast | Same, plus a conditional dropdown *after* Cast (only when ≥1 sentinel-marked note exists) |
| `Enter` on Refine sentinel | Dispatches a Refine cast with the bundled default prompt | Same flow; dispatcher receives the resolved active path (Settings default) |
| Cast inside Refine OptionsPanel | Dispatches with bundled default | Dispatches with per-cast → Settings → bundled cascade |
| Plugin load | Materialises `<pluginDir>/refine.md` | Unchanged. Custom files live in the vault, not the plugin dir |

## Components

| Component | Location | Responsibility |
|---|---|---|
| `refineSentinelScanner` | `src/refine/refineSentinelScanner.ts` (new) | Returns the list of vault notes with `sentinel: refine` in their frontmatter. Pure function over `App`. Returns `Array<{ name: string; path: string }>` sorted by name. |
| `getSpells` (modified) | `src/infra/spellScanner.ts` | After existing tag filter, also exclude any file whose frontmatter has `sentinel: refine`. One-line addition. |
| `CustomRefineSeeder` | `src/refine/CustomRefineSeeder.ts` (new) | Writes a fresh note to `forgeOutputFolder` containing the bundled Refine body wrapped in a frontmatter envelope (`---\nsentinel: refine\n---\n\n<body>`). Returns the written path. Uses `Vault.create` (so Obsidian indexes it immediately). Handles name collisions by appending ` 1`, ` 2`, … |
| `resolveRefinePath` | `src/refine/resolveRefinePath.ts` (new) | Pure function: `(perCast: string | null, settingsActive: string | null, defaultPath: string) → { path: string; isFallback: boolean }`. Implements per-cast → Settings → bundled cascade. |
| `RefineVariantSelect` | `src/ui/options/RefineVariantSelect.ts` (new) | Renders the conditional `<select>` below the Cast button. Visible only when `variants.length > 0`. Built-in option always at top. Pre-selected to the Settings active value. `onChange` writes to the session map (per-cast override). |
| `OptionsPanel` (modified) | `src/ui/options/OptionsPanel.ts` | After Cast button row, optionally mount the `RefineVariantSelect` via a new optional dependency (`refineVariantSelectDeps?`). Spell variant ignores it. |
| `OptionsDetail` (modified) | `src/ui/components/OptionsDetail.ts` | When `kind === 'refine'`, builds the `RefineVariantSelectDeps` (variant list from scanner, current Settings active, session writer) and passes it to `OptionsPanel.render`. |
| `OptionsSessionEntry` (extended) | `src/ui/options/OptionsSessionMap.ts` | Adds optional `refinePathOverride?: string \| null` field. `null` = explicit "Default (built-in)". `undefined` = no per-cast choice (use Settings). |
| `optionsFormSnapshotFromRefineDefaults` (extended) | `src/ui/options/OptionsFormState.ts` | The snapshot also carries the resolved per-cast Refine path (read from session if set). |
| `CustomRefineSection` | `src/ui/settings/CustomRefineSection.ts` (new) | Renders the *Custom Refine spell* section inside `GrimoireSettingTab`: heading, dropdown, *Create from default* button, conditional *Open* link. |
| `GrimoireSettingTab` (modified) | `src/ui/settings/GrimoireSettingTab.ts` | After `#renderGeneralSection`, before `#renderAdvancedSection`, render the new section. |
| `GrimoireSettings` (extended) | `src/domain/settings/Settings.ts` | New optional field `activeRefinePath: string \| null`. Default `null`. |
| `hydrate` (extended) | `src/infra/settingsPersistence.ts` | Reads `activeRefinePath`, falling back to `null`. Validates: if non-null and the vault file no longer has the sentinel, leaves the field set but the resolver will fall back at cast time (silent until the next cast emits the Notice). |
| `CommandPopupBuilder` (modified) | `src/ui/popup/CommandPopupBuilder.ts` | `refineCastAction` calls `resolveRefinePath(snapshot.refinePathOverride, settings.activeRefinePath, bundledPath)`. On fallback (file missing / unreadable / un-marked), emits `Notice('Custom Refine spell not found — using default')`. Sets `systemPromptFilePath` accordingly. |
| `RefineMaterializer` | `src/refine/RefineMaterializer.ts` | **Untouched.** `<pluginDir>/refine.md` continues to be the bundled-default source. |

## Interfaces

```ts
// src/refine/refineSentinelScanner.ts
export interface RefineSentinelEntry {
  readonly name: string;   // file.basename
  readonly path: string;   // file.path (vault-relative)
}
export function getRefineSentinels(app: App): RefineSentinelEntry[];

// src/refine/resolveRefinePath.ts
export interface ResolvedRefinePath {
  readonly path: string;      // vault-relative for portal; plugin will prepend vaultMountPath for local
  readonly isFallback: boolean;
  readonly fallbackReason?: 'missing' | 'unreadable' | 'sentinel-removed';
}
export interface ResolveRefinePathInput {
  perCast: string | null | undefined;     // undefined = no per-cast choice; null = explicit "Default (built-in)"
  settingsActive: string | null;
  bundledDefaultVaultRel: string;
  isSentinel: (vaultRelPath: string) => boolean;  // dependency for the missing/un-marked check
}
export function resolveRefinePath(input: ResolveRefinePathInput): ResolvedRefinePath;

// src/refine/CustomRefineSeeder.ts
export interface CustomRefineSeederDeps {
  vault: Vault;                     // Obsidian Vault for create()
  forgeOutputFolder: () => string;  // setting accessor
  renderBody: () => string;         // renderRefineSystemPrompt
}
export class CustomRefineSeeder {
  constructor(deps: CustomRefineSeederDeps);
  /** Returns the vault-relative path of the new file. */
  seed(baseName?: string): Promise<string>;
}

// src/ui/options/OptionsSessionMap.ts (extended)
export interface OptionsSessionEntry {
  model: ModelId;
  effort: Effort | null;
  contextNotePaths: readonly string[];
  followUp: string;
  executeOnNote: boolean;
  /** Only meaningful for the Refine sentinel entry. */
  refinePathOverride?: string | null;
}

// src/ui/options/RefineVariantSelect.ts
export interface RefineVariantSelectDeps {
  variants: readonly RefineSentinelEntry[];
  initialPath: string | null;             // Settings active default
  onChange: (path: string | null) => void;  // null = "Default (built-in)"
}
export class RefineVariantSelect {
  mount(parent: HTMLElement, deps: RefineVariantSelectDeps): void;
  destroy(): void;
}

// src/ui/settings/CustomRefineSection.ts
export interface CustomRefineSectionDeps {
  containerEl: HTMLElement;
  app: App;
  getSettings: () => GrimoireSettings;
  setActiveRefinePath: (path: string | null) => void;  // writes settings + calls save
  seeder: CustomRefineSeeder;
  openVaultPath: (vaultRelPath: string) => void;       // app.workspace.openLinkText wrapper
  refresh: () => void;                                 // re-render this section after seed
}
export class CustomRefineSection {
  render(deps: CustomRefineSectionDeps): void;
}
```

### Frontmatter envelope written by the seeder

```
---
sentinel: refine
---

%%
Auto-generated by Grimoire (Create from default). Edit freely — the plugin does not overwrite this file.
%%

<body>
```

The body is the bundled `renderRefineSystemPrompt()` output verbatim, **without** the bundled file's `%% Auto-generated by Grimoire RefineMaterializer. Do not edit — overwritten on every plugin load and settings save. %%` envelope (which is misleading on a user-owned file). The seeder strips that envelope before writing. The user's file therefore reads cleanly as a vault note.

## Data flow

### Settings discovery (when the Settings tab opens)

```
GrimoireSettingTab.display
  └─► CustomRefineSection.render
        ├─► getRefineSentinels(app) → entries[]
        ├─► dropdown: { value: '', label: 'Default (built-in)' } + entries
        ├─► dropdown.setValue(settings.activeRefinePath ?? '')
        ├─► dropdown.onChange → setActiveRefinePath(value || null) → plugin.save()
        ├─► "Create from default" button → seeder.seed() → setActiveRefinePath(newPath) → refresh()
        └─► If activeRefinePath !== null: render "Open" link → openVaultPath(activeRefinePath)
```

### OptionsPanel discovery (when the Refine options panel opens)

```
OptionsDetail.render({ kind: 'refine', ... })
  └─► getRefineSentinels(app) → entries[]
  └─► OptionsPanel.render(..., refineVariantSelectDeps: entries.length > 0 ? {...} : undefined)
        └─► After Cast button row, if deps present → RefineVariantSelect.mount(form, deps)
              ├─► <select>: option('', 'Default (built-in)') + entries.map(option(path, name))
              ├─► initial selection: sessionEntry.refinePathOverride ?? settings.activeRefinePath ?? ''
              └─► onChange → sessionMap.put(REFINE_SENTINEL_PATH, { ...prev, refinePathOverride: value || null })
```

### Cast dispatch (Enter on Refine row OR Cast inside Refine OptionsPanel)

```
refineCastAction(snapshot)
  ├─► resolved = resolveRefinePath({
  │     perCast: snapshot.refinePathOverride,
  │     settingsActive: settings.activeRefinePath,
  │     bundledDefaultVaultRel: paths.refineSpellPathVaultRel(),
  │     isSentinel: (p) => app.metadataCache.getFileCache(file)?.frontmatter?.sentinel === 'refine',
  │   })
  ├─► if (resolved.isFallback) new Notice('Custom Refine spell not found — using default')
  ├─► dispatcher.dispatch({
  │     ...,
  │     systemPromptFilePath: resolved.path,
  │   })
  └─► popup.dismiss()
```

### Spell Picker scan (when the popup opens)

```
SpellsPanel constructor
  └─► getSpells(app, tag)
        ├─► getMarkdownFiles
        ├─► filter: hasTag(file, tag)
        ├─► filter: NOT hasSentinelRefine(file)   // <-- new
        └─► map → Spell[] sorted by name
```

## Error handling

| Failure | Behaviour |
|---|---|
| `activeRefinePath` points to a missing file at cast time | `resolveRefinePath` returns `{ path: bundledDefault, isFallback: true, fallbackReason: 'missing' }`. Notice: `"Custom Refine spell not found — using default"`. Cast proceeds with the bundled default. |
| `activeRefinePath` points to a file that no longer carries `sentinel: refine` | Same fallback path with `fallbackReason: 'sentinel-removed'`. Same Notice. |
| `activeRefinePath` points to a file outside the vault / unreadable | Same fallback path with `fallbackReason: 'unreadable'`. Same Notice. (Detected via `app.metadataCache.getFileCache`: returns null for files Obsidian does not know about.) |
| `forgeOutputFolder` does not exist when *Create from default* fires | `Vault.create` will throw. Catch → `Notice('Could not create Refine spell — check Forge output folder')`. Settings selection unchanged. |
| Name collision in `forgeOutputFolder` during seed | Seeder probes `Custom Refine.md`, `Custom Refine 1.md`, … until `Vault.getAbstractFileByPath` returns null. Bounded loop with a 100-iteration safety cap; if exhausted, throw. |
| Variant dropdown contains a stale entry the user just deleted from disk | The dropdown is rendered from the scanner output at panel-render time. Mid-session deletion → next panel open re-scans. Within an open panel, choosing a now-deleted entry triggers the resolver-fallback Notice on cast. |
| User selects a custom Refine, then deletes the file via Obsidian, then opens Settings | The dropdown re-renders without the stale entry. The setting's `activeRefinePath` is left in place (no aggressive auto-cleanup) — the next cast emits the standard fallback Notice. Aggressive cleanup is rejected to avoid silent settings mutation. |
| User clicks Open while `activeRefinePath` is null (i.e. Default is selected) | The Open link does not render. No-op possible. |

## Technical notes

### Design decisions

1. **Sentinel attribute is the single source of truth.** No tag, no filename pattern, no directory scan. The pitch's no-go is firm. Detection is `app.metadataCache.getFileCache(file)?.frontmatter?.sentinel === 'refine'`. The string `'refine'` is a constant on the scanner module (`REFINE_SENTINEL_FRONTMATTER_VALUE = 'refine'`). The key `'sentinel'` is a constant (`SENTINEL_FRONTMATTER_KEY = 'sentinel'`).

2. **Persistence shape: `activeRefinePath: string | null`.** A vault-relative path. `null` means *Default (built-in)*. We do not persist a "use-default" sentinel string because `null` is unambiguous and JSON-trivial. Saved across sessions via the existing `DebouncedSaver`.

3. **Per-cast override lives in `OptionsSessionMap`, not a new map.** The session map already keys on `SpellPath`; the Refine entry uses `REFINE_SENTINEL_PATH`. Adding `refinePathOverride?: string | null` to `OptionsSessionEntry` is the minimal extension and reuses the existing session lifecycle (cleared on popup close / Reset).

4. **Resolver returns a single vault-relative path, not a `{ abs, vaultRel }` pair.** The dispatcher already prepends `vaultMountPath` for the local caster's `systemPromptFile`; the same vault-relative value goes to the portal. Forge does the same (see `CommandPopupBuilder.refineCastAction` and `paths.refineSpellPathVaultRel()`). One value out of the resolver, two consumers downstream, no double bookkeeping.

5. **Bundled-default path stays under `<pluginDir>`.** When the resolver chooses the bundled default, it returns the existing `paths.refineSpellPathVaultRel()` (`.obsidian/plugins/grimoire/refine.md`). Custom files live in the user's `forgeOutputFolder`, which is index-visible.

6. **Custom file lives in `forgeOutputFolder` — not a new setting.** The pitch explicitly names this folder. It is index-visible, the user already understands where forge outputs go, and the seeder reuses the existing setting accessor. Rejected: a new `customRefineFolder` setting (premature, splits user mental model).

7. **`Vault.create` not `DataAdapter.write`.** `Vault.create` triggers Obsidian's index update synchronously and returns a `TFile`; subsequent metadata cache reads see the sentinel frontmatter immediately. `DataAdapter.write` is a lower-level filesystem write that bypasses indexing and would force a settle-and-retry loop in the seeder.

8. **Frontmatter envelope written manually as a string.** Obsidian does not expose a public frontmatter writer; the seeder's content is `'---\nsentinel: refine\n---\n\n' + body`. This matches how user-authored frontmatter is conventionally typed. Rejected: parse-and-rewrite YAML — unnecessary for the static two-line envelope.

9. **Body is captured at seed time.** Pressing *Create from default* with a future version of the plugin produces a file with that future's body. The pitch explicitly forbids auto-migration of existing files. The seeder calls `renderRefineSystemPrompt()` at the moment of writing.

10. **Selection persistence on seed.** After `seed()` returns the new path, `CustomRefineSection` immediately calls `setActiveRefinePath(newPath)` and re-renders. The pitch's wording is "selects it as the active Refine" — one motion from button-press to fully-customised setup.

11. **OptionsPanel switcher placement: below Cast.** Implemented by mounting `RefineVariantSelect` *after* `#buildResetButton` in the form. Visual de-emphasis comes from being past the action button. No keyboard binding — the keyboard flow is model → effort → context notes → follow-up → Cast.

12. **OptionsPanel switcher visibility: a function of vault state.** `OptionsDetail` passes `refineVariantSelectDeps` to `OptionsPanel.render` only when `getRefineSentinels(app).length > 0`. Zero entries → not in the DOM at all. One or more → rendered.

13. **`Enter`-on-Refine-row still works.** That path also runs `refineCastAction(snapshot)`. The snapshot comes from `optionsFormSnapshotFromRefineDefaults` (no panel opened). The snapshot's `refinePathOverride` is whatever the session map already stored from a previous panel session — exactly the behaviour the pitch describes for "the panel switcher only enters the picture when the user opens the options panel via Right arrow." If the user has never opened the panel, no per-cast override is set; resolver uses Settings active.

14. **The sentinel-marked note must not appear in the Spell Picker.** Achieved by extending `getSpells` to additionally exclude files whose frontmatter has `sentinel: refine`. Implementation: a one-line filter after the existing tag filter, using a shared `hasSentinelRefine(app, file)` helper colocated with the scanner.

15. **No filename sanitisation surprise for the seeder.** The default seed name is `'Custom Refine'`. `sanitiseSpellName('Custom Refine')` returns `'Custom Refine'` — no transformation. We pass through `sanitiseSpellName` defensively even so, because the function is a known clean. Collision-suffix `' 1'`, `' 2'`, … is appended *after* sanitisation.

16. **Settings dropdown does not pre-render until *display()* is called.** Same lifecycle as the existing settings tab. Re-rendering after seed is done by calling `containerEl.empty()` and `display()` (matching the existing pattern).

17. **Notice copy is fixed.** The pitch suggests `"Custom Refine spell not found — using default"`. Implement verbatim. One Notice per cast fallback, regardless of fallback reason — the reason is internal diagnostic. Single string keeps the user mental model simple.

18. **`Open` link uses `app.workspace.openLinkText(path, '', false)`** — same call shape used by `CommandPopup.openLink`. The popup is not open when the user clicks Open in Settings, so no modal coordination is needed.

19. **Sentinel-rename forward-compatibility.** The frontmatter key is `sentinel` (not `grimoire-sentinel` or similar). Future `sentinel: forge` reuses the key with a different value. Future code that needs "is this any kind of sentinel?" can check `frontmatter.sentinel !== undefined`. We do not introduce that helper now — YAGNI.

20. **Hydration tolerates a missing `activeRefinePath`.** `hydrate` merges saved data into `DEFAULT_SETTINGS`; adding `activeRefinePath: null` to `DEFAULT_SETTINGS` is sufficient for upgrade-from-old-data.

### Patterns considered (design-patterns Step 1)

- **Strategy** for resolver — *Adopted in spirit.* `resolveRefinePath` is a single pure function (not a class). Adopting a Strategy interface with one implementation is premature; if a second resolution mode appears (per-spell? per-tag?), refactor then. Status: rejected as a class hierarchy, kept as a pure function.
- **Observer/Event** for "vault sentinel set changed → refresh open dialogs." — *Rejected.* Settings opens fresh each time; OptionsPanel opens fresh each time. Both re-scan on open. The only stale-snapshot risk is the open-and-then-edit case, mitigated by the resolver's cast-time fallback. No live observer needed.
- **Factory** for `CustomRefineSeeder` — *Rejected.* The seeder is constructed once with stable dependencies (`vault`, `forgeOutputFolder` accessor, `renderBody`). A factory pattern adds indirection with no second client.
- **Template Method** for frontmatter envelope wrapping — *Rejected.* The envelope is a four-line string concatenation. A class with a hook method earns nothing here.
- **Repository** for sentinel-marked notes — *Rejected.* `getRefineSentinels` is a pure read over `app.metadataCache`. A Repository would invent a second cache layer over Obsidian's already-cached metadata.
- **Adapter** for `app.workspace.openLinkText` → `openVaultPath` — *Adopted.* `CustomRefineSection` receives an `openVaultPath: (path: string) => void` callback rather than `App`. Keeps the section unit-testable without spinning up a full `App` mock. Cheap, justified.

### Design-rubric §7 self-critique

1. *One reason to change per component.* The scanner changes when sentinel detection rules change. The seeder changes when the seed file template changes. The resolver changes when the resolution cascade rules change. The Settings section changes when the Settings UI changes. The variant select changes when the OptionsPanel UI changes. Five reasons, five components.
2. *Change-impact radius.* Adding a second sentinel kind (e.g. `sentinel: forge` for Custom Forge) extends the scanner with a parametrised value, adds a parallel resolver / seeder / Settings section / variant select. The current shape does not block that; it does not pre-build for it either.
3. *Dependency direction.* Leaf: `renderRefineSystemPrompt`. Used by: `RefineMaterializer` (unchanged), `CustomRefineSeeder` (new). Used by: `CustomRefineSection` (new). One-way. `resolveRefinePath` depends only on its input types. `refineSentinelScanner` depends on `App`. All flow toward `CommandPopupBuilder` and `GrimoireSettingTab`; nothing flows back.
4. *Abstraction justification.* `resolveRefinePath` exists as a separate function (not inlined in `CommandPopupBuilder.refineCastAction`) because it has three inputs, three branches, two outputs, and one branching side effect (the Notice), and is the natural unit test target. `CustomRefineSeeder` exists as a class because it holds three injected dependencies — pure-function form would force a six-arg call site. Both justified.
5. *Deletability test.* Could `CustomRefineSection` be folded into `GrimoireSettingTab`? Yes, but the tab is already three sections; adding a fourth inline would push it past comfortable size. Keeping it separate also makes the Settings integration test for this section addressable without firing the whole tab.
6. *Name smell.* No `Manager` / `Helper` / `Utils`. `Seeder` is intentional and concrete (it seeds one file). `Scanner` is a verb-noun describing one read.
7. *Testability.* All five new pieces are unit-testable with mocks already standard in this codebase (`App`, `Vault`, `DataAdapter`). The resolver and seeder have no DOM dependency; the section and variant-select are testable via the integration harness with the same shape as `settings-panel.spec.ts` and `refine-options-panel.spec.ts`.
8. *What would a reviewer flag?*
   - *Why not store the active path as `SpellPath`?* Because the active path is a real vault file path (or `null`), not the angle-bracketed synthetic `REFINE_SENTINEL_PATH`. The two namespaces stay separate, consistent with the existing pattern (cast-log sentinel vs. override key).
   - *Why not validate `activeRefinePath` at hydration time and clear if stale?* Because hydration runs at `onload`, before metadata cache is fully populated. False-positive cleanup would silently lose the user's selection on every restart. The resolver-time check is correct.
   - *Why a Notice on every fallback cast rather than a one-shot warning?* Because the user explicitly cast Refine and got a different prompt than they configured — they need to know each time. The pitch states: "Silent fallback would hide drift; failing the cast would punish the user for what is usually a stale state after a file move or attribute removal."
   - *Why is the variant dropdown not keyboard-accessible?* Because the pitch's placement-below-Cast decision is precisely to keep it out of the keyboard flow. The control is a "tweak you reach for, not a step in the flow." Accessibility for mouse users is preserved.

## Perspective synthesis (multi-perspective sweep)

### Minimalist

- *Cut candidates considered:* the conditional Open link (could push user to the Settings dropdown selection); the *Create from default* button (could push user to manual frontmatter authoring); the OptionsPanel switcher (could leave power-users on the Settings-only model).
- *Verdict:* keep all three. *Create from default* is the only ergonomic on-ramp from "I want to customise" to "I have a fully-editable file." Without it, the feature is theoretically present but practically gated behind copy-paste-from-source. The Open link is a 4-line addition that saves a folder-navigate. The OptionsPanel switcher is the pitch's headline use case (three styles A/B-tested per cast).
- *Cuts taken:* no observer/event mechanism, no second discovery path, no migration logic, no per-spell-folder setting, no keyboard binding on the panel switcher.

### Extensibility

- *Tested at 10×:* user with 10 sentinel-marked notes — dropdown stays a single `<select>` (browsers handle 10–50 entries fine without virtualisation). Vault scan over 10,000 markdown files for sentinel detection — `getMarkdownFiles().filter(...)` is O(n) over already-cached metadata; the existing tag scan in `getSpells` does this on every popup open without issue.
- *Seam for the future `sentinel: forge`:* the scanner is parameterised by value (`getSentinels(app, value: string)` — but in this plan only `getRefineSentinels` is exported, with the value hardcoded; the renaming is trivial when the second kind ships).
- *Seam for "render description in dropdown":* not built. If users start asking for a label hint, the scanner already returns `{ name, path }` — extending to `{ name, path, description? }` is additive.
- *Decision:* do not pre-build the parametric scanner. Add it when the second kind ships.

### Devil's advocate

- *Riskiest assumption:* the metadata cache is populated and accurate by the time the resolver runs. **Mitigated** by the explicit fallback path — a stale or empty cache produces a Notice-and-fallback, not a crash.
- *Hidden failure mode 1:* user marks a sentinel note with both `sentinel: refine` AND the spell tag. Without the scanner exclusion, the same file appears as both a castable spell and an active Refine option. **Mitigated** by the `getSpells` exclusion.
- *Hidden failure mode 2:* user duplicates a sentinel note (Obsidian's "Make a copy of this file"); two files share `sentinel: refine`; the dropdown shows two entries with similar names. **Acceptable**: this is user-driven content state; the dropdown reflects vault truth. The user disambiguates by renaming.
- *Hidden failure mode 3:* the seeder writes to a non-existent `forgeOutputFolder`. The `Vault.create` API errors. **Mitigated** by `try { … } catch { Notice }`.
- *Hidden failure mode 4:* per-cast override survives across panel re-opens within one session even when the user reset model/effort. The session map is keyed on `REFINE_SENTINEL_PATH` and the Reset button calls `sessionMap.delete(deps.spellPath)` — which clears the entire entry, including `refinePathOverride`. **Confirmed safe** by existing reset semantics.
- *Hidden failure mode 5:* the user opens the Refine panel, picks a variant, then navigates Back without casting. The session map still holds the override. Next Enter-on-Refine-row uses it. **Acceptable** — this is consistent with how model/effort already behave from the same flow. Documented in the live-spec.
- *Hidden failure mode 6:* race between *Create from default* and Obsidian's metadata cache settling. The new file's frontmatter must be visible before `setActiveRefinePath(newPath)` and `refresh()` re-renders. `Vault.create` resolves *after* the file is indexed; `app.metadataCache.getFileCache(file)` immediately reflects the frontmatter. **Confirmed safe.**

### User advocate

- *Smoothest path:* open Settings → see Custom Refine section → click *Create from default* → file is written, dropdown shifts to the new entry, Open link appears → click Open → file opens in current leaf → edit. Zero copy-paste, zero manual frontmatter.
- *Friction points:*
  - The OptionsPanel switcher appears *only* when ≥1 sentinel-marked note exists. First-time users do not see it; once they have one, it appears. This is the pitch's explicit "self-surfacing" intent — a friction *reduction* over a permanent toggle.
  - The Notice copy `"Custom Refine spell not found — using default"` does not name the missing file. **Acceptable** — naming would force a longer Notice and the user can check Settings to see which entry is active.
  - There is no in-popup affordance to navigate to Settings. **Acceptable** — Custom Refine is configured rarely; the popup stays optimised for the cast hot path.
- *Verdict:* the surface is small, opt-in, and self-revealing. No friction points that warrant scope additions.

### Synthesis

All four perspectives agree on the shape: scanner + resolver + section + switcher + seeder + one settings field + one session-entry field. Tensions resolved:

- Minimalist vs Extensibility on the scanner: chose minimalist (hardcoded value), with a documented refactor seam for the future second kind.
- Devil's-advocate vs User-advocate on the Notice copy: kept the pitch's wording (single short string), accepting that the diagnostic detail is internal.
- Minimalist vs User-advocate on the *Create from default* button: kept the button despite its addition — it is the only feasible on-ramp.

## Deferred edge cases

The pitch explicitly defers (or implicitly leaves out of scope) the following. They are tracked here for the executor to *not* implement, and for future plans to pick up:

- **Active variant changing while Settings is open in another window.** Obsidian does not support multi-window settings; not a real failure mode here.
- **Pre-cast validation of custom file content** (e.g. checking for missing IMMEDIATE EXECUTION block). The pitch's no-go is firm: "does not validate the prompt content." Custom files are opaque to the plugin.
- **Custom Refine in remote mode.** The portal already reads the `spellPath` as a vault-relative path. The new vault-relative custom path travels exactly the same way; no portal change. Covered by the existing remote-cast integration test pattern — extending an existing test rather than adding a new one is sufficient.
- **Sentinel-marked-note backlinks / refactor-rename tracking.** Obsidian's rename will not update `activeRefinePath` automatically. The pitch's "user customisations live in the user's vault" framing accepts this — the resolver fallback Notice covers the renamed-file case.
- **Multi-language sentinel values** (`sentinel: refine-fr`, etc.). Out of scope; sentinel is one value today.

## Tests

### Unit (vitest, node env)

- `tests/refine/refineSentinelScanner.test.ts` — getRefineSentinels returns []; returns one entry with name+path; ignores files with frontmatter `sentinel: forge`; ignores files without frontmatter; ignores files where `sentinel` is not a string; returns entries sorted by basename.
- `tests/refine/resolveRefinePath.test.ts` — per-cast undefined + settings null → bundled; per-cast undefined + settings path + isSentinel true → settings path; per-cast undefined + settings path + isSentinel false → bundled with fallback flag; per-cast null + settings path → bundled (explicit "Default" choice overrides Settings); per-cast path + isSentinel true → per-cast path; per-cast path + isSentinel false → bundled with fallback flag.
- `tests/refine/CustomRefineSeeder.test.ts` — seeds with default name 'Custom Refine'; envelope wraps body with `---\nsentinel: refine\n---\n\n`; body is the renderRefineSystemPrompt() output with the materialiser envelope stripped; collision-suffix appends ` 1`, ` 2`; throws after safety cap.
- `tests/infra/spellScanner.test.ts` (modify existing) — excludes files where frontmatter.sentinel === 'refine'.

### UI integration (vitest, happy-dom env)

- `tests/integration/custom-refine-settings.spec.ts` — Section appears; dropdown lists `Default (built-in)` + scanned entries; selecting an entry writes `activeRefinePath` and calls save; *Create from default* invokes seeder and shifts dropdown to new path; *Open* link present only when `activeRefinePath !== null` and triggers `openLinkText`.
- `tests/integration/custom-refine-variant-select.spec.ts` — Refine OptionsPanel: with zero sentinel notes → no `<select>` after Cast button; with one+ → `<select>` rendered with `Default (built-in)` first; pre-selected to Settings active; changing selection writes `refinePathOverride` into session map; Reset clears the override.
- `tests/integration/custom-refine-cast.spec.ts` — Enter on Refine row uses Settings active path; Cast inside panel with per-cast override uses that path; missing/un-marked custom path triggers Notice + bundled-default cast.
- `tests/integration/spell-picker-sentinel-exclusion.spec.ts` (or extend `tests/SpellList.test.ts`) — a file with `sentinel: refine` does not appear in the spell picker even if also tagged.

### Touched by-passing

- `tests/refine/RefineMaterializer.test.ts` — untouched.
- `tests/refine/refineTemplate.test.ts` — untouched.
- `tests/integration/refine-cast.spec.ts` — may need a one-line update to assert the dispatcher receives the resolved (bundled-default) path when no custom is configured — same effective behaviour, but the call site now passes through `resolveRefinePath`.

---

## Todos

Each todo: `- [ ] <id>: <description> — <S|M|L>, <tier>`. Tier groups are dispatched in plan-listed order. Cross-section couplings live in each section briefing.

### A. Domain scaffolding — settings field, sentinel constants, session-entry extension

#### Section briefing

**What this section produces:** the new `activeRefinePath` field on `GrimoireSettings` and `DEFAULT_SETTINGS`; hydration tolerates absence; the `refinePathOverride` optional field on `OptionsSessionEntry`; constants for `SENTINEL_FRONTMATTER_KEY = 'sentinel'` and `REFINE_SENTINEL_FRONTMATTER_VALUE = 'refine'` colocated with the new scanner module. No UI changes. No new behaviour observable outside unit tests.

**Design context the executor needs upfront:**
- `GrimoireSettings` lives in `src/domain/settings/Settings.ts`. `DEFAULT_SETTINGS` is exported next to it.
- `hydrate` in `src/infra/settingsPersistence.ts` already uses `Object.assign({}, DEFAULT_SETTINGS, s?.settings)` — adding a new field to `DEFAULT_SETTINGS` is the only change needed for upgrade tolerance.
- `OptionsSessionEntry` lives in `src/ui/options/OptionsSessionMap.ts`. The new optional field is `refinePathOverride?: string | null`. Comment must call out: "Only meaningful for the Refine sentinel entry." (Per Technical Notes §3.)
- Constants module: create `src/refine/refineSentinel.ts` exporting both constants. The scanner (Section B) will live next door and import them. (Per Technical Notes §1.)

**Cross-section couplings:** A1's new `activeRefinePath` is read by B (scanner module's resolver consumer), D (Settings section), and F (refineCastAction). A3's `refinePathOverride` is read by D (OptionsDetail/RefineVariantSelect), E (resolver consumer in CommandPopupBuilder), and modified by D's RefineVariantSelect onChange. None of those sections are blocked on A specifically — they all extend code that depends on A's types — but A must merge first because every other section imports from it.

**Section-level Red criterion:** `npm test` passes. New constants file exists at the expected path and exports the two values. `DEFAULT_SETTINGS.activeRefinePath === null`. `OptionsSessionEntry` accepts an entry with `refinePathOverride` (TypeScript compiles). Hydration test (existing) still passes against unchanged saved data shape.

**junior-dev**

- [ ] A1: extend `GrimoireSettings` (in `src/domain/settings/Settings.ts`) with `activeRefinePath: string | null`. Add `activeRefinePath: null` to `DEFAULT_SETTINGS`. Add an inline comment: "Vault-relative path of the user's active Refine spell template; null = bundled default." — S, junior-dev
- [ ] A2: create `src/refine/refineSentinel.ts` exporting two `as const` constants: `SENTINEL_FRONTMATTER_KEY = 'sentinel'` and `REFINE_SENTINEL_FRONTMATTER_VALUE = 'refine'`. JSDoc each — they pin the pitch's no-go (single discovery mechanism) — S, junior-dev
- [ ] A3: extend `OptionsSessionEntry` in `src/ui/options/OptionsSessionMap.ts` with optional `refinePathOverride?: string | null`. Comment: "Only meaningful for the Refine sentinel entry. undefined = no per-cast choice; null = explicit 'Default (built-in)'." — S, junior-dev
- [ ] A4: confirm `npm test`, `npm run lint`, `npm run arch:check` all green. No existing test should require changes (the new fields are additive optional/defaulted) — S, junior-dev

### B. `refineSentinelScanner` and `getSpells` exclusion

#### Section briefing

**What this section produces:** `src/refine/refineSentinelScanner.ts` exporting `getRefineSentinels(app: App): RefineSentinelEntry[]` and `isRefineSentinel(app: App, file: TFile): boolean`. Also modifies `src/infra/spellScanner.ts` to exclude sentinel-marked files from the spell list.

**Design context the executor needs upfront:**
- The scanner reads `app.metadataCache.getFileCache(file)?.frontmatter?.sentinel`. It checks strict string equality against `REFINE_SENTINEL_FRONTMATTER_VALUE` from `src/refine/refineSentinel.ts` (A2). (Per Technical Notes §1.)
- Sorted output: `localeCompare` with `sensitivity: 'base'` (matches `getSpells`).
- `RefineSentinelEntry` is `{ readonly name: string; readonly path: string }` (basename + vault-relative path).
- `isRefineSentinel` is a small helper for reuse by the resolver-fallback path and by the `getSpells` exclusion filter (Per Technical Notes §14 — single helper).
- `getSpells` modification: after the existing tag filter, additionally `.filter((file) => !isRefineSentinel(app, file))`. One line. Add a comment naming the pitch decision: "Sentinel-marked notes are excluded from the spell list even if tagged — single discovery mechanism."

**Cross-section couplings:**
- B1 (scanner) is consumed by D (Settings section), E (OptionsDetail/RefineVariantSelect), F (resolver's `isSentinel` callback in refineCastAction).
- B2 (`getSpells` exclusion) is independent — purely additive to existing scanner test coverage; no other section depends on the exclusion.

**Section-level Red criterion:** `tests/refine/refineSentinelScanner.test.ts` covers all six unit cases (see Tests section). Existing `tests/infra/spellScanner.test.ts` (if present) or its sibling Spell-related test gains a case proving sentinel-marked files are filtered. `npm test`, `npm run lint`, `npm run arch:check` all green.

**junior-dev**

- [ ] B1: create `src/refine/refineSentinelScanner.ts` exporting `getRefineSentinels(app: App)` and `isRefineSentinel(app: App, file: TFile)`. Pattern after `getSpells`: iterate `app.vault.getMarkdownFiles()`, check metadata cache, map to `{ name, path }`, sort by name. Strict equality check against `REFINE_SENTINEL_FRONTMATTER_VALUE`. JSDoc both exports — S, junior-dev
- [ ] B2: write unit tests in `tests/refine/refineSentinelScanner.test.ts` covering: empty vault → []; one marked file → one entry; sentinel value 'forge' → []; missing frontmatter → []; non-string sentinel value (number, array) → []; multiple entries sorted by basename — S, junior-dev
- [ ] B3: modify `getSpells` in `src/infra/spellScanner.ts` to additionally filter out files where `isRefineSentinel(app, file)` is true. Import the helper from `src/refine/refineSentinelScanner.ts`. Add the inline comment per Section briefing — S, junior-dev
- [ ] B4: add a unit test in `tests/SpellList.test.ts` (or `tests/spellScanner.test.ts` if it exists) proving that a markdown file with `tags: [grimoire/spell]` AND `sentinel: refine` does NOT appear in `getSpells`'s output. If neither test file targets `getSpells` directly, create `tests/spellScanner.test.ts` with this case + one positive baseline (a tagged-only file does appear) — S, junior-dev
- [ ] B5: confirm `npm test`, `npm run lint`, `npm run arch:check` all green — S, junior-dev

### C. `resolveRefinePath` pure resolver

#### Section briefing

**What this section produces:** `src/refine/resolveRefinePath.ts` exporting `resolveRefinePath(input: ResolveRefinePathInput): ResolvedRefinePath`. A pure function — no side effects, no IO. Implements the per-cast → Settings → bundled cascade with fallback semantics for missing/un-marked custom paths.

**Design context the executor needs upfront (copied from Interfaces):**

```ts
export interface ResolvedRefinePath {
  readonly path: string;
  readonly isFallback: boolean;
  readonly fallbackReason?: 'missing' | 'unreadable' | 'sentinel-removed';
}
export interface ResolveRefinePathInput {
  perCast: string | null | undefined;
  settingsActive: string | null;
  bundledDefaultVaultRel: string;
  isSentinel: (vaultRelPath: string) => boolean;
}
```

Cascade rules (Per Technical Notes §4, §5, §17 and Error handling):

1. If `perCast === undefined` → no per-cast choice → fall through to Settings.
2. If `perCast === null` → explicit "Default (built-in)" → return `{ path: bundledDefaultVaultRel, isFallback: false }`.
3. If `perCast` is a string → if `isSentinel(perCast)` → return `{ path: perCast, isFallback: false }`. Else → return `{ path: bundledDefaultVaultRel, isFallback: true, fallbackReason: 'sentinel-removed' }`.
4. Settings step: if `settingsActive === null` → return `{ path: bundledDefaultVaultRel, isFallback: false }`. Else if `isSentinel(settingsActive)` → return `{ path: settingsActive, isFallback: false }`. Else → return `{ path: bundledDefaultVaultRel, isFallback: true, fallbackReason: 'sentinel-removed' }`.

Note: `'missing'` and `'unreadable'` are reserved reason values; the resolver itself only ever emits `'sentinel-removed'` because the `isSentinel` callback collapses missing/unreadable/un-marked into a single boolean. The reason field is informative; the Notice text is one string regardless (Per Technical Notes §17).

**Cross-section couplings:**
- C1 is consumed by F (CommandPopupBuilder.refineCastAction). F passes an `isSentinel` callback built from B1's `isRefineSentinel(app, file)` resolved against `app.vault.getAbstractFileByPath(vaultRelPath)`.

**Section-level Red criterion:** all six unit cases in `tests/refine/resolveRefinePath.test.ts` pass. `npm test`, `npm run lint`, `npm run arch:check` all green.

**junior-dev**

- [ ] C1: create `src/refine/resolveRefinePath.ts` with the function, interfaces, and JSDoc. Pure logic per Section briefing. Implementation is a 6-branch switch on (perCast, settingsActive, isSentinel result) — S, junior-dev
- [ ] C2: write `tests/refine/resolveRefinePath.test.ts` covering the six cases listed in Tests § Unit. Use plain object literals for inputs and a stub `isSentinel` (`(p) => p === 'X'`) — S, junior-dev
- [ ] C3: confirm `npm test`, `npm run lint`, `npm run arch:check` all green — S, junior-dev

### D. UI integration: Refine OptionsPanel variant select

#### Section briefing

**What this section produces:** `src/ui/options/RefineVariantSelect.ts`; the wiring inside `src/ui/components/OptionsDetail.ts` (passing `refineVariantSelectDeps` only for the refine variant); the `OptionsPanel.render` extension to accept and mount the new optional deps after the Cast button row; the session-map write on dropdown change.

**Design context the executor needs upfront:**
- The select sits *after* the Cast button row, mounted by `OptionsPanel` only when `deps.refineVariantSelectDeps` is present. Visual de-emphasis comes from placement, not styling (Per Technical Notes §11).
- Visibility is a function of vault state: `OptionsDetail` constructs `refineVariantSelectDeps` only when `getRefineSentinels(app).length > 0` (Per Technical Notes §12).
- `RefineVariantSelect` renders a `<label>Refine variant</label>` and a `<select>` with `<option value="">Default (built-in)</option>` followed by one option per entry (`value=entry.path`, `text=entry.name`). Initial selection: `sessionEntry.refinePathOverride ?? settings.activeRefinePath ?? ''`. (Per Data flow.)
- `onChange` writes to the session map: `sessionMap.put(REFINE_SENTINEL_PATH, { ...sessionMap.get(REFINE_SENTINEL_PATH) ?? <default-from-snapshot>, refinePathOverride: value === '' ? null : value })`. The "default-from-snapshot" fallback ensures the entry has model/effort/etc. populated even if the user has not interacted with other fields. The simplest implementation: read the current formState snapshot at change time and merge.
- The `sessionMap.put` call must include all required `OptionsSessionEntry` fields; the existing convention in `OptionsPanel.#bindFormSubmit` is to call `sessionMap.put(deps.spellPath, current)` with a full snapshot. Match that pattern.
- Reset button must clear the override. The existing `#bindReset` calls `deps.sessionMap.delete(deps.spellPath)` — this already clears the whole entry including `refinePathOverride`. No change needed beyond ensuring the local UI state of the dropdown returns to the initial value (Settings active) on reset.
- The integration test imports `getRefineSentinels` indirectly through `OptionsDetail`; the harness needs to stub the metadata cache to return one sentinel-marked file.

**Cross-section couplings:**
- D depends on A (the `refinePathOverride` field on `OptionsSessionEntry`).
- D depends on B (the scanner `getRefineSentinels`).
- D2's session-map write is consumed by E (CommandPopupBuilder's `optionsFormSnapshotFromRefineDefaults` extension passes through `refinePathOverride`) and by F (resolver consumer).
- D's "Reset clears the override" assertion (D0-b) couples to A3's `refinePathOverride` optional shape.

**Section-level Red criterion:** the integration test `tests/integration/custom-refine-variant-select.spec.ts` is GREEN with all four scenarios listed below. `npm run test:integration` passes. The existing `tests/integration/refine-options-panel.spec.ts` still passes (no regressions in the executeOnNote-hidden, set-as-default, override-persistence behaviours).

**ui-integration-tester**

- [ ] D0: write `tests/integration/custom-refine-variant-select.spec.ts` covering:
  - **D0-a (zero entries):** harness with no sentinel-marked file in the metadata cache → open Refine options panel via ArrowRight → no `<select>` with the *Default (built-in)* option appears after the Cast button.
  - **D0-b (one entry visible + initial selection):** harness with one sentinel-marked file (mock `getMarkdownFiles` to include it and `getFileCache` to return `frontmatter: { sentinel: 'refine' }`) and `settings.activeRefinePath = 'spells/My Refine.md'` → open panel → the variant `<select>` appears with `Default (built-in)` + one entry; the entry is selected; changing to `Default` writes `refinePathOverride: null` to the session map (assert via `sessionMap.get(REFINE_SENTINEL_PATH)?.refinePathOverride === null`); changing back to the entry writes the path.
  - **D0-c (Reset clears override):** with override set, click Reset → `sessionMap.get(REFINE_SENTINEL_PATH)` returns undefined.
  - **D0-d (sentinel-marked file is excluded from main spell list):** the same harness asserting `h.visibleSpellRows()` does not include the sentinel-marked file (one-line check, also pins B's `getSpells` filter from a UI angle).
  — S, ui-integration-tester

**senior-dev**

- [ ] D1: create `src/ui/options/RefineVariantSelect.ts` implementing `RefineVariantSelect` class with `mount(parent, deps)` and `destroy()`. Renders the `<label>` and `<select>`. JSDoc the deps interface (already defined in Interfaces). Wire `onChange` to invoke `deps.onChange(value === '' ? null : value)`. No keyboard binding. — S, senior-dev
- [ ] D2: extend `OptionsPanel.render` (and `OptionsPanelDeps`) to accept optional `refineVariantSelectDeps`. After `#bindReset(...)` in `#buildFormControls`, conditionally mount the `RefineVariantSelect` into the form element. Update destroy() to call the variant select's destroy. — M, senior-dev
- [ ] D3: extend `OptionsDetail.#createPanel` to construct `refineVariantSelectDeps` only when `params.kind.kind === 'refine'` AND `getRefineSentinels(app).length > 0`. The deps' `onChange` callback reads `formState.snapshot()`, builds a complete `OptionsSessionEntry`, sets `refinePathOverride`, and calls `sessionMap.put(REFINE_SENTINEL_PATH, entry)`. — M, senior-dev (depends on D1, D2)
- [ ] D4: extend `optionsFormSnapshotFromRefineDefaults` in `src/ui/options/OptionsFormState.ts` so the returned snapshot includes `refinePathOverride: sessionEntry?.refinePathOverride` (passes through whatever the session map holds; undefined when no panel session). Update the function's JSDoc — M, senior-dev
- [ ] D5: confirm D0 is GREEN, existing `tests/integration/refine-options-panel.spec.ts` is GREEN, `npm test`, `npm run lint`, `npm run arch:check`, `npm run test:integration` all green — S, senior-dev

### E. UI integration: Custom Refine settings section + seeder

#### Section briefing

**What this section produces:** `src/refine/CustomRefineSeeder.ts`; `src/ui/settings/CustomRefineSection.ts`; the wiring inside `src/ui/settings/GrimoireSettingTab.display` to render the new section between `#renderGeneralSection` and `#renderAdvancedSection`; a new `Vault` accessor wired through the existing plugin/setting-tab construction. Also threads `seeder` and `openVaultPath` through `GrimoireSettingTab` constructor.

**Design context the executor needs upfront:**
- The Settings section sits between General and Advanced. Use `new Setting(el).setName('Custom Refine spell').setHeading()` for the section heading (ESLint `obsidianmd/no-manual-html-headings`).
- The dropdown uses `Setting(...).addDropdown(d => { d.addOption('', 'Default (built-in)'); entries.forEach(e => d.addOption(e.path, e.name)); d.setValue(settings.activeRefinePath ?? ''); d.onChange(v => { settings.activeRefinePath = v === '' ? null : v; plugin.save(); refresh(); }); })`.
- The *Create from default* button is `addButton(b => b.setButtonText('Create from default').onClick(async () => { try { const newPath = await seeder.seed(); settings.activeRefinePath = newPath; plugin.save(); refresh(); } catch { new Notice('Could not create Refine spell — check Forge output folder'); } }))`.
- The *Open* link is conditionally rendered only when `activeRefinePath !== null`. Use a second `Setting(...).addExtraButton(...)` or a plain anchor inside the section — choose `addButton` with `setButtonText('Open')` for visual consistency with *Create from default* (Per Technical Notes §10).
- `seeder.seed()` builds the file content as: `'---\nsentinel: refine\n---\n\n' + stripMaterializerEnvelope(renderRefineSystemPrompt())`. The materialiser envelope to strip is the `%%\nAuto-generated by Grimoire RefineMaterializer. Do not edit — overwritten on every plugin load and settings save.\n%%\n\n` prefix (verify exact bytes from current `refineTemplate.ts`). After stripping, the body starts with `---` (the next section opener). The seeder prepends the new `---\nsentinel: refine\n---\n\n` envelope and replaces the *trailing* `Auto-generated...` materialiser comment if any (verify with a unit test fixture). Implementation: a small `stripBundledMaterializerEnvelope(body: string): string` helper in `CustomRefineSeeder.ts`.
- Collision-suffix: probe `<folder>/<name>.md`, `<folder>/<name> 1.md`, … `<folder>/<name> 99.md`. Use `app.vault.getAbstractFileByPath(normalizePath(candidate))` to check existence. Bounded loop (Per Technical Notes §15 and Error handling).
- `Vault.create` triggers indexing synchronously (Per Technical Notes §7). The seeder's `seed()` resolves with the new vault-relative path.
- `openVaultPath`: a one-line wrapper around `this.app.workspace.openLinkText(path, '', false)` (Per Technical Notes §18).
- `GrimoireSettingTab` constructor signature change: add `seeder: CustomRefineSeeder` and `openVaultPath: (path: string) => void` as optional parameters with sensible defaults (no-op for the open link, throwing seeder for tests that do not exercise the button). The plugin-side construction in `main.ts` provides both.

**Cross-section couplings:**
- E depends on A1 (`activeRefinePath` field on settings).
- E depends on B1 (`getRefineSentinels`).
- E's *Create from default* result (the new vault-rel path) immediately updates `settings.activeRefinePath` and re-renders the section. The new file becomes visible to D's scanner on the next OptionsPanel open.
- E1's `Vault.create` call is wired through D's `app.vault` accessor.

**Section-level Red criterion:** `tests/integration/custom-refine-settings.spec.ts` is GREEN with all five scenarios listed below. `npm run test:integration` passes. The existing `tests/integration/settings-panel.spec.ts` continues to pass (the new section adds DOM elements; the existing assertion on `childElementCount === 28` will need updating to the new count — that update belongs in this section).

**ui-integration-tester**

- [ ] E0: write `tests/integration/custom-refine-settings.spec.ts` covering:
  - **E0-a (section rendered, dropdown lists entries):** open Settings tab → section heading visible; dropdown has `Default (built-in)` + N options matching the mocked sentinel-marked files; selecting one writes `activeRefinePath` and triggers `plugin.save`.
  - **E0-b (Create from default writes new file):** Vault mock with `create` spy; click *Create from default* → `vault.create` called with content matching `^---\nsentinel: refine\n---\n\n` and a body containing the bundled-Refine anchors (`'Mode 1: Generate'`, etc.); `activeRefinePath` updated to the new path; dropdown re-renders with the new entry selected.
  - **E0-c (Open link visibility):** with `activeRefinePath === null` → no *Open* button; with non-null → *Open* button present; clicking it calls `openVaultPath` with the active path.
  - **E0-d (Create from default failure):** vault.create throws → Notice posted with the expected message; settings unchanged.
  - **E0-e (collision-suffix):** vault has `Custom Refine.md` and `Custom Refine 1.md` already → seeder writes `Custom Refine 2.md` (assertable via the path passed to `vault.create`).
  — S, ui-integration-tester

**senior-dev**

- [ ] E1: create `src/refine/CustomRefineSeeder.ts`. Implement `seed(baseName?: string)` with the collision loop and the envelope build. Export a small `stripBundledMaterializerEnvelope(body: string): string` helper (used internally; not exported) or implement inline. Include the safety cap. — M, senior-dev
- [ ] E2: write unit tests `tests/refine/CustomRefineSeeder.test.ts` covering: writes with default name; envelope shape; body strip (assert against a fixture); collision suffix progression; safety cap throws. — S, senior-dev
- [ ] E3: create `src/ui/settings/CustomRefineSection.ts` implementing the `CustomRefineSection` class with a single `render(deps)` method. Use `new Setting(el).setName(...).setHeading()` for the section heading (no `createEl('h3', …)`). Dropdown, button, conditional Open button per Section briefing. — M, senior-dev
- [ ] E4: extend `GrimoireSettingTab` constructor to accept `seeder` and `openVaultPath` deps (optional with safe no-op defaults). In `display()`, between `#renderGeneralSection` and `#renderAdvancedSection`, instantiate `CustomRefineSection` and call `render` with deps wired to `this.#plugin.app`, `() => this.#plugin.data.settings`, `(path) => { this.#plugin.data.settings.activeRefinePath = path; this.#save(); }`, the seeder, `openVaultPath`, and `() => this.display()`. — M, senior-dev (depends on E1, E3)
- [ ] E5: wire `CustomRefineSeeder` and `openVaultPath` in `src/main.ts` where `GrimoireSettingTab` is constructed. Construct the seeder once with `vault: this.app.vault`, `forgeOutputFolder: () => this.data.settings.forgeOutputFolder`, `renderBody: renderRefineSystemPrompt`. `openVaultPath` is `(p) => void this.app.workspace.openLinkText(p, '', false)`. — S, senior-dev
- [ ] E6: update `tests/integration/settings-panel.spec.ts`'s `childElementCount` assertion to the new total. Document the new count with a comment naming each section. — S, senior-dev
- [ ] E7: confirm E0 GREEN, existing settings integration test GREEN, `npm test`, `npm run lint`, `npm run arch:check`, `npm run test:integration` all green. — S, senior-dev

### F. Cast resolution wiring + fallback Notice

#### Section briefing

**What this section produces:** modifies `src/ui/popup/CommandPopupBuilder.ts` so `refineCastAction` resolves the prompt path through `resolveRefinePath` before dispatch. On fallback, emits the pitch-mandated Notice. Threads `refinePathOverride` from the snapshot (D4) into the resolver call. The dispatcher's `systemPromptFilePath` is now the resolved path, not the hardcoded `paths.refineSpellPathVaultRel()`.

**Design context the executor needs upfront:**
- Current code (verbatim, from `CommandPopupBuilder.refineCastAction`):

```ts
const refineCastAction: RefineCastAction = (snapshot) => {
  const activeFile = this.#deps.app.workspace.getActiveFile();
  if (!activeFile || activeFile.extension !== 'md') {
    new Notice('Refine needs an open note');
    return;
  }
  dispatcher.dispatch({
    spell: refineCastSpell(),
    model: snapshot.model,
    effort: snapshot.effort,
    contextNotePaths: snapshot.contextNotePaths,
    followUp: snapshot.followUp,
    settings: this.#deps.plugin.data.settings,
    activeFilePath: activeFile.path,
    executeOnNote: true,
    systemPromptFilePath: this.#deps.paths.refineSpellPathVaultRel(),
  });
  popup.dismiss();
};
```

- New shape (target):

```ts
const refineCastAction: RefineCastAction = (snapshot) => {
  const activeFile = this.#deps.app.workspace.getActiveFile();
  if (!activeFile || activeFile.extension !== 'md') {
    new Notice('Refine needs an open note');
    return;
  }
  const bundled = this.#deps.paths.refineSpellPathVaultRel();
  const settings = this.#deps.plugin.data.settings;
  const isSentinel = (p: string): boolean => {
    const file = this.#deps.app.vault.getAbstractFileByPath(p);
    if (!(file instanceof TFile)) return false;
    return isRefineSentinel(this.#deps.app, file);
  };
  const resolved = resolveRefinePath({
    perCast: snapshot.refinePathOverride,
    settingsActive: settings.activeRefinePath,
    bundledDefaultVaultRel: bundled,
    isSentinel,
  });
  if (resolved.isFallback) {
    new Notice('Custom Refine spell not found — using default');
  }
  dispatcher.dispatch({
    spell: refineCastSpell(),
    model: snapshot.model,
    effort: snapshot.effort,
    contextNotePaths: snapshot.contextNotePaths,
    followUp: snapshot.followUp,
    settings,
    activeFilePath: activeFile.path,
    executeOnNote: true,
    systemPromptFilePath: resolved.path,
  });
  popup.dismiss();
};
```

- `isRefineSentinel(app, file)` returns a boolean and lives in `src/refine/refineSentinelScanner.ts` (B1). Its callers must guard with `instanceof TFile`.
- The Notice text is the pitch's exact string. No variants.
- The existing dispatcher cast-log entry uses `spell.path` (`<refine>` sentinel) — unchanged by this section; the cast-log row identity is independent of the prompt file path (Per `refine-cast.md` design decisions).

**Cross-section couplings:**
- F depends on A1 (`activeRefinePath` on settings), A3 (`refinePathOverride` on session entry), B1 (`isRefineSentinel`), C1 (`resolveRefinePath`), D4 (`optionsFormSnapshotFromRefineDefaults` passes `refinePathOverride` through the snapshot).
- F0's Notice assertion specifically pins the pitch's "Silent fallback would hide drift; failing the cast would punish the user" decision. If the executor chooses a different message, the integration test catches it.

**Section-level Red criterion:** `tests/integration/custom-refine-cast.spec.ts` is GREEN with all four scenarios. Existing `tests/integration/refine-cast.spec.ts` still passes (no regression in the missing-active-note guard, list-Enter, dialog-Cast paths).

**ui-integration-tester**

- [ ] F0: write `tests/integration/custom-refine-cast.spec.ts` covering:
  - **F0-a (no custom configured, no per-cast override):** `settings.activeRefinePath === null`, no session override → dispatcher receives `systemPromptFilePath === paths.refineSpellPathVaultRel()`. No Notice posted.
  - **F0-b (Settings-active custom, no per-cast override):** active path is a vault file with `sentinel: refine` → dispatcher receives that path. No Notice.
  - **F0-c (Settings-active custom, file missing or un-marked):** active path is set to a path that `getAbstractFileByPath` returns null OR a TFile without the sentinel frontmatter → dispatcher receives `paths.refineSpellPathVaultRel()`. Notice posted with text `'Custom Refine spell not found — using default'`.
  - **F0-d (per-cast override wins over Settings):** session has `refinePathOverride: 'spells/Variant.md'` (which is sentinel-marked); Settings active is a different sentinel-marked path → dispatcher receives the per-cast path. No Notice.
  - **F0-e (per-cast override === null overrides Settings to bundled):** session has `refinePathOverride: null` (explicit Default) even though Settings active is set → dispatcher receives bundled default. No Notice.
  — S, ui-integration-tester

**senior-dev**

- [ ] F1: modify `src/ui/popup/CommandPopupBuilder.ts` to implement the new `refineCastAction` shape per Section briefing. Import `resolveRefinePath` from `src/refine/resolveRefinePath.ts`, `isRefineSentinel` from `src/refine/refineSentinelScanner.ts`, and `TFile` from `obsidian`. — M, senior-dev
- [ ] F2: confirm F0 GREEN, existing `tests/integration/refine-cast.spec.ts` GREEN, `npm test`, `npm run lint`, `npm run arch:check`, `npm run test:integration` all green. — S, senior-dev

### G. Documentation drift sweep

#### Section briefing

**What this section produces:** updates to `docs/features/refine-cast.md`, `docs/features/refine-note-dialog.md`, `docs/features/settings-panel.md`, and `docs/features/forge-spell-materialization.md` (the latter mentions `forgeOutputFolder` semantics — sanity-check it still reads correctly given the seeder writes there). No code changes.

**Design context the executor needs upfront:** this section runs as a deliberate planner-anticipated drift sweep, complementing whatever `/spec` runs after `/done`. The four files listed above are the most likely drift sites. The executor checks each: if the file as it stands says something now incorrect, patch it in-place with minimal language. If the file is still accurate (because Custom Refine is additive, not replacing), leave it.

Likely patches:
- `docs/features/refine-cast.md` — add a brief "Resolution rules" addition noting the cascade and the fallback Notice. Reference 029.
- `docs/features/refine-note-dialog.md` — no change expected (the dialog → cast → snapshot flow is unchanged; the OptionsPanel's *contents* extend but the dialog identity does not).
- `docs/features/settings-panel.md` — add the *Custom Refine spell* section to the section enumeration. Update the row count description.
- `docs/features/forge-spell-materialization.md` — no change expected (the forge output folder accessor is reused but Forge itself is unchanged).

**Cross-section couplings:** G depends on every earlier section being merged so the descriptions reflect what shipped.

**Section-level Red criterion:** the four files read correctly against the merged code. `/spec` would not find substantial drift beyond live-spec creation for 029 itself.

**junior-dev**

- [ ] G1: read each of the four files. Identify drift. Apply minimal in-place edits. Do not invent new sections; keep each edit a sentence or short paragraph that links to plan-029 by number. — S, junior-dev
- [ ] G2: confirm `npm run lint` still passes (markdown is not linted, but the safety check is cheap). — S, junior-dev

---

## Overall effort summary

- **Total todos:** 32 across 7 sections (A:4, B:5, C:3, D:5+1 tester, E:7+1 tester, F:2+1 tester, G:2)
- **Effort distribution:** S = 24, M = 8, L = 0
- **Tier distribution:**
  - `junior-dev` = 13 (sections A, B, G — scaffolding, scanner, doc sweep)
  - `senior-dev` = 16 (sections C, D, E, F — judgement-heavy wiring, UI placement, resolver consumer)
  - `ui-integration-tester` = 3 (one per UI seam: variant select, settings section, cast resolution)
  - `lead-dev` = 0 (no concurrency, no perf, no security reasoning, no unknown root cause)

Junior-dev does the scanner, the constants, the field additions, and the doc sweep — that work is mechanical, governed by named files and named signatures. Senior-dev owns the three UI seams (variant select, settings section, resolver wiring) plus the seeder, because each requires composing 3+ existing classes and matching established lifecycle patterns (`OptionsPanel`/`OptionsDetail` mount/destroy; `GrimoireSettingTab.display()` render-and-save; `CommandPopupBuilder.refineCastAction` snapshot resolution). `ui-integration-tester` runs three times — once per user-facing seam — to define the Red criterion before the senior-dev devs implement to make it green.

## Sequencing & dispatch order

1. **A** (junior) — types and constants. Unblocks everything else; no UI yet.
2. **B** (junior) — scanner + spellScanner exclusion. Required by D, E, F.
3. **C** (junior — note: this is also senior-judgement-light, single pure function with clear cases) — resolver. Required by F.
4. **D** (tester then senior) — Refine OptionsPanel variant select. Required for the per-cast snapshot field to be populated.
5. **E** (tester then senior) — Settings section + seeder. Independent of D in production code (the section can ship before the panel switcher), but kept after D in dispatch order because E6 updates the existing settings-panel integration test's element count, and that update should happen once.
6. **F** (tester then senior) — cast resolution wiring + Notice. Pins the user-visible behaviour change.
7. **G** (junior) — doc drift sweep. After F so descriptions match shipped code.

If a parallel-execution opportunity arises, B and C can run concurrently after A. D, E, and F must run sequentially (each builds on the previous).

## Done-when

- A sentinel-marked note can be created from Settings via *Create from default* in one click; the new file is written to `forgeOutputFolder`, contains `sentinel: refine` plus the current bundled Refine body, and the Settings dropdown immediately shows it as active.
- The Settings dropdown lists `Default (built-in)` plus every vault note with `sentinel: refine` in frontmatter, regardless of folder or tag.
- The Refine OptionsPanel shows a variant `<select>` after the Cast button only when ≥1 sentinel-marked note exists; pre-selected to the Settings active value; changes persist to the session map only (no Settings write).
- The Spell Picker scan excludes sentinel-marked notes even when they carry the spell tag.
- Refine cast (from list-Enter or panel-Cast) resolves prompt path through per-cast → Settings → bundled cascade; falls back to bundled with the pitch's exact Notice on missing/un-marked custom paths.
- `tests/refine/refineSentinelScanner.test.ts`, `tests/refine/resolveRefinePath.test.ts`, `tests/refine/CustomRefineSeeder.test.ts` all green. Three new integration specs (`custom-refine-variant-select`, `custom-refine-settings`, `custom-refine-cast`) all green. Existing `tests/integration/refine-cast.spec.ts`, `tests/integration/refine-options-panel.spec.ts`, `tests/integration/settings-panel.spec.ts` still green (with the one expected element-count update in settings-panel).
- `npm test`, `npm run lint`, `npm run arch:check`, `npm run test:integration` all green.
- `docs/features/refine-cast.md` and `docs/features/settings-panel.md` describe the new cascade and Settings section (drift patched in G).
