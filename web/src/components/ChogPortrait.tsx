import { useState, type CSSProperties } from 'react';
import { SWAMPS } from '@ryoko/shared';
import { useChogMeta } from '../hooks';

interface Props {
  tokenId: bigint;
  /** 0-9 */
  glow: number;
  size?: number;
}

/**
 * The holder's real Chog art with a ring in its current glow colour. Gold and doubled at 9.
 * The token number shows until the art arrives (public IPFS gateways can take a few seconds),
 * and a gateway that fails hands over to the next one.
 */
export function ChogPortrait({ tokenId, glow, size = 96 }: Props) {
  const meta = useChogMeta(tokenId);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  // Start over when the same portrait is reused for another Chog.
  const [shownId, setShownId] = useState(tokenId);
  if (shownId !== tokenId) {
    setShownId(tokenId);
    setAttempt(0);
    setLoaded(false);
  }
  const color = glow > 0 ? `rgb(${SWAMPS[glow - 1]!.glow})` : 'transparent';
  const style = { '--glow': color, width: size, height: size } as CSSProperties;
  const src = meta.data?.images[attempt];
  return (
    <div className={`portrait glow-${glow}`} style={style}>
      <span className="portrait-fallback">#{tokenId.toString()}</span>
      {src && (
        <img
          key={src}
          src={src}
          alt={`Chog #${tokenId}`}
          loading="lazy"
          decoding="async"
          width={size}
          height={size}
          className={loaded ? 'is-loaded' : undefined}
          // A cached image can finish before the load listener sees it, so check on mount too.
          ref={(el) => {
            if (el?.complete && el.naturalWidth > 0) setLoaded(true);
          }}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setAttempt((a) => a + 1);
          }}
        />
      )}
    </div>
  );
}
