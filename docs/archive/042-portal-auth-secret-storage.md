# 042 — Portal Auth Secret Storage

Move the Grimoire Portal Access **auth password** out of `data.json` plaintext into Obsidian's native `app.secretStorage`. Username, host, port, path remain in settings. Migrate existing plaintext passwords once on plugin load, idempotently. Bump `minAppVersion` to `1.11.4` — no feature-detection fallback needed.

## Complexity

**Medium.** Narrow blast radius (one field, two consumers), but the change touches: the Settings type, hydration/migration, the settings UI read/write site, and the RemoteCaster producer. A migration step has its own correctness bar (exactly-once, idempotent, never clobbers). Bumping `minAppVersion` eliminates the fallback branch, keeping the code simpler. Most todos are S/junior-dev once the design is pinned.

## Goal & scope

### In scope

- Bump `manifest.json` `minAppVersion` from `1.4.4` to `1.11.4` — `app.secretStorage` is always available, no fallback needed.
- New module `PortalSecret` — thin adapter over `app.secretStorage` (no feature-detection, no in-memory fallback).
- New module `SecretMigrator` — one-shot, idempotent migration of legacy `portalAuthPassword` from `data.json` into SecretStorage on plugin load.
- `RemoteCaster` reads the password from `PortalSecret.get()` instead of `settings.portalAuthPassword` (synchronous — no async ripple).
- Settings UI password field reads from / writes to `PortalSecret` instead of `s.portalAuthPassword`.
- `GrimoireSettings.portalAuthPassword` field is retained as a **legacy-only** field (so the migrator can detect non-empty values left by older versions and clear them); its value is no longer the source of truth and is always written as `''` after migration runs.
- Existing tests updated; new tests for `PortalSecret`, `SecretMigrator`, and the read/write path of `RemoteCaster` and the settings tab.

### Out of scope

- `portalAuthUser` stays in settings (per the brief).
- No generic `SecretStore` abstraction, no `SecretStorageRepository`, no migration registry — there is one secret and one migration.
- No deletion of the `portalAuthPassword` settings key from the `GrimoireSettings` type — keeping it preserves the simple `Partial<GrimoireSettings>` hydrate merge and the legacy-detection check. It becomes dead storage (always `''`) once migration has run.
- No `SecretComponent` UI widget — the existing password text input is fine and behaves identically.
- No retroactive read-on-every-cast caching: `getSecret` is synchronous and fast; no caching layer.
- No UX for "secret missing on this device" beyond the existing 401-handling already in `RemoteCastTransport` — that error path stays as-is.

## Proposed solution

Two new collaborators sit between the plugin and the raw SecretStorage API:

```
            ┌─────────────────────────────┐
  onload ──▶│ SecretMigrator.run()        │── reads data.json, writes secretStorage,
            │ (one-shot, idempotent)      │   clears legacy plaintext, persists data
            └─────────────────────────────┘
                          │ uses
                          ▼
            ┌─────────────────────────────┐
            │ PortalSecret                │── get(): string
            │ (thin adapter over          │   set(value: string): void
            │  app.secretStorage)         │
            └─────────────────────────────┘
                          ▲
            ┌─────────────┴────────────────┐
            │                              │
    RemoteCaster.cast                GrimoireSettingTab
    (reads password at cast time)    (#addPasswordField read/write)
```

`PortalSecret` is constructed once in `onload` and injected into:
- `SecretMigrator` (constructor)
- `RemoteCaster` (constructor)
- `GrimoireSettingTab` (constructor — replaces direct settings reads/writes for the password row only)

The migrator is invoked exactly once per `onload`, after `loadData` returns but before any cast can fire. The migration is idempotent: it only runs when `data.settings.portalAuthPassword` is non-empty AND the secret is not already set.

### Version-compatibility decision: bump `minAppVersion` (not feature-detect)

Chosen path: **bump `manifest.json` `minAppVersion` from `1.4.4` to `1.11.4`.**

- Eliminates the feature-detect branch and in-memory fallback entirely — `app.secretStorage` is unconditionally available. Code stays simple.
- Users on Obsidian < 1.11.4 will be told the plugin requires a newer version; Obsidian has had 1.11.x available since early 2025 — the vast majority of the install base is past this bar.
- `isDesktopOnly: false` stays — SecretStorage works on mobile per the Obsidian 1.11.4 release notes.

### Migration semantics (precise)

On every `onload`, after `loadData()`:

1. Read the legacy value `legacy = data.settings.portalAuthPassword`.
2. If `legacy === ''` → no-op (nothing to migrate; covers fresh installs and post-migration loads).
3. If `secretStorage.getSecret(SECRET_ID)` returns a non-empty string → **do not overwrite**; clear the legacy plaintext anyway (the secret is already authoritative; the plaintext is stale). Persist via `saveData`.
4. Otherwise → `setSecret(SECRET_ID, legacy)`, clear `data.settings.portalAuthPassword = ''`, persist via `saveData`.

