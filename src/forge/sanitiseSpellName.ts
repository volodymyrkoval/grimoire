export function sanitiseSpellName(input: string): string {
  // Replace illegal characters (< > : " / \ | ? * and control chars) with dash
  // eslint-disable-next-line no-control-regex
  const replaced = input.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-");

  // Trim whitespace from edges
  const trimmed = replaced.trim();

  // Collapse runs of dashes to single dash
  const collapsed = trimmed.replace(/-+/g, "-");

  // Trim leading and trailing dashes
  const finalTrimmed = collapsed.replace(/^-+|-+$/g, "");

  return finalTrimmed;
}
