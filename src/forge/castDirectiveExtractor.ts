import { CAST_LINE_REGEX } from '../editor/castLineRegex';

export function countCastDirectives(body: string): number {
  return body.split('\n').filter(line => CAST_LINE_REGEX.test(line)).length;
}

/** Extracts @cast directive lines from a spell body; available for future consumers (e.g. directive-preview panel) but not called by ForgeUpdateImprinter (spell content reaches meta-spell via executeOnNote). */
export function extractCastDirectives(body: string): string[] {
  return body.split('\n').filter(line => CAST_LINE_REGEX.test(line));
}
