# 018 — Forge spell materialization

> Replace the over-the-wire forge meta-spell with a bundled `forge.md` template that the plugin materializes into the vault on load (and on every settings save). Remote forge casts reference it via `spellPath`; local forge casts use the same file via `--system-prompt-file`. The user prompt shrinks to the five per-cast values.

## Goal

1. Stop pushing the 60+ line meta-spell over the network on every remote forge.
2. Give local and remote forge a single source of truth (one file on disk).
3. Keep the user-prompt-per-cast small (description / name / model / effort / executeOnNote).

## Scope

**In:**

- New module that renders a forge system-prompt string from a per-settings input (analogous to `hookScripts.ts`).
- New `ForgeMaterializer` class that writes the rendered string to a known path under the plugin dir (analogous to `HookMaterializer`).
- `ForgeImprinter` switches to: build small per-cast user prompt, pass `systemPromptFile` + `spellPath` to caster. Same path for both local and remote.
- Settings-save and onload hooks that re-materialize the file.
- Portal-side: no schema/handler changes needed (the `spellPath` + small `userPrompt` shape is already supported). One small validation tweak so the `.obsidian/...` path is allowed in tests; one doc/spec entry.
- Unit + integration coverage for the new split.

**Out:**

- Renaming `<forge>` cast-log sentinel — `spellPath: '<forge>'` in cast-log events still represents "originated from forge UI" and is untouched.
- Bundling `forge.md` as a literal `.md` file at build time. We render the file from TS (same pattern as `hookScripts.ts`) — no esbuild loader plugin change required.
- Per-cast forge re-materialization (we eagerly materialize on `onload` + on every save instead — cheaper and sufficient).
- Renaming or restructuring `agent-hooks/`. Forge file sits at `<plugin-dir>/forge.md` (sibling of `agent-hooks/`, not inside it).
- Hidden `.grimoire/` top-level vault dir. Rejected — see Key design decisions §1.
- Portal `/forge` endpoint, or any portal-side awareness that this spell is "the forge". To the portal it is just another `spellPath`.

## Proposed solution

### Lifecycle

```
plugin.onload()
  ├── CastLogModule.initStartupMaintenance()  [unchanged: agent-hooks materializer]
  └── ForgeMaterializer.run()                 [NEW: writes <pluginDir>/forge.md]

GrimoireSettingTab.onChange (any field)
  └── plugin.save()                            [unchanged: 500 ms debounced persistence]
       └── after save → ForgeMaterializer.run()  [NEW: re-render with new settings]

ForgeImprinter.imprint(snapshot, settings, close)
  ├── buildForgeUserPrompt(snapshot)           [NEW small fn; 5 per-cast values]
  ├── recordCasted({ spellPath: '<forge>', ... })  [unchanged sentinel for cast-log]
  └── caster.cast({
        systemPromptFile: <vaultMountPath>/<pluginDir>/forge.md,  [local + remote symmetry]
        spellPath: '<pluginDir>/forge.md',                          [remote: portal lookup key]
        userPrompt: <small per-cast string>,
        ...
      })
```

### Components

| Component | Location | Responsibility |
|---|---|---|
| `renderForgeSystemPrompt` | `src/forge/forgeTemplate.ts` (NEW) | Pure fn: `(input: ForgeSystemPromptInput) => string`. Returns the long instructions block with `vaultMountPath`, `spellTag`, `forgeOutputFolder` baked in. No per-cast values. |
| `buildForgeUserPrompt` | `src/forge/buildForgeUserPrompt.ts` (NEW) | Pure fn: `(snapshot, executeOnNote) => string`. Tiny structured block carrying the five per-cast inputs. |
| `ForgeMaterializer` | `src/forge/ForgeMaterializer.ts` (NEW) | Mirrors `HookMaterializer` shape: ports for `writeFile`/`mkdir`/`adapter`, single `run(): Promise<void>` that writes one file. |
| `PluginPaths.forgeSpellPathAbs()` | `src/infra/PluginPaths.ts` (EXT) | Returns `<pluginDir>/forge.md`. Mirrors `agentHooksDirAbs()`. |
| `PluginPaths.forgeSpellPathVaultRel()` | `src/infra/PluginPaths.ts` (EXT) | Returns the same path *without* the vaultMountPath prefix — vault-relative, for `spellPath` over the wire. |
| `ForgeMaterializerModule` wiring | `src/main/CastLogModule.ts` or new `src/main/ForgeModule.ts` | Eager run on `onload`. We add it to `CastLogModule.initStartupMaintenance` as a second materializer to keep one startup-maintenance entry point. |
| Settings-save → re-materialize | `src/main.ts` + `src/ui/settings/GrimoireSettingTab.ts` | New plugin port `onSettingsSaved(): void` injected into the settings tab; `main.ts` wires it to invoke the forge materializer (fire-and-forget). |
| `ForgeImprinter` | `src/forge/ForgeImprinter.ts` (CHANGE) | Now consumes a `forgeSpellPaths` port (`{ absForCaster, vaultRelForPortal }`) and a `buildForgeUserPrompt` fn. Passes `systemPromptFile` + `spellPath` into `caster.cast`. |
| `buildMetaSpell` | `src/forge/buildMetaSpell.ts` (DELETE) | Superseded by the split above. |
| `FORGE_SPELL_PATH` | `src/castLog/types.ts` (UNCHANGED) | Still `'<forge>'`, still used only for cast-log records — never sent over the wire. |
| Portal `validateSpellPath` | `grimoire-portal/src/cast/validateSpellPath.ts` (UNCHANGED) | `.obsidian/plugins/grimoire/forge.md` resolves inside `vaultMountPath`, no traversal, existence checked on disk — already passes. |