Result: after one successful migration the plaintext is gone from `data.json`. Subsequent loads find `legacy === ''` and short-circuit at step 2.

## Components

| Component | Responsibility | Location |
|-----------|---------------|----------|
| `manifest.json` | Bump `minAppVersion` to `1.11.4`. | `manifest.json` (modified) |
| `PortalSecret` | Thin adapter over `app.secretStorage` for the single portal-password secret. No fallback logic. | `src/infra/PortalSecret.ts` (new) |
| `SecretMigrator` | One-shot, idempotent move of legacy plaintext `portalAuthPassword` from `data.settings` into `PortalSecret`. Clears the legacy field and persists. | `src/infra/SecretMigrator.ts` (new) |
| `GrimoirePlugin` (`main.ts`) | Constructs `PortalSecret`, runs `SecretMigrator.run()` once during `onload`, injects `PortalSecret` into `RemoteCaster` and `GrimoireSettingTab`. | `src/main.ts` (modified) |
| `RemoteCaster` | Sources the password from `PortalSecret.get()` at cast time instead of `settings.portalAuthPassword`. | `src/cast/portal/RemoteCaster.ts` (modified) |
| `GrimoireSettingTab` | Password field reads/writes via `PortalSecret`; no longer touches `s.portalAuthPassword`. | `src/ui/settings/GrimoireSettingTab.ts` (modified) |
| `GrimoireSettings` (type + defaults) | `portalAuthPassword: string` retained as legacy-only field (always `''` after migration). JSDoc updated to flag it as legacy. | `src/domain/settings/Settings.ts` (modified) |

## Interfaces

### `SecretStorage` (existing, from Obsidian 1.11.4 — verbatim)

```ts
interface SecretStorage {
  getSecret(id: string): string | null;
  setSecret(id: string, secret: string): void;
  listSecrets(): string[];
}
```

### `PortalSecret` (new)

```ts
// src/infra/PortalSecret.ts

/** Stable ID for the portal auth password secret. Used as the key in app.secretStorage. */
export const PORTAL_AUTH_PASSWORD_SECRET_ID = 'grimoire.portalAuthPassword';

/** Minimal shape consumed from app.secretStorage — what PortalSecret depends on. */
export interface SecretStorageLike {
  getSecret(id: string): string | null;
  setSecret(id: string, secret: string): void;
  listSecrets(): string[];
}

/**
 * Thin adapter over Obsidian's secretStorage for the single portal-password secret.
 * Requires Obsidian >= 1.11.4 (minAppVersion in manifest.json).
 */
export class PortalSecret {
  /** @returns the current secret value, or '' if unset. Never throws. */
  get(): string;
  /** Persists the secret via app.secretStorage. */
  set(value: string): void;

  constructor(deps: { secretStorage: SecretStorageLike });
}
```

### `SecretMigrator` (new)

```ts
// src/infra/SecretMigrator.ts

export interface MigrationLegacyAccess {
  /** Returns current legacy plaintext, or '' if absent. */
  readLegacy(): string;
  /** Clears the legacy plaintext field in memory. */
  clearLegacy(): void;
  /** Persists the cleared field to data.json (awaited). */
  persist(): Promise<void>;
}

/**
 * One-shot migration: copy legacy plaintext portalAuthPassword into PortalSecret,
 * then clear the plaintext from data.json. Idempotent — safe to run on every load.
 */
export class SecretMigrator {
  constructor(deps: { secret: PortalSecret; legacy: MigrationLegacyAccess });
  /** @returns 'migrated' | 'skipped-empty' | 'skipped-already-set' */
  run(): Promise<'migrated' | 'skipped-empty' | 'skipped-already-set'>;
}
```

### `RemoteCaster` constructor (modified)

```ts
constructor({
  settings,
  secret,            // NEW — defaulted only for backwards compat in tests
  transport,
}: {
  settings: GrimoireSettings;
  secret: PortalSecret;
  transport?: RemoteCastTransport;
});
```

At cast time, `RemoteCaster` reads `this.#secret.get()` and passes it as `portalAuthPassword` to the transport. The transport's input shape (`RemoteCastInput.portalAuthPassword: string`) is unchanged.

### `GrimoireSettingTab` constructor (modified)

Adds a `secret: PortalSecret` parameter (after `app`/`plugin`, before the existing optional callbacks) so the password field row reads/writes via the adapter rather than directly mutating `s.portalAuthPassword`.

## Data flow

**On plugin load (`onload`):**

```
loadData() → hydrate() → data.settings (incl. legacy portalAuthPassword if old)
          ↓
  new PortalSecret({ secretStorage: this.app.secretStorage as SecretStorageLike })
          ↓
  new SecretMigrator({ secret, legacy: { readLegacy, clearLegacy, persist } })
          ↓
  await migrator.run()    // mutates data.settings.portalAuthPassword + secret + data.json
          ↓
  inject `secret` into RemoteCaster and GrimoireSettingTab
```

**On cast (remote):**

