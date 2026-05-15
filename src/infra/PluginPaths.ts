import { normalizePath } from 'obsidian';

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

  pluginDirAbs(): string {
    return this.#pluginDir;
  }

  localLogPath(): string {
    return this.#localLog;
  }

  remoteLogPath(): string {
    return this.#remoteLog;
  }

  scratchDir(): string {
    return this.#scratch;
  }
}