### Interfaces

```ts
// src/forge/forgeTemplate.ts
export interface ForgeSystemPromptInput {
  readonly spellTag: string;
  readonly forgeOutputFolder: string;
  readonly vaultMountPath: string;
}
export function renderForgeSystemPrompt(input: ForgeSystemPromptInput): string;

// src/forge/buildForgeUserPrompt.ts
export interface ForgeUserPromptInput {
  readonly description: string;
  readonly name: string;          // already sanitised
  readonly model: string;
  readonly effort: Effort | null;
  readonly executeOnNote: boolean;
}
export function buildForgeUserPrompt(input: ForgeUserPromptInput): string;

// src/forge/ForgeMaterializer.ts
export interface ForgeMaterializerPorts {
  getForgePathAbs: () => string;          // <pluginDir>/forge.md
  getSettings: () => ForgeSystemPromptInput;
  writeFile?: (path: string, content: string) => Promise<void>;
  mkdir?: (dir: string) => Promise<void>;
  adapter?: DataAdapter;
}
export class ForgeMaterializer {
  constructor(ports: ForgeMaterializerPorts);
  run(): Promise<void>;
}

// src/forge/ForgeImprinter.ts (changed deps shape)
export interface ForgeImprinterDeps {
  notify: (msg: string) => void;
  caster: () => Caster;
  logWriter: () => CastLogWriter;
  forgeSpellPaths: () => { absForCaster: string; vaultRelForPortal: string };
  generateId?: () => string;
}
```

### Data flow (forge cast, remote)

```
User submits ForgeFormSnapshot
  → ForgeImprinter.imprint(snapshot, settings, close)
      ├── sanitise name (existing)
      ├── castId = generateId()
      ├── userPrompt = buildForgeUserPrompt({ description, name, model, effort, executeOnNote })
      ├── logWriter.recordCasted({ spellPath: '<forge>', ... })   [cast-log only — sentinel preserved]
      ├── { absForCaster, vaultRelForPortal } = forgeSpellPaths()
      ├── notify "Forging '<name>' on portal…"; close()
      └── caster.cast({
            castId, spellPath: vaultRelForPortal,     [remote: portal looks up file]
            systemPromptFile: absForCaster,            [local: --system-prompt-file]
            userPrompt, modelId, effort, vaultMountPath,
          })
              └── RemoteCaster → RemoteCastTransport → POST /cast
                    body: { castId, spellPath: ".obsidian/plugins/grimoire/forge.md",
                            userPrompt: "<5 lines>", model, effort }
```

The local branch falls through `LocalCaster`'s existing `systemPromptFile`-set path — `buildCastArgs` already emits `--system-prompt-file <path> -p <userPrompt>` in that mode, so no change to local arg building.

### Error handling

| Failure | Response |
|---|---|
| `ForgeMaterializer.run()` rejects on `onload` | Log via `console.error`, plugin continues to load. First forge then fails at the caster boundary with a normal error notice. Mirrors the existing `HookMaterializer` behaviour (see `CastLogModule.initStartupMaintenance` try/catch). |
| `ForgeMaterializer.run()` rejects after settings save | `void .catch(console.error)` — fire-and-forget, same pattern as `sweeper.sweep()`. |
| Portal returns 404 "spell not found" because materializer hasn't run yet | Standard error path through `mapPortalError`. Surfaced as the existing notice text. No new error class. |
| User edits `forge.md` in vault by hand | Overwritten on next `onload` / settings save. The "Auto-generated — do not edit" banner inside the file documents this. Same contract as `agent-hooks/*.sh`. |
| `vaultMountPath` is empty | The absolute path becomes `/<pluginDir>/forge.md` (broken on host fs) and the remote guard already refuses casts when `portalHost` is empty for remote. Local cast with empty `vaultMountPath` was already a known degraded mode (see `forge-cast` edge cases) — unchanged. |

