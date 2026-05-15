import type { PortalScheme } from './parsePortalScheme';

/**
 * Input fields for constructing a portal URL.
 */
export interface BuildPortalUrlInput {
  parsedScheme: PortalScheme;
  port: string;
  path: string;
}

/**
 * Build a complete URL from scheme, host, port, and path components.
 */
export function buildPortalUrl(input: BuildPortalUrlInput): string {
  const { parsedScheme, port, path } = input;
  const scheme = parsedScheme.scheme;
  const host = parsedScheme.hostWithoutScheme;

  let url = `${scheme}://${host}`;

  if (port) {
    url += `:${port}`;
  }

  if (path) {
    const normalizedPath = path.endsWith('/') ? path.slice(0, -1) : path;
    url += normalizedPath;
  }

  return url;
}
