import { getAddress, isAddress, type Address, type Chain } from 'viem';
import { monad, monadTestnet } from 'viem/chains';

export type NetworkName = 'mainnet' | 'testnet';

/** Canonical ERC-6551 registry. Same bytecode on Monad mainnet, Monad testnet and Ethereum. */
export const ERC6551_REGISTRY: Address = '0x000000006551c19487814612e58FE06813775758';
export const BURN_ADDRESS: Address = '0x000000000000000000000000000000000000dEaD';

/** Real Chog Genesis (ERC-721, token ids 1-1969) and $CHOG (ERC-20, 18 decimals) on Monad mainnet. */
export const MAINNET_CHOG_GENESIS: Address = '0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763';
export const MAINNET_CHOG_TOKEN: Address = '0x350035555E10d9AfAF1566AaebfCeD5BA6C27777';
export const CHOG_GENESIS_SUPPLY = 1969;

export interface NetworkConfig {
  name: NetworkName;
  chain: Chain;
  rpcUrl: string;
  journey: Address;
  chogGenesis: Address;
  chogToken: Address;
  /** Address of the Ryoko agent that holders can appoint. Optional for read-only use. */
  agent?: Address;
  /** True when the Chog contracts are the free test versions. */
  isTest: boolean;
}

export interface NetworkInput {
  network?: string;
  rpcUrl?: string;
  journey?: string;
  chogGenesis?: string;
  chogToken?: string;
  agent?: string;
}

function requireAddress(value: string | undefined, label: string): Address {
  if (!value || !isAddress(value, { strict: false })) {
    throw new Error(`${label} must be a valid address, got "${value ?? ''}"`);
  }
  return getAddress(value);
}

function optionalAddress(value: string | undefined, label: string): Address | undefined {
  if (!value) return undefined;
  return requireAddress(value, label);
}

/**
 * Builds a network config from plain strings (environment variables).
 * Mainnet always uses the real Chog contracts. Testnet requires the test contract addresses
 * printed by the deploy script.
 */
export function resolveNetwork(input: NetworkInput): NetworkConfig {
  const name = (input.network ?? 'testnet').toLowerCase();
  if (name !== 'mainnet' && name !== 'testnet') {
    throw new Error(`network must be "mainnet" or "testnet", got "${input.network}"`);
  }
  const chain = name === 'mainnet' ? monad : monadTestnet;
  const rpcUrl = input.rpcUrl || chain.rpcUrls.default.http[0];
  const journey = requireAddress(input.journey, 'journey address');
  const agent = optionalAddress(input.agent, 'agent address');

  if (name === 'mainnet') {
    return {
      name,
      chain,
      rpcUrl,
      journey,
      chogGenesis: MAINNET_CHOG_GENESIS,
      chogToken: MAINNET_CHOG_TOKEN,
      agent,
      isTest: false,
    };
  }
  return {
    name,
    chain,
    rpcUrl,
    journey,
    chogGenesis: requireAddress(input.chogGenesis, 'test Chog Genesis address'),
    chogToken: requireAddress(input.chogToken, 'test CHOG token address'),
    agent,
    isTest: true,
  };
}