```
RemoteCaster.cast(input, callbacks)
    → password = this.#secret.get()
    → transport.run({ ..., portalAuthPassword: password }, ...)
```

**On settings edit (password field):**

```
user types in password input → onChange(v) → this.#secret.set(v)
                                            → (no plugin.save() — secret persists itself,
                                               independent of debounced data.json saves)
```

## Error handling

- `PortalSecret.get()` never throws — returns `''` on missing key. Cast-time consumers already handle empty passwords (the existing 401 path in `RemoteCastTransport` covers wrong/missing creds).
- `PortalSecret.set()` swallows any synchronous throw from `setSecret` (defensive: the API is documented as `void`, but plugins should not crash on storage failure) and logs `console.warn`.
- `SecretMigrator.run()` propagates `saveData` failures as a rejected promise. `onload` awaits it but does *not* abort plugin startup on rejection — a `Notice` informs the user that legacy plaintext could not be cleared; plugin continues with the secret-store value (set successfully) and the stale plaintext (will be retried next load). Logged at `console.error`.
- Migrator never reads or writes `portalAuthPassword` directly — only through the injected `MigrationLegacyAccess`. Makes the migrator testable without a real `Plugin`.

## Technical notes

- **Secret ID:** `grimoire.portalAuthPassword`, exported as `PORTAL_AUTH_PASSWORD_SECRET_ID` constant from `src/infra/PortalSecret.ts`. Namespaced to survive a future second secret without conflict.
- **No async ripple.** `getSecret` is sync; `RemoteCaster.cast` stays synchronous. The only awaited new call is `SecretMigrator.run()`'s internal `saveData`, awaited in `#loadPluginData` after `hydrate`.
- **JSDoc on `GrimoireSettings.portalAuthPassword`:** mark it `@deprecated — legacy field; source of truth is PortalSecret. Always '' after migration.` Keeps grep-discoverability while warning future readers.
- **`DEFAULT_SETTINGS.portalAuthPassword`:** stays `''`. No behavioural change.
- **Type bridging:** `app.secretStorage` is not in older `obsidian` package type defs. Cast it with `this.app.secretStorage as unknown as SecretStorageLike` and document the cast with a comment pointing to the `minAppVersion: "1.11.4"` guarantee.
- **Mock additions:** `tests/__mocks__/obsidian.ts` `App` class gains a `secretStorage` shim (in-memory `Map<string, string>`) backing `getSecret`, `setSecret`, `listSecrets`. Default: shim present (matches `minAppVersion`). Tests pass a `SecretStorageLike` fake directly to `PortalSecret` — no need to go through `new App()` for unit tests.
- **Patterns considered and rejected:**
  - *Feature-detect / in-memory fallback* — rejected by user: bumping `minAppVersion` keeps the code simpler with zero conditional branches.
  - *Generic SecretStore / SecretRepository* — rejected, YAGNI: scope is one secret. A second secret can compose `PortalSecret`-shaped adapters or be added by widening — no premature abstraction earned.
  - *Migration registry / versioned migrations* — rejected, YAGNI: one migration, one direction, idempotent. Class with one `run()` is sufficient.
  - *Caching layer in front of `getSecret`* — rejected: `getSecret` is documented sync and reads from local storage. A cache adds invalidation complexity for zero measurable benefit.
- **No coupling between settings UI saves and secret saves.** The password input's `onChange` calls `secret.set(v)` and does **not** call `plugin.save()` — the password is no longer part of `data.json`, so the debounced saver has nothing to flush for that field. Other fields in the password row's section continue to flow through `plugin.save()` as before.

## Todos

### A. Type + defaults + JSDoc legacy marker + manifest bump

#### Section briefing

1. **Produces:** modifies `src/domain/settings/Settings.ts` (JSDoc) and `manifest.json` (minAppVersion bump).
2. **Methods produced:** none (type/data only).
3. **Design context the executor needs upfront:** from Technical notes — "`GrimoireSettings.portalAuthPassword` is retained as a legacy-only field (always `''` after migration). JSDoc should mark it `@deprecated — legacy field; source of truth is PortalSecret. Always '' after migration.`" Do NOT delete the field; the migrator needs to detect non-empty legacy values. `manifest.json` `minAppVersion` must be `"1.11.4"` — this is the version that introduced `app.secretStorage`, no fallback needed.
4. **Cross-section couplings:** B and C depend on the `PORTAL_AUTH_PASSWORD_SECRET_ID` constant — but that lives in `PortalSecret.ts` (Section B), not here. None for this section.
5. **Section-level Red criterion:** `npm run lint` and `npm test` stay green. The `GrimoireSettings` interface still declares `portalAuthPassword: string`. JSDoc on that field contains `@deprecated` and references `PortalSecret`. `manifest.json` `minAppVersion` is `"1.11.4"`. No behaviour change is measurable yet.

**junior-dev**

