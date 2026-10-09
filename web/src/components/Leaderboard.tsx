import { useMemo } from 'react';
import { compareForLeaderboard, glowLevel, Status, SWAMPS, type JourneyView } from '@ryoko/shared';
import { chogLabel } from '../format';

interface Props {
  journeys: JourneyView[];
  limit?: number;
  highlight?: string;
}

export function Leaderboard({ journeys, limit, highlight }: Props) {
  const rows = useMemo(
    () => journeys.filter((j) => j.status !== Status.None).sort(compareForLeaderboard),
    [journeys],
  );
  const shown = limit ? rows.slice(0, limit) : rows;

  if (rows.length === 0) {
    return <p className="muted">No Chog has set off yet. Start a journey and you will lead the mire.</p>;
  }

  return (
    <div className="table-wrap">
      <table className="board">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Chog</th>
            <th scope="col">Swamps</th>
            <th scope="col" className="r">Ants</th>
            <th scope="col" className="r">Restarts</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((j, i) => {
            const g = glowLevel(j);
            const mine = highlight !== undefined && j.holder.toLowerCase() === highlight.toLowerCase();
            return (
              <tr key={j.tokenId.toString()} className={mine ? 'you' : undefined}>
                <td>{i + 1}</td>
                <td>
                  <a href={`#/chog/${j.tokenId}`}>{chogLabel(j.name, j.tokenId)}</a>
                  {mine && <span className="tag">yours</span>}
                </td>
                <td>
                  <span className="pips" aria-label={`${j.conquered} of 9 swamps conquered`}>
                    {SWAMPS.map((s) => (
                      <i key={s.number} style={s.number <= j.conquered ? { background: `rgb(${s.glow})` } : undefined} />
                    ))}
                  </span>
                  <span className="pip-text">
                    {j.status === Status.Complete ? 'Complete' : `${j.conquered}/9`}
                    {g === 9 && j.status === Status.Complete ? ' · gold' : ''}
                  </span>
                </td>
                <td className="r num">{j.ants}</td>
                <td className="r num">{j.restarts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
