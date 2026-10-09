import { useRoute } from './hooks';
import { useNetwork } from './network';
import { ConnectButton } from './components/ConnectButton';
import { Home } from './pages/Home';
import { Mine } from './pages/Mine';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { ChogPage } from './pages/ChogPage';
import { shortAddress } from './format';

export function App() {
  const route = useRoute();
  const net = useNetwork();
  const explorer = net.chain.blockExplorers?.default.url;

  return (
    <div className="wrap">
      <header className="top">
        <a className="logo display" href="#/">
          Ryoko <span>Chog</span>
        </a>
        <nav aria-label="Main">
          <a href="#/" aria-current={route.page === 'home' ? 'page' : undefined}>
            Swamps
          </a>
          <a href="#/mine" aria-current={route.page === 'mine' ? 'page' : undefined}>
            My Chogs
          </a>
          <a href="#/leaderboard" aria-current={route.page === 'leaderboard' ? 'page' : undefined}>
            Leaderboard
          </a>
        </nav>
        <ConnectButton />
      </header>

      <main>
        {route.page === 'home' && <Home />}
        {route.page === 'mine' && <Mine />}
        {route.page === 'leaderboard' && <LeaderboardPage />}
        {route.page === 'chog' && <ChogPage id={route.id} />}
      </main>

      <footer className="foot small muted">
        <span>
          {net.chain.name}
          {net.isTest ? ' · test Chogs and test CHOG' : ' · Chog Genesis and $CHOG'}
        </span>
        {explorer && (
          <a href={`${explorer}/address/${net.journey}`} target="_blank" rel="noreferrer">
            Journey contract {shortAddress(net.journey)}
          </a>
        )}
      </footer>
    </div>
  );
}
