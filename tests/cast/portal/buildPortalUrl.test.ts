import { describe, it, expect } from 'vitest';
import { buildPortalUrl } from '../../../src/cast/portal/buildPortalUrl';
import type { PortalScheme } from '../../../src/cast/portal/parsePortalScheme';

describe('buildPortalUrl', () => {
  it('builds URL with https scheme, no port, no path', () => {
    const result = buildPortalUrl({
      parsedScheme: { scheme: 'https', hostWithoutScheme: 'portal.example.com' },
      port: '',
      path: '',
    });
    expect(result).toBe('https://portal.example.com');
  });

  it('builds URL with https scheme and port, no path', () => {
    const result = buildPortalUrl({
      parsedScheme: { scheme: 'https', hostWithoutScheme: 'portal.example.com' },
      port: '8080',
      path: '',
    });
    expect(result).toBe('https://portal.example.com:8080');
  });

  it('builds URL with https scheme, no port, with path', () => {
    const result = buildPortalUrl({
      parsedScheme: { scheme: 'https', hostWithoutScheme: 'portal.example.com' },
      port: '',
      path: '/grimoire',
    });
    expect(result).toBe('https://portal.example.com/grimoire');
  });

  it('strips trailing slash from path', () => {
    const result = buildPortalUrl({
      parsedScheme: { scheme: 'https', hostWithoutScheme: 'portal.example.com' },
      port: '',
      path: '/grimoire/',
    });
    expect(result).toBe('https://portal.example.com/grimoire');
  });

  it('builds URL with https scheme, port, and path', () => {
    const result = buildPortalUrl({
      parsedScheme: { scheme: 'https', hostWithoutScheme: 'portal.example.com' },
      port: '8080',
      path: '/grimoire',
    });
    expect(result).toBe('https://portal.example.com:8080/grimoire');
  });

  it('builds URL with http scheme, port, and no path', () => {
    const result = buildPortalUrl({
      parsedScheme: { scheme: 'http', hostWithoutScheme: 'localhost' },
      port: '3000',
      path: '',
    });
    expect(result).toBe('http://localhost:3000');
  });
});