## Key design decisions

1. **File location: `<pluginDir>/forge.md`** (i.e. `<vault>/.obsidian/plugins/grimoire/forge.md`).
   - Plugin dir is already the home for plugin-managed auto-generated artefacts (`agent-hooks/`, `cast-log-*.jsonl`, `cast-log-scratch/`). `forge.md` joins that family.
   - Hidden from the spell scanner because `.obsidian/` is outside `forgeOutputFolder` (scanner only walks the configured spell folder).
   - Hidden from Obsidian's file index because `.obsidian/` is excluded.
   - Portal `validateSpellPath` already accepts any vault-relative path that resolves inside `vaultMountPath` with no `..` traversal — `.obsidian/plugins/grimoire/forge.md` qualifies.
   - **Rejected**: `<vault>/.grimoire/forge.md`. New top-level hidden dir for one file. Higher cost (gitignore, docs, lifecycle), no benefit over plugin-dir colocation.
   - **Rejected**: `<forgeOutputFolder>/.grimoire/forge.md`. Mixes a plugin-managed file with user-visible spell content; complicates the scanner exclusion rule.

2. **Local mode also uses `--system-prompt-file`** (symmetry with remote).
   - One code path in `ForgeImprinter`; one set of integration assertions; no `if (local) inline else file` branch.
   - Drops local subprocess argv size (no more 60-line `-p` argument).
   - **Rejected**: keeping local as inline. Cheaper in lines of code change but doubles the branches the imprinter has to test.

3. **Per-settings in `forge.md`, per-cast in `userPrompt`.**
   - `forge.md` contains: Execution Mode callout, MCP Tools section, full workflow instructions, `spellTag`, `forgeOutputFolder`, `vaultMountPath`.
   - `userPrompt` contains: `description`, `name`, `model`, `effort`, `executeOnNote`.
   - `executeOnNote` is per-cast (form snapshot, not settings) — it stays in `userPrompt` and the file's instructions refer to it by name.

4. **Re-materialize on `onload` + on every settings save** (not per-cast).
   - `onload` guarantees the file exists before any cast.
   - Settings-save re-materializes idempotently; cost is one file write.
   - Avoids `async imprint()` (would force changes throughout `ForgeImprinter` callers / popup teardown chain).
   - One-cycle-staleness window between save and first cast is acceptable: after-save fire-and-forget normally completes within milliseconds; the only observable artefact would be one forge running against last-cycle's `forgeOutputFolder` if the user clicks Forge immediately after Save before the debounced save resolves. Acceptable — see Edge cases.

5. **`renderForgeSystemPrompt` renders from TS, not a bundled `.md` literal.**
   - Matches the existing `hookScripts.ts` pattern precisely. esbuild config (`esbuild.config.mjs`) needs no new loader.
   - Tested with the same `toContain` / `not.toContain` style as `buildMetaSpell.test.ts`.
   - **Rejected**: importing a `.md` file via esbuild text loader. New build wiring + new file in vault would be source-controlled separately from the renderer logic — drift risk.

6. **`FORGE_SPELL_PATH = '<forge>'` stays as cast-log sentinel only.**
   - `recordCasted({ spellPath: '<forge>' })` is unchanged; it documents "this row came from the Forge UI" in the log viewer.
   - The `spellPath` *sent to the portal* is the real path `.obsidian/plugins/grimoire/forge.md`. The two namespaces (cast-log marker vs. portal lookup key) were already separate after `cast-unification`; this plan preserves that separation.
   - `RemoteCaster` test case 5 in `tests/integration/remote-forge.spec.ts` ("HTTP body omits the `<forge>` sentinel") now needs to be updated — see todos.

## Technical notes

- **`PluginPaths`**: today, `agentHooksDirAbs()` returns the *plugin-dir-relative* segment without `vaultMountPath`. Compare `main.ts:57`: it prepends `vaultMountPath` to build the absolute path. We follow the same pattern: `forgeSpellPathVaultRel()` returns `.obsidian/plugins/grimoire/forge.md` (the portal expects vault-relative). The "absolute" form for `--system-prompt-file` is built by the caller as `${vaultMountPath}/${forgeSpellPathVaultRel()}` — same idiom as the agent-hooks dir.
- **Design-patterns pass** — Step 1 of the `design-patterns` skill applied to each new component:
  - `ForgeMaterializer` → Template Method considered, rejected (only one materialization step; YAGNI). Direct class with ports, mirroring `HookMaterializer`, wins.
  - `renderForgeSystemPrompt` + `buildForgeUserPrompt` → Strategy considered, rejected (no second algorithm). Plain functions.
  - Settings-save → re-materialize wiring → Observer considered, accepted in the simplest form: a `onSettingsSaved?: () => void` callback port on `GrimoireSettingTab`, invoked alongside the existing `plugin.save()` call. A full pub/sub event bus would be premature — there is exactly one listener.
