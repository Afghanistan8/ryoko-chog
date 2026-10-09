import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { readEnv } from './env';
import { makeWagmiConfig } from './wagmi';
import { NetworkProvider } from './network';
import { App } from './App';
import './styles.css';

const root = createRoot(document.getElementById('root')!);
const env = readEnv();

if (!env.ok) {
  root.render(
    <StrictMode>
      <main className="page">
        <section className="panel setup-error">
          <h1 className="display">Ryoko Chog is not configured</h1>
          <p>{env.error}</p>
          <p className="muted">
            Add the deployment to <code>packages/shared/src/deployments.ts</code>, or override it in{' '}
            <code>web/.env.local</code> (see <code>web/.env.example</code>).
          </p>
        </section>
      </main>
    </StrictMode>,
  );
} else {
  const wagmiConfig = makeWagmiConfig(env.network, import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim() || undefined);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 2 } },
  });
  root.render(
    <StrictMode>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <NetworkProvider network={env.network} available={env.available}>
            <App />
          </NetworkProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </StrictMode>,
  );
}
