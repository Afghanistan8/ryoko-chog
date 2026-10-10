import { useState, type ReactNode } from 'react';
import { encodeFunctionData, erc20Abi, maxUint256, parseAbi, parseSignature, zeroAddress, domainSeparator, type Hash } from 'viem';
import { useAccount, usePublicClient, useReadContracts, useSignTypedData, useWriteContract } from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import {
  formatTokens,
  maxStay,
  nameProblem,
  RUSH_ANTS,
  rushCut,
  ryokoAccountAbi,
  ryokoJourneyAbi,
  testChogTokenAbi,
  writeNote,
  Status,
  type JourneyView,
  type SwampEventValue,
} from '@ryoko/shared';
import { useNetwork } from '../network';
import { useChogMeta, type JourneyConfig } from '../hooks';
import { TxButton } from './TxButton';
import { formatDuration, formatSpan, shortAddress } from '../format';

const permitAbi = parseAbi([
  'function name() view returns (string)',
  'function nonces(address owner) view returns (uint256)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
]);

const NO_PERMIT = { deadline: 0n, v: 0, r: `0x${'0'.repeat(64)}`, s: `0x${'0'.repeat(64)}` } as const;

interface Props {
  view: JourneyView;
  config: JourneyConfig;
  now: bigint | undefined;
}

export function HolderPanel({ view, config, now }: Props) {
  const active = view.status !== Status.None;
  return (
    <section className="panel holder" aria-labelledby="holder-h">
      <div className="step-label">You hold this Chog</div>
      <h2 id="holder-h" className="display">
        {active ? 'Its journey' : 'Send it on its way'}
      </h2>
      {active ? <Travelling view={view} config={config} now={now} /> : <SetOff view={view} config={config} />}
    </section>
  );
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () => {
    // Journeys come from our own query; balances and notes from wagmi's read queries.
    void queryClient.invalidateQueries({ queryKey: ['journeys'] });
    void queryClient.invalidateQueries({ queryKey: ['readContract'] });
    void queryClient.invalidateQueries({ queryKey: ['readContracts'] });
  };
}

