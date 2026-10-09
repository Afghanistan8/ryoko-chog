import { useEffect, useState } from 'react';
import { decodeEventRecord, EVENT_INFO, SWAMPS, Status, type JourneyView } from '@ryoko/shared';
import { useNetwork } from '../network';
import { shareLinks } from '../share';
import { ShareButton } from './ShareButton';

/**
 * Shown to the holder after a swamp they have not seen yet was conquered: the share card and a
 * one-click post to X. Remembered per browser, journey and swamp.
 */
export function ConquestBanner({ view, name, events }: { view: JourneyView; name: string; events: readonly number[] }) {
  const net = useNetwork();
  const key = `ryoko-seen:${net.name}:${view.tokenId}:${view.journeyId}`;
  const [seen, setSeen] = useState<number | null>(null);
  const [imageOk, setImageOk] = useState(true);

  useEffect(() => {
    try {
      setSeen(Number(window.localStorage.getItem(key) ?? '0') || 0);
    } catch {
      setSeen(view.conquered); // no storage: never nag
    }
  }, [key, view.conquered]);

  if (seen === null || view.conquered === 0 || view.conquered <= seen) return null;

  const swamp = view.conquered;
  const record = decodeEventRecord(events[swamp - 1] ?? 0);
  const input = {
    net: net.name,
    tokenId: view.tokenId,
    swamp,
    name,
    eventLabel: record.event > 1 ? EVENT_INFO[record.event].label : '',
    complete: view.status === Status.Complete,
  };
  const dismiss = () => {
    try {
      window.localStorage.setItem(key, String(view.conquered));
    } catch {
      // nothing to remember with
    }
    setSeen(view.conquered);
  };

  return (
    <section className="panel conquest" aria-labelledby="conquest-h">
      <div className="step-label">New conquest</div>
      <h2 id="conquest-h" className="display">
        {view.status === Status.Complete ? 'All nine swamps!' : `${SWAMPS[swamp - 1]!.name} conquered`}
      </h2>
      {imageOk && (
        <img
          className="conquest-card"
          src={shareLinks(input).image}
          alt={`Share card: ${name} conquered ${SWAMPS[swamp - 1]!.name}`}
          width={600}
          height={315}
          onError={() => setImageOk(false)}
        />
      )}
      <p className="small tight">
        {imageOk
          ? 'Your post is written and the card above comes with the link. One click to share it.'
          : "Your post is written, and its link shows a card with your Chog's name and this swamp. One click to share it."}
      </p>
      <div className="row wrap" onClick={dismiss}>
        <ShareButton input={input} variant="primary" />
        <button type="button" className="btn ghost">
          Not now
        </button>
      </div>
    </section>
  );
}
