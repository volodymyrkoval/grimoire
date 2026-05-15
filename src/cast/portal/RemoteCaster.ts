import { requestUrl } from 'obsidian';
import type { GrimoireSettings } from '../../domain/settings/Settings';
import type { Caster, CastInput, CastCallbacks } from '../../execution/Caster';
import { FORGE_SPELL_PATH } from '../../castLog/types';
import { RemoteCastTransport } from './RemoteCastTransport';

/**
 * Caster implementation that executes spells remotely via a portal HTTP endpoint.
 * Adapts generic CastInput into RemoteCastTransport format and delegates to RemoteCastTransport.
 */
export class RemoteCaster implements Caster {
  readonly #transport: RemoteCastTransport;
  readonly #settings: GrimoireSettings;

  constructor({
    settings,
    transport,
  }: {
    settings: GrimoireSettings;
    transport?: RemoteCastTransport;
  }) {
    this.#transport = transport ?? new RemoteCastTransport({ requestUrlFn: requestUrl });
    this.#settings = settings;
  }

  /**
   * Execute a spell cast remotely via the portal endpoint.
   */
  cast(input: CastInput, callbacks: CastCallbacks): void {
    // The FORGE_SPELL_PATH sentinel ('<forge>') is a UI/cast-log marker, not a
    // real file on the portal server. Forwarding it as `spellPath` causes the
    // portal to attempt a file lookup and return 404. Strip it here so inline
    // forge casts are driven purely by `userPrompt` (which carries the
    // meta-spell). Local execution already ignores `spellPath` for forges.
    const wireSpellPath = input.spellPath === FORGE_SPELL_PATH ? undefined : input.spellPath;
    this.#transport.run(
      {
        castId: input.castId,
        spellPath: wireSpellPath,
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
