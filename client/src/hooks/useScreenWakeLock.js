import { useEffect, useRef, useState } from 'react';

/**
 * Keeps the screen awake while `active` is true.
 *
 * Catan turns can run 3-5 minutes of pure negotiation; the default screen-dim
 * locks the phone, suspends JS, and drops the WebSocket. The lock is released
 * automatically when the tab backgrounds, so we re-acquire on visibilitychange.
 *
 * Returns `{ supported, held, error }` so callers can surface a one-time toast
 * on unsupported browsers (Safari <16.4) telling the user the phone may dim.
 */
export function useScreenWakeLock(active) {
  const sentinelRef = useRef(null);
  const [held, setHeld] = useState(false);
  const [error, setError] = useState(null);
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  useEffect(() => {
    if (!active || !supported) return;
    let cancelled = false;

    const acquire = async () => {
      try {
        const s = await navigator.wakeLock.request('screen');
        if (cancelled) {
          s.release();
          return;
        }
        sentinelRef.current = s;
        setHeld(true);
        s.addEventListener('release', () => {
          if (sentinelRef.current === s) {
            sentinelRef.current = null;
            setHeld(false);
          }
        });
      } catch (err) {
        // Most common cause on real devices: request outside a user gesture.
        if (!cancelled) setError(err);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !sentinelRef.current) {
        acquire();
      }
    };

    acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      const s = sentinelRef.current;
      sentinelRef.current = null;
      setHeld(false);
      s?.release?.().catch(() => {});
    };
  }, [active, supported]);

  return { supported, held, error };
}
