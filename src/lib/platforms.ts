// Where items get listed, and each platform's rules for a listing draft.
// Fee numbers change without notice. They're only used to show an
// approximate take-home amount, so re-check them against each platform's
// seller-fee page now and then and update `feesCheckedOn`.

export type PlatformId = 'facebook' | 'poshmark' | 'ebay';

export interface Platform {
  id: PlatformId;
  name: string;
  titleMax: number;
  descriptionMax: number;
  /** Style guidance passed to the listing writer. */
  voice: string;
  feesCheckedOn: string;
  feeSummary: string;
  estimateFee: (price: number) => number;
  /** Poshmark and Facebook have no public listing API, so drafts are copy-paste. */
  autoPost: boolean;
}

export const PLATFORMS: Platform[] = [
  {
    id: 'facebook',
    name: 'Facebook Marketplace',
    titleMax: 100,
    descriptionMax: 1000,
    voice:
      'Casual and local. Lead with what it is and the condition, mention pickup, ' +
      'keep it short. No hashtags.',
    feesCheckedOn: 'unverified',
    feeSummary: 'Free for local pickup; a percentage fee applies to shipped orders.',
    estimateFee: () => 0,
    autoPost: false,
  },
  {
    id: 'poshmark',
    name: 'Poshmark',
    titleMax: 80,
    descriptionMax: 1500,
    voice:
      'Friendly boutique tone. Brand first in the title. Include size, color, ' +
      'material and measurements when known, then condition details.',
    feesCheckedOn: 'unverified',
    feeSummary: 'Flat fee under $15, percentage of the sale above that.',
    estimateFee: (price) => (price < 15 ? 2.95 : price * 0.2),
    autoPost: false,
  },
  {
    id: 'ebay',
    name: 'eBay',
    titleMax: 80,
    descriptionMax: 4000,
    voice:
      'Keyword-rich title buyers would search for (brand, model, key specs, ' +
      'color). Plain factual description with a clear condition statement.',
    feesCheckedOn: 'unverified',
    feeSummary: 'Final value fee (a percentage, varies by category) plus a small per-order fee.',
    estimateFee: (price) => price * 0.136 + 0.4,
    autoPost: false, // eBay has a Sell API; auto-posting could be added later.
  },
];

export function getPlatform(id: string): Platform | undefined {
  return PLATFORMS.find((p) => p.id === id);
}

export function estimatePayout(platform: Platform, price: number): number {
  return Math.max(0, Math.round((price - platform.estimateFee(price)) * 100) / 100);
}

/** Trims a draft to the platform's limits in case the model overshoots. */
export function fitToLimits(platform: Platform, title: string, description: string) {
  const clip = (s: string, max: number) =>
    s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…';
  return {
    title: clip(title.trim(), platform.titleMax),
    description: clip(description.trim(), platform.descriptionMax),
  };
}
