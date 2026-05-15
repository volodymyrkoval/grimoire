import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RemoteCastTransport,
  type RemoteCastInput,
  type RemoteCastCallbacks,
} from '../../src/cast/portal/RemoteCastTransport';
import { buildBasicAuthHeader } from '../../src/cast/portal/buildBasicAuthHeader';

const baseInput: RemoteCastInput = {
  castId: 'cast-abc',
  spellPath: 'Spells/MySpell.md',
  userPrompt: 'Do the thing',
  modelId: 'claude-sonnet-4-5',
  effort: 'medium',
  portalHost: 'portal.example.com',
  portalPort: '',
  portalPath: '',
  portalAuthUser: 'alice',
  portalAuthPassword: 'secret',
};

function makeCallbacks(): { onAccepted: ReturnType<typeof vi.fn>; onFailure: ReturnType<typeof vi.fn> } & RemoteCastCallbacks {
  return {
    onAccepted: vi.fn(),
    onFailure: vi.fn(),
  };
}

function make202Response(castId = 'server-id') {
  return {
    status: 202,
    json: { castId, spellPath: 'x', status: 'accepted' },
    text: '',
  };
}

/** Drain the microtask queue after run() completes fire-and-forget promise. */
async function flushPromises() {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('RemoteCastTransport', () => {
  describe('URL construction', () => {
    it('builds correct URL from host with no port and no path', async () => {
      const capturedReqs: Array<{ url: string }> = [];
      const requestUrlFn = vi.fn().mockImplementation((req: { url: string }) => {
        capturedReqs.push(req);
        return Promise.resolve(make202Response());
      });

      const transport = new RemoteCastTransport({ requestUrlFn });
      const callbacks = makeCallbacks();
      transport.run(baseInput, callbacks);
      await flushPromises();

      expect(capturedReqs).toHaveLength(1);
      expect(capturedReqs[0].url).toBe('https://portal.example.com');
    });
  });

  describe('Authorization header', () => {
    it('sends correct Basic auth header', async () => {
      const capturedReqs: Array<Record<string, unknown>> = [];
      const requestUrlFn = vi.fn().mockImplementation((req: Record<string, unknown>) => {
        capturedReqs.push(req);
        return Promise.resolve(make202Response());
      });

      const transport = new RemoteCastTransport({ requestUrlFn });
      const callbacks = makeCallbacks();
      transport.run(baseInput, callbacks);
      await flushPromises();

      const headers = capturedReqs[0].headers as Record<string, string>;
      expect(headers['Authorization']).toBe(buildBasicAuthHeader('alice', 'secret'));
    });
  });

  describe('Request body', () => {
    it('sends body JSON matching cast fields', async () => {
      const capturedReqs: Array<Record<string, unknown>> = [];
      const requestUrlFn = vi.fn().mockImplementation((req: Record<string, unknown>) => {
        capturedReqs.push(req);
        return Promise.resolve(make202Response());
      });

      const transport = new RemoteCastTransport({ requestUrlFn });
      const callbacks = makeCallbacks();
      transport.run(baseInput, callbacks);
      await flushPromises();

      const bodyStr = capturedReqs[0].body as string;
      const parsed = JSON.parse(bodyStr);
      expect(parsed).toEqual({
        castId: 'cast-abc',
        spellPath: 'Spells/MySpell.md',
        userPrompt: 'Do the thing',
        model: 'claude-sonnet-4-5',
        effort: 'medium',
      });
    });
  });

  describe('202 with valid body', () => {
    it('calls onAccepted with portalCastId and never calls onFailure', async () => {
      const requestUrlFn = vi.fn().mockResolvedValue(make202Response('server-id'));

      const transport = new RemoteCastTransport({ requestUrlFn });
      const callbacks = makeCallbacks();
      transport.run(baseInput, callbacks);
      await flushPromises();

      expect(callbacks.onAccepted).toHaveBeenCalledOnce();
      expect(callbacks.onAccepted).toHaveBeenCalledWith({ portalCastId: 'server-id' });
      expect(callbacks.onFailure).not.toHaveBeenCalled();
    });
  });

  describe('401 response', () => {
    it('calls onFailure with credential error message and never calls onAccepted', async () => {
      const requestUrlFn = vi.fn().mockResolvedValue({ status: 401, json: {}, text: '' });

      const transport = new RemoteCastTransport({ requestUrlFn });
      const callbacks = makeCallbacks();
      transport.run(baseInput, callbacks);
      await flushPromises();

      expect(callbacks.onFailure).toHaveBeenCalledOnce();
      expect(callbacks.onFailure).toHaveBeenCalledWith(
        'Portal rejected credentials. Check your portal username and password in settings.',
      );
      expect(callbacks.onAccepted).not.toHaveBeenCalled();
    });
  });

  describe('500 with body', () => {
    it('calls onFailure with status and body text', async () => {
      const requestUrlFn = vi.fn().mockResolvedValue({ status: 500, json: {}, text: 'oh no' });

      const transport = new RemoteCastTransport({ requestUrlFn });
      const callbacks = makeCallbacks();
      transport.run(baseInput, callbacks);
      await flushPromises();

      expect(callbacks.onFailure).toHaveBeenCalledOnce();
      expect(callbacks.onFailure).toHaveBeenCalledWith('Portal returned 500: oh no.');
    });
  });

  describe('500 with empty body', () => {
    it('calls onFailure with fallback status text', async () => {
      const requestUrlFn = vi.fn().mockResolvedValue({ status: 500, json: {}, text: '' });

      const transport = new RemoteCastTransport({ requestUrlFn });
      const callbacks = makeCallbacks();
      transport.run(baseInput, callbacks);
      await flushPromises();

      expect(callbacks.onFailure).toHaveBeenCalledOnce();
      expect(callbacks.onFailure).toHaveBeenCalledWith('Portal returned 500: Internal Server Error.');
    });
  });

  describe('network error', () => {
    it('calls onFailure with host and error message', async () => {
      const requestUrlFn = vi.fn().mockRejectedValue(new Error('dns failure'));

      const transport = new RemoteCastTransport({ requestUrlFn });
      const callbacks = makeCallbacks();
      transport.run(baseInput, callbacks);
      await flushPromises();

      expect(callbacks.onFailure).toHaveBeenCalledOnce();
      expect(callbacks.onFailure).toHaveBeenCalledWith(
        "Couldn't reach portal at portal.example.com: dns failure.",
      );
      expect(callbacks.onAccepted).not.toHaveBeenCalled();
    });
  });

  describe('timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('calls onFailure with timeout message after 30 seconds', async () => {
      const requestUrlFn = vi.fn().mockReturnValue(new Promise(() => {}));

      const transport = new RemoteCastTransport({ requestUrlFn });
      const callbacks = makeCallbacks();
      transport.run(baseInput, callbacks);

      await vi.advanceTimersByTimeAsync(30_000);

      expect(callbacks.onFailure).toHaveBeenCalledOnce();
      expect(callbacks.onFailure).toHaveBeenCalledWith('Portal request timed out.');
      expect(callbacks.onAccepted).not.toHaveBeenCalled();
    });
  });

  describe('202 with malformed body', () => {
    it('calls neither callback and warns to console when castId field is missing', async () => {
      const requestUrlFn = vi.fn().mockResolvedValue({ status: 202, json: {}, text: '' });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const transport = new RemoteCastTransport({ requestUrlFn });
      const callbacks = makeCallbacks();
      transport.run(baseInput, callbacks);
      await flushPromises();

      expect(callbacks.onAccepted).not.toHaveBeenCalled();
      expect(callbacks.onFailure).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledOnce();

      warnSpy.mockRestore();
    });
  });
});
