import { describe, it, expect } from 'vitest';
import { mapPortalError } from '../../../src/cast/portal/mapPortalError';

describe('mapPortalError', () => {
  it('maps timeout error', () => {
    const result = mapPortalError({ kind: 'timeout' });
    expect(result).toEqual({
      notice: 'Portal request timed out.',
      logEvent: 'error',
    });
  });

  it('maps network error with message and host', () => {
    const result = mapPortalError({
      kind: 'network',
      message: 'dns failure',
      host: 'portal.example.com',
    });
    expect(result).toEqual({
      notice: "Couldn't reach portal at portal.example.com: dns failure.",
      logEvent: 'error',
    });
  });

  it('maps 401 HTTP error', () => {
    const result = mapPortalError({
      kind: 'http',
      status: 401,
      body: '',
    });
    expect(result).toEqual({
      notice: 'Portal rejected credentials. Check your portal username and password in settings.',
      logEvent: 'error',
    });
  });

  it('maps 500 HTTP error with body', () => {
    const result = mapPortalError({
      kind: 'http',
      status: 500,
      body: 'oh no',
    });
    expect(result).toEqual({
      notice: 'Portal returned 500: oh no.',
      logEvent: 'error',
    });
  });

  it('maps 500 HTTP error with empty body using status text', () => {
    const result = mapPortalError({
      kind: 'http',
      status: 500,
      body: '',
    });
    expect(result).toEqual({
      notice: 'Portal returned 500: Internal Server Error.',
      logEvent: 'error',
    });
  });

  it('truncates body longer than 200 chars', () => {
    const longBody = 'x'.repeat(300);
    const result = mapPortalError({
      kind: 'http',
      status: 500,
      body: longBody,
    });

    // Body should be truncated to 200 chars
    expect(result.notice).toMatch(/Portal returned 500: /);
    const bodyPart = result.notice.replace(/Portal returned 500: /, '').slice(0, -1); // remove trailing dot
    expect(bodyPart).toBe('x'.repeat(200));
    expect(result.logEvent).toBe('error');
  });

  it('maps 400 HTTP error with empty body using status text', () => {
    const result = mapPortalError({
      kind: 'http',
      status: 400,
      body: '',
    });
    expect(result.notice).toContain('400');
    expect(result.notice).toContain('Bad Request');
  });

  it('maps 403 HTTP error with empty body using status text', () => {
    const result = mapPortalError({
      kind: 'http',
      status: 403,
      body: '',
    });
    expect(result.notice).toContain('403');
    expect(result.notice).toContain('Forbidden');
  });

  it('maps 404 HTTP error with empty body using status text', () => {
    const result = mapPortalError({
      kind: 'http',
      status: 404,
      body: '',
    });
    expect(result.notice).toContain('404');
    expect(result.notice).toContain('Not Found');
  });

  it('uses status code as fallback when no status text available', () => {
    const result = mapPortalError({
      kind: 'http',
      status: 999,
      body: '',
    });
    expect(result.notice).toContain('999');
  });
});
