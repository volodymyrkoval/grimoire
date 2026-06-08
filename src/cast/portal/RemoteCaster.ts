import { requestUrl } from 'obsidian';
import type { GrimoireSettings } from '../../domain/settings/Settings';
import type { Caster, CastInput, CastCallbacks } from '../../execution/Caster';
import { RemoteCastTransport } from './RemoteCastTransport';
import type { PortalSecret } from '../../infra/PortalSecret';

/**
 * Caster implementation that executes spells remotely via a portal HTTP endpoint.
 * Adapts generic CastInput into RemoteCastTransport format and delegates to RemoteCastTransport.
 */
export class RemoteCaster implements Caster {
  readonly #transport: RemoteCastTransport;
  readonly #settings: GrimoireSettings;
  readonly #secret: PortalSecret;

  constructor({
    settings,
    secret,
    transport,
  }: {
    settings: GrimoireSettings;
    secret: PortalSecret;
    transport?: RemoteCastTransport;
  }) {
    this.#transport = transport ?? new RemoteCastTransport({ requestUrlFn: requestUrl });
    this.#settings = settings;
    this.#secret = secret;
  }

  /**
   * Execute a spell cast remotely via the portal endpoint.
   */
  cast(input: CastInput, callbacks: CastCallbacks): void {
    this.#transport.run(
      {
        castId: input.castId,
        spellPath: input.spellPath,
        userPrompt: input.userPrompt,
        modelId: input.modelId,
        effort: input.effort,
        provider: input.provider,
        portalHost: this.#settings.portalHost,
        portalPort: this.#settings.portalPort,
        portalPath: this.#settings.portalPath,
        portalAuthUser: this.#settings.portalAuthUser,
        portalAuthPassword: this.#secret.get(),
      },
      {
        // 202 without castId: transport fires nothing; RemoteCaster preserves that silence — see RemoteCastTransport.ts
        onAccepted: ({ portalCastId }) => callbacks.onAccepted({ jobId: portalCastId }),
        onFailure: (msg) => callbacks.onFailure(msg),
      },
    );
  }
}