- [x] A1: Add `@deprecated` JSDoc to `GrimoireSettings.portalAuthPassword` in `src/domain/settings/Settings.ts:30` explaining it is a legacy field whose source of truth is `PortalSecret` and that it is always `''` after migration. Do not change the type or default. — S, junior-dev (9c9d518)
- [x] A2: In `manifest.json`, change `"minAppVersion": "1.4.4"` to `"minAppVersion": "1.11.4"`. No other fields change. — S, junior-dev (9c9d518)

### B. `PortalSecret` adapter

#### Section briefing

1. **Produces:** new file `src/infra/PortalSecret.ts` exporting: `PORTAL_AUTH_PASSWORD_SECRET_ID` constant, `SecretStorageLike` interface, `PortalSecret` class. New test file `tests/infra/PortalSecret.test.ts`.
2. **Methods produced:**
   - `PortalSecret.constructor(deps)` — captures the required `secretStorage`.
   - `PortalSecret.get()` — returns `secretStorage.getSecret(ID) ?? ''`. Wraps in try/catch returning `''` on throw. Never throws.
   - `PortalSecret.set(value)` — calls `secretStorage.setSecret(ID, value)` wrapped in try/catch; logs `console.warn` on throw.
3. **Design context the executor needs upfront:** verbatim from Interfaces — `PortalSecret` has methods `get(): string`, `set(value: string): void`. Constructor takes `{ secretStorage: SecretStorageLike }` (non-optional — `minAppVersion: "1.11.4"` guarantees availability). Secret ID is `'grimoire.portalAuthPassword'`. From Error handling — `get()` never throws; `set()` swallows synchronous throws and logs `console.warn`.
4. **Cross-section couplings:** tests construct `PortalSecret` directly with a `Map`-backed fake — independent of D1 (D1 is for integration/settings-tab tests that go through `App`).
5. **Section-level Red criterion:** `PortalSecret.test.ts` exercises: (a) `get()` returns `''` when key absent; (b) `set('x')` then `get()` returns `'x'`; (c) `set()` swallows a throwing `setSecret` — `get()` after a failed set still returns whatever was previously in the store; (d) `get()` wraps a throwing `getSecret` and returns `''`. All tests green.

**junior-dev**

- [x] B1: Create `src/infra/PortalSecret.ts` exporting `PORTAL_AUTH_PASSWORD_SECRET_ID = 'grimoire.portalAuthPassword'`, the `SecretStorageLike` interface (verbatim from Interfaces section), and the `PortalSecret` class with constructor signature `constructor(deps: { secretStorage: SecretStorageLike })`. Class has private field `#storage: SecretStorageLike`. — S, junior-dev (99eb325)
- [x] B2: Implement `PortalSecret.get(): string` — return `this.#storage.getSecret(PORTAL_AUTH_PASSWORD_SECRET_ID) ?? ''`, wrapped in try/catch returning `''` on throw. — S, junior-dev (99eb325)
- [x] B3: Implement `PortalSecret.set(value: string): void` — call `this.#storage.setSecret(PORTAL_AUTH_PASSWORD_SECRET_ID, value)` wrapped in try/catch; log `console.warn` on throw. — S, junior-dev (99eb325)
- [x] B4: Write `tests/infra/PortalSecret.test.ts` covering cases (a)–(d) from the section Red criterion. Use an in-memory `Map`-backed `SecretStorageLike` fake. — M, junior-dev (99eb325)

### C. `SecretMigrator`

#### Section briefing

1. **Produces:** new file `src/infra/SecretMigrator.ts` exporting `MigrationLegacyAccess` interface and `SecretMigrator` class. New test file `tests/infra/SecretMigrator.test.ts`.
2. **Methods produced:**
   - `SecretMigrator.constructor(deps)` — captures `#secret` and `#legacy`.
   - `SecretMigrator.run()` — async orchestrator → `#decide()` → branch on result → `#performMigration()` (when migrating) or `#clearStalePlaintext()` (when secret already set but plaintext still present).
   - `#decide(): 'migrate' | 'skip-empty' | 'skip-already-set' | 'clear-stale'` — pure decision function, no side effects.
   - `#performMigration(legacy: string): Promise<void>` — calls `#secret.set(legacy)`, then `#legacy.clearLegacy()`, then awaits `#legacy.persist()`.
   - `#clearStalePlaintext(): Promise<void>` — calls `#legacy.clearLegacy()` and awaits `#legacy.persist()`. Used when secret-store already has a value but legacy plaintext is still non-empty in `data.json`.
