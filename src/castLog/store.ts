import type { DataAdapter } from 'obsidian';
import type { CastedEvent, ErrorEvent, CastLogEvent } from './types';

export interface CastLogStorePorts {
  getLogPathAbs: () => string;
  getRemoteLogPathAbs?: () => string;
  appendLine?: (filePath: string, line: string) => Promise<void>;
  readFile?: (path: string, encoding: 'utf-8') => Promise<string>;
  now?: () => Date;
  adapter?: DataAdapter;
}

export type RecordCastedInput = Omit<CastedEvent, 'stage' | 'ts'>;
export type RecordErrorInput = Omit<ErrorEvent, 'stage' | 'ts'>;

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

  async recordCasted(input: RecordCastedInput): Promise<void> {
    const event = {
      stage: 'casted' as const,
      ts: this.#now().toISOString(),
      ...input,
    };
    await this.#appendLine(this.#ports.getLogPathAbs(), JSON.stringify(event) + '\n');
  }

  async recordError(input: RecordErrorInput): Promise<void> {
    const event = {
      stage: 'error' as const,
      ts: this.#now().toISOString(),
      ...input,
    };
    await this.#appendLine(this.#ports.getLogPathAbs(), JSON.stringify(event) + '\n');
  }

  async readAll(): Promise<CastLogEvent[]> {
    const events: CastLogEvent[] = [];

    // Read local file
    const localEvents = await this.#readFromFile(this.#ports.getLogPathAbs());
    events.push(...localEvents);

    // Read remote file if getter is defined
    if (this.#ports.getRemoteLogPathAbs) {
      const remoteEvents = await this.#readFromFile(this.#ports.getRemoteLogPathAbs());
      events.push(...remoteEvents);
    }

    return events;
  }

  async #readFromFile(filePath: string): Promise<CastLogEvent[]> {
    try {
      const content = await this.#readFile(filePath, 'utf-8');
      const events: CastLogEvent[] = [];

      const lines = content.split('\n');
      for (const line of lines) {
        // Skip empty lines
        if (!line.trim()) {
          continue;
        }

        // Parse JSON
        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          // Silently drop lines that fail JSON.parse
          continue;
        }

        // Validate required fields
        if (
          !parsed ||
          typeof parsed !== 'object' ||
          !('castId' in parsed) ||
          !('stage' in parsed)
        ) {
          // Drop lines missing castId or stage
          continue;
        }

        events.push(parsed as CastLogEvent);
      }

      return events;
    } catch (error) {
      // Treat ENOENT as empty
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as Record<string, unknown>).code === 'ENOENT'
      ) {
        return [];
      }

      // Log other errors and return empty
      console.error(`Failed to read cast log from ${filePath}:`, error);
      return [];
    }
  }
}
