import { useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { displaySwamp, formatTokens, Status, SWAMPS } from '@ryoko/shared';
import { useAllJourneys, useJourneyConfig, usePrefersReducedMotion } from '../hooks';
import { useNetwork } from '../network';
import { SwampCanvas } from '../components/SwampCanvas';
import { Leaderboard } from '../components/Leaderboard';
import { formatDuration } from '../format';

const DEMO_STEP_MS = 9000;

export function Home() {
  const net = useNetwork();
  const { address } = useAccount();
  const journeys = useAllJourneys();
  const config = useJourneyConfig();
  const reduced = usePrefersReducedMotion();
  const [demo, setDemo] = useState({ swamp: 1, eat: 0 });

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setDemo((d) => ({ swamp: (d.swamp % 9) + 1, eat: d.eat + 1 })), DEMO_STEP_MS);
    return () => clearInterval(id);
  }, [reduced]);

  const stats = useMemo(() => {
    const all = journeys.data ?? [];
    const active = all.filter((j) => j.status !== Status.None);
    const perSwamp = Array.from({ length: 9 }, () => 0);
    for (const j of active) {
      if (j.status !== Status.Complete) perSwamp[displaySwamp(j) - 1]! += 1;
    }
    return {
      travelling: active.filter((j) => j.status !== Status.Complete).length,
      complete: active.filter((j) => j.status === Status.Complete).length,
      ants: active.reduce((n, j) => n + j.ants, 0),
      burned: active.reduce((n, j) => n + j.burned, 0n),
      perSwamp,
    };
  }, [journeys.data]);

  const demoSwamp = SWAMPS[demo.swamp - 1]!;

  return (
    <div className="home">
      <SwampCanvas
        swamp={demo.swamp}
        glow={demo.swamp}
        complete={demo.swamp === 9}
        ants={demo.eat}
        antLabel={config.data ? `${formatTokens(config.data.antPrice)} CHOG` : ''}
        label={`A Chog travelling through ${demoSwamp.name}`}
      >
        <div className="hero-copy">
          <h1 className="display hero-title">
            Ryoko <span>Chog</span>
          </h1>
          <p className="hero-sub">
            Your Chog gets its own wallet and an agent. Feed it ants made of $CHOG, and it walks nine swamps on
            Monad, writing a note each time it conquers one. The further it goes, the brighter it glows.
          </p>
          <div className="row wrap">
            <a className="btn" href="#/mine">
              {address ? 'My Chogs' : 'Start with your Chog'}
            </a>
            <a className="btn ghost" href="#/leaderboard">
              Leaderboard
            </a>
          </div>
        </div>
        <div className="hud hud-br">
          <div className="eyebrow">Demo · swamp {demo.swamp} of 9</div>
          <div className="sname small-name">{demoSwamp.name}</div>
        </div>
      </SwampCanvas>

      {net.isTest && (
        <p className="testnet-banner">
          Testnet demo: Chogs and CHOG here are free test tokens, and a day lasts{' '}
          {config.data ? formatDuration(config.data.legDuration / 9n) : 'about a minute'}.
        </p>
      )}

      <section className="stats" aria-label="Journey totals">
        <div className="stat">
          <span className="eyebrow">Chogs travelling</span>
          <b className="num">{journeys.data ? stats.travelling : '–'}</b>
        </div>
        <div className="stat">
          <span className="eyebrow">Journeys complete</span>
          <b className="num">{journeys.data ? stats.complete : '–'}</b>
        </div>
        <div className="stat">
          <span className="eyebrow">Ants eaten</span>
          <b className="num">{journeys.data ? stats.ants : '–'}</b>
        </div>
        <div className="stat">
          <span className="eyebrow">CHOG burned</span>
          <b className="num">{journeys.data ? formatTokens(stats.burned) : '–'}</b>
        </div>
      </section>
      <p className="small muted stats-note">Totals cover current journeys. A journey that resets on a sale drops out.</p>

      <section aria-labelledby="map-h">
        <h2 id="map-h" className="display section-title">
          The nine swamps
        </h2>
        <div className="map">
          {SWAMPS.map((s) => (
            <div key={s.number} className="tile" style={{ borderColor: `rgba(${s.glow},.45)` }}>
              <span className="tile-n">
                Swamp {s.number}
                <b style={{ background: `rgb(${s.glow})` }} aria-hidden="true" />
              </span>
              <span className="tile-name">{s.name}</span>
              <span className="tile-mood">{s.mood}</span>
              <span className="tile-count num">
                {journeys.data ? `${stats.perSwamp[s.number - 1]} here now` : ''}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="two-col">
        <section className="panel" aria-labelledby="rules-h">
          <h2 id="rules-h" className="display">
            Rules of the swamp
          </h2>
          <ul className="rules">
            <li>
              <span>9</span>Nine swamps, one at a time.
            </li>
            <li>
              <span>A</span>The Chog eats one ant to enter each swamp:{' '}
              {config.data ? `${formatTokens(config.data.antPrice)} CHOG` : 'a set amount of CHOG'}, burned.
            </li>
            <li>
              <span>D</span>It stays at least {config.data ? formatDuration(config.data.minStay) : '2 days'} and must
              conquer within {config.data ? formatDuration(config.data.legDuration) : '9 days'} of setting out.
            </li>
            <li>
              <span>R</span>Miss the deadline and that swamp restarts. Earlier swamps stay conquered.
            </li>
            <li>
              <span>N</span>Each conquered swamp gets a field note, written on-chain.
            </li>
            <li>
              <span>X</span>Sell or move the Chog and its journey resets to swamp 1.
            </li>
            <li>
              <span>G</span>The glow grows each swamp and turns gold at swamp 9.
            </li>
          </ul>
        </section>
        <section className="panel" aria-labelledby="top-h">
          <h2 id="top-h" className="display">
            Top of the mire
          </h2>
          {journeys.isLoading ? (
            <p className="muted">Counting Chogs…</p>
          ) : journeys.isError ? (
            <p className="err">Could not read journeys. Check the RPC.</p>
          ) : (
            <Leaderboard journeys={journeys.data ?? []} limit={8} highlight={address} />
          )}
          <a className="small" href="#/leaderboard">
            Full leaderboard
          </a>
        </section>
      </div>
    </div>
  );
}
