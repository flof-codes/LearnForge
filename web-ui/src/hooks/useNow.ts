import { useEffect, useState } from 'react';

/**
 * Returns the current timestamp, refreshed at the given interval.
 * Use when rendering time-relative labels ("expires in 2h") that should
 * update without a manual page refresh.
 *
 * Captures Date.now() in state to satisfy react-hooks/purity (no impure
 * calls during render).
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
