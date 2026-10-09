/**
 * Canvas renderer for the nine swamps. Draws parallax scenery, water reflections, fog,
 * fireflies and a travelling Chog whose glow follows its progress.
 * Logical canvas is 960x540; it scales to the element's width.
 */

const W = 960;
const H = 540;
const WATER = 318;
const SPAN = 2400;

export const GLOW = [
  '143,207,106',
  '99,207,120',
  '63,207,160',
  '63,181,201',
  '139,124,240',
  '176,108,240',
  '232,162,58',
  '240,184,46',
  '255,210,63',
] as const;

interface SceneStyle {
  sky: [string, string, string];
  moon?: { x: number; y: number; r: number; c: string };
  far: string;
  mid: string;
  water: string;
  mud: string;
  mudHi: string;
  pad: string;
  fog: string;
  fogN: number;
  fogA: number;
  ff: number;
  ffC: string;
  lilies: number;
  reeds: number;
  moss: string;
  mangrove?: boolean;
  toad?: boolean;
  peat?: boolean;
  cath?: boolean;
  rays?: boolean;
}

const STYLES: SceneStyle[] = [
  { sky: ['#1b2419', '#2c3824', '#4a5233'], moon: { x: 720, y: 105, r: 30, c: '220,230,190' }, far: '#25301f', mid: '#121910', water: '#1a2a20', mud: '#231d13', mudHi: '#3b301e', pad: '#2e4a25', fog: '200,215,170', fogN: 7, fogA: 0.1, ff: 8, ffC: '190,230,120', lilies: 6, reeds: 14, moss: '#3f4e2c' },
  { sky: ['#211f15', '#363220', '#5a5130'], moon: { x: 250, y: 90, r: 26, c: '235,215,160' }, far: '#2c2a1a', mid: '#16150d', water: '#262a17', mud: '#271f12', mudHi: '#3d321c', pad: '#4f4a1f', fog: '210,200,150', fogN: 7, fogA: 0.09, ff: 5, ffC: '220,220,120', lilies: 26, reeds: 10, moss: '#4a4426' },
  { sky: ['#070b14', '#0f1a22', '#1c2d2a'], moon: { x: 820, y: 70, r: 16, c: '200,225,255' }, far: '#0f1a1c', mid: '#070d0e', water: '#0b1716', mud: '#17140e', mudHi: '#2a2417', pad: '#1f3a24', fog: '150,190,170', fogN: 5, fogA: 0.07, ff: 80, ffC: '214,255,120', lilies: 7, reeds: 16, moss: '#1c2b22' },
  { sky: ['#0a1a1d', '#123033', '#245250'], moon: { x: 180, y: 120, r: 24, c: '190,240,230' }, far: '#123131', mid: '#071718', water: '#0e2a2a', mud: '#1c1a13', mudHi: '#302b1e', pad: '#22473a', fog: '160,220,210', fogN: 8, fogA: 0.1, ff: 12, ffC: '140,255,230', lilies: 6, reeds: 8, moss: '#18403a', mangrove: true },
  { sky: ['#120d1f', '#21183a', '#3a2a52'], moon: { x: 690, y: 95, r: 22, c: '220,200,255' }, far: '#1e1733', mid: '#0e0a19', water: '#171329', mud: '#1d1720', mudHi: '#33283a', pad: '#2c3a3a', fog: '170,150,220', fogN: 7, fogA: 0.09, ff: 36, ffC: '190,160,255', lilies: 4, reeds: 10, moss: '#2b2245', toad: true },
  { sky: ['#2a2c35', '#41444f', '#62656c'], far: '#3a3d46', mid: '#22242b', water: '#2a2d33', mud: '#26231f', mudHi: '#3a3631', pad: '#3f4a40', fog: '215,217,225', fogN: 18, fogA: 0.16, ff: 0, ffC: '255,255,255', lilies: 6, reeds: 12, moss: '#4a4d50' },
  { sky: ['#050404', '#100c09', '#21170f'], moon: { x: 760, y: 120, r: 20, c: '255,120,60' }, far: '#140f0b', mid: '#060403', water: '#0d0907', mud: '#120d09', mudHi: '#24190f', pad: '#2a2412', fog: '130,85,50', fogN: 6, fogA: 0.08, ff: 22, ffC: '255,150,60', lilies: 0, reeds: 12, moss: '#20160d', peat: true },
  { sky: ['#14121c', '#2a2230', '#4d3a33'], moon: { x: 480, y: 80, r: 20, c: '255,210,170' }, far: '#221c26', mid: '#0f0c13', water: '#191520', mud: '#1d1714', mudHi: '#332822', pad: '#2c3a28', fog: '200,170,140', fogN: 8, fogA: 0.1, ff: 14, ffC: '255,190,100', lilies: 4, reeds: 8, moss: '#2a2128', cath: true },
  { sky: ['#2b220e', '#6b4f1c', '#d39a3a'], moon: { x: 760, y: 150, r: 52, c: '255,222,140' }, far: '#4a3a17', mid: '#231a0a', water: '#3a2c12', mud: '#33260f', mudHi: '#57401b', pad: '#5a5a20', fog: '255,220,150', fogN: 8, fogA: 0.1, ff: 46, ffC: '255,215,90', lilies: 10, reeds: 12, moss: '#5a4520', rays: true },
];

