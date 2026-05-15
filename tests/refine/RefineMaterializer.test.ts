import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RefineMaterializer } from '../../src/refine/RefineMaterializer';
import { renderRefineSystemPrompt } from '../../src/refine/refineTemplate';

describe('RefineMaterializer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('run() calls writeFile with path from getRefinePathAbs() and content from renderRefineSystemPrompt()', async () => {
    const writeFileFn = vi.fn();
    const getRefinePathAbs = () => '/vault/.obsidian/plugins/grimoire/refine.md';

    const materializer = new RefineMaterializer({
      getRefinePathAbs,
      writeFile: writeFileFn,
      mkdir: vi.fn(),
    });

    await materializer.run();

    expect(writeFileFn).toHaveBeenCalledWith(
      '/vault/.obsidian/plugins/grimoire/refine.md',
      renderRefineSystemPrompt()
    );
  });

  it('run() calls mkdir on the parent directory before writing', async () => {
    const callOrder: string[] = [];
    const mkdirFn = vi.fn(() => {
      callOrder.push('mkdir');
    });
    const writeFileFn = vi.fn(async () => {
      callOrder.push('writeFile');
    });
    const getRefinePathAbs = () => '/vault/.obsidian/plugins/grimoire/refine.md';

    const materializer = new RefineMaterializer({
      getRefinePathAbs,
      writeFile: writeFileFn,
      mkdir: mkdirFn,
    });

    await materializer.run();

    // mkdir should be called with parent dir
    expect(mkdirFn).toHaveBeenCalledWith('/vault/.obsidian/plugins/grimoire');
    // mkdir should be called before writeFile
    expect(callOrder).toEqual(['mkdir', 'writeFile']);
  });

  it('run() is idempotent: calling twice writes same content twice', async () => {
    const writeFileFn = vi.fn();
    const getRefinePathAbs = () => '/vault/.obsidian/plugins/grimoire/refine.md';

    const materializer = new RefineMaterializer({
      getRefinePathAbs,
      writeFile: writeFileFn,
      mkdir: vi.fn(),
    });

    await materializer.run();
    await materializer.run();

    expect(writeFileFn).toHaveBeenCalledTimes(2);
    expect(writeFileFn).toHaveBeenNthCalledWith(
      1,
      '/vault/.obsidian/plugins/grimoire/refine.md',
      renderRefineSystemPrompt()
    );
    expect(writeFileFn).toHaveBeenNthCalledWith(
      2,
      '/vault/.obsidian/plugins/grimoire/refine.md',
      renderRefineSystemPrompt()
    );
  });
});
