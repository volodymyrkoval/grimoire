import { describe, it, expect, afterEach } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { castMarkerViewPlugin } from '../../src/editor/castMarkerViewPlugin';

// H1: Verifying @codemirror/lang-markdown is installed — the import above must resolve.
// If the package is missing the test file itself will fail to load.

function mountView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({
    state: EditorState.create({ doc, extensions: [castMarkerViewPlugin, markdown()] }),
    parent,
  });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('refine-marker-styling', () => {
  describe('tc1 — mixed doc, correct class application', () => {
    it('decorates only top-level @cast lines and suppresses fenced, prefix-mismatch, and inline-code occurrences', async () => {
      const doc = [
        '@cast foo',
        '',
        'plain',
        '',
        '```',
        '@cast inside',
        '```',
        '@casting outside',
        '`@cast inline`',
      ].join('\n');

      const view = mountView(doc);
      await Promise.resolve();

      const castLines = document.querySelectorAll('.cm-line.grimoire-cast-line');
      expect(castLines).toHaveLength(1);

      const castMarkers = document.querySelectorAll('.grimoire-cast-marker');
      expect(castMarkers).toHaveLength(1);

      // Verify the decorated line contains "@cast foo"
      expect(castLines[0].textContent).toContain('@cast');

      // Verify "@cast inside" (fenced block) does NOT have the class
      const allLines = document.querySelectorAll('.cm-line');
      const fencedLine = Array.from(allLines).find(
        (el) => el.textContent?.trim() === '@cast inside',
      );
      expect(fencedLine?.classList.contains('grimoire-cast-line')).toBeFalsy();

      // Verify "@casting outside" (prefix match, not exact) does NOT have the class
      const castingLine = Array.from(allLines).find(
        (el) => el.textContent?.trim() === '@casting outside',
      );
      expect(castingLine?.classList.contains('grimoire-cast-line')).toBeFalsy();

      // Verify the inline-code line does NOT have the class
      const inlineLine = Array.from(allLines).find(
        (el) => el.textContent?.includes('@cast inline'),
      );
      expect(inlineLine?.classList.contains('grimoire-cast-line')).toBeFalsy();

      view.destroy();
    });
  });

  describe('tc2 — decoration added on doc change', () => {
    it('adds a second .cm-line.grimoire-cast-line when a new @cast line is appended', async () => {
      const doc = [
        '@cast foo',
        '',
        'plain',
        '',
        '```',
        '@cast inside',
        '```',
        '@casting outside',
        '`@cast inline`',
      ].join('\n');

      const view = mountView(doc);
      await Promise.resolve();

      view.dispatch({
        changes: { from: view.state.doc.length, insert: '\n@cast new' },
      });
      await Promise.resolve();

      const castLines = document.querySelectorAll('.cm-line.grimoire-cast-line');
      expect(castLines).toHaveLength(2);

      view.destroy();
    });
  });

  describe('tc3 — decoration removed on doc change', () => {
    it('removes the .cm-line.grimoire-cast-line decoration when the @cast line is replaced', async () => {
      const doc = [
        '@cast foo',
        '',
        'plain',
        '',
        '```',
        '@cast inside',
        '```',
        '@casting outside',
        '`@cast inline`',
      ].join('\n');

      const view = mountView(doc);
      await Promise.resolve();

      // Replace "@cast foo" (first line) with "plain again"
      const firstLine = view.state.doc.line(1);
      view.dispatch({
        changes: { from: firstLine.from, to: firstLine.to, insert: 'plain again' },
      });
      await Promise.resolve();

      const castLines = document.querySelectorAll('.cm-line.grimoire-cast-line');
      expect(castLines).toHaveLength(0);

      view.destroy();
    });
  });

  describe('tc-edge1 — inline code suppression', () => {
    it('applies zero decorations when the only @cast occurrence is inside backtick inline code', async () => {
      const doc = '`@cast inline`';

      const view = mountView(doc);
      await Promise.resolve();

      const castLines = document.querySelectorAll('.cm-line.grimoire-cast-line');
      expect(castLines).toHaveLength(0);

      view.destroy();
    });
  });
});