3. **Design context the executor needs upfront:** verbatim from "Migration semantics (precise)" — four-step algorithm (no `skip-unavailable` branch). Step 3 ("if secret already non-empty → do not overwrite; clear legacy anyway") is the `clear-stale` branch. Return values map: migrated→step 4; skipped-empty→step 2; skipped-already-set→step 3. `clear-stale` returns `'skipped-already-set'` (clearing is a side effect, not a migration). Idempotency check: after one successful `'migrated'` run, a re-run must return `'skipped-empty'` because legacy plaintext is now `''`.
4. **Cross-section couplings:** E1 (the `onload` wiring) calls `SecretMigrator.run()` and awaits its promise. E1 does not inspect the return value beyond logging.
5. **Section-level Red criterion:** `SecretMigrator.test.ts` covers: (a) legacy empty → returns `'skipped-empty'`, secret untouched, persist not called; (b) legacy non-empty + secret-store empty → returns `'migrated'`, `secret.get()` now returns the legacy value, `legacy.clearLegacy()` called, `legacy.persist()` awaited; (c) legacy non-empty + secret-store already non-empty (different value) → returns `'skipped-already-set'`, secret-store value preserved (no overwrite), `legacy.clearLegacy()` called, persist awaited; (d) idempotency — call `run()` twice on a fresh migrator with non-empty legacy; first returns `'migrated'`, second returns `'skipped-empty'`; (e) `persist()` rejection propagates as rejected promise.

**junior-dev**

- [x] C1: Create `src/infra/SecretMigrator.ts` exporting `MigrationLegacyAccess` interface (verbatim from Interfaces) and the `SecretMigrator` class with constructor `constructor(deps: { secret: PortalSecret; legacy: MigrationLegacyAccess })`. Fields `#secret`, `#legacy`. — S, junior-dev (5abd403)
- [x] C2: Implement `#decide(): 'migrate' | 'skip-empty' | 'skip-already-set' | 'clear-stale'` — pure function reading `this.#legacy.readLegacy()` and `this.#secret.get()`. Decision table: legacy empty → `skip-empty`; secret already non-empty and legacy non-empty → `clear-stale`; otherwise → `migrate`. — S, junior-dev (5abd403)
- [x] C3: Implement `#performMigration(legacy: string): Promise<void>` orchestrating `this.#secret.set(legacy)` → `this.#legacy.clearLegacy()` → `await this.#legacy.persist()`. — S, junior-dev (5abd403)
- [x] C4: Implement `#clearStalePlaintext(): Promise<void>` orchestrating `this.#legacy.clearLegacy()` → `await this.#legacy.persist()`. — S, junior-dev (5abd403)
- [x] C5: Implement `SecretMigrator.run(): Promise<'migrated' | 'skipped-empty' | 'skipped-already-set'>` orchestrator → calls `#decide()` → switches: `'migrate'` → `await #performMigration(legacy)` and return `'migrated'`; `'clear-stale'` → `await #clearStalePlaintext()` and return `'skipped-already-set'`; `'skip-empty'` / `'skip-already-set'` → return as-is. — S, junior-dev (5abd403)
- [x] C6: Write `tests/infra/SecretMigrator.test.ts` covering cases (a)–(e) from the section Red criterion. Use a real `PortalSecret` (constructed with a Map-backed fake) and a fake `MigrationLegacyAccess` that wraps a mutable `{ password: string }` object, with `vi.fn()` spies on `clearLegacy` and `persist`. — M, junior-dev (5abd403)

### D. Obsidian mock — add `secretStorage` shim

#### Section briefing

1. **Produces:** modifies `tests/__mocks__/obsidian.ts` to add a `secretStorage` property to the `App` class. The shim is a `Map<string, string>`-backed object exposing `getSecret`, `setSecret`, `listSecrets`.
2. **Methods produced:**
   - `App.secretStorage.getSecret(id): string | null` — returns map value or `null`.
   - `App.secretStorage.setSecret(id, secret): void` — sets map entry.
   - `App.secretStorage.listSecrets(): string[]` — returns `Array.from(map.keys())`.
3. **Design context the executor needs upfront:** from Technical notes — the shim is *present by default* (matches `minAppVersion: "1.11.4"`) so integration tests that construct `new App()` automatically get a working `secretStorage` — no opt-in noise. Unit tests for `PortalSecret` and `SecretMigrator` pass a `Map`-backed fake directly, not through `App`.
4. **Cross-section couplings:** G3/G4/G5 (settings tab integration tests) rely on `new App().secretStorage`. E2 (wiring integration test) likewise.
5. **Section-level Red criterion:** `new App().secretStorage` is a non-undefined object with three methods that round-trip through an internal Map. `npm test` is green (no existing test should break — `App` instances now have an extra property they previously ignored).

**junior-dev**

- [x] D1: Add `secretStorage` field to `App` in `tests/__mocks__/obsidian.ts` — initialised in a small `makeSecretStorageMock()` helper (parallel to `makeDataAdapterMock`) returning `{ getSecret, setSecret, listSecrets }` backed by a fresh `Map<string, string>`. — S, junior-dev (9c9d518)

### E. `onload` wiring + plugin-level integration

#### Section briefing

