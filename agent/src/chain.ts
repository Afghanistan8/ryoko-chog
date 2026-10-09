import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  http,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  type Account,
  type Chain,
  type Transport,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  chunk,
  ryokoAccountAbi,
  ryokoJourneyAbi,
  testChogGenesisAbi,
  CHOG_GENESIS_SUPPLY,
  type JourneyView,
} from '@ryoko/shared';
import type { AgentConfig } from './config';
import { log } from './log';

/** Batch size for getJourneys. 100 ids used 4.3M gas on a mainnet fork, under the 8.1M low-gas RPC pool. */
const BATCH = 100;
/** Monad bills the gas limit, not gas used, so keep the margin over the estimate small. */
const GAS_MARGIN_PERCENT = 115n;

export type Wallet = WalletClient<Transport, Chain, Account>;

export interface AgentChain {
  publicClient: PublicClient;
  wallet: Wallet;
  me: Address;
}

export function connect(cfg: AgentConfig): AgentChain {
  const transport = http(cfg.network.rpcUrl, { retryCount: 3, timeout: 20_000 });
  const account = privateKeyToAccount(cfg.privateKey);
  const publicClient = createPublicClient({ chain: cfg.network.chain, transport }) as PublicClient;
  const wallet = createWalletClient({ chain: cfg.network.chain, transport, account });
  return { publicClient, wallet, me: account.address };
}

export interface JourneyConfig {
  antPrice: bigint;
  minStay: bigint;
  legDuration: bigint;
  resetter: Address;
}

export async function readJourneyConfig(c: AgentChain, journey: Address): Promise<JourneyConfig> {
  const base = { address: journey, abi: ryokoJourneyAbi } as const;
  const [antPrice, minStay, legDuration, resetter] = await Promise.all([
    c.publicClient.readContract({ ...base, functionName: 'antPrice' }),
    c.publicClient.readContract({ ...base, functionName: 'minStay' }),
    c.publicClient.readContract({ ...base, functionName: 'legDuration' }),
    c.publicClient.readContract({ ...base, functionName: 'resetter' }),
  ]);
  return { antPrice, minStay: BigInt(minStay), legDuration: BigInt(legDuration), resetter };
}

/** All token ids that can exist: 1-1969 on mainnet, 1-totalSupply for the free testnet collection. */
export async function tokenIds(c: AgentChain, cfg: AgentConfig): Promise<bigint[]> {
  let max = BigInt(CHOG_GENESIS_SUPPLY);
  if (cfg.network.isTest) {
    max = await c.publicClient.readContract({
      address: cfg.network.chogGenesis,
      abi: testChogGenesisAbi,
      functionName: 'totalSupply',
    });
  }
  const ids: bigint[] = [];
  for (let i = 1n; i <= max; i++) ids.push(i);
  return ids;
}

export async function readJourneys(c: AgentChain, journey: Address, ids: bigint[]): Promise<JourneyView[]> {
  const out: JourneyView[] = [];
  for (const batch of chunk(ids, BATCH)) {
    const views = await c.publicClient.readContract({
      address: journey,
      abi: ryokoJourneyAbi,
      functionName: 'getJourneys',
      args: [batch],
    });
    out.push(...views);
  }
  return out;
}

/** CHOG balance and journey allowance of each account, in one multicall. */
export async function readFunds(
  c: AgentChain,
  chogToken: Address,
  journey: Address,
  accounts: Address[],
): Promise<Map<Address, { balance: bigint; allowance: bigint }>> {
  const result = new Map<Address, { balance: bigint; allowance: bigint }>();
  if (accounts.length === 0) return result;
  const calls = accounts.flatMap((a) => [
    { address: chogToken, abi: erc20Abi, functionName: 'balanceOf', args: [a] } as const,
    { address: chogToken, abi: erc20Abi, functionName: 'allowance', args: [a, journey] } as const,
  ]);
  const res = await c.publicClient.multicall({ contracts: calls, allowFailure: false });
  accounts.forEach((a, i) => {
    result.set(a, { balance: res[i * 2] as bigint, allowance: res[i * 2 + 1] as bigint });
  });
  return result;
}

/**
 * Sends `journey.<call>` from the Chog's own account (msg.sender = the Chog's account).
 * Simulates first so a doomed transaction never costs gas, then sets a tight gas limit.
 */
export async function actThroughAccount(
  c: AgentChain,
  account: Address,
  journey: Address,
  data: Hex,
  dryRun: boolean,
): Promise<Hex | 'dry-run'> {
  const args = [journey, 0n, data, 0] as const;
  const { request } = await c.publicClient.simulateContract({
    account: c.wallet.account,
    address: account,
    abi: ryokoAccountAbi,
    functionName: 'execute',
    args,
  });
  if (dryRun) return 'dry-run';
  const estimate = await c.publicClient.estimateContractGas({
    account: c.wallet.account,
    address: account,
    abi: ryokoAccountAbi,
    functionName: 'execute',
    args,
  });
  const hash = await c.wallet.writeContract({ ...request, gas: (estimate * GAS_MARGIN_PERCENT) / 100n });
  const receipt = await c.publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (receipt.status !== 'success') throw new Error(`transaction ${hash} reverted`);
  return hash;
}

export function travelData(): Hex {
  return encodeFunctionData({ abi: ryokoJourneyAbi, functionName: 'travel' });
}

export function conquerData(note: string): Hex {
  return encodeFunctionData({ abi: ryokoJourneyAbi, functionName: 'conquer', args: [note] });
}

export async function warnIfLowGas(c: AgentChain, lowGasWei: bigint): Promise<void> {
  const balance = await c.publicClient.getBalance({ address: c.me });
  if (balance < lowGasWei) {
    log.warn('agent wallet is low on MON for gas', { agent: c.me, balanceWei: balance });
  }
}
