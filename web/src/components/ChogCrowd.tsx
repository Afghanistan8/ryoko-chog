import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '../hooks';

const PHRASES = ['gm', 'ribbit', 'ants?', 'wen gold', 'chog', 'swamp time', 'hm', 'yum', '9 swamps', 'lfg', 'burn it', 'glow up'];

interface Walker {
  /** -1 left of the title, 1 right of it. */
  side: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  speed: number;
  wait: number;
  phase: number;
  dir: number;
  say: string | null;
  sayFor: number;
}

/** Little ink-drawn Chogs wandering the paper behind the front-page title. */
export function ChogCrowd() {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let w = 1, h = 1, raf = 0, last = performance.now(), visible = true;
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    // Each Chog keeps to its own side of the title so none walks across the text. On a narrow
    // screen the title takes the full width, so the crowd strolls along the bottom instead.
    const narrow = () => w < 700;
    const target = (side: number): [number, number] => {
      if (narrow()) return [rand(0.05, 0.95), rand(0.9, 0.97)];
      const x = rand(0.04, 0.22);
      return [side < 0 ? x : 1 - x, rand(0.1, 0.95)];
    };
    let walkers: Walker[] = [];
    const populate = () => {
      const n = narrow() ? 9 : 30;
      walkers = Array.from({ length: n }, (_, i) => {
        const side = i % 2 ? 1 : -1;
        const [x, y] = target(side);
        const [tx, ty] = target(side);
        return { side, x, y, tx, ty, speed: rand(0.018, 0.034), wait: rand(0, 3), phase: rand(0, 6), dir: 1, say: null, sayFor: 0 };
      });
    };

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const d = Math.min(2, window.devicePixelRatio || 1);
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      canvas.width = Math.round(w * d);
      canvas.height = Math.round(h * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      if (walkers.length !== (narrow() ? 9 : 30)) populate();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver((e) => (visible = Boolean(e[0]?.isIntersecting)));
    io.observe(canvas);
    resize();

    const drawChog = (px: number, py: number, s: number, dir: number, step: number) => {
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(s * dir, s);
      ctx.fillStyle = 'rgba(0,0,0,.13)';
      ctx.beginPath();
      ctx.ellipse(0, 1, 10, 3.2, 0, 0, 7);
      ctx.fill();
      ctx.strokeStyle = '#161616';
      ctx.lineWidth = 1.6;
      ctx.lineJoin = 'round';
      const lift = Math.max(0, Math.sin(step)) * 2.2, lift2 = Math.max(0, -Math.sin(step)) * 2.2;
      ctx.fillStyle = '#161616';
      ctx.beginPath();
      ctx.ellipse(-3.5, -1 - lift, 2.6, 1.8, 0, 0, 7);
      ctx.ellipse(3.5, -1 - lift2, 2.6, 1.8, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(0, -9, 7.2, 7.4, 0, 0, 7);
      ctx.fill();
      ctx.stroke();
      // star hood
      const hy = -20, R = 11.5, r2 = 7;
      ctx.fillStyle = '#7a4ae0';
      ctx.beginPath();
      for (let j = 0; j < 5; j++) {
        const a1 = -Math.PI / 2 + (j * 2 * Math.PI) / 5, a2 = a1 + Math.PI / 5;
        const x1 = Math.cos(a1) * R, y1 = hy + Math.sin(a1) * R * 0.9;
        if (j === 0) ctx.moveTo(x1, y1);
        else ctx.lineTo(x1, y1);
        ctx.quadraticCurveTo(Math.cos(a1 + Math.PI / 10) * R * 0.78, hy + Math.sin(a1 + Math.PI / 10) * R * 0.78, Math.cos(a2) * r2, hy + Math.sin(a2) * r2);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(0.5, hy + 1.5, 5.6, 5, 0, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#161616';
      ctx.beginPath();
      ctx.arc(-1.5, hy + 0.8, 0.95, 0, 7);
      ctx.arc(2.6, hy + 0.8, 0.95, 0, 7);
      ctx.fill();
      ctx.fillStyle = 'rgba(242,123,176,.85)';
      ctx.beginPath();
      ctx.arc(-3.4, hy + 3, 1.05, 0, 7);
      ctx.arc(4.4, hy + 3, 1.05, 0, 7);
      ctx.fill();
      ctx.restore();
    };

    const bubble = (px: number, py: number, text: string) => {
      ctx.font = '700 12px Nunito, system-ui, sans-serif';
      const tw = ctx.measureText(text).width;
      const bw = tw + 16, bh = 22, bx = px - bw / 2, by = py - bh;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#161616';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 7);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px - 4, by + bh - 0.5);
      ctx.lineTo(px, by + bh + 5);
      ctx.lineTo(px + 4, by + bh - 0.5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(px - 3.2, by + bh - 2.2, 6.4, 2.6);
      ctx.fillStyle = '#161616';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, px, by + bh / 2 + 0.5);
    };

    const draw = (dt: number) => {
      ctx.clearRect(0, 0, w, h);
      const scale = Math.max(1.1, Math.min(1.7, w / 760));
      for (const c of walkers) {
        if (!reduced) {
          if (c.wait > 0) {
            c.wait -= dt;
          } else {
            const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
            if (d < 0.004) {
              c.wait = rand(1, 4);
              [c.tx, c.ty] = target(c.side);
            } else {
              c.x += (dx / d) * c.speed * dt;
              c.y += (dy / d) * c.speed * dt * 1.4;
              c.dir = dx < 0 ? -1 : 1;
              c.phase += dt * 11;
            }
          }
          if (c.say) {
            c.sayFor -= dt;
            if (c.sayFor <= 0) c.say = null;
          } else if (Math.random() < dt * 0.025) {
            c.say = PHRASES[Math.floor(Math.random() * PHRASES.length)]!;
            c.sayFor = rand(1.8, 3.2);
          }
        }
      }
      const sorted = [...walkers].sort((a, b) => a.y - b.y);
      for (const c of sorted) {
        const s = scale * (0.82 + c.y * 0.4);
        drawChog(c.x * w, c.y * h, s, c.dir, c.wait > 0 || reduced ? 0 : c.phase);
      }
      for (const c of sorted) {
        if (c.say) bubble(c.x * w, c.y * h - 34 * scale * (0.82 + c.y * 0.4), c.say);
      }
    };

    if (reduced) {
      walkers.slice(0, 4).forEach((c, i) => (c.say = PHRASES[i]!));
      draw(0);
    }
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (visible && !reduced) draw(dt);
    };
    raf = requestAnimationFrame(frame);
    const redrawStatic = () => reduced && draw(0);
    window.addEventListener('resize', redrawStatic);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('resize', redrawStatic);
    };
  }, [reduced]);

  return <canvas ref={ref} className="crowd" aria-hidden="true" />;
}
