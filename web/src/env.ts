import { DEFAULT_NETWORK, DEPLOYMENTS, resolveNetwork, type NetworkConfig, type NetworkName } from '@ryoko/shared';

export type EnvResult =
  | { ok: true; network: NetworkConfig; available: NetworkName[] }
  | { ok: false; error: string };

const NAMES: readonly NetworkName[] = ['mainnet', 'testnet'];
const STORAGE_KEY = 'ryoko-network';

/** Addresses come from packages/shared/src/deployments.ts; VITE_* variables override them. */
function configFor(name: NetworkName): NetworkConfig | undefined {
  // Vite replaces import.meta.env with an object of every VITE_* variable, so keys can be built.
  const env = import.meta.env as unknown as Record<string, string | undefined>;
  const d = DEPLOYMENTS[name];
  const pre = name === 'mainnet' ? 'VITE_MAINNET_' : 'VITE_TESTNET_';
  const journey = env[`${pre}JOURNEY`] || d?.journey;
  if (!journey) return undefined;
  return resolveNetwork({
    network: name,
    rpcUrl: env[`${pre}RPC_URL`] || undefined,
    journey,
    agent: env[`${pre}AGENT`] || d?.agent,
    chogGenesis: env.VITE_TESTNET_CHOG_GENESIS || d?.chogGenesis,
    chogToken: env.VITE_TESTNET_CHOG_TOKEN || d?.chogToken,
  });
}

function isName(v: unknown): v is NetworkName {
  return v === 'mainnet' || v === 'testnet';
}

function stored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Which network to open: the link's ?net=, then the visitor's last choice, then the default. */
function pick(available: NetworkName[]): NetworkName {
  const fromUrl = new URLSearchParams(window.location.search).get('net');
  if (isName(fromUrl) && available.includes(fromUrl)) {
    try {
      window.localStorage.setItem(STORAGE_KEY, fromUrl);
    } catch {
      // private mode: the URL still decides
    }
    return fromUrl;
  }
  const last = stored();
  if (isName(last) && available.includes(last)) return last;
  return available.includes(DEFAULT_NETWORK) ? DEFAULT_NETWORK : available[0]!;
}

export function readEnv(): EnvResult {
  try {
    const configs = new Map<NetworkName, NetworkConfig>();
    for (const name of NAMES) {
      const c = configFor(name);
      if (c) configs.set(name, c);
    }
    const available = NAMES.filter((n) => configs.has(n));
    if (available.length === 0) return { ok: false, error: 'No Ryoko Chog deployment is configured.' };
    return { ok: true, network: configs.get(pick(available))!, available };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Switches network by reloading: every query and the wallet setup start clean on the new chain. */
export function switchNetwork(name: NetworkName): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, name);
  } catch {
    // the URL below still carries the choice
  }
  const url = new URL(window.location.href);
  url.searchParams.set('net', name);
  window.location.assign(url.toString());
}

/** A link to this site on a given network, e.g. for sharing. */
export function siteUrl(name: NetworkName, hash = ''): string {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('net', name);
  return url.toString() + hash;
}
