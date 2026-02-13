'use client';

import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

import { isPaidPlan, parsePricingPlan, PricingPlanId, resolveEffectivePlan } from '@/lib/constants/pricing';
import { getFirebaseDb } from '@/lib/firebase/client';
import { useAuth } from '@/lib/hooks/useAuth';

interface EntitlementState {
  pricingPlan: PricingPlanId;
  effectivePlan: PricingPlanId;
  isBetaTester: boolean;
  hasPaidAccess: boolean;
  loading: boolean;
}

interface ProfileEntitlementDoc {
  pricing_plan?: unknown;
  is_beta_tester?: unknown;
}

const DEFAULT_PLAN: PricingPlanId = 'free';

const DEFAULT_STATE: EntitlementState = {
  pricingPlan: DEFAULT_PLAN,
  effectivePlan: DEFAULT_PLAN,
  isBetaTester: false,
  hasPaidAccess: false,
  loading: false
};

export function useEntitlement() {
  const { user, loading: authLoading } = useAuth();
  const firestore = getFirebaseDb();
  const [state, setState] = useState<EntitlementState>(DEFAULT_STATE);

  useEffect(() => {
    if (authLoading) {
      setState((current) => ({ ...current, loading: true }));
      return;
    }

    if (!user || !firestore) {
      setState(DEFAULT_STATE);
      return;
    }

    setState((current) => ({ ...current, loading: true }));

    const unsubscribe = onSnapshot(
      doc(firestore, 'profiles', user.uid),
      (snapshot) => {
        const data = (snapshot.data() ?? {}) as ProfileEntitlementDoc;
        const pricingPlan = parsePricingPlan(typeof data.pricing_plan === 'string' ? data.pricing_plan : null);
        const isBetaTester = data.is_beta_tester === true;
        const effectivePlan = resolveEffectivePlan(pricingPlan, isBetaTester);

        setState({
          pricingPlan,
          effectivePlan,
          isBetaTester,
          hasPaidAccess: isPaidPlan(effectivePlan),
          loading: false
        });
      },
      () => {
        setState(DEFAULT_STATE);
      }
    );

    return () => unsubscribe();
  }, [authLoading, firestore, user]);

  return useMemo(() => state, [state]);
}
