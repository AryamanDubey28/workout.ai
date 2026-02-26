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
  return (
    <button
      onClick={onTap}
      className={cn(
        'relative flex flex-col items-center justify-start p-1 h-14 w-full rounded-lg transition-all duration-200',
        isCurrentMonth ? 'text-foreground' : 'text-muted-foreground/30 pointer-events-none',
        isToday && 'ring-2 ring-primary/40',
        isSelected && 'bg-primary/10',
        isCurrentMonth && workouts.length > 0 && 'hover:bg-accent/50 cursor-pointer',
        isCurrentMonth && workouts.length === 0 && 'cursor-default',
        'active:scale-95'
      )}
    >
      <span
        className={cn(
          'text-sm font-medium leading-none',
          isToday && 'text-primary font-bold'
        )}
      >
        {date.getDate()}
      </span>

      <div className="flex gap-0.5 mt-auto mb-0.5">
        {workouts.length > 0 ? (
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
