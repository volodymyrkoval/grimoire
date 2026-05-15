import type { DataAdapter } from 'obsidian';
import type { CastLogEvent } from './types';
import type { RecordCastedInput, RecordErrorInput } from './CastLogWriter';
export type { RecordCastedInput, RecordErrorInput } from './CastLogWriter';

/**
 * File I/O and time operations for CastLogStore.
 * Defaults to Obsidian's DataAdapter if not provided.
 */
export interface CastLogStorePorts {
  getLogPathAbs: () => string;
  getRemoteLogPathAbs?: () => string;
  appendLine?: (filePath: string, line: string) => Promise<void>;
  readFile?: (path: string, encoding: 'utf-8') => Promise<string>;
  now?: () => Date;
  adapter?: DataAdapter;
}

/**
 * Persists and reads cast log events from one or two files (local + optional remote).
 * Implements CastLogWriter and CastLogReader interfaces via recordCasted/recordError and readAll.
 * Events are stored as newline-delimited JSON.
 */
export class CastLogStore {
  readonly #ports: CastLogStorePorts;
  readonly #now: () => Date;
  readonly #appendLine: (filePath: string, line: string) => Promise<void>;
  readonly #readFile: (path: string, encoding: 'utf-8') => Promise<string>;

  constructor(ports: CastLogStorePorts) {
    this.#ports = ports;
    this.#now = ports.now ?? (() => new Date());
    const adapter = ports.adapter;
    this.#appendLine = ports.appendLine ?? (async (filePath, line) => {
      const existing = adapter && (await adapter.exists(filePath)) ? await adapter.read(filePath) : '';
      await adapter!.write(filePath, existing + line);
    });
    this.#readFile = ports.readFile ?? (async (filePath, _) => {
      if (adapter && !(await adapter.exists(filePath))) {
        throw Object.assign(new Error(`ENOENT: ${filePath}`), { code: 'ENOENT' });
      }
      return adapter!.read(filePath);
    });
  }

  /**
   * Records a cast initiation event with timestamp.
   */
  async recordCasted(input: RecordCastedInput): Promise<void> {
    const event = {
      stage: 'casted' as const,
      ts: this.#now().toISOString(),
      ...input,
    };
    const path = this.#ports.getLogPathAbs();
    await this.#appendLine(path, JSON.stringify(event) + '\n');
  }

  /**
   * Records a cast error event with timestamp.
   */
  async recordError(input: RecordErrorInput): Promise<void> {
    const event = {
      stage: 'error' as const,
      ts: this.#now().toISOString(),
      ...input,
    };
    const path = this.#ports.getLogPathAbs();
    await this.#appendLine(path, JSON.stringify(event) + '\n');
  }

  /**
   * Reads all events from local and remote logs (if configured), returning them in order of appearance.
   */
  async readAll(): Promise<CastLogEvent[]> {
    const events: CastLogEvent[] = [];

    const localEvents = await this.#readFromFile(this.#ports.getLogPathAbs());
    events.push(...localEvents);

    if (this.#ports.getRemoteLogPathAbs) {
      const remoteEvents = await this.#readFromFile(this.#ports.getRemoteLogPathAbs());
      events.push(...remoteEvents);
    }

    return events;
  }

  /**
   * Reads and parses events from a single file, silently returning empty on ENOENT,
   * skipping malformed lines, and logging read errors.
   */
  async #readFromFile(filePath: string): Promise<CastLogEvent[]> {
    try {
      const content = await this.#readFile(filePath, 'utf-8');
      const events: CastLogEvent[] = [];

      const lines = content.split('\n');
      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }

        if (
          !parsed ||
          typeof parsed !== 'object' ||
          !('castId' in parsed) ||
          !('stage' in parsed)
        ) {
          continue;
        }

        events.push(parsed as CastLogEvent);
      }

      return events;
    } catch (error) {
      // ENOENT means the file doesn't exist yet — treat as empty log
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as Record<string, unknown>).code === 'ENOENT'
      ) {
        return [];
      }

      console.error(`Failed to read cast log from ${filePath}:`, error);
      return [];
    }
  }
}
