import { useState } from 'react';
import { encodeFunctionData, erc20Abi, maxUint256, zeroAddress } from 'viem';
import { useAccount, useReadContracts, useWriteContract } from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import {
  formatTokens,
  nameProblem,
  ryokoAccountAbi,
  ryokoJourneyAbi,
  testChogTokenAbi,
  writeNote,
  Status,
  type JourneyView,
} from '@ryoko/shared';
import { useNetwork } from '../network';
import { useChogMeta, type JourneyConfig } from '../hooks';
import { TxButton } from './TxButton';
import { formatDuration, shortAddress } from '../format';

interface Props {
  view: JourneyView;
  config: JourneyConfig;
  now: bigint | undefined;
}

export function HolderPanel({ view, config, now }: Props) {
  const net = useNetwork();
  const { address } = useAccount();
  const queryClient = useQueryClient();
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

  const refresh = () => {
    // Journeys come from our own query; balances and notes from wagmi's read queries.
    void queryClient.invalidateQueries({ queryKey: ['journeys'] });
    void queryClient.invalidateQueries({ queryKey: ['readContract'] });
    void queryClient.invalidateQueries({ queryKey: ['readContracts'] });
  };

  const active = view.status !== Status.None;
  const finished = view.status === Status.Complete;
  const agentOn = net.agent !== undefined && view.agent.toLowerCase() === net.agent.toLowerCase();
  const antsInWallet = config.antPrice > 0n ? accountChog / config.antPrice : 0n;
  const feedAmount = config.antPrice * BigInt(ants);
  const problem = name === view.name ? null : nameProblem(name);

  const execute = (data: `0x${string}`) =>
    writeContractAsync({
      address: view.account,
      abi: ryokoAccountAbi,
      functionName: 'execute',
      args: [net.journey, 0n, data, 0],
    });

  const canTravel =
    (view.status === Status.Travelling || view.status === Status.Expired) &&
    accountChog >= config.antPrice &&
    allowance >= config.antPrice &&
    (view.status === Status.Expired || (now !== undefined && now + config.minStay <= view.deadline));

  return (
    <section className="panel holder" aria-labelledby="holder-h">
      <div className="step-label">You hold this Chog</div>
      <h2 id="holder-h" className="display">Send it on its way</h2>
      <p className="small warn-text">Selling or moving this Chog resets its journey to swamp 1 and clears its name.</p>

      <ol className="steps">
        <li className={active ? 'done' : ''}>
          <h3>Start the journey</h3>
          {active ? (
            <p className="small">
              Started. The Chog's own wallet is <code>{shortAddress(view.account)}</code>.
            </p>
          ) : (
            <>
              <p className="small">Creates the Chog's own wallet (ERC-6551) and sets it on the road to swamp 1.</p>
              <TxButton
                label="Start journey"
                send={() =>
                  writeContractAsync({
                    address: net.journey,
                    abi: ryokoJourneyAbi,
                    functionName: 'startJourney',
                    args: [view.tokenId],
                  })
                }
                onConfirmed={refresh}
              />
            </>
          )}
        </li>

        <li className={view.name ? 'done' : ''}>
          <h3>Name your Chog</h3>
          <label htmlFor="chog-name" className="small">
            3 to 16 letters or numbers. Unique across all Chogs.
          </label>
          <div className="row">
            <input
              id="chog-name"
              type="text"
              maxLength={16}
              value={name}
              placeholder="Gnarlo"
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
            />
            <TxButton
              label={view.name ? 'Rename' : 'Register name'}
              disabled={Boolean(problem) || name === view.name || !nameFree}
              disabledReason={problem ?? (name === view.name ? 'That is already its name.' : 'That name is taken. Try another.')}
              send={() =>
                writeContractAsync({
                  address: net.journey,
                  abi: ryokoJourneyAbi,
                  functionName: 'setName',
                  args: [view.tokenId, name],
                })
              }
              onConfirmed={refresh}
            />
          </div>
          {problem && <p className="err">{problem}</p>}
          {!problem && name !== view.name && name.length >= 3 && reads.data && !nameFree && (
            <p className="err">That name is taken. Try another.</p>
          )}
        </li>

        <li className={antsInWallet > 0n ? 'done' : ''}>
          <h3>Feed it ants</h3>
          <p className="small">
            Each swamp costs one ant: {formatTokens(config.antPrice)} {net.isTest ? 'test ' : ''}CHOG, burned. The Chog's
            wallet holds <b className="num">{formatTokens(accountChog)}</b> CHOG ({antsInWallet.toString()} ants). Yours
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
              max={9}
              value={ants}
              onChange={(e) => setAnts(Math.min(9, Math.max(1, Math.trunc(Number(e.target.value) || 1))))}
              className="num-input"
            />
            <TxButton
              label={`Send ${formatTokens(feedAmount)} CHOG`}
              disabled={walletChog < feedAmount}
              disabledReason={`Your wallet needs ${formatTokens(feedAmount)} CHOG.`}
              send={() =>
                writeContractAsync({
                  address: net.chogToken,
                  abi: erc20Abi,
                  functionName: 'transfer',
                  args: [view.account, feedAmount],
                })
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

        <li className={agentOn ? 'done' : ''}>
          <h3>Appoint the agent</h3>
          {!active ? (
            <p className="small">Start the journey first.</p>
          ) : !net.agent ? (
            <p className="small">No agent is configured for this site. You can still travel by hand below.</p>
          ) : agentOn ? (
            <>
              <p className="small">
                The agent <code>{shortAddress(net.agent)}</code> travels for this Chog. It can only call the journey
                contract, so it can never move the Chog's tokens elsewhere.
              </p>
              <TxButton
                variant="ghost"
                label="Remove agent"
                send={() =>
                  writeContractAsync({
                    address: view.account,
                    abi: ryokoAccountAbi,
                    functionName: 'authorize',
                    args: [zeroAddress, net.chogToken, 0n],
                  })
                }
                onConfirmed={refresh}
              />
            </>
          ) : (
            <>
              <p className="small">
                The agent eats an ant, waits out each stay, conquers the swamp and writes the field note. It can only
                call the journey contract.
              </p>
              <TxButton
                label="Appoint agent"
                send={() =>
                  writeContractAsync({
                    address: view.account,
                    abi: ryokoAccountAbi,
                    functionName: 'authorize',
                    args: [net.agent!, net.chogToken, maxUint256],
                  })
                }
                onConfirmed={refresh}
              />
            </>
          )}
        </li>
      </ol>

      {active && !finished && (
        <div className="manual">
          <h3>Or travel by hand</h3>
          <p className="small">Useful if the agent is offline. These run through the Chog's own wallet.</p>
          <div className="row wrap">
            {allowance < config.antPrice && (
              <TxButton
                variant="ghost"
                label="Allow ant payments"
                send={() =>
                  writeContractAsync({
                    address: view.account,
                    abi: ryokoAccountAbi,
                    functionName: 'authorize',
                    args: [agentOn ? net.agent! : zeroAddress, net.chogToken, maxUint256],
                  })
                }
                onConfirmed={refresh}
              />
            )}
            <TxButton
              variant="ghost"
              label="Eat an ant now"
              disabled={!canTravel}
              disabledReason={`The Chog can eat when it is between swamps, has an ant in its wallet, and has time left for the ${formatDuration(config.minStay)} stay.`}
              send={() => execute(encodeFunctionData({ abi: ryokoJourneyAbi, functionName: 'travel' }))}
              onConfirmed={refresh}
            />
            <TxButton
              variant="ghost"
              label="Conquer this swamp"
              disabled={view.status !== Status.Ready}
              disabledReason="The Chog can conquer once its minimum stay is over."
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
                      }),
                    ],
                  }),
                )
              }
              onConfirmed={refresh}
            />
          </div>
        </div>
      )}
    </section>
  );
}
