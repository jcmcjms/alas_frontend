import { useEffect, useState } from "react"

/**
 * A coarse "now" timestamp for elapsed/deadline displays. Reading the clock is
 * impure, so renders take the value from here instead of calling Date.now()
 * directly; it ticks on an interval (async setState is effect-safe) and the
 * interval keeps elapsed figures honest between background refetches.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
