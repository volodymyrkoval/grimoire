import type { DataAdapter } from 'obsidian';
import type { CastLogEvent } from './types';
import type { RecordCastedInput, RecordErrorInput } from './CastLogWriter';
import type { CastLogMutator } from './CastLogMutator';
import type { Logger } from '../infra/Logger';
export type { RecordCastedInput, RecordErrorInput } from './CastLogWriter';

/**
 * File I/O and time operations for CastLogStore.
 * Defaults to Obsidian's DataAdapter if not provided.
 */
export interface CastLogStorePorts {
  getLogPathAbs: () => string;
  getAgentLogPathAbs?: () => string;
  appendLine?: (filePath: string, line: string) => Promise<void>;
  readFile?: (path: string, encoding: 'utf-8') => Promise<string>;
  now?: () => Date;
  adapter?: DataAdapter;
  logger?: Logger;
}

/**
 * Persists and reads cast log events from one or two files (local + optional remote).
 * Implements CastLogWriter, CastLogReader, and CastLogMutator interfaces.
 * Events are stored as newline-delimited JSON.
 */
export class CastLogStore implements CastLogMutator {
  readonly #ports: CastLogStorePorts;
  readonly #now: () => Date;
  readonly #appendLine: (filePath: string, line: string) => Promise<void>;
  readonly #readFile: (path: string, encoding: 'utf-8') => Promise<string>;
  readonly #adapter: DataAdapter | undefined;
  readonly #logger: Logger | undefined;

  constructor(ports: CastLogStorePorts) {
    this.#ports = ports;
    this.#now = ports.now ?? (() => new Date());
    this.#adapter = ports.adapter;
    this.#logger = ports.logger;
    const adapter = ports.adapter;
    this.#appendLine =
      ports.appendLine ??
      (async (filePath, line) => {
        const existing =
          adapter && (await adapter.exists(filePath)) ? await adapter.read(filePath) : '';
        await adapter!.write(filePath, existing + line);
      });
    this.#readFile =
      ports.readFile ??
      (async (filePath, _) => {
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

    if (this.#ports.getAgentLogPathAbs) {
      const remoteEvents = await this.#readFromFile(this.#ports.getAgentLogPathAbs());
      events.push(...remoteEvents);
    }

    return events;
  }

  /**
   * Returns list of configured log file paths (local + agent if present).
   */
  #configuredPaths(): string[] {
    const paths = [this.#ports.getLogPathAbs()];
    if (this.#ports.getAgentLogPathAbs) {
      paths.push(this.#ports.getAgentLogPathAbs());
    }
    return paths;
  }

  /**
   * Returns true if the given line's parsed castId exactly matches the target castId.
   * Returns false on parse failure, missing castId field, or non-match.
   */
  #lineMatchesCastId(line: string, castId: string): boolean {
    try {
      const parsed: unknown = JSON.parse(line);
      if (parsed && typeof parsed === 'object' && 'castId' in parsed) {
        return (parsed as Record<string, unknown>).castId === castId;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Reads a file, filters lines based on keepLine predicate, and writes back.
   * Handles trailing newline: empty result → write ''; non-empty result → append '\n'.
   * Missing file is a no-op.
   */
  async #rewriteFileLines(
    path: string,
    keepLine: (line: string) => boolean,
  ): Promise<void> {
    if (!this.#adapter) {
      return;
    }

    if (!(await this.#adapter.exists(path))) {
      return;
    }

    const content = await this.#adapter.read(path);
    const lines = content.split('\n');

    // Filter and remove empty strings, preserving non-empty lines
    const kept = lines.filter((line) => line !== '' && keepLine(line));

    let result: string;
    if (kept.length === 0) {
      result = '';
    } else {
      result = kept.join('\n') + '\n';
    }

    await this.#adapter.write(path, result);
  }

  /**
   * Empties a file by writing an empty string. Missing file is a no-op.
   */
  async #emptyFile(path: string): Promise<void> {
    if (!this.#adapter) {
      return;
    }

    if (!(await this.#adapter.exists(path))) {
      return;
    }

    await this.#adapter.write(path, '');
  }

  /**
   * Removes all lines from all configured log files whose castId matches the given value.
   * Unparseable and non-matching lines are preserved. Missing files are a no-op.
   */
  async deleteCast(castId: string): Promise<void> {
    for (const path of this.#configuredPaths()) {
      await this.#rewriteFileLines(path, (line) => !this.#lineMatchesCastId(line, castId));
    }
  }

  /**
   * Empties all configured log files. Missing files are a no-op.
   */
  async clearAll(): Promise<void> {
    for (const path of this.#configuredPaths()) {
      await this.#emptyFile(path);
    }
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

      this.#logger?.error(`Failed to read cast log from ${filePath}:`, error);
      return [];
    }
  }
}
