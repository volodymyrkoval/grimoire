# Dedicated MCP Config

> `dev/done-038` — 2026-05-28 — Adds a single settings field that, when non-empty, makes every local cast pass `--mcp-config <path> --strict-mcp-config` to `claude -p` — pinning the cast's MCP server set to exactly what the named file declares, independent of any ambient Claude Code scopes on the machine.

## What it does

A new **MCP config path** text row appears in the **General** section of the Grimoire settings tab, between **Binary path** and **Forge output folder**. It is a passive path entry: no file picker, no browse button, no validation. When the trimmed value is empty (the default), local casts behave exactly as before, inheriting whichever MCP servers `~/.claude.json`, project `.mcp.json`, and claude.ai connectors happen to provide. When the trimmed value is non-empty, every local cast appends two flags — `--mcp-config <path>` and `--strict-mcp-config` — to its `claude -p` invocation, so the cast sees only the servers declared in that file.

The two flags are atomic: appended together or not at all. Strict mode without the path is meaningless; the path without strict mode misses the point. The path string is passed verbatim — no `~` expansion, no `path.resolve`, no existence check. If the path is wrong, the cast fails the same way a bad binary path fails today, surfacing through the existing CLI-failure path with the CLI's stderr tail.

Remote casts (the portal path) are untouched: a local plugin-side path is meaningless on a remote host. The portal will address MCP config separately when its pitch lands.

## Design decisions

- **One knob, atomic two-flag append.** The pair is decided by a single `trim() !== ''` gate, never as two independent decisions. A future change that drops one flag without the other is pinned out by a unit test asserting the flags are consecutive with the path between them.
- **Verbatim path, no expansion or validation.** The gate trims; the value pushed to argv is raw. Trimming the pushed value would lie about what the user typed. Validation was explicitly rejected: same blast radius as a wrong binary path today, and a "Test MCP config" button is a No-Go in the source pitch.
- **No new module, no new abstraction.** A Strategy for "strict vs. ambient", a Builder for the argv array, and an Adapter for per-provider MCP flag passing were all rejected as speculative — the variation is one optional flag pair on a stable command shape, not two algorithms. The new branch sits next to the existing `--effort` and `--add-dir` tail-of-function conditionals and follows their shape line for line.
- **Whitespace-only treated as empty.** A path field is more likely to acquire stray whitespace through copy-paste than a vault-mount default, so the gate uses `trim()`, not bare `!== ''`. Without this, a stray space would silently turn on strict mode with an unresolvable path.
- **Field plumbed through the existing settings → caster → runner → builder chain.** No new transport, no new class. The duplicated object-literal in `LocalCaster.cast` (each branch lists the same eight settings keys) was noted as a pre-existing smell but deliberately not refactored — adding the one field to both branches matches how `echoOutput` was added in `dev/done-037` and keeps the diff surgical.
- **Append at the tail, after `--add-dir`.** Order does not matter to `claude`; consistency with neighbouring conditional pushes does. Tests assert adjacency and ordering of the pair, not absolute index positions.

## Scope

**In:**

- New `mcpConfigPath: string` field on `GrimoireSettings` (default `''`), persisted through the existing additive-merge hydration.
- New text row in the General section of the settings tab, reusing the existing `#addTextField` helper.
- Field threaded through `LocalCaster` → `CastRunner` → `buildCastArgs`; the rest-parameter destructure in `CastRunner.#getCastArgs` carries it forward without code change.
- Atomic two-flag append branch in `buildCastArgs` gated by `trim() !== ''`.
- README cross-reference: a new paragraph explaining the setting and a one-line clarification that the permissions allow-list's `mcp__<server>__*` entries must match the names declared in the user's MCP file when the setting is on — not what `claude mcp list` shows.
- Unit tests covering the empty / whitespace-only / non-empty / co-existence-with-other-flags cases, and one additional write-through assertion on the existing settings-panel integration seam.

**Out:**

- **File picker, browse button, or "Test config" button** — explicit No-Gos in the source pitch; passive path entry only, matching every other field in the tab.
- **Path validation, JSON parsing, `~` expansion, or `path.resolve`** — explicit No-Go; passed verbatim. A bad path surfaces as a CLI failure, identical to a bad binary path.
- **Grimoire-authored or Grimoire-bundled starter MCP file** — explicit No-Go; the plugin only points `claude` at a path the user controls.
- **Remote-cast / portal handling** — a local path is meaningless on a remote host; the portal will address its own MCP shape separately.
- **Per-spell override of the MCP config path** — out of scope this cycle; the empty-by-default vault-wide field is the right starting point. A separate pitch would extend `grimoire-casting` frontmatter if a use case emerges.
- **Per-provider generalisation** — only one provider exists today. When the adapter contract lands, "how MCP config is passed" becomes per-adapter; this plan conforms to that future shape but does not pre-empt it.
- **Migration logic** — the absent field hydrates to `''`, which is byte-identical to legacy behaviour. No version bump, no data migration step.
- **A sample MCP config snippet in the README** — deferred to the docs site; the README change is text-only and cross-references the new setting, not a JSON body.

## Relationship to existing system

- **Builds on** `settings-panel`: same `GrimoireSettings` field + `DEFAULT_SETTINGS` pattern, same `#addTextField` helper, same write-through-and-debounced-save contract, same additive-merge hydration.
- **Extends** the local-cast chain documented in `live-spells-and-casting` and `forge-cast` (`LocalCaster` → `CastRunner` → `buildCastArgs`): the same chain now carries one extra string with no behavioural effect when empty.
- **Mirrors** how `echoOutput` was threaded in `grimoire-show-cast-output-in-console` (`dev/done-037`): a single optional field added to both branches of `LocalCaster.cast` without refactoring the pre-existing duplicated-literal smell.
- **Does not interact with** the remote-cast path (`remote-casting`, `remote-casting-setup`) — the portal builds its own invocation on its own host.
- **Pairs with** the README's step-1 (MCP setup) and step-2 (permissions allow-list) onboarding: when the setting is on, the allow-list's `mcp__<server>__*` names must match the names declared in the user's MCP file, not what `claude mcp list` reports.

<!-- No `## Behavior changes` section: with the field empty (the default) every code path is byte-identical to before. The flags only appear when the user opts in by typing a path. -->
