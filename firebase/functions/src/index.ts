import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

initializeApp();

const firestore = getFirestore();

type LinkMetadata = {
  title?: string;
  publication_name?: string;
  section_heading?: string;
  fallback?: boolean;
};

function ensureUid(auth: { uid?: string } | undefined) {
  const uid = auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }
  return uid;
}

function extractContent(html: string, pattern: RegExp): string | undefined {
  const match = html.match(pattern);
  return match?.[1]?.replace(/\s+/g, ' ').trim();
}

function detectPublication(html: string): string | undefined {
  return (
    extractContent(html, /<meta\s+property="og:site_name"\s+content="([^"]+)"/i) ||
    extractContent(html, /<meta\s+name="citation_journal_title"\s+content="([^"]+)"/i) ||
    extractContent(html, /<meta\s+name="twitter:site"\s+content="([^"]+)"/i)
  );
}

export const bootstrapHousehold = onCall(async (request) => {
  const uid = ensureUid(request.auth);

  const existingMembership = await firestore
    .collection('householdMembers')
    .where('user_id', '==', uid)
    .limit(1)
    .get();

  if (!existingMembership.empty) {
    const data = existingMembership.docs[0].data() as { household_id: string };
    return { householdId: data.household_id };
  }

  const householdId = crypto.randomUUID();
  const now = new Date().toISOString();

  await firestore.collection('profiles').doc(uid).set(
    {
      id: uid,
      email: request.auth?.token.email ?? null,
      updated_at: now
    },
    { merge: true }
  );

  await firestore.collection('households').doc(householdId).set({
    id: householdId,
    name: 'Household',
    created_by: uid,
    created_at: now,
    updated_at: now
  });

  await firestore.collection('householdMembers').doc(`${householdId}_${uid}`).set({
    id: `${householdId}_${uid}`,
    household_id: householdId,
    user_id: uid,
    role: 'owner',
    joined_at: now
  });

  return { householdId };
});

export const acceptHouseholdInvite = onCall(async (request) => {
  const uid = ensureUid(request.auth);
  const token = (request.data?.token as string | undefined)?.trim();

  if (!token) {
    throw new HttpsError('invalid-argument', 'Invite token is required.');
  }

  const inviteSnapshot = await firestore.collection('householdInvites').doc(token).get();
  if (!inviteSnapshot.exists) {
    throw new HttpsError('not-found', 'Invite not found.');
  }

  const invite = inviteSnapshot.data() as {
    household_id: string;
    expires_at: string;
    used_at?: string | null;
  };

  if (invite.used_at) {
    throw new HttpsError('failed-precondition', 'Invite has already been used.');
  }

  if (new Date(invite.expires_at) <= new Date()) {
    throw new HttpsError('deadline-exceeded', 'Invite has expired.');
  }

  const existingMemberships = await firestore
    .collection('householdMembers')
    .where('user_id', '==', uid)
    .get();

  const batch = firestore.batch();
  existingMemberships.docs.forEach((entry) => batch.delete(entry.ref));

  const now = new Date().toISOString();
  batch.set(firestore.collection('householdMembers').doc(`${invite.household_id}_${uid}`), {
    id: `${invite.household_id}_${uid}`,
    household_id: invite.household_id,
    user_id: uid,
    role: 'member',
    joined_at: now
  });

  batch.set(
    firestore.collection('householdInvites').doc(token),
    {
      used_at: now,
      used_by: uid,
      updated_at: now
    },
    { merge: true }
  );

  await batch.commit();

  return { householdId: invite.household_id };
});

export const fetchLinkMetadata = onCall(async (request): Promise<LinkMetadata> => {
  const url = (request.data?.url as string | undefined)?.trim();

  if (!url) {
    throw new HttpsError('invalid-argument', 'URL is required.');
  }

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!host.endsWith('jw.org') && !host.endsWith('wol.jw.org')) {
      return {
        fallback: true
      };
    }

    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Bible Study Journal Metadata Fetcher)'
      }
    });

    if (!response.ok) {
      return {
        fallback: true
      };
    }

    const html = await response.text();

    const title =
      extractContent(html, /<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
      extractContent(html, /<title>([^<]+)<\/title>/i);

    const sectionHeading =
      extractContent(html, /<meta\s+property="og:description"\s+content="([^"]+)"/i) ||
      extractContent(html, /<h1[^>]*>([^<]+)<\/h1>/i);

    return {
      title,
      publication_name: detectPublication(html),
      section_heading: sectionHeading,
      fallback: false
    };
  } catch {
    return {
      fallback: true
    };
  }
});
