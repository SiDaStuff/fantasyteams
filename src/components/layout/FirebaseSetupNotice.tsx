import type { ReactNode } from 'react';
import { DatabaseZap, ShieldAlert } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';

/**
 * Shown anywhere Firebase is required but the environment has not been
 * configured. Explicit and actionable instead of silently broken.
 */
export function FirebaseSetupNotice({ context = 'Firebase' }: { context?: string }) {
  return (
    <Panel className="mx-auto max-w-xl">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-white">{context} is not configured</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
            This page needs Firebase, but no environment variables were found. Copy{' '}
            <code className="rounded bg-navy-800 px-1.5 py-0.5 text-xs text-electric-300">.env.example</code> to{' '}
            <code className="rounded bg-navy-800 px-1.5 py-0.5 text-xs text-electric-300">.env</code>, fill in the
            values, then restart the dev server.
          </p>
          <ol className="mt-4 space-y-2 text-sm text-slate-300">
            <Step n={1}>
              Create a project at{' '}
              <a className="text-electric-300 underline-offset-2 hover:underline" href="https://console.firebase.google.com/" target="_blank" rel="noreferrer">
                console.firebase.google.com
              </a>{' '}
              and create a Realtime Database.
            </Step>
            <Step n={2}>Enable Google and Email/Password sign-in under Authentication → Sign-in method.</Step>
            <Step n={3}>
              Register a web app and copy the SDK config into <code className="rounded bg-navy-800 px-1.5 py-0.5 text-xs text-electric-300">VITE_FIREBASE_*</code>.
            </Step>
            <Step n={4}>
              Generate a service account key (Project settings → Service accounts) and set it as the{' '}
              <code className="rounded bg-navy-800 px-1.5 py-0.5 text-xs text-electric-300">FIREBASE_SERVICE_ACCOUNT</code>{' '}
              secret so Netlify Functions can reach the database.
            </Step>
            <Step n={5}>Deploy RTDB rules (`database.rules.json`) and the site to Netlify (see README).</Step>
          </ol>
        </div>
      </div>
      <div className="mt-5 flex items-center gap-2 border-t border-line pt-4 text-xs text-slate-500">
        <DatabaseZap className="h-4 w-4" />
        The browser never talks to the database directly — Netlify Functions own every read and write via the service account.
      </div>
    </Panel>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-electric-500/15 text-[11px] font-bold text-electric-300">
        {n}
      </span>
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}