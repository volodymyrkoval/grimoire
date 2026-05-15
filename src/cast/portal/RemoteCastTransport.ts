import type { Effort } from '../../domain/settings/Settings';
import { parsePortalScheme } from './parsePortalScheme';
import { buildPortalUrl } from './buildPortalUrl';
import { buildBasicAuthHeader } from './buildBasicAuthHeader';
import { buildPortalRequestBody } from './buildPortalRequestBody';
import { mapPortalError } from './mapPortalError';

const TIMEOUT_MS = 30_000;

/**
 * Local shims — mirror Obsidian's real types without importing from the obsidian package.
 */
export interface RequestUrlParam {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  throw?: boolean;
}

/**
 * HTTP response from the portal.
 * In production, Obsidian's real `.json` is a lazy getter that may throw if the body is not valid JSON.
 * This shim declares it as `unknown` for test convenience only — callers must not assume it is pre-parsed.
 */
export interface RequestUrlResponse {
  status: number;
  text: string;
  json: unknown;
}

/**
 * Input fields for a remote cast request.
 */
export interface RemoteCastInput {
  readonly castId: string;
  readonly spellPath: string;
  readonly userPrompt: string;
  readonly modelId: string;
  readonly effort: Effort | null;
  readonly portalHost: string;
  readonly portalPort: string;
  readonly portalPath: string;
  readonly portalAuthUser: string;
  readonly portalAuthPassword: string;
}

/**
 * Callbacks fired when a remote cast is accepted or fails.
 */
export interface RemoteCastCallbacks {
  onAccepted: (info: { portalCastId: string }) => void;
  onFailure: (msg: string) => void;
}

/**
 * Function signature for making HTTP requests to the portal (testable via dependency injection).
 */
export type RequestUrlFn = (req: RequestUrlParam) => Promise<RequestUrlResponse>;

/**
 * Coordinates a remote cast: builds the request (URL, headers, body), sends it via Obsidian's requestUrl,
 * handles timeouts and errors, and reports results via callbacks.
 * A 202 response with castId is treated as accepted; 202 without castId is silent (no callback).
 */
export class RemoteCastTransport {
  readonly #requestUrlFn: RequestUrlFn;

  constructor(deps?: { requestUrlFn?: RequestUrlFn }) {
    this.#requestUrlFn = deps?.requestUrlFn ?? (() =>
      Promise.reject(new Error('requestUrl not injected'))
    );
  }

  /**
   * Fire a remote cast request asynchronously.
   */
  run(input: RemoteCastInput, callbacks: RemoteCastCallbacks): void {
    void this.#execute(input, callbacks);
  }

  async #execute(input: RemoteCastInput, callbacks: RemoteCastCallbacks): Promise<void> {
    const parsedScheme = parsePortalScheme(input.portalHost);
    const url = buildPortalUrl({ parsedScheme, port: input.portalPort, path: input.portalPath });
    const authHeader = buildBasicAuthHeader(input.portalAuthUser, input.portalAuthPassword);
    const body = buildPortalRequestBody({
      castId: input.castId,
      spellPath: input.spellPath,
      userPrompt: input.userPrompt,
      modelId: input.modelId,
      effort: input.effort,
    });

    let timeoutId: ReturnType<typeof activeWindow.setTimeout> | undefined;

    const timeoutPromise = new Promise<{ kind: 'timeout' }>((resolve) => {
      timeoutId = activeWindow.setTimeout(() => resolve({ kind: 'timeout' }), TIMEOUT_MS);
    });

    const requestPromise: Promise<
      { kind: 'response'; response: RequestUrlResponse } | { kind: 'network'; error: Error }
    > = this.#requestUrlFn({
      url,
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body,
      throw: false,
    })
      .then((response) => ({ kind: 'response' as const, response }))
      .catch((error) => ({
        kind: 'network' as const,
        error: error instanceof Error ? error : new Error(String(error)),
      }));

    const result = await Promise.race([requestPromise, timeoutPromise]);

    activeWindow.clearTimeout(timeoutId);

    if (result.kind === 'timeout') {
      callbacks.onFailure(mapPortalError({ kind: 'timeout' }).notice);
      return;
    }

    if (result.kind === 'network') {
      callbacks.onFailure(
        mapPortalError({ kind: 'network', message: result.error.message, host: input.portalHost }).notice,
      );
      return;
    }

    const { response } = result;

    if (response.status === 202) {
      const json = response.json;
      if (
        typeof json === 'object' &&
        json !== null &&
        typeof (json as Record<string, unknown>).castId === 'string'
      ) {
        callbacks.onAccepted({ portalCastId: (json as Record<string, unknown>).castId as string });
      } else {
        console.warn('RemoteCastTransport: 202 response missing castId field');
      }
      return;
    }

    if (response.status === 401) {
      callbacks.onFailure(mapPortalError({ kind: 'http', status: 401, body: '' }).notice);
      return;
    }

    callbacks.onFailure(
      mapPortalError({ kind: 'http', status: response.status, body: response.text ?? '' }).notice,
    );
  }
}
