module.exports = {
  forbidden: [
    {
      name: 'domain-no-obsidian',
      severity: 'error',
      from: { path: '^src/domain/' },
      to: { path: '^obsidian$' },
    },
    {
      name: 'domain-no-infra',
      severity: 'error',
      from: { path: '^src/domain/' },
      to: { path: '^src/infra/' },
    },
    {
      name: 'forge-no-castlog',
      severity: 'error',
      from: { path: '^src/forge/' },
      to: { path: '^src/castLog/' },
    },
    {
      name: 'cast-no-castlog',
      severity: 'error',
      from: { path: '^src/cast/' },
      to: { path: '^src/castLog/' },
    },
    {
      name: 'refine-no-castlog',
      severity: 'error',
      from: { path: '^src/refine/' },
      to: { path: '^src/castLog/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: {
      path: ['node_modules'],
    },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    cache: true,
  },
};
