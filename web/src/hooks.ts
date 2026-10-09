import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import {
  chunk,
  DEFAULT_IPFS_GATEWAYS,
  fetchMetadata,
  ipfsToHttp,
  ryokoJourneyAbi,
  testChogGenesisAbi,
  traitsOf,
  CHOG_GENESIS_SUPPLY,
  type JourneyView,
  type Traits,
} from '@ryoko/shared';
import { useNetwork } from './network';

const BATCH = 100;

export interface JourneyConfig {
  antPrice: bigint;
  minStay: bigint;
  legDuration: bigint;
}

export function useJourneyConfig() {
  const net = useNetwork();
  const client = usePublicClient();
  return useQuery({
    queryKey: ['journey-config', net.chain.id, net.journey],
    enabled: Boolean(client),
    refetchInterval: 60_000,
    queryFn: async (): Promise<JourneyConfig> => {
      const base = { address: net.journey, abi: ryokoJourneyAbi } as const;
      const [antPrice, minStay, legDuration] = await Promise.all([
        client!.readContract({ ...base, functionName: 'antPrice' }),
        client!.readContract({ ...base, functionName: 'minStay' }),
        client!.readContract({ ...base, functionName: 'legDuration' }),
      ]);
      return { antPrice, minStay: BigInt(minStay), legDuration: BigInt(legDuration) };
    },
  });
}

/** Every Chog's journey view: 1-1969 on mainnet, every minted test Chog on testnet. */
export function useAllJourneys() {
  const net = useNetwork();
  const client = usePublicClient();
  return useQuery({
    queryKey: ['journeys', net.chain.id, net.journey],
    enabled: Boolean(client),
    refetchInterval: 20_000,
    queryFn: async (): Promise<JourneyView[]> => {
      let max = BigInt(CHOG_GENESIS_SUPPLY);
      if (net.isTest) {
        max = await client!.readContract({
          address: net.chogGenesis,
          abi: testChogGenesisAbi,
          functionName: 'totalSupply',
        });
      }
      const ids: bigint[] = [];
      for (let i = 1n; i <= max; i++) ids.push(i);
      const batches = chunk(ids, BATCH);
      const results: JourneyView[][] = [];
      // A few batches at a time keeps public RPC load reasonable.
      for (const group of chunk(batches, 4)) {
        const views = await Promise.all(
          group.map((b) =>
            client!.readContract({ address: net.journey, abi: ryokoJourneyAbi, functionName: 'getJourneys', args: [b] }),
          ),
        );
        results.push(...views.map((v) => [...v]));
      }
      return results.flat();
    },
  });
}

/** Chain time in seconds, ticking every second between block reads. */
export function useChainNow(): bigint | undefined {
  const net = useNetwork();
  const client = usePublicClient();
  const block = useQuery({
    queryKey: ['chain-time', net.chain.id],
    enabled: Boolean(client),
    refetchInterval: 15_000,
    queryFn: async () => {
      const b = await client!.getBlock();
      return { ts: b.timestamp, at: Date.now() };
    },
  });
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (!block.data) return undefined;
  return block.data.ts + BigInt(Math.floor((Date.now() - block.data.at) / 1000));
}

export interface ChogMeta {
  /** Image URLs to try in order: the same IPFS file through each gateway. */
  images: string[];
  traits: Traits;
}

export function useChogMeta(tokenId: bigint | undefined) {
  const net = useNetwork();
  const client = usePublicClient();
  return useQuery({
    queryKey: ['chog-meta', net.chain.id, net.chogGenesis, tokenId?.toString()],
    enabled: Boolean(client) && tokenId !== undefined,
    staleTime: Infinity,
    queryFn: async (): Promise<ChogMeta> => {
      const uri = await client!.readContract({
        address: net.chogGenesis,
        abi: testChogGenesisAbi,
        functionName: 'tokenURI',
        args: [tokenId!],
      });
      const meta = await fetchMetadata(uri);
      const raw = meta?.image;
      const images = !raw ? [] : raw.startsWith('ipfs://') ? DEFAULT_IPFS_GATEWAYS.map((g) => ipfsToHttp(raw, g)) : [raw];
      return { images, traits: traitsOf(meta) };
    },
  });
}

/** Minimal hash router: "#/", "#/mine", "#/leaderboard", "#/chog/123". */
export type Route = { page: 'home' } | { page: 'mine' } | { page: 'leaderboard' } | { page: 'chog'; id: bigint };

function parse(hash: string): Route {
  const path = hash.replace(/^#/, '');
  const chog = /^\/chog\/(\d{1,6})$/.exec(path);
  if (chog) return { page: 'chog', id: BigInt(chog[1]!) };
  if (path === '/mine') return { page: 'mine' };
  if (path === '/leaderboard') return { page: 'leaderboard' };
  return { page: 'home' };
}

export function useRoute(): Route {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => {
      setHash(window.location.hash);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return useMemo(() => parse(hash), [hash]);
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}
