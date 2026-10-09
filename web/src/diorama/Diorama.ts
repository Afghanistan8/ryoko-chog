import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SWAMPS } from '@ryoko/shared';
import { swampState, type DioramaState } from './state';

/**
 * The nine-swamp diorama: a lantern-lit boardwalk over dark water, glowing trees and lily pads,
 * fog over locked swamps, the "Ryoko Chogster Swamps" backdrop, and the Chog on its platform.
 * Swamp tags and the Chog's name plate are HTML elements placed over the canvas every frame,
 * so they stay sharp and readable at any zoom.
 *
 * Inline, the scene only answers taps (choose a swamp). Interactive mode (full screen) adds
 * drag to look around and wheel or pinch to zoom.
 */

const NODES: [number, number][] = [
  [-26, 14], [-16, 8], [-20, -2], [-10, -9], [2, -4], [10, 6], [20, 1], [16, -10], [27, -15],
];
const LENS_SHIFT = 1.22;
const PHI_MIN = 0.82, PHI_MAX = 1.18, TH_MAX = 0.75, RAD_MIN = 26, RAD_MAX = 78;
/** Starting guess for the centre of the nine swamps; fitOverview() refines it for the canvas shape. */
const OVERVIEW = new THREE.Vector3(0.5, 0, -0.5);
/** Share of the half-screen the boardwalk fills in the centred view. */
const FIT = 0.84;
const LOCKED = '#6e6a58', NOW = '#8f63ff', GOLD = '#ffd23f';

function rng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (ctx) draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

function drawChog(x: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  x.save();
  x.translate(cx, cy);
  x.scale(s, s);
  x.fillStyle = '#f27bb0';
  x.strokeStyle = '#2a1550';
  x.lineWidth = 2;
  for (const dx of [-10, 10]) {
    x.beginPath();
    x.ellipse(dx, -5, 8, 5.5, 0, 0, 7);
    x.fill();
    x.stroke();
  }
  x.fillStyle = '#6a3fd0';
  x.beginPath();
  x.ellipse(0, -28, 21, 20, 0, 0, 7);
  x.fill();
  x.stroke();
  x.fillStyle = '#f27bb0';
  for (const dx of [-22, 22]) {
    x.beginPath();
    x.ellipse(dx, -30, 6, 7, 0, 0, 7);
    x.fill();
    x.stroke();
  }
  const hy = -60, R2 = 35, r2 = 21;
  x.fillStyle = '#7a4ae0';
  x.beginPath();
  for (let j = 0; j < 5; j++) {
    const a1 = -Math.PI / 2 + (j * 2 * Math.PI) / 5, a2 = a1 + Math.PI / 5;
    const px = Math.cos(a1) * R2, py = hy + Math.sin(a1) * R2 * 0.92;
    if (j === 0) x.moveTo(px, py);
    else x.lineTo(px, py);
    x.quadraticCurveTo(Math.cos(a1 + Math.PI / 10) * R2 * 0.75, hy + Math.sin(a1 + Math.PI / 10) * R2 * 0.75, Math.cos(a2) * r2, hy + Math.sin(a2) * r2);
  }
  x.closePath();
  x.fill();
  x.stroke();
  x.fillStyle = '#fbf8ff';
  x.beginPath();
  x.ellipse(0, hy + 5, 17, 15, 0, 0, 7);
  x.fill();
  x.stroke();
  x.fillStyle = '#1a1030';
  x.beginPath();
  x.ellipse(-6, hy + 2, 2.3, 3.2, 0, 0, 7);
  x.ellipse(6, hy + 2, 2.3, 3.2, 0, 0, 7);
  x.fill();
  x.fillStyle = 'rgba(242,123,176,.75)';
  x.beginPath();
  x.arc(-11, hy + 9, 3.2, 0, 7);
  x.arc(11, hy + 9, 3.2, 0, 7);
  x.fill();
  x.strokeStyle = '#1a1030';
  x.lineWidth = 1.5;
  x.beginPath();
  x.arc(0, hy + 10, 3, 0.2, Math.PI - 0.2);
  x.stroke();
  x.restore();
}

interface Particle {
  sprite: THREE.Sprite;
  v: THREE.Vector3;
  life: number;
}

export interface DioramaOptions {
  reducedMotion: boolean;
  onSelect: (index: number) => void;
}

