import { useState } from 'react';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { useNetwork } from '../network';
import { errorText, shortAddress } from '../format';

export function ConnectButton() {
  const net = useNetwork();
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connectAsync, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const [error, setError] = useState<string | null>(null);

  if (isConnected && address) {
    if (chainId !== net.chain.id) {
      return (
        <button type="button" className="btn" onClick={() => switchChain({ chainId: net.chain.id })}>
          Switch to {net.chain.name}
        </button>
      );
    }
    return (
      <button type="button" className="btn ghost" onClick={() => disconnect()} title="Disconnect">
        {shortAddress(address)}
      </button>
    );
  }

  const injected = connectors[0];
  return (
    <div className="connect">
      <button
        type="button"
        className="btn ghost"
        aria-busy={isPending}
        onClick={async () => {
          setError(null);
          if (!injected) {
            setError('No browser wallet found. Install MetaMask, Rabby or another Monad wallet.');
            return;
          }
          try {
            await connectAsync({ connector: injected, chainId: net.chain.id });
          } catch (err) {
            setError(errorText(err));
          }
        }}
      >
        {isPending ? 'Connecting…' : 'Connect wallet'}
      </button>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