/** Before the journey: everything in one transaction. */
function SetOff({ view, config }: { view: JourneyView; config: JourneyConfig }) {
  const net = useNetwork();
  const { address } = useAccount();
  const client = usePublicClient();
  const refresh = useRefresh();
  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();
  const [name, setName] = useState(view.name);
  // Nine ants cover every swamp, so the Chog never stops hungry halfway.
  const [ants, setAnts] = useState(9);
  const [useAgent, setUseAgent] = useState(Boolean(net.agent));
  const [stage, setStage] = useState<string | null>(null);

  const holder = address ?? zeroAddress;
  const reads = useReadContracts({
    allowFailure: true,
    query: { enabled: Boolean(address), refetchInterval: 15_000 },
    contracts: [
      { address: net.chogToken, abi: erc20Abi, functionName: 'balanceOf', args: [holder] },
      { address: net.chogToken, abi: erc20Abi, functionName: 'allowance', args: [holder, net.journey] },
      { address: net.journey, abi: ryokoJourneyAbi, functionName: 'isNameAvailable', args: [name, view.tokenId] },
      { address: net.chogToken, abi: permitAbi, functionName: 'name' },
      { address: net.chogToken, abi: permitAbi, functionName: 'nonces', args: [holder] },
      { address: net.chogToken, abi: permitAbi, functionName: 'DOMAIN_SEPARATOR' },
    ],
  });
  const r = reads.data;
  const walletChog = (r?.[0]?.result as bigint | undefined) ?? 0n;
  const allowance = (r?.[1]?.result as bigint | undefined) ?? 0n;
  const nameFree = r?.[2]?.result === true;
  const tokenName = r?.[3]?.result as string | undefined;
  const nonce = r?.[4]?.result as bigint | undefined;
  const onChainDomain = r?.[5]?.result as `0x${string}` | undefined;

  const cost = config.antPrice * BigInt(ants);
  const keepName = name === view.name && view.name !== '';
  const problem = keepName ? null : nameProblem(name);
  const nameTaken = !problem && !keepName && reads.data !== undefined && !nameFree;

  // Signing a permit only works when our idea of the token's EIP-712 domain matches the chain's.
  const domain =
    tokenName !== undefined
      ? { name: tokenName, version: '1', chainId: net.chain.id, verifyingContract: net.chogToken }
      : undefined;
  const canPermit = Boolean(domain && onChainDomain && nonce !== undefined && domainSeparator({ domain: domain! }) === onChainDomain);

  async function send(): Promise<Hash> {
    let permit: { deadline: bigint; v: number; r: `0x${string}`; s: `0x${string}` } = NO_PERMIT;
    if (ants > 0 && allowance < cost) {
      if (canPermit) {
        setStage('Step 1 of 2: sign to let Ryoko move the CHOG (free, no gas).');
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 60);
        const sig = await signTypedDataAsync({
          domain: domain!,
          types: {
            Permit: [
              { name: 'owner', type: 'address' },
              { name: 'spender', type: 'address' },
              { name: 'value', type: 'uint256' },
              { name: 'nonce', type: 'uint256' },
              { name: 'deadline', type: 'uint256' },
            ],
          },
          primaryType: 'Permit',
          message: { owner: holder, spender: net.journey, value: cost, nonce: nonce!, deadline },
        });
        const p = parseSignature(sig);
        permit = { deadline, v: p.v !== undefined ? Number(p.v) : p.yParity + 27, r: p.r, s: p.s };
      } else {
        setStage('Step 1 of 2: approve the CHOG for the journey.');
        const approval = await writeContractAsync({
          address: net.chogToken,
          abi: erc20Abi,
          functionName: 'approve',
          args: [net.journey, cost],
        });
        const receipt = await client!.waitForTransactionReceipt({ hash: approval, timeout: 90_000 });
        if (receipt.status !== 'success') throw new Error('The approval reverted.');
      }
      setStage('Step 2 of 2: confirm the journey transaction.');
    } else {
      setStage(null);
    }
    return writeContractAsync({
      address: net.journey,
      abi: ryokoJourneyAbi,
      functionName: 'begin',
      args: [view.tokenId, keepName ? '' : name, useAgent && net.agent ? net.agent : zeroAddress, BigInt(ants), permit],
    });
  }

  const blocked = problem ?? (nameTaken ? 'That name is taken. Try another.' : walletChog < cost ? `Your wallet needs ${formatTokens(cost)} CHOG for ${ants} ant${ants === 1 ? '' : 's'}.` : null);

  return (
    <div className="setoff">
      <div className="field">
        <label htmlFor="chog-name">
          <b>1. Name it</b> <span className="small muted">3 to 16 letters or numbers</span>
        </label>
        <input
          id="chog-name"
          type="text"
          maxLength={16}
          value={name}
          placeholder="Gnarlo"
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
        />
        {problem && name !== '' && <p className="err">{problem}</p>}
        {nameTaken && <p className="err">That name is taken. Try another.</p>}
      </div>

      <div className="field">
        <label htmlFor="ant-count">
          <b>2. Pack ants</b> <span className="small muted">one per swamp, {formatTokens(config.antPrice)} CHOG each</span>
        </label>
        <div className="row">
          <input
            id="ant-count"
            type="number"
            min={0}
            max={27}
            value={ants}
            onChange={(e) => setAnts(Math.min(27, Math.max(0, Math.trunc(Number(e.target.value) || 0))))}
            className="num-input"
          />
          <span className="small">
            = <b className="num">{formatTokens(cost)}</b> CHOG · you hold <b className="num">{formatTokens(walletChog)}</b>
          </span>
        </div>
        <p className="small muted tight">9 covers every swamp. They go into your Chog's own wallet, and you can add more any time.</p>
        {net.isTest && (
          <TxButton
            variant="ghost"
            label="Get 20,000 test CHOG"
            send={() => writeContractAsync({ address: net.chogToken, abi: testChogTokenAbi, functionName: 'faucet' })}
            onConfirmed={refresh}
          />
        )}
      </div>

      {net.agent && (
        <label className="agent-choice">
          <input type="checkbox" checked={useAgent} onChange={(e) => setUseAgent(e.target.checked)} />
          <span>
            <b>3. Let the agent walk it for me (recommended)</b>
            <span className="small">
              It feeds your Chog, waits out each rest and conquers each swamp, so you don't have to come back every day.
              It can only play the journey, never move your Chog or tokens. You can turn it off any time.
            </span>
          </span>
        </label>
      )}

      <TxButton
        label="Set off"
        disabled={blocked !== null}
        disabledReason={blocked ?? undefined}
        send={send}
        onConfirmed={() => {
          setStage(null);
          refresh();
        }}
      />
      <p className="small muted tight">
        {stage ??
          (ants > 0 && allowance < cost
            ? `Your wallet asks twice: ${canPermit ? 'a free signature for the CHOG' : 'an approval for the CHOG'}, then one transaction that names your Chog, creates its wallet, packs the ants${useAgent && net.agent ? ', appoints the agent' : ''} and sets off.`
            : `One transaction names your Chog, creates its wallet${ants > 0 ? ', packs the ants' : ''}${useAgent && net.agent ? ', appoints the agent' : ''} and sets off.`)}
      </p>
    </div>
  );
}

