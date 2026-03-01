import { useState, useEffect, useRef, useCallback, type RefObject } from 'react';

export function useScrollDirection({
  enabled = true,
  threshold = 10,
  topThreshold = 50,
  scrollRef,
}: {
  enabled?: boolean;
  threshold?: number;
  topThreshold?: number;
  scrollRef?: RefObject<HTMLElement | null>;
} = {}) {
  const [barsHidden, setBarsHidden] = useState(false);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  const handleScroll = useCallback(() => {
    if (!ticking.current) {
      window.requestAnimationFrame(() => {
        const el = scrollRef?.current;
        const currentScrollY = el ? el.scrollTop : window.scrollY;

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
  }, [threshold, topThreshold, scrollRef]);

  useEffect(() => {
    if (!enabled) {
      setBarsHidden(false);
      return;
    }

    const el = scrollRef?.current;
    const target = el || window;
    lastScrollY.current = el ? el.scrollTop : window.scrollY;
    target.addEventListener('scroll', handleScroll, { passive: true });
    return () => target.removeEventListener('scroll', handleScroll);
  }, [enabled, handleScroll, scrollRef]);

  return { barsHidden };
}
