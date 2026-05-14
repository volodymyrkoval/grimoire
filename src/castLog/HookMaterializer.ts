import { normalizePath, type DataAdapter } from 'obsidian';
import {
  renderSessionStartScript,
  renderPostToolUseScript,
  renderStopScript,
} from './hookScripts';

export interface HookMaterializerPorts {
  getPluginDirAbs: () => string;
  getLogPathAbs: () => string;
  writeFile?: (filePath: string, content: string, mode?: number) => Promise<void>;
  mkdir?: (dir: string) => Promise<void>;
  adapter?: DataAdapter;
}

export class HookMaterializer {
  static readonly SESSION_START_SCRIPT = 'session-start.sh';
  static readonly POST_TOOL_USE_SCRIPT = 'post-tool-use.sh';
  static readonly STOP_SCRIPT = 'stop.sh';
  static readonly HOOKS_DIR = 'hooks';
  static readonly SCRATCH_DIR = 'cast-log-scratch';

  readonly #ports: HookMaterializerPorts;
  readonly #writeFile: (filePath: string, content: string, mode?: number) => Promise<void>;
  readonly #mkdir: (dir: string) => Promise<void>;
  #hooksDir: string = '';

  constructor(ports: HookMaterializerPorts) {
    this.#ports = ports;
    const adapter = ports.adapter;
    this.#writeFile = ports.writeFile ?? (async (filePath, content, _mode) => {
      await adapter!.write(filePath, content);
    });
    this.#mkdir = ports.mkdir ?? ((dir) => adapter!.mkdir(dir));
  }

  async run(): Promise<void> {
    const pluginDirAbs = this.#ports.getPluginDirAbs();
    const logPathAbs = this.#ports.getLogPathAbs();
    this.#hooksDir = normalizePath(`${pluginDirAbs}/${HookMaterializer.HOOKS_DIR}`);
    const scratchDirAbs = normalizePath(`${pluginDirAbs}/${HookMaterializer.SCRATCH_DIR}`);

    await this.#ensureHooksDir();
    await this.#materializeScripts(logPathAbs, scratchDirAbs);
  }

  async #ensureHooksDir(): Promise<void> {
    await this.#mkdir(this.#hooksDir);
  }

  async #materializeScripts(logPathAbs: string, scratchDirAbs: string): Promise<void> {
    await this.#writeScript(HookMaterializer.SESSION_START_SCRIPT, renderSessionStartScript({ logPathAbs }));
    await this.#writeScript(HookMaterializer.POST_TOOL_USE_SCRIPT, renderPostToolUseScript({ scratchDirAbs }));
    await this.#writeScript(HookMaterializer.STOP_SCRIPT, renderStopScript({ logPathAbs, scratchDirAbs }));
  }

  async #writeScript(filename: string, content: string): Promise<void> {
    const scriptPath = normalizePath(`${this.#hooksDir}/${filename}`);
    await this.#writeFile(scriptPath, content, 0o755);
  }
}