interface Layout {
  far: { x: number; h: number; w: number }[];
  mid: { x: number; h: number; w: number; roots: number }[];
  lil: { x: number; y: number; rx: number; ph: number; fl: boolean }[];
  reeds: { x: number; h: number; ph: number; cat: boolean }[];
  toad: { x: number; h: number; back: boolean; c: string; ph: number }[];
  cath: { x: number; w: number; h: number }[];
  fog: { x: number; y: number; rx: number; ry: number; sp: number; front: boolean }[];
  ff: { x: number; y: number; ph: number; sp: number; vx: number; vy: number }[];
  pud: { x: number; w: number; d: number }[];
  tufts: { x: number; h: number; l: boolean }[];
}

function rng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hexA = (h: string, a: number) => {
  const n = parseInt(h.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const rgba = (c: string, a: number) => `rgba(${c},${a})`;
const wrapX = (v: number) => (((v % SPAN) + SPAN) % SPAN) - 200;

function buildLayout(i: number): Layout {
  const s = STYLES[i]!;
  const r = rng(1000 + i * 77);
  const o: Layout = { far: [], mid: [], lil: [], reeds: [], toad: [], cath: [], fog: [], ff: [], pud: [], tufts: [] };
  for (let j = 0; j < 34; j++) o.far.push({ x: r() * SPAN, h: 110 + r() * 120, w: 28 + r() * 40 });
  for (let j = 0; j < 16; j++) o.mid.push({ x: r() * SPAN, h: 170 + r() * 140, w: 40 + r() * 50, roots: 3 + Math.floor(r() * 4) });
  for (let j = 0; j < s.lilies; j++) o.lil.push({ x: r() * SPAN, y: WATER + 18 + r() * 92, rx: 10 + r() * 16, ph: r() * 6, fl: r() < 0.3 });
  for (let j = 0; j < s.reeds; j++) o.reeds.push({ x: r() * SPAN, h: 70 + r() * 110, ph: r() * 6, cat: r() < 0.6 });
  if (s.toad) for (let j = 0; j < 18; j++) o.toad.push({ x: r() * SPAN, h: 10 + r() * 20, back: r() < 0.5, c: r() < 0.5 ? '120,240,220' : '200,150,255', ph: r() * 6 });
  if (s.cath) for (let j = 0; j < 4; j++) o.cath.push({ x: j * 600 + r() * 200, w: 170 + r() * 80, h: 190 + r() * 80 });
  for (let j = 0; j < s.fogN; j++) o.fog.push({ x: r() * W * 1.3 - 100, y: WATER - 70 + r() * 180, rx: 160 + r() * 220, ry: 26 + r() * 40, sp: 6 + r() * 14, front: r() < 0.4 });
  for (let j = 0; j < s.ff; j++) o.ff.push({ x: r() * W, y: 50 + r() * (H - 130), ph: r() * 6, sp: 0.4 + r() * 0.8, vx: (r() - 0.5) * 14, vy: (r() - 0.5) * 8 });
  for (let j = 0; j < 6; j++) o.pud.push({ x: r() * SPAN, w: 26 + r() * 44, d: r() });
  for (let j = 0; j < 90; j++) o.tufts.push({ x: r() * SPAN, h: 4 + r() * 9, l: r() < 0.5 });
  return o;
}

type Mode = 'idle' | 'eat' | 'walkout' | 'fadeout' | 'fadein' | 'walkin';

interface Particle { x: number; y: number; vx: number; vy: number; life: number; s: number; c: string }
interface Floater { x: number; y: number; txt: string; life: number; size: number }

export interface SceneOptions {
  reducedMotion?: boolean;
  /** Text shown on the ant, e.g. "1,000 CHOG". */
  antLabel?: string;
}

export class SwampScene {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly amb: number;
  private k = 1;
  private T = 0;
  private camX = 0;
  private fade = 0;
  private raf = 0;
  private last = 0;
  private running = false;
  private ro: ResizeObserver | undefined;
  private grain: CanvasPattern | null = null;

  private swamp = 0;
  private glow = 0;
  private complete = false;
  private layout: Layout;

  private mode: Mode = 'idle';
  private mt = 0;
  private chogX = 300;
  private wp = 0;
  private mouth = 0;
  private antX: number | null = null;
  private pending: { swamp: number; glow: number; complete: boolean } | null = null;
  private onDone: (() => void) | null = null;

  private readonly ripples: { x: number; y: number; r: number; a: number }[] = [];
  private readonly bubbles: { x: number; y: number; r: number; max: number }[] = [];
  private readonly embers: Particle[] = [];
  private readonly floats: Floater[] = [];
  private ripT = 0;
  private bubT = 0;
  private antLabel: string;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    opts: SceneOptions = {},
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available');
    this.ctx = ctx;
    this.amb = opts.reducedMotion ? 0 : 1;
    this.antLabel = opts.antLabel ?? '';
    this.layout = buildLayout(0);
    this.makeGrain();
    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(canvas);
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  destroy(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
  }

  setAntLabel(label: string): void {
    this.antLabel = label;
  }

  /** Show a swamp immediately (no animation). swamp: 1-9, glow: 0-9. */
  show(swamp: number, glow: number, complete: boolean): void {
    this.swamp = clampSwamp(swamp);
    this.glow = Math.max(0, Math.min(9, glow));
    this.complete = complete;
    this.layout = buildLayout(this.swamp);
    this.mode = 'idle';
    this.fade = 0;
    this.chogX = 300;
    this.antX = null;
    this.ripples.length = 0;
    this.bubbles.length = 0;
  }

  /** Fade to another swamp with the Chog walking out and back in. */
  goTo(swamp: number, glow: number, complete: boolean, onDone?: () => void): void {
    this.pending = { swamp: clampSwamp(swamp), glow, complete };
    this.onDone = onDone ?? null;
    this.setMode(this.amb ? 'walkout' : 'fadeout');
  }

  /** The Chog eats an ant (burn effect), then walks to the given swamp. */
  eatAndTravel(swamp: number, glow: number, complete: boolean, onDone?: () => void): void {
    this.pending = { swamp: clampSwamp(swamp), glow, complete };
    this.onDone = onDone ?? null;
    this.antX = this.chogX + 300;
    this.setMode('eat');
  }

  /** Gold burst for a finished journey. */
  celebrate(): void {
    this.burst(this.chogX, this.bankY(this.chogX) - 50, 120, ['255,210,63', '255,236,160', '240,184,46']);
    this.floats.push({ x: this.chogX, y: this.bankY(this.chogX) - 110, txt: 'Journey complete', life: 2.2, size: 20 });
  }

  get busy(): boolean {
    return this.mode !== 'idle';
  }

  // ------------------------------------------------------------------

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(2, Math.round(rect.width * dpr));
    this.canvas.width = w;
    this.canvas.height = Math.max(2, Math.round((rect.width * 9) / 16 * dpr));
    this.k = w / W;
  }

  private makeGrain(): void {
    const n = document.createElement('canvas');
    n.width = n.height = 128;
    const c = n.getContext('2d');
    if (!c) return;
    const d = c.createImageData(128, 128);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = Math.random() * 255;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
      d.data[i + 3] = 255;
    }
    c.putImageData(d, 0, 0);
    this.grain = this.ctx.createPattern(n, 'repeat');
  }

  private setMode(m: Mode): void {
    this.mode = m;
    this.mt = 0;
  }

  private bankY(x: number): number {
    const w = x + this.camX;
    return 436 + 7 * Math.sin(w * 0.011) + 3 * Math.sin(w * 0.037 + 1.3);
  }

  private burst(x: number, y: number, n: number, colors: string[]): void {
    for (let j = 0; j < n; j++) {
      this.embers.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 70,
        vy: -40 - Math.random() * 90,
        life: 1 + Math.random() * 0.6,
        s: 1.2 + Math.random() * 2.4,
        c: colors[j % colors.length]!,
      });
    }
  }

  private update(dt: number): void {
    this.T += dt;
    const s = STYLES[this.swamp]!;
    const amb = this.amb;
    if (this.mode === 'idle') this.camX += dt * 8 * amb;
    this.mt += dt;

    if (this.mode === 'eat') {
      const startX = this.chogX + 300;
      const endX = this.chogX + 30;
      const p = Math.min(1, this.mt / 1.4);
      if (this.antX !== null) this.antX = startX + (endX - startX) * p;
      this.mouth = this.mt > 1.15 && this.mt < 1.75 ? Math.min(1, (this.mt - 1.15) * 6) : Math.max(0, this.mouth - dt * 5);
      if (this.mt > 1.45 && this.antX !== null) {
        this.antX = null;
        this.burst(this.chogX + 6, this.bankY(this.chogX) - 30, 40, ['255,210,63', '170,130,255', '255,150,60']);
        if (this.antLabel) this.floats.push({ x: this.chogX, y: this.bankY(this.chogX) - 100, txt: `-${this.antLabel} burned`, life: 1.8, size: 16 });
      }
      if (this.mt > 2.1) this.setMode(amb ? 'walkout' : 'fadeout');
    } else if (this.mode === 'walkout') {
      this.wp += dt * 11;
      this.chogX += dt * 170;
      this.camX += dt * 90;
      if (this.chogX > W + 70) this.setMode('fadeout');
    } else if (this.mode === 'fadeout') {
      this.fade = Math.min(1, this.mt / 0.6);
      if (this.mt >= 0.65) {
        const p = this.pending;
        if (p) {
          this.swamp = p.swamp;
          this.glow = p.glow;
          this.complete = p.complete;
        }
        this.layout = buildLayout(this.swamp);
        this.ripples.length = 0;
        this.bubbles.length = 0;
        this.camX = 0;
        this.chogX = amb ? -60 : 300;
        this.setMode('fadein');
      }
    } else if (this.mode === 'fadein') {
      this.fade = Math.max(0, 1 - this.mt / 0.9);
      if (this.mt >= 0.9) {
        this.fade = 0;
        this.setMode(amb ? 'walkin' : 'idle');
        if (!amb) this.finish();
      }
    } else if (this.mode === 'walkin') {
      this.wp += dt * 11;
      this.chogX = Math.min(300, this.chogX + dt * 150);
      if (this.chogX >= 300) {
        this.setMode('idle');
        this.finish();
      }
    }

    for (const f of this.layout.fog) {
      f.x += f.sp * dt * amb;
      if (f.x - f.rx > W) f.x = -f.rx;
    }
    for (const f of this.layout.ff) {
      f.x += (f.vx + Math.sin(this.T * f.sp + f.ph) * 10) * dt * amb;
      f.y += (f.vy + Math.cos(this.T * f.sp * 1.3 + f.ph) * 6 + (s.rays || s.peat ? -6 : 0)) * dt * amb;
      if (f.x < -10) f.x = W + 10;
      if (f.x > W + 10) f.x = -10;
      if (f.y < 30) f.y = H - 90;
      if (f.y > H - 60) f.y = 40;
    }
    this.ripT += dt * amb;
    if (this.ripT > 0.45) {
      this.ripT = 0;
      this.ripples.push({ x: Math.random() * W, y: WATER + 14 + Math.random() * 95, r: 2, a: 1 });
    }
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i]!;
      r.r += dt * 14;
      r.a -= dt * 0.5;
      if (r.a <= 0) this.ripples.splice(i, 1);
    }
    if (s.peat) {
      this.bubT += dt * amb;
      if (this.bubT > 0.18) {
        this.bubT = 0;
        this.bubbles.push({ x: Math.random() * W, y: WATER + 20 + Math.random() * 95, r: 0, max: 3 + Math.random() * 7 });
      }
    }
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i]!;
      b.r += dt * 5;
      if (b.r >= b.max) {
        this.ripples.push({ x: b.x, y: b.y, r: b.r, a: 1 });
        this.bubbles.splice(i, 1);
      }
    }
    for (let i = this.embers.length - 1; i >= 0; i--) {
      const e = this.embers[i]!;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.vy += 20 * dt;
      e.life -= dt * 0.8;
      if (e.life <= 0) this.embers.splice(i, 1);
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i]!;
      f.y -= dt * 24;
      f.life -= dt * 0.6;
      if (f.life <= 0) this.floats.splice(i, 1);
    }
  }

  private finish(): void {
    this.pending = null;
    const cb = this.onDone;
    this.onDone = null;
    cb?.();
  }

  // ------------------------------------------------------------------
  // Drawing
  // ------------------------------------------------------------------

  private draw(): void {
    const ctx = this.ctx;
    const s = STYLES[this.swamp]!;
    const o = this.layout;
    const T = this.T;
    const amb = this.amb;
    ctx.setTransform(this.k, 0, 0, this.k, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    const g = ctx.createLinearGradient(0, 0, 0, WATER + 10);
    g.addColorStop(0, s.sky[0]);
    g.addColorStop(0.65, s.sky[1]);
    g.addColorStop(1, s.sky[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, WATER + 12);

    if (s.moon) {
      const m = s.moon;
      const gg = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * 6);
      gg.addColorStop(0, rgba(m.c, 0.32));
      gg.addColorStop(1, rgba(m.c, 0));
      ctx.fillStyle = gg;
      ctx.fillRect(0, 0, W, WATER);
      ctx.fillStyle = rgba(m.c, 0.88);
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (s.rays) {
      ctx.globalCompositeOperation = 'lighter';
      for (let j = 0; j < 8; j++) {
        const a = 1.75 + j * 0.13;
        const a2 = a + 0.05;
        ctx.fillStyle = `rgba(255,210,120,${0.035 + 0.02 * Math.sin(T * 0.5 + j)})`;
        ctx.beginPath();
        ctx.moveTo(760, 150);
        ctx.lineTo(760 + Math.cos(a) * 1100, 150 + Math.sin(a) * 1100);
        ctx.lineTo(760 + Math.cos(a2) * 1100, 150 + Math.sin(a2) * 1100);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    for (const f of o.far) {
      const x = wrapX(f.x - this.camX * 0.18);
      if (x < -120 || x > W + 120) continue;
      this.tree(x, WATER + 2, f.h, f.w, s.far, null, 0);
    }
    ctx.fillStyle = hexA(s.sky[2], 0.22);
    ctx.fillRect(0, 0, W, WATER + 2);
    if (s.cath) {
      for (const c of o.cath) {
        const x = wrapX(c.x - this.camX * 0.32);
        if (x < -300 || x > W + 60) continue;
        this.cathedral(c, x, WATER + 4, s.mid);
      }
    }
    for (const m of o.mid) {
      const x = wrapX(m.x - this.camX * 0.42);
      if (x < -170 || x > W + 170) continue;
      this.tree(x, WATER + 4, m.h, m.w, s.mid, s.moss, 1);
      if (s.mangrove) this.roots(x, WATER + 4, m, s.mid);
    }
    ctx.fillStyle = s.mid;
    ctx.fillRect(0, WATER - 2, W, 6);
    if (s.toad) {
      for (const t of o.toad) {
        if (!t.back) continue;
        const x = wrapX(t.x - this.camX * 0.5);
        if (x < -40 || x > W + 40) continue;
        this.toadstool(x, WATER + 2, t.h * 0.6, t.c, t.ph);
      }
    }

    // Water reflection: copy the scenery above the waterline, flipped, in thin wavy strips.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const wy = Math.round(WATER * this.k);
    const bh = Math.round((H - WATER) * this.k);
    const strip = Math.max(2, Math.round(3 * this.k));
    ctx.globalAlpha = 0.34;
    for (let off = 0; off < bh; off += strip) {
      const sy = wy - off - strip;
      if (sy < 0) break;
      const dx = Math.sin(T * 1.6 * amb + (off * 0.09) / this.k) * 2 * this.k * (off / bh + 0.25);
      ctx.drawImage(this.canvas, 0, sy, this.canvas.width, strip, dx, wy + off, this.canvas.width, strip);
    }
    ctx.restore();

    const wg = ctx.createLinearGradient(0, WATER, 0, H);
    wg.addColorStop(0, hexA(s.water, 0.5));
    wg.addColorStop(1, hexA(s.water, 0.95));
    ctx.fillStyle = wg;
    ctx.fillRect(0, WATER, W, H - WATER);
    ctx.strokeStyle = 'rgba(255,255,255,.05)';
    ctx.lineWidth = 1;
    for (let j = 0; j < 14; j++) {
      const y = WATER + 8 + j * 8;
      const x0 = (((j * 173 + T * 12 * amb * (j % 2 ? 1 : -1)) % W) + W) % W;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + 40 + j * 3, y);
      ctx.stroke();
    }
    for (const r of this.ripples) {
      ctx.strokeStyle = `rgba(255,255,255,${r.a * 0.22})`;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.r, r.r * 0.3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const l of o.lil) {
      const p = 0.55 + ((l.y - WATER) / (H - WATER)) * 0.45;
      const x = wrapX(l.x - this.camX * p);
      const y = l.y + Math.sin(T * 1.2 * amb + l.ph) * 1.2;
      if (x < -40 || x > W + 40) continue;
      ctx.fillStyle = s.pad;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.ellipse(x, y, l.rx, l.rx * 0.34, 0, 0.3, Math.PI * 2 - 0.05);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.08)';
      ctx.beginPath();
      ctx.ellipse(x, y, l.rx, l.rx * 0.34, 0, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      if (l.fl) {
        ctx.fillStyle = '#e9a2c6';
        ctx.beginPath();
        ctx.arc(x + l.rx * 0.3, y - 3, 3, 0, Math.PI * 2);
        ctx.arc(x + l.rx * 0.3 + 3, y - 2, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const b of this.bubbles) {
      ctx.strokeStyle = 'rgba(255,170,90,.55)';
      ctx.fillStyle = 'rgba(40,25,15,.8)';
      ctx.beginPath();
      ctx.arc(b.x, b.y - b.r * 0.5, b.r, Math.PI, 0);
      ctx.fill();
      ctx.stroke();
    }
    this.fog(false, s);

    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) ctx.lineTo(x, this.bankY(x));
    ctx.lineTo(W, H);
    ctx.closePath();
    const bg = ctx.createLinearGradient(0, 424, 0, H);
    bg.addColorStop(0, s.mudHi);
    bg.addColorStop(0.35, s.mud);
    bg.addColorStop(1, '#050504');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = hexA(s.mudHi, 0.95);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 8) {
      if (x) ctx.lineTo(x, this.bankY(x));
      else ctx.moveTo(x, this.bankY(x));
    }
    ctx.stroke();
    for (const p of o.pud) {
      const x = wrapX(p.x - this.camX);
      if (x < -60 || x > W + 60) continue;
      const y = this.bankY(x) + 28 + p.d * 40;
      ctx.fillStyle = hexA(s.water, 0.95);
      ctx.beginPath();
      ctx.ellipse(x, y, p.w, 5 + p.d * 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = s.moss;
    ctx.lineWidth = 1.4;
    for (const t of o.tufts) {
      const x = wrapX(t.x - this.camX);
      if (x < -10 || x > W + 10) continue;
      const y = this.bankY(x) + 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 2 + (t.l ? -3 : 3), y - t.h);
      ctx.moveTo(x + 2, y);
      ctx.lineTo(x + 3, y - t.h * 0.7);
      ctx.stroke();
    }
    if (s.toad) {
      for (const t of o.toad) {
        if (t.back) continue;
        const x = wrapX(t.x - this.camX);
        if (x < -40 || x > W + 40) continue;
        this.toadstool(x, this.bankY(x) + 6, t.h, t.c, t.ph);
      }
    }

    const walking = this.mode === 'walkout' || this.mode === 'walkin';
    this.chog(this.chogX, this.bankY(this.chogX) + 16, this.complete ? 9 : this.glow, walking);
    if (this.antX !== null) this.ant(this.antX, this.bankY(this.antX) + 14);

    ctx.globalCompositeOperation = 'lighter';
    for (const e of this.embers) {
      ctx.fillStyle = rgba(e.c, Math.max(0, e.life));
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'center';
    for (const f of this.floats) {
      ctx.font = `600 ${f.size}px "Chakra Petch", sans-serif`;
      ctx.fillStyle = `rgba(255,226,140,${Math.max(0, Math.min(1, f.life))})`;
      ctx.fillText(f.txt, f.x, f.y);
    }
    for (const r of o.reeds) {
      const x = wrapX(r.x - this.camX * 1.35);
      if (x < -40 || x > W + 40) continue;
      const base = H + 10;
      const top = base - r.h;
      const sw = Math.sin(T * 1.1 * amb + r.ph) * 6;
      ctx.strokeStyle = '#070806';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, base);
      ctx.quadraticCurveTo(x + sw * 0.3, base - r.h * 0.5, x + sw, top);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 4, base);
      ctx.quadraticCurveTo(x + 10, base - r.h * 0.4, x + 18 + sw, top + r.h * 0.35);
      ctx.stroke();
      if (r.cat) {
        ctx.fillStyle = '#24180c';
        ctx.beginPath();
        ctx.ellipse(x + sw, top + 4, 3.6, 11, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (o.ff.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (const f of o.ff) {
        const a = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(T * 2.2 * f.sp + f.ph));
        const gg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 9);
        gg.addColorStop(0, rgba(s.ffC, a * 0.9));
        gg.addColorStop(1, rgba(s.ffC, 0));
        ctx.fillStyle = gg;
        ctx.fillRect(f.x - 9, f.y - 9, 18, 18);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    this.fog(true, s);
    const v = ctx.createRadialGradient(W / 2, H / 2, 210, W / 2, H / 2, 640);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,.66)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
    if (this.grain) {
      ctx.save();
      ctx.globalAlpha = 0.07;
      ctx.translate(amb ? -Math.random() * 128 : 0, amb ? -Math.random() * 128 : 0);
      ctx.fillStyle = this.grain;
      ctx.fillRect(0, 0, W + 256, H + 256);
      ctx.restore();
    }
    if (this.fade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${this.fade})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  private fog(front: boolean, s: SceneStyle): void {
    const ctx = this.ctx;
    for (const f of this.layout.fog) {
      if (f.front !== front) continue;
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.scale(1, f.ry / f.rx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, f.rx);
      g.addColorStop(0, rgba(s.fog, s.fogA * (front ? 0.6 : 1)));
      g.addColorStop(1, rgba(s.fog, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, f.rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private tree(x: number, base: number, h: number, w: number, col: string, moss: string | null, sway: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.2, base);
    ctx.quadraticCurveTo(x - w * 0.05, base - h * 0.5, x - w * 0.09, base - h * 0.82);
    ctx.lineTo(x + w * 0.09, base - h * 0.82);
    ctx.quadraticCurveTo(x + w * 0.05, base - h * 0.5, x + w * 0.22, base);
    ctx.closePath();
    ctx.fill();
    for (let j = 0; j < 5; j++) {
      const a = j / 4;
      ctx.beginPath();
      ctx.ellipse(x + (a - 0.5) * w * 1.6, base - h * 0.82 - Math.sin(a * Math.PI) * h * 0.12, w * 0.56, h * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (moss) {
      ctx.strokeStyle = moss;
      ctx.lineWidth = 1.6;
      for (let j = 0; j < 7; j++) {
        const mx = x + (j / 6 - 0.5) * w * 1.5;
        const my = base - h * 0.76;
        const len = h * (0.14 + ((j * 37 + Math.round(x)) % 10) / 45);
        const sw = Math.sin(this.T * 0.8 * this.amb + j + x * 0.01) * sway;
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.quadraticCurveTo(mx + sw * 4, my + len * 0.5, mx + sw * 7, my + len);
        ctx.stroke();
      }
    }
  }

  private roots(x: number, base: number, m: { h: number; w: number; roots: number }, col: string): void {
    const ctx = this.ctx;
    ctx.strokeStyle = col;
    ctx.lineWidth = 5;
    for (let j = 0; j < m.roots; j++) {
      const off = (j / (m.roots - 1) - 0.5) * m.w * 1.8;
      ctx.beginPath();
      ctx.moveTo(x + off * 0.1, base - m.h * 0.3);
      ctx.quadraticCurveTo(x + off * 1.15, base - m.h * 0.32, x + off, base + 14);
      ctx.stroke();
    }
  }

  private arch(x: number, base: number, w: number, h: number): void {
    const ctx = this.ctx;
    ctx.moveTo(x, base);
    ctx.lineTo(x, base - h * 0.6);
    ctx.quadraticCurveTo(x, base - h, x + w / 2, base - h * 1.05);
    ctx.quadraticCurveTo(x + w, base - h, x + w, base - h * 0.6);
    ctx.lineTo(x + w, base);
    ctx.closePath();
  }

  private cathedral(c: { x: number; w: number; h: number }, x: number, base: number, col: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = col;
    ctx.beginPath();
    this.arch(x, base, c.w, c.h);
    ctx.fill();
    ctx.fillRect(x + c.w * 0.42, base - c.h * 1.35, c.w * 0.16, c.h * 0.4);
    [0.2, 0.5, 0.8].forEach((j, n) => {
      const ww = c.w * 0.12;
      const wh = c.h * 0.32;
      const wx = x + c.w * j - ww / 2;
      const wy = base - c.h * 0.52;
      const f = 0.5 + 0.3 * Math.sin(this.T * 3 * this.amb + n * 2 + c.x);
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(wx + ww / 2, wy - wh * 0.5, 0, wx + ww / 2, wy - wh * 0.5, wh * 1.4);
      g.addColorStop(0, `rgba(255,170,80,${f * 0.35})`);
      g.addColorStop(1, 'rgba(255,170,80,0)');
      ctx.fillStyle = g;
      ctx.fillRect(wx - wh, wy - wh * 2, ww + wh * 2, wh * 3);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(255,185,100,${f})`;
      ctx.beginPath();
      this.arch(wx, wy, ww, wh);
      ctx.fill();
    });
  }

  private toadstool(x: number, y: number, h: number, c: string, ph: number): void {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';
    const p = 0.6 + 0.4 * Math.sin(this.T * 2 * this.amb + ph);
    const g = ctx.createRadialGradient(x, y - h, 0, x, y - h, h * 2.4);
    g.addColorStop(0, rgba(c, 0.35 * p));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - h * 2.5, y - h * 3.5, h * 5, h * 5);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#d9d2c0';
    ctx.fillRect(x - h * 0.12, y - h, h * 0.24, h);
    ctx.fillStyle = rgba(c, 0.95);
    ctx.beginPath();
    ctx.ellipse(x, y - h, h * 0.6, h * 0.36, 0, Math.PI, 0);
    ctx.fill();
  }

  private chog(x: number, y: number, g: number, walk: boolean): void {
    const ctx = this.ctx;
    const T = this.T;
    if (g > 0) {
      const c = GLOW[g - 1]!;
      const a = (0.12 + g * 0.035) * (this.complete ? 1.5 : 1);
      const rad = 58 + g * 7;
      ctx.globalCompositeOperation = 'lighter';
      const pul = 1 + 0.06 * Math.sin(T * 2.4);
      const gr = ctx.createRadialGradient(x, y - 44, 0, x, y - 44, rad * pul);
      gr.addColorStop(0, rgba(c, a));
      gr.addColorStop(0.45, rgba(c, a * 0.45));
      gr.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = gr;
      ctx.fillRect(x - rad * 1.2, y - 44 - rad * 1.2, rad * 2.4, rad * 2.4);
      if (g === 9) {
        for (let j = 0; j < 10; j++) {
          const an = T * 0.6 * this.amb + (j * Math.PI) / 5;
          const rr = 54 + 6 * Math.sin(T * 3 + j);
          ctx.fillStyle = `rgba(255,225,120,${0.5 + 0.4 * Math.sin(T * 4 + j)})`;
          ctx.beginPath();
          ctx.arc(x + Math.cos(an) * rr, y - 46 + Math.sin(an) * rr * 0.8, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 26, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    const bob = walk ? Math.abs(Math.sin(this.wp)) * -4 : Math.sin(T * 2) * 1.2;
    const l1 = walk ? Math.max(0, Math.sin(this.wp)) * -5 : 0;
    const l2 = walk ? Math.max(0, -Math.sin(this.wp)) * -5 : 0;
    ctx.fillStyle = '#f27bb0';
    ctx.strokeStyle = '#2a1550';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x - 10, y - 5 + l1, 8, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x + 10, y - 5 + l2, 8, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const by = y + bob;
    ctx.fillStyle = '#6a3fd0';
    ctx.beginPath();
    ctx.ellipse(x, by - 28, 21, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const sw = walk ? Math.sin(this.wp) * 4 : Math.sin(T * 1.5) * 1.5;
    ctx.fillStyle = '#f27bb0';
    ctx.beginPath();
    ctx.ellipse(x - 22, by - 30 + sw, 6, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x + 22, by - 30 - sw, 6, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const hx = x;
    const hy = by - 60;
    const R = 35;
    const r2 = 21;
    ctx.fillStyle = '#7a4ae0';
    ctx.beginPath();
    for (let j = 0; j < 5; j++) {
      const a1 = -Math.PI / 2 + (j * 2 * Math.PI) / 5 + Math.sin(T * 1.2 + j) * 0.04;
      const a2 = a1 + Math.PI / 5;
      const px = hx + Math.cos(a1) * R;
      const py = hy + Math.sin(a1) * R * 0.92;
      if (j === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
      ctx.quadraticCurveTo(hx + Math.cos(a1 + Math.PI / 10) * R * 0.75, hy + Math.sin(a1 + Math.PI / 10) * R * 0.75, hx + Math.cos(a2) * r2, hy + Math.sin(a2) * r2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (g >= 3) {
      ctx.strokeStyle = rgba(GLOW[g - 1]!, Math.min(0.9, 0.2 + g * 0.08));
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.strokeStyle = '#2a1550';
      ctx.lineWidth = 2;
    }
    ctx.fillStyle = '#fbf8ff';
    ctx.beginPath();
    ctx.ellipse(hx, hy + 5, 17, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1a1030';
    ctx.beginPath();
    ctx.ellipse(hx - 6, hy + 2, 2.3, 3.2, 0, 0, Math.PI * 2);
    ctx.ellipse(hx + 6, hy + 2, 2.3, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(242,123,176,.75)';
    ctx.beginPath();
    ctx.arc(hx - 11, hy + 9, 3.2, 0, Math.PI * 2);
    ctx.arc(hx + 11, hy + 9, 3.2, 0, Math.PI * 2);
    ctx.fill();
    if (this.mouth > 0.05) {
      ctx.fillStyle = '#3a1020';
      ctx.beginPath();
      ctx.ellipse(hx, hy + 12, 3 + this.mouth * 3, 2 + this.mouth * 4, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = '#1a1030';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(hx, hy + 10, 3, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }
  }

  private ant(x: number, y: number): void {
    const ctx = this.ctx;
    const t = this.T * 14;
    ctx.strokeStyle = '#120c08';
    ctx.lineWidth = 1.4;
    for (let j = 0; j < 3; j++) {
      const lx = x - 4 + j * 4;
      const sw = Math.sin(t + j * 2) * 3;
      ctx.beginPath();
      ctx.moveTo(lx, y - 4);
      ctx.lineTo(lx - 3 + sw, y + 2);
      ctx.moveTo(lx, y - 4);
      ctx.lineTo(lx + 3 - sw, y + 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#1d140d';
    ctx.beginPath();
    ctx.ellipse(x + 8, y - 5, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x - 1, y - 5, 4, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x - 8, y - 6, 4.2, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 10, y - 9);
    ctx.quadraticCurveTo(x - 16, y - 16, x - 19, y - 14);
    ctx.moveTo(x - 8, y - 10);
    ctx.quadraticCurveTo(x - 11, y - 18, x - 15, y - 18);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,210,63,.9)';
    ctx.beginPath();
    ctx.arc(x + 9, y - 7, 1.8, 0, Math.PI * 2);
    ctx.fill();
    if (this.antLabel) {
      ctx.font = '600 12px "Chakra Petch", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,226,140,.95)';
      ctx.fillText(this.antLabel, x, y - 22);
    }
  }
}

function clampSwamp(n: number): number {
  return Math.min(8, Math.max(0, Math.trunc(n) - 1));
}
