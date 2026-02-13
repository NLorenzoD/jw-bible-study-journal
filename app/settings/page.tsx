'use client';

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import { Input } from '@/components/shared/inputs';
import { PricingPlanId } from '@/lib/constants/pricing';
import { getFirebaseDb } from '@/lib/firebase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { useEntitlement } from '@/lib/hooks/useEntitlement';
import { useHousehold } from '@/lib/hooks/useHousehold';
import { useUserContext } from '@/lib/hooks/useUserContext';
import { db } from '@/lib/store/db';
import { createId, upsertReminder } from '@/lib/store/repository';

const STREAK_PREFS_KEY = 'streak-inputs';
const SHARING_PREFS_KEY = 'sharing-prefs';

export default function SettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const { userId, householdId, role } = useUserContext();
  const { createInvite, acceptInvite } = useHousehold();
  const { effectivePlan, isBetaTester } = useEntitlement();
  const firestore = getFirebaseDb();

  const reminder = useLiveQuery(() => db.reminders.where('user_id').equals(userId).first(), [userId]);

  const [displayName, setDisplayName] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [inviteStatus, setInviteStatus] = useState<string>('');
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState('20:00');
  const [streakPrefs, setStreakPrefs] = useState<Record<string, boolean>>({
    reading: true,
    journal: true,
    project: true,
    highlight: true
  });
  const [sharingPrefs, setSharingPrefs] = useState<Record<string, boolean>>({
    sharedHighlights: false,
    futureInviteOnly: false
  });
  const [pendingInviteToken, setPendingInviteToken] = useState('');
  const [acceptingInvite, setAcceptingInvite] = useState(false);

  useEffect(() => {
    setReminderEnabled(reminder?.enabled ?? false);
    setReminderTime(reminder?.reminder_time ?? '20:00');
  }, [reminder]);

  useEffect(() => {
    const savedStreak = localStorage.getItem(STREAK_PREFS_KEY);
    if (savedStreak) {
      setStreakPrefs(JSON.parse(savedStreak));
    }

    const savedSharing = localStorage.getItem(SHARING_PREFS_KEY);
    if (savedSharing) {
      setSharingPrefs(JSON.parse(savedSharing));
    }
  }, []);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('invite')?.trim() ?? '';
    if (token) {
      setPendingInviteToken(token);
    }
  }, []);

  useEffect(() => {
    async function loadProfile() {
      if (!firestore || !user) {
        setDisplayName(localStorage.getItem('display-name') ?? '');
        return;
      }

      const snapshot = await getDoc(doc(firestore, 'profiles', user.uid));
      if (snapshot.exists()) {
        const data = snapshot.data() as { display_name?: string };
        setDisplayName(data.display_name ?? user.displayName ?? '');
        return;
      }

      setDisplayName(user.displayName ?? '');
    }

    loadProfile();
  }, [firestore, user]);

  const householdRoleLabel = useMemo(() => (role === 'owner' ? 'Owner' : 'Member'), [role]);
  const inviteMessage = useMemo(
    () => (inviteLink ? `Join my family group on Bible Study Journal: ${inviteLink}` : ''),
    [inviteLink]
  );
  const encodedInviteMessage = useMemo(() => encodeURIComponent(inviteMessage), [inviteMessage]);
  const monthlyPrice = 2;
  const yearlyPrice = 10;
  const yearlyEquivalent = monthlyPrice * 12;
  const yearlySavings = yearlyEquivalent - yearlyPrice;
  const yearlyDiscountPercent = Math.round((yearlySavings / yearlyEquivalent) * 100);

  const pricingPlans = useMemo(
    () => [
      {
        id: 'free' as const,
        label: 'Free',
        priceLabel: '$0',
        cadence: 'forever',
        blurb: 'Everything core is free. Keep all your data, always.',
        features: [
          'Daily reading sessions and streak tracking',
          'Highlights, projects, journal, reminders, and family sync',
          'Full access to create and edit your content',
          'No AI voice features yet',
          'No advanced filters in Highlights and Projects'
        ]
      },
      {
        id: 'monthly' as const,
        label: 'Plus Monthly',
        priceLabel: `$${monthlyPrice}`,
        cadence: '/month',
        blurb: 'Add speed and AI when you want less friction.',
        features: [
          'Everything in Free',
          'Advanced filters and fast find in Highlights',
          'Project filtering by status and focus',
          'Voice AI study assistant (beta)'
        ]
      },
      {
        id: 'yearly' as const,
        label: 'Plus Yearly',
        priceLabel: `$${yearlyPrice}`,
        cadence: '/year',
        blurb: `Best value: save $${yearlySavings}/year (${yearlyDiscountPercent}% off vs monthly).`,
        features: [
          'Everything in Plus Monthly',
          'Priority access to new Voice AI releases',
          'Extended voice AI minutes each month',
          'Early access to future AI capabilities'
        ],
        badge: 'Best value'
      }
    ],
    [yearlyDiscountPercent, yearlyPrice, yearlySavings]
  );
  const activePlan = effectivePlan;

  const processInviteAcceptance = useCallback(
    async (token: string) => {
      if (!token) {
        return;
      }
      if (!user) {
        setInviteStatus('Sign in to accept this family invite.');
        return;
      }

      setAcceptingInvite(true);
      const ok = await acceptInvite(token);
      setAcceptingInvite(false);

      if (!ok) {
        setInviteStatus('Invite could not be accepted. Confirm you are signed in and the invite is still valid.');
        return;
      }

      setPendingInviteToken('');
      setInviteStatus('Family invite accepted. You are now in the family group.');

      const current = new URL(window.location.href);
      current.searchParams.delete('invite');
      const nextUrl = `${current.pathname}${current.search}${current.hash}`;
      window.history.replaceState({}, '', nextUrl);
    },
    [acceptInvite, user]
  );

  useEffect(() => {
    if (!pendingInviteToken || acceptingInvite) {
      return;
    }
    if (authLoading) {
      return;
    }
    if (!user) {
      setInviteStatus('Sign in to accept this family invite.');
      return;
    }

    void processInviteAcceptance(pendingInviteToken);
  }, [acceptingInvite, authLoading, pendingInviteToken, processInviteAcceptance, user]);

  async function saveDisplayName() {
    const next = displayName.trim();

    localStorage.setItem('display-name', next);

    if (firestore && user) {
      await setDoc(
        doc(firestore, 'profiles', user.uid),
        {
          id: user.uid,
          email: user.email ?? null,
          display_name: next,
          updated_at: new Date().toISOString()
        },
        { merge: true }
      );

      await setDoc(
        doc(firestore, 'householdMembers', `${householdId}_${user.uid}`),
        {
          display_name: next || user.displayName || 'Member',
          updated_at: new Date().toISOString()
        },
        { merge: true }
      );
    }

    setInviteStatus('Profile saved.');
  }

  async function makeInvite() {
    if (role !== 'owner') {
      setInviteStatus('Only the family owner can generate invite links.');
      return;
    }

    const link = await createInvite();
    if (!link) {
      setInviteStatus('Could not generate invite link.');
      return;
    }

    setInviteLink(link);
    setInviteStatus('Family invite link generated. Share it with your family members.');
  }

  async function shareInvite() {
    if (!inviteLink) {
      return;
    }

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'Bible Study Journal family invite',
          text: 'Join my family group on Bible Study Journal.',
          url: inviteLink
        });
        setInviteStatus('Invite shared.');
        return;
      } catch {
        // User canceled or share target unavailable; fallback to copy.
      }
    }

    await copyInviteLink();
  }

  async function copyInviteLink() {
    if (!inviteLink || !navigator?.clipboard) {
      setInviteStatus('Could not copy invite link.');
      return;
    }

    try {
      await navigator.clipboard.writeText(inviteLink);
      setInviteStatus('Invite link copied.');
    } catch {
      setInviteStatus('Could not copy invite link.');
    }
  }

  function shareViaSms() {
    if (!inviteMessage) {
      return;
    }
    window.location.href = `sms:?&body=${encodedInviteMessage}`;
  }

  function shareViaWhatsApp() {
    if (!inviteMessage) {
      return;
    }
    window.open(`https://wa.me/?text=${encodedInviteMessage}`, '_blank', 'noopener,noreferrer');
  }

  function shareViaEmail() {
    if (!inviteMessage) {
      return;
    }
    const subject = encodeURIComponent('Join my family group on Bible Study Journal');
    window.location.href = `mailto:?subject=${subject}&body=${encodedInviteMessage}`;
  }

  async function saveReminder() {
    await upsertReminder({
      id: reminder?.id ?? createId(),
      user_id: userId,
      household_id: householdId,
      enabled: reminderEnabled,
      reminder_time: reminderTime,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      last_shown_at: reminder?.last_shown_at ?? null
    });

    setInviteStatus('Reminder settings saved.');
  }

  function toggleStreakInput(key: string) {
    const next = {
      ...streakPrefs,
      [key]: !streakPrefs[key]
    };
    setStreakPrefs(next);
    localStorage.setItem(STREAK_PREFS_KEY, JSON.stringify(next));
  }

  function toggleSharingInput(key: string) {
    const next = {
      ...sharingPrefs,
      [key]: !sharingPrefs[key]
    };
    setSharingPrefs(next);
    localStorage.setItem(SHARING_PREFS_KEY, JSON.stringify(next));
  }

  async function choosePricingPlan(planId: PricingPlanId) {
    if (!firestore || !user) {
      setInviteStatus('Sign in to select a pricing plan.');
      return;
    }

    if (isBetaTester) {
      setInviteStatus('Beta tester access is active: Plus Yearly features are already unlocked.');
      return;
    }

    await setDoc(
      doc(firestore, 'profiles', user.uid),
      {
        id: user.uid,
        email: user.email ?? null,
        pricing_plan: planId,
        is_beta_tester: false,
        updated_at: new Date().toISOString()
      },
      { merge: true }
    );

    setInviteStatus(`Selected ${planId === 'free' ? 'Free' : planId === 'monthly' ? 'Plus Monthly' : 'Plus Yearly'} plan.`);
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h2 className="font-display text-2xl">Profile</h2>
        <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Display name" />
        <Button onClick={saveDisplayName} className="w-full">
          Save profile
        </Button>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-display text-2xl">Family</h2>
        <div className="rounded-xl bg-surface p-3 text-sm">
          <p>
            Family group: <span className="font-semibold">{householdId.slice(0, 8)}</span>
          </p>
          <p>
            Role: <span className="font-semibold">{householdRoleLabel}</span>
          </p>
        </div>
        <Button onClick={makeInvite} className="w-full">
          Generate family invite
        </Button>
        {pendingInviteToken && (
          <div className="space-y-2 rounded-xl bg-surface p-3 text-xs text-muted">
            <p className="font-semibold text-ink">Family invite detected</p>
            <p>Accept this invite to join the shared family group on this account.</p>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => void processInviteAcceptance(pendingInviteToken)}
              disabled={acceptingInvite || authLoading || !user}
            >
              {acceptingInvite ? 'Accepting family invite...' : 'Accept family invite'}
            </Button>
          </div>
        )}
        {inviteLink && (
          <div className="space-y-2 rounded-xl bg-surface p-3 text-xs text-muted">
            <p className="font-semibold text-ink">Invite link</p>
            <a
              href={inviteLink}
              target="_blank"
              rel="noreferrer"
              className="break-all text-accent underline underline-offset-2"
            >
              {inviteLink}
            </a>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={shareInvite}>
                Share
              </Button>
              <Button variant="secondary" onClick={copyInviteLink}>
                Copy link
              </Button>
              <Button variant="secondary" onClick={shareViaSms}>
                SMS
              </Button>
              <Button variant="secondary" onClick={shareViaWhatsApp}>
                WhatsApp
              </Button>
              <Button variant="secondary" onClick={shareViaEmail} className="col-span-2">
                Email
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-display text-2xl">Streak definitions</h2>
        <Toggle label="Reading sessions" value={streakPrefs.reading} onClick={() => toggleStreakInput('reading')} />
        <Toggle label="Journal entries" value={streakPrefs.journal} onClick={() => toggleStreakInput('journal')} />
        <Toggle label="Project activity" value={streakPrefs.project} onClick={() => toggleStreakInput('project')} />
        <Toggle label="Highlights" value={streakPrefs.highlight} onClick={() => toggleStreakInput('highlight')} />
      </Card>

      <Card className="space-y-3">
        <h2 className="font-display text-2xl">Reminders</h2>
        <Toggle label="Daily reminder" value={reminderEnabled} onClick={() => setReminderEnabled((prev) => !prev)} />
        <Input type="time" value={reminderTime} onChange={(event) => setReminderTime(event.target.value)} />
        <Button onClick={saveReminder} className="w-full">
          Save reminders
        </Button>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-display text-2xl">Sharing</h2>
        <Toggle
          label="Share highlights to household by default"
          value={sharingPrefs.sharedHighlights}
          onClick={() => toggleSharingInput('sharedHighlights')}
        />
        <Toggle
          label="Future invite-only external sharing"
          value={sharingPrefs.futureInviteOnly}
          onClick={() => toggleSharingInput('futureInviteOnly')}
        />
      </Card>

      <Card className="space-y-3">
        <div className="space-y-1">
          <h2 className="font-display text-2xl">Pricing</h2>
          <p className="text-sm text-muted">
            Core app stays free. If you want faster search and AI help, Plus costs less than one decent coffee each month.
          </p>
          <p className="text-xs text-muted">
            Monthly is ${monthlyPrice}/month and yearly is ${yearlyPrice}/year, saving ${yearlySavings} per year (
            {yearlyDiscountPercent}% off). One tiny upgrade, fewer &quot;where did that note go?&quot; moments.
          </p>
          {isBetaTester && (
            <p className="text-xs font-semibold text-success">
              Beta tester override active: this account receives Plus Yearly access automatically.
            </p>
          )}
        </div>
        <div className="space-y-2">
          {pricingPlans.map((plan) => {
            const isActive = activePlan === plan.id;
            return (
              <div
                key={plan.id}
                className={`rounded-xl border p-3 ${
                  isActive ? 'border-accent/50 bg-accent/10 shadow-glow' : 'border-muted/20 bg-surface'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold">{plan.label}</p>
                    <p className="text-xs text-muted">{plan.blurb}</p>
                  </div>
                  <div className="text-right">
                    {plan.badge && (
                      <span className="mb-1 inline-flex rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
                        {plan.badge}
                      </span>
                    )}
                    <p className="font-display text-2xl leading-none">{plan.priceLabel}</p>
                    <p className="text-xs text-muted">{plan.cadence}</p>
                  </div>
                </div>
                <ul className="mt-3 space-y-1 text-xs text-muted">
                  {plan.features.map((feature) => (
                    <li key={feature}>• {feature}</li>
                  ))}
                </ul>
                <Button
                  variant={isActive ? 'primary' : 'secondary'}
                  className="mt-3 w-full"
                  onClick={() => void choosePricingPlan(plan.id)}
                  disabled={isBetaTester && !isActive}
                >
                  {isActive ? (isBetaTester ? 'Current plan (Beta)' : 'Current plan') : `Choose ${plan.label}`}
                </Button>
              </div>
            );
          })}
        </div>
      </Card>

      {inviteStatus && <p className="text-sm text-muted">{inviteStatus}</p>}
    </div>
  );
}

function Toggle({ label, value, onClick }: { label: string; value: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-xl border border-muted/20 bg-surface px-3 py-2 text-left"
    >
      <span className="text-sm">{label}</span>
      <span className={`text-xs font-semibold ${value ? 'text-success' : 'text-muted'}`}>{value ? 'On' : 'Off'}</span>
    </button>
  );
}
