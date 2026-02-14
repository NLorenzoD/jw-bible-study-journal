'use client';

import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';
import { Functions, getFunctions } from 'firebase/functions';

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
let firebaseDb: Firestore | null = null;
let firebaseFunctions: Functions | null = null;
const sanitizeEnv = (value: string | undefined) => (typeof value === 'string' ? value.trim() : value);

export function isFirebaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  );
}

function getFirebaseConfig() {
  const apiKey = sanitizeEnv(process.env.NEXT_PUBLIC_FIREBASE_API_KEY);
  const authDomain = sanitizeEnv(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN);
  const projectId = sanitizeEnv(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  const storageBucket = sanitizeEnv(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
  const messagingSenderId = sanitizeEnv(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID);
  const appId = sanitizeEnv(process.env.NEXT_PUBLIC_FIREBASE_APP_ID);

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId
  };
}

export function getFirebaseApp() {
  if (!isFirebaseConfigured()) {
    return null;
  }

  if (!firebaseApp) {
    firebaseApp = getApps().length ? getApp() : initializeApp(getFirebaseConfig());
  }

  return firebaseApp;
}

export function getFirebaseAuth() {
  const app = getFirebaseApp();
  if (!app) {
    return null;
  }

  if (!firebaseAuth) {
    firebaseAuth = getAuth(app);
  }

  return firebaseAuth;
}

export function getFirebaseDb() {
  const app = getFirebaseApp();
  if (!app) {
    return null;
  }

  if (!firebaseDb) {
    firebaseDb = getFirestore(app);
  }

  return firebaseDb;
}

export function getFirebaseFunctions() {
  const app = getFirebaseApp();
  if (!app) {
    return null;
  }

  if (!firebaseFunctions) {
    const region = process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'us-central1';
    firebaseFunctions = getFunctions(app, region);
  }

  return firebaseFunctions;
}
