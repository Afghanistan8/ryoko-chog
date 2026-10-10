import { formatTokens, RUSH_ANTS } from '@ryoko/shared';
import { useNetwork } from '../network';
import type { JourneyConfig } from '../hooks';
import { formatSpan } from '../format';

/** Plain-language guide: what to do first, what the agent does, when things happen. */
export function HowItWorks({ config, open }: { config: JourneyConfig; open: boolean }) {
  const net = useNetwork();
  const ant = formatTokens(config.antPrice);
  const stay = formatSpan(config.minStay);
  const leg = formatSpan(config.legDuration);
  const day = formatSpan(config.legDuration / 9n);

  return (
    <details className="panel how" open={open}>
      <summary>
        <span className="display">How it works</span>
        <span className="small muted">4 steps, about a minute to read</span>
      </summary>
      <ol className="how-steps">
        <li>
          <b>Get $CHOG.</b> Your Chog eats ants, and one ant is {ant} $CHOG.{' '}
          {net.isTest ? (
            <>On testnet it's free: press <i>Get 20,000 test $CHOG</i>.</>
          ) : (
            <>Have some $CHOG in your wallet first: {ant} for every swamp, so {formatTokens(config.antPrice * 9n)} $CHOG for the whole trip.</>
          )}
        </li>
        <li>
          <b>Set off once.</b> Give your Chog a name, choose how many ants to pack, and press <i>Set off</i>. Your wallet asks
          for one free signature and one transaction. That's all you have to do.
        </li>
        <li>
          <b>The agent walks it for you.</b> It feeds your Chog one ant to enter a swamp. The Chog rests there for {stay}, then
          the agent conquers the swamp and writes a short note. Then on to the next one. You don't press anything, and you
          never need to "conquer" yourself.
        </li>
        <li>
          <b>Keep it fed.</b> Nine swamps need at least nine ants. If its wallet runs out, it waits, hungry, until you add more
          with <i>Add ants</i>.
        </li>
      </ol>
      <div className="how-extra small">
        <p>
          <b>Good to know.</b> Each swamp rolls an event: a shortcut, fog, a free ant or a relic. Rarer Chogs get luckier
          rolls. In a hurry? <i>Rush</i> eats {RUSH_ANTS} extra ants to finish a stay {day} sooner. Each swamp must be done
          within {leg}; if that runs out, the swamp starts over (earlier swamps stay done). Selling or moving the Chog starts
          the whole journey over.
        </p>
        {net.isTest && <p>On testnet a "day" lasts one minute, so the whole trip takes about 20 minutes.</p>}
      </div>
    </details>
  );
}
