'use client';

import { ForecastDay } from '@/types/workout';
import { PaletteEntry } from '@/lib/calendarColors';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Moon, Pencil } from 'lucide-react';

interface ForecastStripProps {
  forecast: ForecastDay[];
  getColor: (name: string) => PaletteEntry;
  onDayTap: (day: ForecastDay) => void;
  isLoading: boolean;
}

function isToday(dateStr: string): boolean {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return dateStr === today;
}

function formatDayLabel(dateStr: string): { dayName: string; dateNum: number } {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const dayName = date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  return { dayName, dateNum: day };
}

export function ForecastStrip({ forecast, getColor, onDayTap, isLoading }: ForecastStripProps) {
  if (isLoading) {
    return (
      <div className="mb-4">
        <p className="text-xs font-medium text-muted-foreground mb-2">Forecast</p>
        <div className="flex gap-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="flex-1 min-w-[4.5rem] h-[4.5rem] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (forecast.length === 0) return null;

  return (
    <div className="mb-4">
      <p className="text-xs font-medium text-muted-foreground mb-2">Forecast</p>
      <div className="flex gap-1 overflow-x-auto scrollbar-hide">
        {forecast.map((day) => {
          const today = isToday(day.date);
          const { dayName, dateNum } = formatDayLabel(day.date);
          const isRest = day.presetId === null;
          const color = !isRest && day.presetName ? getColor(day.presetName) : null;

          return (
            <button
              key={day.date}
              onClick={() => onDayTap(day)}
              className={cn(
                'flex-1 min-w-[4.5rem] flex flex-col items-center justify-center gap-0.5 rounded-xl p-1.5 transition-colors relative',
                'active:scale-95',
                today && 'ring-2 ring-primary/50',
                isRest
                  ? 'bg-muted/30'
                  : 'border border-border/30',
              )}
              style={
                !isRest && color
                  ? { backgroundColor: `${color.hex}15` }
                  : undefined
              }
            >
              {/* Override indicator */}
              {day.isOverride && (
                <Pencil className="absolute top-1 right-1 h-2.5 w-2.5 text-muted-foreground/50" />
              )}

              {/* Day name */}
              <span className={cn(
                'text-[10px] leading-none',
                today ? 'text-primary font-bold' : 'text-muted-foreground',
              )}>
                {dayName}
              </span>

              {/* Date number */}
              <span className={cn(
                'text-sm font-semibold leading-none',
                today ? 'text-primary' : isRest ? 'text-muted-foreground' : color?.text || '',
              )}>
                {dateNum}
              </span>

              {/* Workout indicator */}
              {isRest ? (
                <Moon className="h-3 w-3 text-muted-foreground/50 mt-0.5" />
              ) : color ? (
                <div className="flex items-center gap-1 mt-0.5 max-w-full px-0.5">
                  <div className={cn('w-2 h-2 rounded-full shrink-0', color.dot)} />
                  <span className={cn(
                    'text-[9px] leading-none truncate',
                    today ? 'text-primary/80' : 'text-muted-foreground',
                  )}>
                    {day.presetName}
                  </span>
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
