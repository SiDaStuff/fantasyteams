import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, browserLocalPersistence, setPersistence, type Auth } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';

/**
 * Firebase initialization for the BROWSER.
 *
 * The browser uses Firebase Authentication and read-only realtime invalidation
 * signals. All application data reads and writes still go through the Netlify API
 * (`netlify/functions/api.ts`), which talks to Realtime Database with the
 * Admin SDK using a service account. RTDB rules deny all direct client access.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export function isFirebaseConfigured(): boolean {
  return (
    Boolean(firebaseConfig.apiKey) &&
    Boolean(firebaseConfig.authDomain) &&
    Boolean(firebaseConfig.projectId) &&
    Boolean(firebaseConfig.appId)
  );
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let database: Database | null = null;

function ensureInitialized(): void {
  if (app) return;
  if (!isFirebaseConfigured()) {
    throw new Error(
      'Firebase is not configured. Copy .env.example to .env and fill in your Firebase web app config.',
    );
  }

  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  database = getDatabase(app);
  // Sessions persist across visits.
  void setPersistence(auth, browserLocalPersistence);

  // Optional: point Auth at the local emulator for offline development. Data
  // itself still flows through Netlify Functions to the real Realtime Database.
  if (import.meta.env.VITE_USE_EMULATORS === 'true') {
    void import('firebase/auth').then(({ connectAuthEmulator }) => {
      connectAuthEmulator(auth as Auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    });
  }
}

/** Returns the Firebase Auth instance, or null when Firebase is unconfigured. */
export function getFirebaseAuth(): Auth | null {
  if (!isFirebaseConfigured()) return null;
  ensureInitialized();
  return auth;
}

/** Returns the read-only realtime signal database, or null when unconfigured. */
export function getFirebaseDatabase(): Database | null {
  if (!isFirebaseConfigured()) return null;
  ensureInitialized();
  return database;
}