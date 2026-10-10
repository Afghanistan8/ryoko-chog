import { useMemo, useState } from 'react';
import { erc20Abi, zeroAddress } from 'viem';
import { useAccount, useReadContract } from 'wagmi';
import { ryokoJourneyAbi, SWAMPS, glowLevel, Status } from '@ryoko/shared';
import { useNetwork } from '../network';
import { useAllJourneys, useChainNow, useJourneyConfig } from '../hooks';
import { ChogPortrait } from '../components/ChogPortrait';
import { HolderPanel } from '../components/HolderPanel';
import { ProgressPanel } from '../components/ProgressPanel';
import { ConnectButton } from '../components/ConnectButton';
import { ConquestBanner } from '../components/ConquestBanner';
import { HowItWorks } from '../components/HowItWorks';
import { LazyDiorama } from '../diorama/LazyDiorama';
import { journeyToDiorama } from '../diorama/state';
import { chogLabel, shortAddress } from '../format';

export function ChogPage({ id }: { id: bigint }) {
  const net = useNetwork();
  const { address } = useAccount();
  const journeys = useAllJourneys();
  const config = useJourneyConfig();
  const now = useChainNow();
  const [picked, setPicked] = useState<number | null>(null);

  const view = journeys.data?.find((j) => j.tokenId === id);
  const exists = Boolean(view && view.holder !== zeroAddress);

  const notes = useReadContract({
    address: net.journey,
    abi: ryokoJourneyAbi,
    functionName: 'notesOf',
    args: [id],
    query: { refetchInterval: 20_000, enabled: exists },
  });
  const events = useReadContract({
    address: net.journey,
    abi: ryokoJourneyAbi,
    functionName: 'eventsOf',
    args: [id],
    query: { refetchInterval: 20_000, enabled: exists },
  });
  const walletChog = useReadContract({
    address: net.chogToken,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [view?.account ?? zeroAddress],
    query: { refetchInterval: 15_000, enabled: exists },
  });

  const antPrice = config.data?.antPrice ?? 0n;
  const antsInWallet = antPrice > 0n && walletChog.data !== undefined ? Number(walletChog.data / antPrice) : 0;
  const name = view ? chogLabel(view.name, view.tokenId) : '';
  const glow = view ? glowLevel(view) : 0;

  // Rebuild the 3D state only when something it draws actually changes.
  const dKey = view
    ? [view.status, view.conquered, view.currentSwamp, view.ants, view.swampEvent, view.rushed, name, glow, antsInWallet > 0].join('|')
    : '';
  const dstate = useMemo(
    () =>
      view
        ? journeyToDiorama(view, { name, glowName: glow ? SWAMPS[glow - 1]!.glowName : '', antsInWallet })
        : null,
    // dKey covers every field journeyToDiorama reads.
    [dKey],
  );

  if (journeys.isLoading || config.isLoading) return <p className="muted pad">Wading out to find this Chog…</p>;
  if (journeys.isError || config.isError) {
    return (
      <section className="panel pad center">
        <p className="err">Could not read the journey contract right now. The network may be busy.</p>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            void journeys.refetch();
            void config.refetch();
          }}
        >
          Try again
        </button>
      </section>
    );
  }
  if (!view || !exists || !dstate || !config.data) {
    return (
      <section className="panel pad">
        <h1 className="display">Chog #{id.toString()} was not found</h1>
        <p className="muted">It may not be minted on this network.</p>
      </section>
    );
  }

  const selected = picked ?? dstate.target;
  const isHolder = address !== undefined && address.toLowerCase() === view.holder.toLowerCase();

  return (
    <div className="chog-layout">
      <header className="chog-head">
        <ChogPortrait tokenId={view.tokenId} glow={glow} size={64} />
        <div>
          <h1 className="display">{name}</h1>
          <p className="muted small">
            Chog #{view.tokenId.toString()} · held by <code>{shortAddress(view.holder)}</code>
            {isHolder && <span className="tag-you">you</span>}
          </p>
        </div>
      </header>

      <aside className="col-left" aria-label="Journey steps">
        {isHolder && <ConquestBanner view={view} name={name} events={events.data ?? []} />}
        {isHolder && <HowItWorks config={config.data} open={view.status === Status.None} />}
        {isHolder ? (
          <HolderPanel view={view} config={config.data} now={now} />
        ) : (
          <section className="panel">
            <div className="step-label">Watching</div>
            <h2 className="display">Only its holder can send it</h2>
            <p className="small muted tight">
              Connect the wallet that holds Chog #{view.tokenId.toString()} to name it, feed it ants and appoint the agent.
            </p>
            {!address && <ConnectButton />}
          </section>
        )}
      </aside>

      <section className="col-center" aria-label="The swamps">
        <LazyDiorama
          state={dstate}
          selected={selected}
          focus={picked}
          onSelect={setPicked}
          onCenter={() => setPicked(null)}
          label={`${name} on the nine-swamp boardwalk, ${dstate.subtitle}`}
        />
        <div className="chips" role="group" aria-label="Choose a swamp">
          {SWAMPS.map((s, i) => (
            <button
              key={s.number}
              type="button"
              className={`chip${i === selected ? ' on' : ''}`}
              aria-pressed={i === selected}
              onClick={() => setPicked(i)}
            >
              <i style={i < dstate.conquered ? { background: `rgb(${s.glow})` } : i === dstate.target && !dstate.complete && dstate.started ? { background: 'var(--chog)' } : undefined} />
              {s.number} · {s.name}
            </button>
          ))}
        </div>
      </section>

      <aside className="col-right" aria-label="Progress">
        <ProgressPanel
          view={view}
          config={config.data}
          now={now}
          dstate={dstate}
          selected={selected}
          notes={notes.data ?? []}
          events={events.data ?? []}
          antsInWallet={antsInWallet}
        />
      </aside>
    </div>
  );
}
