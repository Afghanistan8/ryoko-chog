import { createContext, useContext, type ReactNode } from 'react';
import type { NetworkConfig } from '@ryoko/shared';

const NetworkContext = createContext<NetworkConfig | null>(null);

export function NetworkProvider({ network, children }: { network: NetworkConfig; children: ReactNode }) {
  return <NetworkContext.Provider value={network}>{children}</NetworkContext.Provider>;
}

export function useNetwork(): NetworkConfig {
  const n = useContext(NetworkContext);
  if (!n) throw new Error('useNetwork must be used inside NetworkProvider');
  return n;
}
