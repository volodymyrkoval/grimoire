module.exports = {
  extends: "eslint-plugin-import/flat/recommended",
  rules: {
    "no-circular": ["error", { severity: "error" }],
    "no-orphans": ["error", { severity: "error" }],
  },
  options: {
    doNotFollow: {
      path: ["node_modules"],
    },
    dependencyTypes: [
      "type",
      "type-only",
      "npm",
      "npm-dev",
      "npm-optional",
      "npm-peer",
      "npm-bundled",
      "require",
      "optional",
      "peer",
      "module",
      "local",
    ],
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    cache: true,
    reuseExistingCache: true,
  },
};
