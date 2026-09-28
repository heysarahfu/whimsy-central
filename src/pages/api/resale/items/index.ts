// Upload a photo: store it, have Claude identify and price it, save the item.
import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { env } from 'cloudflare:workers';
import { identifyItem, type ImageMediaType, type ItemImage } from '../../../../lib/identify';
import { insertItem } from '../../../../lib/items';

const ALLOWED: ImageMediaType[] = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 5 * 1024 * 1024; // Claude's per-image limit
const MAX_PHOTOS = 6;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const photos = form.getAll('photo').filter((p): p is File => p instanceof File && p.size > 0);
  const notes = String(form.get('notes') ?? '').slice(0, 1000);

  if (photos.length === 0) {
    return new Response('Please add at least one photo.', { status: 400 });
  }
  if (photos.length > MAX_PHOTOS) {
    return new Response(`Up to ${MAX_PHOTOS} photos per item, please.`, { status: 400 });
  }
  for (const photo of photos) {
    if (!ALLOWED.includes(photo.type as ImageMediaType)) {
      return new Response('Photos must be JPEG, PNG, WebP or GIF.', { status: 400 });
    }
    if (photo.size > MAX_BYTES) {
      return new Response('One of the photos is over 5 MB. Try a smaller one.', { status: 400 });
    }
  }

  const folder = `items/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}`;
  const images: (ItemImage & { key: string; bytes: Uint8Array })[] = await Promise.all(
    photos.map(async (photo, i) => {
      const mediaType = photo.type as ImageMediaType;
      const bytes = new Uint8Array(await photo.arrayBuffer());
      const key = `${folder}/${i + 1}.${mediaType.split('/')[1]}`;
      return { key, bytes, mediaType, base64: toBase64(bytes) };
    }),
  );
  const keys = images.map((img) => img.key);
  await Promise.all(
    images.map((img) =>
      env.PHOTOS.put(img.key, img.bytes, { httpMetadata: { contentType: img.mediaType } }),
    ),
  );

  try {
    const result = await identifyItem(images, notes);
    const id = await insertItem(keys, notes, result);
    return redirect(`/resale/item/${id}`, 303);
  } catch (err) {
    await env.PHOTOS.delete(keys);
    console.error('identify failed', err);
    let message = 'Something went wrong. Please try again.';
    if (err instanceof Anthropic.AuthenticationError) {
      message = 'The Claude API key isn’t set up correctly (check the ANTHROPIC_API_KEY secret).';
    } else if (err instanceof Anthropic.RateLimitError) {
      message = 'Claude is busy right now. Wait a minute and try again.';
    } else if (err instanceof Anthropic.APIError) {
      // Include the API's own explanation so problems can be diagnosed.
      const detail = (err.error as { error?: { message?: string } } | undefined)?.error?.message;
      message = `Claude couldn’t process the photos (error ${err.status}${detail ? `: ${detail}` : ''}).`;
    } else if (err instanceof Error) {
      message = err.message;
    }
    return new Response(message, { status: 502 });
  }
};
