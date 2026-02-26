'use client';

import { WorkoutPreset } from '@/types/workout';
import { Dumbbell, Footprints, ChevronRight } from 'lucide-react';

interface SplitReminderBannerProps {
  nextPreset: WorkoutPreset;
  onStartWorkout: (preset: WorkoutPreset) => void;
}

export function SplitReminderBanner({ nextPreset, onStartWorkout }: SplitReminderBannerProps) {
  const isRun = nextPreset.type === 'run';
  const exerciseNames = isRun
    ? []
    : nextPreset.exercises
        .map((e) => e.name)
        .filter(Boolean)
        .slice(0, 3);

  return (
    <div className="mb-6">
      <button
        onClick={() => onStartWorkout(nextPreset)}
        className="w-full text-left"
      >
        <div className="flex items-center gap-3 rounded-2xl bg-primary/5 p-4">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            {isRun ? (
              <Footprints className="h-5 w-5 text-primary" />
            ) : (
              <Dumbbell className="h-5 w-5 text-primary" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{nextPreset.name}</p>
            <p className="text-xs text-muted-foreground">Up next in your split</p>

            {exerciseNames.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {exerciseNames.map((name, i) => (
                  <span
                    key={i}
                    className="text-[10px] bg-primary/10 text-primary rounded-full px-2 py-0.5"
                  >
                    {name}
                  </span>
                ))}
              </div>
            )}

            {isRun && nextPreset.runData && (
              <p className="text-xs text-muted-foreground mt-1">
                {nextPreset.runData.distanceKm
                  ? `${nextPreset.runData.distanceKm} km`
                  : 'Run'}
                {nextPreset.runData.durationSeconds
                  ? ` — ${Math.floor(nextPreset.runData.durationSeconds / 60)}min target`
                  : ''}
              </p>
            )}
          </div>

          <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center shrink-0">
            <ChevronRight className="h-4 w-4 text-primary-foreground" />
          </div>
        </div>
      </button>
    </div>
  );
}
