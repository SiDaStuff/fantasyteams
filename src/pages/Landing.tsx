import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Check, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { TeamLogo } from '@/components/draft/TeamLogo';
import { ChampionshipOddsChart } from '@/components/league/ChampionshipOddsChart';
import { NFL_TEAMS_BY_ID } from '@/data/nflTeams';
import type { ProjectionOwnerRow } from '@/types';

// Promotional fixtures only. These never read or write a real league.
const PLAYERS = [
  { name: 'Alex Morgan', initials: 'AM', teams: ['buf', 'det'], wins: 20, odds: 42 },
  { name: 'Sam Rivera', initials: 'SR', teams: ['kc', 'phi'], wins: 18, odds: 29 },
  { name: 'Jordan Lee', initials: 'JL', teams: ['bal', 'gb'], wins: 16, odds: 18 },
  { name: 'Casey Brooks', initials: 'CB', teams: ['sf', 'hou'], wins: 14, odds: 11 },
];
const SAMPLE_ODDS: ProjectionOwnerRow[] = PLAYERS.map((player, index) => ({
  userId: `sample-${index}`, displayName: player.name.split(' ')[0], photoURL: null,
  confirmedWins: player.wins, projectedFinalWins: player.wins + 6, expectedRemainingWins: 6,
  championshipProbability: player.odds / 100, likelyFinalRank: index + 1,
}));

function CreateLeagueLink({ children = 'Create a League' }: { children?: ReactNode }) {
  return <Link to="/leagues/new" className="home-button home-button-primary focus-ring">{children}<ArrowRight size={17} aria-hidden /></Link>;
}

