# Grimoire

A plugin for Obsidian.

## Development

```bash
npm install
npm run dev      # watch build + live reload
npm test         # run tests
npm run lint     # check code
```

## Quality gates

```bash
npm run test:mutate  # Stryker mutation testing
npm run arch:check   # Dependency architecture check
```

## Project structure

```
.
├── main.ts           # Plugin entry point
├── manifest.json     # Plugin metadata
├── styles.css        # Plugin styles
├── src/              # Source code
├── tests/            # Unit tests (vitest)
├── docs/             # Project documentation
└── .claude/          # TDD configuration
```
