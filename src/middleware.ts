import { defineMiddleware } from 'astro:middleware';
import { SESSION_COOKIE, isValidSession } from './lib/auth';

const PUBLIC_RESALE_PATHS = new Set(['/resale/login', '/resale/login/']);

function isProtected(pathname: string): boolean {
  if (PUBLIC_RESALE_PATHS.has(pathname)) return false;
  return (
    pathname === '/resale' ||
    pathname.startsWith('/resale/') ||
    pathname.startsWith('/api/resale/')
  );
}

export const onRequest = defineMiddleware(async (context, next) => {
  // Prerendered catalog pages have no request cookies at build time.
  if (context.isPrerendered || !isProtected(context.url.pathname)) {
    return next();
  }

  const token = context.cookies.get(SESSION_COOKIE)?.value;
  if (!(await isValidSession(token))) {
    if (context.url.pathname.startsWith('/api/')) {
      return new Response('Not logged in', { status: 401 });
    }
    return context.redirect('/resale/login');
  }

  const response = await next();
  // Keep the private tool out of search engines and shared caches.
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
});
