import { existsSync } from 'node:fs';
import { loadConfig } from './config';
import { connect, readJourneyConfig, warnIfLowGas } from './chain';
import { ChogAgent } from './agent';
import { TransferWatcher } from './resets';
import { errorMessage, log } from './log';

// "--env .env.mainnet" picks another settings file, so one folder can run either network.
const envFlag = process.argv.indexOf('--env');
const envFile = envFlag >= 0 ? process.argv[envFlag + 1] : '.env';
if (!envFile || envFile.startsWith('--')) throw new Error('--env needs a file name, e.g. --env .env.mainnet');
if (existsSync(envFile)) process.loadEnvFile(envFile);
else if (envFlag >= 0) throw new Error(`settings file not found: ${envFile}`);

async function main(): Promise<void> {
  const once = process.argv.includes('--once');
  const cfg = loadConfig();
  const chain = connect(cfg);

  const chainId = await chain.publicClient.getChainId();
  if (chainId !== cfg.network.chain.id) {
    throw new Error(`RPC is on chain ${chainId}, expected ${cfg.network.chain.id} (${cfg.network.name})`);
  }
  const jc = await readJourneyConfig(chain, cfg.network.journey);

  log.info('Ryoko Chog agent starting', {
    network: cfg.network.name,
    agent: chain.me,
    journey: cfg.network.journey,
    antPrice: jc.antPrice,
    minStaySeconds: jc.minStay,
    legSeconds: jc.legDuration,
    dryRun: cfg.dryRun,
    stateFile: cfg.stateFile,
  });

  const agent = new ChogAgent(cfg, chain);
  let watcher: TransferWatcher | undefined;
  if (cfg.reportTransfers) {
    if (jc.resetter.toLowerCase() === chain.me.toLowerCase()) {
      watcher = new TransferWatcher(chain, cfg.network.chain.id, cfg.network.chogGenesis, cfg.network.journey, cfg.stateFile, cfg.dryRun);
    } else {
      log.warn('transfer reports are off: this agent is not the journey resetter', { resetter: jc.resetter });
    }
  }

  let stopping = false;
  const stop = () => {
    if (!stopping) log.info('stopping after the current round');
    stopping = true;
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  do {
    const started = Date.now();
    try {
      await warnIfLowGas(chain, cfg.lowGasWei);
      const summary = await agent.tick();
      const reported = watcher ? await watcher.tick() : 0;
      log.info('round done', { ...summary, transfersReported: reported, ms: Date.now() - started });
    } catch (err) {
      log.error('round failed; will retry', { error: errorMessage(err) });
    }
    if (once || stopping) break;
    const wait = Math.max(1000, cfg.pollSeconds * 1000 - (Date.now() - started));
    await new Promise((r) => setTimeout(r, wait));
  } while (!stopping);
}

main().catch((err: unknown) => {
  log.error('agent stopped', { error: errorMessage(err) });
  process.exit(1);
});
