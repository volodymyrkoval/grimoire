export function basename(path: string): string {
  if (path === '') {
    return '';
  }

  const trimmed = path.replace(/\/$/, '');
  const segments = trimmed.split('/');
  return segments[segments.length - 1];
}
