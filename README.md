# Ryoko Chog

Every Chog gets its own wallet and its own agent, then travels through nine swamps on Monad.

To enter each swamp the Chog eats an ant: a fixed amount of $CHOG paid from the Chog's own wallet and burned. It stays at least two days, then conquers the swamp and writes a short field note on-chain. Each swamp has a nine-day deadline. The further a Chog gets, the brighter it glows, and it turns gold at swamp nine. Selling or moving the Chog resets its journey.

Built for Chogathon 2026.

## Why the Chog NFT is essential

- The Chog **is** the wallet. Each Chog has an ERC-6551 token-bound account, and the ants are paid from that account. Without the NFT there is no wallet, no agent and no journey.
- Progress belongs to the Chog and its holder. A new holder starts from swamp one, and the glow, notes and name reset.
- The site shows the holder's real Chog art with its current glow.

## How a journey works

| Step | Who | What happens |
|---|---|---|
| Start | Holder | `startJourney` creates the Chog's ERC-6551 account through the canonical registry. |
| Feed | Holder | Sends $CHOG to the Chog's account. One ant = `antPrice` (1,000 CHOG by default). |
| Appoint | Holder | `authorize(agent, CHOG, max)` on the Chog's account. |
| Travel | Agent, through the Chog's account | `travel()` burns one ant (sends it to `0x…dEaD`) and enters the next swamp. |
| Conquer | Agent, through the Chog's account | After `minStay`, `conquer(note)` stores the field note. The next leg starts. |

Rules enforced on-chain by `RyokoJourney`:

- Each swamp is a leg with a deadline of `legDuration` (9 days on mainnet). The Chog must eat, stay `minStay` (2 days), and conquer before the deadline.
- Miss the deadline and that swamp restarts: the next ant re-enters the same swamp. Earlier swamps stay conquered.
- A Chog can't enter a swamp so late that the minimum stay would overrun the deadline (`TooLateToEnter`), so an ant is never wasted that way.
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
web/              React + Vite site: animated swamps, holder flow, leaderboard
scripts/          ABI export and fork-test helpers
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
| Batch reads | `getJourneys` for 100 Chogs used about 4.3M gas on a mainnet fork, under the 8.1M low-gas eth_call pool of the public RPCs. |
| `eth_getLogs` | `rpc.monad.xyz` allows 100 blocks per call; the agent reads transfers in 100-block windows. |

## Trust model

- **The agent can only call the journey contract.** `RyokoAccount.execute` lets the appointed agent call `journey` with zero value and nothing else, so it cannot move the Chog's tokens or NFTs. Its appointment stops working the moment the Chog changes hands.
- **The journey contract never holds funds.** It pulls exactly one ant per `travel` from the Chog's account and sends it to the burn address.
- **The admin** (owner of `RyokoJourney`) can change `antPrice` and set the resetter. Ownership transfer is two-step. The admin cannot move anyone's tokens or edit journeys.
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

- `test:contracts`: 58 unit and fuzz tests under Monad EVM rules.
- `test:fork`: runs against real Chog Genesis and $CHOG on a Monad mainnet fork.
- `npm test`: agent decision rules, the note writer, and the site's formatting and name checks.

## Deploy

The deploy script refuses unknown chains and checks the registry's code hash before deploying.

- **Testnet** deploys free test versions of Chog Genesis and CHOG, with a 2-minute stay and a 9-minute leg so a full journey fits in a demo. Override with `MIN_STAY` and `LEG_DURATION` in seconds.
- **Mainnet** uses the real Chog Genesis and $CHOG, with 2 days and 9 days.

Run from the `contracts` folder. Set `OWNER` (admin) and `RESETTER` (the agent's address), plus optionally `ANT_PRICE` in wei. Use your own key management; the example uses an interactive key prompt.

```bash
forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast --interactives 1 --sender <your address>
```

```bash
forge script script/Deploy.s.sol --rpc-url monad --broadcast --interactives 1 --sender <your address>
```

The script prints the addresses. If `OWNER` differs from the deployer, the owner must call `acceptOwnership()`.

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

It reads every Chog's journey each round. For Chogs that appointed it, it eats an ant when the Chog is fed and in time, and conquers once the stay is over. If it is the resetter, it also reports Chogs sent away and back. Use `DRY_RUN=true` to simulate without sending.

## Run the site

`npm run dev:web` uses `web/.env.local` (copy it from `web/.env.example`; testnet here). `npm run build:web` uses the committed `web/.env.production`, which points at the mainnet deployment.

```bash
npm run dev:web
```

```bash
npm run build:web
```

### Vercel

`vercel.json` holds the build settings: install with `npm ci` at the repository root, build the `web` workspace and serve `web/dist`. Import the repository with the Root Directory left as the repository root. No environment variables are needed for mainnet. Setting `VITE_NETWORK`, `VITE_JOURNEY_ADDRESS`, `VITE_AGENT_ADDRESS` or `VITE_RPC_URL` in Vercel overrides `web/.env.production`.

The site works with any injected browser wallet (MetaMask, Rabby and others) and offers to switch to Monad.

## Testing instructions for judges (testnet)

1. Open the site and connect a wallet on Monad testnet. Get test MON from a Monad testnet faucet for gas.
2. Go to **My Chogs** and press **Mint a free test Chog** (up to 3 per wallet).
3. Open the Chog. Register a name first, then press **Start journey**, **Get 20,000 test CHOG**, and **Send 3,000 CHOG** to feed it three ants.
4. Press **Appoint agent**. Within a round, the agent makes the Chog eat an ant and enter swamp 1. On testnet a "day" is one minute, so it conquers after about two minutes and writes a field note.
5. Watch the glow change, the notes fill in and the leaderboard update. **Or travel by hand** does the same steps from your wallet if you want to drive it yourself.
