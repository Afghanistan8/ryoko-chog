import { createContext, useContext, type ReactNode } from 'react';
import type { NetworkConfig, NetworkName } from '@ryoko/shared';

interface NetworkState {
  network: NetworkConfig;
  /** Every network this site is deployed on, for the network switch. */
  available: readonly NetworkName[];
}

const NetworkContext = createContext<NetworkState | null>(null);

export function NetworkProvider({
  network,
  available,
  children,
}: {
  network: NetworkConfig;
  available: readonly NetworkName[];
  children: ReactNode;
}) {
  return <NetworkContext.Provider value={{ network, available }}>{children}</NetworkContext.Provider>;
}

function useNetworkState(): NetworkState {
  const n = useContext(NetworkContext);
  if (!n) throw new Error('useNetwork must be used inside NetworkProvider');
  return n;
}

export function useNetwork(): NetworkConfig {
  return useNetworkState().network;
}

export function useAvailableNetworks(): readonly NetworkName[] {
  return useNetworkState().available;
}
