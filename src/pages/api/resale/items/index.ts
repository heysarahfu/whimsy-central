// Upload a photo: store it, have Claude identify and price it, save the item.
import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { env } from 'cloudflare:workers';
import { identifyItem, type ImageMediaType } from '../../../../lib/identify';
import { insertItem } from '../../../../lib/items';

const ALLOWED: ImageMediaType[] = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 5 * 1024 * 1024; // Claude's per-image limit

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const photo = form.get('photo');
  const notes = String(form.get('notes') ?? '').slice(0, 1000);

  if (!(photo instanceof File) || photo.size === 0) {
    return new Response('Please choose a photo.', { status: 400 });
  }
  const mediaType = photo.type as ImageMediaType;
  if (!ALLOWED.includes(mediaType)) {
    return new Response('Photos must be JPEG, PNG, WebP or GIF.', { status: 400 });
  }
  if (photo.size > MAX_BYTES) {
    return new Response('That photo is over 5 MB. Try a smaller one.', { status: 400 });
  }

  const bytes = new Uint8Array(await photo.arrayBuffer());
  const ext = mediaType.split('/')[1];
  const key = `items/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
  await env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: mediaType } });

  try {
    const result = await identifyItem(toBase64(bytes), mediaType, notes);
    const id = await insertItem(key, notes, result);
    return redirect(`/resale/item/${id}`, 303);
  } catch (err) {
    await env.PHOTOS.delete(key);
    console.error('identify failed', err);
    let message = 'Something went wrong. Please try again.';
    if (err instanceof Anthropic.AuthenticationError) {
      message = 'The Claude API key isn’t set up correctly (check the ANTHROPIC_API_KEY secret).';
    } else if (err instanceof Anthropic.RateLimitError) {
      message = 'Claude is busy right now. Wait a minute and try again.';
    } else if (err instanceof Anthropic.APIError) {
      message = `Claude couldn’t process that photo (error ${err.status}). Please try again.`;
    } else if (err instanceof Error) {
      message = err.message;
    }
    return new Response(message, { status: 502 });
  }
};
