# UI Integration Tests

> `dev/done-001` — 2026-05-05 — Pins the existing `src/ui/` behavior with an integration-test suite at the `CommandPopup` seam, run separately from unit tests via `npm run test:integration`.

## What it does

The repo now has a second test layer that exercises the Command Popup end-to-end at the modal/panel/detail seam, with no Obsidian runtime required. Every previously-shipped popup behavior — tab cycling, list filtering, selection wrapping and memory, spell- and sentinel-detail entry and exit, keyboard suspend/resume around the Forge form, and the modal-lifecycle reset on open/close — is now pinned by a test that fails loudly if a future refactor regresses it.

The suite is descriptive: it captures behavior as it stands at HEAD, including quirks (for example, the generic-sentinel exit path does not call `kb.resume()` because it never suspended). If a behavior is later judged wrong, it is fixed in a follow-up plan, not silently amended in a test.

`/done` runs the suite via the new `.claude/integration-test-cmd` marker file. Pre-commit and stop-guard hooks deliberately do not — integration tests are gated only at iteration close.

## Design decisions

- **happy-dom over jsdom.** Roughly 3× faster on the small-DOM workloads the suite produces, and supports everything the polyfill needs. Reversible — config swap is a one-liner.
- **Polyfill Obsidian's element extensions onto `HTMLElement.prototype` (test-only).** Production code calls `container.createEl(...)` directly; intercepting via a wrapper class would have meant touching `src/`. The polyfill is loaded only by the integration vitest config.
- **Rewrote `tests/__mocks__/obsidian.ts` instead of extending it.** The previous mock returned a fresh element on every `createEl` call, so DOM-state assertions across references were impossible. Retrofitting identity preservation was costlier than a clean rewrite.
- **Mock `Scope` dispatches LIFO.** Mirrors Obsidian's contract that the most recently registered handler wins, which is also what `KeyboardController.suspend()` + `resume()` relies on. Getting this wrong would silently green-light a broken implementation.
- **One harness — `createPopupHarness()` — for every test.** Per-suite custom harnesses would fragment the seam definition. New helpers attach to `PopupHarness`.
- **`ForgeSentinelDetail` gets both a focused component spec and integration coverage.** The focused spec pins focus and submit payload; the integration spec pins suspend/resume and back-button exit. Different seams, different specs.

## Scope

**In:**

- Test harness: real DOM (happy-dom), polyfilled Obsidian element extensions, a `Scope` mock with a callable LIFO registry.
- Integration specs covering tab cycling, spell- and sentinel-detail transitions, suspend/resume around the Forge form, search wiring, and modal lifecycle.
- One focused component spec for `ForgeSentinelDetail` (focus, submit, back).
- A `.claude/integration-test-cmd` consumed by `/done`.
- An `npm run test:integration` script and a separate `vitest.integration.config.ts`.

**Out:**

- Refactoring any production code under `src/` — the plan was explicit that test seams could not be added by editing source; if a seam is missing, that is a follow-up plan.
- Mutation-testing the new tests — separate cycle, different concern.
- Real-Obsidian end-to-end tests — would require a running vault, far outside this iteration's budget.
- Visual / CSS / layout assertions beyond class-list state (`is-selected`, `is-active`, `is-disabled`, `is-expanded`) — visual regression is a separate tooling concern.
- LogsPanel internals beyond what the popup integration already reaches — no second use case yet.

## Relationship to existing system

- Pins the behavior described by `docs/features/command-popup-ui.md`. That doc tells you what the UI does; this suite tells you what breaks if you change it.
- Reuses the existing `obsidian` alias from `vitest.config.ts`, but the integration config layers on `environment: 'happy-dom'` and the polyfill setup file. Unit tests stay node-only and untouched.
- Hooks into the `/done` flow via the global `.claude/integration-test-cmd` contract: present and green → `/done` proceeds; red → `/done` refuses with a re-plan message.
- Does not interact with the pre-commit or stop-guard hooks. Those continue to read `.claude/lint-cmd` and `.claude/test-cmd` only.

## Behavior changes

- **Test scope:** previously the project documented "integration tests with Obsidian APIs would require a different setup (out of scope for this scaffold)" — that is no longer true. Integration tests now exist via a mocked `obsidian` package plus happy-dom, and live under `tests/integration/`.
- **`/done` gate:** previously `/done` had nothing to run beyond unit tests in this repo (no `.claude/integration-test-cmd`); now it runs the integration suite as well. Reason: behavior pinned by tests is only useful if the iteration close enforces it.
