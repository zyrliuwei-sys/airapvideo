/**
 * Authoritative pricing catalog.
 *
 * The checkout API uses this as the SOURCE OF TRUTH for price/credits/duration.
 * Any price, credits, or plan info sent by the client is IGNORED — only the
 * product_id is honored, and everything else is looked up here.
 *
 * To change pricing, edit this file and redeploy. Admin UI cannot alter prices.
 */

import { PaymentInterval, PaymentType } from '@/core/payment/types';

import { resolveDuetCredits } from './hotel-lobby-pricing';

export type PricingPlanInfo = {
  name: string;
  interval: PaymentInterval;
  intervalCount: number;
};

export type PricingProduct = {
  productId: string;
  productName: string;
  planName: string;
  description: string;
  type: PaymentType;
  priceInCents: number;
  currency: string;
  credits: number;
  videoCount?: number;
  creditsValidDays?: number;
  plan?: PricingPlanInfo;
};

/** One-time packs grant exactly 1, 3 or 5 fixed-format videos. Monthly plans
 * retain their existing terms. Product IDs remain stable for payment history.
 */
export const pricingCatalog: Record<string, PricingProduct> = {
  pack_starter: {
    productId: 'pack_starter',
    productName: 'Starter Pack',
    planName: 'Starter Pack',
    description: '1 rap video',
    type: PaymentType.ONE_TIME,
    priceInCents: 990,
    currency: 'usd',
    credits: 440,
    videoCount: 1,
  },
  pack_standard: {
    productId: 'pack_standard',
    productName: 'Standard Pack',
    planName: 'Standard Pack',
    description: '3 rap videos',
    type: PaymentType.ONE_TIME,
    priceInCents: 1990,
    currency: 'usd',
    credits: 1320,
    videoCount: 3,
  },
  pack_pro: {
    productId: 'pack_pro',
    productName: 'Pro Pack',
    planName: 'Pro Pack',
    description: '5 rap videos',
    type: PaymentType.ONE_TIME,
    priceInCents: 2990,
    currency: 'usd',
    credits: 2200,
    videoCount: 5,
  },
  basic_monthly: {
    productId: 'basic_monthly',
    productName: 'Basic',
    planName: 'Basic Monthly',
    description: 'Basic Monthly',
    type: PaymentType.SUBSCRIPTION,
    priceInCents: 2300,
    currency: 'usd',
    credits: 2200,
    plan: {
      name: 'Basic',
      interval: PaymentInterval.MONTH,
      intervalCount: 1,
    },
  },
  pro_monthly: {
    productId: 'pro_monthly',
    productName: 'Pro',
    planName: 'Pro Monthly',
    description: 'Pro Monthly',
    type: PaymentType.SUBSCRIPTION,
    priceInCents: 4400,
    currency: 'usd',
    credits: 4400,
    plan: {
      name: 'Pro',
      interval: PaymentInterval.MONTH,
      intervalCount: 1,
    },
  },
  studio_monthly: {
    productId: 'studio_monthly',
    productName: 'Studio',
    planName: 'Studio Monthly',
    description: 'Studio Monthly',
    type: PaymentType.SUBSCRIPTION,
    priceInCents: 8800,
    currency: 'usd',
    credits: 8800,
    plan: {
      name: 'Studio',
      interval: PaymentInterval.MONTH,
      intervalCount: 1,
    },
  },
};

export function getPricingProduct(productId: string): PricingProduct | null {
  if (!productId) return null;
  return pricingCatalog[productId] ?? null;
}

export function listPricingProducts(): PricingProduct[] {
  return Object.values(pricingCatalog);
}

/** Resolve bundle credits from the same per-video price generation consumes. */
export function resolveProductCredits(
  product: PricingProduct,
  configs: Record<string, string> = {}
) {
  return product.videoCount === undefined
    ? product.credits
    : product.videoCount * resolveDuetCredits(configs);
}
