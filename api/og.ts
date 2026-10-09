// GET /api/og?net=mainnet&id=123&swamp=4 -> a 1200x630 PNG share card for one conquered swamp.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from '@vercel/og';
import { loadShareData, parseQuery, type ShareData } from './_lib/chog.js';

type Child = Node | string | null | false;
interface Node {
  type: string;
  props: Record<string, unknown>;
}

/** Tiny element builder: Satori takes React-like objects, so no JSX setup is needed. */
function h(type: string, style: Record<string, unknown>, ...children: Child[]): Node {
  const kids = children.filter((c): c is Node | string => c !== null && c !== false);
  return { type, props: { style, children: kids.length === 1 ? kids[0] : kids } };
}

const INK = '#161616';
const PAPER = '#f1f0ea';
let font: Buffer | undefined;

function gluten(): Buffer {
  font ??= readFileSync(join(process.cwd(), 'api', '_assets', 'gluten-800.woff'));
  return font;
}

/** A little Chog: white body, purple star hood, tinted by the swamp's glow. */
function chogSvg(glow: string): string {
  const star = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? 46 : 28;
    return `${(60 + Math.cos(a) * r).toFixed(1)},${(52 + Math.sin(a) * r * 0.9).toFixed(1)}`;
  }).join(' ');
  return (
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150">` +
        `<circle cx="60" cy="80" r="58" fill="rgba(${glow},0.35)"/>` +
        `<ellipse cx="60" cy="142" rx="34" ry="7" fill="rgba(0,0,0,0.25)"/>` +
        `<ellipse cx="60" cy="106" rx="30" ry="31" fill="#fff" stroke="${INK}" stroke-width="5"/>` +
        `<polygon points="${star}" fill="#7a4ae0" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>` +
        `<ellipse cx="62" cy="58" rx="22" ry="19" fill="#fff" stroke="${INK}" stroke-width="5"/>` +
        `<circle cx="54" cy="56" r="3.6" fill="${INK}"/><circle cx="70" cy="56" r="3.6" fill="${INK}"/>` +
        `<circle cx="47" cy="64" r="4" fill="#f27bb0"/><circle cx="77" cy="64" r="4" fill="#f27bb0"/>` +
        `</svg>`,
    )
  );
}

function card(d: ShareData): Node {
  const done = d.conquered >= d.swamp;
  const chip = (text: string, bg: string, color = INK) =>
    h(
      'div',
      { display: 'flex', padding: '6px 16px', borderRadius: 999, border: `3px solid ${INK}`, background: bg, color, fontSize: 24 },
      text,
    );

  return h(
    'div',
    {
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: PAPER,
      padding: 36,
      fontFamily: 'Gluten',
      color: INK,
    },
    // Header
    h(
      'div',
      { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
      h('div', { display: 'flex', fontSize: 40 }, 'Ryoko ', h('span', { color: '#7a4ae0', marginLeft: 10 }, 'Chog')),
      h(
        'div',
        { display: 'flex', gap: 10 },
        chip(`Chog #${d.id}`, '#fff'),
        chip(d.tier, '#ffd23f'),
        d.net === 'testnet' ? chip('Testnet', '#ece4ff') : null,
      ),
    ),
    // Body
    h(
      'div',
      { display: 'flex', flex: 1, gap: 32, marginTop: 24 },
      // Swamp card
      h(
        'div',
        {
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: 470,
          padding: 28,
          borderRadius: 30,
          border: `5px solid ${INK}`,
          boxShadow: `8px 8px 0 ${INK}`,
          background: `linear-gradient(170deg, rgba(${d.swampGlow},0.45) 0%, #2a4d2e 40%, #0f2416 100%)`,
          color: '#f4fbe6',
        },
        h(
          'div',
          { display: 'flex' },
          h(
            'div',
            { display: 'flex', fontSize: 24, padding: '4px 14px', borderRadius: 999, background: 'rgba(8,20,10,0.75)', color: `rgb(${d.swampGlow})` },
            `SWAMP ${d.swamp} OF 9`,
          ),
        ),
        h('div', { display: 'flex', fontSize: 58, lineHeight: 1.05 }, d.swampName),
        h(
          'div',
          { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' },
          { type: 'img', props: { src: chogSvg(d.swampGlow), width: 150, height: 188 } },
          h(
            'div',
            { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 },
            d.eventLabel ? chip(d.eventLabel, `rgb(${d.swampGlow})`) : null,
            d.rushed ? chip('Rushed', '#fff') : null,
          ),
        ),
      ),
      // Story
      h(
        'div',
        { display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 18 },
        h('div', { display: 'flex', fontSize: 30, color: '#55544e' }, done ? 'conquered by' : 'on the way:'),
        h('div', { display: 'flex', fontSize: d.name.length > 12 ? 70 : 86, lineHeight: 1 }, d.name),
        d.note
          ? h(
              'div',
              {
                display: 'flex',
                padding: '18px 22px',
                background: '#fff',
                border: `4px solid ${INK}`,
                borderRadius: 22,
                boxShadow: `6px 6px 0 ${INK}`,
                fontSize: 27,
                lineHeight: 1.3,
              },
              `"${d.note}"`,
            )
          : null,
        h(
          'div',
          { display: 'flex', gap: 10, marginTop: 6 },
          ...Array.from({ length: 9 }, (_, i) =>
            h('div', {
              display: 'flex',
              width: 44,
              height: 18,
              borderRadius: 999,
              border: `3px solid ${INK}`,
              background: d.trail[i] ? `rgb(${d.trail[i]})` : '#e8e6dd',
            }),
          ),
        ),
      ),
    ),
    h(
      'div',
      { display: 'flex', justifyContent: 'space-between', marginTop: 22, fontSize: 24, color: '#55544e' },
      h('div', { display: 'flex' }, d.complete ? 'All nine swamps conquered. It glows gold.' : 'Every swamp burns $CHOG on Monad.'),
      h('div', { display: 'flex' }, 'ryoko-chog.vercel.app'),
    ),
  );
}

export async function GET(request: Request): Promise<Response> {
  const q = parseQuery(new URL(request.url).searchParams);
  if (!q) return new Response('Bad request: expected net, id and swamp.', { status: 400 });
  let data: ShareData | null;
  try {
    data = await loadShareData(q);
  } catch {
    return new Response('Could not read the journey right now.', { status: 502 });
  }
  if (!data) return new Response('This network is not deployed.', { status: 404 });

  return new ImageResponse(card(data) as never, {
    width: 1200,
    height: 630,
    fonts: [{ name: 'Gluten', data: gluten(), weight: 800, style: 'normal' }],
    headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
  });
}
