# Remote Casting Setup

> `dev/done-011` — 2026-05-14 — Adds the settings surface for remote casting — one execution-mode toggle plus five portal connection fields — and pins them as a read-API. No dispatch wiring at the time of this iteration; dispatch landed in `dev/done-012` (see `remote-casting`).

## What it does

The Grimoire settings tab grows an **Advanced** section, separated from the existing rows by a horizontal rule and an `Advanced` heading. Inside it sits a **Remote execution** toggle and five text fields describing a portal endpoint: host, port, path, auth user, and auth password. The password row is masked (`input type="password"`). Every control writes through to `plugin.data.settings.*` and persists via the existing debounced saver — exactly like the seven original rows.

At the time of this iteration, nothing else changed for the user — casting still ran locally regardless of the toggle's position, and the fields were a read-only API. The follow-up `remote-casting` iteration (`dev/done-012`) wired the toggle to a portal-dispatch path.

## Design decisions

- **`executionMode` is a string-literal union (`'local' | 'remote'`), not a boolean.** Leaves room for a third dispatch path (e.g. `'queued'`) without a data migration; widget choice (toggle today, segmented control later) stays open.
- **`portalPort` is a `string`, not a `number`.** Every other text-input setting is a string; parsing belongs at the URL-construction site, not at the settings tab.
- **All Advanced fields render unconditionally.** No conditional rendering based on toggle state — avoids the UX trap of "where did my saved fields go when I toggled off."
- **Password masking via `input.type = 'password'`** on the existing `TextComponent.inputEl`. No new component class.
- **Heading + divider are plain DOM (`<hr>`, `<h3>`)**, not `Setting.setHeading()`. The current code never uses `setHeading`; mocking it would expand the test surface for no gain.
- **`hydrate` is unchanged.** `Object.assign(DEFAULT_SETTINGS, …)` already covers additive fields; tests pin the behaviour, no source change.
- **No defaults-migration code.** Existing users get `executionMode: 'local'` and empty portal fields through the merge.

## Scope

**In:**

- Six new fields on `GrimoireSettings` with `DEFAULT_SETTINGS` extended in lockstep — `executionMode`, `portalHost`, `portalPort`, `portalPath`, `portalAuthUser`, `portalAuthPassword`.
- An `Advanced` section in `GrimoireSettingTab` with `<hr>`, an `Advanced` heading, the toggle, and the five portal rows.
- Mock parity: `ToggleComponent` shim and `Setting.addToggle` in the Obsidian mock, mirroring the existing `TextComponent` / `DropdownComponent` pattern.
- Hydrate-coverage tests pinning round-trip and additive-merge for the new fields.
- Integration assertions pinning the new row count, DOM order, toggle write-through, and password input type.

**Out:**

- URL construction, HTTP scheme field, dispatch wiring — separate iteration; the read API is the seam.
- *Test connection* button — premature without dispatch.
- Conditional rendering or collapsible Advanced section — pitch explicitly rejects, to keep saved fields visible regardless of toggle state.
- OS-keychain integration — plain plugin-data storage matches the rest of the settings model; accepted for v1.
- Validation of port range, hostname syntax, path leading slash — passive validation matches the rest of the tab.
- Coercion of unknown `executionMode` values loaded from disk — deferred for the same reason as `defaultModel` coercion in `settings-panel`.

## Relationship to existing system

- **Builds on** `settings-panel` (`docs/features/settings-panel.md`) — same write-through and debounced-save contract, same Obsidian mock pattern, same integration-test harness.
- **Mirrors** the additive-merge hydration documented in `settings-panel` — new fields take defaults for blobs saved before this iteration.
- **Locks the names** that the follow-up "remote casting dispatch" iteration will read from `plugin.data.settings.*` — a small read-API smoke test guards rename drift.
- **Forward-references** the existing `cast-log-remote.jsonl` reserved path in `cast-log-foundation` — nothing yet writes that file; this iteration brings dispatch one step closer.

## Behavior changes

- **Settings tab structure:** previously seven rows, no section heading. Now seven rows, then `<hr>`, then an `Advanced` heading, then the toggle and five portal rows. Reason: the new fields are advanced and should not interrupt the primary configuration flow.
- **Settings tab DOM child count:** previously fourteen children (7 rows × 2 elements each), pinned by integration test. Now twenty-eight (13 rows × 2, plus the `<hr>` and `<h3>`). Reason: mechanical consequence of the new section; the spec test was updated in the same iteration.
- **Mock surface:** previously no toggle shim. Now `ToggleComponent` and `Setting.addToggle` are part of the mocked Obsidian API, available to any future settings-tab seam test. Reason: the toggle is the first non-text non-dropdown widget used by the plugin.

## Plan / shipped disagreements

The archived plan and the squashed commit disagree on two surface details. Recorded here so the live spec doesn't quietly pick a side:

- **Toggle placement.** Plan: toggle is the *first* row of the tab, above the seven existing rows. Shipped: toggle is the *first* row of the Advanced section, after the heading. The shipped layout keeps all remote-casting controls grouped together; the rest of the spec describes shipped behaviour.
- **Toggle label.** Plan: `Execution mode`. Shipped: `Remote execution`, with a description (`Send spells to a portal server instead of running them locally.`). The shipped label reads as a feature name rather than a generic mode selector.
