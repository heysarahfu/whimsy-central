import { env } from 'cloudflare:workers';
import type { IdentifyResult } from './identify';

export const STATUSES = ['draft', 'listed', 'sold', 'donated', 'kept'] as const;
export type Status = (typeof STATUSES)[number];

export interface ItemRow {
  id: number;
  created_at: string;
  photo_key: string; // cover photo
  photo_keys: string | null; // JSON array of every photo, cover first
  brand: string | null;
  item_name: string;
  category: string | null;
  condition: string | null;
  notes: string | null;
  price_low: number | null;
  price_high: number | null;
  suggested_price: number | null;
  price_reasoning: string | null;
  drafts_json: string;
  platform: string | null;
  listed_price: number | null;
  status: Status;
  sold_price: number | null;
  sold_at: string | null;
}

export function photoKeys(item: ItemRow): string[] {
  const keys = item.photo_keys ? (JSON.parse(item.photo_keys) as string[]) : [];
  return keys.length ? keys : [item.photo_key];
}

export async function insertItem(
  photoKeys: string[],
  notes: string,
  r: IdentifyResult,
): Promise<number> {
  const row = await env.DB.prepare(
    `INSERT INTO items (photo_key, photo_keys, brand, item_name, category, condition, notes,
       price_low, price_high, suggested_price, price_reasoning, drafts_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(
      photoKeys[0],
      JSON.stringify(photoKeys),
      r.brand,
      r.item_name,
      r.category,
      `${r.condition}${r.condition_notes ? ` — ${r.condition_notes}` : ''}`,
      notes || null,
      r.price_low,
      r.price_high,
      r.suggested_price,
      `${r.price_reasoning} (confidence: ${r.confidence})`,
      JSON.stringify(r.drafts),
    )
    .first<{ id: number }>();
  if (!row) throw new Error('Saving the item failed.');
  return row.id;
}

export function getItem(id: number) {
  return env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first<ItemRow>();
}

export async function listItems(status?: Status): Promise<ItemRow[]> {
  const stmt = status
    ? env.DB.prepare('SELECT * FROM items WHERE status = ? ORDER BY created_at DESC').bind(status)
    : env.DB.prepare('SELECT * FROM items ORDER BY created_at DESC');
  return (await stmt.all<ItemRow>()).results;
}

export async function updateItem(
  id: number,
  fields: {
    status: Status;
    platform: string | null;
    listed_price: number | null;
    sold_price: number | null;
  },
) {
  await env.DB.prepare(
    `UPDATE items SET status = ?, platform = ?, listed_price = ?, sold_price = ?,
       sold_at = CASE WHEN ? = 'sold' THEN COALESCE(sold_at, datetime('now')) ELSE NULL END
     WHERE id = ?`,
  )
    .bind(fields.status, fields.platform, fields.listed_price, fields.sold_price, fields.status, id)
    .run();
}

export async function deleteItem(id: number) {
  const item = await getItem(id);
  if (!item) return;
  await env.PHOTOS.delete(photoKeys(item));
  await env.DB.prepare('DELETE FROM items WHERE id = ?').bind(id).run();
}

export function money(n: number | null | undefined): string {
  return n == null ? '—' : `$${n.toFixed(n % 1 ? 2 : 0)}`;
}
