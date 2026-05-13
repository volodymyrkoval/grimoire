// eslint-disable-next-line obsidianmd/no-nodejs-modules
import { readdir as fsReaddir, stat as fsStat, unlink as fsUnlink } from 'node:fs/promises';
// eslint-disable-next-line obsidianmd/no-nodejs-modules
import * as path from 'node:path';

export interface ScratchSweeperPorts {
  getScratchDirAbs: () => string;
  readdir?: (dir: string) => Promise<string[]>;
  stat?: (filePath: string) => Promise<{ mtimeMs: number }>;
  unlink?: (filePath: string) => Promise<void>;
  now?: () => number;
  ttlMs?: number;
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
    this.#readdir = ports.readdir ?? fsReaddir;
    this.#stat = ports.stat ?? fsStat;
    this.#unlink = ports.unlink ?? fsUnlink;
    this.#now = ports.now ?? Date.now;
    this.#ttlMs = ports.ttlMs ?? 24 * 60 * 60 * 1000;
  }

  async sweep(): Promise<void> {
    const scratchDir = this.#getScratchDirAbs();

    let files: string[];
    try {
      files = await this.#readdir(scratchDir);
    } catch (error) {
      const err = error as { code?: string };
      if (err.code === 'ENOENT') {
        return;
      }
      throw error;
    }

    const now = this.#now();

    for (const file of files) {
      const filePath = path.join(scratchDir, file);
      try {
        const fileStat = await this.#stat(filePath);
        if (now - fileStat.mtimeMs > this.#ttlMs) {
          await this.#unlink(filePath);
        }
      } catch (error) {
        console.error(`Failed to process ${filePath}:`, error);
      }
    }
  }
}
