/** Chog metadata lives on IPFS. These gateways were checked to serve the Chog Genesis folder. */
export const DEFAULT_IPFS_GATEWAYS = ['https://gateway.pinata.cloud/ipfs/', 'https://ipfs.io/ipfs/'] as const;

export interface ChogMetadata {
  name?: string;
  image?: string;
  attributes?: { trait_type?: string; value?: string | number }[];
}

export type Traits = Record<string, string>;

/** Rewrites ipfs://CID/path to an HTTP gateway URL. Other URLs pass through. */
export function ipfsToHttp(uri: string, gateway: string = DEFAULT_IPFS_GATEWAYS[0]): string {
  if (uri.startsWith('ipfs://')) {
    const path = uri.slice('ipfs://'.length).replace(/^ipfs\//, '');
    return gateway.endsWith('/') ? gateway + path : `${gateway}/${path}`;
  }
  return uri;
}

export function traitsOf(meta: ChogMetadata | undefined): Traits {
  const out: Traits = {};
  for (const a of meta?.attributes ?? []) {
    if (typeof a.trait_type === 'string' && (typeof a.value === 'string' || typeof a.value === 'number')) {
      out[a.trait_type] = String(a.value);
    }
  }
  return out;
}

/** Fetches JSON metadata, trying each gateway in turn. Returns undefined if all fail. */
export async function fetchMetadata(
  tokenUri: string,
  opts: { gateways?: readonly string[]; timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<ChogMetadata | undefined> {
  const gateways = opts.gateways ?? DEFAULT_IPFS_GATEWAYS;
  const doFetch = opts.fetchImpl ?? fetch;
  const urls = tokenUri.startsWith('ipfs://') ? gateways.map((g) => ipfsToHttp(tokenUri, g)) : [tokenUri];
  for (const url of urls) {
    try {
      const res = await doFetch(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 8000) });
      if (!res.ok) continue;
      const json: unknown = await res.json();
      if (json && typeof json === 'object') return json as ChogMetadata;
    } catch {
      // try the next gateway
    }
  }
  return undefined;
}