- **Design-rubric Section 7 self-critique**:
  - Single responsibility per new module? Yes — render / build user prompt / materialize / wire are four distinct files.
  - Component boundaries match testability? Yes — render and build are pure, materializer takes ports, wiring is one place in `main.ts`.
  - Dependency direction? `forge/*` depends only on `domain/settings/Settings` and (for the materializer) `obsidian` types. No upward dependency added.
  - Interfaces shape inputs cleanly? Inputs are small structured types; no boolean traps.
  - Did we invent extensibility we don't need? No second materializer kind, no second template format — kept concrete.
  - Where would this break under a 10× change? If forge gains a second template (e.g. "refine spell"), `renderForgeSystemPrompt` becomes `renderSpellTemplate(kind, input)` — straightforward refactor; today's shape doesn't fight that future.

## Edge cases (extracted explicitly)

- **Empty `vaultMountPath`** → For remote, existing portalHost guard intercepts. For local, behaviour is unchanged from `forge-cast` edge cases — degraded but not broken; absolute path becomes `/<pluginDir>/forge.md` which may or may not resolve depending on cwd. Out of scope to fix here.
- **First forge before `onload` materializer completes** → `onload` `await`s the materializer (already does for the hook materializer via `initStartupMaintenance` — we add this work inside the same awaited path). The popup command is registered after `onload` resolves, so a user-initiated forge cannot precede materialization.
- **Settings save mid-cast** → The cast already in flight uses the file's previous content; the next forge picks up the new settings. Acceptable: this matches how settings changes already propagate (see `live-read` in `forge-cast` doc).
- **User manually edits `forge.md`** → Overwritten next `onload` / save. Banner in the file documents the contract.
- **`forgeOutputFolder` empty string** → Today `buildMetaSpell` would render `<empty>${name}.md` which writes to vault root. Behaviour preserved by `renderForgeSystemPrompt`.
- **Portal validates path but file deleted between materialize and request** → `validateSpellPath` returns `not_found` → 404 → existing `mapPortalError` notice. No new error path.
- **Path length** → `.obsidian/plugins/grimoire/forge.md` ≈ 36 chars. Well under portal's `MAX_SPELL_PATH_LEN = 1024`.
- **Concurrent saves triggering concurrent materializers** → Each materializer call writes one file; `DataAdapter.write` overwrite is atomic enough for this use case. Last write wins; both writers produce identical bytes for identical settings.

## Cross-repo coordination

The two repos can ship independently because the portal already accepts `spellPath` + `userPrompt` for non-forge casts. Order of merge:

1. **Plugin first** (this plan). Portal is unchanged from current `main`. Existing forge casts continue to work (they send the old inline meta-spell via `userPrompt`). After plugin ships, remote forge starts sending `spellPath: ".obsidian/plugins/grimoire/forge.md"` instead.
2. **Portal**: only a docs/spec update is needed (Section P). No handler change. `validateSpellPath` already accepts the path.

If the plugin ships against an *older* portal that doesn't yet accept optional `spellPath` (pre-fix), remote forge will 400. The user-supplied "current state" confirms `spellPath` is already optional → no blocker.

## Todos

### A. Pure template rendering

#### Section briefing

**What this section produces**: two new pure functions under `src/forge/` — `renderForgeSystemPrompt` (forge.md content) and `buildForgeUserPrompt` (small per-cast string). Old `buildMetaSpell.ts` removed. See Interfaces.

**Design context the executor needs upfront**: from Key design decisions §3 — `forge.md` carries Execution Mode callout + MCP Tools (with `vaultMountPath`) + workflow instructions + `spellTag` + `forgeOutputFolder`. `userPrompt` carries only the five per-cast values (`description`, `name`, `model`, `effort`, `executeOnNote`). From §5 — render via TS, not a `.md` literal; match `hookScripts.ts` style.

**Cross-section couplings**: `B1` (ForgeMaterializer) consumes `renderForgeSystemPrompt` from `A1`. `C2` (ForgeImprinter rewrite) consumes `buildForgeUserPrompt` from `A2`. Both downstream sections require this section to be green first.

