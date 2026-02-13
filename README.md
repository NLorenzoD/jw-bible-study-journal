# Bible Study Journal and Progress Tracker (PWA)

Privacy-first Bible study journal and progress tracker for a household, built with Next.js, Tailwind, Framer Motion, Dexie, and Firebase.

## Stack

- Frontend: Next.js App Router + TypeScript + Tailwind + Framer Motion
- PWA: `next-pwa` + web manifest + offline route
- Offline-first local storage: IndexedDB via Dexie
- Backend: Firebase Auth + Firestore + Cloud Functions

## Features in this MVP

- Google + Apple auth via Firebase Authentication
- Household model with invite tokens and owner/member roles
- Today screen
  - Log reading session
  - Private journal entry
  - Highlight with jw.org / wol.jw.org metadata capture fallback
  - Add project question
- Progress screen
  - Consistency streak + reading streak
  - Milestone chips (7, 14, 30, 100)
  - Bible progress map by book/chapter
  - Stats cards
- Projects
  - Private projects and private question workflow (open/in progress/answered)
  - Notes, conclusion, optional shareable insight
- Highlights
  - Filters (book/project/tag)
  - Share-to-household toggle
- Settings
  - Display name
  - Household invite flow
  - Streak input preferences
  - Daily reminders
  - Sharing preferences
- Offline-first sync
  - Local-first writes to IndexedDB
  - Background sync queue when online
  - Last-write-wins and conflict-copy behavior for journal/question note collisions

## 1. Local setup

```bash
npm install
cp .env.example .env.local
```

Fill `.env.local`:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION` (default: `us-central1`)

Run app:

```bash
npm run dev
```

## 2. Firebase setup

Install Firebase CLI if needed:

```bash
npm install -g firebase-tools
```

1. Create or choose your Firebase project.
2. Update `.firebaserc` with your Firebase project ID.
3. Enable Firestore (Native mode).
4. Enable Authentication providers:
   - Google
   - Apple
5. Deploy Firestore rules and indexes:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

6. Deploy Cloud Functions:

```bash
cd firebase/functions
npm install
npm run build
cd ../..
firebase deploy --only functions
```

Cloud Functions used by the app:

- `bootstrapHousehold`
- `acceptHouseholdInvite`
- `fetchLinkMetadata`

## 3. Seed data (optional)

Set these env vars in your shell first:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `SEED_USER_ONE_ID`
- `SEED_USER_TWO_ID`

Then run:

```bash
npm run seed
```

## 4. PWA notes

- `next-pwa` is enabled in production builds.
- Service worker registration is automatic.
- Manifest is served from `app/manifest.ts`.
- Offline fallback route: `/offline`.

Production test:

```bash
npm run build
npm run start
```

## 5. Privacy model and Firestore rules summary

- Household-shared:
  - Reading progress/streak inputs
  - Shared highlights (`shared_to_household = true`)
- Private per user:
  - Journal entries
  - Study projects + questions
  - Reminder settings
  - Private highlights

Rules implementation:

- `firebase/firestore.rules`

Indexes used by app queries:

- `firebase/firestore.indexes.json`

## 6. Install and offline test checklist

### iPhone (Safari)

1. Open production URL in Safari.
2. Tap Share -> Add to Home Screen.
3. Launch installed app.
4. Turn on airplane mode.
5. Create reading session + journal + highlight.
6. Disable airplane mode and relaunch.
7. Confirm entries remain and sync status updates.

### Android (Chrome / Samsung)

1. Open production URL in Chrome.
2. Tap Install app / Add to Home screen.
3. Launch installed app.
4. Disable connectivity.
5. Create entries on Today screen.
6. Re-enable connectivity.
7. Confirm sync resumes without data loss.

## 7. Directory map

- `app/*`: App Router routes/screens
- `components/*`: Reusable UI and layout
- `lib/store/*`: Dexie schema + local repositories + selectors
- `lib/firebase/*`: Firebase client, sync adapter, metadata calls
- `firebase/firestore.rules`: Firestore security rules
- `firebase/firestore.indexes.json`: Firestore indexes
- `firebase/functions/src/index.ts`: Cloud Functions
- `scripts/seed.ts`: local seed utility

## 8. Deployment

1. Deploy Next.js app to Vercel (or equivalent).
2. Set Firebase web env variables in hosting platform.
3. Deploy Firestore rules/indexes.
4. Deploy Firebase Functions.
5. Add production auth allowed domains in Firebase Auth settings.
6. Test PWA install and offline flows on iOS + Android.
