'use client';

import { Workout } from '@/types/workout';
import { PaletteEntry } from '@/lib/calendarColors';
import { cn } from '@/lib/utils';
import { calculatePace, formatPace, formatDuration, formatDistance } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Moon, CalendarClock, Footprints } from 'lucide-react';

interface CalendarDayDetailProps {
  date: Date | null;
  workouts: Workout[];
  getColor: (name: string) => PaletteEntry;
  open: boolean;
  onClose: () => void;
}

function isFutureDate(date: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d > today;
}

function formatExercise(exercise: any): string {
  if (exercise.useEffectiveReps) {
    const weight = exercise.weight === 'BW' ? 'BW' : exercise.weight ? `${exercise.weight}kg` : '';
    const max = exercise.effectiveRepsMax || 0;
    const target = exercise.effectiveRepsTarget || 0;
    return `${exercise.name} ${weight} - ${max}/${target} ER`.trim();
  }

  const hasPerSetWeights = exercise.weightsPerSet && exercise.weightsPerSet.length > 0;

  if (hasPerSetWeights) {
    const setDetails = [];
    for (let i = 0; i < exercise.weightsPerSet.length; i++) {
      const weight = exercise.weightsPerSet[i];
      const reps = exercise.repsPerSet?.[i] || '?';
      const weightStr = weight === 'BW' ? 'BW' : weight ? `${weight}kg` : '?kg';
      setDetails.push(`${weightStr}x${reps}`);
    }
    return `${exercise.name} - ${setDetails.join(', ')}`;
  }

  const weight = exercise.weight === 'BW' ? 'BW' : exercise.weight ? `${exercise.weight}kg` : '';

  if (exercise.repsPerSet && exercise.repsPerSet.length > 0) {
    const sets = exercise.repsPerSet.length;
    const allSameReps = exercise.repsPerSet.every(
      (reps: number) => reps === exercise.repsPerSet[0]
    );
    if (allSameReps) {
      return `${exercise.name} ${weight} - ${sets}x${exercise.repsPerSet[0]}`.trim();
    }
    return `${exercise.name} ${weight} - ${exercise.repsPerSet.join(', ')}`.trim();
  }

  const sets = exercise.sets || 0;
  const reps = exercise.reps || 0;
  return `${exercise.name} ${weight} - ${sets}x${reps}`.trim();
}

export function CalendarDayDetail({
  date,
  workouts,
  getColor,
  open,
  onClose,
}: CalendarDayDetailProps) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[70vh] rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>
            {date?.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </SheetTitle>
          <SheetDescription>
            {workouts.length > 0
              ? `${workouts.length} workout${workouts.length !== 1 ? 's' : ''}`
              : date && isFutureDate(date)
                ? 'Upcoming'
                : 'Rest Day'}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-4 pb-6">
          {workouts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              {date && isFutureDate(date) ? (
                <>
                  <div className="w-14 h-14 bg-muted/50 rounded-2xl flex items-center justify-center mb-3">
                    <CalendarClock className="h-7 w-7 text-muted-foreground/60" />
                  </div>
                  <p className="text-sm font-medium">Not Logged Yet</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">This day hasn&apos;t happened yet</p>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 bg-muted/50 rounded-2xl flex items-center justify-center mb-3">
                    <Moon className="h-7 w-7 text-muted-foreground/60" />
                  </div>
                  <p className="text-sm font-medium">Rest Day</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">No workouts logged</p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3 stagger-children">
              {workouts.map((workout) => {
                const color = getColor(workout.name || 'Workout');
                const displayExercises = workout.exercises.slice(0, 5);
                const hasMore = workout.exercises.length > 5;

                return (
                  <div
                    key={workout.id}
                    className="rounded-xl border border-border/50 bg-card/50 p-4"
                  >
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className={cn('w-3 h-3 rounded-full shrink-0', color.dot)} />
                      <span className="text-sm font-semibold flex-1">
                        {workout.name || 'Untitled Workout'}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        {(workout.type || 'strength') === 'run' ? (
                          <span className="flex items-center gap-1">
                            <Footprints className="h-3 w-3" /> Run
                          </span>
                        ) : (
                          `${workout.exercises.length} exercise${workout.exercises.length !== 1 ? 's' : ''}`
                        )}
                      </Badge>
                    </div>

                    {workout.runData && (
                      <div className="flex items-center gap-3 text-xs mb-3 pb-3 border-b border-border/30 text-muted-foreground">
                        <Footprints className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span>{formatDistance(workout.runData.distanceKm)}</span>
                        <span className="text-border">|</span>
                        <span>{formatDuration(workout.runData.durationSeconds)}</span>
                        {(() => {
                          const pace = calculatePace(
                            workout.runData!.distanceKm,
                            workout.runData!.durationSeconds
                          );
                          return pace ? (
                            <>
                              <span className="text-border">|</span>
                              <span className="text-primary font-medium">
                                {formatPace(pace)}
                              </span>
                            </>
                          ) : null;
                        })()}
                      </div>
                    )}

                    {displayExercises.length > 0 && (
                      <div className="space-y-1.5">
                        {displayExercises.map((exercise) => (
                          <div
                            key={exercise.id}
                            className="text-xs text-muted-foreground leading-relaxed"
                          >
                            <span
                              className={cn(
                                'inline-block w-1.5 h-1.5 rounded-full mr-2',
                                color.dot,
                                'opacity-40'
                              )}
                            />
                            {formatExercise(exercise)}
                          </div>
                        ))}
                        {hasMore && (
                          <div className="text-[11px] text-muted-foreground/60 italic pl-3.5">
                            +{workout.exercises.length - 5} more...
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