1. **Produces:** modifies `src/main.ts` (`GrimoirePlugin.#loadPluginData` + constructor wiring for downstream consumers).
2. **Methods produced:**
   - `GrimoirePlugin.#loadPluginData()` (modified) — current behaviour stays; after constructing `this.saver` and `this.overrides`, also constructs `this.secret = new PortalSecret({ secretStorage: this.app.secretStorage })` and awaits `new SecretMigrator({ secret: this.secret, legacy: ... }).run()`. The `MigrationLegacyAccess` is an inline object: `readLegacy: () => this.data.settings.portalAuthPassword`, `clearLegacy: () => { this.data.settings.portalAuthPassword = ''; }`, `persist: () => this.saveData(this.data)`.
   - `GrimoirePlugin.onload` (unchanged) — already awaits `#loadPluginData`, so the migration runs before any other init step.
   - New field: `secret!: PortalSecret`.
3. **Design context the executor needs upfront:** from Technical notes — persistence uses `this.saveData(...)` directly (not `this.saver.schedule()`) — migration is a one-shot startup step, not a debounced edit. `await`ing it ensures the cleared plaintext hits disk before any other code runs. Type-bridging: `app.secretStorage` may not be in the pinned `obsidian` package type defs — cast with `this.app.secretStorage as unknown as SecretStorageLike` and add a single-line comment pointing to the `minAppVersion: "1.11.4"` guarantee. From Error handling — rejection should not abort `onload`: catch and show `Notice`.
4. **Cross-section couplings:** Sections F (`RemoteCaster`) and G (`GrimoireSettingTab`) depend on `this.secret` being available before `#buildPopupModule` / `#registerUI` run. The migrator must run BEFORE `#buildPopupModule`. Ordering inside `onload`: `#loadPluginData` (now includes migrator) → `#buildPaths` → `#initCastLog` → `#buildPopupModule` → `#registerUI`.
5. **Section-level Red criterion:** new test `tests/infra/loadPluginDataMigration.test.ts`. Test: construct a `SecretMigrator` using the same `MigrationLegacyAccess` shape that `#loadPluginData` uses, with legacy `'legacy-secret'`; assert `data.settings.portalAuthPassword === ''`, `secret.get() === 'legacy-secret'`, `saveData` called once. Second invocation returns `'skipped-empty'`. `npm test` green.

**senior-dev**

- [x] E1: Add `secret!: PortalSecret` field to `GrimoirePlugin`. In `#loadPluginData`, after `this.overrides = ...`, add: `this.secret = new PortalSecret({ secretStorage: this.app.secretStorage as unknown as SecretStorageLike })` (comment: `// app.secretStorage guaranteed by minAppVersion 1.11.4`). Construct the migrator inline with the `MigrationLegacyAccess` object (verbatim from Data flow section). `await migrator.run().catch(err => { console.error('SecretMigrator failed', err); new Notice('Portal password migration failed — legacy plaintext may still be in data.json.'); })`. — M, senior-dev (5c6bc64)

  Rationale for senior-dev: needs judgment on (1) the correct type-bridge expression given the project's pinned `obsidian` package, (2) the precise error-handling at startup so rejection does not abort `onload`, (3) confirming nothing later in `onload` reads the now-cleared `portalAuthPassword` before injection wiring lands.

- [x] E2: Write `tests/infra/loadPluginDataMigration.test.ts` (or new `describe` block in `tests/persistence.test.ts`) covering the wired migration path: legacy non-empty → migrated; second-run idempotent; legacy empty → no `saveData` call. Use a `Plugin` subclass / direct `SecretMigrator` instantiation with the same `MigrationLegacyAccess` shape that `#loadPluginData` uses — do not re-test `SecretMigrator`'s internals (already covered in C), test only that the wiring composes correctly. — S, junior-dev (3622eaa)

### F. `RemoteCaster` reads from `PortalSecret`

#### Section briefing

1. **Produces:** modifies `src/cast/portal/RemoteCaster.ts` (constructor + `cast` method) and `tests/cast/portal/RemoteCaster.test.ts`. Touches `tests/integration/remote-cast.spec.ts` only if it currently relies on `settings.portalAuthPassword` to flow the password through.
2. **Methods produced:**
   - `RemoteCaster.constructor` (modified) — adds required `secret: PortalSecret` to deps; stores as `#secret`.
   - `RemoteCaster.cast(input, callbacks)` (modified) — builds the transport input the same way except `portalAuthPassword: this.#secret.get()` instead of `this.#settings.portalAuthPassword`.
3. **Design context the executor needs upfront:** verbatim from Out of scope — "Don't refactor RemoteCaster/RemoteCastTransport's input shape beyond what's needed to source the password from SecretStorage. The transport's `input.portalAuthPassword: string` contract can stay; only the producer changes." So `RemoteCastTransport` is untouched; `RemoteCastInput` shape stays the same; only the line that populates `portalAuthPassword` in `RemoteCaster.cast` changes from `this.#settings.portalAuthPassword` to `this.#secret.get()`.
4. **Cross-section couplings:** depends on E1 (`PortalSecret` constructed in `#loadPluginData`) and on the existing remote-cast wiring site — the caster's caller must pass `secret`. Find that callsite by grep (`new RemoteCaster(`) and pass `secret: this.secret` from `GrimoirePlugin`. If the callsite is in `createCaster.ts`, plumb `secret` through its parameter list — keep junior because the change is mechanical once the producer is known.
5. **Section-level Red criterion:** `RemoteCaster.test.ts` has a new test: when `secret.get()` returns `'pw-from-store'`, the caster invokes the transport with `portalAuthPassword: 'pw-from-store'` regardless of `settings.portalAuthPassword`'s value. Existing tests updated to pass a `secret` dep (a stub `PortalSecret` or a fake with the same shape). `npm test` green.

