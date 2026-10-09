import { createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import type { NetworkConfig } from '@ryoko/shared';

export function makeWagmiConfig(network: NetworkConfig) {
  return createConfig({
    chains: [network.chain],
    connectors: [injected()],
    transports: { [network.chain.id]: http(network.rpcUrl, { batch: { wait: 16 } }) },
  });
}
