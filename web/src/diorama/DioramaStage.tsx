import { useCallback, useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../hooks';
import { Diorama } from './Diorama';
import type { DioramaState } from './state';

interface Props {
  state: DioramaState;
  selected: number;
  onSelect: (index: number) => void;
  label: string;
}

/**
 * The 3D swamp, inline in the page. Inline it only answers taps, so the page scrolls normally.
 * "Full screen" opens it over the whole screen, where dragging looks around and the wheel or a
 * pinch zooms. Uses the Fullscreen API when the browser allows it, otherwise a full-window view.
 */
export function DioramaStage({ state, selected, onSelect, label }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Diorama | null>(null);
  const onSelectRef = useRef(onSelect);
  const latest = useRef({ state, selected });
  const [full, setFull] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const reduced = usePrefersReducedMotion();

  onSelectRef.current = onSelect;
  latest.current = { state, selected };

  useEffect(() => {
    const canvas = canvasRef.current, overlay = overlayRef.current;
    if (!canvas || !overlay) return;
    let engine: Diorama;
    try {
      engine = new Diorama(canvas, overlay, { reducedMotion: reduced, onSelect: (i) => onSelectRef.current(i) });
    } catch (err) {
      console.error('Ryoko diorama failed to start', err);
      const probe = document.createElement('canvas');
      const hasWebGL = Boolean(probe.getContext('webgl2') ?? probe.getContext('webgl'));
      setFailed(hasWebGL ? 'The 3D swamp could not load. Refresh the page to try again.' : 'The 3D swamp needs WebGL, which this browser has turned off.');
      return;
    }
    engineRef.current = engine;
    engine.setState(latest.current.state);
    engine.select(latest.current.selected);
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [reduced]);

  useEffect(() => {
    engineRef.current?.setState(state);
  }, [state]);

  useEffect(() => {
    engineRef.current?.select(selected);
  }, [selected]);

  useEffect(() => {
    engineRef.current?.setInteractive(full);
    document.body.classList.toggle('d-lock', full);
    return () => document.body.classList.remove('d-lock');
  }, [full]);

  const enter = useCallback(async () => {
    const el = wrapRef.current;
    setFull(true);
    if (el && el.requestFullscreen && !document.fullscreenElement) {
      try {
        await el.requestFullscreen();
      } catch {
        // The full-window view still applies.
      }
    }
  }, []);

  const exit = useCallback(async () => {
    setFull(false);
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // already closed
      }
    }
  }, []);

  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFull(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void exit();
    };
    document.addEventListener('fullscreenchange', onChange);
    if (full) window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      window.removeEventListener('keydown', onKey);
    };
  }, [full, exit]);

  return (
    <div ref={wrapRef} className={`d-stage${full ? ' is-full' : ''}`}>
      <canvas ref={canvasRef} role="img" aria-label={label} />
      <div ref={overlayRef} className="d-overlay" />
      {failed && <p className="d-failed">{failed}</p>}
      <div className="d-controls">
        {full ? (
          <button type="button" className="btn ghost d-btn" onClick={() => void exit()}>
            Exit full screen
          </button>
        ) : (
          <button type="button" className="btn ghost d-btn" onClick={() => void enter()}>
            Full screen
          </button>
        )}
      </div>
      <p className="d-hint">
        {full
          ? 'Drag to look around · scroll or pinch to zoom · Esc to exit'
          : 'Tap a swamp to read it · open full screen to look around and zoom'}
      </p>
    </div>
  );
}
