import { createConfig, http, type CreateConnectorFn } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
import type { NetworkConfig } from '@ryoko/shared';

/**
 * Browser wallets are found through EIP-6963 (wagmi's multiInjectedProviderDiscovery, on by
 * default), so MetaMask, Rabby, Phantom, OKX, Backpack and others each show up by name.
 * `injected()` covers older wallets that only set window.ethereum. WalletConnect (QR code and
 * mobile wallets) is added when a WalletConnect project id is configured.
 */
export function makeWagmiConfig(network: NetworkConfig, walletConnectProjectId?: string) {
  const connectors: CreateConnectorFn[] = [injected()];
  if (walletConnectProjectId) {
    connectors.push(
      walletConnect({
        projectId: walletConnectProjectId,
        showQrModal: true,
        metadata: {
          name: 'Ryoko Chog',
          description: 'Every Chog gets its own agent and travels nine swamps on Monad, eating $CHOG ants.',
          url: window.location.origin,
          icons: [`${window.location.origin}/favicon.svg`],
        },
      }),
    );
  }
  return createConfig({
    chains: [network.chain],
    connectors,
    multiInjectedProviderDiscovery: true,
    transports: { [network.chain.id]: http(network.rpcUrl, { batch: { wait: 16 } }) },
  });
}
