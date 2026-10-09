import { useState } from 'react';
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
        {active ? 'Look after it' : 'Send it on its way'}
      </h2>
      <p className="small warn-text">Selling or moving this Chog resets its journey to swamp 1 and clears its name.</p>
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
  const [ants, setAnts] = useState(3);
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
          <b>Name</b> <span className="small muted">3 to 16 letters or numbers, unique across all Chogs</span>
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
          <b>Ants to pack</b> <span className="small muted">one per swamp, {formatTokens(config.antPrice)} CHOG each, burned</span>
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
        <p className="small muted tight">
          They go into the Chog's own wallet. You can add more later, and anything left stays with the Chog.
        </p>
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
            <b>Let the Ryoko agent walk it for me</b>
            <span className="small">
              The agent feeds your Chog an ant when it is between swamps, waits out each stay, and conquers the swamp
              with a field note, so you don't have to come back every day. It can only use the journey contract: it
              can never move your Chog, its CHOG or anything else, and it stops the moment the Chog changes hands.
              You can remove it any time.
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

/** During the journey: feed, rush, agent, rename, and travel by hand. */
function Travelling({ view, config, now }: { view: JourneyView; config: JourneyConfig; now: bigint | undefined }) {
  const net = useNetwork();
  const { address } = useAccount();
  const refresh = useRefresh();
  const { writeContractAsync } = useWriteContract();
  const meta = useChogMeta(view.tokenId);
  const [ants, setAnts] = useState(3);
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

  const finished = view.status === Status.Complete;
  const agentOn = net.agent !== undefined && view.agent.toLowerCase() === net.agent.toLowerCase();
  const antsInWallet = config.antPrice > 0n ? accountChog / config.antPrice : 0n;
  const feedAmount = config.antPrice * BigInt(ants);
  const problem = name === view.name ? null : nameProblem(name);
  const rushPrice = config.antPrice * BigInt(RUSH_ANTS);

  const execute = (data: `0x${string}`) =>
    writeContractAsync({ address: view.account, abi: ryokoAccountAbi, functionName: 'execute', args: [net.journey, 0n, data, 0] });

  const canTravel =
    (view.status === Status.Travelling || view.status === Status.Expired) &&
    accountChog >= config.antPrice &&
    allowance >= config.antPrice &&
    (view.status === Status.Expired || (now !== undefined && now + maxStay(config.minStay) <= view.deadline));

  const inSwamp = view.status === Status.InSwamp;
  // Same rule as RyokoJourney.rush: half the minimum stay off, but never earlier than now.
  const cut = rushCut(config.minStay);
  const rushedReady = now === undefined ? view.readyAt : view.readyAt - cut > now ? view.readyAt - cut : now;

  return (
    <ol className="steps">
      {inSwamp && (
        <li className={view.rushed ? 'done' : ''}>
          <h3>Rush this swamp</h3>
          {view.rushed ? (
            <p className="small">Rushed. It ate two extra ants and cut {formatSpan(cut)} off this stay.</p>
          ) : (
            <>
              <p className="small">
                Eat {RUSH_ANTS} extra ants ({formatTokens(rushPrice)} CHOG, burned) to cut {formatSpan(cut)} off
                this stay. Once per swamp.
              </p>
              {now !== undefined && (
                <p className="small">
                  Ready in <b className="num">{formatDuration(view.readyAt > now ? view.readyAt - now : 0n)}</b> now, or in{' '}
                  <b className="num">{formatDuration(rushedReady > now ? rushedReady - now : 0n)}</b> if it rushes.
                </p>
              )}
              <TxButton
                label={`Rush for ${RUSH_ANTS} ants`}
                disabled={accountChog < rushPrice || allowance < rushPrice}
                disabledReason={`The Chog's wallet needs ${formatTokens(rushPrice)} CHOG. Add ants below first.`}
                send={() => execute(encodeFunctionData({ abi: ryokoJourneyAbi, functionName: 'rush' }))}
                onConfirmed={refresh}
              />
            </>
          )}
        </li>
      )}

      {!finished && (
        <li className={antsInWallet > 0n ? 'done' : ''}>
          <h3>Feed it ants</h3>
          <p className="small">
            The Chog's wallet holds <b className="num">{formatTokens(accountChog)}</b> CHOG ({antsInWallet.toString()} ants). Yours
            holds <b className="num">{formatTokens(walletChog)}</b>.
          </p>
          <div className="row">
            <label htmlFor="ant-count" className="small">
              Ants
            </label>
            <input
              id="ant-count"
              type="number"
              min={1}
              max={27}
              value={ants}
              onChange={(e) => setAnts(Math.min(27, Math.max(1, Math.trunc(Number(e.target.value) || 1))))}
              className="num-input"
            />
            <TxButton
              label={`Send ${formatTokens(feedAmount)} CHOG`}
              disabled={walletChog < feedAmount}
              disabledReason={`Your wallet needs ${formatTokens(feedAmount)} CHOG.`}
              send={() =>
                writeContractAsync({ address: net.chogToken, abi: erc20Abi, functionName: 'transfer', args: [view.account, feedAmount] })
              }
              onConfirmed={refresh}
            />
          </div>
          {net.isTest && (
            <TxButton
              variant="ghost"
              label="Get 20,000 test CHOG"
              send={() => writeContractAsync({ address: net.chogToken, abi: testChogTokenAbi, functionName: 'faucet' })}
              onConfirmed={refresh}
            />
          )}
        </li>
      )}

      {!finished && net.agent && (
        <li className={agentOn ? 'done' : ''}>
          <h3>The agent</h3>
          {agentOn ? (
            <>
              <p className="small">
                The agent <code>{shortAddress(net.agent)}</code> walks this Chog: it feeds it, waits out each stay and
                conquers. It can only use the journey contract, never move your Chog or its CHOG elsewhere.
              </p>
              <TxButton
                variant="ghost"
                label="Remove the agent"
                send={() =>
                  writeContractAsync({ address: view.account, abi: ryokoAccountAbi, functionName: 'authorize', args: [zeroAddress, net.chogToken, maxUint256] })
                }
                onConfirmed={refresh}
              />
            </>
          ) : (
            <>
              <p className="small">
                No agent: you travel by hand below. Appoint it so your Chog keeps moving while you are away. It can only
                use the journey contract.
              </p>
              <TxButton
                label="Appoint the agent"
                send={() =>
                  writeContractAsync({ address: view.account, abi: ryokoAccountAbi, functionName: 'authorize', args: [net.agent!, net.chogToken, maxUint256] })
                }
                onConfirmed={refresh}
              />
            </>
          )}
        </li>
      )}

      <li className="done">
        <h3>Rename</h3>
        <div className="row">
          <input
            aria-label="Chog name"
            type="text"
            maxLength={16}
            value={name}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
          />
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
      </li>

      {!finished && (
        <li className="manual">
          <h3>Or travel by hand</h3>
          <p className="small">Useful if the agent is offline. These run through the Chog's own wallet.</p>
          <div className="row wrap">
            <TxButton
              variant="ghost"
              label="Eat an ant now"
              disabled={!canTravel}
              disabledReason={`The Chog can eat when it is between swamps, has an ant in its wallet, and has time left for the longest stay (${formatSpan(maxStay(config.minStay))}).`}
              send={() => execute(encodeFunctionData({ abi: ryokoJourneyAbi, functionName: 'travel' }))}
              onConfirmed={refresh}
            />
            <TxButton
              variant="ghost"
              label="Conquer this swamp"
              disabled={view.status !== Status.Ready}
              disabledReason="The Chog can conquer once its stay is over."
              send={() =>
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
                )
              }
              onConfirmed={refresh}
            />
          </div>
        </li>
      )}
    </ol>
  );
}
