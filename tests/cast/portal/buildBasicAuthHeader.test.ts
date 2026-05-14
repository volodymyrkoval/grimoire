import { describe, it, expect } from 'vitest';
import { buildBasicAuthHeader } from '../../../src/cast/portal/buildBasicAuthHeader';

describe('buildBasicAuthHeader', () => {
  it('builds a valid Basic auth header from user and password', () => {
    const result = buildBasicAuthHeader('alice', 'secret');
    const expectedBase64 = btoa('alice:secret');
    expect(result).toBe(`Basic ${expectedBase64}`);
  });

  it('builds a valid header from empty user and empty password', () => {
    const result = buildBasicAuthHeader('', '');
    expect(result).toBe('Basic Og==');
  });

  it('builds a valid header from user and empty password', () => {
    const result = buildBasicAuthHeader('user', '');
    const expectedBase64 = btoa('user:');
    expect(result).toBe(`Basic ${expectedBase64}`);
  });

  it('builds a valid header with unicode password matching UTF-8 base64', () => {
    const result = buildBasicAuthHeader('user', '🔑');
    const expectedBase64 = Buffer.from('user:🔑', 'utf8').toString('base64');
    expect(result).toBe(`Basic ${expectedBase64}`);
  });
});
