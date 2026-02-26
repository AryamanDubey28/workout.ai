'use client';

import { Workout } from '@/types/workout';
import { PaletteEntry } from '@/lib/calendarColors';
import { cn } from '@/lib/utils';

interface CalendarDayCellProps {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  workouts: Workout[];
  getColor: (name: string) => PaletteEntry;
  onTap: () => void;
}

export function CalendarDayCell({
  date,
  isCurrentMonth,
  isToday,
  isSelected,
  workouts,
  getColor,
  onTap,
}: CalendarDayCellProps) {
  const hasWorkouts = workouts.length > 0;
  // Use the first workout's colour as the cell background
  const primaryColor = hasWorkouts ? getColor(workouts[0].name || 'Workout') : null;

  return (
    <button
      onClick={onTap}
      className={cn(
        'relative flex flex-col items-center justify-start p-1 h-14 w-full rounded-lg transition-all duration-200',
        isCurrentMonth ? '' : 'opacity-20 pointer-events-none',
        isToday && 'ring-2 ring-primary/50',
        isSelected && !hasWorkouts && 'bg-primary/10',
        isSelected && hasWorkouts && 'ring-2 ring-foreground/30',
        !hasWorkouts && isCurrentMonth && isPastOrToday(date) && 'cursor-pointer',
        !hasWorkouts && isCurrentMonth && !isPastOrToday(date) && 'cursor-default',
        hasWorkouts && isCurrentMonth && 'cursor-pointer',
        'active:scale-95'
      )}
      style={
        hasWorkouts && isCurrentMonth
          ? { backgroundColor: `${primaryColor!.hex}20` }
          : undefined
      }
    >
      <span
        className={cn(
          'text-sm font-medium leading-none z-10',
          isToday && 'text-primary font-bold',
          hasWorkouts && isCurrentMonth && !isToday && primaryColor?.text
        )}
      >
        {date.getDate()}
      </span>

      <div className="flex gap-0.5 mt-auto mb-0.5">
        {hasWorkouts ? (
          <>
            {workouts.slice(0, 3).map((w, i) => {
              const color = getColor(w.name || 'Workout');
              return (
                <div
                  key={i}
                  className={cn('w-1.5 h-1.5 rounded-full', color.dot)}
                />
              );
            })}
            {workouts.length > 3 && (
              <span className="text-[8px] text-muted-foreground leading-none">
                +{workouts.length - 3}
              </span>
            )}
          </>
        ) : isCurrentMonth && isPastOrToday(date) ? (
          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/20" />
        ) : null}
      </div>
    </button>
  );
}

function isPastOrToday(date: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d <= today;
}
