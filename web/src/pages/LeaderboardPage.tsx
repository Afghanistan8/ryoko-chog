import { useAccount } from 'wagmi';
import { useAllJourneys } from '../hooks';
import { Leaderboard } from '../components/Leaderboard';

export function LeaderboardPage() {
  const { address } = useAccount();
  const journeys = useAllJourneys();
  return (
    <section className="panel" aria-labelledby="lb-h">
      <h1 id="lb-h" className="display">
        Leaderboard
      </h1>
      <p className="small muted">
        Finished journeys first, then most swamps conquered, then fewest restarts, then who got there first.
      </p>
      {journeys.isLoading ? (
        <p className="muted">Counting Chogs…</p>
      ) : journeys.isError ? (
        <p className="err">Could not read journeys. Check the RPC.</p>
      ) : (
        <Leaderboard journeys={journeys.data ?? []} highlight={address} />
      )}
    </section>
  );
}
