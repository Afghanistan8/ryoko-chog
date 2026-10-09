import type { Address } from 'viem';
import {
  fetchMetadata,
  testChogGenesisAbi,
  traitsOf,
  writeNote,
  Status,
  type Traits,
} from '@ryoko/shared';
import type { AgentConfig } from './config';
import {
  actThroughAccount,
  conquerData,
  readFunds,
  readJourneyConfig,
  readJourneys,
  tokenIds,
  travelData,
  type AgentChain,
} from './chain';
import { decide } from './decide';
import { errorMessage, log } from './log';

export interface TickSummary {
  scanned: number;
  appointed: number;
  conquered: number;
  travelled: number;
  waiting: number;
  failed: number;
}

/** tokenURI is the same ERC-721 function on the real and the test collection. */
const tokenUriAbi = testChogGenesisAbi;

export class ChogAgent {
  private readonly traitCache = new Map<bigint, Traits>();

  constructor(
    private readonly cfg: AgentConfig,
    private readonly chain: AgentChain,
  ) {}

  async tick(): Promise<TickSummary> {
    const { journey, chogToken } = this.cfg.network;
    const jc = await readJourneyConfig(this.chain, journey);
    const ids = await tokenIds(this.chain, this.cfg);
    const views = await readJourneys(this.chain, journey, ids);

    const me = this.chain.me.toLowerCase();
    const mine = views.filter(
      (v) =>
        v.agent.toLowerCase() === me && v.status !== Status.None && v.status !== Status.Complete,
    );
    const needFunds = mine
      .filter((v) => v.status === Status.Travelling || v.status === Status.Expired)
      .map((v) => v.account);
    const funds = await readFunds(this.chain, chogToken, journey, needFunds);
    const block = await this.chain.publicClient.getBlock();
    const now = block.timestamp;

    const summary: TickSummary = {
      scanned: views.length,
      appointed: mine.length,
      conquered: 0,
      travelled: 0,
      waiting: 0,
      failed: 0,
    };

    for (const view of mine) {
      const f = funds.get(view.account) ?? { balance: 0n, allowance: 0n };
      const decision = decide(view, {
        agent: this.chain.me,
        now,
        minStay: jc.minStay,
        antPrice: jc.antPrice,
        balance: f.balance,
        allowance: f.allowance,
      });
      const tag = { tokenId: view.tokenId, swamp: view.currentSwamp, account: view.account };

      try {
        if (decision.kind === 'conquer') {
          const note = writeNote({
            swamp: view.currentSwamp,
            tokenId: view.tokenId,
            journeyId: view.journeyId,
            restarts: view.restarts,
            traits: await this.traits(view.tokenId),
          });
          const tx = await actThroughAccount(this.chain, view.account, journey, conquerData(note), this.cfg.dryRun);
          summary.conquered++;
          log.info('conquered swamp', { ...tag, note, tx });
        } else if (decision.kind === 'travel') {
          const tx = await actThroughAccount(this.chain, view.account, journey, travelData(), this.cfg.dryRun);
          summary.travelled++;
          log.info(decision.restart ? 'restarted swamp after deadline' : 'ate an ant and entered swamp', {
            ...tag,
            tx,
          });
        } else if (decision.kind === 'wait') {
          summary.waiting++;
          if (decision.reason.startsWith('hungry') || decision.reason.startsWith('CHOG allowance')) {
            log.warn(decision.reason, tag);
          }
        }
      } catch (err) {
        summary.failed++;
        log.error(`could not act for Chog #${view.tokenId}`, { ...tag, error: errorMessage(err) });
      }
    }
    return summary;
  }

  private async traits(tokenId: bigint): Promise<Traits> {
    const cached = this.traitCache.get(tokenId);
    if (cached) return cached;
    try {
      const uri = await this.chain.publicClient.readContract({
        address: this.cfg.network.chogGenesis as Address,
        abi: tokenUriAbi,
        functionName: 'tokenURI',
        args: [tokenId],
      });
      const traits = traitsOf(await fetchMetadata(uri, { gateways: this.cfg.ipfsGateways }));
      if (Object.keys(traits).length > 0) this.traitCache.set(tokenId, traits);
      return traits;
    } catch (err) {
      log.warn('could not load Chog metadata; writing a note without traits', {
        tokenId,
        error: errorMessage(err),
      });
      return {};
    }
  }
}