**Section-level Red criterion**: `tests/forge/renderForgeSystemPrompt.test.ts` and `tests/forge/buildForgeUserPrompt.test.ts` exist; cover content invariants (Execution Mode present, MCP Tools present, spellTag substituted, forgeOutputFolder substituted, vaultMountPath substituted, no Progress Tracking, no per-cast names leaked into the system prompt, `executeOnNote` and `description` appearing only in the user prompt); `buildMetaSpell.ts` and `buildMetaSpell.test.ts` deleted. `npm test` green.

**junior-dev**
- [x] A1: create `src/forge/forgeTemplate.ts` exporting `ForgeSystemPromptInput` and `renderForgeSystemPrompt`. Body must contain the Execution Mode callout, MCP Tools section with `vaultMountPath`, full workflow instructions, with `spellTag` and `forgeOutputFolder` substituted. Must NOT contain `description`, `name`, `model`, `effort`, or `executeOnNote` placeholders. Open with an `Auto-generated by Grimoire ForgeMaterializer. Do not edit — overwritten on every plugin load and settings save.` banner inside a `%%` block so it survives Markdown rendering. — M, junior-dev
- [x] A2: create `src/forge/buildForgeUserPrompt.ts` exporting `ForgeUserPromptInput` and `buildForgeUserPrompt`. Returns a structured block listing `description`, `name`, `model`, `effort` (or `n/a` when null), and `executeOnNote` (true/false). Must reference the system-prompt instructions by name ("Follow the workflow in your system prompt for these inputs:"). — S, junior-dev
- [x] A3: create `tests/forge/renderForgeSystemPrompt.test.ts` covering every assertion in the Red criterion above. Mirror the structure of `tests/buildMetaSpell.test.ts` (one `toContain` per invariant). — S, junior-dev
- [x] A4: create `tests/forge/buildForgeUserPrompt.test.ts` covering: description appears, name appears, model appears, `effort: medium` / `effort: n/a` branches, `executeOnNote: true` and `false` branches. — S, junior-dev
- [x] A5: delete `src/forge/buildMetaSpell.ts` and `tests/buildMetaSpell.test.ts`. Update any stray imports to compile — there should be exactly one remaining: `src/forge/ForgeImprinter.ts` (handled in section C). Leave a single transitional import that points to a placeholder export in `forgeTemplate.ts` if needed to keep section A green before section C lands, OR commit A and C together if the implementer prefers — junior-dev's choice. — S, junior-dev (2aebf9e)

### B. ForgeMaterializer + plugin-paths extension

#### Section briefing

**What this section produces**: `src/forge/ForgeMaterializer.ts` (class with `run(): Promise<void>`), `forgeSpellPathAbs()` and `forgeSpellPathVaultRel()` accessors on `PluginPaths`, plus a unit test suite mirroring `HookMaterializer.test.ts`. See Components and Interfaces.

**Design context the executor needs upfront**: from Key design decision §1 — file lives at `<pluginDir>/forge.md` (NOT inside `agent-hooks/`). Mirror `HookMaterializer` shape precisely: same ports interface (`writeFile?`, `mkdir?`, `adapter?`), default to `DataAdapter` when not provided, `normalizePath` for the output path, `mkdir` the parent dir before writing. The materializer renders by calling `renderForgeSystemPrompt` from A1.

**Cross-section couplings**: `B1` depends on `A1` (`renderForgeSystemPrompt`). `D1` (wiring in `main.ts` / `CastLogModule`) constructs `ForgeMaterializer` and depends on `B1`. `C2` (ForgeImprinter) reads `forgeSpellPathVaultRel()` and `forgeSpellPathAbs()` from `B3`/`B4`.

**Section-level Red criterion**: `tests/forge/ForgeMaterializer.test.ts` exists with at minimum the eight assertions from `HookMaterializer.test.ts` adapted to a single-file write — mkdir called once with plugin dir, writeFile called once with the forge path and the rendered content, settings change reflected in output, rejection propagates. `tests/PluginPaths.test.ts` extended with two new cases for the new accessors. `npm test` green.

