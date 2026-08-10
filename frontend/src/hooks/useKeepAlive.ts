import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '../stores/auth.store';
import { warmUpBackend } from '../services/warmup';

// Render free tier spins the backend down after 15 min idle — ping well
// under that while a session is actually active to keep it warm.
const PING_INTERVAL_MS = 10 * 60 * 1000;

// A ping past this is treated as "the backend looks asleep" for status
// purposes, even before it settles — a cold start can take much longer
// than this, so we don't wait for it to know something's off.
const SLOW_THRESHOLD_MS = 3000;

export type ServerStatus = 'checking' | 'ready' | 'waking';

export function useKeepAlive() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [status, setStatus] = useState<ServerStatus>('ready');

  // Single source of truth for pinging the backend, used both by the
  // background interval/visibility logic below and by a manual "wake it up"
  // button — so there's only ever one place that calls warmUpBackend().
  const ping = useCallback(async () => {
    setStatus('checking');
    let settled = false;
    const slowTimer = setTimeout(() => {
      if (!settled) setStatus('waking');
    }, SLOW_THRESHOLD_MS);

    const ok = await warmUpBackend();
    settled = true;
    clearTimeout(slowTimer);
    setStatus(ok ? 'ready' : 'waking');
    return ok;
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    let intervalId: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (intervalId) return;
      intervalId = setInterval(ping, PING_INTERVAL_MS);
    };
    const stop = () => {
      clearInterval(intervalId);
      intervalId = undefined;
    };

    // Background tabs get their timers throttled/suspended by the browser
    // anyway (especially on mobile) — stop explicitly while hidden, and
    // catch up with one immediate ping the moment the tab is visible again
    // rather than waiting for the next 10-minute tick. This is also the
    // ping that surfaces a stale-tab "server fell asleep" status.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        ping();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isAuthenticated, ping]);

  return { status, refresh: ping };
}
