import type { GrimoireSettings } from '../domain/settings/Settings';
import type { Caster } from '../execution/Caster';
import { LocalCaster } from './local/LocalCaster';
import { RemoteCaster } from './portal/RemoteCaster';
import type { PortalSecret } from '../infra/PortalSecret';
import type { Logger } from '../infra/Logger';

/**
 * Factory function that returns a caster instance based on the execution mode in settings.
 * Returns a RemoteCaster for remote execution, LocalCaster for local execution.
 */
export function createCaster(
  settings: GrimoireSettings,
  secret: PortalSecret,
  agentHooksDirAbs?: string,
  logger?: Logger,
): Caster {
  if (settings.executionMode === 'remote') {
    return new RemoteCaster({ settings, secret, logger });
  }
  return new LocalCaster({ settings, claudeHooksDirAbs: agentHooksDirAbs, logger });
}
