import { useState, useEffect, useRef, useCallback } from 'react';

export function useScrollDirection({
  enabled = true,
  threshold = 10,
  topThreshold = 50,
}: {
  enabled?: boolean;
  threshold?: number;
  topThreshold?: number;
} = {}) {
  const [barsHidden, setBarsHidden] = useState(false);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  const handleScroll = useCallback(() => {
    if (!ticking.current) {
      window.requestAnimationFrame(() => {
        const currentScrollY = window.scrollY;

        if (currentScrollY < topThreshold) {
          setBarsHidden(false);
          lastScrollY.current = currentScrollY;
          ticking.current = false;
          return;
        }

        const delta = currentScrollY - lastScrollY.current;

        if (delta > threshold) {
          setBarsHidden(true);
          lastScrollY.current = currentScrollY;
        } else if (delta < -threshold) {
          setBarsHidden(false);
          lastScrollY.current = currentScrollY;
        }

        ticking.current = false;
      });
      ticking.current = true;
    }
  }, [threshold, topThreshold]);

  useEffect(() => {
    if (!enabled) {
      setBarsHidden(false);
      return;
    }

    lastScrollY.current = window.scrollY;
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [enabled, handleScroll]);

  return { barsHidden };
}
