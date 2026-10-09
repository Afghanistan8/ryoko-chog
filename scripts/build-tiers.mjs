// Builds packages/shared/src/tiers.json: the official "Tier" trait of every Chog Genesis piece.
//
// Chog Genesis metadata lives in one IPFS folder (1.json ... 1969.json). Real Chogs on mainnet
// are shuffled (token 1 points at 1462.json), so the mainnet mapping is read from tokenURI.
// Test Chogs on testnet use file N for token N.
//
// Usage: node scripts/build-tiers.mjs
// Re-running is cheap: fetched files are cached in scripts/.cache/meta.
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, http, parseAbi } from 'viem';
import { monad } from 'viem/chains';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(root, 'scripts', '.cache', 'meta');
const outFile = join(root, 'packages', 'shared', 'src', 'tiers.json');
const SUPPLY = 1969;
const CHOG = '0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763';
const FOLDER = 'bafybeid4ybujnscdipkno7ps5utqelp5ry5ryreqhay3zhgk3a6x4jruqu';
const GATEWAYS = ['https://ipfs.filebase.io/ipfs/', 'https://gateway.pinata.cloud/ipfs/', 'https://ipfs.io/ipfs/'];

mkdirSync(cacheDir, { recursive: true });

async function fetchFile(n) {
  const cached = join(cacheDir, `${n}.json`);
  if (existsSync(cached)) return JSON.parse(readFileSync(cached, 'utf8'));
  // Public gateways rate-limit hard (HTTP 429), so go slowly and honour Retry-After.
  for (let attempt = 0; attempt < 40; attempt++) {
    const gw = GATEWAYS[attempt % GATEWAYS.length];
    let waitMs = Math.min(60_000, 2000 * (attempt + 1));
    try {
      const res = await fetch(`${gw}${FOLDER}/${n}.json`, { signal: AbortSignal.timeout(20_000) });
      if (res.ok) {
        const json = await res.json();
        writeFileSync(cached, JSON.stringify(json));
        await new Promise((r) => setTimeout(r, 300));
        return json;
      }
      const retryAfter = Number(res.headers.get('retry-after'));
      if (Number.isFinite(retryAfter) && retryAfter > 0) waitMs = Math.min(120_000, retryAfter * 1000);
    } catch {
      // try again
    }
    await new Promise((r) => setTimeout(r, waitMs));
  }
  throw new Error(`could not fetch ${n}.json`);
}

function tierOf(meta, n) {
  const t = meta.attributes?.find((a) => a.trait_type === 'Tier')?.value;
  if (typeof t !== 'string' || !t) throw new Error(`${n}.json has no Tier trait`);
  return t;
}

// 1. Every metadata file's tier.
const fileTier = new Array(SUPPLY + 1);
let done = 0;
const queue = Array.from({ length: SUPPLY }, (_, i) => i + 1);
await Promise.all(
  Array.from({ length: 2 }, async () => {
    while (queue.length) {
      const n = queue.shift();
      fileTier[n] = tierOf(await fetchFile(n), n);
      if (++done % 200 === 0) console.log(`fetched ${done}/${SUPPLY}`);
    }
  }),
);

// 2. Real Chog token id -> metadata file, from tokenURI on mainnet.
const client = createPublicClient({ chain: monad, transport: http() });
const abi = parseAbi(['function tokenURI(uint256) view returns (string)']);
const uris = [];
for (let start = 1; start <= SUPPLY; start += 300) {
  const ids = Array.from({ length: Math.min(300, SUPPLY - start + 1) }, (_, i) => BigInt(start + i));
  const res = await client.multicall({
    allowFailure: false,
    contracts: ids.map((id) => ({ address: CHOG, abi, functionName: 'tokenURI', args: [id] })),
  });
  uris.push(...res);
}
const mainnetFile = uris.map((u, i) => {
  const m = new RegExp(`^ipfs://${FOLDER}/(\\d+)\\.json$`).exec(u);
  if (!m) throw new Error(`token ${i + 1}: unexpected tokenURI ${u}`);
  return Number(m[1]);
});
if (new Set(mainnetFile).size !== SUPPLY) throw new Error('mainnet tokenURIs are not a one-to-one mapping');

// 3. Tier names, rarest last (by how many Chogs have them).
const counts = {};
for (let n = 1; n <= SUPPLY; n++) counts[fileTier[n]] = (counts[fileTier[n]] ?? 0) + 1;
const names = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
if (names.length > 9) throw new Error(`expected at most 9 tiers, found ${names.length}`);
const index = Object.fromEntries(names.map((t, i) => [t, i]));

const testnet = Array.from({ length: SUPPLY }, (_, i) => index[fileTier[i + 1]]).join('');
const mainnet = mainnetFile.map((f) => index[fileTier[f]]).join('');

writeFileSync(
  outFile,
  JSON.stringify(
    {
      complete: true,
      source: `ipfs://${FOLDER}`,
      note: 'Digit i of each string is the tier index of token id i+1. Tiers are ordered most common first.',
      tiers: names,
      counts: names.map((t) => counts[t]),
      mainnet,
      testnet,
    },
    null,
    2,
  ) + '\n',
);
console.log('tiers:', names.map((t) => `${t} ${counts[t]}`).join(', '));
console.log(`wrote ${outFile}`);
