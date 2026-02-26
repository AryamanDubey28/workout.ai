'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Workout } from '@/types/workout';
import {
  PaletteEntry,
  getWorkoutColor,
  loadColorOverrides,
  saveColorOverrides,
} from '@/lib/calendarColors';

export function useWorkoutColors(workouts: Workout[]) {
  const [overrides, setOverrides] = useState<Record<string, number>>({});

  useEffect(() => {
    setOverrides(loadColorOverrides());
  }, []);

  const uniqueNames = useMemo(() => {
    const names = new Set<string>();
    workouts.forEach((w) => {
      if (w.name) names.add(w.name.toLowerCase().trim());
    });
    return Array.from(names).sort();
  }, [workouts]);

  const getColor = useCallback(
    (name: string): PaletteEntry => getWorkoutColor(name, overrides),
    [overrides]
  );

  const setColorOverride = useCallback((name: string, paletteIndex: number) => {
    const normalized = name.toLowerCase().trim();
    setOverrides((prev) => {
      const next = { ...prev, [normalized]: paletteIndex };
      saveColorOverrides(next);
      return next;
    });
  }, []);

  const removeColorOverride = useCallback((name: string) => {
    const normalized = name.toLowerCase().trim();
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[normalized];
      saveColorOverrides(next);
      return next;
    });
  }, []);

  return { getColor, setColorOverride, removeColorOverride, uniqueNames, overrides };
}
