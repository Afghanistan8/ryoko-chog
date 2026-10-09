import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseAbiItem, type Address } from 'viem';
import { ryokoJourneyAbi, Status } from '@ryoko/shared';
import type { AgentChain } from './chain';
import { errorMessage, log } from './log';

const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)');
/** rpc.monad.xyz accepts at most 100 blocks per eth_getLogs call. */
const MAX_RANGE = 100n;
/** Cap catch-up work per tick (5,000 blocks is about 33 minutes at 400 ms blocks). */
const MAX_WINDOWS_PER_TICK = 50;

export interface WatcherState {
  chainId: number;
  chog: string;
  lastBlock: string;
}

/**
 * The block to resume after, or undefined to start fresh at the latest block. A state file
 * written for another chain or Chog contract (a testnet run, say) is ignored, and so is one
 * ahead of the chain, rather than scanning the wrong blocks or none at all.
 */
export function resumeFrom(raw: unknown, chainId: number, chog: Address, latest: bigint): bigint | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const s = raw as Partial<WatcherState>;
  if (s.chainId !== chainId || typeof s.chog !== 'string' || s.chog.toLowerCase() !== chog.toLowerCase()) return undefined;
  if (typeof s.lastBlock !== 'string' || !/^\d+$/.test(s.lastBlock)) return undefined;
  const block = BigInt(s.lastBlock);
  return block > latest ? undefined : block;
}

/**
 * Watches Chog transfers. A Chog sent away and back to the same holder looks unchanged to the
 * journey contract, so the agent (as the configured resetter) reports such transfers.
 * Ordinary transfers to a new holder already void the journey on-chain and need no report.
 */
export class TransferWatcher {
  private lastBlock: bigint | undefined;
  private saved: unknown;
  private started = false;
  private readonly blockTime = new Map<bigint, bigint>();

  constructor(
    private readonly chain: AgentChain,
    private readonly chainId: number,
    private readonly chog: Address,
    private readonly journey: Address,
    private readonly stateFile: string,
    private readonly dryRun: boolean,
  ) {
    if (existsSync(stateFile)) {
      try {
        this.saved = JSON.parse(readFileSync(stateFile, 'utf8'));
      } catch (err) {
        log.warn('could not read agent state file; starting from the latest block', { error: errorMessage(err) });
      }
    }
  }

  async tick(): Promise<number> {
    const latest = await this.chain.publicClient.getBlockNumber();
    if (!this.started) {
      this.started = true;
      this.lastBlock = resumeFrom(this.saved, this.chainId, this.chog, latest);
      if (this.lastBlock !== undefined) log.info('transfer watcher resuming', { fromBlock: this.lastBlock + 1n, latest });
      else if (this.saved !== undefined) log.warn('agent state file is for another chain or contract; starting fresh', { stateFile: this.stateFile });
    }
    if (this.lastBlock === undefined) {
      this.save(latest);
      log.info('transfer watcher starting at the latest block', { block: latest });
      return 0;
    }

    let reported = 0;
    for (let w = 0; w < MAX_WINDOWS_PER_TICK && this.lastBlock < latest; w++) {
      const from = this.lastBlock + 1n;
      const to = from + MAX_RANGE - 1n < latest ? from + MAX_RANGE - 1n : latest;
      const logs = await this.chain.publicClient.getLogs({
        address: this.chog,
        event: TRANSFER,
        fromBlock: from,
        toBlock: to,
      });
      for (const entry of logs) {
        const tokenId = entry.args.tokenId;
        if (tokenId === undefined) continue;
        if (await this.checkAndReport(tokenId, entry.blockNumber)) reported++;
      }
      this.save(to);
    }
    return reported;
  }

  private async checkAndReport(tokenId: bigint, blockNumber: bigint): Promise<boolean> {
    const view = await this.chain.publicClient.readContract({
      address: this.journey,
      abi: ryokoJourneyAbi,
      functionName: 'getJourney',
      args: [tokenId],
    });
    // Status None: holder changed, already void on-chain. Otherwise the Chog came back to the
    // journey's holder; report only if the transfer happened after the journey started.
    if (view.status === Status.None) return false;
    const ts = await this.timestampOf(blockNumber);
    if (ts <= view.startedAt) return false;

    if (this.dryRun) {
      log.info('would report a hidden transfer', { tokenId, block: blockNumber });
      return true;
    }
    try {
      const { request } = await this.chain.publicClient.simulateContract({
        account: this.chain.wallet.account,
        address: this.journey,
        abi: ryokoJourneyAbi,
        functionName: 'reportTransfer',
        args: [tokenId],
      });
      const hash = await this.chain.wallet.writeContract(request);
      await this.chain.publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
      log.info('reported a hidden transfer; journey reset', { tokenId, block: blockNumber, tx: hash });
      return true;
    } catch (err) {
      log.error('could not report transfer', { tokenId, error: errorMessage(err) });
      return false;
    }
  }

  private async timestampOf(blockNumber: bigint): Promise<bigint> {
    const cached = this.blockTime.get(blockNumber);
    if (cached !== undefined) return cached;
    const block = await this.chain.publicClient.getBlock({ blockNumber });
    this.blockTime.set(blockNumber, block.timestamp);
    if (this.blockTime.size > 1000) this.blockTime.clear();
    return block.timestamp;
  }

  private save(block: bigint): void {
    this.lastBlock = block;
    const state: WatcherState = { chainId: this.chainId, chog: this.chog, lastBlock: block.toString() };
    writeFileSync(this.stateFile, JSON.stringify(state));
  }
}
