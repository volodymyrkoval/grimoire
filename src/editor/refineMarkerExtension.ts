import type { Extension } from '@codemirror/state';
import { createCastMarkerViewPlugin } from './castMarkerViewPlugin';
import type { Logger } from '../infra/Logger';

/** Returns the CM6 Extension array for refine-marker styling. Entry point for `registerEditorExtension`; add future co-installed extensions here. */
export function refineMarkerExtension(logger?: Logger): Extension {
	return [createCastMarkerViewPlugin(logger)] as Extension;
}
