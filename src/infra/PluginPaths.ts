import { normalizePath } from 'obsidian';

/** Encapsulates normalized paths to plugin directories and log files. */
export class PluginPaths {
  readonly #pluginDir: string;
  readonly #pluginLog: string;
  readonly #agentLog: string;
  readonly #scratch: string;

  constructor(pluginDir: string) {
    this.#pluginDir = normalizePath(pluginDir);
    this.#pluginLog = normalizePath(`${pluginDir}/cast-log-plugin.jsonl`);
    this.#agentLog = normalizePath(`${pluginDir}/cast-log-agent.jsonl`);
    this.#scratch = normalizePath(`${pluginDir}/cast-log-scratch`);
  }

  /** Returns the absolute path to the plugin directory. */
  pluginDirAbs(): string {
    return this.#pluginDir;
  }

  /** Returns the absolute path to the plugin cast log file (Obsidian-side events). */
  pluginLogPath(): string {
    return this.#pluginLog;
  }

  /** Returns the absolute path to the agent cast log file (Claude Code hook events). */
  agentLogPath(): string {
    return this.#agentLog;
  }

  /** Returns the absolute path to the cast log scratch directory. */
  scratchDir(): string {
    return this.#scratch;
  }

  /** Returns the absolute path to the agent-hooks directory (hook scripts for Claude Code agent sessions). */
  agentHooksDirAbs(): string {
    return normalizePath(`${this.#pluginDir}/agent-hooks`);
  }
}
