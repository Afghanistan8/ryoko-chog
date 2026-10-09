import type { NetworkName } from './networks.js';

/**
 * Where Ryoko Chog is deployed. The site, the share-image functions and the agent all read this,
 * so a redeploy only changes this file. Environment variables can still override it.
 * Nothing here is secret.
 */
export interface Deployment {
  journey: string;
  /** The Ryoko agent holders can appoint. */
  agent?: string;
  /** Testnet only: the free test Chog and test CHOG contracts. */
  chogGenesis?: string;
  chogToken?: string;
}

export const DEPLOYMENTS: Partial<Record<NetworkName, Deployment>> = {
  // Monad mainnet, v2, deployed and checked on-chain on 9 Oct 2026.
  mainnet: {
    journey: '0xa726C17de787fAAAcCe9d0773B2651c8F36F0146',
    agent: '0xa5A1694b7F7adEC5F2fC1Ff921ffac4219FED1D7',
  },
  // Monad testnet, v2, deployed and checked on-chain on 9 Oct 2026. A "day" lasts one minute.
  testnet: {
    journey: '0x4C23ef298592Ed6b61351326899752c8aDCdED1b',
    agent: '0xa5A1694b7F7adEC5F2fC1Ff921ffac4219FED1D7',
    chogGenesis: '0x8B128889240C7e63608A73578247D513a87f347C',
    chogToken: '0x4cf2489573a855B1c1C871f787C8a0681cd7B16A',
  },
};

/** The network the site opens on when the visitor has not picked one. */
export const DEFAULT_NETWORK: NetworkName = 'mainnet';
