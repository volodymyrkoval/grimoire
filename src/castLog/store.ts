// eslint-disable-next-line obsidianmd/no-nodejs-modules
import { appendFile } from 'node:fs/promises';
import type { CastedEvent, ErrorEvent } from './types';

export interface CastLogStorePorts {
  getLogPathAbs: () => string;
  appendLine?: (filePath: string, line: string) => Promise<void>;
  now?: () => Date;
}

export type RecordCastedInput = Omit<CastedEvent, 'stage' | 'ts'>;
export type RecordErrorInput = Omit<ErrorEvent, 'stage' | 'ts'>;

export class CastLogStore {
  readonly #ports: CastLogStorePorts;
  readonly #now: () => Date;
  readonly #appendLine: (filePath: string, line: string) => Promise<void>;

  constructor(ports: CastLogStorePorts) {
    this.#ports = ports;
    this.#now = ports.now ?? (() => new Date());
    this.#appendLine = ports.appendLine ?? ((filePath, line) => appendFile(filePath, line));
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
}