**junior-dev**

- [x] F1: Modify `RemoteCaster` constructor in `src/cast/portal/RemoteCaster.ts:14-23` to require `secret: PortalSecret` in the deps object; store as `readonly #secret: PortalSecret`. Update `cast()` line 41 from `portalAuthPassword: this.#settings.portalAuthPassword` to `portalAuthPassword: this.#secret.get()`. — S, junior-dev (7924dc2)
- [x] F2: Grep for `new RemoteCaster(` in `src/` — likely in `src/cast/createCaster.ts` (confirm via grep). Thread `secret: PortalSecret` through its parameter list and pass `this.secret` from the `GrimoirePlugin` callsite that builds the caster (likely in `#buildPopupModule` or `CastDispatcher` construction — verify via grep before editing). — S, junior-dev (7924dc2)
- [x] F3: Update existing tests in `tests/cast/portal/RemoteCaster.test.ts` and `tests/cast/createCaster.test.ts` to pass a `secret` dep — a `PortalSecret` constructed with the default mock `App().secretStorage` (after D1) or an inline stub `{ get: () => 'pw', set: () => {}, isPersistent: () => true } as unknown as PortalSecret`. Add one new test: with `secret.get()` returning `'pw-from-store'` and `settings.portalAuthPassword = 'IGNORED'`, assert the transport receives `portalAuthPassword: 'pw-from-store'`. — M, junior-dev (7924dc2)
- [x] F4: Edge case — when `secret.get()` returns `''` (unset secret), the caster still calls the transport with `portalAuthPassword: ''`. Transport's existing 401 path is the user-visible signal. Add a test confirming the empty string flows through (no defensive short-circuit in the caster). — S, junior-dev (7924dc2)

### G. Settings UI: password field reads/writes via `PortalSecret`

#### Section briefing

1. **Produces:** modifies `src/ui/settings/GrimoireSettingTab.ts` (constructor + `#renderAdvancedSection` password field row) and the construction site in `src/main.ts:108`. Touches `tests/integration/settings-panel.spec.ts`.
2. **Methods produced:**
   - `GrimoireSettingTab.constructor` (modified) — adds required `secret: PortalSecret` parameter (right after `plugin`); stores as `#secret`.
   - `#renderAdvancedSection` (modified) — the call at lines 113–114 changes from `() => s.portalAuthPassword, v => { s.portalAuthPassword = v; }` to `() => this.#secret.get(), v => { this.#secret.set(v); }`. The third arg (description) is unchanged. **Crucially**, the `#addPasswordField` helper's body still calls `this.#save()` on every change — that flow is fine because `plugin.save()` is a no-op for fields outside `data.settings` (it just schedules a debounced `saveData`, which now writes a `''` for `portalAuthPassword` — harmless). To keep semantics clean, we leave that call in place and let the saver write the (empty) field; refactoring to skip the save on password edits is out of scope.
3. **Design context the executor needs upfront:** verbatim from Data flow — "user types in password input → onChange(v) → this.#secret.set(v) → (no plugin.save() — secret persists itself, independent of debounced data.json saves)". But per the Methods-produced note above, the `#addPasswordField` helper currently fires `#save()` and we keep that for code-shape consistency; the saved `data.json` just gets `''` for the legacy field, which is correct post-migration. Document this nuance in the test comment, not as a contradiction.
4. **Cross-section couplings:** depends on E1 (`this.secret` exists on the plugin). Construction site in `main.ts:108` must pass `this.secret` as the new arg.
5. **Section-level Red criterion:** updated integration test `tests/integration/settings-panel.spec.ts` — typing in the password input no longer mutates `plugin.data.settings.portalAuthPassword` (stays `''`) but DOES result in `secret.get()` returning the typed value. The initial password input value reflects `secret.get()` (so a pre-set secret round-trips into the UI on render). `tab.containerEl.childElementCount` stays at 41 (no DOM additions). `npm run test:integration` green.

**junior-dev**

