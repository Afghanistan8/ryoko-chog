import { EVENT_INFO, Status, glowLevel, displaySwamp, type JourneyView, type SwampEventValue } from '@ryoko/shared';

export type SwampState = 'done' | 'now' | 'locked';

/** Everything the 3D diorama needs to draw one Chog's journey. Indices are 0-8. */
export interface DioramaState {
  /** Swamps conquered, 0-9. */
  conquered: number;
  /** Swamp the Chog is working on (the "now" ring), 0-8. */
  target: number;
  /** Platform the Chog stands on, 0-8. */
  chogAt: number;
  complete: boolean;
  /** Glow level 0-9. */
  glow: number;
  /** False when the Chog has no journey yet. */
  started: boolean;
  /** Ants eaten this journey; an increase plays the eat-and-travel moment. */
  ants: number;
  /** Show ants marching toward the Chog (between swamps, with ants in its pouch). */
  antsComing: boolean;
  name: string;
  subtitle: string;
}

export function swampState(s: DioramaState, i: number): SwampState {
  if (i < s.conquered) return 'done';
  if (s.started && !s.complete && i === s.target) return 'now';
  return 'locked';
}

export function journeyToDiorama(view: JourneyView, opts: { name: string; glowName: string; antsInWallet: number }): DioramaState {
  const started = view.status !== Status.None;
  const complete = view.status === Status.Complete;
  const target = complete ? 8 : Math.min(8, Math.max(0, (started ? view.currentSwamp : 1) - 1));
  const chogAt = complete ? 8 : displaySwamp(view) - 1;
  const glow = glowLevel(view);
  let subtitle: string;
  if (!started) subtitle = 'Not travelling yet';
  else if (complete) subtitle = 'Gold · journey complete';
  else if (view.status === Status.Travelling) subtitle = `Heading for swamp ${view.conquered + 1}`;
  else {
    // A notable swamp event (shortcut, fog, ant nest, relic) says more than the glow colour.
    const lead = view.swampEvent > 1 ? EVENT_INFO[view.swampEvent as SwampEventValue].label : `${opts.glowName} glow`;
    subtitle = `${lead}${view.rushed ? ' · rushed' : ''} · swamp ${view.currentSwamp}`;
  }
  return {
    conquered: started ? view.conquered : 0,
    target,
    chogAt,
    complete,
    glow,
    started,
    ants: view.ants,
    antsComing: (view.status === Status.Travelling || view.status === Status.Expired) && opts.antsInWallet > 0,
    name: opts.name,
    subtitle,
  };
}
