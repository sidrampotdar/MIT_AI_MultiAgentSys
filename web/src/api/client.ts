import { CurrentUser, Role } from '../types';

const TOKEN_KEY = 'mit_ai_token';
const USER_KEY = 'mit_ai_user';

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

class ApiClient {
  private token: string | null = null;
  private currentUser: CurrentUser | null = null;

  constructor() {
    this.token = localStorage.getItem(TOKEN_KEY);
    const userStr = localStorage.getItem(USER_KEY);
    if (userStr) {
      try {
        this.currentUser = JSON.parse(userStr);
      } catch {
        this.currentUser = null;
      }
    }
  }

  getToken(): string | null {
    return this.token;
  }

  getCurrentUser(): CurrentUser | null {
    return this.currentUser;
  }

  setSession(token: string, user: CurrentUser) {
    this.token = token;
    this.currentUser = user;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  clearSession() {
    this.token = null;
    this.currentUser = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  async login(username: string, password: string = 'correct-horse-battery'): Promise<CurrentUser> {
    const res = await this.request<{ access_token: string; user: CurrentUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
      skipAuth: true,
    });
    this.setSession(res.access_token, res.user);
    return res.user;
  }

  async switchPersona(role: Role): Promise<CurrentUser> {
    return this.login(role, 'correct-horse-battery');
  }

  async request<T>(
    endpoint: string,
    options: RequestInit & { skipAuth?: boolean; params?: Record<string, string | number | boolean | undefined> } = {}
  ): Promise<T> {
    let url = endpoint;
    if (options.params) {
      const searchParams = new URLSearchParams();
      Object.entries(options.params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) {
          searchParams.append(k, String(v));
        }
      });
      const qs = searchParams.toString();
      if (qs) {
        url += (url.includes('?') ? '&' : '?') + qs;
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (!options.skipAuth && this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401 && !options.skipAuth) {
      // Token may be invalid/expired; try guest or stay cleared
      console.warn('API 401 Unauthorized for endpoint:', endpoint);
    }

    if (!response.ok) {
      let errorData: any = {};
      try {
        errorData = await response.json();
      } catch {
        errorData = { detail: response.statusText };
      }
      throw new ApiError(errorData.detail || `Request failed with status ${response.status}`, response.status, errorData);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  get<T>(endpoint: string, params?: Record<string, string | number | boolean | undefined>) {
    return this.request<T>(endpoint, { method: 'GET', params });
  }

  post<T>(endpoint: string, body?: any) {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  patch<T>(endpoint: string, body?: any) {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const api = new ApiClient();
