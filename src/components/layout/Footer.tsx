import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="border-t border-line bg-navy-950">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:px-6">
        <p>© {new Date().getFullYear()} Fantasy Teams. Not affiliated with the NFL.</p>
        <div className="flex items-center gap-5">
          <Link to="/leagues/new" className="transition-colors hover:text-slate-300">
            Create a league
          </Link>
          <Link to="/join" className="transition-colors hover:text-slate-300">
            Join a league
          </Link>
        </div>
      </div>
    </footer>
  );
}
