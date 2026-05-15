# Spell `executeOnNote`

> `dev/done-006` — Per-spell boolean controlling whether a cast requires (and is prefixed with) the active note. Forged at spell-author time, stored in frontmatter, surfaced in the options panel, branched on by the dispatcher.

## What it does

Every spell now carries a boolean `executeOnNote`, sourced from its YAML frontmatter key `grimoire-execute-on-note`. The flag controls two dispatcher behaviors:

1. **Active-note guard.** When `executeOnNote === true` (default) and no note is active, dispatch toasts `Open a note to cast against` and bails. When `false`, the cast proceeds regardless of active-file state.
2. **User-prompt prefix.** When `executeOnNote === true` and a note is active, the user prompt is prefixed with `` `Execute this spell against the note at <vaultMountPath>/<activeFilePath>.` ``. When `false` (or no active file), the prefix is replaced by `Proceed with the execution according to the instructions`. Context notes and follow-up clauses, if present, append unchanged.

The flag flows through four layers — Forge UI sets it, the forge system prompt instructs the LLM to write it into the new spell's frontmatter (rendered by `renderForgeSystemPrompt` and surfaced by name through `buildForgeUserPrompt`; see `forge-spell-materialization`), `getSpells` reads it back at scan time, and the options panel surfaces a per-cast override checkbox seeded from the stored value.

## Key components

| Component | Location | Responsibility |
|---|---|---|
| `EXECUTE_ON_NOTE_KEY` | `src/domain/spells/Spell.ts` | The frontmatter key constant `'grimoire-execute-on-note'` |
| `Spell.executeOnNote` | `src/domain/spells/Spell.ts` | Boolean field on the `Spell` interface |
| `getSpells` | `src/domain/spells/spellScanner.ts` | Reads `frontmatter[EXECUTE_ON_NOTE_KEY]`; coerces non-strict-bool values to `true` |
| `renderForgeSystemPrompt` / `buildForgeUserPrompt` | `src/forge/forgeTemplate.ts`, `src/forge/buildForgeUserPrompt.ts` | System prompt emits step-3 frontmatter instruction `${EXECUTE_ON_NOTE_KEY}: <value>`; user prompt carries the per-cast `executeOnNote` value (see `forge-spell-materialization`) |
| `ForgeFormSnapshot.executeOnNote` | `src/forge/ForgeFormSnapshot.ts` | Forge form output field |
| `ForgeSentinelDetail` (checkbox) | `src/ui/components/ForgeSentinelDetail.ts` | "Execute on active note" checkbox, default checked |
| `OptionsFormSnapshot.executeOnNote` + `setExecuteOnNote` | `src/ui/options/OptionsFormState.ts` | Reactive per-cast override |
| `OptionsPanel` (checkbox) | `src/ui/options/OptionsPanel.ts` | "Execute on active note" checkbox, always visible, seeded from formState |
| `SpellOptionsDetail` | `src/ui/components/SpellOptionsDetail.ts` | Seeds form state with `sessionEntry?.executeOnNote ?? spell.executeOnNote` |
| `CastDispatchInput.executeOnNote` + `dispatch()` | `src/cast/CastDispatcher.ts` | Conditional bail and conditional prompt prefix |

## Data flow

```
Forge UI                                Spell file (vault)
ForgeSentinelDetail                     ---
  toggle (default true)  ── snapshot ─▶ tags: [<spellTag>]
  ForgeFormSnapshot                     grimoire-execute-on-note: true|false
    .executeOnNote                      ---
                                                     │
                                       forge system prompt instructs LLM
                                       to write the key (best-effort);
                                       missing → scanner defaults true
                                                     │
                                                     ▼ scan
                                       spellScanner.getSpells:
                                         eonValue === true  → true
                                         eonValue === false → false
                                         else (incl. 'false', 0)
                                                            → true
                                                     │
                                                     ▼ Spell.executeOnNote
Options panel                          CastDispatcher.dispatch:
SpellOptionsDetail                       if (executeOnNote && activeFilePath === null)
  seeds formState with                       → notify "Open a note…" + close + return
    sessionEntry?.eon                      userPrompt =
      ?? spell.executeOnNote                 executeOnNote && activeFilePath !== null
OptionsPanel                                   ? "Execute this spell against the note at `…`."
  checkbox bound to formState                  : "Proceed with the execution according to the instructions"
  Reset restores initial value           // context notes + follow-up append unchanged
                                         spawn CLI
```

The direct-cast path (Enter from the spell row) reads `spell.executeOnNote` directly. The options-panel path reads `snap.executeOnNote` from the form snapshot — both flow into `CastDispatchInput.executeOnNote` in `main.ts`.

## How to trigger

- **Forge time:** open the Forge sentinel form. The "Execute on active note" checkbox starts checked. Untick to forge a note-free spell. The new spell's frontmatter will (best-effort) carry `grimoire-execute-on-note: false`.
- **Cast time (per-cast override):** open the options panel for any spell (`ArrowRight` on a row). The "Execute on active note" checkbox is seeded from the spell's frontmatter (or last session value). Toggle and Cast — the override is session-scoped, not persisted to `SpellOverrideStore`.
- **Permanent change:** edit the spell's markdown file directly. The frontmatter is the single source of truth.

## Edge cases / invariants

- **Missing frontmatter key** — defaults to `true` (note-bound). Backward-compatible: every pre-iteration spell behaves unchanged.
- **Type coercion** — only strict `=== true` / `=== false` from Obsidian's YAML parser are honored. String `'false'`, number `0`, arrays, etc. all resolve to `true` (the default-on-invalid path). No console noise.
- **`executeOnNote === false` + `activeFilePath === null` + no context notes + no follow-up** — `#buildUserPrompt` emits the literal `'Proceed with the execution according to the instructions'` so the prompt is never empty.
- **`executeOnNote === false` + active file present** — the active-note prefix is still omitted; the flag wins over presence of an active file.
- **Per-cast override is session-only** — `OptionsFormSnapshot.executeOnNote` flows into `OptionsSessionEntry` (kept in `OptionsSessionMap`) but never into `SpellOverrideStore`, which remains a `model+effort` store by design.
- **Reset in options panel** — restores the value the panel was constructed with (the initial seed: session entry or spell frontmatter), not the spell's frontmatter unconditionally.
- **LLM compliance not guaranteed** — the forge system prompt *instructs* the LLM to write the frontmatter key; if the LLM omits it, the scanner defaults the spell to note-bound. Users may correct manually.
- **Spell file edited mid-session** — `Spell.executeOnNote` reflects the value at popup-open time (when `getSpells` last ran). The options panel reads from `Spell` once at construction; reopening the popup re-scans.
