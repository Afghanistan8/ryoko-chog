import { useEffect, useRef, type ReactNode } from 'react';
import { SwampScene } from '../scene/SwampScene';
import { usePrefersReducedMotion } from '../hooks';

interface Props {
  /** 1-9 */
  swamp: number;
  /** 0-9 */
  glow: number;
  complete: boolean;
  /** Ants eaten so far. When it goes up, the Chog eats an ant, then travels into `swamp`. */
  ants?: number;
  antLabel?: string;
  label: string;
  children?: ReactNode;
}

export function SwampCanvas({ swamp, glow, complete, ants = 0, antLabel = '', label, children }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<SwampScene | null>(null);
  const shown = useRef<{ swamp: number; glow: number; complete: boolean; ants: number } | null>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new SwampScene(canvas, { reducedMotion: reduced, antLabel });
    sceneRef.current = scene;
    shown.current = null;
    scene.start();
    return () => {
      scene.destroy();
      sceneRef.current = null;
    };
    // Recreate only when the motion preference changes; other props are applied below.
  }, [reduced]);

  useEffect(() => {
    sceneRef.current?.setAntLabel(antLabel);
  }, [antLabel]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const prev = shown.current;
    shown.current = { swamp, glow, complete, ants };
    if (!prev) {
      scene.show(swamp, glow, complete);
      return;
    }
    if (ants > prev.ants) {
      scene.eatAndTravel(swamp, glow, complete);
    } else if (swamp !== prev.swamp) {
      scene.goTo(swamp, glow, complete);
    } else if (glow !== prev.glow || complete !== prev.complete) {
      scene.show(swamp, glow, complete);
      if (complete && !prev.complete) scene.celebrate();
    }
  }, [swamp, glow, complete, ants, reduced]);

  return (
    <div className="stage">
      <canvas ref={canvasRef} role="img" aria-label={label} />
      {children}
    </div>
  );
}
