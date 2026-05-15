import { normalizePath } from 'obsidian';

/** Encapsulates normalized paths to plugin directories and log files. */
export class PluginPaths {
  readonly #pluginDir: string;
  readonly #localLog: string;
  readonly #remoteLog: string;
  readonly #scratch: string;

  constructor(pluginDir: string) {
    this.#pluginDir = normalizePath(pluginDir);
    this.#localLog = normalizePath(`${pluginDir}/cast-log-local.jsonl`);
    this.#remoteLog = normalizePath(`${pluginDir}/cast-log-remote.jsonl`);
    this.#scratch = normalizePath(`${pluginDir}/cast-log-scratch`);
  }

  /** Returns the absolute path to the plugin directory. */
  pluginDirAbs(): string {
    return this.#pluginDir;
  }

  /** Returns the absolute path to the local cast log file. */
  localLogPath(): string {
    return this.#localLog;
  }

  /** Returns the absolute path to the remote cast log file. */
  remoteLogPath(): string {
    return this.#remoteLog;
  }

  /** Returns the absolute path to the cast log scratch directory. */
  scratchDir(): string {
    return this.#scratch;
  }
}
