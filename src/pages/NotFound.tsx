import { ArrowLeft, Home } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function NotFound() {
  return (
    <div className="mx-auto flex min-h-[65vh] max-w-lg flex-col items-center justify-center px-4 text-center">
      <p className="font-display text-8xl font-bold tracking-tight text-gradient">404</p>
      <h1 className="mt-4 font-display text-2xl font-bold text-white">That play got called back</h1>
      <p className="mt-3 text-slate-400">
        This page doesn't exist — it may have been moved or you followed a stale link.
      </p>
      <div className="mt-8 flex gap-3">
        <Button to="/" variant="secondary" leftIcon={<Home className="h-4 w-4" />}>
          Home
        </Button>
        <Button to="/dashboard" leftIcon={<ArrowLeft className="h-4 w-4" />}>
          Your dashboard
        </Button>
      </div>
    </div>
  );
}