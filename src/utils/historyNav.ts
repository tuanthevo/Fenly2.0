/**
 * App screens in the browser history, so the phone's back gesture (and the
 * browser's back / forward) moves between Fenly's screens instead of leaving
 * the app.
 *
 * Each distinct screen state is one history entry. Opening a screen pushes an
 * entry; closing it from the app's own buttons goes back one entry when that
 * entry is where we're headed, so back / forward stay in step with what the
 * host sees. Forward re-opens what back closed.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type NavPlan = { type: 'none' } | { type: 'back' } | { type: 'push' } | { type: 'replace' };

/**
 * What a change of screen should do to the history:
 * - nothing, when it's the screen we're on;
 * - go back, when it's the screen one step back (closing what was just opened);
 * - replace the entry, when asked (e.g. publishing: the Create Listing step shouldn't come back);
 * - otherwise push a new entry (dropping any forward entries, like a browser does).
 */
export function planNavigation<T>(
  stack: T[],
  index: number,
  next: T,
  equal: (a: T, b: T) => boolean,
  options: { replace?: boolean } = {}
): NavPlan {
  if (equal(stack[index], next)) return { type: 'none' };
  if (options.replace) return { type: 'replace' };
  if (index > 0 && equal(stack[index - 1], next)) return { type: 'back' };
  return { type: 'push' };
}

const jsonEqual = <T,>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);

type Entry<T> = { index: number; nav: T };
const KEY = 'fenlyNav';

/**
 * Screen state that lives in the browser history. `navigate` takes a new state
 * (or an updater); several calls in the same event are combined into one step.
 */
export function useHistoryNav<T>(initial: T, equal: (a: T, b: T) => boolean = jsonEqual) {
  const [nav, setNav] = useState<T>(initial);
  const [index, setIndex] = useState(0);
  const stack = useRef<T[]>([initial]);
  const indexRef = useRef(0);
  const pending = useRef<{ updaters: ((prev: T) => T)[]; replace: boolean } | null>(null);

  useEffect(() => {
    // Start from a clean entry for this page load (a reload starts over at the feed)
    const entry: Entry<T> = { index: 0, nav: initial };
    window.history.replaceState({ ...(window.history.state ?? {}), [KEY]: entry }, '');
    const onPop = (e: PopStateEvent) => {
      const s = (e.state ?? {})[KEY] as Entry<T> | undefined;
      if (!s) return;
      indexRef.current = s.index;
      stack.current[s.index] = s.nav;
      setIndex(s.index);
      setNav(s.nav);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // initial is only the first state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flush = useCallback(() => {
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    const current = stack.current[indexRef.current];
    const next = p.updaters.reduce((acc, u) => u(acc), current);
    const plan = planNavigation(stack.current, indexRef.current, next, equal, { replace: p.replace });
    if (plan.type === 'none') return;
    if (plan.type === 'back') {
      window.history.back(); // the popstate handler applies the previous screen
      return;
    }
    if (plan.type === 'replace') {
      stack.current[indexRef.current] = next;
      window.history.replaceState({ ...(window.history.state ?? {}), [KEY]: { index: indexRef.current, nav: next } }, '');
      setNav(next);
      return;
    }
    const i = indexRef.current + 1;
    stack.current = [...stack.current.slice(0, i), next];
    indexRef.current = i;
    window.history.pushState({ [KEY]: { index: i, nav: next } satisfies Entry<T> }, '');
    setIndex(i);
    setNav(next);
  }, [equal]);

  const navigate = useCallback(
    (update: T | ((prev: T) => T), options: { replace?: boolean } = {}) => {
      const updater = typeof update === 'function' ? (update as (prev: T) => T) : () => update;
      if (!pending.current) {
        pending.current = { updaters: [], replace: false };
        queueMicrotask(flush);
      }
      pending.current.updaters.push(updater);
      if (options.replace) pending.current.replace = true;
    },
    [flush]
  );

  const back = useCallback(() => {
    if (indexRef.current > 0) window.history.back();
  }, []);

  return { nav, navigate, back, canGoBack: index > 0 };
}
