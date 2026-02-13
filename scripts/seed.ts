import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const userOne = process.env.SEED_USER_ONE_ID;
const userTwo = process.env.SEED_USER_TWO_ID;

if (!projectId || !clientEmail || !privateKey || !userOne || !userTwo) {
  throw new Error(
    'Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, SEED_USER_ONE_ID, SEED_USER_TWO_ID'
  );
}

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey
    })
  });
}

const firestore = getFirestore();

async function main() {
  const householdId = crypto.randomUUID();

  await firestore.collection('households').doc(householdId).set({
    id: householdId,
    name: 'Seed Household',
    created_by: userOne,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  await firestore.collection('profiles').doc(userOne).set(
    {
      id: userOne,
      email: 'user1@example.com',
      display_name: 'Partner One',
      pricing_plan: 'free',
      is_beta_tester: false,
      updated_at: new Date().toISOString()
    },
    { merge: true }
  );

  await firestore.collection('profiles').doc(userTwo).set(
    {
      id: userTwo,
      email: 'user2@example.com',
      display_name: 'Partner Two',
      pricing_plan: 'free',
      is_beta_tester: false,
      updated_at: new Date().toISOString()
    },
    { merge: true }
  );

  await firestore.collection('householdMembers').doc(`${householdId}_${userOne}`).set({
    id: `${householdId}_${userOne}`,
    household_id: householdId,
    user_id: userOne,
    role: 'owner',
    joined_at: new Date().toISOString()
  });

  await firestore.collection('householdMembers').doc(`${householdId}_${userTwo}`).set({
    id: `${householdId}_${userTwo}`,
    household_id: householdId,
    user_id: userTwo,
    role: 'member',
    joined_at: new Date().toISOString()
  });

  const projectId = crypto.randomUUID();
  const questionId = crypto.randomUUID();
  const readingId = crypto.randomUUID();
  const journalId = crypto.randomUUID();
  const highlightId = crypto.randomUUID();
  const linkId = crypto.randomUUID();
  const reminderId = crypto.randomUUID();

  await firestore.collection('studyProjects').doc(projectId).set({
    id: projectId,
    user_id: userOne,
    household_id: householdId,
    title: 'Faith under pressure',
    description: 'Collect references and practical examples.',
    archived: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  await firestore.collection('studyQuestions').doc(questionId).set({
    id: questionId,
    user_id: userOne,
    household_id: householdId,
    project_id: projectId,
    question: 'How does Daniel 6 model calm faith?',
    status: 'in_progress',
    notes: 'Focus on daily routine and prayer habit.',
    conclusion: '',
    shareable_insight: '',
    is_conflict_copy: false,
    conflict_of: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  await firestore.collection('readingSessions').doc(readingId).set({
    id: readingId,
    user_id: userOne,
    household_id: householdId,
    session_at: new Date().toISOString(),
    book: 'Psalms',
    chapter_start: 23,
    chapter_end: 24,
    note: 'Comfort and trust themes.',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  await firestore.collection('journalEntries').doc(journalId).set({
    id: journalId,
    user_id: userOne,
    household_id: householdId,
    entry_date: new Date().toISOString(),
    body: 'Daily gratitude journal seed entry.',
    tags: ['gratitude'],
    is_conflict_copy: false,
    conflict_of: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  await firestore.collection('highlights').doc(highlightId).set({
    id: highlightId,
    user_id: userOne,
    household_id: householdId,
    reference: 'Psalm 23:1',
    summary: 'Jehovah provides what is needed.',
    tags: ['trust'],
    shared_to_household: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  await firestore.collection('linkReferences').doc(linkId).set({
    id: linkId,
    user_id: userOne,
    household_id: householdId,
    parent_type: 'highlight',
    parent_id: highlightId,
    shared_to_household: true,
    url: 'https://www.jw.org/',
    title: 'JW.ORG',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  await firestore.collection('reminderSettings').doc(reminderId).set({
    id: reminderId,
    user_id: userOne,
    household_id: householdId,
    enabled: true,
    reminder_time: '20:00',
    timezone: 'UTC',
    last_shown_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  console.log('Seed complete for household:', householdId);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
