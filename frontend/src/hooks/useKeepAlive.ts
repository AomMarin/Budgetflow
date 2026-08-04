import { useEffect } from 'react';
import { useAuthStore } from '../stores/auth.store';
import { warmUpBackend } from '../services/warmup';

// Render free tier spins the backend down after 15 min idle — ping well
// under that while a session is actually active to keep it warm.
const PING_INTERVAL_MS = 10 * 60 * 1000;

export function useKeepAlive() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;

    let intervalId: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (intervalId) return;
      intervalId = setInterval(warmUpBackend, PING_INTERVAL_MS);
    };
    const stop = () => {
      clearInterval(intervalId);
      intervalId = undefined;
    };

    // Background tabs get their timers throttled/suspended by the browser
    // anyway (especially on mobile) — stop explicitly while hidden, and
    // catch up with one immediate ping the moment the tab is visible again
    // rather than waiting for the next 10-minute tick.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        warmUpBackend();
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
  }, [isAuthenticated]);
}
