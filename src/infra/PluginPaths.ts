import { normalizePath } from 'obsidian';

/**
 * Encapsulates normalized paths to plugin directories and log files.
 *
 * Serves as a single authority for all paths the plugin needs: directories (plugin root,
 * agent hooks, scratch), log files (plugin-side and agent-side cast logs), and spell paths
 * (forge.md and refine.md). All paths are normalized via Obsidian's `normalizePath()`.
 * Both plugin-relative and vault-relative forms are provided where needed for different contexts.
 */
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

  /**
   * Returns the forge spell path relative to the plugin directory root.
   * To obtain the OS-level absolute path, prepend `vaultMountPath`.
   *
   * TODO: investigate whether forgeSpellPathPluginRel and forgeSpellPathVaultRel
   * should differ — plugin-relative and vault-relative paths are distinct concepts,
   * but both currently return the same value. One of them may be wrong.
   */
  forgeSpellPathPluginRel(): string {
    return normalizePath(`${this.#pluginDir}/forge.md`);
  }

  /**
   * Returns the forge spell path expressed relative to the vault root,
   * suitable for sending to the portal as `spellPath`.
   */
  forgeSpellPathVaultRel(): string {
    return normalizePath(`${this.#pluginDir}/forge.md`);
  }

  /**
   * Returns the refine spell path relative to the plugin directory root.
   * To obtain the OS-level absolute path, prepend `vaultMountPath`.
   *
   * TODO: investigate whether refineSpellPathPluginRel and refineSpellPathVaultRel
   * should differ — same concern as the forge pair above.
   */
  refineSpellPathPluginRel(): string {
    return normalizePath(`${this.#pluginDir}/refine.md`);
  }

  /**
   * Returns the refine spell path expressed relative to the vault root,
   * suitable for sending to the portal as `spellPath`.
   */
  refineSpellPathVaultRel(): string {
    return normalizePath(`${this.#pluginDir}/refine.md`);
  }
}
