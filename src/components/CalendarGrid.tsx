'use client';

import { useMemo } from 'react';
import { Workout } from '@/types/workout';
import { PaletteEntry, formatCalendarDateKey } from '@/lib/calendarColors';
import { Button } from '@/components/ui/button';
import { CalendarDayCell } from '@/components/CalendarDayCell';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CalendarGridProps {
  currentMonth: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  workoutsByDate: Map<string, Workout[]>;
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
  getColor: (name: string) => PaletteEntry;
  onTodayClick: () => void;
  isCurrentMonth: boolean;
}

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startDayOfWeek = firstDay.getDay();

  const days: { date: Date; isCurrentMonth: boolean }[] = [];

  // Previous month trailing days
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    days.push({
      date: new Date(year, month - 1, prevMonthLastDay - i),
      isCurrentMonth: false,
    });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({
      date: new Date(year, month, d),
      isCurrentMonth: true,
    });
  }

  // Fill to complete rows (5 or 6 rows of 7)
  const remainingCells = days.length <= 35 ? 35 - days.length : 42 - days.length;
  for (let d = 1; d <= remainingCells; d++) {
    days.push({
      date: new Date(year, month + 1, d),
      isCurrentMonth: false,
    });
  }

  return days;
}

export function CalendarGrid({
  currentMonth,
  onPrevMonth,
  onNextMonth,
  workoutsByDate,
  selectedDate,
  onSelectDate,
  getColor,
  onTodayClick,
  isCurrentMonth: isViewingCurrentMonth,
}: CalendarGridProps) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const days = useMemo(() => getCalendarDays(year, month), [year, month]);

  const todayKey = formatCalendarDateKey(new Date());
  const selectedKey = selectedDate ? formatCalendarDateKey(selectedDate) : null;

  return (
    <div>
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onPrevMonth}
          className="h-9 w-9 p-0 rounded-lg interactive-scale"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>

        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">
            {currentMonth.toLocaleDateString('en-US', {
              month: 'long',
              year: 'numeric',
            })}
          </h2>
          {!isViewingCurrentMonth && (
            <button
              onClick={onTodayClick}
              className="text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full hover:bg-primary/20 transition-colors"
            >
              Today
            </button>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onNextMonth}
          className="h-9 w-9 p-0 rounded-lg interactive-scale"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Day-of-week labels */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map((label, i) => (
          <div
            key={i}
            className="text-center text-[11px] font-medium text-muted-foreground py-1.5"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {days.map(({ date, isCurrentMonth }, i) => {
          const dateKey = formatCalendarDateKey(date);
          const dayWorkouts = workoutsByDate.get(dateKey) || [];
          const isToday = dateKey === todayKey;
          const isSelected = dateKey === selectedKey;

          return (
            <CalendarDayCell
              key={i}
              date={date}
              isCurrentMonth={isCurrentMonth}
              isToday={isToday}
              isSelected={isSelected}
              workouts={dayWorkouts}
              getColor={getColor}
              onTap={() => isCurrentMonth && onSelectDate(date)}
            />
          );
        })}
      </div>
    </div>
  );
}
