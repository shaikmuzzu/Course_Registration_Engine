'use client';

import { decodeJwtPayload, isTokenExpired } from './api';

// ---------------------------------------------------------------------------
// Token storage and retrieval
// ---------------------------------------------------------------------------

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

export function setToken(token: string): void {
  localStorage.setItem('token', token);
}

export function removeToken(): void {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

// ---------------------------------------------------------------------------
// User session
// ---------------------------------------------------------------------------

export interface UserSession {
  userId: string;
  role: 'STUDENT' | 'ADMIN';
}

export function getSession(): UserSession | null {
  const token = getToken();
  if (!token) return null;

  if (isTokenExpired(token)) {
    removeToken();
    return null;
  }

  const payload = decodeJwtPayload(token);
  if (!payload) return null;

  return { userId: payload.userId, role: payload.role as 'STUDENT' | 'ADMIN' };
}

export function isAuthenticated(): boolean {
  return getSession() !== null;
}

export function isAdmin(): boolean {
  return getSession()?.role === 'ADMIN';
}

// ---------------------------------------------------------------------------
// Redirect helpers (client-side only)
// ---------------------------------------------------------------------------

export function redirectToLogin(): void {
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}

export function redirectToDashboard(): void {
  const session = getSession();
  if (!session) {
    redirectToLogin();
    return;
  }
  if (session.role === 'ADMIN') {
    window.location.href = '/dashboard/admin';
  } else {
    window.location.href = '/dashboard/student';
  }
}
