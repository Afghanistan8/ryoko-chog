# Run the Ryoko agent on a VPS

The agent walks every Chog that appointed it: it feeds it an ant between swamps, waits out each
stay and conquers with a field note. It has to keep running, so it lives on a small always-on
server, not on a laptop. These steps are for Ubuntu or Debian with systemd. Any 1 vCPU / 1 GB
machine is plenty.

Each network runs as its own service (`ryoko-agent@testnet`, `ryoko-agent@mainnet`), restarts
by itself if it crashes or the server reboots, and can only write to its own folder.

## 0. Use a separate agent wallet

The agent's private key sits on the server, so give it a wallet of its own with only gas money
in it. Never put the contract owner's key on a server.

- Create a new wallet just for the agent.
- Send it some MON on each network it runs on (mainnet: about 0.05 MON per swamp per Chog;
  1-2 MON goes a long way. Testnet: MON from a faucet).
- Its address is the agent address in `packages/shared/src/deployments.ts` and the `RESETTER`
  when deploying.

## 1. Install Node.js 24

Use the official build and check its checksum.

```bash
cd /tmp
NODE=v24.21.0
curl -fsSLO https://nodejs.org/dist/$NODE/node-$NODE-linux-x64.tar.xz
curl -fsSLO https://nodejs.org/dist/$NODE/SHASUMS256.txt
grep " node-$NODE-linux-x64.tar.xz\$" SHASUMS256.txt | sha256sum -c -
sudo tar -xJf node-$NODE-linux-x64.tar.xz -C /usr/local --strip-components=1
node --version
```

The `sha256sum` line must print `OK`. On an ARM server use `linux-arm64` instead of `linux-x64`.

## 2. Get the code

```bash
sudo apt-get install -y git
sudo useradd --system --no-create-home --shell /usr/sbin/nologin ryoko
sudo mkdir /opt/ryoko-chog && sudo chown ryoko:ryoko /opt/ryoko-chog
sudo -u ryoko git clone https://github.com/Afghanistan8/ryoko-chog.git /opt/ryoko-chog
cd /opt/ryoko-chog
sudo -u ryoko npm ci --cache /tmp/ryoko-npm-cache
```

## 3. Add the settings

One file per network, readable only by the `ryoko` user. Replace the key with the agent
wallet's private key (64 hex characters, with or without `0x`).

```bash
sudo -u ryoko tee /opt/ryoko-chog/agent/.env.mainnet > /dev/null <<'EOF'
NETWORK=mainnet
JOURNEY_ADDRESS=<mainnet RyokoJourney address>
AGENT_PRIVATE_KEY=<agent private key>
POLL_SECONDS=30
EOF
sudo -u ryoko tee /opt/ryoko-chog/agent/.env.testnet > /dev/null <<'EOF'
NETWORK=testnet
JOURNEY_ADDRESS=<testnet RyokoJourney address>
TEST_CHOG_GENESIS=<testnet Chog Genesis (Test) address>
TEST_CHOG_TOKEN=<testnet Chog (Test) token address>
AGENT_PRIVATE_KEY=<agent private key>
POLL_SECONDS=15
EOF
sudo chmod 600 /opt/ryoko-chog/agent/.env.mainnet /opt/ryoko-chog/agent/.env.testnet
```

The addresses are in `packages/shared/src/deployments.ts` and the README.

Check a settings file before starting the service (one round, then exit):

```bash
cd /opt/ryoko-chog/agent && sudo -u ryoko node --import tsx src/index.ts --once --env .env.mainnet
```

It should log `Ryoko Chog agent starting` and `round done`.

## 4. Start the services

```bash
sudo cp /opt/ryoko-chog/deploy/ryoko-agent@.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ryoko-agent@mainnet ryoko-agent@testnet
systemctl status ryoko-agent@mainnet ryoko-agent@testnet --no-pager
```

## 5. Watch it

```bash
journalctl -u ryoko-agent@mainnet -f
```

Each round logs `round done` with what it did. `agent wallet is low on MON for gas` means it is
time to top up the agent wallet.

## Updating

```bash
cd /opt/ryoko-chog
sudo -u ryoko git pull
sudo -u ryoko npm ci --cache /tmp/ryoko-npm-cache
sudo systemctl restart ryoko-agent@mainnet ryoko-agent@testnet
```

## Stopping

```bash
sudo systemctl disable --now ryoko-agent@testnet
```

Holders can always travel by hand on the site, so a stopped agent never breaks a journey; it
only stops Chogs moving on their own. A stay can wait up to the 9-day deadline, so a few hours of
downtime costs nothing.