export class Diorama {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.5, 400);
  private readonly nodes = NODES.map(([x, z]) => new THREE.Vector3(x, 0, z));
  private readonly curve: THREE.CatmullRomCurve3;
  private readonly clock = new THREE.Clock();
  private readonly amb: number;
  private readonly disposables: { dispose: () => void }[] = [];

  private readonly rings: THREE.Mesh<THREE.TorusGeometry, THREE.MeshStandardMaterial>[] = [];
  private readonly hits: THREE.Mesh[] = [];
  private readonly fogs: { s: THREE.Sprite; i: number; base: THREE.Vector3; ph: number }[] = [];
  private readonly ants: THREE.Sprite[] = [];
  private readonly treeLights: THREE.PointLight[] = [];
  private readonly particles: Particle[] = [];
  private readonly chog: THREE.Sprite;
  private readonly chogGlow: THREE.Sprite;
  private readonly chogLight: THREE.PointLight;
  private readonly title: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly titleCanvas = document.createElement('canvas');
  private readonly titleTex: THREE.CanvasTexture;
  private readonly sparkTex: THREE.CanvasTexture;
  private readonly glowTex: THREE.CanvasTexture;
  private readonly ffGeo: THREE.BufferGeometry;
  private readonly ffMat: THREE.PointsMaterial;
  private readonly ffBase: number[][] = [];
  private readonly tags: HTMLButtonElement[] = [];
  private readonly plate: HTMLDivElement;

  private state: DioramaState | null = null;
  private selected = 0;
  private interactive = false;
  private visible = true;
  private raf = 0;
  private readonly target = OVERVIEW.clone();
  private readonly focus = OVERVIEW.clone();
  /** Centred view of the whole boardwalk, fitted to the canvas in resize(). */
  private readonly overview = OVERVIEW.clone();
  private overviewRadius = 60;
  private centred = true;
  private theta = 0;
  private phi = 1.02;
  private radius = 60;
  private chogU = 0;
  private travel: { from: number; to: number; t: number; dur: number } | null = null;
  private drag: { x: number; y: number; moved: number; th: number; ph: number } | null = null;
  private pinch: { d: number; r: number } | null = null;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private readonly ro: ResizeObserver | undefined;
  private readonly io: IntersectionObserver | undefined;
  private readonly cleanup: (() => void)[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly overlay: HTMLElement,
    private readonly opts: DioramaOptions,
  ) {
    this.amb = opts.reducedMotion ? 0 : 1;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const scene = this.scene;
    scene.background = new THREE.Color('#06080a');
    scene.fog = new THREE.FogExp2('#06080a', 0.0135);
    const R = rng(42);
    const N = this.nodes;
    const track = <T extends { dispose: () => void }>(o: T): T => {
      this.disposables.push(o);
      return o;
    };

    // Materials and textures
    const planksTex = track(canvasTex(256, 256, (x, w) => {
      for (let i = 0; i < 8; i++) {
        const v = 70 + Math.random() * 40;
        x.fillStyle = `rgb(${(v + 40) | 0},${(v + 10) | 0},${(v - 25) | 0})`;
        x.fillRect(0, i * 32, w, 31);
        x.fillStyle = 'rgba(0,0,0,.35)';
        x.fillRect(0, i * 32 + 30, w, 2);
        for (let k = 0; k < 24; k++) {
          x.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
          x.fillRect(Math.random() * w, i * 32 + Math.random() * 30, 40 + Math.random() * 80, 1);
        }
      }
    }));
    planksTex.wrapS = planksTex.wrapT = THREE.RepeatWrapping;
    const woodMat = track(new THREE.MeshStandardMaterial({ color: '#b48c5e', map: planksTex, roughness: 0.85 }));
    const plankMat = track(new THREE.MeshStandardMaterial({ color: '#c29a68', roughness: 0.85 }));
    const postMat = track(new THREE.MeshStandardMaterial({ color: '#3a2a1a', roughness: 0.95 }));
    const lampMat = track(new THREE.MeshStandardMaterial({ color: '#2a2a2a', emissive: '#ffd08a', emissiveIntensity: 3.2 }));
    const barkMat = track(new THREE.MeshStandardMaterial({ color: '#6b4a2e', roughness: 0.95, flatShading: true }));
    const mudMat = track(new THREE.MeshStandardMaterial({ color: '#2b2a17', roughness: 1, flatShading: true }));
    const grassMat = track(new THREE.MeshStandardMaterial({ color: '#5f9a2f', emissive: '#244a0c', emissiveIntensity: 0.6, roughness: 0.8, flatShading: true }));
    const padMat = track(new THREE.MeshStandardMaterial({ color: '#62e36a', emissive: '#24b543', emissiveIntensity: 0.95, roughness: 0.5, side: THREE.DoubleSide }));
    const coreMat = track(new THREE.MeshStandardMaterial({ color: '#24451a', emissive: '#1d3d0e', emissiveIntensity: 0.6, roughness: 0.9 }));

    // Water with a faint sky reflection and drifting sparkles
    const pmrem = track(new THREE.PMREMGenerator(this.renderer));
    const envTex = track(canvasTex(512, 256, (x, w, h) => {
      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#0a1218');
      g.addColorStop(0.45, '#14231a');
      g.addColorStop(0.5, '#2a3a1c');
      g.addColorStop(1, '#030405');
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        const cx = Math.random() * w, cy = h * 0.3 + Math.random() * h * 0.18, r = 10 + Math.random() * 30;
        const gg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        gg.addColorStop(0, 'rgba(170,240,90,.55)');
        gg.addColorStop(1, 'rgba(170,240,90,0)');
        x.fillStyle = gg;
        x.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
    }));
    envTex.mapping = THREE.EquirectangularReflectionMapping;
    const env = track(pmrem.fromEquirectangular(envTex)).texture;
    const waterMat = track(new THREE.MeshStandardMaterial({ color: '#05090a', roughness: 0.08, metalness: 0.92, envMap: env, envMapIntensity: 1.4 }));
    const water = new THREE.Mesh(track(new THREE.PlaneGeometry(220, 160)), waterMat);
    water.rotation.x = -Math.PI / 2;
    scene.add(water);
    this.sparkTex = track(canvasTex(512, 512, (x, w, h) => {
      for (let i = 0; i < 1400; i++) {
        x.fillStyle = `rgba(220,255,200,${Math.random() * 0.55})`;
        x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2.5, 1);
      }
    }));
    this.sparkTex.wrapS = this.sparkTex.wrapT = THREE.RepeatWrapping;
    this.sparkTex.repeat.set(10, 7);
    const sparkle = new THREE.Mesh(
      track(new THREE.PlaneGeometry(220, 160)),
      track(new THREE.MeshBasicMaterial({ map: this.sparkTex, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false })),
    );
    sparkle.rotation.x = -Math.PI / 2;
    sparkle.position.y = 0.03;
    scene.add(sparkle);

    // Boardwalk
    this.curve = new THREE.CatmullRomCurve3(N.map((p) => new THREE.Vector3(p.x, 0.55, p.z)), false, 'catmullrom', 0.5);
    const curve = this.curve;
    const L = curve.getLength();
    const nearNode = (x: number, z: number, d: number) => N.some((n) => Math.hypot(n.x - x, n.z - z) < d);
    const planks: { p: THREE.Vector3; yaw: number }[] = [];
    const posts: THREE.Vector3[] = [];
    for (let s = 0; s < L; s += 0.42) {
      const p = curve.getPointAt(s / L), t = curve.getTangentAt(s / L);
      if (!nearNode(p.x, p.z, 2.4)) planks.push({ p, yaw: Math.atan2(t.x, t.z) });
    }
    for (let s = 1; s < L; s += 2.5) {
      const p = curve.getPointAt(s / L), t = curve.getTangentAt(s / L);
      if (nearNode(p.x, p.z, 2.6)) continue;
      const perp = new THREE.Vector3(t.z, 0, -t.x).normalize();
      posts.push(p.clone().addScaledVector(perp, 1.05), p.clone().addScaledVector(perp, -1.05));
    }
    const dummy = new THREE.Object3D(), col = new THREE.Color();
    const plankIM = new THREE.InstancedMesh(track(new THREE.BoxGeometry(2.1, 0.13, 0.38)), plankMat, planks.length);
    planks.forEach((k, i) => {
      dummy.position.set(k.p.x, 0.55 + (R() - 0.5) * 0.04, k.p.z);
      dummy.rotation.set(0, k.yaw, (R() - 0.5) * 0.05);
      dummy.updateMatrix();
      plankIM.setMatrixAt(i, dummy.matrix);
      const v = 0.8 + R() * 0.3;
      plankIM.setColorAt(i, col.setRGB(0.95 * v, 0.8 * v, 0.62 * v));
    });
    scene.add(plankIM);
    N.forEach((n, i) => {
      const t = curve.getTangentAt(Math.min(0.999, Math.max(0.001, i / 8)));
      const yaw = Math.atan2(t.x, t.z);
      const deck = new THREE.Mesh(track(new THREE.BoxGeometry(4.8, 0.22, 4.8)), woodMat);
      deck.position.set(n.x, 0.56, n.z);
      deck.rotation.y = yaw;
      scene.add(deck);
      for (const [a, b] of [[-2.25, -2.25], [2.25, -2.25], [-2.25, 2.25], [2.25, 2.25]] as const) {
        const v = new THREE.Vector3(a, 0, b).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        posts.push(new THREE.Vector3(n.x + v.x, 0, n.z + v.z));
      }
    });
    const postIM = new THREE.InstancedMesh(track(new THREE.CylinderGeometry(0.11, 0.13, 1.5, 7)), postMat, posts.length);
    const caps: THREE.Vector3[] = [];
    posts.forEach((p, i) => {
      dummy.position.set(p.x, 0.35, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      postIM.setMatrixAt(i, dummy.matrix);
      if (i % 2 === 0) caps.push(p);
    });
    scene.add(postIM);
    const capIM = new THREE.InstancedMesh(track(new THREE.CylinderGeometry(0.17, 0.17, 0.28, 8)), lampMat, caps.length);
    caps.forEach((p, i) => {
      dummy.position.set(p.x, 1.15, p.z);
      dummy.updateMatrix();
      capIM.setMatrixAt(i, dummy.matrix);
    });
    scene.add(capIM);

    // Islands and grass
    const islands: [number, number, number][] = [];
    N.forEach((n) => {
      const a = R() * Math.PI * 2, d = 4.2 + R() * 2;
      islands.push([n.x + Math.cos(a) * d, n.z + Math.sin(a) * d, 2.2 + R() * 2]);
    });
    for (let i = 0; i < 10; i++) {
      const x = -34 + R() * 68, z = -22 + R() * 40;
      if (!nearNode(x, z, 5)) islands.push([x, z, 1.6 + R() * 2.4]);
    }
    for (const [x, z, r] of islands) {
      const g = track(new THREE.CylinderGeometry(r, r * 1.15, 0.7, 12, 1));
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) > 0) {
          pos.setX(i, pos.getX(i) * (0.8 + R() * 0.35));
          pos.setZ(i, pos.getZ(i) * (0.8 + R() * 0.35));
          pos.setY(i, 0.35 + R() * 0.15);
        }
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mudMat);
      m.position.set(x, -0.05, z);
      scene.add(m);
    }
    const tufts: [number, number][] = [];
    for (const [x, z, r] of islands) {
      for (let k = 0; k < 7; k++) {
        const a = R() * 6.28, d = R() * r * 0.8;
        tufts.push([x + Math.cos(a) * d, z + Math.sin(a) * d]);
      }
    }
    for (let s = 0; s < L; s += 1.3) {
      const p = curve.getPointAt(s / L), t = curve.getTangentAt(s / L);
      if (nearNode(p.x, p.z, 2.8) || R() < 0.5) continue;
      const side = R() < 0.5 ? 1 : -1;
      tufts.push([p.x + t.z * side * (1.7 + R()), p.z - t.x * side * (1.7 + R())]);
    }
    const grassGeo = track(new THREE.ConeGeometry(0.09, 1.1, 4));
    grassGeo.translate(0, 0.55, 0);
    const grassIM = new THREE.InstancedMesh(grassGeo, grassMat, tufts.length * 7);
    let gi = 0;
    for (const [x, z] of tufts) {
      for (let k = 0; k < 7; k++) {
        dummy.position.set(x + (R() - 0.5) * 0.6, 0.25, z + (R() - 0.5) * 0.6);
        dummy.rotation.set((R() - 0.5) * 0.5, R() * 3, (R() - 0.5) * 0.5);
        const s = 0.6 + R() * 0.9;
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        grassIM.setMatrixAt(gi++, dummy.matrix);
      }
    }
    dummy.scale.set(1, 1, 1);
    scene.add(grassIM);

    // Lily pads
    const pads: [number, number, number][] = [];
    for (let i = 0; i < 90; i++) {
      const x = -36 + R() * 72, z = -24 + R() * 46;
      if (nearNode(x, z, 2.8)) continue;
      let onPath = false;
      for (let s = 0; s < L; s += 1) {
        const q = curve.getPointAt(s / L);
        if (Math.hypot(q.x - x, q.z - z) < 1.6) {
          onPath = true;
          break;
        }
      }
      if (!onPath) pads.push([x, z, 0.35 + R() * 0.75]);
    }
    const padIM = new THREE.InstancedMesh(track(new THREE.CylinderGeometry(1, 1, 0.04, 18, 1, false, 0.35, Math.PI * 2 - 0.7)), padMat, pads.length);
    pads.forEach(([x, z, s], i) => {
      dummy.position.set(x, 0.03, z);
      dummy.rotation.set(0, R() * 6.28, 0);
      dummy.scale.set(s, 1, s);
      dummy.updateMatrix();
      padIM.setMatrixAt(i, dummy.matrix);
    });
    dummy.scale.set(1, 1, 1);
    scene.add(padIM);
    const flowerMat = track(new THREE.MeshStandardMaterial({ color: '#f2a6d0', emissive: '#c04a8a', emissiveIntensity: 0.8 }));
    pads.forEach(([x, z, s], i) => {
      if (i % 6 !== 0) return;
      const f = new THREE.Mesh(track(new THREE.SphereGeometry(0.16 * s + 0.08, 8, 6)), flowerMat);
      f.position.set(x + 0.2, 0.12, z + 0.1);
      scene.add(f);
    });

    // Trees: trunk segments, roots, branches, and leaf cards (one instanced mesh for all leaves)
    const leafCards: { p: THREE.Vector3; s: number; r: [number, number, number]; y: boolean }[] = [];
    const tree = (x: number, z: number, s: number, lean: number, light: boolean) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const c = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -0.5, 0),
        new THREE.Vector3(lean * 0.2, 2.4 * s, 0.1),
        new THREE.Vector3(lean * 0.7, 4.8 * s, -0.1),
        new THREE.Vector3(lean * 1.1, 6.6 * s, 0),
      ]);
      for (let k = 0; k < 6; k++) {
        const a = c.getPoint(k / 6), b = c.getPoint((k + 1) / 6);
        const seg = new THREE.Mesh(track(new THREE.CylinderGeometry((0.62 - (k + 1) * 0.08) * s, (0.62 - k * 0.08) * s, a.distanceTo(b), 7)), barkMat);
        seg.position.copy(a).add(b).multiplyScalar(0.5);
        seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        g.add(seg);
      }
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + R() * 0.6, d = 1.3 + R() * 1.3;
        const rc = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 1 * s, 0),
          new THREE.Vector3(Math.cos(a) * d * 0.6, 0.9, Math.sin(a) * d * 0.6),
          new THREE.Vector3(Math.cos(a) * d, -0.3, Math.sin(a) * d),
        ]);
        g.add(new THREE.Mesh(track(new THREE.TubeGeometry(rc, 10, 0.16 * s, 6)), barkMat));
      }
      const top = c.getPoint(1);
      const core = new THREE.Mesh(track(new THREE.SphereGeometry(2.1 * s, 10, 8)), coreMat);
      core.position.copy(top);
      core.scale.set(1.15, 0.5, 1.15);
      g.add(core);
      for (let k = 0; k < 90; k++) {
        const a = R() * Math.PI * 2, d = Math.sqrt(R()) * 3.1 * s, h = (R() - 0.35) * 1.6 * s;
        leafCards.push({
          p: new THREE.Vector3(x + top.x + Math.cos(a) * d, top.y + h + (1 - d / (3.1 * s)) * 0.9 * s, z + top.z + Math.sin(a) * d),
          s: (0.9 + R() * 0.7) * s,
          r: [R() * 6.28, R() * 6.28, R() * 6.28],
          y: R() < 0.3,
        });
      }
      for (let k = 0; k < 2; k++) {
        const a = R() * 6.28, base = c.getPoint(0.6);
        const bc = new THREE.CatmullRomCurve3([
          base,
          base.clone().add(new THREE.Vector3(Math.cos(a) * 1.6 * s, 1.4 * s, Math.sin(a) * 1.6 * s)),
          base.clone().add(new THREE.Vector3(Math.cos(a) * 2.6 * s, 2 * s, Math.sin(a) * 2.6 * s)),
        ]);
        g.add(new THREE.Mesh(track(new THREE.TubeGeometry(bc, 8, 0.14 * s, 5)), barkMat));
        const e = bc.getPoint(1);
        for (let j = 0; j < 22; j++) {
          leafCards.push({
            p: new THREE.Vector3(x + e.x + (R() - 0.5) * 2.2 * s, e.y + (R() - 0.3) * 0.9 * s, z + e.z + (R() - 0.5) * 2.2 * s),
            s: (0.8 + R() * 0.6) * s,
            r: [R() * 6.28, R() * 6.28, R() * 6.28],
            y: R() < 0.3,
          });
        }
      }
      if (light) {
        const pl = new THREE.PointLight(0xa8ff5a, 1.5, 22, 2);
        pl.position.set(top.x, top.y - 1.2, top.z);
        g.add(pl);
        this.treeLights.push(pl);
      }
      scene.add(g);
    };
    {
      // Trees never stand on the boardwalk, next to a swamp, or between the camera and a swamp.
      const TR = rng(1234);
      const picked: [number, number][] = [];
      const pathD = (x: number, z: number) => {
        let m = 1e9;
        for (let s = 0; s < L; s += 0.8) {
          const q = curve.getPointAt(s / L);
          m = Math.min(m, Math.hypot(q.x - x, q.z - z));
        }
        return m;
      };
      for (let tries = 0; picked.length < 13 && tries < 4000; tries++) {
        const x = -38 + TR() * 76, z = -26 + TR() * 40;
        if (N.some((n) => Math.hypot(n.x - x, n.z - z) < 6.5)) continue;
        if (pathD(x, z) < 4.2) continue;
        if (N.some((n) => z > n.z && z - n.z < 26 && Math.abs(x - n.x) < 6.5)) continue;
        if (picked.some((p) => Math.hypot(p[0] - x, p[1] - z) < 7)) continue;
        picked.push([x, z]);
      }
      picked.forEach(([x, z], k) => tree(x, z, 0.95 + TR() * 0.35, (TR() - 0.5) * 1.6, k % 2 === 0));
    }
    const leafTex = track(canvasTex(128, 128, (x) => {
      for (let k = 0; k < 7; k++) {
        const cx = 30 + Math.random() * 68, cy = 30 + Math.random() * 68;
        x.save();
        x.translate(cx, cy);
        x.rotate(Math.random() * 6.28);
        const g = x.createLinearGradient(-26, 0, 26, 0);
        const yellow = Math.random() < 0.3;
        g.addColorStop(0, yellow ? '#f0f78a' : '#b6ee64');
        g.addColorStop(1, yellow ? '#bfe04a' : '#6fc23a');
        x.fillStyle = g;
        x.beginPath();
        x.ellipse(0, 0, 26, 11, 0, 0, 7);
        x.fill();
        x.strokeStyle = 'rgba(40,90,20,.55)';
        x.lineWidth = 1.5;
        x.beginPath();
        x.moveTo(-24, 0);
        x.lineTo(24, 0);
        x.stroke();
        x.restore();
      }
    }));
    const leafMat = track(new THREE.MeshStandardMaterial({ map: leafTex, emissiveMap: leafTex, emissive: '#8fd844', emissiveIntensity: 0.72, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.6 }));
    const leafIM = new THREE.InstancedMesh(track(new THREE.PlaneGeometry(1.6, 1.6)), leafMat, leafCards.length);
    leafCards.forEach((c, i) => {
      dummy.position.copy(c.p);
      dummy.rotation.set(c.r[0], c.r[1], c.r[2]);
      dummy.scale.set(c.s, c.s, c.s);
      dummy.updateMatrix();
      leafIM.setMatrixAt(i, dummy.matrix);
      leafIM.setColorAt(i, col.setRGB(c.y ? 1.15 : 0.9, c.y ? 1.1 : 1, c.y ? 0.7 : 0.85));
    });
    dummy.scale.set(1, 1, 1);
    scene.add(leafIM);

    // Boat and hut
    const hull = new THREE.Shape();
    hull.moveTo(0, -1.9);
    hull.quadraticCurveTo(0.95, -1.1, 0.85, 0.4);
    hull.quadraticCurveTo(0.7, 1.6, 0, 1.9);
    hull.quadraticCurveTo(-0.7, 1.6, -0.85, 0.4);
    hull.quadraticCurveTo(-0.95, -1.1, 0, -1.9);
    const boat = new THREE.Mesh(
      track(new THREE.ExtrudeGeometry(hull, { depth: 0.45, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2 })),
      track(new THREE.MeshStandardMaterial({ color: '#7a4f2c', roughness: 0.85 })),
    );
    boat.rotation.x = -Math.PI / 2;
    boat.rotation.z = 0.9;
    boat.position.set(-12, 0.05, 12.5);
    scene.add(boat);
    const hut = new THREE.Group();
    hut.position.set(23, 0, -21);
    const walls = new THREE.Mesh(track(new THREE.BoxGeometry(3.4, 2.6, 3)), woodMat);
    walls.position.y = 2.4;
    hut.add(walls);
    const roof = new THREE.Mesh(track(new THREE.ConeGeometry(2.9, 1.7, 4)), track(new THREE.MeshStandardMaterial({ color: '#4a3a24', roughness: 0.95, flatShading: true })));
    roof.position.y = 4.55;
    roof.rotation.y = Math.PI / 4;
    hut.add(roof);
    const win = new THREE.Mesh(track(new THREE.PlaneGeometry(0.8, 0.6)), track(new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffb85a', emissiveIntensity: 2 })));
    win.position.set(0.6, 2.6, 1.51);
    hut.add(win);
    for (const [a, b] of [[-1.5, -1.3], [1.5, -1.3], [-1.5, 1.3], [1.5, 1.3]] as const) {
      const p = new THREE.Mesh(track(new THREE.CylinderGeometry(0.14, 0.16, 1.6, 7)), postMat);
      p.position.set(a, 0.5, b);
      hut.add(p);
    }
    const hutLight = new THREE.PointLight(0xffb060, 1.4, 16, 2);
    hutLight.position.set(0.6, 2.6, 2.4);
    hut.add(hutLight);
    scene.add(hut);

    // The Chog, its glow, swamp rings and tap targets
    const chogTex = track(canvasTex(256, 256, (x) => drawChog(x, 128, 240, 2.35)));
    this.chog = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: chogTex, transparent: true, depthWrite: false })));
    this.chog.center.set(0.5, 0.02);
    this.chog.scale.set(4.6, 4.6, 1);
    this.chog.renderOrder = 5;
    scene.add(this.chog);
    this.glowTex = track(canvasTex(128, 128, (x) => {
      const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 128, 128);
    }));
    this.chogGlow = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: this.glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 })));
    this.chogGlow.scale.set(7, 7, 1);
    scene.add(this.chogGlow);
    this.chogLight = new THREE.PointLight(0x9b7cff, 2.4, 15, 2);
    scene.add(this.chogLight);
    const ringGeo = track(new THREE.TorusGeometry(1.7, 0.11, 8, 48));
    const hitGeo = track(new THREE.CylinderGeometry(2.6, 2.6, 3, 10));
    const hitMat = track(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    N.forEach((n, i) => {
      const m = new THREE.Mesh(ringGeo, track(new THREE.MeshStandardMaterial({ color: '#222', emissive: '#000', emissiveIntensity: 1.6 })));
      m.rotation.x = -Math.PI / 2;
      m.position.set(n.x, 0.7, n.z);
      scene.add(m);
      this.rings.push(m);
      const h = new THREE.Mesh(hitGeo, hitMat);
      h.position.set(n.x, 1.5, n.z);
      h.userData.i = i;
      scene.add(h);
      this.hits.push(h);
    });

    // Ants marching toward the Chog
    const antTex = track(canvasTex(64, 48, (x) => {
      x.translate(32, 30);
      x.scale(1.7, 1.7);
      x.strokeStyle = '#e8c690';
      x.lineWidth = 1.2;
      for (let j = 0; j < 3; j++) {
        const lx = -4 + j * 4;
        x.beginPath();
        x.moveTo(lx, -4);
        x.lineTo(lx - 3, 2);
        x.moveTo(lx, -4);
        x.lineTo(lx + 3, 2);
        x.stroke();
      }
      x.fillStyle = '#2a1d12';
      for (const [ex, ey, rx, ry] of [[8, -5, 7, 5], [-1, -5, 4, 3.4], [-8, -6, 4.2, 4]] as const) {
        x.beginPath();
        x.ellipse(ex, ey, rx, ry, 0, 0, 7);
        x.fill();
      }
      x.fillStyle = '#ffd23f';
      x.beginPath();
      x.arc(9, -7, 1.8, 0, 7);
      x.fill();
    }));
    const antMat = track(new THREE.SpriteMaterial({ map: antTex, transparent: true, depthWrite: false }));
    for (let k = 0; k < 3; k++) {
      const s = new THREE.Sprite(antMat);
      s.scale.set(0.9, 0.68, 1);
      s.visible = false;
      scene.add(s);
      this.ants.push(s);
    }

    // Fog over locked swamps
    const cloudTex = track(canvasTex(256, 256, (x) => {
      for (let i = 0; i < 40; i++) {
        const cx = 128 + (Math.random() - 0.5) * 120, cy = 128 + (Math.random() - 0.5) * 80, r = 30 + Math.random() * 60;
        const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, 'rgba(200,210,220,.10)');
        g.addColorStop(1, 'rgba(200,210,220,0)');
        x.fillStyle = g;
        x.fillRect(0, 0, 256, 256);
      }
    }));
    N.forEach((n, i) => {
      for (let k = 0; k < 4; k++) {
        const s = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.5 })));
        const sc = 9 + R() * 7;
        s.scale.set(sc, sc * 0.6, 1);
        s.position.set(n.x + (R() - 0.5) * 6, 1.6 + R() * 2, n.z + (R() - 0.5) * 6);
        scene.add(s);
        this.fogs.push({ s, i, base: s.position.clone(), ph: R() * 6 });
      }
    });

    // Fireflies
    const FF = 240, ffPos = new Float32Array(FF * 3);
    for (let i = 0; i < FF; i++) {
      const x = -36 + R() * 72, y = 1 + R() * 8, z = -24 + R() * 46;
      this.ffBase.push([x, y, z, R() * 6]);
      ffPos.set([x, y, z], i * 3);
    }
    this.ffGeo = track(new THREE.BufferGeometry());
    this.ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
    this.ffMat = track(new THREE.PointsMaterial({ color: '#d6ff78', size: 0.32, map: this.glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(new THREE.Points(this.ffGeo, this.ffMat));

    // Backdrop title
    this.titleCanvas.width = 2048;
    this.titleCanvas.height = 640;
    this.titleTex = track(new THREE.CanvasTexture(this.titleCanvas));
    this.titleTex.anisotropy = 8;
    this.drawTitle();
    this.title = new THREE.Mesh(
      track(new THREE.PlaneGeometry(64, 20)),
      track(new THREE.MeshBasicMaterial({ map: this.titleTex, transparent: true, depthWrite: false, fog: false, opacity: 0.92, color: new THREE.Color(0.82, 0.82, 0.82) })),
    );
    this.title.renderOrder = -1;
    scene.add(this.title);

    // Lights and glow
    scene.add(new THREE.HemisphereLight(0x3d5a66, 0x1a140a, 0.55));
    const moon = new THREE.DirectionalLight(0xa9bcff, 0.55);
    moon.position.set(-30, 40, 10);
    scene.add(moon);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.72, 0.5, 0.62));

    // Overlay: swamp tags and the Chog's name plate
    SWAMPS.forEach((sw, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'd-tag';
      const num = document.createElement('b');
      num.textContent = String(sw.number);
      const name = document.createElement('span');
      name.textContent = sw.name;
      const now = document.createElement('em');
      now.textContent = 'now';
      b.append(num, name, now);
      b.setAttribute('aria-label', `Swamp ${sw.number}, ${sw.name}`);
      b.addEventListener('click', () => this.opts.onSelect(i));
      overlay.appendChild(b);
      this.tags.push(b);
    });
    this.plate = document.createElement('div');
    this.plate.className = 'd-plate';
    this.plate.setAttribute('aria-hidden', 'true');
    this.plate.append(document.createElement('span'), document.createElement('small'));
    overlay.appendChild(this.plate);

    // Input
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void, o?: AddEventListenerOptions) => {
      el.addEventListener(type, fn as EventListener, o);
      this.cleanup.push(() => el.removeEventListener(type, fn as EventListener, o));
    };
    on(canvas, 'pointerdown', (e) => this.onDown(e));
    on(canvas, 'pointermove', (e) => this.onMove(e));
    on(canvas, 'pointerup', (e) => this.onUp(e));
    on(canvas, 'pointercancel', (e) => this.onUp(e, true));
    on(canvas, 'wheel', (e) => this.onWheel(e), { passive: false });

    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(canvas);
    }
    if (typeof IntersectionObserver !== 'undefined') {
      this.io = new IntersectionObserver((e) => {
        this.visible = Boolean(e[0]?.isIntersecting);
      });
      this.io.observe(canvas);
    }
    this.resize();
    if (document.fonts) {
      document.fonts
        .load('400 100px "Rubik Dirt"')
        .then(() => this.drawTitle())
        .catch(() => undefined);
    }
    const frame = () => {
      this.raf = requestAnimationFrame(frame);
      this.render();
    };
    this.raf = requestAnimationFrame(frame);
  }

  // -------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------

  setState(next: DioramaState): void {
    const prev = this.state;
    this.state = next;
    const glow = next.complete ? 9 : next.glow;
    const glowColor = glow > 0 ? `rgb(${SWAMPS[glow - 1]!.glow})` : '#8f63ff';
    const c = new THREE.Color(glowColor);
    (this.chogGlow.material as THREE.SpriteMaterial).color.copy(c);
    this.chogGlow.scale.setScalar(next.complete ? 11 : glow > 0 ? 7 : 4.5);
    this.chogLight.color.copy(next.complete ? new THREE.Color(GOLD) : c);
    this.chogLight.intensity = next.complete ? 4 : glow > 0 ? 2.4 : 1.2;

    const at = next.chogAt / 8;
    if (prev && prev.chogAt !== next.chogAt && this.amb) {
      this.travel = { from: this.chogU, to: at, t: 0, dur: 1.4 + Math.abs(next.chogAt - prev.chogAt) * 1.1 };
    } else if (!this.travel) {
      this.chogU = at;
    }
    if (prev && next.ants > prev.ants) this.burst();

    this.rings.forEach((r, i) => {
      const st = swampState(next, i);
      const color = st === 'done' ? `rgb(${SWAMPS[i]!.glow})` : st === 'now' ? NOW : '#000';
      r.material.emissive.set(next.complete && i === 8 ? GOLD : color);
      r.material.color.set(st === 'locked' ? '#2a2a26' : '#111');
      r.scale.set(1, 1, 1);
      const t = this.tags[i]!;
      t.classList.remove('done', 'now', 'locked');
      t.classList.add(st);
      t.style.setProperty('--c', next.complete && i === 8 ? GOLD : st === 'done' ? `rgb(${SWAMPS[i]!.glow})` : st === 'now' ? NOW : LOCKED);
    });
    for (const f of this.fogs) f.s.visible = swampState(next, f.i) === 'locked';
    this.ants.forEach((a) => (a.visible = next.antsComing));

    this.plate.style.setProperty('--c', next.complete ? GOLD : glowColor);
    (this.plate.firstChild as HTMLElement).textContent = next.name;
    (this.plate.lastChild as HTMLElement).textContent = next.subtitle;
  }

  /** Mark a swamp as selected (highlights its tag). */
  select(index: number): void {
    this.selected = Math.min(8, Math.max(0, index));
    this.tags.forEach((t, k) => t.classList.toggle('sel', k === this.selected));
  }

  /** Fly the camera to a swamp, or with null back to the centred view of the whole boardwalk. */
  focusOn(index: number | null): void {
    this.centred = index === null;
    if (index === null) this.focus.copy(this.overview);
    else this.focus.copy(this.nodes[Math.min(8, Math.max(0, index))]!).setY(0);
  }

  /** Full screen turns on drag to look around and wheel or pinch to zoom. */
  setInteractive(on: boolean): void {
    this.interactive = on;
    if (!on) {
      this.theta = 0;
      this.phi = 1.02;
    }
    this.canvas.style.touchAction = on ? 'none' : 'pan-y';
    this.canvas.style.cursor = on ? 'grab' : 'pointer';
    this.resize();
    this.radius = this.overviewRadius;
  }

  resize(): void {
    const w = Math.max(2, this.canvas.clientWidth), h = Math.max(2, this.canvas.clientHeight);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.setViewOffset(w, h * LENS_SHIFT, 0, 0, w, h);
    this.camera.updateProjectionMatrix();
    this.overlay.classList.toggle('compact', w < 760);
    this.title.scale.set(w < 620 ? 0.8 : 0.74, w < 620 ? 0.8 : 0.74, 1);
    this.fitOverview();
    if (this.centred) this.focus.copy(this.overview);
    if (!this.interactive) this.radius = this.overviewRadius;
  }

  /**
   * Finds the camera centre and distance that show all nine swamps, centred on screen, for the
   * current canvas shape. The nearest swamps look bigger in perspective, so the plain middle of
   * the map is not the middle of the picture; a few rounds of projecting and adjusting settle it.
   */
  private fitOverview(): void {
    const cam = this.camera.clone();
    const pad: [number, number, number][] = [[-9, 0, 0], [9, 0, 0], [0, 0, 6], [0, 3, -5]];
    const pts = this.nodes.flatMap((n) => pad.map(([x, y, z]) => n.clone().add(new THREE.Vector3(x, y, z))));
    const t = OVERVIEW.clone(), p = new THREE.Vector3();
    let r = 60;
    for (let i = 0; i < 30; i++) {
      cam.position.set(t.x, t.y + r * Math.cos(1.02), t.z + r * Math.sin(1.02));
      cam.lookAt(t);
      cam.updateMatrixWorld();
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const q of pts) {
        p.copy(q).project(cam);
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
        y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
      }
      // Leave room for the title along the top of the picture.
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 + 0.05;
      const ext = Math.max((x1 - x0) / 2, (y1 - y0) / 2 / 0.86);
      t.x += cx * r * 0.35;
      t.z -= cy * r * 0.45;
      r = Math.max(RAD_MIN, Math.min(140, r * Math.pow(ext / FIT, 0.6)));
    }
    this.overview.copy(t);
    this.overviewRadius = r;
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.io?.disconnect();
    this.cleanup.forEach((fn) => fn());
    this.tags.forEach((t) => t.remove());
    this.plate.remove();
    this.particles.forEach((p) => (p.sprite.material as THREE.SpriteMaterial).dispose());
    this.disposables.forEach((d) => d.dispose());
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
    // Not forceContextLoss(): the same canvas may host a new engine right away (React remounts),
    // and a deliberately lost context cannot be reused.
    this.renderer.dispose();
  }

  // -------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------

  private drawTitle(): void {
    const x = this.titleCanvas.getContext('2d');
    if (!x) return;
    const w = this.titleCanvas.width;
    x.clearRect(0, 0, w, this.titleCanvas.height);
    x.textAlign = 'center';
    x.textBaseline = 'alphabetic';
    x.lineJoin = 'round';
    const FACE = '"Rubik Dirt", Impact, sans-serif';
    let bigPx = 230;
    x.font = `400 ${bigPx}px ${FACE}`;
    const maxW = w - 200, mw = x.measureText('RYOKO CHOGSTER').width;
    if (mw > maxW) bigPx = Math.floor((bigPx * maxW) / mw);
    const big = `400 ${bigPx}px ${FACE}`, small = `400 ${Math.round(bigPx * 0.65)}px ${FACE}`;
    const line = (txt: string, font: string, y: number, fill: CanvasGradient) => {
      x.font = font;
      x.shadowColor = 'rgba(0,0,0,.85)';
      x.shadowBlur = 26;
      x.shadowOffsetY = 10;
      x.lineWidth = 22;
      x.strokeStyle = '#0b0d08';
      x.strokeText(txt, w / 2, y);
      x.shadowColor = 'transparent';
      x.fillStyle = fill;
      x.fillText(txt, w / 2, y);
      x.lineWidth = 3;
      x.strokeStyle = 'rgba(255,248,210,.35)';
      x.strokeText(txt, w / 2, y - 3);
    };
    const g1 = x.createLinearGradient(0, 60, 0, 300);
    g1.addColorStop(0, '#fff1a8');
    g1.addColorStop(0.55, '#e6b93c');
    g1.addColorStop(1, '#9a6a1c');
    const g2 = x.createLinearGradient(0, 380, 0, 560);
    g2.addColorStop(0, '#d8f58c');
    g2.addColorStop(1, '#5f9a2f');
    line('RYOKO CHOGSTER', big, 290, g1);
    x.font = small;
    const sw = x.measureText('SWAMPS').width;
    x.fillStyle = 'rgba(216,245,140,.75)';
    x.fillRect(w / 2 - sw / 2 - 260, 462, 200, 8);
    x.fillRect(w / 2 + sw / 2 + 60, 462, 200, 8);
    line('SWAMPS', small, 520, g2);
    this.titleTex.needsUpdate = true;
  }

  private burst(): void {
    const origin = this.curve.getPointAt(Math.min(0.999, this.chogU));
    for (let i = 0; i < 28; i++) {
      const mat = new THREE.SpriteMaterial({ map: this.glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: i % 2 ? '#ffd23f' : '#aa82ff' });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.setScalar(0.5);
      sprite.position.set(origin.x, 2, origin.z);
      this.scene.add(sprite);
      this.particles.push({ sprite, v: new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 4, (Math.random() - 0.5) * 4), life: 1.3 + Math.random() * 0.5 });
    }
  }

  private onDown(e: PointerEvent): void {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.interactive) this.canvas.setPointerCapture(e.pointerId);
    if (this.pointers.size === 2 && this.interactive) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), r: this.radius };
      this.drag = null;
      return;
    }
    this.drag = { x: e.clientX, y: e.clientY, moved: 0, th: this.theta, ph: this.phi };
  }

  private onMove(e: PointerEvent): void {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      this.radius = Math.max(RAD_MIN, Math.min(Math.max(RAD_MAX, this.overviewRadius * 1.15), (this.pinch.r * this.pinch.d) / Math.max(1, d)));
      return;
    }
    if (!this.drag) return;
    const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
    this.drag.moved = Math.max(this.drag.moved, Math.abs(dx) + Math.abs(dy));
    if (!this.interactive) return;
    this.theta = Math.max(-TH_MAX, Math.min(TH_MAX, this.drag.th - dx * 0.005));
    this.phi = Math.max(PHI_MIN, Math.min(PHI_MAX, this.drag.ph - dy * 0.004));
  }

  private onUp(e: PointerEvent, cancelled = false): void {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (!cancelled && this.drag && this.drag.moved < 6) {
      const r = this.canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, this.camera);
      const hit = ray.intersectObjects(this.hits)[0];
      if (hit) this.opts.onSelect(hit.object.userData.i as number);
    }
    this.drag = null;
  }

  private onWheel(e: WheelEvent): void {
    if (!this.interactive) return; // inline, the wheel scrolls the page
    e.preventDefault();
    this.radius = Math.max(RAD_MIN, Math.min(Math.max(RAD_MAX, this.overviewRadius * 1.15), this.radius * (1 + Math.sign(e.deltaY) * 0.08)));
  }

  private project(v: THREE.Vector3): { x: number; y: number; ok: boolean } {
    const p = v.clone().project(this.camera);
    return { x: ((p.x + 1) / 2) * this.canvas.clientWidth, y: ((1 - p.y) / 2) * this.canvas.clientHeight, ok: p.z < 1 && p.z > -1 };
  }

  private render(): void {
    if (!this.visible || !this.state) return;
    const dt = Math.min(0.05, this.clock.getDelta()), T = this.clock.elapsedTime, amb = this.amb;
    const s = this.state;

    this.target.lerp(this.focus, 1 - Math.pow(0.02, dt));
    const th = this.theta + Math.sin(T * 0.08) * 0.06 * amb;
    const { target: tg, radius: r, phi } = this;
    this.camera.position.set(tg.x + r * Math.sin(phi) * Math.sin(th), tg.y + r * Math.cos(phi), tg.z + r * Math.sin(phi) * Math.cos(th));
    this.camera.lookAt(tg);

    // The Chog walks along the boardwalk when it moves to another swamp.
    let walking = false;
    if (this.travel) {
      this.travel.t += dt;
      const k = Math.min(1, this.travel.t / this.travel.dur);
      const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.chogU = this.travel.from + (this.travel.to - this.travel.from) * ease;
      walking = k < 1;
      if (k >= 1) this.travel = null;
    }
    const cp = this.curve.getPointAt(Math.min(0.999, Math.max(0.001, this.chogU)));
    const bob = walking ? Math.abs(Math.sin(T * 9)) * 0.35 : Math.abs(Math.sin(T * 2.2)) * 0.12 * amb;
    this.chog.position.set(cp.x, 0.68 + bob, cp.z);
    this.chogGlow.position.set(cp.x, 2, cp.z);
    (this.chogGlow.material as THREE.SpriteMaterial).opacity = 0.75 + 0.2 * Math.sin(T * 2.4) * amb;
    this.chogLight.position.set(cp.x, 3, cp.z);

    this.rings.forEach((ring, i) => {
      if (swampState(s, i) === 'now') ring.scale.setScalar(1 + 0.08 * Math.sin(T * 3) * amb);
    });
    this.sparkTex.offset.set(T * 0.004 * amb, T * 0.002 * amb);
    for (const f of this.fogs) {
      f.s.position.x = f.base.x + Math.sin(T * 0.12 + f.ph) * 1.6 * amb;
      (f.s.material as THREE.SpriteMaterial).rotation = Math.sin(T * 0.05 + f.ph) * 0.2 * amb;
    }
    const pos = this.ffGeo.attributes.position as THREE.BufferAttribute;
    this.ffBase.forEach((b, i) => {
      pos.setXYZ(i, b[0]! + Math.sin(T * 0.5 + b[3]!) * 0.8 * amb, b[1]! + Math.sin(T * 0.7 + b[3]! * 2) * 0.5 * amb, b[2]! + Math.cos(T * 0.4 + b[3]!) * 0.8 * amb);
    });
    pos.needsUpdate = true;
    this.ffMat.opacity = 0.7 + 0.3 * Math.sin(T * 1.7) * amb;
    if (s.antsComing) {
      const a1 = Math.min(0.999, (s.target) / 8), a0 = Math.max(0, a1 - 1 / 8);
      this.ants.forEach((a, k) => {
        const u = a0 + (a1 - a0) * (((T * 0.05 * amb + k / 3) % 1) * 0.85);
        const p = this.curve.getPointAt(Math.min(0.999, u));
        a.position.set(p.x, 0.85, p.z);
      });
    }
    this.treeLights.forEach((l, k) => (l.intensity = 1.3 + 0.25 * Math.sin(T * 1.3 + k) * amb));
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life -= dt;
      p.v.y -= 3 * dt;
      p.sprite.position.addScaledVector(p.v, dt);
      (p.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, p.life);
      if (p.life <= 0) {
        this.scene.remove(p.sprite);
        (p.sprite.material as THREE.SpriteMaterial).dispose();
        this.particles.splice(i, 1);
      }
    }

    // Lift the title as the camera pulls back so the back trees never cover it.
    this.title.position.set(tg.x, 8.4 + Math.max(0, r - 60) * 0.4, tg.z - 40);
    this.title.rotation.y = Math.atan2(this.camera.position.x - this.title.position.x, this.camera.position.z - this.title.position.z);

    // Labels slide inwards rather than hang off the side of the picture.
    const W = this.canvas.clientWidth;
    const inside = (x: number, el: HTMLElement) => {
      const half = el.offsetWidth / 2 + 6;
      return half * 2 >= W ? W / 2 : Math.min(W - half, Math.max(half, x));
    };
    this.nodes.forEach((n, i) => {
      const p = this.project(new THREE.Vector3(n.x, 0.7, n.z + 2.6));
      const t = this.tags[i]!;
      t.style.transform = `translate(${inside(p.x, t).toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,6px)`;
      t.style.visibility = p.ok ? 'visible' : 'hidden';
    });
    const pp = this.project(new THREE.Vector3(cp.x, this.chog.position.y + 4.9, cp.z));
    this.plate.style.transform = `translate(${inside(pp.x, this.plate).toFixed(1)}px,${pp.y.toFixed(1)}px) translate(-50%,-100%)`;
    this.plate.style.visibility = pp.ok ? 'visible' : 'hidden';

    this.composer.render();
  }
}
