import { describe, it, expect } from 'vitest';
import { toDisplayPath } from '../../../src/castLog/format/toDisplayPath';

describe('toDisplayPath', () => {
  it('returns "Notes/foo.md" for "Notes/foo.md" with vaultRootAbs "/vault" (pass-through — already relative)', () => {
    const result = toDisplayPath('Notes/foo.md', '/vault');
    expect(result).toBe('Notes/foo.md');
  });

  it('returns "Notes/foo.md" for "/vault/Notes/foo.md" with vaultRootAbs "/vault"', () => {
    const result = toDisplayPath('/vault/Notes/foo.md', '/vault');
    expect(result).toBe('Notes/foo.md');
  });

  it('returns "Notes/foo.md" for "/vault/Notes/foo.md" with vaultRootAbs "/vault/" (trailing slash tolerated)', () => {
    const result = toDisplayPath('/vault/Notes/foo.md', '/vault/');
    expect(result).toBe('Notes/foo.md');
  });

  it('returns "/other/abs/foo.md" for "/other/abs/foo.md" with vaultRootAbs "/vault" (pass-through — different machine)', () => {
    const result = toDisplayPath('/other/abs/foo.md', '/vault');
    expect(result).toBe('/other/abs/foo.md');
  });

  it('returns "/vault" for "/vault" with vaultRootAbs "/vault" (degenerate — no normalisation)', () => {
    const result = toDisplayPath('/vault', '/vault');
    expect(result).toBe('/vault');
  });

  it('returns "Notes/foo.md" for "Notes/foo.md" with vaultRootAbs "" (pass-through — no setting)', () => {
    const result = toDisplayPath('Notes/foo.md', '');
    expect(result).toBe('Notes/foo.md');
  });

  it('returns "/vault/Notes/foo.md" for "/vault/Notes/foo.md" with vaultRootAbs "" (pass-through — cannot strip without root)', () => {
    const result = toDisplayPath('/vault/Notes/foo.md', '');
    expect(result).toBe('/vault/Notes/foo.md');
  });

  it('returns "" for "" with any vaultRootAbs', () => {
    const result = toDisplayPath('', '/vault');
    expect(result).toBe('');
  });

  it('returns "" for "" with empty vaultRootAbs', () => {
    const result = toDisplayPath('', '');
    expect(result).toBe('');
  });
});
