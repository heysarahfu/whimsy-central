// Update an item's status/platform/prices, or delete it.
import type { APIRoute } from 'astro';
import { STATUSES, deleteItem, getItem, updateItem, type Status } from '../../../../lib/items';
import { getPlatform } from '../../../../lib/platforms';

function num(v: FormDataEntryValue | null): number | null {
  const n = Number(String(v ?? '').replace(/[$,\s]/g, ''));
  return String(v ?? '').trim() && Number.isFinite(n) ? n : null;
}

export const POST: APIRoute = async ({ params, request, redirect }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id) || !(await getItem(id))) {
    return new Response('Item not found', { status: 404 });
  }

  const form = await request.formData();
  if (form.get('action') === 'delete') {
    await deleteItem(id);
    return redirect('/resale/history', 303);
  }

  const status = String(form.get('status')) as Status;
  if (!STATUSES.includes(status)) return new Response('Bad status', { status: 400 });
  const platform = String(form.get('platform') ?? '');

  await updateItem(id, {
    status,
    platform: getPlatform(platform) ? platform : null,
    listed_price: num(form.get('listed_price')),
    sold_price: status === 'sold' ? num(form.get('sold_price')) : null,
  });
  return redirect(`/resale/item/${id}`, 303);
};
