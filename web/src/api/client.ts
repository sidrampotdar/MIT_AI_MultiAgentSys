/**
 * Central API client attaching JWT bearer tokens and handling 401/403 responses.
 */

const BASE_URL = '';

export interface ApiErrorResponse {

  message: string;
  detail?: string | any;
  status: number;
}

export class ApiError extends Error {
  status: number;
  detail?: any;

  constructor(status: number, message: string, detail?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

let onUnauthorizedCallback: (() => void) | null = null;
let onForbiddenCallback: ((detail: string) => void) | null = null;

export function registerAuthErrorHandlers(
  onUnauthorized: () => void,
  onForbidden: (detail: string) => void
) {
  onUnauthorizedCallback = onUnauthorized;
  onForbiddenCallback = onForbidden;
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('onboarding_access_token');
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const activePersona = localStorage.getItem('onboarding_active_persona');
  if (activePersona) {
    headers.set('X-User-Role', activePersona);
  }

  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      if (onUnauthorizedCallback) {
        onUnauthorizedCallback();
      }
      throw new ApiError(401, 'Session expired or unauthenticated. Please select a persona.');
    }

    if (response.status === 403) {
      let detailMsg = 'You lack the required role permission for this operation.';
      try {
        const body = await response.json();
        detailMsg = body.detail || detailMsg;
      } catch {
        // ignore json parse fail
      }
      if (onForbiddenCallback) {
        onForbiddenCallback(detailMsg);
      }
      throw new ApiError(403, detailMsg);
    }

    if (!response.ok) {
      let errorMsg = `HTTP Error ${response.status}: ${response.statusText}`;
      let detail: any = null;
      try {
        const body = await response.json();
        detail = body.detail || body.message || body;
        if (typeof detail === 'string') {
          errorMsg = detail;
        } else if (detail) {
          errorMsg = JSON.stringify(detail);
        }
      } catch {
        // use fallback message
      }
      throw new ApiError(response.status, errorMsg, detail);
    }

    // 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  } catch (err: any) {
    if (err instanceof ApiError) {
      throw err;
    }
    throw new ApiError(0, err.message || 'Network error connecting to API');
  }
}

apiClient.get = <T>(endpoint: string, options?: RequestInit) =>
  apiClient<T>(endpoint, { ...options, method: 'GET' });
apiClient.post = <T>(endpoint: string, body?: any, options?: RequestInit) =>
  apiClient<T>(endpoint, {
    ...options,
    method: 'POST',
    body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });
apiClient.patch = <T>(endpoint: string, body?: any, options?: RequestInit) =>
  apiClient<T>(endpoint, {
    ...options,
    method: 'PATCH',
    body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });
apiClient.delete = <T>(endpoint: string, options?: RequestInit) =>
  apiClient<T>(endpoint, { ...options, method: 'DELETE' });

export const api = apiClient;