/** During the journey: one clear "what happens now", the ant pouch, and the rest folded away. */
function Travelling({ view, config, now }: { view: JourneyView; config: JourneyConfig; now: bigint | undefined }) {
  const net = useNetwork();
  const { address } = useAccount();
  const refresh = useRefresh();
  const { writeContractAsync } = useWriteContract();
  const meta = useChogMeta(view.tokenId);
  const [antsTyped, setAnts] = useState<number | null>(null);
  const [name, setName] = useState(view.name);

  const reads = useReadContracts({
    allowFailure: false,
    query: { enabled: Boolean(address), refetchInterval: 15_000 },
    contracts: [
      { address: net.chogToken, abi: erc20Abi, functionName: 'balanceOf', args: [address ?? zeroAddress] },
      { address: net.chogToken, abi: erc20Abi, functionName: 'balanceOf', args: [view.account] },
      { address: net.chogToken, abi: erc20Abi, functionName: 'allowance', args: [view.account, net.journey] },
      { address: net.journey, abi: ryokoJourneyAbi, functionName: 'isNameAvailable', args: [name, view.tokenId] },
    ],
  });
  const [walletChog, accountChog, allowance, nameFree] = reads.data ?? [0n, 0n, 0n, false];

  const chogName = view.name || `Chog #${view.tokenId}`;
  const finished = view.status === Status.Complete;
  const agentOn = net.agent !== undefined && view.agent.toLowerCase() === net.agent.toLowerCase();
  const antsInWallet = config.antPrice > 0n ? accountChog / config.antPrice : 0n;
  // Suggest exactly what the rest of the trip needs: one ant per swamp left, minus ants it already has.
  const antsNeeded = Math.max(1, 9 - view.conquered - Number(antsInWallet));
  const ants = antsTyped ?? antsNeeded;
  const feedAmount = config.antPrice * BigInt(ants);
  const problem = name === view.name ? null : nameProblem(name);
  const rushPrice = config.antPrice * BigInt(RUSH_ANTS);
  const next = view.conquered + 1;
  const left = (t: bigint) => (now !== undefined && t > now ? t - now : 0n);

  const execute = (data: `0x${string}`) =>
    writeContractAsync({ address: view.account, abi: ryokoAccountAbi, functionName: 'execute', args: [net.journey, 0n, data, 0] });
  const travel = () => execute(encodeFunctionData({ abi: ryokoJourneyAbi, functionName: 'travel' }));
  const conquer = () =>
    execute(
      encodeFunctionData({
        abi: ryokoJourneyAbi,
        functionName: 'conquer',
        args: [
          writeNote({
            swamp: view.currentSwamp,
            tokenId: view.tokenId,
            journeyId: view.journeyId,
            restarts: view.restarts,
            traits: meta.data?.traits,
            event: view.swampEvent as SwampEventValue,
            rushed: view.rushed,
          }),
        ],
      }),
    );

  const fed = accountChog >= config.antPrice && allowance >= config.antPrice;
  const fits = now !== undefined && now + maxStay(config.minStay) <= view.deadline;
  const canTravel = (view.status === Status.Travelling || view.status === Status.Expired) && fed && (view.status === Status.Expired || fits);

  // Same rule as RyokoJourney.rush: half the minimum stay off, but never earlier than now.
  const cut = rushCut(config.minStay);
  const rushedReady = now === undefined ? view.readyAt : view.readyAt - cut > now ? view.readyAt - cut : now;

  // What is happening, in one or two plain sentences, and at most one thing to press.
  let title: string;
  let text: string;
  let action: ReactNode = null;
  switch (view.status) {
    case Status.Travelling:
      if (!fed) {
        title = 'Hungry';
        text = `${chogName} needs an ant to walk into swamp ${next}. Add ants below.`;
      } else if (!fits) {
        title = 'Waiting for a fresh start';
        text = `It's too late to fit a stay in before this swamp's deadline. In ${formatDuration(left(view.deadline))} the swamp starts over and ${agentOn ? 'the agent sends it in again' : 'you can send it in again'}.`;
      } else if (agentOn) {
        title = 'On its way';
        text = `The agent feeds it an ant and walks it into swamp ${next} within a minute. Nothing for you to do.`;
      } else {
        title = 'Ready to walk on';
        text = `Press the button to feed it an ant and walk into swamp ${next}.`;
        action = <TxButton label="Eat an ant and go" send={travel} onConfirmed={refresh} />;
      }
      break;
    case Status.InSwamp:
      title = `Resting in swamp ${view.currentSwamp}`;
      text = `It finishes resting in ${formatDuration(left(view.readyAt))}. Then ${agentOn ? 'the agent conquers the swamp for you' : 'you can conquer it'}.`;
      if (!view.rushed) {
        action = (
          <div className="rush">
            <p className="small tight">
              Want it sooner? <b>Rush</b>: eat {RUSH_ANTS} more ants and it's done in {formatDuration(left(rushedReady))}.
            </p>
            <TxButton
              variant="ghost"
              label={`Rush for ${RUSH_ANTS} ants`}
              disabled={accountChog < rushPrice || allowance < rushPrice}
              disabledReason={`Rushing needs ${RUSH_ANTS} ants in its wallet. Add ants below first.`}
              send={() => execute(encodeFunctionData({ abi: ryokoJourneyAbi, functionName: 'rush' }))}
              onConfirmed={refresh}
            />
          </div>
        );
      } else {
        text += ' It rushed this swamp.';
      }
      break;
    case Status.Ready:
      if (agentOn) {
        title = 'Conquering now';
        text = 'Its rest is over. The agent conquers this swamp and writes its note within a minute.';
      } else {
        title = 'Ready to conquer';
        text = `Its rest is over. Conquer the swamp within ${formatDuration(left(view.deadline))}.`;
        action = <TxButton label="Conquer this swamp" send={conquer} onConfirmed={refresh} />;
      }
      break;
    case Status.Expired:
      title = 'This swamp starts over';
      // Entered this leg but didn't finish in time, or never got in (usually because it was hungry).
      text = `${
        view.enteredAt >= view.legStartedAt && view.enteredAt > 0n
          ? `Time ran out before it conquered swamp ${next}, so that swamp starts over.`
          : `Time ran out before it got into swamp ${next}, so that swamp starts over.`
      } Earlier swamps stay done. ${!fed ? 'Add ants so it can go in.' : agentOn ? 'The agent sends it in within a minute.' : ''}`;
      if (fed && !agentOn) action = <TxButton label="Eat an ant and try again" send={travel} onConfirmed={refresh} />;
      break;
    default:
      title = 'Journey complete';
      text = `${chogName} conquered all nine swamps and glows gold. Share it from the record on the right.`;
  }

  return (
    <div className="journey-now">
      <div className="now-box">
        <div className="step-label">What happens now</div>
        <h3>{title}</h3>
        <p className="small tight">{text}</p>
        {action}
      </div>

      {!finished && (
        <div className="ants-box">
          <p className="small tight">
            <b>Ants in its wallet: {antsInWallet.toString()}</b>
            {antsInWallet > 0n ? ` (enough for ${antsInWallet.toString()} more swamp${antsInWallet === 1n ? '' : 's'})` : ''}. You
            hold {formatTokens(walletChog)} CHOG.
          </p>
          <div className="row">
            <input
              aria-label="Ants to add"
              type="number"
              min={1}
              max={27}
              value={ants}
              onChange={(e) => setAnts(Math.min(27, Math.max(1, Math.trunc(Number(e.target.value) || 1))))}
              className="num-input"
            />
            <TxButton
              variant="ghost"
              label={`Add ${ants} ant${ants === 1 ? '' : 's'}`}
              disabled={walletChog < feedAmount}
              disabledReason={`That needs ${formatTokens(feedAmount)} CHOG in your wallet.${net.isTest ? ' Get free test CHOG first.' : ''}`}
              send={() => writeContractAsync({ address: net.chogToken, abi: erc20Abi, functionName: 'transfer', args: [view.account, feedAmount] })}
              onConfirmed={refresh}
            />
          </div>
          {net.isTest && walletChog < feedAmount && (
            <TxButton
              variant="ghost"
              label="Get 20,000 test CHOG"
              send={() => writeContractAsync({ address: net.chogToken, abi: testChogTokenAbi, functionName: 'faucet' })}
              onConfirmed={refresh}
            />
          )}
        </div>
      )}

      <details className="more">
        <summary>More options</summary>
        <div className="more-body">
          {!finished && net.agent && (
            <div>
              <h4>The agent: {agentOn ? 'on' : 'off'}</h4>
              <p className="small tight">
                {agentOn
                  ? 'It feeds and moves your Chog for you. It can only play the journey, never move your Chog or tokens.'
                  : 'Turn it on and your Chog keeps moving while you are away.'}
              </p>
              <TxButton
                variant="ghost"
                label={agentOn ? 'Turn the agent off' : 'Turn the agent on'}
                send={() =>
                  writeContractAsync({
                    address: view.account,
                    abi: ryokoAccountAbi,
                    functionName: 'authorize',
                    args: [agentOn ? zeroAddress : net.agent!, net.chogToken, maxUint256],
                  })
                }
                onConfirmed={refresh}
              />
            </div>
          )}

          <div>
            <h4>Rename</h4>
            <div className="row">
              <input aria-label="Chog name" type="text" maxLength={16} value={name} autoComplete="off" onChange={(e) => setName(e.target.value)} />
              <TxButton
                variant="ghost"
                label="Rename"
                disabled={Boolean(problem) || name === view.name || !nameFree}
                disabledReason={problem ?? (name === view.name ? 'That is already its name.' : 'That name is taken. Try another.')}
                send={() => writeContractAsync({ address: net.journey, abi: ryokoJourneyAbi, functionName: 'setName', args: [view.tokenId, name] })}
                onConfirmed={refresh}
              />
            </div>
            {problem && <p className="err">{problem}</p>}
          </div>

          {!finished && agentOn && (
            <div>
              <h4>Do a step yourself</h4>
              <p className="small tight">Only needed if the agent is ever offline.</p>
              <div className="row wrap">
                <TxButton
                  variant="ghost"
                  label="Eat an ant"
                  disabled={!canTravel}
                  disabledReason={`It can eat when it is between swamps, has an ant, and has time left for the longest stay (${formatSpan(maxStay(config.minStay))}).`}
                  send={travel}
                  onConfirmed={refresh}
                />
                <TxButton
                  variant="ghost"
                  label="Conquer"
                  disabled={view.status !== Status.Ready}
                  disabledReason="It can conquer once its rest is over."
                  send={conquer}
                  onConfirmed={refresh}
                />
              </div>
            </div>
          )}

          <p className="small warn-text tight">Selling or moving this Chog starts its journey over from swamp 1 and clears its name.</p>
        </div>
      </details>
    </div>
  );
}
