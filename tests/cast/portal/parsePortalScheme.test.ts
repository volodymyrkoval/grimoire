import { describe, it, expect } from 'vitest';
import { parsePortalScheme } from '../../../src/cast/portal/parsePortalScheme';

describe('parsePortalScheme', () => {
  it('returns https scheme and bare hostname for a plain hostname', () => {
    const result = parsePortalScheme('localhost');
    expect(result).toEqual({ scheme: 'https', hostWithoutScheme: 'localhost' });
  });

  it('extracts http scheme from lowercase prefix', () => {
    const result = parsePortalScheme('http://localhost');
    expect(result).toEqual({ scheme: 'http', hostWithoutScheme: 'localhost' });
  });

  it('extracts https scheme from lowercase prefix', () => {
    const result = parsePortalScheme('https://portal.example.com');
    expect(result).toEqual({ scheme: 'https', hostWithoutScheme: 'portal.example.com' });
  });

  it('handles uppercase http scheme (case-insensitive)', () => {
    const result = parsePortalScheme('HTTP://Portal.Example.Com');
    expect(result).toEqual({ scheme: 'http', hostWithoutScheme: 'Portal.Example.Com' });
  });

  it('treats unknown prefix as part of the hostname with default https scheme', () => {
    const result = parsePortalScheme('ftp://garbage');
    expect(result).toEqual({ scheme: 'https', hostWithoutScheme: 'ftp://garbage' });
  });

  it('returns https scheme and empty string for empty input', () => {
    const result = parsePortalScheme('');
    expect(result).toEqual({ scheme: 'https', hostWithoutScheme: '' });
  });
});
