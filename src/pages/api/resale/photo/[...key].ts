import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const GET: APIRoute = async ({ params }) => {
  const key = params.key;
  if (!key?.startsWith('items/')) return new Response('Not found', { status: 404 });

  const object = await env.PHOTOS.get(key);
  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  return new Response(object.body, { headers });
};
