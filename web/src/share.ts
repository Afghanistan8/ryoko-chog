import { SWAMPS, type NetworkName } from '@ryoko/shared';

export interface ShareInput {
  net: NetworkName;
  tokenId: bigint;
  /** 1-9 */
  swamp: number;
  name: string;
  /** Notable event of that swamp, e.g. "Relic", or empty. */
  eventLabel?: string;
  /** True when this conquest finished the journey. */
  complete?: boolean;
}

/** The post text. Kept well under X's 280 characters with the link added. */
export function shareText({ name, swamp, eventLabel, complete }: ShareInput): string {
  const s = SWAMPS[swamp - 1]!;
  if (complete) {
    return `${name} conquered all nine swamps in Ryoko Chog and now glows gold. Every swamp burned $CHOG on Monad.`;
  }
  const extra = eventLabel ? ` Event: ${eventLabel.toLowerCase()}.` : '';
  return `${name} just conquered ${s.name}, swamp ${swamp} of 9 in Ryoko Chog.${extra} Every swamp burns $CHOG on Monad.`;
}

export function shareLinks(input: ShareInput, origin = window.location.origin) {
  const page = `${origin}/s/${input.net}/${input.tokenId}/${input.swamp}`;
  const image = `${origin}/api/og?net=${input.net}&id=${input.tokenId}&swamp=${input.swamp}`;
  const intent = `https://twitter.com/intent/tweet?${new URLSearchParams({ text: shareText(input), url: page })}`;
  return { page, image, intent };
}
