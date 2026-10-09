import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu, Trophy, X } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/context/AuthContext';

export function Navbar() {
  const { status, user, profile, signOutUser } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);

  const pathKey = location.pathname + location.search;

  // Close menus on navigation.
  const [previousPathKey, setPreviousPathKey] = useState(pathKey);
  if (previousPathKey !== pathKey) {
    setPreviousPathKey(pathKey);
    setMobileOpen(false);
    setMenuOpen(false);
  }

  // Close the avatar menu on outside click.
  useEffect(() => {
    if (!menuOpen) return undefined;
    function onPointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOutUser();
      navigate('/');
    } finally {
      setSigningOut(false);
    }
  }

  const signedIn = status === 'authenticated';
  const displayName = profile?.displayName ?? user?.displayName ?? 'Player';

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `focus-ring rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? 'text-white' : 'text-slate-400 hover:text-white'
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-navy-950">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link to="/" className="focus-ring rounded-lg" aria-label="Fantasy Teams home">
            <Logo />
          </Link>

          {/* Desktop nav */}
          {signedIn ? (
            <div className="hidden items-center gap-1 md:flex">
              <NavLink to="/dashboard" className={navLinkClass}>
                My Leagues
              </NavLink>
              <NavLink to="/nfl" className={navLinkClass}>
                NFL Scores
              </NavLink>
            </div>
          ) : null}
        </div>

        <div className="hidden items-center gap-2.5 md:flex">
          {signedIn ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                className="focus-ring flex items-center rounded-full transition-opacity hover:opacity-85"
              >
                <Avatar name={displayName} src={profile?.photoURL ?? user?.photoURL} size="sm" />
              </button>
              {menuOpen ? (
                <div
                  role="menu"
                  className="animate-fade-in absolute right-0 top-11 w-56 rounded-xl border border-line bg-navy-850 p-1.5 shadow-xl shadow-black/40"
                >
                  <div className="border-b border-line px-3 py-2.5">
                    <p className="truncate text-sm font-semibold text-white">{displayName}</p>
                    <p className="truncate text-xs text-slate-500">{user?.email ?? ''}</p>
                  </div>
                  <Link
                    to="/leagues/new"
                    role="menuitem"
                    className="focus-ring mt-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/5"
                  >
                    <Trophy className="h-4 w-4" />
                    Create a league
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleSignOut}
                    disabled={signingOut}
                    className="focus-ring flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/5 hover:text-rose-300 disabled:opacity-50"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <Link to="/login" className="focus-ring rounded-lg px-3.5 py-2 text-sm font-semibold text-slate-200 transition-colors hover:text-white">
                Sign in
              </Link>
              <Link
                to="/register"
                className="focus-ring inline-flex h-9 items-center rounded-lg bg-electric-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-electric-400"
              >
                Sign up
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="focus-ring -mr-2 rounded-lg p-2 text-slate-200 md:hidden"
          aria-expanded={mobileOpen}
          aria-label="Menu"
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {/* Mobile menu */}
      {mobileOpen ? (
        <div className="animate-fade-in border-t border-line bg-navy-950 px-4 py-3 md:hidden">
          <div className="flex flex-col gap-0.5">
            {signedIn ? (
              <>
                <div className="mb-2 flex items-center gap-3 px-2 py-2">
                  <Avatar name={displayName} src={profile?.photoURL ?? user?.photoURL} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{displayName}</p>
                    <p className="truncate text-xs text-slate-500">{user?.email ?? ''}</p>
                  </div>
                </div>
                <MobileLink to="/dashboard">My Leagues</MobileLink>
                <MobileLink to="/nfl">NFL Scores</MobileLink>
                <MobileLink to="/leagues/new">Create a league</MobileLink>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="focus-ring flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-rose-300 disabled:opacity-50"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </>
            ) : (
              <>
                <MobileLink to="/login">Sign in</MobileLink>
                <MobileLink to="/register">Sign up</MobileLink>
              </>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}

function MobileLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="focus-ring flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-white/5"
    >
      {children}
    </Link>
  );
}
