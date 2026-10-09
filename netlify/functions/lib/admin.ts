/**
 * Shared Firebase Admin bootstrap for Netlify Functions.
 *
 * Both the API function and the scheduled draft-clock need the same
 * service-account app, so it lives here.
 */
import admin from 'firebase-admin';
import type { ServiceAccount } from 'firebase-admin/app';

const APP_NAME = 'fantasy-teams-server';

export class ServerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServerConfigError';
  }
}

export function getAdminApp(): admin.app.App {
  const existing = admin.apps.find((app) => app?.name === APP_NAME);
  if (existing) return existing;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw || raw.trim() === '') {
    throw new ServerConfigError(
      'FIREBASE_SERVICE_ACCOUNT is not set. Configure the service account secret in Netlify.',
    );
  }

  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new ServerConfigError('FIREBASE_SERVICE_ACCOUNT is not valid JSON.');
  }

  const projectId =
    typeof credentials.project_id === 'string'
      ? credentials.project_id
      : typeof credentials.projectId === 'string'
        ? credentials.projectId
        : '';
  if (projectId === '') {
    throw new ServerConfigError('Service account is missing project_id.');
  }

  const databaseURL =
    process.env.FIREBASE_DATABASE_URL ?? `https://${projectId}-default-rtdb.firebaseio.com`;

  return admin.initializeApp(
    { credential: admin.credential.cert(credentials as ServiceAccount), databaseURL },
    APP_NAME,
  );
}

export function getDb(): admin.database.Database {
  return getAdminApp().database();
}