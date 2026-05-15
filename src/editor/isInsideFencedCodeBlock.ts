import type { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';

const FENCED_OR_INLINE_CODE_NODES = new Set([
	'FencedCode',
	'CodeText',
	'InlineCode',
	'CodeBlock',
	'HyperMD-codeblock',
	'HyperMD-codeblock-begin',
	'HyperMD-codeblock-end',
]);

export function isInsideFencedCodeBlock(state: EditorState, pos: number): boolean {
	try {
		const cursor = syntaxTree(state).resolveInner(pos, 1);
		let node: typeof cursor | null = cursor;
		while (node) {
			if (FENCED_OR_INLINE_CODE_NODES.has(node.type.name)) return true;
			node = node.parent;
		}
		return false;
	} catch {
		return false;
	}
}