**junior-dev**
- [x] B1: create `src/forge/ForgeMaterializer.ts` mirroring `src/castLog/HookMaterializer.ts` shape. Single `run()` that calls `ports.mkdir(pluginDir)` then `ports.writeFile(forgePath, renderForgeSystemPrompt(ports.getSettings()))`. Default `writeFile` / `mkdir` to `adapter.write` / `adapter.mkdir`. — M, junior-dev
- [x] B2: create `tests/forge/ForgeMaterializer.test.ts`. Cover: mkdir called once with the plugin dir, writeFile called once with the forge file path, content matches `renderForgeSystemPrompt` for given settings, rejection on writeFile propagates, default ports construct without error, trailing slash in `getForgePathAbs` handled. — M, junior-dev
- [x] B3: extend `src/infra/PluginPaths.ts` with `forgeSpellPathAbs(): string` returning `normalizePath(${this.#pluginDir}/forge.md)`. — S, junior-dev
- [x] B4: extend `src/infra/PluginPaths.ts` with `forgeSpellPathVaultRel(): string`. Returns the same string as `forgeSpellPathAbs()` since `pluginDir` is already vault-relative in production (see `main.ts:38` — `this.manifest.dir ?? '.obsidian/plugins/grimoire'`). Document this in a JSDoc on the method: "Returns the forge spell path expressed relative to the vault root, suitable for sending to the portal as `spellPath`." — S, junior-dev
- [x] B5: extend `tests/PluginPaths.test.ts` with two cases: `forgeSpellPathAbs` and `forgeSpellPathVaultRel` both return the normalized `<pluginDir>/forge.md`. — S, junior-dev

### C. ForgeImprinter rewrite — system-prompt-file branch

#### Section briefing

**What this section produces**: `src/forge/ForgeImprinter.ts` now passes `systemPromptFile` + `spellPath` to `caster.cast()` instead of an inline `userPrompt` containing the full meta-spell. The new `ForgeImprinterDeps` shape (see Interfaces) carries a `forgeSpellPaths` thunk. Existing unit and integration tests under `tests/ForgeImprinter.test.ts` and `tests/integration/forge-cast.spec.ts` / `remote-forge.spec.ts` are updated to assert the new shape.

**Design context the executor needs upfront**: from Key design decision §2 — local and remote use the same materialized file via `--system-prompt-file`; one code path, no `if (isRemote)` branch on prompt assembly. From §6 — `recordCasted({ spellPath: '<forge>' })` stays for cast-log purposes; the actual `spellPath` on `caster.cast()` is the real vault-relative path. From Data flow — the cast-log sentinel and the portal lookup key occupy different namespaces and must stay separate.

**Cross-section couplings**: `C2` depends on `A2` (`buildForgeUserPrompt`) and on `B3`/`B4` (PluginPaths accessors). `D1` constructs `ForgeImprinter` and passes the `forgeSpellPaths` thunk built from `PluginPaths`.

**Section-level Red criterion**: integration test `tests/integration/remote-forge.spec.ts` updated — Case 5 ("HTTP body omits `<forge>`") becomes "HTTP body includes `spellPath: '.obsidian/plugins/grimoire/forge.md'` and `userPrompt` is the small per-cast block" with explicit assertions: `parsedBody.spellPath` equals the vault-relative forge path, `parsedBody.userPrompt` does NOT contain the string "Execution Mode" (system-prompt content does not leak into the user prompt), `parsedBody.userPrompt` contains the description and the sanitised name. Case 1 (local forge) asserts `runSpy` was called with a `systemPromptFile` argument equal to the absolute forge path. `npm test` and `npm run test:integration` green.

**ui-integration-tester**
- [x] C1: extend `tests/integration/remote-forge.spec.ts` Case 5 with the assertions above (positive shape: `spellPath` present and points at the forge file; `userPrompt` is the small per-cast block; system-prompt content absent from the wire body). Add a new Case 7 for local forge: spy on `CastRunner.prototype.run`, assert the `runInput` carries `systemPromptFile === '<vaultMountPath>/.obsidian/plugins/grimoire/forge.md'` and `userPrompt` matches `buildForgeUserPrompt(snapshot)`. The test must instantiate `ForgeImprinter` with a real `forgeSpellPaths` thunk producing the path. — S, ui-integration-tester

**senior-dev**
- [x] C2: rewrite `src/forge/ForgeImprinter.ts` to accept `forgeSpellPaths: () => { absForCaster: string; vaultRelForPortal: string }` in `ForgeImprinterDeps`, drop the `buildMetaSpell` import, call `buildForgeUserPrompt` for the user prompt, and pass `systemPromptFile: paths.absForCaster` and `spellPath: paths.vaultRelForPortal` into `caster.cast()`. Cast-log `recordCasted` keeps `spellPath: FORGE_SPELL_PATH` (the `'<forge>'` sentinel) untouched. Notice strings unchanged. — M, senior-dev (623248f)
- [x] C3: update `tests/ForgeImprinter.test.ts` (unit) for the new deps shape: every test instance now passes a `forgeSpellPaths` thunk. Assert the casted-input shape includes `systemPromptFile` and `spellPath`, and that `userPrompt` is the small per-cast string (use a stub `buildForgeUserPrompt` mock or assert the literal). — M, senior-dev (623248f)
- [x] C4: update `tests/integration/forge-cast.spec.ts` (local-path integration) to expect `systemPromptFile` to flow through the CastRunner call. — S, senior-dev (250e6a9)

