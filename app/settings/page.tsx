'use client';

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import { Input } from '@/components/shared/inputs';
import { getFirebaseDb } from '@/lib/firebase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { useHousehold } from '@/lib/hooks/useHousehold';
import { useUserContext } from '@/lib/hooks/useUserContext';
import { db } from '@/lib/store/db';
import { createId, upsertReminder } from '@/lib/store/repository';

const STREAK_PREFS_KEY = 'streak-inputs';
const SHARING_PREFS_KEY = 'sharing-prefs';

export default function SettingsPage() {
  const { user } = useAuth();
  const { userId, householdId, role } = useUserContext();
  const { createInvite, acceptInvite } = useHousehold();
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
  const [processedInvite, setProcessedInvite] = useState(false);

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
    const token = new URLSearchParams(window.location.search).get('invite');
    if (!token || processedInvite) {
      return;
    }

    setProcessedInvite(true);
    acceptInvite(token).then((ok) => {
      setInviteStatus(ok ? 'Invite accepted.' : 'Invite could not be accepted.');
    });
  }, [acceptInvite, processedInvite]);

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
    }

    setInviteStatus('Profile saved.');
  }

  async function makeInvite() {
    const link = await createInvite();
    if (!link) {
      setInviteStatus('Could not generate invite link.');
      return;
    }

    setInviteLink(link);
    setInviteStatus('Invite link generated.');
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
        <h2 className="font-display text-2xl">Household</h2>
        <div className="rounded-xl bg-surface p-3 text-sm">
          <p>
            Household: <span className="font-semibold">{householdId.slice(0, 8)}</span>
          </p>
          <p>
            Role: <span className="font-semibold">{householdRoleLabel}</span>
          </p>
        </div>
        <Button onClick={makeInvite} className="w-full">
          Generate spouse invite
        </Button>
        {inviteLink && (
          <div className="rounded-xl bg-surface p-3 text-xs text-muted">
            <p className="font-semibold text-ink">Invite link</p>
            <p className="break-all">{inviteLink}</p>
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
