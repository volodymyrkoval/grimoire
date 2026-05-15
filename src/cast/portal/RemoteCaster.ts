import { requestUrl } from 'obsidian';
import type { GrimoireSettings } from '../../domain/settings/Settings';
import type { Caster, CastInput, CastCallbacks } from '../../execution/Caster';
import { RemoteCastTransport } from './RemoteCastTransport';

export class RemoteCaster implements Caster {
  readonly #transport: RemoteCastTransport;
  readonly #settings: GrimoireSettings;

  constructor({ settings, transport }: { settings: GrimoireSettings; transport?: RemoteCastTransport }) {
    this.#transport = transport ?? new RemoteCastTransport({ requestUrlFn: requestUrl });
    this.#settings = settings;
  }

  cast(input: CastInput, callbacks: CastCallbacks): void {
    this.#transport.run(
      {
        castId: input.castId,
        spellPath: input.spellPath,
        userPrompt: input.userPrompt,
        modelId: input.modelId,
        effort: input.effort,
        portalHost: this.#settings.portalHost,
        portalPort: this.#settings.portalPort,
        portalPath: this.#settings.portalPath,
        portalAuthUser: this.#settings.portalAuthUser,
        portalAuthPassword: this.#settings.portalAuthPassword,
      },
      {
        // 202 without castId: transport fires nothing; RemoteCaster preserves that silence — see RemoteCastTransport.ts
        onAccepted: ({ portalCastId }) => callbacks.onAccepted({ jobId: portalCastId }),
        onFailure: (msg) => callbacks.onFailure(msg),
      },
    );
  }
}
