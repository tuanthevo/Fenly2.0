/**
 * Code-splits a screen or modal without touching its call sites: the returned
 * component renders nothing while `isOpen` (or a custom gate) is false, so a
 * closed modal never downloads its code; otherwise it lazy-loads the real
 * component inside Suspense.
 */
import React, { Suspense } from 'react';
import { Loader2 } from 'lucide-react';

type AnyProps = Record<string, any>;

export const ScreenFallback: React.FC = () => (
  <div className="flex-1 min-h-[30vh] w-full flex items-center justify-center bg-[#F9F7F3] text-[#6E655F]" role="status" aria-label="Loading">
    <Loader2 className="w-5 h-5 animate-spin" />
  </div>
);

export function lazyComponent<P extends AnyProps>(
  load: () => Promise<React.ComponentType<P>>,
  options: { gate?: (props: P) => boolean; fallback?: React.ReactNode } = {}
): React.FC<P> {
  const Lazy = React.lazy(() => load().then((component) => ({ default: component })));
  const Wrapped: React.FC<P> = (props) => {
    if (options.gate && !options.gate(props)) return null;
    return (
      <Suspense fallback={options.fallback ?? null}>
        <Lazy {...(props as any)} />
      </Suspense>
    );
  };
  return Wrapped;
}

/** Modals: nothing is loaded until `isOpen` is true. */
export function lazyModal<P extends { isOpen: boolean }>(load: () => Promise<React.ComponentType<P>>): React.FC<P> {
  return lazyComponent<P>(load, { gate: (p) => p.isOpen });
}

/** Full screens: a spinner while the code arrives. */
export function lazyScreen<P extends AnyProps>(load: () => Promise<React.ComponentType<P>>): React.FC<P> {
  return lazyComponent<P>(load, { fallback: <ScreenFallback /> });
}
