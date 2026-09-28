// Password gate for the private resale tool. A successful login sets a
// cookie holding an expiry timestamp signed with SESSION_SECRET, so no
// server-side session store is needed.
import { env } from 'cloudflare:workers';

export const SESSION_COOKIE = 'resale_session';
const SESSION_DAYS = 30;

const encoder = new TextEncoder();

async function hmac(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(env.SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Constant-time comparison so response timing doesn't leak how much matched.
async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export function isConfigured(): boolean {
  return Boolean(env.RESALE_PASSWORD && env.SESSION_SECRET);
}

export async function checkPassword(attempt: string): Promise<boolean> {
  if (!isConfigured()) return false;
  return safeEqual(attempt, env.RESALE_PASSWORD);
}

export async function createSessionToken(): Promise<{ token: string; maxAge: number }> {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const expires = String(Date.now() + maxAge * 1000);
  return { token: `${expires}.${await hmac(expires)}`, maxAge };
}

export async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!token || !isConfigured()) return false;
  const [expires, sig] = token.split('.');
  if (!expires || !sig || Number(expires) < Date.now()) return false;
  return safeEqual(sig, await hmac(expires));
}
