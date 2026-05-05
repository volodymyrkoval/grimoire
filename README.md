# Grimoire

A keyboard-first Obsidian plugin that lets you browse, search, and cast reusable Claude Code agent instructions ("spells") without leaving your current note.

## What it does

**Spells** are vault notes tagged `--claude-code/instruction`. Grimoire surfaces them in a Command Popup where you can filter, select, and execute them via `claude -p` in the background.

**Sentinels** are two built-in entries always present at the bottom of the spell list:

- **Forge** — author a new spell from a plain-English description
- **Refine** — context-aware rewriter for the active note

## Installation (developer / contributor)

1. Clone this repo into your vault's plugin folder:
   ```
   <vault>/.obsidian/plugins/grimoire/
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the watch build:
   ```bash
   npm run dev
   ```
4. In Obsidian: **Settings → Community plugins → Grimoire → Enable**

## Usage

| Action | How |
|---|---|
| Open Command Popup | Bound hotkey, or Command Palette → "Open Grimoire" |
| Filter spells | Type in the search input |
| Move selection | `ArrowDown` / `ArrowUp` |
| Switch to Logs tab | `Tab` |
| Cast / open detail | `Enter` on a spell row |
| Open Forge form | `Enter` on the Forge sentinel |
| Go back / close popup | `Escape` (walks back one layer) |

## Development

```bash
npm install
npm run dev              # watch build + live reload
npm test                 # run unit tests
npm run test:integration # run UI integration tests (happy-dom + mocked obsidian)
npm run lint             # check code
```

## Quality gates

```bash
npm run test:mutate  # Stryker mutation testing
npm run arch:check   # Dependency architecture check
```

## Project structure

```
.
├── src/
│   ├── main.ts                  # Plugin entry point (GrimoirePlugin)
│   ├── ui/
│   │   ├── CommandPopup.ts      # Modal: search + detail phases
│   │   ├── KeyboardController.ts
│   │   ├── TypedEmitter.ts
│   │   ├── SpellEvents.ts
│   │   ├── SegmentedControl.ts  # Keyboard-navigable button group
│   │   ├── components/          # SearchInput, TabBar, ForgeSentinelDetail, …
│   │   ├── tabs/                # TabPanel interface, SpellsPanel, LogsPanel
│   │   ├── widgets/             # EffortRow (model-aware effort selector)
│   │   ├── options/             # OptionsFormState, OptionsSessionMap, OptionsSnapshot
│   │   └── settings/            # GrimoireSettingTab (Obsidian Settings panel)
│   ├── domain/
│   │   ├── spells/              # Spell, Sentinel, SpellPath types
│   │   ├── logs/                # Log type and placeholder data
│   │   └── settings/            # Settings, hydrate, SpellOverrideStore, …
│   └── infra/
│       └── DebouncedSaver.ts    # 500 ms debounce + flush
├── tests/                       # Unit tests (vitest)
│   └── integration/             # UI integration tests (happy-dom, mocked obsidian)
├── docs/
│   └── features/                # Live feature specs
├── manifest.json                # Obsidian plugin metadata
├── styles.css                   # Plugin styles
└── .claude/                     # TDD configuration
```
