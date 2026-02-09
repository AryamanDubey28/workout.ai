'use client';

import { WorkoutPreset } from '@/types/workout';
import { Button } from '@/components/ui/button';
import { Dumbbell, ChevronRight } from 'lucide-react';

interface SplitReminderBannerProps {
  nextPreset: WorkoutPreset;
  onStartWorkout: (preset: WorkoutPreset) => void;
}

export function SplitReminderBanner({ nextPreset, onStartWorkout }: SplitReminderBannerProps) {
  return (
    <div className="mb-6 animate-slide-down">
      <button
        onClick={() => onStartWorkout(nextPreset)}
        className="w-full group"
      >
        <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4 hover:border-primary/40 hover:from-primary/15 transition-all duration-300">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <Dumbbell className="h-5 w-5 text-primary" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-sm sm:text-base">
                {nextPreset.name} Day Today
              </p>
              <p className="text-xs text-muted-foreground">
                {nextPreset.exercises.length} exercise{nextPreset.exercises.length !== 1 ? 's' : ''} — tap to start
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-primary">
            <span className="text-sm font-medium hidden sm:inline">Start</span>
            <ChevronRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </button>
    </div>
  );
}
