import { describe, it, expect } from 'vitest';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { Decoration, type DecorationSet } from '@codemirror/view';
import { buildCastDecorations } from '../../src/editor/buildCastDecorations';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Collects all ranges out of a DecorationSet into a plain array for
 * easy assertion. Each item carries from/to positions and the Decoration
 * value (so we can read spec.class).
 */
function collectDecorations(set: DecorationSet) {
	const items: Array<{ from: number; to: number; value: Decoration }> = [];
	const cursor = set.iter();
	while (cursor.value !== null) {
		items.push({ from: cursor.from, to: cursor.to, value: cursor.value });
		cursor.next();
	}
	return items;
}

/**
 * Builds a mock EditorView that covers the entire document.
 * buildCastDecorations only needs view.visibleRanges and view.state.
 */
function makeFullView(doc: string) {
	const state = EditorState.create({ doc, extensions: [markdown()] });
	return {
		visibleRanges: [{ from: 0, to: doc.length }],
		state,
	};
}

/**
 * Builds a mock EditorView with an explicit visible range.
 */
function makePartialView(doc: string, from: number, to: number) {
	const state = EditorState.create({ doc, extensions: [markdown()] });
	return {
		visibleRanges: [{ from, to }],
		state,
	};
}

// ---------------------------------------------------------------------------
// D1 — three @cast lines yield exactly 3 line + 3 mark decorations
// ---------------------------------------------------------------------------
describe('buildCastDecorations', () => {
	describe('D1: three @cast lines in prose fixture', () => {
		it('returns exactly 3 line decorations and 3 mark decorations', () => {
			const doc = [
				'@cast first spell',
				'Some prose between spells.',
				'@cast second spell',
				'More prose here.',
				'@cast third spell',
			].join('\n');

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const view = makeFullView(doc) as any;
			const result = buildCastDecorations(view);
			const items = collectDecorations(result);

			const lineDecos = items.filter(
				(d) => (d.value.spec as { class?: string }).class === 'grimoire-cast-line',
			);
			const markDecos = items.filter(
				(d) => (d.value.spec as { class?: string }).class === 'grimoire-cast-marker',
			);

			expect(lineDecos).toHaveLength(3);
			expect(markDecos).toHaveLength(3);
		});

		it('mark decorations are each 5 chars wide starting at column 0', () => {
			const doc = '@cast first\n@cast second\n@cast third';
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const view = makeFullView(doc) as any;
			const result = buildCastDecorations(view);
			const items = collectDecorations(result);

			const markDecos = items.filter(
				(d) => (d.value.spec as { class?: string }).class === 'grimoire-cast-marker',
			);

			// Each mark should be exactly 5 chars wide (length of '@cast')
			for (const mark of markDecos) {
				expect(mark.to - mark.from).toBe(5);
			}

			// First mark starts at position 0 (column 0 of first line)
			expect(markDecos[0].from).toBe(0);
			expect(markDecos[0].to).toBe(5);
		});
	});

	// -------------------------------------------------------------------------
	// D2 — @casting and @castaway yield zero decorations
	// -------------------------------------------------------------------------
	describe('D2: near-miss patterns yield zero decorations', () => {
		it('@casting foo does not match', () => {
			const doc = '@casting foo\nsome prose\n@castaway';
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const view = makeFullView(doc) as any;
			const result = buildCastDecorations(view);
			const items = collectDecorations(result);
			expect(items).toHaveLength(0);
		});
	});

	// -------------------------------------------------------------------------
	// D3 — leading spaces / list marker / blockquote yield zero decorations
	// -------------------------------------------------------------------------
	describe('D3: indented and prefixed @cast yields zero decorations', () => {
		it('leading spaces before @cast do not match', () => {
			const doc = '  @cast with leading spaces';
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const view = makeFullView(doc) as any;
			const result = buildCastDecorations(view);
			expect(collectDecorations(result)).toHaveLength(0);
		});

		it('list marker before @cast does not match', () => {
			const doc = '- @cast in list';
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const view = makeFullView(doc) as any;
			const result = buildCastDecorations(view);
			expect(collectDecorations(result)).toHaveLength(0);
		});

		it('blockquote prefix before @cast does not match', () => {
			const doc = '> @cast in blockquote';
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const view = makeFullView(doc) as any;
			const result = buildCastDecorations(view);
			expect(collectDecorations(result)).toHaveLength(0);
		});
	});

	// -------------------------------------------------------------------------
	// D4 — @cast inside fenced or inline code yields zero decorations
	// -------------------------------------------------------------------------
	describe('D4: @cast inside code blocks yields zero decorations', () => {
		it('@cast inside triple-backtick fenced block is ignored', () => {
			const doc = '```\n@cast inside fence\n```';
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const view = makeFullView(doc) as any;
			const result = buildCastDecorations(view);
			expect(collectDecorations(result)).toHaveLength(0);
		});

		it('@cast inside single-backtick inline code span is ignored', () => {
			const doc = 'Regular text with `@cast` inline code';
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const view = makeFullView(doc) as any;
			const result = buildCastDecorations(view);
			expect(collectDecorations(result)).toHaveLength(0);
		});
	});

	// -------------------------------------------------------------------------
	// D6 — viewport-only: only lines inside visibleRanges are decorated
	// -------------------------------------------------------------------------
	describe('D6: only lines within visibleRanges are decorated', () => {
		it('decorates @cast on line 5 but not @cast on line 50 when only lines 1-10 are visible', () => {
			// Build 100 lines: line 5 (index 4) = '@cast early', line 50 (index 49) = '@cast late'
			const lines: string[] = [];
			for (let i = 1; i <= 100; i++) {
				if (i === 5) lines.push('@cast early');
				else if (i === 50) lines.push('@cast late');
				else lines.push(`line ${i}`);
			}
			const doc = lines.join('\n');

			const state = EditorState.create({ doc, extensions: [markdown()] });

			// Find the character offset of the end of line 10
			const endOfLine10 = state.doc.line(10).to;

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const partialView = makePartialView(doc, 0, endOfLine10) as any;
			const result = buildCastDecorations(partialView);
			const items = collectDecorations(result);

			const lineDecos = items.filter(
				(d) => (d.value.spec as { class?: string }).class === 'grimoire-cast-line',
			);
			const markDecos = items.filter(
				(d) => (d.value.spec as { class?: string }).class === 'grimoire-cast-marker',
			);

			expect(lineDecos).toHaveLength(1);
			expect(markDecos).toHaveLength(1);
		});
	});

	// -------------------------------------------------------------------------
	// D7 — edge cases: bare @cast and @cast as last line
	// -------------------------------------------------------------------------
	describe('D7: edge cases for bare @cast and last-line position', () => {
		it('bare @cast (no trailing content) yields a line + mark decoration', () => {
			const doc = 'prose\n@cast\nmore prose';
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const view = makeFullView(doc) as any;
			const result = buildCastDecorations(view);
			const items = collectDecorations(result);

			const lineDecos = items.filter(
				(d) => (d.value.spec as { class?: string }).class === 'grimoire-cast-line',
			);
			const markDecos = items.filter(
				(d) => (d.value.spec as { class?: string }).class === 'grimoire-cast-marker',
			);

			expect(lineDecos).toHaveLength(1);
			expect(markDecos).toHaveLength(1);
		});

		it('@cast as the last line of the document (no trailing newline) is decorated', () => {
			const doc = 'prose\n@cast';
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const view = makeFullView(doc) as any;
			const result = buildCastDecorations(view);
			const items = collectDecorations(result);

			const lineDecos = items.filter(
				(d) => (d.value.spec as { class?: string }).class === 'grimoire-cast-line',
			);
			const markDecos = items.filter(
				(d) => (d.value.spec as { class?: string }).class === 'grimoire-cast-marker',
			);

			expect(lineDecos).toHaveLength(1);
			expect(markDecos).toHaveLength(1);

			// Mark should still be 5 chars wide from the start of the @cast line
			expect(markDecos[0].to - markDecos[0].from).toBe(5);
		});
	});
});
