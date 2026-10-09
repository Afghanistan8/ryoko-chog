import { useState } from 'react';
import { useAccount, usePublicClient, useSwitchChain } from 'wagmi';
import type { Hash } from 'viem';
import { useNetwork } from '../network';
import { errorText } from '../format';

interface Props {
  label: string;
  /** Sends the transaction and returns its hash. */
  send: () => Promise<Hash>;
  onConfirmed?: () => void;
  variant?: 'primary' | 'ghost';
  disabled?: boolean;
  disabledReason?: string;
}

type Phase = { kind: 'idle' } | { kind: 'wallet' } | { kind: 'confirming'; hash: Hash } | { kind: 'done' } | { kind: 'error'; message: string };

export function TxButton({ label, send, onConfirmed, variant = 'primary', disabled, disabledReason }: Props) {
  const net = useNetwork();
  const client = usePublicClient();
  const { chainId, isConnected } = useAccount();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  const busy = phase.kind === 'wallet' || phase.kind === 'confirming' || switching;
  const wrongChain = isConnected && chainId !== net.chain.id;

  async function run() {
    if (busy) return;
    if (disabled) {
      setPhase({ kind: 'error', message: disabledReason ?? 'Not available right now.' });
      return;
    }
    try {
      if (wrongChain) {
        await switchChainAsync({ chainId: net.chain.id });
        setPhase({ kind: 'idle' });
        return;
      }
      setPhase({ kind: 'wallet' });
      const hash = await send();
      setPhase({ kind: 'confirming', hash });
      const receipt = await client!.waitForTransactionReceipt({ hash, timeout: 90_000 });
      if (receipt.status !== 'success') throw new Error('The transaction reverted.');
      setPhase({ kind: 'done' });
      onConfirmed?.();
    } catch (err) {
      setPhase({ kind: 'error', message: errorText(err) });
    }
  }

  const text = wrongChain
    ? `Switch to ${net.chain.name}`
    : phase.kind === 'wallet'
      ? 'Confirm in your wallet…'
      : phase.kind === 'confirming'
        ? 'Waiting for Monad…'
        : label;

  const explorer = net.chain.blockExplorers?.default.url;

  return (
    <div className="tx">
      <button type="button" className={`btn ${variant === 'ghost' ? 'ghost' : ''}`} onClick={run} aria-busy={busy}>
        {text}
      </button>
      {phase.kind === 'error' && (
        <p className="err" role="alert">
          {phase.message}
        </p>
      )}
      {phase.kind === 'confirming' && explorer && (
        <a className="small" href={`${explorer}/tx/${phase.hash}`} target="_blank" rel="noreferrer">
          View transaction
        </a>
      )}
    </div>
  );
}
