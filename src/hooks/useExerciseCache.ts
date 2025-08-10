import { useState, useEffect, useCallback } from 'react';

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

export function useExerciseCache() {
  const [cache, setCache] = useState<ExerciseCache | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch and refresh cache from server
  const refreshCache = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/exercises/all');
      
      if (!response.ok) {
        throw new Error('Failed to fetch exercises');
      }
      
      const data = await response.json();
      const newCache: ExerciseCache = {
        exercises: data.exercises,
        lastUpdated: data.lastUpdated,
        count: data.count
      };
      
      setCache(newCache);
      localStorage.setItem(CACHE_KEY, JSON.stringify(newCache));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error refreshing exercise cache:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load cache from localStorage on mount
  useEffect(() => {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const parsedCache = JSON.parse(cached);
        const age = Date.now() - new Date(parsedCache.lastUpdated).getTime();
        
        // Use cache if it's fresh
        if (age < CACHE_DURATION) {
          setCache(parsedCache);
          return;
        }
      } catch (e) {
        console.warn('Failed to parse exercise cache:', e);
      }
    }
    
    // Cache is stale or doesn't exist, fetch fresh data
    refreshCache();
  }, [refreshCache]);

  // Search exercises locally
  const searchExercises = useCallback((query: string, limit: number = 8): CachedExercise[] => {
    if (!cache || !query || query.length < 1) {
      return [];
    }

    const queryLower = query.toLowerCase();
    const matches: Array<{ exercise: CachedExercise; score: number }> = [];

    for (const exercise of cache.exercises) {
      // Check all variations for matches
      for (const variation of exercise.variations) {
        const variationLower = variation.toLowerCase();
        let score = 0;

        // Exact match - highest priority
        if (variationLower === queryLower) {
          score = 1000;
        }
        // Starts with query - high priority
        else if (variationLower.startsWith(queryLower)) {
          score = 500 + (100 - variation.length); // Shorter names score higher
        }
        // Contains query - medium priority
        else if (variationLower.includes(queryLower)) {
          score = 100 + (100 - variation.length);
        }

        if (score > 0) {
          // Boost score for user exercises
          if (exercise.source === 'user') {
            score += 1000 + exercise.usageCount * 10;
          }

          matches.push({ 
            exercise: {
              ...exercise,
              name: variation // Use the matching variation as the display name
            }, 
            score 
          });
          break; // Only count each exercise once
        }
      }
    }

    // Sort by score (highest first) and return top results
    return matches
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(match => match.exercise);
  }, [cache]);

  // Invalidate cache (call this after saving a workout)
  const invalidateCache = useCallback(() => {
    localStorage.removeItem(CACHE_KEY);
    setCache(null);
    refreshCache();
  }, [refreshCache]);

  return {
    isLoading,
    error,
    exercises: cache?.exercises || [],
    searchExercises,
    refreshCache,
    invalidateCache,
    isCacheReady: !!cache && !isLoading
  };
}