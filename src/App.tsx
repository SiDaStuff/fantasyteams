import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { RequireAuth } from '@/components/layout/RequireAuth';
import { Landing } from '@/pages/Landing';
import { Login } from '@/pages/Login';
import { Register } from '@/pages/Register';
import { Dashboard } from '@/pages/Dashboard';
import { CreateLeague } from '@/pages/CreateLeague';
import { JoinLeague } from '@/pages/JoinLeague';
import { LeagueLobby } from '@/pages/LeagueLobby';
import { DraftRoom } from '@/pages/DraftRoom';
import { NflScores } from '@/pages/NflScores';
import { TeamProfile } from '@/pages/TeamProfile';
import { ComparePlayers } from '@/pages/ComparePlayers';
import { NotFound } from '@/pages/NotFound';

/** Scrolls to the top on every route change for a native SPA feel. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/join" element={<JoinLeague />} />

          <Route element={<RequireAuth />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/leagues/new" element={<CreateLeague />} />
            <Route path="/leagues/:leagueId" element={<LeagueLobby />} />
            <Route path="/leagues/:leagueId/draft" element={<DraftRoom />} />
            <Route path="/leagues/:leagueId/compare" element={<ComparePlayers />} />
            <Route path="/nfl" element={<NflScores />} />
            <Route path="/nfl/teams/:teamId" element={<TeamProfile />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  );
}