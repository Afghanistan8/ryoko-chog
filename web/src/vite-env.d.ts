/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NETWORK?: string;
  readonly VITE_RPC_URL?: string;
  readonly VITE_JOURNEY_ADDRESS?: string;
  readonly VITE_AGENT_ADDRESS?: string;
  readonly VITE_TEST_CHOG_GENESIS?: string;
  readonly VITE_TEST_CHOG_TOKEN?: string;
  /** Optional. Free from dashboard.reown.com; turns on WalletConnect (QR code and mobile wallets). */
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
