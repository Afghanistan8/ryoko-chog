# Ryoko Chog

Every Chog gets its own wallet and its own agent, then travels through nine swamps on Monad.

To enter each swamp the Chog eats an ant: a fixed amount of $CHOG paid from the Chog's own wallet and burned. Every swamp rolls an event (a shortcut, fog, an ant nest or a relic), and rarer Chogs, by their official Tier, get luckier rolls. The Chog stays about two days, or rushes by eating two extra ants, then conquers the swamp and writes a short field note on-chain. Each swamp has a nine-day deadline. The further a Chog gets, the brighter it glows, and it turns gold at swamp nine. Every conquest can be posted to X with a card made for that Chog. Selling or moving the Chog resets its journey.

Built for Chogathon 2026.

## Why the Chog NFT is essential

- The Chog **is** the wallet. Each Chog has an ERC-6551 token-bound account, and the ants are paid from that account. Without the NFT there is no wallet, no agent and no journey.
- Progress belongs to the Chog and its holder. A new holder starts from swamp one, and the glow, notes and name reset.
- The Chog's own rarity matters: its official Tier from the Chog Genesis metadata is stored on-chain and tilts every swamp event.
- The site shows the holder's real Chog art with its current glow, and every share card is made for that Chog.

## How a journey works

| Step | Who | What happens |
|---|---|---|
| Set off | Holder, one transaction | `begin(tokenId, name, agent, ants, permit)` names the Chog, starts the journey, creates its ERC-6551 account through the canonical registry, appoints the agent there, lets the journey take ant payments from it, and moves the ants in. With $CHOG's EIP-2612 permit the holder signs once (free) and sends one transaction. |
| Feed more | Holder | Sends $CHOG to the Chog's account. One ant = `antPrice` (1,000 CHOG by default). |
| Travel | Agent (or holder), through the Chog's account | `travel()` burns one ant (sends it to `0x…dEaD`), enters the next swamp and rolls its event. |
| Rush | Holder, through the Chog's account | `rush()` burns two more ants to cut half the minimum stay (one day on mainnet) off the current stay. Once per swamp. |
| Conquer | Agent (or holder), through the Chog's account | When the stay is over, `conquer(note)` stores the field note. The next leg starts. |

Swamp events, rolled from `block.prevrandao` when the Chog enters. Odds out of 100 for tier index t (0 = Common, capped at 5):

| Event | Effect | Odds |
|---|---|---|
| Calm waters | Normal stay | 50 |
| Shortcut | Stay a quarter shorter (12 hours on mainnet) | 15 + 2t |
| Lost in the fog | Stay a quarter longer | 25 − 4t |
| Ant nest | The Chog's own ant is not eaten | 7 + t |
| Relic | A keepsake recorded with the journey | 3 + t |

Rules enforced on-chain by `RyokoJourney`:

- Each swamp is a leg with a deadline of `legDuration` (9 days on mainnet). The Chog must eat, stay `minStay` (2 days), and conquer before the deadline.
- Miss the deadline and that swamp restarts: the next ant re-enters the same swamp. Earlier swamps stay conquered.
- A Chog can't enter a swamp so late that the longest possible stay (fog) would overrun the deadline (`TooLateToEnter`), so an ant is never wasted that way.
- Tiers are loaded by the owner from the Chog Genesis metadata (`scripts/build-tiers.mjs`) and then frozen with `freezeTiers()`, after which nobody can change them.
- Randomness comes from `block.prevrandao`. Whoever sends `travel` picks the block, so a holder travelling by hand could wait for a better roll; the agent never does. That is acceptable for a game with no prizes tied to single rolls.
- If the Chog changes hands, its journey is void everywhere at once and the new holder starts fresh.
- Names are 3–16 letters, digits and single spaces, unique ignoring case. A name stops counting when the Chog changes hands.

## Deployments

### Monad mainnet (chain 143)

Deployed 9 Oct 2026 and checked on-chain. Uses the real Chog Genesis and $CHOG. Stays are 2 days and legs 9 days. An ant is 1,000 CHOG.

