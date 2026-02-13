export type PricingPlanId = 'free' | 'monthly' | 'yearly';

export function parsePricingPlan(value: string | null | undefined): PricingPlanId {
  if (value === 'monthly' || value === 'yearly') {
    return value;
  }
  return 'free';
}

export function resolveEffectivePlan(plan: PricingPlanId, isBetaTester: boolean): PricingPlanId {
  return isBetaTester ? 'yearly' : plan;
}

export function isPaidPlan(plan: PricingPlanId) {
  return plan === 'monthly' || plan === 'yearly';
}
