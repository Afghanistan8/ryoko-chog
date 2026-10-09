import { useEffect, useRef, useState } from 'react';
import { useAccount, useConnect, useDisconnect, useSwitchChain, type Connector } from 'wagmi';
import { useNetwork } from '../network';
import { errorText, shortAddress } from '../format';

const INSTALL_LINKS = [
  { name: 'MetaMask', href: 'https://metamask.io/download/' },
  { name: 'Rabby', href: 'https://rabby.io/' },
  { name: 'Phantom', href: 'https://phantom.com/download' },
];

function isMobile(): boolean {
  return typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Links that open this page inside a wallet app's own browser, where its wallet is available. */
function openInAppLinks(): { name: string; href: string }[] {
  const url = window.location.href;
  const noProtocol = url.replace(/^https?:\/\//, '');
  return [
    { name: 'MetaMask', href: `https://metamask.app.link/dapp/${noProtocol}` },
    {
      name: 'Phantom',
      href: `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(window.location.origin)}`,
    },
  ];
}

/**
 * The wallets to offer: every wallet that announced itself (EIP-6963), plus the plain browser
 * wallet only when nothing announced itself but window.ethereum exists, plus WalletConnect.
 */
function walletChoices(connectors: readonly Connector[]): Connector[] {
  const announced = connectors.filter((c) => c.type === 'injected' && c.id !== 'injected');
  const plain = connectors.find((c) => c.id === 'injected');
  const hasLegacy = typeof window !== 'undefined' && Boolean((window as { ethereum?: unknown }).ethereum);
  const seen = new Set<string>();
  const out: Connector[] = [];
  for (const c of announced) {
    const key = c.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  if (out.length === 0 && plain && hasLegacy) out.push(plain);
  const wc = connectors.find((c) => c.type === 'walletConnect');
  if (wc) out.push(wc);
  return out;
}

export function ConnectButton() {
  const net = useNetwork();
  const { address, isConnected, chainId, connector: active } = useAccount();
  const { connectors, connectAsync, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, switchChainAsync } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const choose = async (c: Connector) => {
    setError(null);
    setBusy(c.uid);
    try {
      // WalletConnect shows its own QR window; close ours so it isn't hidden underneath.
      if (c.type === 'walletConnect') setOpen(false);
      const res = await connectAsync({ connector: c });
      setOpen(false);
      if (res.chainId !== net.chain.id) {
        try {
          await switchChainAsync({ chainId: net.chain.id });
        } catch {
          // The "Switch to Monad" button stays on screen for another try.
        }
      }
    } catch (err) {
      setOpen(true);
      const rejected =
        (err as { name?: string; code?: number } | null)?.name === 'UserRejectedRequestError' ||
        (err as { code?: number } | null)?.code === 4001;
      setError(rejected ? 'Connection cancelled. Pick a wallet to try again.' : errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const choices = walletChoices(connectors);
  const mobile = isMobile();

  let trigger;
  if (isConnected && address) {
    trigger =
      chainId !== net.chain.id ? (
        <button type="button" className="btn" onClick={() => switchChain({ chainId: net.chain.id })}>
          Switch to {net.chain.name}
        </button>
      ) : (
        <button type="button" className="btn ghost addr" onClick={() => setOpen(true)} aria-haspopup="dialog">
          {active?.icon && <img className="wallet-icon" src={active.icon} alt="" width={20} height={20} />}
          {shortAddress(address)}
        </button>
      );
  } else {
    trigger = (
      <button
        type="button"
        className="btn ghost"
        aria-haspopup="dialog"
        aria-busy={isPending}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {isPending ? 'Connecting…' : 'Connect wallet'}
      </button>
    );
  }

  return (
    <div className="connect">
      {trigger}
      <dialog
        ref={dialogRef}
        className="wallet-dialog"
        aria-labelledby="wallet-h"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          // A click on the backdrop (the dialog element itself) closes it.
          if (e.target === e.currentTarget) setOpen(false);
        }}
      >
        <div className="wallet-box">
          <div className="row between">
            <h2 id="wallet-h" className="display">
              {isConnected ? 'Your wallet' : 'Connect a wallet'}
            </h2>
            <button type="button" className="wallet-close" aria-label="Close" onClick={() => setOpen(false)}>
              ×
            </button>
          </div>

          {isConnected && address ? (
            <>
              <p className="wallet-current">
                {active?.icon && <img className="wallet-icon" src={active.icon} alt="" width={28} height={28} />}
                <span>
                  <b>{active?.name ?? 'Wallet'}</b>
                  <br />
                  <code>{shortAddress(address)}</code>
                </span>
              </p>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  disconnect();
                  setOpen(false);
                }}
              >
                Disconnect
              </button>
            </>
          ) : (
            <>
              <p className="muted small tight">Pick the wallet that holds your Chog. You will join {net.chain.name}.</p>
              {choices.length > 0 && (
                <ul className="wallet-list">
                  {choices.map((c) => (
                    <li key={c.uid}>
                      <button type="button" className="wallet-option" disabled={busy !== null} onClick={() => void choose(c)}>
                        {c.icon ? (
                          <img className="wallet-icon" src={c.icon} alt="" width={32} height={32} />
                        ) : (
                          <span className="wallet-icon wallet-icon-blank" aria-hidden="true">
                            {c.type === 'walletConnect' ? 'WC' : '◎'}
                          </span>
                        )}
                        <span className="wallet-name">
                          {c.type === 'walletConnect' ? 'WalletConnect' : c.id === 'injected' ? 'Browser wallet' : c.name}
                          <small>
                            {busy === c.uid
                              ? 'Check your wallet…'
                              : c.type === 'walletConnect'
                                ? 'QR code or mobile wallet'
                                : 'Installed'}
                          </small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {choices.every((c) => c.type === 'walletConnect') &&
                (mobile ? (
                  <div className="wallet-help">
                    <p className="small tight">
                      <b>On a phone?</b> Open this page inside your wallet app:
                    </p>
                    <div className="row wrap">
                      {openInAppLinks().map((l) => (
                        <a key={l.name} className="btn ghost" href={l.href} rel="noopener noreferrer">
                          Open in {l.name}
                        </a>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="wallet-help">
                    <p className="small tight">
                      <b>No browser wallet found.</b> Install one that supports Monad, then reload this page:
                    </p>
                    <div className="row wrap">
                      {INSTALL_LINKS.map((l) => (
                        <a key={l.name} className="btn ghost" href={l.href} target="_blank" rel="noopener noreferrer">
                          {l.name}
                        </a>
                      ))}
                    </div>
                  </div>
                ))}

              {error && (
                <p className="err" role="alert">
                  {error}
                </p>
              )}
            </>
          )}
        </div>
      </dialog>
    </div>
  );
}