| Contract | Address |
|---|---|
| RyokoJourney | [`0xC8E3c576c6aBC7536f7B158220e146aEE44C0725`](https://monadscan.com/address/0xC8E3c576c6aBC7536f7B158220e146aEE44C0725) |
| RyokoAccount (implementation) | [`0x095cee07dd861375170b3Bb1EB74D580E6Ff604B`](https://monadscan.com/address/0x095cee07dd861375170b3Bb1EB74D580E6Ff604B) |
| Chog Genesis | [`0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763`](https://monadscan.com/address/0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763) |
| $CHOG | [`0x350035555E10d9AfAF1566AaebfCeD5BA6C27777`](https://monadscan.com/address/0x350035555E10d9AfAF1566AaebfCeD5BA6C27777) |
| Agent and resetter | `0x4184bc5E5444F250767E8D33A49817A9B4FB0df3` |

The transaction record is in `contracts/broadcast/Deploy.s.sol/143/run-latest.json`. Mainnet and testnet share some addresses because both were deployed from the same fresh wallet; they are different contracts on different networks.

### Monad testnet (chain 10143)

Deployed 9 Oct 2026 and checked on-chain. Stays are 2 minutes and legs 9 minutes, so one "day" is one minute. An ant is 1,000 test CHOG.

| Contract | Address |
|---|---|
| RyokoJourney | [`0x3eccf61B0D2872fD179c2dE7bA19c64112aA3e34`](https://testnet.monadexplorer.com/address/0x3eccf61B0D2872fD179c2dE7bA19c64112aA3e34) |
| RyokoAccount (implementation) | [`0x37f97E1585f51ceCC712087A68C3169C67391f03`](https://testnet.monadexplorer.com/address/0x37f97E1585f51ceCC712087A68C3169C67391f03) |
| Chog Genesis (Test), free mint | [`0x095cee07dd861375170b3Bb1EB74D580E6Ff604B`](https://testnet.monadexplorer.com/address/0x095cee07dd861375170b3Bb1EB74D580E6Ff604B) |
| Chog (Test) token, faucet | [`0xC8E3c576c6aBC7536f7B158220e146aEE44C0725`](https://testnet.monadexplorer.com/address/0xC8E3c576c6aBC7536f7B158220e146aEE44C0725) |
| Agent and resetter | `0x4184bc5E5444F250767E8D33A49817A9B4FB0df3` |

The transaction record is in `contracts/broadcast/Deploy.s.sol/10143/run-latest.json`.

## Repository

```
contracts/        Foundry: RyokoAccount (ERC-6551), RyokoJourney, test tokens, tests, deploy script
packages/shared/  ABIs, network config, swamp data, note writer, helpers (used by agent and web)
agent/            Node agent: makes appointed Chogs travel and conquer, reports hidden transfers
web/              React + Vite site: 3D swamps, holder flow, leaderboard, network switch
api/              Vercel functions: share cards (/api/og) and share pages (/s/:net/:id/:swamp)
deploy/           systemd service and VPS guide for the agent
scripts/          ABI export, tier builder and fork-test helpers
```

## Verified facts this build relies on

Checked against live Monad RPCs during development:

| Item | Value |
|---|---|
| Monad mainnet / testnet chain id | 143 / 10143 |
| ERC-6551 registry | `0x000000006551c19487814612e58FE06813775758` on both networks. Code hash `0xda1d5b06…d6735` matches the Ethereum mainnet deployment. |
| Chog Genesis (mainnet) | `0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763`, ERC-721, token ids 1–1969, not enumerable |
| $CHOG (mainnet) | `0x350035555E10d9AfAF1566AaebfCeD5BA6C27777`, 18 decimals, 1,000,000,000 supply |
| Burning $CHOG | A mainnet-fork test confirmed that exactly `antPrice` reaches `0x…dEaD`, with total supply unchanged (no transfer fee or rebase). |
| Batch reads | `getJourneys` for 100 Chogs used about 4.4M gas on a mainnet fork, under the 8.1M low-gas eth_call pool of the public RPCs. |
| $CHOG permit | $CHOG supports EIP-2612 (`name` "Chog", version "1"). A signed permit was accepted in a mainnet simulation, and `begin` with a real permit passes on a mainnet fork. |
| Randomness | `block.prevrandao` returns a fresh value every block on both Monad networks. |
| `eth_getLogs` | `rpc.monad.xyz` allows 100 blocks per call; the agent reads transfers in 100-block windows. |

## Trust model

- **The agent can only call the journey contract.** `RyokoAccount.execute` lets the appointed agent call `journey` with zero value and nothing else, so it cannot move the Chog's tokens or NFTs. Its appointment stops working the moment the Chog changes hands.
- **The journey contract never holds funds.** It pulls exactly one ant per `travel` (two per `rush`) from the Chog's account and sends it to the burn address. In `begin` it moves the holder's $CHOG straight into the Chog's account, using exactly the permit the holder signed.
- **Only `begin` can set up an account for the holder.** `RyokoAccount.setupFromJourney` only accepts calls from the journey contract, and only for the Chog's current holder, which `begin` checks is the caller.
- **The admin** (owner of `RyokoJourney`) can change `antPrice`, set the resetter and load tiers until they are frozen. Ownership transfer is two-step. The admin cannot move anyone's tokens or edit journeys.
- **The resetter** (normally the agent) can reset a journey with `reportTransfer`. That covers a Chog sent away and back to the same wallet between checks, which the contract cannot detect on its own. A resetter can only reset, never move funds. Set it to the zero address to disable it.
- **ERC-6551 sale caveat:** the CHOG left in a Chog's account goes to the buyer, and a seller could empty it right before a sale. The account exposes `state()`, which changes on every action, so marketplaces can detect this. Buyers should not pay extra for the account's contents.
- **Field notes** come from fixed lines plus the Chog's own traits; no AI service or API key is involved. Trait values containing slurs are never quoted.

## Prerequisites

- Node.js 24 or newer
- Foundry 1.8.3 or newer (for Monad support: `network = "monad"` is set in `contracts/foundry.toml`)
- Git (the contract libraries are submodules)

```bash
git clone --recurse-submodules https://github.com/Afghanistan8/ryoko-chog.git
```

```bash
npm install
```

## Test

```bash
npm run test:contracts
```

```bash
npm run test:fork
```

```bash
npm test
```

```bash
npm run typecheck
```

- `test:contracts`: 87 unit and fuzz tests under Monad EVM rules, including every swamp event, exact event odds per tier, rushing, tiers and `begin` with permits.
- `test:fork`: runs against real Chog Genesis and $CHOG on a Monad mainnet fork, including `begin` with a real $CHOG permit and a rush.
- `npm test`: agent decision rules, the note writer, events, tier packing, share text and the site's formatting checks.

## Deploy

The deploy script refuses unknown chains and checks the registry's code hash before deploying.

- **Testnet** deploys free test versions of Chog Genesis and CHOG, with a 2-minute stay and a 9-minute leg so a full journey fits in a demo. Override with `MIN_STAY` and `LEG_DURATION` in seconds.
- **Mainnet** uses the real Chog Genesis and $CHOG, with 2 days and 9 days.

The Chog tiers come from `packages/shared/src/tiers.json`, built from the Chog Genesis metadata:

```bash
node scripts/build-tiers.mjs
```

The deploy script loads them and freezes them in the same run (it refuses placeholder data). With `SKIP_TIERS=true` it deploys without them; load them later with `JOURNEY=<address> forge script script/LoadTiers.s.sol ...`.

Run from the `contracts` folder. Set `OWNER` (admin) and `RESETTER` (the agent's address), plus optionally `ANT_PRICE` in wei. Use your own key management; the example uses an interactive key prompt.

```bash
forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast --interactives 1 --sender <your address>
```

```bash
forge script script/Deploy.s.sol --rpc-url monad --broadcast --interactives 1 --sender <your address>
```

The script prints the addresses. Put them in `packages/shared/src/deployments.ts`; the site, the share cards and the agent all read that file. If `OWNER` differs from the deployer, the owner must call `acceptOwnership()`.

## Run the agent

Copy `agent/.env.example` to `agent/.env` and fill in the addresses and a fresh agent key funded with MON for gas.

```bash
npm run agent
```

To run on mainnet as well, put the mainnet settings in `agent/.env.mainnet` (`NETWORK=mainnet`, `JOURNEY_ADDRESS`, `AGENT_PRIVATE_KEY`) and start it with:

```bash
npm run agent:mainnet
```

Each network keeps its own `.agent-state.<network>.json`, and a state file written for another chain is ignored, so testnet and mainnet runs never mix.

To run the agent around the clock on a server, follow [deploy/VPS.md](deploy/VPS.md): one systemd service per network that restarts on its own.

It reads every Chog's journey each round. For Chogs that appointed it, it eats an ant when the Chog is fed and in time, and conquers once the stay is over. If it is the resetter, it also reports Chogs sent away and back. Use `DRY_RUN=true` to simulate without sending.

## Run the site

The site reads the deployments from `packages/shared/src/deployments.ts` and needs no configuration. When both networks are deployed, a **Mainnet / Testnet** switch sits in the header; links can pick one with `?net=testnet`. `web/.env.local` can override any address or RPC (see `web/.env.example`), for example to point local development at a local chain.

```bash
npm run dev:web
```

```bash
npm run build:web
```

### Vercel

`vercel.json` holds the build settings: install with `npm ci` at the repository root, build the `web` workspace, serve `web/dist`, and run the share functions in `api/`. Import the repository with the Root Directory left as the repository root. No environment variables are needed. Optional: `VITE_WALLETCONNECT_PROJECT_ID` (see Wallets), and `RYOKO_MAINNET_RPC_URL` / `RYOKO_TESTNET_RPC_URL` to give the share functions a private RPC.

### Sharing on X

When a Chog conquers a swamp, its holder sees a **New conquest** card the next time they open the Chog: the post is already written and **Post on X** opens it ready to send. The post links to `/s/<network>/<chog>/<swamp>`, whose preview is an image made for that Chog (`/api/og`): its name, tier, the swamp, the swamp's event, whether it rushed, the field note and its progress. Every conquered swamp in the record has its own **Post on X** button too. Posting stays one click by the holder, so no X account, API key or permission is needed.

### Wallets

The **Connect wallet** button opens a picker that lists every installed browser wallet that announces itself (EIP-6963: MetaMask, Rabby, Phantom, OKX, Backpack and others) by name and icon. On a phone with no wallet it offers to open the site inside the MetaMask or Phantom app. To add WalletConnect (QR code and mobile wallets), create a free project at [dashboard.reown.com](https://dashboard.reown.com), add the site's domain to the project's allowed domains, and set `VITE_WALLETCONNECT_PROJECT_ID` in Vercel, then redeploy.

The site works with any injected browser wallet (MetaMask, Rabby and others) and offers to switch to Monad.

## Testing instructions for judges (testnet)

On testnet a "day" lasts one minute, so a whole journey takes about 20 minutes.

1. Open the site, switch the header to **Testnet**, and connect a wallet. Get test MON from a Monad testnet faucet for gas.
2. Go to **My Chogs** and press **Mint a free test Chog** (up to 3 per wallet).
3. Open the Chog and press **Get 20,000 test CHOG**.
4. Type a name, choose how many ants to pack, keep **Let the Ryoko agent walk it for me** ticked, and press **Set off**. Your wallet asks for one free signature and one transaction.
5. Within a round the agent makes the Chog eat an ant and enter swamp 1. Its event (shortcut, fog, ant nest or relic) shows on the page. Press **Rush** to spend two ants and cut a minute off the stay.
6. When it conquers, a **New conquest** card appears with the post written and the share image. Watch the glow grow, the notes fill in and the leaderboard update. **Or travel by hand** does every step from your own wallet.
