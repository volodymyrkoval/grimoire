// eslint-disable-next-line obsidianmd/no-nodejs-modules
import { writeFile as fsWriteFile, mkdir as fsMkdir, chmod } from 'node:fs/promises';
// eslint-disable-next-line obsidianmd/no-nodejs-modules
import * as path from 'node:path';
import { renderSessionStartScript, renderPostToolUseScript, renderStopScript, renderSettingsJson } from './hookScripts';

export interface HookMaterializerPorts {
  getPluginDirAbs: () => string;
  getLogPathAbs: () => string;
  writeFile?: (filePath: string, content: string, mode?: number) => Promise<void>;
  mkdir?: (dir: string) => Promise<void>;
}

export class HookMaterializer {
  readonly #ports: HookMaterializerPorts;
  readonly #writeFile: (filePath: string, content: string, mode?: number) => Promise<void>;
  readonly #mkdir: (dir: string) => Promise<void>;

  constructor(ports: HookMaterializerPorts) {
    this.#ports = ports;

    // Default writeFile: write content then chmod if mode provided
    this.#writeFile = ports.writeFile ?? (async (filePath: string, content: string, mode?: number) => {
      await fsWriteFile(filePath, content, 'utf-8');
      if (mode !== undefined) await chmod(filePath, mode);
    });

    // Default mkdir: mkdir with { recursive: true }
    this.#mkdir = ports.mkdir ?? (async (dir: string) => {
      await fsMkdir(dir, { recursive: true });
    });
  }

  async run(): Promise<string> {
    const pluginDirAbs = this.#ports.getPluginDirAbs();
    const logPathAbs = this.#ports.getLogPathAbs();
    const hooksDir = path.join(pluginDirAbs, 'hooks');
    const scratchDirAbs = path.join(pluginDirAbs, 'cast-log-scratch');

    // Create hooks directory
    await this.#mkdir(hooksDir);

    // Construct script paths
    const sessionStartScriptAbs = path.join(hooksDir, 'session-start.sh');
    const postToolUseScriptAbs = path.join(hooksDir, 'post-tool-use.sh');
    const stopScriptAbs = path.join(hooksDir, 'stop.sh');
    const settingsJsonAbs = path.join(pluginDirAbs, 'settings.json');

    // Write scripts with mode 0o755
    await this.#writeFile(
      sessionStartScriptAbs,
      renderSessionStartScript({ logPathAbs }),
      0o755
    );

    await this.#writeFile(
      postToolUseScriptAbs,
      renderPostToolUseScript({ scratchDirAbs }),
      0o755
    );

    await this.#writeFile(
      stopScriptAbs,
      renderStopScript({ logPathAbs, scratchDirAbs }),
      0o755
    );

    // Write settings.json without mode
    await this.#writeFile(
      settingsJsonAbs,
      renderSettingsJson({ sessionStartScriptAbs, postToolUseScriptAbs, stopScriptAbs })
    );

    return settingsJsonAbs;
  }
}
