import { resolveNetwork, type NetworkConfig } from '@ryoko/shared';

export type EnvResult = { ok: true; network: NetworkConfig } | { ok: false; error: string };

export function readEnv(): EnvResult {
  const env = import.meta.env;
  try {
    const network = resolveNetwork({
      network: env.VITE_NETWORK,
      rpcUrl: env.VITE_RPC_URL,
      journey: env.VITE_JOURNEY_ADDRESS,
      chogGenesis: env.VITE_TEST_CHOG_GENESIS,
      chogToken: env.VITE_TEST_CHOG_TOKEN,
      agent: env.VITE_AGENT_ADDRESS,
    });
    return { ok: true, network };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
