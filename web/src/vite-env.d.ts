/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NETWORK?: string;
  readonly VITE_RPC_URL?: string;
  readonly VITE_JOURNEY_ADDRESS?: string;
  readonly VITE_AGENT_ADDRESS?: string;
  readonly VITE_TEST_CHOG_GENESIS?: string;
  readonly VITE_TEST_CHOG_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
