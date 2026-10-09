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

export const DEPLOYMENTS: Partial<Record<NetworkName, Deployment>> = {};

/** The network the site opens on when the visitor has not picked one. */
export const DEFAULT_NETWORK: NetworkName = 'mainnet';
