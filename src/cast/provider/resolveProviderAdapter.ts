import { CLAUDE_CODE, type Provider } from '../../domain/settings/Provider';
import type { Logger } from '../../infra/Logger';

/**
 * Identifies which provider handles a cast. Has no methods — it is a pure
 * data token, not a strategy. Behavior lives in the caster layer.
 */
export interface ProviderAdapter {
  readonly provider: Provider;
}

const claudeCodeAdapter: ProviderAdapter = { provider: CLAUDE_CODE };

// Registry of known provider adapters, keyed by Provider brand value.
const PROVIDER_ADAPTERS = new Map<Provider, ProviderAdapter>([[CLAUDE_CODE, claudeCodeAdapter]]);

/**
 * Returns the {@link ProviderAdapter} for the given provider.
 * Falls back to the claude-code adapter when the provider is unregistered.
 */
export function resolveProviderAdapter(p: Provider, logger?: Logger): ProviderAdapter {
  const adapter = PROVIDER_ADAPTERS.get(p);
  if (adapter === undefined) {
    logger?.warn(`[grimoire] resolveProviderAdapter: unknown provider "${p}", falling back to claude-code`);
    return claudeCodeAdapter;
  }
  return adapter;
}
