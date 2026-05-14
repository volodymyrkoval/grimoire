export interface PortalScheme {
  scheme: 'http' | 'https';
  hostWithoutScheme: string;
}

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
