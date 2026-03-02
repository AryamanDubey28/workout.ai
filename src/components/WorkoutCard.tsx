'use client';

import { Workout, Exercise } from '@/types/workout';
import { Trash2, Footprints } from 'lucide-react';
import { calculatePace, formatPace, formatDuration, formatDistance } from '@/lib/utils';

function formatExerciseDetail(exercise: Exercise): string {
  const weight = exercise.weight === 'BW' ? 'BW' : exercise.weight ? `${exercise.weight}kg` : '';

  let setsReps = '';
  if (exercise.useEffectiveReps) {
    setsReps = `${exercise.effectiveRepsMax || '?'}/${exercise.effectiveRepsTarget || '?'} ER`;
  } else if (exercise.repsPerSet && exercise.repsPerSet.length > 0) {
    const allSame = exercise.repsPerSet.every(r => r === exercise.repsPerSet![0]);
    setsReps = allSame
      ? `${exercise.repsPerSet.length}×${exercise.repsPerSet[0]}`
      : exercise.repsPerSet.join(',');
  } else if (exercise.sets && exercise.reps) {
    setsReps = `${exercise.sets}×${exercise.reps}`;
  }

  if (weight && setsReps) return `${weight} × ${setsReps}`;
  return weight || setsReps;
}

interface WorkoutCardProps {
  workout: Workout;
  onClick: () => void;
  onDelete: () => void;
}

export function WorkoutCard({ workout, onClick, onDelete }: WorkoutCardProps) {
  const exercises = workout.exercises.filter((e) => e.name);
  const isRun = (workout.type || 'strength') === 'run';

  return (
    <div
      className="flex items-start gap-3 rounded-xl border border-border/50 bg-card/50 p-4 transition-colors active:bg-card/80 cursor-pointer"
      onClick={onClick}
    >
      <div className="flex-1 min-w-0 overflow-hidden">
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

        {exercises.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {exercises.map((exercise) => {
              const detail = formatExerciseDetail(exercise);
              return (
                <p key={exercise.id} className="text-xs text-muted-foreground truncate">
                  <span className="text-foreground/70">{exercise.name}</span>
                  {detail && <span className="text-muted-foreground"> — {detail}</span>}
                </p>
              );
            })}
          </div>
        )}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
        aria-label={`Delete ${workout.name || 'workout'}`}
        title="Delete workout"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
