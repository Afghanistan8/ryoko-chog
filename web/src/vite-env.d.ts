/// <reference types="vite/client" />

/**
 * All optional: addresses come from packages/shared/src/deployments.ts. These override them,
 * for example to point local development at a local chain.
 */
interface ImportMetaEnv {
  readonly VITE_MAINNET_JOURNEY?: string;
  readonly VITE_MAINNET_AGENT?: string;
  readonly VITE_MAINNET_RPC_URL?: string;
  readonly VITE_TESTNET_JOURNEY?: string;
  readonly VITE_TESTNET_AGENT?: string;
  readonly VITE_TESTNET_RPC_URL?: string;
  readonly VITE_TESTNET_CHOG_GENESIS?: string;
  readonly VITE_TESTNET_CHOG_TOKEN?: string;
  /** Free from dashboard.reown.com; turns on WalletConnect (QR code and mobile wallets). */
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
