'use client';

import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import { Input } from '@/components/shared/inputs';
import { PricingPlanId } from '@/lib/constants/pricing';
import { getFirebaseDb } from '@/lib/firebase/client';
import { flushSyncQueue, pullServerData } from '@/lib/firebase/sync';
import { useAuth } from '@/lib/hooks/useAuth';
import { useEntitlement } from '@/lib/hooks/useEntitlement';
import { useHousehold } from '@/lib/hooks/useHousehold';
import { useUserContext } from '@/lib/hooks/useUserContext';
import { db } from '@/lib/store/db';
import { createId, upsertReminder } from '@/lib/store/repository';

const STREAK_PREFS_KEY = 'streak-inputs';
const SHARING_PREFS_KEY = 'sharing-prefs';
const FALLBACK_LOCAL_USER_ID = '00000000-0000-0000-0000-000000000010';

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
  const [syncDiagnosticsStatus, setSyncDiagnosticsStatus] = useState('');
  const [syncRetryInFlight, setSyncRetryInFlight] = useState(false);
  const [cloudJournalCount, setCloudJournalCount] = useState<number | null>(null);
  const [cloudJournalCheckedAt, setCloudJournalCheckedAt] = useState<string | null>(null);
  const [cloudJournalCheckInFlight, setCloudJournalCheckInFlight] = useState(false);
  const [forceUploadInFlight, setForceUploadInFlight] = useState(false);
  const [cloudProjectCount, setCloudProjectCount] = useState<number | null>(null);
  const [cloudQuestionCount, setCloudQuestionCount] = useState<number | null>(null);
  const [cloudQuestionLinkCount, setCloudQuestionLinkCount] = useState<number | null>(null);
  const [cloudProjectCheckedAt, setCloudProjectCheckedAt] = useState<string | null>(null);
  const [cloudProjectCheckInFlight, setCloudProjectCheckInFlight] = useState(false);
  const [forceProjectUploadInFlight, setForceProjectUploadInFlight] = useState(false);

  const syncQueue = useLiveQuery(() => db.syncMutations.orderBy('updated_at').reverse().toArray(), []);
  const lastPullMeta = useLiveQuery(() => db.meta.get('last_pull_at'), []);
  const localJournalCount = useLiveQuery(() => db.journalEntries.where('user_id').equals(userId).count(), [userId]);
  const localUnsyncedJournalCount = useLiveQuery(
    async () => {
      const entries = await db.journalEntries.where('user_id').equals(userId).toArray();
      return entries.filter((entry) => entry.sync_status !== 'synced').length;
    },
    [userId]
  );
  const localProjectCount = useLiveQuery(() => db.projects.where('user_id').equals(userId).count(), [userId]);
  const localQuestionCount = useLiveQuery(() => db.questions.where('user_id').equals(userId).count(), [userId]);
  const localQuestionLinkCount = useLiveQuery(
    async () => {
      const links = await db.linkReferences.where('parent_type').equals('question').toArray();
      return links.filter((link) => link.user_id === userId).length;
    },
    [userId]
  );

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
  const pendingMutationCount = syncQueue?.length ?? 0;
  const failedMutationCount = useMemo(
    () => (syncQueue ?? []).filter((mutation) => mutation.attempts > 0 || Boolean(mutation.last_error)).length,
    [syncQueue]
  );
  const latestSyncError = useMemo(
    () => (syncQueue ?? []).find((mutation) => mutation.last_error)?.last_error ?? '',
    [syncQueue]
  );
  const queueByEntityLabel = useMemo(() => {
    if (!syncQueue?.length) {
      return 'No pending queue';
    }

    const byEntity = new Map<string, number>();
    for (const mutation of syncQueue) {
      byEntity.set(mutation.entity, (byEntity.get(mutation.entity) ?? 0) + 1);
    }

    return [...byEntity.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([entity, count]) => `${entity}: ${count}`)
      .join(' · ');
  }, [syncQueue]);

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

    if (planId !== 'free') {
      setInviteStatus('Plus plans are managed during onboarding/billing approval.');
      return;
    }

    try {
      await setDoc(
        doc(firestore, 'profiles', user.uid),
        {
          id: user.uid,
          email: user.email ?? null,
          pricing_plan: 'free',
          is_beta_tester: false,
          updated_at: new Date().toISOString()
        },
        { merge: true }
      );

      setInviteStatus('Selected Free plan.');
    } catch {
      setInviteStatus('Could not change plan right now. Please try again.');
    }
  }

  async function retrySyncNow() {
    if (!firestore || !user) {
      setSyncDiagnosticsStatus('Sign in first, then retry sync.');
      return;
    }

    setSyncRetryInFlight(true);
    setSyncDiagnosticsStatus('Sync in progress...');

    try {
      await pullServerData(firestore, user.uid, householdId);
      const result = await flushSyncQueue(firestore);
      const remaining = await db.syncMutations.count();

      if (result.failed) {
        setSyncDiagnosticsStatus(
          `Retry finished: ${result.synced} synced, ${result.failed} failed, ${remaining} still queued.`
        );
      } else {
        setSyncDiagnosticsStatus(`Retry finished: ${result.synced} synced, ${remaining} queued.`);
      }
    } catch (error) {
      setSyncDiagnosticsStatus(error instanceof Error ? `Retry failed: ${error.message}` : 'Retry failed.');
    } finally {
      setSyncRetryInFlight(false);
    }
  }

  async function checkCloudJournalEntries() {
    if (!firestore || !user) {
      setSyncDiagnosticsStatus('Sign in first, then check cloud journal entries.');
      return;
    }

    setCloudJournalCheckInFlight(true);
    try {
      const snapshot = await getDocs(query(collection(firestore, 'journalEntries'), where('user_id', '==', user.uid)));
      setCloudJournalCount(snapshot.size);
      setCloudJournalCheckedAt(new Date().toISOString());
      setSyncDiagnosticsStatus(`Cloud check complete: ${snapshot.size} journal entries found in Firestore.`);
    } catch (error) {
      setSyncDiagnosticsStatus(error instanceof Error ? `Cloud check failed: ${error.message}` : 'Cloud check failed.');
    } finally {
      setCloudJournalCheckInFlight(false);
    }
  }

  async function forceUploadLocalJournalEntries() {
    if (!firestore || !user) {
      setSyncDiagnosticsStatus('Sign in first, then run local journal upload.');
      return;
    }

    setForceUploadInFlight(true);
    setSyncDiagnosticsStatus('Uploading local journal entries to Firestore...');

    try {
      const allLocal = await db.journalEntries.toArray();
      const candidates = allLocal.filter(
        (entry) => entry.user_id === user.uid || entry.user_id === FALLBACK_LOCAL_USER_ID
      );

      if (!candidates.length) {
        setSyncDiagnosticsStatus('No local journal entries found to upload.');
        return;
      }

      let uploaded = 0;
      for (const entry of candidates) {
        const normalized = {
          ...entry,
          user_id: user.uid,
          household_id: householdId,
          tags: Array.isArray(entry.tags) ? entry.tags : [],
          updated_at: entry.updated_at ?? new Date().toISOString(),
          created_at: entry.created_at ?? new Date().toISOString()
        };

        await setDoc(doc(firestore, 'journalEntries', normalized.id), normalized, { merge: true });

        await db.journalEntries.put({
          ...normalized,
          sync_status: 'synced',
          synced_at: new Date().toISOString()
        });

        uploaded += 1;
      }

      await db.syncMutations
        .where('entity')
        .equals('journalEntries')
        .and((mutation) => candidates.some((entry) => entry.id === mutation.record_id))
        .delete();

      setSyncDiagnosticsStatus(`Upload complete: ${uploaded} journal entries copied to Firestore.`);
      await checkCloudJournalEntries();
    } catch (error) {
      setSyncDiagnosticsStatus(error instanceof Error ? `Journal upload failed: ${error.message}` : 'Journal upload failed.');
    } finally {
      setForceUploadInFlight(false);
    }
  }

  async function checkCloudProjectData() {
    if (!firestore || !user) {
      setSyncDiagnosticsStatus('Sign in first, then check cloud project data.');
      return;
    }

    setCloudProjectCheckInFlight(true);
    try {
      const [projectsSnapshot, questionsSnapshot, linksSnapshot] = await Promise.all([
        getDocs(query(collection(firestore, 'studyProjects'), where('user_id', '==', user.uid))),
        getDocs(query(collection(firestore, 'studyQuestions'), where('user_id', '==', user.uid))),
        getDocs(query(collection(firestore, 'linkReferences'), where('user_id', '==', user.uid)))
      ]);

      const questionLinks = linksSnapshot.docs.filter((entry) => entry.data().parent_type === 'question');

      setCloudProjectCount(projectsSnapshot.size);
      setCloudQuestionCount(questionsSnapshot.size);
      setCloudQuestionLinkCount(questionLinks.length);
      setCloudProjectCheckedAt(new Date().toISOString());
      setSyncDiagnosticsStatus(
        `Cloud project check complete: ${projectsSnapshot.size} projects, ${questionsSnapshot.size} questions, ${questionLinks.length} question links.`
      );
    } catch (error) {
      setSyncDiagnosticsStatus(error instanceof Error ? `Cloud project check failed: ${error.message}` : 'Cloud project check failed.');
    } finally {
      setCloudProjectCheckInFlight(false);
    }
  }

  async function forceUploadLocalProjectData() {
    if (!firestore || !user) {
      setSyncDiagnosticsStatus('Sign in first, then run local project upload.');
      return;
    }

    setForceProjectUploadInFlight(true);
    setSyncDiagnosticsStatus('Uploading local projects, questions, and links to Firestore...');

    try {
      const [allProjects, allQuestions, allQuestionLinks] = await Promise.all([
        db.projects.toArray(),
        db.questions.toArray(),
        db.linkReferences.where('parent_type').equals('question').toArray()
      ]);

      const candidateProjects = allProjects.filter(
        (project) => project.user_id === user.uid || project.user_id === FALLBACK_LOCAL_USER_ID
      );
      const candidateProjectIds = new Set(candidateProjects.map((project) => project.id));

      const candidateQuestions = allQuestions.filter(
        (question) =>
          question.user_id === user.uid ||
          question.user_id === FALLBACK_LOCAL_USER_ID ||
          candidateProjectIds.has(question.project_id)
      );
      const candidateQuestionIds = new Set(candidateQuestions.map((question) => question.id));

      const candidateQuestionLinks = allQuestionLinks.filter(
        (link) =>
          link.user_id === user.uid || link.user_id === FALLBACK_LOCAL_USER_ID || candidateQuestionIds.has(link.parent_id)
      );

      let uploadedProjects = 0;
      for (const project of candidateProjects) {
        const normalized = {
          ...project,
          user_id: user.uid,
          household_id: householdId,
          archived: Boolean(project.archived),
          updated_at: project.updated_at ?? new Date().toISOString(),
          created_at: project.created_at ?? new Date().toISOString()
        };

        await setDoc(doc(firestore, 'studyProjects', normalized.id), normalized, { merge: true });
        await db.projects.put({
          ...normalized,
          sync_status: 'synced',
          synced_at: new Date().toISOString()
        });
        uploadedProjects += 1;
      }

      let uploadedQuestions = 0;
      for (const question of candidateQuestions) {
        const normalizedStatus =
          question.status === 'open' || question.status === 'in_progress' || question.status === 'answered'
            ? question.status
            : 'open';

        const normalized = {
          ...question,
          user_id: user.uid,
          household_id: householdId,
          status: normalizedStatus,
          notes: question.notes ?? '',
          conclusion: question.conclusion ?? '',
          shareable_insight: question.shareable_insight ?? '',
          is_conflict_copy: Boolean(question.is_conflict_copy),
          conflict_of: question.conflict_of ?? null,
          updated_at: question.updated_at ?? new Date().toISOString(),
          created_at: question.created_at ?? new Date().toISOString()
        };

        await setDoc(doc(firestore, 'studyQuestions', normalized.id), normalized, { merge: true });
        await db.questions.put({
          ...normalized,
          sync_status: 'synced',
          synced_at: new Date().toISOString()
        });
        uploadedQuestions += 1;
      }

      let uploadedLinks = 0;
      for (const link of candidateQuestionLinks) {
        const normalized = {
          ...link,
          user_id: user.uid,
          household_id: householdId,
          shared_to_household: Boolean(link.shared_to_household),
          updated_at: link.updated_at ?? new Date().toISOString(),
          created_at: link.created_at ?? new Date().toISOString()
        };

        await setDoc(doc(firestore, 'linkReferences', normalized.id), normalized, { merge: true });
        await db.linkReferences.put({
          ...normalized,
          sync_status: 'synced',
          synced_at: new Date().toISOString()
        });
        uploadedLinks += 1;
      }

      await db.syncMutations
        .where('entity')
        .equals('projects')
        .and((mutation) => candidateProjectIds.has(mutation.record_id))
        .delete();
      await db.syncMutations
        .where('entity')
        .equals('questions')
        .and((mutation) => candidateQuestionIds.has(mutation.record_id))
        .delete();
      const candidateLinkIds = new Set(candidateQuestionLinks.map((link) => link.id));
      await db.syncMutations
        .where('entity')
        .equals('linkReferences')
        .and((mutation) => candidateLinkIds.has(mutation.record_id))
        .delete();

      setSyncDiagnosticsStatus(
        `Project upload complete: ${uploadedProjects} projects, ${uploadedQuestions} questions, ${uploadedLinks} question links copied.`
      );
      await checkCloudProjectData();
    } catch (error) {
      setSyncDiagnosticsStatus(error instanceof Error ? `Project upload failed: ${error.message}` : 'Project upload failed.');
    } finally {
      setForceProjectUploadInFlight(false);
    }
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
            const isManagedByOnboarding = plan.id !== 'free';
            const disablePlanButton = isManagedByOnboarding || (isBetaTester && !isActive);
            const buttonLabel = isActive
              ? isBetaTester
                ? 'Current plan (Beta)'
                : plan.id === 'free'
                  ? 'Current plan'
                  : 'Current plan (Managed)'
              : isManagedByOnboarding
                ? 'Managed in onboarding'
                : `Choose ${plan.label}`;
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
                  disabled={disablePlanButton}
                >
                  {buttonLabel}
                </Button>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="space-y-3 border-warning/40 bg-warning/5">
        <div className="space-y-1">
          <h2 className="font-display text-2xl">Temporary: Sync Diagnostics</h2>
          <p className="text-xs text-muted">Use for troubleshooting. Remove this card once sync is stable.</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-surface p-3">
            <p className="text-xs text-muted">Queued mutations</p>
            <p className="text-lg font-semibold">{pendingMutationCount}</p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="text-xs text-muted">Failed mutations</p>
            <p className="text-lg font-semibold">{failedMutationCount}</p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="text-xs text-muted">Local journal entries</p>
            <p className="text-lg font-semibold">{localJournalCount ?? 0}</p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="text-xs text-muted">Local unsynced journals</p>
            <p className="text-lg font-semibold">{localUnsyncedJournalCount ?? 0}</p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="text-xs text-muted">Local projects</p>
            <p className="text-lg font-semibold">{localProjectCount ?? 0}</p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="text-xs text-muted">Local questions</p>
            <p className="text-lg font-semibold">{localQuestionCount ?? 0}</p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="text-xs text-muted">Local question links</p>
            <p className="text-lg font-semibold">{localQuestionLinkCount ?? 0}</p>
          </div>
        </div>

        <div className="rounded-xl bg-surface p-3 text-xs text-muted">
          <p>
            Last pull:{' '}
            <span className="font-semibold text-ink">
              {lastPullMeta?.value ? new Date(lastPullMeta.value).toLocaleString() : 'No pull recorded yet'}
            </span>
          </p>
          <p className="mt-1 break-words">Queue detail: {queueByEntityLabel}</p>
          {latestSyncError && (
            <p className="mt-1 break-words text-danger">
              Latest error: <span className="font-semibold">{latestSyncError}</span>
            </p>
          )}
          <p className="mt-1">
            Cloud journal count:{' '}
            <span className="font-semibold text-ink">{cloudJournalCount ?? 'Not checked yet'}</span>
            {cloudJournalCheckedAt ? ` (checked ${new Date(cloudJournalCheckedAt).toLocaleString()})` : ''}
          </p>
          <p className="mt-1">
            Cloud projects/questions/links:{' '}
            <span className="font-semibold text-ink">
              {cloudProjectCount ?? 'N/A'} / {cloudQuestionCount ?? 'N/A'} / {cloudQuestionLinkCount ?? 'N/A'}
            </span>
            {cloudProjectCheckedAt ? ` (checked ${new Date(cloudProjectCheckedAt).toLocaleString()})` : ''}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button onClick={() => void retrySyncNow()} disabled={syncRetryInFlight}>
            {syncRetryInFlight ? 'Retrying sync...' : 'Retry sync now'}
          </Button>
          <Button variant="secondary" onClick={() => void checkCloudJournalEntries()} disabled={cloudJournalCheckInFlight}>
            {cloudJournalCheckInFlight ? 'Checking cloud...' : 'Check cloud journals'}
          </Button>
          <Button variant="secondary" onClick={() => void checkCloudProjectData()} disabled={cloudProjectCheckInFlight}>
            {cloudProjectCheckInFlight ? 'Checking project cloud...' : 'Check cloud projects'}
          </Button>
          <Button
            variant="secondary"
            className="sm:col-span-2"
            onClick={() => void forceUploadLocalJournalEntries()}
            disabled={forceUploadInFlight}
          >
            {forceUploadInFlight ? 'Uploading journals...' : 'Force upload local journals'}
          </Button>
          <Button
            variant="secondary"
            className="sm:col-span-2"
            onClick={() => void forceUploadLocalProjectData()}
            disabled={forceProjectUploadInFlight}
          >
            {forceProjectUploadInFlight ? 'Uploading projects...' : 'Force upload local projects'}
          </Button>
        </div>

        {syncDiagnosticsStatus && <p className="text-xs text-muted">{syncDiagnosticsStatus}</p>}
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
