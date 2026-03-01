import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';

interface CachedExercise {
  name: string;
  variations: string[];
  lastWeight?: string | null;
  lastSets?: number | null;
  lastReps?: number | null;
  lastEffectiveRepsMax?: number | null;
  lastEffectiveRepsTarget?: number | null;
  useEffectiveReps?: boolean;
  usageCount: number;
  updatedAt?: string | null;
  source: 'user' | 'common';
  category?: string;
}

interface ExerciseCache {
  exercises: CachedExercise[];
  lastUpdated: string;
  count: number;
}

const CACHE_KEY = 'workout-ai-exercises';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// ── Module-level singleton cache ──────────────────────────────────
// Shared across all hook instances so only one fetch ever fires.
let singletonCache: ExerciseCache | null = null;
let singletonLoading = false;
let singletonError: string | null = null;
let fetchPromise: Promise<void> | null = null;
const listeners: Set<() => void> = new Set();

// Snapshot counter to drive useSyncExternalStore re-renders
let snapshotVersion = 0;
function getSnapshot() {
  return snapshotVersion;
}
function notify() {
  snapshotVersion++;
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function loadFromLocalStorage(): ExerciseCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: ExerciseCache = JSON.parse(raw);
    const age = Date.now() - new Date(parsed.lastUpdated).getTime();
    if (age < CACHE_DURATION) return parsed;
    return null; // stale
  } catch {
    return null;
  }
}

function loadStaleFromLocalStorage(): ExerciseCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function doFetch() {
  // If already fetching, piggyback on the existing promise
  if (fetchPromise) return fetchPromise;

  singletonLoading = true;
  singletonError = null;
  notify();

  fetchPromise = (async () => {
    try {
      const response = await fetch('/api/exercises/all', {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to fetch exercises`);
      }

      const data = await response.json();
      const newCache: ExerciseCache = {
        exercises: data.exercises || [],
        lastUpdated: data.lastUpdated || new Date().toISOString(),
        count: data.count || 0,
      };

      singletonCache = newCache;
      localStorage.setItem(CACHE_KEY, JSON.stringify(newCache));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      singletonError = errorMessage;
      console.error('Error refreshing exercise cache:', err);

      // Fallback to stale cache
      const stale = loadStaleFromLocalStorage();
      if (stale) {
        singletonCache = stale;
        console.log('Using cached exercise data as fallback');
      }
    } finally {
      singletonLoading = false;
      fetchPromise = null;
      notify();
    }
  })();

  return fetchPromise;
}

function ensureCache() {
  // Already have fresh in-memory data
  if (singletonCache) return;

  // Try localStorage first
  const fresh = loadFromLocalStorage();
  if (fresh) {
    singletonCache = fresh;
    notify();
    return;
  }

  // Need to fetch
  doFetch();
}

// ── Public hook ───────────────────────────────────────────────────

export function useExerciseCache() {
  // Subscribe to singleton changes — triggers re-render when notify() is called
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // On first mount of any instance, ensure cache is populated
  useEffect(() => {
    ensureCache();
  }, []);

  // Search exercises locally
  const searchExercises = useCallback((query: string, limit: number = 8): CachedExercise[] => {
    if (!singletonCache || !query || query.length < 1) {
      return [];
    }

    const queryLower = query.toLowerCase();
    const matches: Array<{ exercise: CachedExercise; score: number }> = [];

    for (const exercise of singletonCache.exercises) {
      for (const variation of exercise.variations) {
        const variationLower = variation.toLowerCase();
        let score = 0;

        if (variationLower === queryLower) {
          score = 1000;
        } else if (variationLower.startsWith(queryLower)) {
          score = 500 + (100 - variation.length);
        } else if (variationLower.includes(queryLower)) {
          score = 100 + (100 - variation.length);
        }

        if (score > 0) {
          if (exercise.source === 'user') {
            score += 1000 + exercise.usageCount * 10;
          }

          matches.push({
            exercise: { ...exercise, name: variation },
            score,
          });
          break;
        }
      }
    }

    return matches
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((match) => match.exercise);
  }, []);

  // Invalidate and re-fetch
  const invalidateCache = useCallback(() => {
    localStorage.removeItem(CACHE_KEY);
    singletonCache = null;
    notify();
    doFetch();
  }, []);

  // Manual refresh
  const refreshCache = useCallback(() => {
    doFetch();
  }, []);

  return {
    isLoading: singletonLoading,
    error: singletonError,
    exercises: singletonCache?.exercises || [],
    searchExercises,
    refreshCache,
    invalidateCache,
    isCacheReady: !!singletonCache && !singletonLoading,
  };
}
