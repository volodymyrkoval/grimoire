import { describe, it, expect } from 'vitest';
import { resolveProviderAdapter } from '../../../src/cast/provider/resolveProviderAdapter';
import { CLAUDE_CODE, provider } from '../../../src/domain/settings/Provider';

describe('resolveProviderAdapter', () => {
  it('returns an adapter with provider === CLAUDE_CODE when given CLAUDE_CODE', () => {
    const adapter = resolveProviderAdapter(CLAUDE_CODE);
    expect(adapter.provider).toBe(CLAUDE_CODE);
  });

  it('returns the claude-code adapter as fallback for an unregistered provider', () => {
    const unknown = provider('unknown-provider');
    const adapter = resolveProviderAdapter(unknown);
    expect(adapter.provider).toBe(CLAUDE_CODE);
  });
});
