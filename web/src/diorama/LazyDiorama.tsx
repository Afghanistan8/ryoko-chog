import { lazy, Suspense, type ComponentProps } from 'react';

const DioramaStage = lazy(() => import('./DioramaStage').then((m) => ({ default: m.DioramaStage })));

/** Loads the 3D engine only when a page shows the swamp, keeping the first page load light. */
export function LazyDiorama(props: ComponentProps<typeof DioramaStage>) {
  return (
    <Suspense
      fallback={
        <div className="d-stage" role="img" aria-label={props.label}>
          <p className="d-failed">Wading into the swamp…</p>
        </div>
      }
    >
      <DioramaStage {...props} />
    </Suspense>
  );
}
