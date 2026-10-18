import { ApiError } from './client';
import type { ErrorResponse } from './types';

/** The signed-in person, as returned by query-service's /api/v1/auth endpoints. */
export interface Operator {
  id: number;
  username: string;
  displayName: string;
  email?: string | null;
  createdAt: string;
  /** Present only when a profile photo exists; changes whenever the photo is replaced. */
  avatarUpdatedAt?: string | null;
}

export interface Session {
  token: string;
  expiresAt: string;
  operator: Operator;
}

const AUTH_PREFIX = '/api/v1/auth';
const STORAGE_KEY = 'hyperguard.session';

/**
 * The token is kept in this browser so a reload does not sign the operator out. Storage can be
 * blocked (private windows), in which case the session simply lasts as long as the tab.
 */
export function loadStoredSession(): Session | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const session = JSON.parse(raw) as Session;
    return new Date(session.expiresAt).getTime() > Date.now() ? session : null;
  } catch {
    return null;
  }
}

export function storeSession(session: Session | null): void {
  try {
    if (session) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Session is kept in memory only.
  }
}

async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, headers, ...rest } = init;
  const response = await fetch(`${AUTH_PREFIX}${path}`, {
    ...rest,
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  if (!response.ok) {
    let body: ErrorResponse | null = null;
    try {
      body = (await response.json()) as ErrorResponse;
    } catch {
      body = null;
    }
    throw new ApiError(body?.message ?? `${response.status} ${response.statusText}`, response.status, body);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

function jsonBody(body: unknown): RequestInit {
  return { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } };
}

export function signIn(username: string, password: string): Promise<Session> {
  return request('/login', { method: 'POST', ...jsonBody({ username, password }) });
}

export function register(input: {
  username: string;
  password: string;
  displayName: string;
  email?: string;
}): Promise<Session> {
  return request('/register', { method: 'POST', ...jsonBody(input) });
}

export function signOut(token: string): Promise<void> {
  return request('/logout', { method: 'POST', token });
}

export function fetchMe(token: string, signal?: AbortSignal): Promise<Operator> {
  return request('/me', { token, signal });
}

export function updateProfile(token: string, input: { displayName: string; email?: string }): Promise<Operator> {
  return request('/me', { method: 'PUT', token, ...jsonBody(input) });
}

export function changePassword(token: string, currentPassword: string, newPassword: string): Promise<void> {
  return request('/me/password', { method: 'PUT', token, ...jsonBody({ currentPassword, newPassword }) });
}

export function uploadAvatar(token: string, image: Blob, fileName: string): Promise<Operator> {
  const form = new FormData();
  form.append('file', image, fileName);
  // No Content-Type header: the browser sets the multipart boundary itself.
  return request('/me/avatar', { method: 'PUT', token, body: form });
}

export function removeAvatar(token: string): Promise<Operator> {
  return request('/me/avatar', { method: 'DELETE', token });
}

/** The photo is private, so it is fetched with the bearer header rather than linked by URL. */
export async function fetchAvatarBlob(token: string, signal?: AbortSignal): Promise<Blob | null> {
  const response = await fetch(`${AUTH_PREFIX}/me/avatar`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new ApiError(`${response.status} ${response.statusText}`, response.status, null);
  }
  return response.blob();
}
