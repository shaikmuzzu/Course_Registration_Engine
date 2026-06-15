export interface TokenPayload {
  userId: string;
  role: 'ADMIN' | 'STUDENT';
  iat: number;
  exp: number;
}

/**
 * Decode JWT payload without verification (client-side use only).
 * Verification happens on the server for every protected request.
 */
export function decodeToken(token: string): TokenPayload | null {
  try {
    const payloadBase64 = token.split('.')[1];
    const decoded = JSON.parse(atob(payloadBase64));
    return decoded as TokenPayload;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

export function getPayload(): TokenPayload | null {
  const token = getToken();
  if (!token) return null;
  return decodeToken(token);
}

export function getRole(): 'ADMIN' | 'STUDENT' | null {
  return getPayload()?.role ?? null;
}

export function isAuthenticated(): boolean {
  const payload = getPayload();
  if (!payload) return false;
  // Check token is not expired
  return payload.exp * 1000 > Date.now();
}

export function logout(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('token');
    window.location.href = '/login';
  }
}
