// Reads what a share card shows about one Chog, straight from the chain.
import { createPublicClient, http, type Address } from 'viem';
import { monad, monadTestnet } from 'viem/chains';
import { DEPLOYMENTS } from '../../packages/shared/src/deployments.js';
import type { NetworkName } from '../../packages/shared/src/networks.js';
import { ryokoJourneyAbi } from '../../packages/shared/src/abis.js';
import { SWAMPS } from '../../packages/shared/src/swamps.js';
import { decodeEventRecord, EVENT_INFO } from '../../packages/shared/src/events.js';
import { tierName } from '../../packages/shared/src/tiers.js';

export interface ShareQuery {
  net: NetworkName;
  id: bigint;
  /** 1-9: the swamp the card is about. */
  swamp: number;
}

export interface ShareData extends ShareQuery {
  name: string;
  conquered: number;
  complete: boolean;
  swampName: string;
  swampGlow: string;
  note: string;
  eventLabel: string;
  rushed: boolean;
  tier: string;
  /** Glow colour of each conquered swamp, in order. */
  trail: string[];
}

/** Parses ?net=&id=&swamp= strictly. Returns null for anything malformed. */
export function parseQuery(params: URLSearchParams): ShareQuery | null {
  const net = params.get('net');
  const id = params.get('id') ?? '';
  const swamp = Number(params.get('swamp'));
  if (net !== 'mainnet' && net !== 'testnet') return null;
  if (!/^\d{1,5}$/.test(id) || Number(id) < 1) return null;
  if (!Number.isInteger(swamp) || swamp < 1 || swamp > 9) return null;
  return { net, id: BigInt(id), swamp };
}

export async function loadShareData(q: ShareQuery): Promise<ShareData | null> {
  // Optional overrides, e.g. a private RPC on Vercel: RYOKO_MAINNET_RPC_URL, RYOKO_TESTNET_JOURNEY.
  const pre = q.net === 'mainnet' ? 'RYOKO_MAINNET_' : 'RYOKO_TESTNET_';
  const journey = (process.env[`${pre}JOURNEY`] || DEPLOYMENTS[q.net]?.journey) as Address | undefined;
  if (!journey) return null;
  const chain = q.net === 'mainnet' ? monad : monadTestnet;
  const client = createPublicClient({ chain, transport: http(process.env[`${pre}RPC_URL`] || undefined, { timeout: 8_000 }) });
  // Plain types on purpose: Vercel type-checks functions with its own TypeScript, which chokes on
  // viem's deeply inferred contract types. The decoded values have exactly these shapes.
  const read = (functionName: 'getJourney' | 'notesOf' | 'eventsOf'): Promise<unknown> =>
    client.readContract({ address: journey, abi: ryokoJourneyAbi, functionName, args: [q.id] } as never);
  const [view, notes, events] = (await Promise.all([read('getJourney'), read('notesOf'), read('eventsOf')])) as [
    { name: string; conquered: number; status: number; tier: number },
    readonly string[],
    readonly number[],
  ];
  const swamp = SWAMPS[q.swamp - 1]!;
  const record = decodeEventRecord(events[q.swamp - 1] ?? 0);
  const eventLabel = record.event > 1 ? EVENT_INFO[record.event].label : '';
  return {
    ...q,
    name: view.name || `Chog #${q.id}`,
    conquered: view.conquered,
    complete: view.status === 5,
    swampName: swamp.name,
    swampGlow: swamp.glow,
    note: notes[q.swamp - 1] ?? '',
    eventLabel,
    rushed: record.rushed,
    tier: tierName(view.tier),
    trail: SWAMPS.slice(0, view.conquered).map((s) => s.glow),
  };
}

/** Plain-text summary for link previews. */
export function describe(data: ShareData): { title: string; text: string } {
  const done = data.conquered >= data.swamp;
  const title = done
    ? `${data.name} conquered ${data.swampName}`
    : `${data.name} is on its way to ${data.swampName}`;
  const text = data.complete
    ? `All nine swamps conquered on Ryoko Chog. ${data.name} glows gold.`
    : `Swamp ${data.swamp} of 9 on Ryoko Chog, where every Chog travels with its own wallet and burns $CHOG ants.`;
  return { title, text };
}
