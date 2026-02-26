'use client';

import { Workout } from '@/types/workout';
import { Trash2, Footprints } from 'lucide-react';
import { calculatePace, formatPace, formatDuration, formatDistance } from '@/lib/utils';

interface WorkoutCardProps {
  workout: Workout;
  onClick: () => void;
  onDelete: () => void;
}

export function WorkoutCard({ workout, onClick, onDelete }: WorkoutCardProps) {
  const exerciseNames = workout.exercises
    .map((e) => e.name)
    .filter(Boolean);

  const displayNames = exerciseNames.slice(0, 3);
  const extraCount = exerciseNames.length - 3;
  const exerciseSummary =
    displayNames.join(' / ') + (extraCount > 0 ? ` +${extraCount}` : '');

  const isRun = (workout.type || 'strength') === 'run';

  return (
    <div
      className="flex items-start gap-3 rounded-xl border border-border/50 bg-card/50 p-4 transition-colors active:bg-card/80 cursor-pointer"
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm truncate">
            {workout.name || 'Untitled Workout'}
          </span>
          {isRun && (
            <span className="shrink-0 inline-flex items-center gap-1 text-xs text-primary bg-primary/10 rounded-full px-2 py-0.5">
              <Footprints className="h-3 w-3" />
              Run
            </span>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-0.5">
          {workout.date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year:
              workout.date.getFullYear() !== new Date().getFullYear()
                ? 'numeric'
                : undefined,
          })}
        </p>

        {workout.runData && (
          <p className="text-xs text-muted-foreground mt-1">
            {formatDistance(workout.runData.distanceKm)}
            {' | '}
            {formatDuration(workout.runData.durationSeconds)}
            {(() => {
              const pace = calculatePace(
                workout.runData!.distanceKm,
                workout.runData!.durationSeconds
              );
              return pace ? ` | ${formatPace(pace)}` : '';
            })()}
          </p>
        )}

        {exerciseSummary && (
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {exerciseSummary}
          </p>
        )}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="shrink-0 p-1.5 rounded-lg text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
        title="Delete workout"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