### D. Wiring — main.ts, PopupModule, CastLogModule, settings save

#### Section briefing

**What this section produces**: production wiring. `ForgeMaterializer` constructed and run in `onload`. `ForgeImprinter` constructed with a `forgeSpellPaths` thunk that reads from `PluginPaths` and current `vaultMountPath`. Settings tab gains an `onSettingsSaved` callback port that triggers fire-and-forget re-materialization.

**Design context the executor needs upfront**: from Lifecycle diagram — eager run on `onload` (awaited inside `initStartupMaintenance` so the file exists before the popup command is registered) AND fire-and-forget run after every `plugin.save()` from the settings tab. From Key design decision §4 — re-materialize on save, not per-cast. From Components — we extend `CastLogModule.initStartupMaintenance` to also run the ForgeMaterializer (one entry point for all "startup writes"), and add an `onSettingsSaved` callback on `GrimoireSettingTab`'s constructor that defaults to a no-op for tests.

**Cross-section couplings**: `D1`/`D2` depend on B (ForgeMaterializer + PluginPaths) and C (new ForgeImprinter deps shape). `D3` (settings tab callback) depends on `D1` providing a function to call.

**Section-level Red criterion**: `tests/main.test.ts` extended with two cases: (a) `onload` constructs `ForgeMaterializer` exactly once and `await`s its `run()`; (b) `ForgeImprinter` constructor receives a `forgeSpellPaths` thunk that, when invoked, returns paths derived from `vaultMountPath` and `PluginPaths.forgeSpellPathVaultRel()`. `tests/integration/settings-panel.spec.ts` extended (or a new `tests/integration/forge-materialization.spec.ts` added) with: editing the `Spell tag` field triggers a `ForgeMaterializer.run()` call (spy). `npm test` + `npm run test:integration` green.

**senior-dev**
- [x] D1: extend `src/main/CastLogModule.ts`'s `initStartupMaintenance` to also construct and `run()` a `ForgeMaterializer`. Add a `forgeMaterializerFactory?` constructor port for test injection, mirroring `materializerFactory` / `sweeperFactory`. The materializer's `getSettings` port reads `{ spellTag, forgeOutputFolder, vaultMountPath }` from the current settings — pass a `getSettings: () => ForgeSystemPromptInput` thunk into `CastLogModule`'s constructor from `main.ts`. — M, senior-dev (6f5a56f)
- [x] D2: update `src/main.ts` and `src/main/PopupModule.ts` to thread the new pieces: (a) `CastLogModule` receives `getSettings` (live read from `this.data.settings`); (b) `PopupModule`'s `ForgeImprinter` construction receives `forgeSpellPaths: () => ({ absForCaster: '<vaultMount>/<pluginPath>', vaultRelForPortal: '<pluginPath>' })` where `<pluginPath> = paths.forgeSpellPathVaultRel()`. — M, senior-dev (07af20e)
- [x] D3: extend `src/ui/settings/GrimoireSettingTab.ts` constructor to accept an optional `onSettingsSaved?: () => void` callback. Invoke it (fire-and-forget — wrap in `try/catch`) immediately after every `this.#plugin.save()` call inside the tab. Wire it in `src/main.ts` to fire-and-forget a new `ForgeMaterializer.run()` (expose a `materializeForge()` method on `CastLogModule` so the wiring is one line). — M, senior-dev (c10172b)
- [x] D4: extend `tests/main.test.ts` with the two cases listed in the Red criterion. — M, senior-dev (07af20e)
- [x] D5: extend `tests/integration/settings-panel.spec.ts` with a single case: editing the `Spell tag` field (or any text field) triggers the materializer factory's `run` spy. — S, senior-dev (c10172b)
- [x] D6: extend `tests/CastLogModule.test.ts` with: `initStartupMaintenance` invokes `forgeMaterializerFactory` once with the current settings and awaits its `run()`; rejection in the forge materializer is caught and logged, plugin still loads. — M, senior-dev (6f5a56f)

### E. Cleanup, drift, edge-case sweep

#### Section briefing

**What this section produces**: deletion of the old inline cast path (`buildMetaSpell.ts` was already removed in A5 — this section confirms no straggler references), edge-case tests for empty `vaultMountPath`, and a sanity check that `buildCastArgs` still emits `--system-prompt-file` correctly for the new flow.

**Design context the executor needs upfront**: from Edge cases — empty `vaultMountPath` is degraded but not a hard error; out of scope to fix here, but the absence of a regression must be asserted. From Components — `buildCastArgs` is unchanged; its existing `systemPromptFile`-set branch is what we now hit on every forge.

