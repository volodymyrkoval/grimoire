import { describe, it, expect, vi } from 'vitest';
import { DetailPhase } from '../src/ui/popup/DetailPhase';
import type { PopupPhaseContext } from '../src/ui/popup/PopupPhase';

describe('DetailPhase', () => {
  function createFakeContext(): PopupPhaseContext {
    return {
      activePanel: vi.fn(),
      selectedIndex: vi.fn(() => 0),
      setSelectedIndex: vi.fn(),
      setActivePanel: vi.fn(),
      spellsPanel: vi.fn(),
      panels: vi.fn(() => []),
      kb: vi.fn(() => ({ suspend: vi.fn(), resume: vi.fn() } as any)),
      contentEl: vi.fn(() => document.createElement('div')),
      exitDetail: vi.fn(),
      renderSearch: vi.fn(),
    };
  }

  it('handleArrow(1) returns false', () => {
    const ctx = createFakeContext();
    const phase = new DetailPhase(ctx);

    const result = phase.handleArrow(1);

    expect(result).toBe(false);
  });

  it('handleArrow(-1) returns false', () => {
    const ctx = createFakeContext();
    const phase = new DetailPhase(ctx);

    const result = phase.handleArrow(-1);

    expect(result).toBe(false);
  });

  it('handleEnter returns false', () => {
    const ctx = createFakeContext();
    const phase = new DetailPhase(ctx);

    const result = phase.handleEnter();

    expect(result).toBe(false);
  });

  it('handleTab returns false', () => {
    const ctx = createFakeContext();
    const phase = new DetailPhase(ctx);

    const result = phase.handleTab();

    expect(result).toBe(false);
  });

  it('handleArrowRight returns false', () => {
    const ctx = createFakeContext();
    const phase = new DetailPhase(ctx);

    const result = phase.handleArrowRight();

    expect(result).toBe(false);
  });

  it('interceptClose returns true and calls ctx.exitDetail', () => {
    const ctx = createFakeContext();
    const phase = new DetailPhase(ctx);

    const result = phase.interceptClose();

    expect(result).toBe(true);
    expect(ctx.exitDetail).toHaveBeenCalled();
  });

  it('kind equals "detail"', () => {
    const ctx = createFakeContext();
    const phase = new DetailPhase(ctx);

    expect(phase.kind).toBe('detail');
  });

  it('setActive stores the detail and onBack callback', () => {
    const ctx = createFakeContext();
    const phase = new DetailPhase(ctx);
    const mockDetail = { destroy: vi.fn() };
    const mockOnBack = vi.fn();

    phase.setActive(mockDetail as any, mockOnBack);

    // After setActive, calling interceptClose should invoke onBack instead of ctx.exitDetail
    phase.interceptClose();
    expect(mockOnBack).toHaveBeenCalled();
  });

  it('interceptClose returns true and calls onBack after setActive', () => {
    const ctx = createFakeContext();
    const phase = new DetailPhase(ctx);
    const mockDetail = { destroy: vi.fn() };
    const mockOnBack = vi.fn();

    phase.setActive(mockDetail as any, mockOnBack);
    const result = phase.interceptClose();

    expect(result).toBe(true);
    expect(mockOnBack).toHaveBeenCalled();
    expect(ctx.exitDetail).not.toHaveBeenCalled();
  });

  it('after interceptClose consumes onBack, a second call falls through to ctx.exitDetail exactly once', () => {
    const ctx = createFakeContext();
    const phase = new DetailPhase(ctx);
    const mockDetail = { destroy: vi.fn() };
    const mockOnBack = vi.fn();

    phase.setActive(mockDetail as any, mockOnBack);
    const resultFirst = phase.interceptClose();
    const resultSecond = phase.interceptClose();

    expect(resultFirst).toBe(true);
    expect(resultSecond).toBe(true);
    expect(mockOnBack).toHaveBeenCalledTimes(1);
    expect(ctx.exitDetail).toHaveBeenCalledTimes(1);
  });
});