function Standings({ compact = false }: { compact?: boolean }) {
  return (
    <table className={`home-standings ${compact ? 'home-standings-compact' : ''}`}>
      <caption className="sr-only">Sample league standings, Week 12</caption>
      <thead><tr><th scope="col"><span className="sr-only">Rank</span>#</th><th scope="col">Player</th><th scope="col">Teams</th><th scope="col">Wins</th></tr></thead>
      <tbody>{PLAYERS.map((player, index) => (
        <tr key={player.name}>
          <td><span className={index === 0 ? 'home-rank-first' : ''}>{index + 1}</span></td>
          <th scope="row"><div className="home-player"><span className={`home-avatar home-avatar-${index}`} aria-hidden>{player.initials}</span><span>{player.name}{index === 0 && <small>League leader</small>}</span></div></th>
          <td><div className="home-team-pair">{player.teams.map((id) => <TeamLogo key={id} teamId={id} size="xs" />)}</div></td>
          <td>{player.wins}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

function LeaguePreview() {
  const [view, setView] = useState<'standings' | 'odds'>('standings');
  return (
    <div className="home-league-preview">
      <div className="home-preview-heading"><span className="home-preview-league-icon"><Trophy size={22} aria-hidden /></span><div><p className="home-preview-kicker">THE SUNDAY CREW</p><h2>Friends. Football. Bragging rights.</h2></div></div>
      <div className="home-preview-meta"><span>4 players <span aria-hidden>·</span> Week 12</span><span className="home-demo-label">Sample league</span></div>
      <div className="home-preview-switch" aria-label="Sample league view">
        <button type="button" className="focus-ring" aria-pressed={view === 'standings'} onClick={() => setView('standings')}>Standings</button>
        <button type="button" className="focus-ring" aria-pressed={view === 'odds'} onClick={() => setView('odds')}>Championship odds</button>
      </div>
      <div className="home-preview-content">{view === 'standings' ? <Standings /> : <div className="home-hero-odds"><ChampionshipOddsChart owners={SAMPLE_ODDS} /></div>}</div>
      <div className="home-preview-bottom"><span><span className="home-status-dot" />Every team win counts.</span><span>One title to take home.</span></div>
    </div>
  );
}

function DraftPreview() {
  const [selected, setSelected] = useState('buf');
  return (
    <div className="home-feature-preview home-draft-preview">
      <div className="home-mini-heading"><h3>Draft room</h3><span className="home-demo-label">Interactive demo</span></div>
      <div className="home-draft-clock"><div><span className="home-preview-kicker">ROUND 1 · PICK 1</span><strong>You’re on the clock.</strong></div><span className="home-clock-time">00:45<small>Sample timer</small></span></div>
      <p className="home-available-label">Available teams <span>Choose a team to preview your pick</span></p>
      <div className="home-draft-teams">{['buf', 'det', 'kc', 'phi'].map((id) => (
        <button type="button" key={id} className="focus-ring" aria-label={`Preview ${NFL_TEAMS_BY_ID[id].name}`} aria-pressed={selected === id} onClick={() => setSelected(id)}>
          <TeamLogo teamId={id} size="md" /><span>{NFL_TEAMS_BY_ID[id].nickname}</span>{selected === id && <Check className="home-draft-check" size={13} aria-hidden />}
        </button>
      ))}</div>
      <div className="home-draft-selection" aria-live="polite"><span>Your pick</span><strong>{NFL_TEAMS_BY_ID[selected].name}</strong><Check size={16} aria-hidden /></div>
    </div>
  );
}

export function Landing() {
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('home-enter');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    pageRef.current?.querySelectorAll('.home-reveal').forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="home" ref={pageRef}>
      <section className="home-hero home-container" aria-labelledby="hero-title">
        <div className="home-hero-copy home-reveal">
          <p className="home-eyebrow"><span />A DIFFERENT KIND OF FANTASY FOOTBALL</p>
          <h1 id="hero-title">Draft NFL Teams.<br /><span>Win the Season.</span></h1>
          <p className="home-hero-description">Pick your teams, compete with friends, and see who finishes with the most wins.</p>
          <div className="home-actions"><CreateLeagueLink /><Link to="/join" className="home-button home-button-secondary focus-ring">Join a League</Link></div>
          <p className="home-hero-note">Your friends. All 32 teams. A whole season of competition.</p>
        </div>
        <div className="home-hero-product home-reveal"><div className="home-product-caption"><span>THIS IS YOUR LEAGUE</span><span>PREVIEW / 01</span></div><LeaguePreview /><p className="home-sample-note">A look inside Fantasy Teams. All names and results are examples.</p></div>
      </section>

      <section id="how-it-works" className="home-how" aria-labelledby="how-title">
        <div className="home-container home-reveal"><div className="home-section-heading"><p className="home-eyebrow">THE GAME PLAN</p><h2 id="how-title">How It Works</h2></div>
          <ol className="home-steps">{[
            ['Start a League', 'Create a league and invite your friends.'],
            ['Draft Your Teams', 'Take turns picking NFL teams.'],
            ['Collect Wins', 'Every NFL win adds to your total. Most wins takes the title.'],
          ].map(([title, description], index) => <li key={title}><span className="home-step-number">0{index + 1}</span><div><h3>{title}</h3><p>{description}</p></div></li>)}</ol>
        </div>
      </section>

      <section className="home-features home-container" aria-labelledby="features-title">
        <div className="home-section-heading home-reveal"><p className="home-eyebrow">FROM THE FIRST PICK TO THE FINAL WHISTLE</p><h2 id="features-title">Every Sunday means something.</h2></div>
        <article className="home-feature home-reveal">
          <div className="home-feature-copy"><span className="home-feature-index">01 / FOLLOW THE RACE</span><h3>Live Standings</h3><p>Follow the leaderboard as NFL games finish.</p><p className="home-feature-detail">One win can change the whole league.</p></div>
          <div className="home-feature-preview"><div className="home-mini-heading"><h3>League standings</h3><span className="home-demo-label">Sample results</span></div><div className="home-game-result"><TeamLogo teamId="buf" size="sm" /><strong>BUF <span>27</span></strong><span className="home-final-badge">FINAL</span><strong><span>20</span> MIA</strong><TeamLogo teamId="mia" size="sm" /></div><div className="home-win-update"><Check size={14} aria-hidden /><span>Buffalo wins. Alex adds one to the total.</span></div><Standings compact /></div>
        </article>
        <article className="home-feature home-feature-reverse home-reveal">
          <div className="home-feature-copy"><span className="home-feature-index">02 / MAKE YOUR PICK</span><h3>Real-Time Drafts</h3><p>Draft teams together with friends.</p><p className="home-feature-detail">Build your lineup, one franchise at a time.</p></div><DraftPreview />
        </article>
        <article className="home-feature home-reveal">
          <div className="home-feature-copy"><span className="home-feature-index">03 / EYES ON THE TITLE</span><h3>Championship Odds</h3><p>See how your chances change throughout the season.</p><p className="home-feature-detail">There’s always a reason to watch the next game.</p></div>
          <div className="home-feature-preview home-odds-preview"><div className="home-mini-heading"><h3>Championship odds</h3><span className="home-demo-label">Sample projections</span></div><div className="home-odds-leader"><span>Alex leads the race</span><strong>42<span>%</span></strong></div><ChampionshipOddsChart owners={SAMPLE_ODDS} /><p className="home-chart-note">Projected chances, not guaranteed results.</p></div>
        </article>
      </section>

      <section className="home-final-cta" aria-labelledby="cta-title"><div className="home-container home-reveal"><div><p className="home-eyebrow">THE NEXT SEASON IS YOURS</p><h2 id="cta-title">Your League. Your Teams.<br />Your Season.</h2><p>Get your friends together and start drafting.</p></div><CreateLeagueLink /></div></section>
    </div>
  );
}
