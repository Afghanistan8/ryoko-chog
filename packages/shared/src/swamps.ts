export interface Swamp {
  /** 1-9 */
  number: number;
  name: string;
  mood: string;
  /** Glow the Chog wears once it reaches this swamp, as "r,g,b". */
  glow: string;
  glowName: string;
}

export const SWAMPS: readonly Swamp[] = [
  { number: 1, name: 'Murkwater Shallows', mood: 'Mud, reeds and a pale moon', glow: '143,207,106', glowName: 'Moss spark' },
  { number: 2, name: 'Lily Rot Bog', mood: 'Rotting lily pads everywhere', glow: '99,207,120', glowName: 'Bog green' },
  { number: 3, name: 'Firefly Fen', mood: 'A night sky full of fireflies', glow: '63,207,160', glowName: 'Fen green' },
  { number: 4, name: 'Sunken Mangrove', mood: 'Roots arching into black water', glow: '63,181,201', glowName: 'Mangrove teal' },
  { number: 5, name: 'Toadstool Hollow', mood: 'Glowing mushrooms and spores', glow: '139,124,240', glowName: 'Spore violet' },
  { number: 6, name: 'Mist Marsh', mood: 'Fog so thick you lose your feet', glow: '176,108,240', glowName: 'Mist violet' },
  { number: 7, name: 'Black Peat Mire', mood: 'Bubbling peat and embers', glow: '232,162,58', glowName: 'Peat amber' },
  { number: 8, name: 'Drowned Cathedral', mood: 'Ruined arches, flickering windows', glow: '240,184,46', glowName: 'Cathedral amber' },
  { number: 9, name: 'The Golden Mire', mood: 'Light breaking through at last', glow: '255,210,63', glowName: 'Gold' },
] as const;

export const SWAMP_COUNT = 9;

export function swampByNumber(n: number): Swamp {
  const s = SWAMPS[Math.min(Math.max(Math.trunc(n), 1), SWAMP_COUNT) - 1];
  if (!s) throw new Error(`no swamp ${n}`);
  return s;
}
