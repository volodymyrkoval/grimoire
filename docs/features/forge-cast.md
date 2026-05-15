# Forge Cast

> `dev/done-003` — Wires the Forge sentinel form so submitting it actually authors a new spell file in the vault by spawning Claude Code with a meta-prompt.

## What it does

Selecting the **Forge** sentinel from the Command Popup opens a form (name, description, model, effort, "execute on active note" checkbox). On submit, the plugin sanitises the spell name, builds a meta-prompt that instructs Claude Code to write a new spell file, dismisses the popup, and spawns the CLI. Toasts surface progress: `Forging "<name>"…` immediately, then `Spell "<name>" forged` on success or `Forge failed: <stderrTail | exit N>` on failure. An empty-after-sanitise name short-circuits with `Spell name is invalid after sanitisation` and no spawn.

The forged spell file lands at `<forgeOutputFolder><name>.md` with frontmatter containing `tags: [<spellTag>]` and `grimoire-execute-on-note: <bool>` — the latter making the new spell scannable as note-bound or note-free per the user's toggle (see `spell-execute-on-note`).

## Key components

| Component | Location | Responsibility |
|---|---|---|
| `ForgeImprinter` | `src/forge/ForgeImprinter.ts` | Sanitise → build meta-spell → record cast → notify → close popup → invoke caster → notify result |
| `buildMetaSpell` | `src/forge/buildMetaSpell.ts` | Build the meta-prompt sent to Claude Code that authors a spell file |
| `sanitiseSpellName` | `src/forge/sanitiseSpellName.ts` | Strip illegal filename chars (`<>:"/\|?*` + control chars), collapse dashes, trim |
| `ForgeSentinelDetail` | `src/ui/components/ForgeSentinelDetail.ts` | Render the form (name, description, executeOnNote checkbox, model, effort), emit `ForgeFormSnapshot` |
| `Caster` (interface) + `LocalCaster` / `RemoteCaster` | `src/execution/`, `src/cast/local/`, `src/cast/portal/` | Mode-specific execution; see `cast-unification` |
| `CastRunner` + `CastSpawner` | `src/cast/local/` | Compose CLI binary + args, spawn subprocess (used internally by `LocalCaster`) |
| `ImprintAction` (callback) | `src/ui/CommandPopup.ts` | `(snapshot: ForgeFormSnapshot) => void` — popup-side seam, wired in `main.ts` |

## Data flow

```
Forge sentinel selected → CommandPopup.renderForgeSentinelDetail()
  → kb.suspend() + new ForgeSentinelDetail({ ..., callbacks.onSubmit })
  → user fills form, clicks Submit
  → onSubmit(ForgeFormSnapshot { name, description, model, effort, executeOnNote })
  → imprintAction(snapshot)  // closure built in main.ts
      → ForgeImprinter.imprint(snapshot, settings, close)
          ├── sanitiseSpellName → "" ? notify "invalid" + close + return
          ├── castId = generateId()           // see cast-log-foundation
          ├── logWriter.recordCasted({ castId, spellPath: "<forge>", … })   // fire-and-forget
          ├── buildMetaSpell({ ..., spellTag, forgeOutputFolder, vaultMountPath, executeOnNote })
          ├── notify `Forging "<sanitised>"…`           // remote: `…' on portal…`
          ├── close()                          // dismisses popup
          └── caster.cast({ castId, spellPath: "<forge>", userPrompt: metaSpell, modelId, effort, vaultMountPath }, callbacks)
                // LocalCaster spawns claude via CastRunner; RemoteCaster POSTs via RemoteCastTransport — see cast-unification
                → onAccepted({})        → local: notify `Spell "<sanitised>" forged`
                → onAccepted({ jobId }) → remote: second recordCasted with portalCastId (no toast)
                → onFailure(msg)        → logWriter.recordError({ castId, message }) + notify `Forge failed: <msg>` (local) or msg (remote)
  → CommandPopup.exitDetail() also runs after imprintAction returns (idempotent)
```

The meta-spell text instructs the LLM to wrap the body in the standard Spell Wrapper, set frontmatter `tags: [<spellTag>]` plus `grimoire-execute-on-note: <bool>`, and write to `<forgeOutputFolder><name>.md` (collision-renaming to `<name>-2.md`, `-3.md`, … if needed).

## How to trigger

1. Open the Command Popup (Obsidian command "Open Grimoire").
2. With the Spells tab active, navigate to the **Forge** sentinel row (`ArrowDown` past the spells, or type until the list is empty so the sentinel is auto-focused).
3. `Enter` opens the form. Fill in name + description, optionally pick a different model/effort, optionally untick "Execute on active note".
4. Click **Submit** (or press Enter on a focusable field that isn't the textarea). The popup closes and toasts fire.

## Edge cases / invariants

- **Empty/whitespace/all-illegal name** → `sanitiseSpellName` returns `""`; imprinter notifies `"Spell name is invalid after sanitisation"` and calls `close()` without spawning.
- **`vaultMountPath === ""`** → `buildCastArgs` skips `--add-dir`; cast may still succeed if Claude can resolve the file. No new validation UI.
- **`effort === null`** (Haiku-style) → meta-spell renders `Effort: n/a`; CLI args omit `--effort`.
- **Spawn failure** (binary missing, ENOENT, EACCES) → `CastSpawner` resolves `{ code: null, error, stderrTail }`; `CastRunner` routes to `onFailure(err.message)`, which `LocalCaster` forwards to the imprinter's `onFailure` callback; imprinter toasts `Forge failed: <msg>`.
- **Both `exit` and `error` fire** → `CastSpawner.safeResolve` ensures only the first wins (`fired` flag).
- **Double-call of popup teardown** → `imprinter.imprint` calls `close()`, then the popup wraps `imprintAction` and also calls `exitDetail()`. The second call is idempotent (`#onDetailBack` cleared on first call).
- **Settings live-read** → the `imprintAction` closure in `main.ts` dereferences `this.data.settings` on each submit; settings edits between popup opens take effect on the very next forge.
- **`executeOnNote` default** → checkbox starts checked; the LLM is instructed to write the chosen value into the new spell's frontmatter. Compliance is best-effort; if the LLM omits the key, the scanner defaults the spell to note-bound.
