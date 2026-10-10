import type { NetworkName } from '@ryoko/shared';
import { useAvailableNetworks, useNetwork } from '../network';
import { switchNetwork } from '../env';

const LABEL: Record<NetworkName, string> = { mainnet: 'Mainnet', testnet: 'Testnet' };
const HINT: Record<NetworkName, string> = {
  mainnet: 'Real Chog Genesis and $CHOG. A day is a day.',
  testnet: 'Free test Chogs and test $CHOG. A day lasts a minute.',
};

/** Mainnet / Testnet toggle. Switching reloads the page on the other network. */
export function NetworkSwitch() {
  const net = useNetwork();
  const available = useAvailableNetworks();
  if (available.length < 2) return null;
  return (
    <div className="net-switch" role="group" aria-label="Network">
      {available.map((name) => (
        <button
          key={name}
          type="button"
          className={name === net.name ? 'on' : undefined}
          aria-pressed={name === net.name}
          title={HINT[name]}
          onClick={() => {
            if (name !== net.name) switchNetwork(name);
          }}
        >
          {LABEL[name]}
        </button>
      ))}
    </div>
  );
}
