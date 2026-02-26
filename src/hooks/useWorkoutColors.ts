'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Workout } from '@/types/workout';
import {
  PaletteEntry,
  getWorkoutColor,
  matchWorkoutToPreset,
  loadColorOverrides,
  saveColorOverrides,
} from '@/lib/calendarColors';

export function useWorkoutColors(workouts: Workout[], presetNames: string[]) {
  const [overrides, setOverrides] = useState<Record<string, number>>({});

  useEffect(() => {
    setOverrides(loadColorOverrides());
  }, []);

  // Derive colour categories: preset names + any unmatched workout names
  const categories = useMemo(() => {
    const presetSet = new Set(presetNames.map((p) => p.toLowerCase().trim()));
    const unmatchedSet = new Set<string>();

    workouts.forEach((w) => {
      if (!w.name) return;
      const match = matchWorkoutToPreset(w.name, presetNames);
      if (!match) {
        unmatchedSet.add(w.name.toLowerCase().trim());
      }
    });

    // Presets first (in their split order), then unmatched sorted alphabetically
    return [
      ...presetNames.map((p) => p.toLowerCase().trim()),
      ...Array.from(unmatchedSet).sort(),
    ];
  }, [workouts, presetNames]);

  const getColor = useCallback(
    (name: string): PaletteEntry => getWorkoutColor(name, overrides, presetNames),
    [overrides, presetNames]
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

  return { getColor, setColorOverride, removeColorOverride, categories, overrides };
}