**Cross-section couplings**: depends on A, B, C, D all being green.

**Section-level Red criterion**: `npm run lint` clean; `npm test` green; `npm run test:integration` green; grepping the source tree for `buildMetaSpell` returns zero hits.

**junior-dev**
- [x] E1: grep-assert: `grep -r buildMetaSpell src/ tests/` returns nothing. — S, junior-dev (7d3d4a6)
- [x] E2: extend `tests/buildCastArgs.test.ts` with an explicit forge-shaped case: when `systemPromptFile` points at a `.obsidian/plugins/grimoire/forge.md`-shaped path and `userPrompt` is a small structured block, the resulting argv contains `--system-prompt-file <forgePath> -p <small block>` in that order. (This is a regression test against accidental reversal during refactor.) — S, junior-dev (4ca3268)
- [x] E3: extend `tests/integration/remote-forge.spec.ts` with a new Case 8: when `vaultMountPath === ''`, the `spellPath` sent over the wire is still vault-relative (`.obsidian/plugins/grimoire/forge.md`) — i.e. we don't accidentally inline the empty prefix into the wire-side spellPath. — S, junior-dev (8044ddd)

### F. Documentation

#### Section briefing

**What this section produces**: `forge-cast.md` live-spec updated to reflect the new file-based flow. `README.md` and `CLAUDE.md` checked for drift. No new feature doc — this iteration extends an existing one.

**Cross-section couplings**: none; depends only on A–E being final.

**Section-level Red criterion**: `forge-cast.md` mentions `forge.md`, the materializer, the location `<pluginDir>/forge.md`, and the split between system-prompt and user-prompt content. Old text describing the inline meta-spell over the wire is removed.

**junior-dev**
- [x] F1: update `docs/features/forge-cast.md`: replace the data-flow block to show `systemPromptFile` and the new small `userPrompt`; add a note that `forge.md` is materialized on `onload` and on every settings save; remove the line referencing `buildMetaSpell` from the components table and replace with `renderForgeSystemPrompt`, `buildForgeUserPrompt`, `ForgeMaterializer`. — S, junior-dev (34e0644)

### P. Portal repo

#### Section briefing

**What this section produces**: a docs/spec note in the portal repo recording that the plugin now sends `spellPath: '.obsidian/plugins/grimoire/forge.md'` for remote forge casts. No code change required.

**Design context the executor needs upfront**: from Cross-repo coordination — `validateSpellPath` already accepts the path; `castRequestSchema` already accepts optional `spellPath`; `dispatchSubprocess` already accepts optional `spellPathAbs`. Nothing to change. The note exists so future portal contributors understand why `.obsidian/...` shows up as a `spellPath` value in production logs.

**Cross-section couplings**: none. Can ship before or after plugin sections — see Cross-repo coordination.

**Section-level Red criterion**: a short paragraph added to the portal's `CLAUDE.md` (or equivalent docs file the portal repo uses) under "Known spell-path values" or similar. Lint + tests in portal repo remain green.

**junior-dev**
- [x] P1: in `/Users/volodymyrkoval/WebstormProjects/grimoire-portal`, add a paragraph to `CLAUDE.md` documenting: "Remote forge casts from the Grimoire plugin send `spellPath: '.obsidian/plugins/grimoire/forge.md'` — a plugin-managed, vault-relative system file. `validateSpellPath` already passes this path because it resolves inside `VAULT_MOUNT_PATH` with no traversal. No portal-side changes are required to support this shape." — S, junior-dev (51077f4)

## Overall effort

- **Sections**: 7 (A–F, P)
- **Todos**: 22
- **Effort**: S × 14, M × 8, L × 0
- **Tiers**: junior-dev × 13, senior-dev × 8, ui-integration-tester × 1, lead-dev × 0
- Dominant tier: junior-dev. senior-dev concentrated in sections C (imprinter rewrite — design-shaping change to a hot path) and D (cross-cutting wiring).

## Out-of-scope (deferred / future)

- Bundling `forge.md` as a literal asset via an esbuild text loader. Could clean up the template-as-string pattern across both `hookScripts.ts` and `forgeTemplate.ts` — defer until there's a third template.
- Per-cast re-materialization to remove the one-cycle-staleness window. Add only if a user reports a real bug.
- A portal-side `/forge` endpoint or any portal-side awareness that this `spellPath` is special. Not needed — the portal treats it as an ordinary file lookup, which is correct.
- Tagging `forge.md` with a YAML frontmatter `tags: [grimoire/system]` for vault search hygiene. The file is inside `.obsidian/` and not indexed; tagging is cosmetic.
- A "preview forge.md" debug command in the popup. Nice-to-have, not load-bearing.

reviewed @ 2b4c653
