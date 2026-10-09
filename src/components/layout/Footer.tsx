import { Link, useLocation } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import { useAuth } from '@/context/AuthContext';

export function Footer() {
  const { status } = useAuth();
  const { pathname } = useLocation();
  return (
    <footer className="site-footer">
      <div className="site-container site-footer-main">
        <div className="site-footer-brand"><Link to="/" className="focus-ring" aria-label="Fantasy Teams home"><Logo /></Link><p>Fantasy football, one team at a time.</p></div>
        <div className="site-footer-links">
          <nav aria-label="Game"><h2>Game</h2><a href={pathname === '/' ? '#how-it-works' : '/#how-it-works'}>How It Works</a><Link to="/leagues/new">Create League</Link><Link to="/join">Join League</Link></nav>
          <nav aria-label="Account"><h2>Account</h2><Link to="/dashboard">Dashboard</Link>{status !== 'authenticated' && <Link to="/login">Sign In</Link>}</nav>
        </div>
      </div>
      <div className="site-container site-footer-bottom"><p>© {new Date().getFullYear()} Fantasy Teams</p><p>Not affiliated with or endorsed by the NFL.<br className="sm:hidden" /> Team names and logos are trademarks of their respective owners.</p></div>
    </footer>
  );
}
