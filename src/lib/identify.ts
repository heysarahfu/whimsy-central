// Sends an item photo to Claude and gets back an identification, a price
// range, and a listing draft for each platform.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { env } from 'cloudflare:workers';
import { PLATFORMS, SELLER_FACTS, fitToLimits, type PlatformId } from './platforms';

const MODEL = 'claude-opus-5';

// Plain strings rather than z.enum: the SDK can't send enum constraints in
// the output schema, so an off-list value would fail validation afterwards.
// Values are normalised below instead.
const Draft = z.object({
  platform: z.string().describe('One of: facebook, poshmark, ebay'),
  title: z.string(),
  description: z.string(),
});

const Identification = z.object({
  item_name: z.string().describe('What the item is, specific enough to search for'),
  brand: z.string().nullable().describe('Brand or maker, or null if not identifiable'),
  category: z.string(),
  condition: z
    .string()
    .describe('One of: new with tags, new without tags, like new, good, fair, poor'),
  condition_notes: z.string().describe('Real flaws in the seller\'s voice, or empty if none'),
  confidence: z.string().describe('One of: high, medium, low'),
  price_low: z.number(),
  price_high: z.number(),
  suggested_price: z.number(),
  price_reasoning: z.string().describe('One or two sentences on how the price was chosen'),
  drafts: z.array(Draft),
});

export type IdentifyResult = z.infer<typeof Identification>;

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

export interface ItemImage {
  base64: string;
  mediaType: ImageMediaType;
}

function systemPrompt(): string {
  const rules = PLATFORMS.map(
    (p) =>
      `- ${p.id} (${p.name}): title at most ${p.titleMax} characters, ` +
      `description at most ${p.descriptionMax} characters. ${p.voice}`,
  ).join('\n');

  return `You help a casual reseller price and list secondhand items in the US.

You may get several photos of the same item, such as the front, the back, and a close-up of the label or tag. Read labels and tags carefully: they are the best source for brand, size, and material, so use what they say over guesses from the other photos.

From the photos (and any notes from the seller), identify the item, judge its condition, and estimate a realistic used resale price in USD: what it actually sells for secondhand, not its original retail price. If you can't tell the brand or model, say so and lower your confidence rather than guessing.

Then write one listing draft per platform:
${rules}

How to write the listings:
- Write as the seller, in first person, as if you own the item and are describing it to a buyer. Never write as someone looking at photos.
- Never mention the photos or what they do or don't show: no "in the photo", "pictured", "visible", "appears to", "I can't see", "not shown", or "from what I can tell".
- Ignore anything that comes from how the item was photographed or stored: wrinkles and creases, lighting, color cast, background, hangers, how it's folded or laid out. None of these are flaws.
- Mention a real flaw (a stain, hole, pilling, missing button, scuff) only if it clearly belongs to the item itself, and state it plainly the way a seller would ("small mark near the hem").
- If a detail is unknown, such as a size you couldn't read, leave it out rather than explaining why it's missing.
- Only include details you have from the item, its tags, or the seller's notes. Never invent sizes, measurements, materials, or flaws.
- Facts about the seller you may mention where they fit naturally: ${SELLER_FACTS.join('; ') || 'none'}.
- Beyond those, don't make promises or claims about the seller or how they sell (pickup or delivery options, smoke-free or pet-free home, payment methods, shipping speed or packaging, returns, how often it was worn or washed) unless the seller's notes say so. Skip boilerplate like "please review all photos" or "happy to hold for pickup".

The condition_notes field follows the same rules: real flaws only, in the seller's voice, or an empty string if there are none.`;
}

export async function identifyItem(
  images: ItemImage[],
  sellerNotes: string,
): Promise<IdentifyResult> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: systemPrompt(),
    messages: [
      {
        role: 'user',
        content: [
          ...images.flatMap((img, i) => [
            { type: 'text' as const, text: `Photo ${i + 1} of ${images.length}:` },
            {
              type: 'image' as const,
              source: { type: 'base64' as const, media_type: img.mediaType, data: img.base64 },
            },
          ]),
          {
            type: 'text',
            text: sellerNotes.trim()
              ? `Seller's notes: ${sellerNotes.trim()}`
              : 'No notes from the seller.',
          },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(Identification) },
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('Claude declined to identify these photos. Try different photos.');
  }
  const result = response.parsed_output;
  if (!result) {
    throw new Error(`Couldn't read Claude's answer (stop reason: ${response.stop_reason}).`);
  }

  // Keep exactly one draft per platform, trimmed to its limits.
  const drafts = PLATFORMS.map((p) => {
    const d = result.drafts.find((x) => x.platform.trim().toLowerCase() === p.id) ?? {
      platform: p.id as PlatformId,
      title: result.item_name,
      description: '',
    };
    return { platform: p.id, ...fitToLimits(p, d.title, d.description) };
  });

  return {
    ...result,
    condition: result.condition.trim().toLowerCase(),
    confidence: result.confidence.trim().toLowerCase(),
    drafts,
  };
}
