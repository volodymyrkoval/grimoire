import { describe, it, expect } from 'vitest';
import type { CastLogWriter, RecordCastedInput, RecordErrorInput } from '../../src/castLog/CastLogWriter';

describe('CastLogWriter types', () => {
  it('exports the expected interface', () => {
    const _writer: CastLogWriter = {
      recordCasted: async (_input: RecordCastedInput) => {},
      recordError: async (_input: RecordErrorInput) => {},
    };
    expect(true).toBe(true);
  });
});
