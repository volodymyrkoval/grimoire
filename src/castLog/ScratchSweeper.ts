import type { DataAdapter } from 'obsidian';

export interface ScratchSweeperPorts {
  getScratchDirAbs: () => string;
  readdir?: (dir: string) => Promise<string[]>;
  stat?: (filePath: string) => Promise<{ mtimeMs: number }>;
  unlink?: (filePath: string) => Promise<void>;
  now?: () => number;
  ttlMs?: number;
  adapter?: DataAdapter;
}

export class ScratchSweeper {
  #getScratchDirAbs: () => string;
  #readdir: (dir: string) => Promise<string[]>;
  #stat: (filePath: string) => Promise<{ mtimeMs: number }>;
  #unlink: (filePath: string) => Promise<void>;
  #now: () => number;
  #ttlMs: number;

  constructor(ports: ScratchSweeperPorts) {
    this.#getScratchDirAbs = ports.getScratchDirAbs;
    const adapter = ports.adapter;
    this.#readdir = ports.readdir ?? (async (dir) => {
      if (adapter && !(await adapter.exists(dir))) {
        throw Object.assign(new Error(`ENOENT: ${dir}`), { code: 'ENOENT' });
      }
      const listed = await adapter!.list(dir);
      return listed.files;
    });
    this.#stat = ports.stat ?? (async (filePath) => {
      const s = await adapter!.stat(filePath);
      if (!s) throw Object.assign(new Error(`ENOENT: ${filePath}`), { code: 'ENOENT' });
      return { mtimeMs: s.mtime };
    });
    this.#unlink = ports.unlink ?? ((filePath) => adapter!.remove(filePath));
    this.#now = ports.now ?? Date.now;
    this.#ttlMs = ports.ttlMs ?? 24 * 60 * 60 * 1000;
  }

  async sweep(): Promise<void> {
    const scratchDir = this.#getScratchDirAbs();
    const files = await this.#readScratchDir(scratchDir);
    if (!files) return;

    for (const filePath of files) {
      await this.#processFile(filePath);
    }
  }

  async #readScratchDir(scratchDir: string): Promise<string[] | null> {
    try {
      return await this.#readdir(scratchDir);
    } catch (error) {
      const err = error as { code?: string };
      if (err.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  #isExpired(mtimeMs: number): boolean {
    return this.#now() - mtimeMs > this.#ttlMs;
  }

  async #processFile(filePath: string): Promise<void> {
    try {
      const fileStat = await this.#stat(filePath);
      if (this.#isExpired(fileStat.mtimeMs)) {
        await this.#unlink(filePath);
      }
    } catch (error) {
      console.error(`Failed to process ${filePath}:`, error);
    }
  }
}
