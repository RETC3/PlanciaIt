import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ResolvedSession } from '../auth/session.service.js';

/** The subset of the Express request the API relies on. */
export interface HttpRequest extends IncomingMessage {
  /** Client address, honouring the configured "trust proxy" setting. */
  ip?: string;
  /** Set by AccessGuard for authenticated routes. */
  session?: ResolvedSession;
}

export type HttpResponse = ServerResponse;

export function clientIp(request: HttpRequest): string {
  return request.ip ?? request.socket.remoteAddress ?? 'unknown';
}

export function userAgent(request: HttpRequest): string | null {
  const value = request.headers['user-agent'];
  return value ? value.slice(0, 512) : null;
}

export function readCookie(request: HttpRequest, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return undefined;
}

export interface CookieOptions {
  maxAgeSeconds: number;
}

/** Always HttpOnly, Secure and SameSite=Strict, as required for session cookies. */
export function setCookie(
  response: HttpResponse,
  name: string,
  value: string,
  options: CookieOptions,
): void {
  const cookie = [
    `${name}=${value}`,
    'Path=/',
    `Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
  ].join('; ');
  response.appendHeader('Set-Cookie', cookie);
}

export function clearCookie(response: HttpResponse, name: string): void {
  setCookie(response, name, '', { maxAgeSeconds: 0 });
}
