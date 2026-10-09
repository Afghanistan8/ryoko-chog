import type { CSSProperties } from 'react';
import { SWAMPS } from '@ryoko/shared';
import { useChogMeta } from '../hooks';

interface Props {
  tokenId: bigint;
  /** 0-9 */
  glow: number;
  size?: number;
}

/** The holder's real Chog art with a ring in its current glow colour. Gold and doubled at 9. */
export function ChogPortrait({ tokenId, glow, size = 96 }: Props) {
  const meta = useChogMeta(tokenId);
  const color = glow > 0 ? `rgb(${SWAMPS[glow - 1]!.glow})` : 'transparent';
  const style = { '--glow': color, width: size, height: size } as CSSProperties;
  return (
    <div className={`portrait glow-${glow}`} style={style}>
      {meta.data?.image ? (
        <img src={meta.data.image} alt={`Chog #${tokenId}`} loading="lazy" width={size} height={size} />
      ) : (
        <span className="portrait-fallback">#{tokenId.toString()}</span>
      )}
    </div>
  );
}
