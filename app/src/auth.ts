const JWT_KEY = 'jwt';

export function getJwt(): string | null {
  return localStorage.getItem(JWT_KEY) ?? sessionStorage.getItem(JWT_KEY);
}

export function setJwt(token: string, remember = true): void {
  if (remember) {
    localStorage.setItem(JWT_KEY, token);
    sessionStorage.removeItem(JWT_KEY);
  } else {
    sessionStorage.setItem(JWT_KEY, token);
    localStorage.removeItem(JWT_KEY);
  }
}

export function clearAuth(): void {
  localStorage.removeItem(JWT_KEY);
  sessionStorage.removeItem(JWT_KEY);
}

/** Clear stored JWT and redirect to login. Call when a 401 is received. */
export function handleAuthFailure(): void {
  clearAuth();
  window.location.replace(import.meta.env.BASE_URL);
}

export function parseJwt(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}
