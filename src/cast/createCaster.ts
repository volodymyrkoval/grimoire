import type { GrimoireSettings } from '../domain/settings/Settings';
import type { Caster } from '../execution/Caster';
import { LocalCaster } from './local/LocalCaster';
import { RemoteCaster } from './portal/RemoteCaster';

export function createCaster(settings: GrimoireSettings): Caster {
  if (settings.executionMode === 'remote') {
    return new RemoteCaster({ settings });
  }
  return new LocalCaster({ settings });
}
