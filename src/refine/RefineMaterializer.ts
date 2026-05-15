import { normalizePath, type DataAdapter } from 'obsidian';
import { renderRefineSystemPrompt } from './refineTemplate';

/**
 * Write and filesystem operations for RefineMaterializer.
 * Defaults to Obsidian's DataAdapter if not provided.
 */
export interface RefineMaterializerPorts {
  getRefinePathAbs: () => string;
  writeFile?: (path: string, content: string) => Promise<void>;
  mkdir?: (dir: string) => Promise<void>;
  adapter?: DataAdapter;
}

/**
 * Materializes the refine system prompt into the plugin directory on load.
 *
 * Generates the hardcoded refine.md file from `renderRefineSystemPrompt()` and writes it
 * to the plugin directory via either explicit ports (writeFile/mkdir) or Obsidian's DataAdapter.
 * Invariant: the refine.md file is re-generated on every plugin load to ensure up-to-date
 * system instructions are always in scope when refine casts are dispatched.
 */
export class RefineMaterializer {
  readonly #ports: RefineMaterializerPorts;
  readonly #writeFile: (path: string, content: string) => Promise<void>;
  readonly #mkdir: (dir: string) => Promise<void>;

  constructor(ports: RefineMaterializerPorts) {
    this.#ports = ports;
    const adapter = ports.adapter;

    // Guard: ensure we have either adapter or explicit writeFile+mkdir ports
    if (!ports.writeFile && !ports.mkdir && !adapter) {
      throw new Error('RefineMaterializer: provide either adapter or writeFile+mkdir ports');
    }

    this.#writeFile = ports.writeFile ?? (async (path, content) => {
      await adapter!.write(path, content);
    });
    this.#mkdir = ports.mkdir ?? ((dir) => adapter!.mkdir(dir));
  }

  /**
   * Generates the refine system prompt and writes it to the refine file path.
   */
  async run(): Promise<void> {
    const refinePath = normalizePath(this.#ports.getRefinePathAbs());

    // Extract parent directory from the refine path
    const parentDir = refinePath.substring(0, refinePath.lastIndexOf('/'));

    await this.#mkdir(parentDir);
    const content = renderRefineSystemPrompt();
    await this.#writeFile(refinePath, content);
  }
}
