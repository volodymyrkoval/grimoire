import { describe, it, expect } from 'vitest';
import { resolveRefinePath } from '../../src/refine/resolveRefinePath';

describe('resolveRefinePath', () => {
  // Stub isSentinel for most tests: only 'valid-sentinel.md' is considered valid
  const isSentinel = (p: string) => p === 'valid-sentinel.md';

  it('perCast undefined + settingsActive null returns bundled with isFallback false', () => {
    const result = resolveRefinePath({
      perCast: undefined,
      settingsActive: null,
      bundledDefaultVaultRel: 'bundled-default.md',
      isSentinel,
    });

    expect(result.path).toBe('bundled-default.md');
    expect(result.isFallback).toBe(false);
    expect(result.fallbackReason).toBeUndefined();
  });

  it('perCast undefined + settingsActive valid returns settingsActive with isFallback false', () => {
    const result = resolveRefinePath({
      perCast: undefined,
      settingsActive: 'valid-sentinel.md',
      bundledDefaultVaultRel: 'bundled-default.md',
      isSentinel,
    });

    expect(result.path).toBe('valid-sentinel.md');
    expect(result.isFallback).toBe(false);
    expect(result.fallbackReason).toBeUndefined();
  });

  it('perCast undefined + settingsActive invalid returns bundled with isFallback true', () => {
    const result = resolveRefinePath({
      perCast: undefined,
      settingsActive: 'invalid-path.md',
      bundledDefaultVaultRel: 'bundled-default.md',
      isSentinel,
    });

    expect(result.path).toBe('bundled-default.md');
    expect(result.isFallback).toBe(true);
    expect(result.fallbackReason).toBe('sentinel-removed');
  });

  it('perCast null returns bundled with isFallback false, ignoring settingsActive', () => {
    const result = resolveRefinePath({
      perCast: null,
      settingsActive: 'valid-sentinel.md',
      bundledDefaultVaultRel: 'bundled-default.md',
      isSentinel,
    });

    expect(result.path).toBe('bundled-default.md');
    expect(result.isFallback).toBe(false);
    expect(result.fallbackReason).toBeUndefined();
  });

  it('perCast valid string returns perCast with isFallback false', () => {
    const result = resolveRefinePath({
      perCast: 'valid-sentinel.md',
      settingsActive: 'other.md',
      bundledDefaultVaultRel: 'bundled-default.md',
      isSentinel,
    });

    expect(result.path).toBe('valid-sentinel.md');
    expect(result.isFallback).toBe(false);
    expect(result.fallbackReason).toBeUndefined();
  });

  it('perCast invalid string returns bundled with isFallback true', () => {
    const result = resolveRefinePath({
      perCast: 'invalid-path.md',
      settingsActive: 'other.md',
      bundledDefaultVaultRel: 'bundled-default.md',
      isSentinel,
    });

    expect(result.path).toBe('bundled-default.md');
    expect(result.isFallback).toBe(true);
    expect(result.fallbackReason).toBe('sentinel-removed');
  });
});
