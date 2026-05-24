import { describe, it } from 'vitest';
import type { CastLogMutator } from '../../src/castLog/CastLogMutator';

describe('CastLogMutator interface', () => {
  it('can be implemented by a class with deleteCast and clearAll', () => {
    class FakeMutator implements CastLogMutator {
      async deleteCast(_castId: string): Promise<void> {}
      async clearAll(): Promise<void> {}
    }
    // TypeScript error = test fails. No TypeScript error = interface is correct.
    const _: CastLogMutator = new FakeMutator();
  });
});
