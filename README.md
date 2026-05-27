# Grimoire

> A grimoire for your notes — reusable AI workflows you cast over your vault with a keystroke.

Grimoire turns reusable AI workflows into **spells**: ordinary vault notes carrying a prompt. Cast one against your active note with a keystroke and the plugin dispatches it to Claude Code as a background `claude -p` subprocess. Claude reads your vault, fetches the web, and writes results back through the Obsidian REST API — no copy-paste, no prompt retyping.

A spell is any markdown note tagged with your spell tag (default `grimoire/spell`). The plugin is a thin layer over the `claude` CLI, so spells are plain markdown you can also run straight from a terminal.

## Features

- **Cast spells** — fuzzy-search your library, `Enter` to cast against the active note, fire-and-forget.
- **Tune any cast** — per-cast model, effort, context notes, and a follow-up instruction; remember a default per spell.
- **Forge** — describe a task in plain English and let Claude author the spell file for you.
- **Refine** — a built-in spell that rewrites or expands the active note, with inline `@cast` directives for surgical edits. Search quality depends on which MCP server you mount — semantic-capable servers give richer results, but any Obsidian-aware server works out of the box.
- **Cast Log** — every cast, live, with status and duration.
- **Hotkeys** — jump to any spell with `Shift + letter`.
- **Remote casting** — optionally route casts to a portal server over HTTP, including from mobile.

## Getting started

Three steps. The [full setup guide](https://volodymyrkoval.github.io/grimoire-docs/start/prerequisites/) walks each one in detail — start there if anything below is unclear.

**1. Give spells access to your vault.** Install the [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) plugin and copy its API key from *Settings → Local REST API*. It ships a built-in MCP server; register that endpoint with Claude Code:

```sh
claude mcp add --transport http obsidian https://127.0.0.1:27124/mcp/ \
  --header "Authorization: Bearer <your-api-key>"
```

The plugin serves over HTTPS with a self-signed certificate — either trust it, or enable the plain-HTTP endpoint under *Settings → Local REST API*; see the [setup guide](https://volodymyrkoval.github.io/grimoire-docs/start/obsidian-mcp/) for both. If the MCP server is ever unavailable, spells fall back to filesystem access rooted at your configured vault mount path.

For best-case Refine search results, use a semantic-capable MCP server (e.g., [OpenAI](https://github.com/modelcontextprotocol/servers/tree/main/src/openai-mcp), [Anthropic](https://github.com/modelcontextprotocol/servers/tree/main/src/anthropic), or a custom embedding service). Grimoire's shipped scripts bind tools by capability rather than server name, so any Obsidian-aware MCP works — you're choosing between good (any server) and better (semantic-aware).

**2. Let casts run unattended.** Create `.claude/settings.local.json` in your **vault root** so Claude Code doesn't pause for permission on every tool call — a background cast has no terminal to answer them. The same file wires up cast-log progress tracking:

```json
{
  "permissions": {
    "allow": [
      "Bash(find:*)", "Bash(grep:*)", "Bash(ls:*)",
      "mcp__obsidian__vault_list",
      "mcp__obsidian__vault_read",
      "mcp__obsidian__vault_write",
      "mcp__obsidian__vault_patch",
      "mcp__obsidian__search_simple",
      "mcp__obsidian__search_query",
      "Read", "Edit", "Write", "MultiEdit", "WebFetch", "WebSearch"
    ],
    "deny": ["Bash(rm -rf *)"]
  },
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "sh .obsidian/plugins/grimoire/agent-hooks/session-start.sh" }] }
    ],
    "PostToolUse": [
      { "matcher": "Write|Edit|MultiEdit|NotebookEdit", "hooks": [{ "type": "command", "command": "sh .obsidian/plugins/grimoire/agent-hooks/post-tool-use.sh" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "sh .obsidian/plugins/grimoire/agent-hooks/stop.sh" }] }
    ]
  }
}
```

The `mcp__obsidian__*` entries must match the server name you registered in step 1 (`obsidian` above). The MCP tools are those exposed by Local REST API; trim or extend the list to what your spells actually use. Without the `permissions` block, casts stall; without `hooks`, the Cast Log shows only submitted/failed, never in-progress or done.

**3. Configure and cast.** Open *Settings → Grimoire* and set your Claude Code binary path (if `claude` isn't on your PATH) and vault mount path. Then open the command popup, pick a spell, and press `Enter`. Watch the **Logs** tab reach **Done**.

Power users can fork the built-in Refine spell into a custom variant: mark any vault note with `sentinel: refine` in its frontmatter, and it becomes a selectable Refine option in *Settings → Grimoire → Custom Refine spell*. Use this seam to inject MCP tools, vault-specific context, or a different writing style. See the [custom Refine guide](https://volodymyrkoval.github.io/grimoire-docs/features/custom-refine-spell/) for details.

## Requirements

- **Obsidian** desktop (macOS, Windows, or Linux) for local casting
- **Claude Code** — the `claude` CLI, on your PATH or set via Binary path
- An active **Anthropic API key**

> Local casting runs Claude Code on the same machine as Obsidian, so it is desktop-only and will remain so. Casting from mobile is possible through remote casting, which routes casts to a portal server over HTTP.

## Documentation

Full guides, feature reference, and the remote-casting / portal setup live at **[the documentation site](https://volodymyrkoval.github.io/grimoire-docs/)**.
