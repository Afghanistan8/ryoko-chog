import { isHex, type Hex } from 'viem';
import { resolveNetwork, DEFAULT_IPFS_GATEWAYS, type NetworkConfig } from '@ryoko/shared';

export interface AgentConfig {
  network: NetworkConfig;
  privateKey: Hex;
  pollSeconds: number;
  dryRun: boolean;
  reportTransfers: boolean;
  stateFile: string;
  ipfsGateways: string[];
  /** Warn when the agent's own MON balance (for gas) drops below this, in wei. */
  lowGasWei: bigint;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  if (/^(1|true|yes)$/i.test(value)) return true;
  if (/^(0|false|no)$/i.test(value)) return false;
  throw new Error(`expected true or false, got "${value}"`);
}

function positiveInt(value: string | undefined, fallback: number, label: string): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${label} must be a positive integer, got "${value}"`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const network = resolveNetwork({
    network: env.NETWORK,
    rpcUrl: env.RPC_URL,
    journey: env.JOURNEY_ADDRESS,
    chogGenesis: env.TEST_CHOG_GENESIS,
    chogToken: env.TEST_CHOG_TOKEN,
  });

  const rawKey = env.AGENT_PRIVATE_KEY?.trim();
  const privateKey = rawKey && !rawKey.startsWith('0x') ? `0x${rawKey}` : rawKey;
  if (!privateKey || !isHex(privateKey) || privateKey.length !== 66) {
    throw new Error('AGENT_PRIVATE_KEY must be a 32-byte hex private key');
  }

  const gateways = env.IPFS_GATEWAYS
    ? env.IPFS_GATEWAYS.split(',').map((g) => g.trim()).filter(Boolean)
    : [...DEFAULT_IPFS_GATEWAYS];

  return {
    network,
    privateKey: privateKey as Hex,
    pollSeconds: positiveInt(env.POLL_SECONDS, 30, 'POLL_SECONDS'),
    dryRun: bool(env.DRY_RUN, false),
    reportTransfers: bool(env.REPORT_TRANSFERS, true),
    stateFile: env.STATE_FILE || '.agent-state.json',
    ipfsGateways: gateways,
    lowGasWei: BigInt(positiveInt(env.LOW_GAS_MILLI_MON, 500, 'LOW_GAS_MILLI_MON')) * 10n ** 15n,
  };
}
