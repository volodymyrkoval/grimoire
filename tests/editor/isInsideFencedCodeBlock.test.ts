import { describe, it, expect } from 'vitest';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { isInsideFencedCodeBlock } from '../../src/editor/isInsideFencedCodeBlock';

describe('isInsideFencedCodeBlock', () => {
	describe('positives (should return true)', () => {
		it('inside fenced code block body', () => {
			const doc = '```\n@cast inside\n```';
			const state = EditorState.create({ doc, extensions: [markdown()] });
			const pos = doc.indexOf('@cast inside');

			expect(isInsideFencedCodeBlock(state, pos)).toBe(true);
		});

		it('on the fenced block opening fence line', () => {
			const doc = '```typescript\n@cast inside\n```';
			const state = EditorState.create({ doc, extensions: [markdown()] });
			const pos = doc.indexOf('```'); // Opening fence

			expect(isInsideFencedCodeBlock(state, pos)).toBe(true);
		});

		it('on the fenced block closing fence line', () => {
			const doc = '```\n@cast inside\n```';
			const state = EditorState.create({ doc, extensions: [markdown()] });
			const pos = doc.lastIndexOf('```'); // Closing fence

			expect(isInsideFencedCodeBlock(state, pos)).toBe(true);
		});

		it('inside an inline code span (single backticks)', () => {
			const doc = 'Regular text with `code` in it';
			const state = EditorState.create({ doc, extensions: [markdown()] });
			const pos = doc.indexOf('code'); // Inside the backticks

			expect(isInsideFencedCodeBlock(state, pos)).toBe(true);
		});

		it('inside nested indented code block', () => {
			const doc = '    indented code here';
			const state = EditorState.create({ doc, extensions: [markdown()] });
			const pos = doc.indexOf('code');

			expect(isInsideFencedCodeBlock(state, pos)).toBe(true);
		});
	});

	describe('negatives (should return false)', () => {
		it('plain prose line', () => {
			const doc = 'Just some regular prose text here';
			const state = EditorState.create({ doc, extensions: [markdown()] });
			const pos = doc.indexOf('some');

			expect(isInsideFencedCodeBlock(state, pos)).toBe(false);
		});

		it('blank line', () => {
			const doc = '\n\n';
			const state = EditorState.create({ doc, extensions: [markdown()] });
			const pos = 1; // Position in blank line

			expect(isInsideFencedCodeBlock(state, pos)).toBe(false);
		});

		it('line ending in single backtick but not inside a span', () => {
			const doc = 'Some text with incomplete `backtick at end`\nNext line';
			const state = EditorState.create({ doc, extensions: [markdown()] });
			const pos = doc.indexOf('Next line');

			expect(isInsideFencedCodeBlock(state, pos)).toBe(false);
		});

		it('text outside fenced code block', () => {
			const doc = '```\ncode inside\n```\ntext outside';
			const state = EditorState.create({ doc, extensions: [markdown()] });
			const pos = doc.indexOf('text outside');

			expect(isInsideFencedCodeBlock(state, pos)).toBe(false);
		});

		it('before opening fence', () => {
			const doc = 'before\n```\ncode\n```';
			const state = EditorState.create({ doc, extensions: [markdown()] });
			const pos = doc.indexOf('before');

			expect(isInsideFencedCodeBlock(state, pos)).toBe(false);
		});
	});
});
