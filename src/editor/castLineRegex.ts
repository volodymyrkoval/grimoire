/** Matches `@cast` at position 0 of a line, followed by whitespace or end-of-line. Case-sensitive; rejects `@casting`, `@castaway`, indented variants. */
export const CAST_LINE_REGEX = /^@cast(?=\s|$)/;
