/**
 * Parsed HTTP(S) scheme and host from a URL string.
 */
export interface PortalScheme {
  scheme: 'http' | 'https';
  hostWithoutScheme: string;
}

/**
 * Extract the scheme (http or https, defaulting to https) and host from a URL string.
 * Handles URLs with and without scheme prefixes.
 */
export function parsePortalScheme(host: string): PortalScheme {
  const lowerHost = host.toLowerCase();

  if (lowerHost.startsWith('https://')) {
    return {
      scheme: 'https',
      hostWithoutScheme: host.slice(8),
    };
  }

  if (lowerHost.startsWith('http://')) {
    return {
      scheme: 'http',
      hostWithoutScheme: host.slice(7),
    };
  }

  return {
    scheme: 'https',
    hostWithoutScheme: host,
  };
}
