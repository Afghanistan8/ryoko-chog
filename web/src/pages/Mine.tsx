import { useAccount, useReadContract, useWriteContract } from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import { zeroAddress } from 'viem';
import { glowLevel, STATUS_LABEL, testChogGenesisAbi } from '@ryoko/shared';
import { useNetwork } from '../network';
import { useAllJourneys, useJourneyConfig } from '../hooks';
import { HowItWorks } from '../components/HowItWorks';
import { ChogPortrait } from '../components/ChogPortrait';
import { ConnectButton } from '../components/ConnectButton';
import { TxButton } from '../components/TxButton';
import { chogLabel } from '../format';

export function Mine() {
  const net = useNetwork();
  const { address } = useAccount();
  const journeys = useAllJourneys();
  const config = useJourneyConfig();
  const queryClient = useQueryClient();
  const { writeContractAsync } = useWriteContract();
  const minted = useReadContract({
    address: net.chogGenesis,
    abi: testChogGenesisAbi,
    functionName: 'mintedBy',
    args: [address ?? zeroAddress],
    query: { enabled: net.isTest && Boolean(address) },
  });

  if (!address) {
    return (
      <div className="mine">
        <section className="panel pad center">
          <h1 className="display">Your Chogs</h1>
          <p className="muted">Connect the wallet that holds your Chogs.</p>
          <ConnectButton />
        </section>
        {config.data && <HowItWorks config={config.data} open />}
      </div>
    );
  }

  const mine = (journeys.data ?? []).filter((j) => j.holder.toLowerCase() === address.toLowerCase());

  return (
    <div className="mine">
      <div className="row between wrap">
        <h1 className="display">Your Chogs</h1>
        {net.isTest && (minted.data ?? 0n) < 3n && (
          <TxButton
            label="Mint a free test Chog"
            send={() => writeContractAsync({ address: net.chogGenesis, abi: testChogGenesisAbi, functionName: 'mint' })}
            onConfirmed={() => {
              void queryClient.invalidateQueries({ queryKey: ['journeys'] });
              void minted.refetch();
            }}
          />
        )}
      </div>

      {config.data && <HowItWorks config={config.data} open={mine.every((j) => j.status === 0)} />}

      {journeys.isLoading ? (
        <p className="muted">Searching the swamps for your Chogs…</p>
      ) : journeys.isError ? (
        <p className="err">Could not read journeys. Check the RPC.</p>
      ) : mine.length === 0 ? (
        <section className="panel">
          <p>This wallet holds no {net.isTest ? 'test ' : ''}Chogs.</p>
          {net.isTest ? (
            <p className="muted small">Mint a free test Chog above to try Ryoko Chog.</p>
          ) : (
            <p className="muted small">Chog Genesis has 1,969 Chogs. You need one to travel.</p>
          )}
        </section>
      ) : (
        <div className="cards">
          {mine.map((j) => (
            <a key={j.tokenId.toString()} className="card" href={`#/chog/${j.tokenId}`}>
              <ChogPortrait tokenId={j.tokenId} glow={glowLevel(j)} size={120} />
              <span className="card-name">{chogLabel(j.name, j.tokenId)}</span>
              <span className="small muted">{STATUS_LABEL[j.status as keyof typeof STATUS_LABEL]}</span>
              <span className="small num">{j.conquered} of 9 swamps</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
