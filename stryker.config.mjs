export default {
  mutate: ["src/**/*.{ts,tsx}", "!src/**/*.{test,spec}.{ts,tsx}"],
  testRunner: "vitest",
  checkers: ["typescript"],
  tsconfigFile: "tsconfig.json",
  incremental: true,
  coverageAnalysis: "perTest",
  thresholds: { high: 80, low: 60, break: 50 },
  reporters: ["clear-text", "html", "json"],
};
