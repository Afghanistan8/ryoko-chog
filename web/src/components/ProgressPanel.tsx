import { SWAMPS, Status, STATUS_LABEL, formatTokens, type JourneyView } from '@ryoko/shared';
import type { JourneyConfig } from '../hooks';
import { formatDuration, shortAddress } from '../format';
import { swampState, type DioramaState } from '../diorama/state';

interface Props {
  view: JourneyView;
  config: JourneyConfig;
  now: bigint | undefined;
  dstate: DioramaState;
  selected: number;
  notes: readonly string[];
  antsInWallet: number;
}

const ANT = (
  <svg viewBox="0 0 20 14" aria-hidden="true">
    <g fill="#d8b46a">
      <ellipse cx="14" cy="8" rx="5" ry="3.6" />
      <ellipse cx="8" cy="8" rx="2.6" ry="2.3" />
      <ellipse cx="3.4" cy="7" rx="2.8" ry="2.6" />
    </g>
    <g stroke="#d8b46a" strokeWidth="1">
      <path d="M6 9l-2 4M8 9l0 4M10 9l2 4M2 5l-1-4M4 5l1-4" />
    </g>
  </svg>
);

/** Right-hand column of the Chog page: what is happening now, what comes next, and the record so far. */
export function ProgressPanel({ view, config, now, dstate, selected, notes, antsInWallet }: Props) {
  const glow = dstate.glow;
  const sel = SWAMPS[selected]!;
  const selState = swampState(dstate, selected);

  return (
    <div className="progress">
      <section className="panel now-card" aria-labelledby="now-h">
        <div className="eyebrow">Right now</div>
        <h2 id="now-h" className="display">
          {STATUS_LABEL[view.status as keyof typeof STATUS_LABEL]}
        </h2>
        <NowDetail view={view} config={config} now={now} antsInWallet={antsInWallet} />
        <div>
          <div className="eyebrow">Ant pouch</div>
          <div className="pouch" aria-label={`${antsInWallet} ants in the Chog's wallet`}>
            {Array.from({ length: 9 }, (_, k) => (
              <span key={k} className={k < antsInWallet ? '' : 'empty'}>
                {ANT}
              </span>
            ))}
          </div>
          <p className="small muted tight">
            {antsInWallet > 9 ? `${antsInWallet} ants` : `${antsInWallet} ant${antsInWallet === 1 ? '' : 's'}`} in its wallet ·{' '}
            {formatTokens(config.antPrice)} CHOG each
          </p>
        </div>
        <div>
          <div className="eyebrow">Glow</div>
          <div className="glowmeter" aria-label={`Glow level ${glow} of 9`}>
            {SWAMPS.map((s, k) => (
              <i key={s.number} style={k < glow ? { background: `rgb(${s.glow})` } : undefined} />
            ))}
          </div>
          <p className="small muted tight">{glow ? `${SWAMPS[glow - 1]!.glowName} glow` : 'No glow yet'}</p>
        </div>
      </section>

      <section className="panel" aria-labelledby="sel-h">
        <div className="eyebrow">
          Swamp {sel.number} · {selState === 'done' ? 'conquered' : selState === 'now' ? 'current' : 'locked'}
        </div>
        <h2 id="sel-h" className="display">
          {sel.name}
        </h2>
        {selState === 'done' && notes[selected] ? (
          <blockquote className="note-quote">"{notes[selected]}"</blockquote>
        ) : (
          <p className="small muted tight">{sel.mood}.</p>
        )}
      </section>

      <section className="panel" aria-labelledby="rec-h">
        <h2 id="rec-h" className="display">
          The record
        </h2>
        <dl className="facts">
          <div>
            <dt>Conquered</dt>
            <dd className="num">{view.conquered} of 9</dd>
          </div>
          <div>
            <dt>Ants eaten</dt>
            <dd className="num">{view.ants}</dd>
          </div>
          <div>
            <dt>CHOG burned</dt>
            <dd className="num">{formatTokens(view.burned)}</dd>
          </div>
          <div>
            <dt>Restarts</dt>
            <dd className="num">{view.restarts}</dd>
          </div>
          <div>
            <dt>Agent</dt>
            <dd>{/^0x0+$/.test(view.agent) ? 'None' : <code>{shortAddress(view.agent)}</code>}</dd>
          </div>
        </dl>
        {notes.some(Boolean) && (
          <ol className="notes">
            {notes
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
  );
}

function NowDetail({ view, config, now, antsInWallet }: { view: JourneyView; config: JourneyConfig; now: bigint | undefined; antsInWallet: number }) {
  if (now === undefined) return null;
  const left = (t: bigint) => (t > now ? t - now : 0n);
  const bar = (done: bigint, total: bigint) => {
    const pct = total > 0n ? Math.min(100, Math.max(0, Number((done * 100n) / total))) : 0;
    return (
      <div className="bar" aria-hidden="true">
        <i style={{ width: `${pct}%` }} />
      </div>
    );
  };
  switch (view.status) {
    case Status.None:
      return <p className="small muted tight">Start the journey to send this Chog to swamp 1.</p>;
    case Status.Travelling: {
      const fits = now + config.minStay <= view.deadline;
      return (
        <>
          <div className="q-row">
            <span>{view.conquered === 0 ? 'Enter swamp 1 within' : `Reach swamp ${view.conquered + 1} within`}</span>
            <b className="num">{formatDuration(left(view.deadline))}</b>
          </div>
          {bar(now - view.legStartedAt, config.legDuration)}
          <p className="small muted tight">
            {antsInWallet === 0
              ? 'Hungry: feed it an ant so it can enter the next swamp.'
              : fits
                ? 'The agent makes it eat an ant on its next round.'
                : 'Too late to enter this leg. The swamp restarts once the deadline passes.'}
          </p>
        </>
      );
    }
    case Status.InSwamp:
      return (
        <>
          <div className="q-row">
            <span>Resting, conquers in</span>
            <b className="num">{formatDuration(left(view.readyAt))}</b>
          </div>
          {bar(now - view.enteredAt, config.minStay)}
          <p className="small muted tight">Then the agent writes a field note and the Chog moves on.</p>
        </>
      );
    case Status.Ready:
      return (
        <>
          <div className="q-row">
            <span>Must conquer within</span>
            <b className="num">{formatDuration(left(view.deadline))}</b>
          </div>
          <p className="small muted tight">Ready. The agent conquers it on its next round.</p>
        </>
      );
    case Status.Expired:
      return <p className="warn-text small">Missed the deadline. The next ant restarts this swamp; earlier swamps stay conquered.</p>;
    case Status.Complete:
      return <p className="small tight gold-text">All nine swamps conquered. This Chog glows gold.</p>;
    default:
      return null;
  }
}
