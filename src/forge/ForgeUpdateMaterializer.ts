import { normalizePath, type DataAdapter } from 'obsidian';
import { renderForgeUpdateSystemPrompt, type ForgeUpdateSystemPromptInput } from './forgeUpdateTemplate';

/**
 * Write and filesystem operations for ForgeUpdateMaterializer.
 * Defaults to Obsidian's DataAdapter if not provided.
 */
export interface ForgeUpdateMaterializerPorts {
  getForgeUpdatePathAbs: () => string;
  getSettings: () => ForgeUpdateSystemPromptInput;
  writeFile?: (path: string, content: string) => Promise<void>;
  mkdir?: (dir: string) => Promise<void>;
  adapter?: DataAdapter;
}

/**
 * Generates and writes the forge-update system prompt file into the plugin directory.
 * The forge-update file is materialized on plugin load and on every settings save.
 */
export class ForgeUpdateMaterializer {
  readonly #ports: ForgeUpdateMaterializerPorts;
  readonly #writeFile: (path: string, content: string) => Promise<void>;
  readonly #mkdir: (dir: string) => Promise<void>;

  constructor(ports: ForgeUpdateMaterializerPorts) {
    this.#ports = ports;
    const adapter = ports.adapter;

    // Guard: ensure we have either adapter or explicit writeFile+mkdir ports
    if (!ports.writeFile && !ports.mkdir && !adapter) {
      throw new Error('ForgeUpdateMaterializer: provide either adapter or writeFile+mkdir ports');
    }

    this.#writeFile = ports.writeFile ?? (async (path, content) => {
      await adapter!.write(path, content);
    });
    this.#mkdir = ports.mkdir ?? ((dir) => adapter!.mkdir(dir));
  }

  /**
   * Generates the forge-update system prompt and writes it to the forge-update file path.
   */
  async run(): Promise<void> {
    const forgeUpdatePath = normalizePath(this.#ports.getForgeUpdatePathAbs());
    const settings = this.#ports.getSettings();

    // Extract parent directory from the forge-update path
    const parentDir = forgeUpdatePath.substring(0, forgeUpdatePath.lastIndexOf('/'));

    await this.#mkdir(parentDir);
    const content = renderForgeUpdateSystemPrompt(settings);
    await this.#writeFile(forgeUpdatePath, content);
  }
}
