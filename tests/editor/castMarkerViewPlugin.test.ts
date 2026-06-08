// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, Decoration } from '@codemirror/view';
import { castMarkerViewPlugin, createCastMarkerViewPlugin } from '../../src/editor/castMarkerViewPlugin';
import { refineMarkerExtension } from '../../src/editor/refineMarkerExtension';
import * as buildCastDecorationsModule from '../../src/editor/buildCastDecorations';
import { Logger } from '../../src/infra/Logger';

describe('castMarkerViewPlugin', () => {
	let container: HTMLElement;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
	});

	afterEach(() => {
		document.body.innerHTML = '';
	});

	describe('F1: constructor populates decorations', () => {
		it('should build decorations for a @cast line in the document', () => {
			const doc = '@cast hello\nplain prose';
			const view = new EditorView({
				state: EditorState.create({
					doc,
					extensions: [markdown(), castMarkerViewPlugin],
				}),
				parent: container,
			});

			const plugin = view.plugin(castMarkerViewPlugin);
			expect(plugin).toBeDefined();
			expect(plugin!.decorations.size).toBe(2);
		});
	});

	describe('F2: update rebuilds decorations on doc change', () => {
		it('should rebuild decorations when document changes', () => {
			const view = new EditorView({
				state: EditorState.create({
					doc: '@cast hello\nplain prose',
					extensions: [markdown(), castMarkerViewPlugin],
				}),
				parent: container,
			});

			const plugin = view.plugin(castMarkerViewPlugin);
			expect(plugin!.decorations.size).toBe(2);

			// Replace the first line with plain text
			view.dispatch({
				changes: { from: 0, to: 11, insert: 'plain again' },
			});

			expect(plugin!.decorations.size).toBe(0);
		});
	});

	describe('F3: refineMarkerExtension wraps the plugin', () => {
		it('should return an Extension containing castMarkerViewPlugin', () => {
			const extension = refineMarkerExtension();
			expect(extension).toBeDefined();
			expect(Array.isArray(extension) || typeof extension === 'object').toBe(true);
		});

		it('should produce equivalent decorations to installing the plugin directly', () => {
			const doc = '@cast hello\nplain prose';

			const parent1 = document.createElement('div');
			document.body.appendChild(parent1);

			// View with extension returned by refineMarkerExtension()
			const extension1 = refineMarkerExtension();
			const view1 = new EditorView({
				state: EditorState.create({
					doc,
					extensions: [markdown(), extension1],
				}),
				parent: parent1,
			});

			// Get the plugin instance from view1 (it's the first item in the extension array)
			const plugin1 = view1.plugin(extension1[0] as any);

			// View with plugin installed directly
			const parent2 = document.createElement('div');
			document.body.appendChild(parent2);
			const testPlugin = createCastMarkerViewPlugin();
			const view2 = new EditorView({
				state: EditorState.create({
					doc,
					extensions: [markdown(), testPlugin],
				}),
				parent: parent2,
			});

			const plugin2 = view2.plugin(testPlugin);

			expect(plugin1).toBeDefined();
			expect(plugin2).toBeDefined();
			expect(plugin1!.decorations.size).toBe(plugin2!.decorations.size);
			expect(plugin1!.decorations.size).toBe(2);
		});
	});

	describe('F5: error handling in update', () => {
		it('should catch exceptions from buildCastDecorations and assign Decoration.none', () => {
			const fakeSink = { error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
			const fakeLogger = new Logger({
				isDebugEnabled: () => false,
				sink: fakeSink,
			});
			const testPlugin = createCastMarkerViewPlugin(fakeLogger);

			const view = new EditorView({
				state: EditorState.create({
					doc: '@cast hello\nplain prose',
					extensions: [markdown(), testPlugin],
				}),
				parent: container,
			});

			const plugin = view.plugin(testPlugin);
			expect(plugin!.decorations.size).toBe(2);

			// Mock buildCastDecorations to throw
			vi.spyOn(buildCastDecorationsModule, 'buildCastDecorations').mockImplementation(() => {
				throw new Error('test error');
			});

			// Dispatch a change; the error should be caught internally
			expect(() => {
				view.dispatch({
					changes: { from: 0, to: 11, insert: 'plain again' },
				});
			}).not.toThrow();

			// After the error, decorations should be Decoration.none
			expect(plugin!.decorations.size).toBe(0);

			// fakeLogger.error should have been called
			expect(fakeSink.error).toHaveBeenCalledWith(
				'refine-marker-styling: decoration build failed',
				expect.any(Error)
			);

			// Restore the original function
			vi.spyOn(buildCastDecorationsModule, 'buildCastDecorations').mockRestore();
		});
	});
});
