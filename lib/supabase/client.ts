// Backward-compatible bridge after Firebase migration.
export {
  getFirebaseApp as getSupabaseClient,
  isFirebaseConfigured as isSupabaseConfigured
} from '@/lib/firebase/client';
