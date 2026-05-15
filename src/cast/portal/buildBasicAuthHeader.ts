/**
 * Build an HTTP Basic Authorization header value from username and password.
 * Uses Buffer in Node.js environments, TextEncoder + btoa in browser environments.
 */
export function buildBasicAuthHeader(user: string, password: string): string {
  const credentials = `${user}:${password}`;

  let base64: string;

  if (typeof Buffer !== 'undefined') {
    base64 = Buffer.from(credentials).toString('base64');
  } else {
    // Encode as UTF-8 first so non-ASCII chars (U+0080 and above) produce correct output
    const encoder = new TextEncoder();
    const bytes = encoder.encode(credentials);
    base64 = btoa(String.fromCharCode(...bytes));
  }

  return `Basic ${base64}`;
}
