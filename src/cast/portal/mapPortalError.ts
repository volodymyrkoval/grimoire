export type PortalErrorInput =
  | { kind: 'timeout' }
  | { kind: 'network'; message: string; host: string }
  | { kind: 'http'; status: number; body: string };

export interface PortalErrorOutput {
  notice: string;
  // 'none' is reserved for retryable errors that should surface a notice but not write an error log entry.
  logEvent: 'error' | 'none';
}

const HTTP_STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

export function mapPortalError(input: PortalErrorInput): PortalErrorOutput {
  switch (input.kind) {
    case 'timeout':
      return {
        notice: 'Portal request timed out.',
        logEvent: 'error',
      };

    case 'network':
      return {
        notice: `Couldn't reach portal at ${input.host}: ${input.message}.`,
        logEvent: 'error',
      };

    case 'http': {
      if (input.status === 401) {
        return {
          notice: 'Portal rejected credentials. Check your portal username and password in settings.',
          logEvent: 'error',
        };
      }

      let bodyPart = input.body;
      if (!bodyPart) {
        bodyPart = HTTP_STATUS_TEXT[input.status] || String(input.status);
      } else if (bodyPart.length > 200) {
        bodyPart = bodyPart.slice(0, 200);
      }

      return {
        notice: `Portal returned ${input.status}: ${bodyPart}.`,
        logEvent: 'error',
      };
    }

    default: {
      const exhaustive: never = input;
      return exhaustive;
    }
  }
}
