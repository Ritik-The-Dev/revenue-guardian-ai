/**
 * A clock as React state.
 *
 * Reading `Date.now()` inside a render makes the output depend on when React
 * happened to render, which is neither predictable nor consistent between two
 * components on the same screen. Components that show elapsed time take the
 * current instant from here instead: it is state, it changes on a declared
 * interval, and every consumer of the same interval agrees on it.
 */

import { useEffect, useState } from "react";

export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
