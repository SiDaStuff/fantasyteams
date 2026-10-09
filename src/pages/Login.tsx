import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Lock, Mail } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { GoogleButton } from '@/components/auth/GoogleButton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { FirebaseSetupNotice } from '@/components/layout/FirebaseSetupNotice';
import { authErrorMessage, useAuth } from '@/context/AuthContext';
import { isFirebaseConfigured } from '@/lib/firebase';
import { validateEmail, validatePassword } from '@/lib/validators';

interface LocationState {
  from?: string;
}

export function Login() {
  const { status, user, signInWithEmail, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LocationState | null)?.from ?? '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Signed-in users skip the form.
  useEffect(() => {
    if (status === 'authenticated' && user) navigate(from, { replace: true });
  }, [status, user, from, navigate]);

  if (!isFirebaseConfigured()) {
    return (
      <div className="bg-auth min-h-[85vh] px-4 py-16">
        <FirebaseSetupNotice context="Authentication" />
      </div>
    );
  }

  function validate(): boolean {
    const next: typeof errors = {};
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    if (emailError) next.email = emailError;
    if (passwordError) next.password = passwordError;
    else if (password.trim() === '') next.password = 'Enter your password.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      await signInWithEmail(email, password);
      navigate(from, { replace: true });
    } catch (error) {
      setFormError(authErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    if (googleLoading) return;
    setFormError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      navigate(from, { replace: true });
    } catch (error) {
      setFormError(authErrorMessage(error));
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle={undefined}
      footer={
        <p>
          New to Fantasy Teams?{' '}
          <Link to="/register" className="font-semibold text-electric-300 transition-colors hover:text-electric-200">
            Create an account
          </Link>
        </p>
      }
    >
      <div className="space-y-5">
        <GoogleButton onClick={handleGoogle} loading={googleLoading} />

        <div className="relative py-1">
          <div className="absolute inset-x-0 top-1/2 h-px bg-line" aria-hidden />
          <div className="relative flex justify-center">
            <span className="bg-card px-3 text-xs font-medium uppercase tracking-widest text-slate-500">or continue by email</span>
          </div>
        </div>

        {formError ? <Alert variant="error">{formError}</Alert> : null}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Input
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@example.com"
            leftIcon={<Mail className="h-4 w-4" />}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
          />
          <Input
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="••••••••"
            leftIcon={<Lock className="h-4 w-4" />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
          />

          <Button type="submit" fullWidth size="lg" isLoading={submitting}>
            Sign in
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}