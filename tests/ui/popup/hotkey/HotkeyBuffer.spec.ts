import { describe, it, expect, vi } from 'vitest';
import { HotkeyBuffer, type BufferState } from '../../../../src/ui/popup/hotkey/HotkeyBuffer';

describe('HotkeyBuffer', () => {
  describe('state()', () => {
    it('returns initial empty state', () => {
      const buffer = new HotkeyBuffer();
      const state = buffer.state();
      expect(state.letters).toBe('');
      expect(state.status).toBe('empty');
    });
  });

  describe('clear()', () => {
    it('clears from empty to empty', () => {
      const buffer = new HotkeyBuffer();
      buffer.clear();
      const state = buffer.state();
      expect(state.letters).toBe('');
      expect(state.status).toBe('empty');
    });

    it('emits change event when cleared from empty', () => {
      const buffer = new HotkeyBuffer();
      const onChange = vi.fn();
      buffer.on('change', onChange);
      buffer.clear();
      expect(onChange).toHaveBeenCalledOnce();
      expect(onChange).toHaveBeenCalledWith({ letters: '', status: 'empty' });
    });
  });

  describe('setEvaluation()', () => {
    it('does not change state when buffer is empty', () => {
      const buffer = new HotkeyBuffer();
      const onChange = vi.fn();
      buffer.on('change', onChange);
      buffer.setEvaluation('error');
      const state = buffer.state();
      expect(state.letters).toBe('');
      expect(state.status).toBe('empty');
      expect(onChange).not.toHaveBeenCalled();
    });

    it('updates status to error when buffer is non-empty', () => {
      const buffer = new HotkeyBuffer();
      const onChange = vi.fn();
      buffer.on('change', onChange);
      // Prime the buffer with a letter first (via append, tested in B3)
      (buffer as any).append('a');
      onChange.mockClear();

      buffer.setEvaluation('error');
      const state = buffer.state();
      expect(state.status).toBe('error');
      expect(onChange).toHaveBeenCalledOnce();
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
    });

    it('updates status to normal when buffer is non-empty', () => {
      const buffer = new HotkeyBuffer();
      const onChange = vi.fn();
      buffer.on('change', onChange);
      // Prime the buffer to error state
      (buffer as any).append('a');
      (buffer as any).setEvaluation('error');
      onChange.mockClear();

      buffer.setEvaluation('normal');
      const state = buffer.state();
      expect(state.status).toBe('normal');
      expect(onChange).toHaveBeenCalledOnce();
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'normal' }));
    });
  });

  describe('append()', () => {
    it('appends from empty → 1 letter with normal status', () => {
      const buffer = new HotkeyBuffer();
      const onChange = vi.fn();
      buffer.on('change', onChange);

      buffer.append('a');

      const state = buffer.state();
      expect(state.letters).toBe('a');
      expect(state.status).toBe('normal');
      expect(onChange).toHaveBeenCalledOnce();
      expect(onChange).toHaveBeenCalledWith({ letters: 'a', status: 'normal' });
    });

    it('appends from one letter → 2 letters with normal status', () => {
      const buffer = new HotkeyBuffer();
      const onChange = vi.fn();
      buffer.on('change', onChange);

      buffer.append('a');
      onChange.mockClear();

      buffer.append('b');

      const state = buffer.state();
      expect(state.letters).toBe('ab');
      expect(state.letters.length).toBe(2);
      expect(state.status).toBe('normal');
      expect(onChange).toHaveBeenCalledOnce();
      expect(onChange).toHaveBeenCalledWith({ letters: 'ab', status: 'normal' });
    });

    it('appends from two letters → replaces entirely (overflow)', () => {
      const buffer = new HotkeyBuffer();
      const onChange = vi.fn();
      buffer.on('change', onChange);

      buffer.append('a');
      buffer.append('b');
      onChange.mockClear();

      buffer.append('c');

      const state = buffer.state();
      expect(state.letters).toBe('c');
      expect(state.letters.length).toBe(1);
      expect(state.status).toBe('normal');
      expect(onChange).toHaveBeenCalledOnce();
      expect(onChange).toHaveBeenCalledWith({ letters: 'c', status: 'normal' });
    });

    it('always emits change event on append', () => {
      const buffer = new HotkeyBuffer();
      const onChange = vi.fn();
      buffer.on('change', onChange);

      buffer.append('x');
      expect(onChange).toHaveBeenCalledOnce();

      buffer.append('y');
      expect(onChange).toHaveBeenCalledTimes(2);

      buffer.append('z');
      expect(onChange).toHaveBeenCalledTimes(3);
    });

    it('resets status to normal on append even from error state', () => {
      const buffer = new HotkeyBuffer();
      const onChange = vi.fn();
      buffer.on('change', onChange);

      buffer.append('a');
      buffer.append('b');
      buffer.setEvaluation('error');
      expect(buffer.state().status).toBe('error');
      onChange.mockClear();

      buffer.append('c');

      const state = buffer.state();
      expect(state.status).toBe('normal');
      expect(state.letters).toBe('c');
    });
  });

  describe('integration: multiple operations', () => {
    it('clear from non-empty normal state', () => {
      const buffer = new HotkeyBuffer();
      const onChange = vi.fn();
      buffer.on('change', onChange);

      buffer.append('a');
      onChange.mockClear();

      buffer.clear();

      const state = buffer.state();
      expect(state.letters).toBe('');
      expect(state.status).toBe('empty');
      expect(onChange).toHaveBeenCalledOnce();
      expect(onChange).toHaveBeenCalledWith({ letters: '', status: 'empty' });
    });

    it('clear from non-empty error state', () => {
      const buffer = new HotkeyBuffer();
      const onChange = vi.fn();
      buffer.on('change', onChange);

      buffer.append('a');
      buffer.setEvaluation('error');
      onChange.mockClear();

      buffer.clear();

      const state = buffer.state();
      expect(state.letters).toBe('');
      expect(state.status).toBe('empty');
      expect(onChange).toHaveBeenCalledOnce();
    });

    it('sequence: append, evaluate, clear, append again', () => {
      const buffer = new HotkeyBuffer();
      const onChange = vi.fn();
      buffer.on('change', onChange);

      buffer.append('a');
      expect(buffer.state()).toEqual({ letters: 'a', status: 'normal' });

      buffer.setEvaluation('error');
      expect(buffer.state()).toEqual({ letters: 'a', status: 'error' });

      buffer.clear();
      expect(buffer.state()).toEqual({ letters: '', status: 'empty' });

      buffer.append('b');
      expect(buffer.state()).toEqual({ letters: 'b', status: 'normal' });

      expect(onChange).toHaveBeenCalledTimes(4);
    });
  });
});