- [x] G1: Modify `GrimoireSettingTab` constructor in `src/ui/settings/GrimoireSettingTab.ts:21-34` to add required `secret: PortalSecret` parameter (after `plugin`, before `onSettingsSaved`). Store as `readonly #secret: PortalSecret`. Update `src/main.ts:108` callsite `new GrimoireSettingTab(this.app, this, ...)` to pass `this.secret` as the new arg in the correct position. — S, junior-dev (0e9a09f)
- [x] G2: In `#renderAdvancedSection` at `src/ui/settings/GrimoireSettingTab.ts:113-114`, change the `#addPasswordField` invocation's getter to `() => this.#secret.get()` and setter to `v => { this.#secret.set(v); }`. Do not change `#addPasswordField` itself — only the closures passed in. Description text stays. — S, junior-dev (0e9a09f)
- [x] G3: Update `tests/integration/settings-panel.spec.ts` `makePlugin` to construct a `PortalSecret` (via `new App()` whose mock now has `secretStorage` from D1) and pass it to `new GrimoireSettingTab(...)`. Adjust any existing assertion that touches `plugin.data.settings.portalAuthPassword` to instead check `secret.get()`. Confirm `tab.containerEl.childElementCount` assertion (currently 41) is unchanged. — M, junior-dev (0e9a09f)
- [x] G4: Add two new integration assertions in `tests/integration/settings-panel.spec.ts`: (a) typing into the password input via `__triggerChange('typed-pw')` results in `secret.get() === 'typed-pw'` and `plugin.data.settings.portalAuthPassword === ''`; (b) when `secret.set('preset')` is called before `tab.display()`, the rendered password input's `.value` is `'preset'` (initial value reflects secret on render). — S, junior-dev (0e9a09f)
- [x] G5: Edge case — empty string write. `__triggerChange('')` results in `secret.get() === ''`. — S, junior-dev (0e9a09f)

### H. Doc + lint sweep

#### Section briefing

1. **Produces:** no source files; verifies lint, arch:check, and `npm test` are all green. Updates the `GrimoireSettings.portalAuthPassword` JSDoc only if A1 was not sufficient.
2. **Methods produced:** none.
3. **Design context the executor needs upfront:** quality gates per `.claude/CLAUDE.md` — `lint → arch:check → test` is the pre-commit order. No new doc files written; live-spec creation is `/spec`'s job after `/done`.
4. **Cross-section couplings:** depends on every other section being complete.
5. **Section-level Red criterion:** `npm run lint && npm run arch:check && npm test && npm run test:integration` all green from a fresh checkout.

**junior-dev**

- [x] H1: Run `npm run lint` and fix any rule violations introduced by the new files. Do not disable any `obsidianmd/*` rules; fix code per CLAUDE.md memory note. — S, junior-dev (65e51ce)
- [x] H2: Run `npm run arch:check` to confirm no new architecture-fitness violations (the new `src/infra/PortalSecret.ts` and `src/infra/SecretMigrator.ts` should fit existing `infra/` module rules; if `dependency-cruiser` flags `infra → obsidian` as new, confirm an existing rule already allows it). — S, junior-dev (65e51ce)
- [x] H3: Run `npm test && npm run test:integration` and confirm green. — S, junior-dev (65e51ce)

## Deferred edge cases

Surfaced during planning, intentionally deferred (each is a separate iteration if it becomes a problem):

- **Multi-device drift.** Each device has its own secret store; if the user configures the password on desktop and then opens the vault on mobile, they will see "Portal password" empty in settings. Acceptable per Obsidian's documented model — secrets are per-device by design. No UX warning planned; users discover via 401 on first remote cast.
- **Migration on a vault where `data.json` was hand-edited to a non-empty password but `secretStorage` already has a *different* non-empty value.** The migrator's `clear-stale` branch handles this: secret-store value wins, plaintext is cleared. No conflict UI — silent precedence to the secret store.
- **Settings tab opened during the `await migrator.run()` window.** Practically impossible — `addSettingTab` runs after `await this.#loadPluginData()` returns. Noted for completeness.
- **`saveData` failure during migration leaves the secret set but plaintext present.** Next load detects `legacy non-empty` AND `secret already set` → `clear-stale` branch → another `saveData` attempt. Self-healing. No retry logic needed.
- **User uninstalls the plugin.** The secret remains in `app.secretStorage`. Obsidian provides no plugin-uninstall hook to clean it up. Out of scope — same limitation any plugin using `secretStorage` faces.
- **`SecretComponent` UI widget** (mentioned in Obsidian docs as available for `addComponent`). Not used — gives a "pick from existing secrets" dropdown that has no meaning when only one secret exists. If a future iteration adds a second secret, reconsider.

## Overall effort summary

- **Total todos:** 22 (A1–A2, B1–B4, C1–C6, D1, E1–E2, F1–F4, G1–G5, H1–H3)
- **Effort:** S × 18, M × 4, L × 0
- **Dev tiers:** junior-dev × 21, senior-dev × 1 (E1 — type-bridge + onload error handling)
- **No feature-detect fallback.** `minAppVersion: "1.11.4"` guarantees `app.secretStorage` is always present. `PortalSecret` has no conditional branch, no in-memory fallback, no `isPersistent()`.
- **No ui-integration-tester tier-group.** The user-visible behaviour change is "password field reads/writes through a different backing store" — same input, same render, same DOM structure. G section's integration assertions extend the existing `settings-panel.spec.ts`. Lean toward "no" per planner guidance: purely a backing-store swap, no new user-visible behavior.

reviewed @ 65e51ce
