import type { GrimoireSettings } from '../domain/settings/Settings';
import type { Caster } from '../execution/Caster';
import { LocalCaster } from './local/LocalCaster';
import { RemoteCaster } from './portal/RemoteCaster';

/**
 * Factory function that returns a caster instance based on the execution mode in settings.
 * Returns a RemoteCaster for remote execution, LocalCaster for local execution.
 */
export function createCaster(settings: GrimoireSettings, agentHooksDirAbs?: string): Caster {
  if (settings.executionMode === 'remote') {
    return new RemoteCaster({ settings });
  }
  return new LocalCaster({ settings, claudeHooksDirAbs: agentHooksDirAbs });
}
