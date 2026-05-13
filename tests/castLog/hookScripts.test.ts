import { describe, it, expect } from 'vitest';
import {
  renderSessionStartScript,
  renderPostToolUseScript,
  renderStopScript,
} from '../../src/castLog/hookScripts';

describe('hookScripts', () => {
  describe('renderSessionStartScript', () => {
    it('returns a string starting with shebang', () => {
      const result = renderSessionStartScript({ logPathAbs: '/abs/log.jsonl' });
      expect(result.startsWith('#!/bin/sh\n')).toBe(true);
    });

    it('contains CAST_ID exit guard', () => {
      const result = renderSessionStartScript({ logPathAbs: '/abs/log.jsonl' });
      expect(result).toContain('[ -z "$CAST_ID" ] && exit 0');
    });

    it('contains the absolute log path', () => {
      const result = renderSessionStartScript({ logPathAbs: '/abs/log.jsonl' });
      expect(result).toContain('/abs/log.jsonl');
    });

    it('contains in-progress stage marker', () => {
      const result = renderSessionStartScript({ logPathAbs: '/abs/log.jsonl' });
      expect(result).toContain('"stage":"in-progress"');
    });

    it('contains printf with append to LOG', () => {
      const result = renderSessionStartScript({ logPathAbs: '/abs/log.jsonl' });
      expect(result).toContain('printf');
      expect(result).toContain('>> "$LOG"');
    });
  });

  describe('renderPostToolUseScript', () => {
    it('contains the absolute scratch directory path', () => {
      const result = renderPostToolUseScript({ scratchDirAbs: '/abs/scratch' });
      expect(result).toContain('/abs/scratch');
    });

    it('contains mkdir -p for scratch directory', () => {
      const result = renderPostToolUseScript({ scratchDirAbs: '/abs/scratch' });
      expect(result).toContain('mkdir -p "$SCRATCH_DIR"');
    });

    it('contains python3 invocation', () => {
      const result = renderPostToolUseScript({ scratchDirAbs: '/abs/scratch' });
      expect(result).toContain('python3 -c');
    });

    it('contains tool_input reference', () => {
      const result = renderPostToolUseScript({ scratchDirAbs: '/abs/scratch' });
      expect(result).toContain('tool_input');
    });

    it('contains file_path reference', () => {
      const result = renderPostToolUseScript({ scratchDirAbs: '/abs/scratch' });
      expect(result).toContain('file_path');
    });

    it('ends with exit 0', () => {
      const result = renderPostToolUseScript({ scratchDirAbs: '/abs/scratch' });
      expect(result.endsWith('exit 0\n')).toBe(true);
    });
  });

  describe('renderStopScript', () => {
    it('contains the absolute log path', () => {
      const result = renderStopScript({ logPathAbs: '/abs/log.jsonl', scratchDirAbs: '/abs/scratch' });
      expect(result).toContain('/abs/log.jsonl');
    });

    it('contains the absolute scratch directory path', () => {
      const result = renderStopScript({ logPathAbs: '/abs/log.jsonl', scratchDirAbs: '/abs/scratch' });
      expect(result).toContain('/abs/scratch');
    });

    it('contains sort -u command', () => {
      const result = renderStopScript({ logPathAbs: '/abs/log.jsonl', scratchDirAbs: '/abs/scratch' });
      expect(result).toContain('sort -u');
    });

    it('contains rm -f cleanup', () => {
      const result = renderStopScript({ logPathAbs: '/abs/log.jsonl', scratchDirAbs: '/abs/scratch' });
      expect(result).toContain('rm -f');
    });

    it('contains done stage marker', () => {
      const result = renderStopScript({ logPathAbs: '/abs/log.jsonl', scratchDirAbs: '/abs/scratch' });
      expect(result).toContain('"stage":"done"');
    });

    it('contains affectedFiles in printf template', () => {
      const result = renderStopScript({ logPathAbs: '/abs/log.jsonl', scratchDirAbs: '/abs/scratch' });
      expect(result).toContain('"affectedFiles":%s');
    });
  });

  describe('path with special chars', () => {
    it('renderSessionStartScript escapes double-quote in logPathAbs', () => {
      const result = renderSessionStartScript({ logPathAbs: '/path/with"quote/log.jsonl' });
      expect(result).toContain('LOG="/path/with\\"quote/log.jsonl"');
    });

    it('renderPostToolUseScript escapes double-quote in scratchDirAbs', () => {
      const result = renderPostToolUseScript({ scratchDirAbs: '/scratch/with"quote' });
      expect(result).toContain('SCRATCH_DIR="/scratch/with\\"quote"');
    });

    it('renderStopScript escapes double-quote in logPathAbs', () => {
      const result = renderStopScript({
        logPathAbs: '/log/with"q.jsonl',
        scratchDirAbs: '/scratch/with"q',
      });
      expect(result).toContain('LOG="/log/with\\"q.jsonl"');
    });

    it('renderStopScript escapes double-quote in scratchDirAbs', () => {
      const result = renderStopScript({
        logPathAbs: '/log/with"q.jsonl',
        scratchDirAbs: '/scratch/with"q',
      });
      expect(result).toContain('SCRATCH_DIR="/scratch/with\\"q"');
    });
  });

});
