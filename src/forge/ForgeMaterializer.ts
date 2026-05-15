import { normalizePath, type DataAdapter } from 'obsidian';
import { renderForgeSystemPrompt, type ForgeSystemPromptInput } from './forgeTemplate';

/**
 * Write and filesystem operations for ForgeMaterializer.
 * Defaults to Obsidian's DataAdapter if not provided.
 */
export interface ForgeMaterializerPorts {
  getForgePathAbs: () => string;
  getSettings: () => ForgeSystemPromptInput;
  writeFile?: (path: string, content: string) => Promise<void>;
  mkdir?: (dir: string) => Promise<void>;
  adapter?: DataAdapter;
}

/**
 * Generates and writes the forge system prompt file into the plugin directory.
 * The forge file is materialized on plugin load and on every settings save.
 */
export class ForgeMaterializer {
  readonly #ports: ForgeMaterializerPorts;
  readonly #writeFile: (path: string, content: string) => Promise<void>;
  readonly #mkdir: (dir: string) => Promise<void>;

  constructor(ports: ForgeMaterializerPorts) {
    this.#ports = ports;
    const adapter = ports.adapter;

    // Guard: ensure we have either adapter or explicit writeFile+mkdir ports
    if (!ports.writeFile && !ports.mkdir && !adapter) {
      throw new Error('ForgeMaterializer: provide either adapter or writeFile+mkdir ports');
    }

    this.#writeFile = ports.writeFile ?? (async (path, content) => {
      await adapter!.write(path, content);
    });
    this.#mkdir = ports.mkdir ?? ((dir) => adapter!.mkdir(dir));
  }

  /**
   * Generates the forge system prompt and writes it to the forge file path.
   */
  async run(): Promise<void> {
    const forgePath = normalizePath(this.#ports.getForgePathAbs());
    const settings = this.#ports.getSettings();

    // Extract parent directory from the forge path
    const parentDir = forgePath.substring(0, forgePath.lastIndexOf('/'));

    await this.#mkdir(parentDir);
    const content = renderForgeSystemPrompt(settings);
    await this.#writeFile(forgePath, content);
  }
}
