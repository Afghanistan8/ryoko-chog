import { useAccount, useReadContract } from 'wagmi';
import {
  formatTokens,
  displaySwamp,
  glowLevel,
  legDay,
  ryokoJourneyAbi,
  swampByNumber,
  SWAMPS,
  STATUS_LABEL,
  Status,
  type JourneyView,
} from '@ryoko/shared';
import { useNetwork } from '../network';
import { useAllJourneys, useChainNow, useJourneyConfig } from '../hooks';
import { SwampCanvas } from '../components/SwampCanvas';
import { ChogPortrait } from '../components/ChogPortrait';
import { HolderPanel } from '../components/HolderPanel';
import { chogLabel, formatDuration, shortAddress } from '../format';

export function ChogPage({ id }: { id: bigint }) {
  const net = useNetwork();
  const { address } = useAccount();
  const journeys = useAllJourneys();
  const config = useJourneyConfig();
  const now = useChainNow();
  const notes = useReadContract({
    address: net.journey,
    abi: ryokoJourneyAbi,
    functionName: 'notesOf',
    args: [id],
    query: { refetchInterval: 20_000 },
  });

  const view = journeys.data?.find((j) => j.tokenId === id);

  if (journeys.isLoading || config.isLoading) return <p className="muted pad">Wading out to find this Chog…</p>;
  if (journeys.isError) return <p className="err pad">Could not read the journey contract. Check the RPC and try again.</p>;
  if (!view || view.holder === '0x0000000000000000000000000000000000000000') {
    return (
      <section className="panel pad">
        <h1 className="display">Chog #{id.toString()} was not found</h1>
        <p className="muted">It may not be minted on this network.</p>
      </section>
    );
  }

  const g = glowLevel(view);
  const swamp = swampByNumber(displaySwamp(view));
  const day = config.data && now !== undefined ? legDay(view, now, config.data) : null;
  const isHolder = address !== undefined && address.toLowerCase() === view.holder.toLowerCase();
  const complete = view.status === Status.Complete;

  return (
    <div className="chog-page">
      <SwampCanvas
        swamp={swamp.number}
        glow={g}
        complete={complete}
        ants={view.ants}
        antLabel={config.data ? `${formatTokens(config.data.antPrice)} CHOG` : ''}
        label={`${chogLabel(view.name, view.tokenId)} in ${swamp.name}`}
      >
        <div className="hud hud-tl">
          <div className="eyebrow">{hudEyebrow(view)}</div>
          <div className="sname">{swamp.name}</div>
          {day !== null && !complete && (
            <>
              <div className="eyebrow">Day {day} of 9</div>
              <div className="days" aria-hidden="true">
                {Array.from({ length: 9 }, (_, i) => (
                  <i key={i} className={i < day ? 'on' : ''} />
                ))}
              </div>
            </>
          )}
          {view.status === Status.Expired && <div className="warn">Missed the deadline. The next ant restarts this swamp.</div>}
        </div>
        <div className="hud hud-tr">
          <div className="hud-name">{chogLabel(view.name, view.tokenId)}</div>
          <div className="glowchip">
            <b style={{ background: g ? `rgb(${SWAMPS[g - 1]!.glow})` : 'transparent' }} />
            {g ? `${SWAMPS[g - 1]!.glowName} glow` : 'No glow yet'}
          </div>
          <div>
            Ants eaten <span className="num">{view.ants}</span>
          </div>
          <div>
            Burned <span className="num">{formatTokens(view.burned)}</span> CHOG
          </div>
        </div>
      </SwampCanvas>

      <div className="chog-grid">
        <section className="panel" aria-labelledby="status-h">
          <div className="row">
            <ChogPortrait tokenId={view.tokenId} glow={g} size={88} />
            <div>
              <h1 id="status-h" className="display">
                {chogLabel(view.name, view.tokenId)}
              </h1>
              <p className="muted small">
                Chog #{view.tokenId.toString()} · held by <code>{shortAddress(view.holder)}</code>
              </p>
            </div>
          </div>
          <dl className="facts">
            <div>
              <dt>Status</dt>
              <dd>{STATUS_LABEL[view.status as keyof typeof STATUS_LABEL]}</dd>
            </div>
            <div>
              <dt>Swamps conquered</dt>
              <dd className="num">{view.conquered} of 9</dd>
            </div>
            {view.status === Status.InSwamp && now !== undefined && (
              <div>
                <dt>Can conquer in</dt>
                <dd className="num">{formatDuration(view.readyAt - now)}</dd>
              </div>
            )}
            {view.deadline > 0n && now !== undefined && view.status !== Status.Expired && (
              <div>
                <dt>Deadline for this swamp</dt>
                <dd className="num">{formatDuration(view.deadline > now ? view.deadline - now : 0n)} left</dd>
              </div>
            )}
            <div>
              <dt>Restarts</dt>
              <dd className="num">{view.restarts}</dd>
            </div>
            <div>
              <dt>Agent</dt>
              <dd>
                {view.agent === '0x0000000000000000000000000000000000000000' ? 'None' : <code>{shortAddress(view.agent)}</code>}
              </dd>
            </div>
          </dl>
        </section>

        <section className="panel" aria-labelledby="notes-h">
          <h2 id="notes-h" className="display">
            Field notes
          </h2>
          {view.conquered === 0 ? (
            <p className="muted">No swamp conquered yet. Notes appear here as the Chog moves on.</p>
          ) : (
            <ol className="notes">
              {(notes.data ?? [])
                .map((n, i) => ({ n, i }))
                .filter((x) => x.n)
                .reverse()
                .map(({ n, i }) => (
                  <li key={i} style={{ borderColor: `rgb(${SWAMPS[i]!.glow})` }}>
                    <span className="eyebrow">{SWAMPS[i]!.name}</span>
                    <p>{n}</p>
                  </li>
                ))}
            </ol>
          )}
        </section>
      </div>

      {isHolder && config.data && <HolderPanel view={view} config={config.data} now={now} />}
      {!address && (
        <p className="muted small pad">Connect the wallet that holds this Chog to start or manage its journey.</p>
      )}
    </div>
  );
}

function hudEyebrow(view: JourneyView): string {
  if (view.status === Status.None) return 'Not travelling';
  if (view.status === Status.Complete) return 'All 9 swamps conquered';
  if (view.status === Status.Travelling) {
    return view.conquered === 0 ? 'Setting off for swamp 1' : `Heading for swamp ${view.conquered + 1} of 9`;
  }
  return `Swamp ${view.currentSwamp} of 9`;
}

