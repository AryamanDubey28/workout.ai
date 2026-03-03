'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Workout, WorkoutPreset, ForecastDay } from '@/types/workout';
import { formatCalendarDateKey } from '@/lib/calendarColors';
import { useWorkoutColors } from '@/hooks/useWorkoutColors';
import { CalendarGrid } from '@/components/CalendarGrid';
import { CalendarDayDetail } from '@/components/CalendarDayDetail';
import { CalendarLegend } from '@/components/CalendarLegend';
import { ForecastStrip } from '@/components/ForecastStrip';
import { ForecastDayPicker } from '@/components/ForecastDayPicker';
import { Button } from '@/components/ui/button';
import { Palette, Dumbbell } from 'lucide-react';

interface CalendarViewProps {
  workouts: Workout[];
}

export function CalendarView({ workouts }: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const [presets, setPresets] = useState<WorkoutPreset[]>([]);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [forecastLoading, setForecastLoading] = useState(true);
  const [selectedForecastDay, setSelectedForecastDay] = useState<ForecastDay | null>(null);

  const presetNames = useMemo(
    () => presets.map((p) => p.name),
    [presets],
  );

  // Fetch presets
  useEffect(() => {
    async function loadPresets() {
      try {
        const res = await fetch('/api/presets');
        if (res.ok) {
          const data = await res.json();
          const sorted = (data.presets || []).sort(
            (a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
          );
          setPresets(sorted);
        }
      } catch (err) {
        console.error('Failed to load presets for calendar:', err);
      }
    }
    loadPresets();
  }, []);

  // Fetch forecast
  const loadForecast = useCallback(async () => {
    try {
      const res = await fetch('/api/forecast');
      if (res.ok) {
        const data = await res.json();
        setForecast(data.forecast || []);
      }
    } catch (err) {
      console.error('Failed to load forecast:', err);
    } finally {
      setForecastLoading(false);
    }
  }, []);

  useEffect(() => {
    loadForecast();
  }, [loadForecast]);

  const { getColor, setColorOverride, removeColorOverride, categories, overrides } =
    useWorkoutColors(workouts, presetNames);

  // Build workout-by-date map
  const workoutsByDate = useMemo(() => {
    const map = new Map<string, Workout[]>();
    workouts.forEach((w) => {
      const key = formatCalendarDateKey(w.date);
      const existing = map.get(key) || [];
      existing.push(w);
      map.set(key, existing);
    });
    return map;
  }, [workouts]);

  // Stats for the current month
  const monthStats = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const today = new Date();
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();

    const isCurrentOrFutureMonth =
      year > today.getFullYear() ||
      (year === today.getFullYear() && month >= today.getMonth());
    const daysToCount = isCurrentOrFutureMonth && year === today.getFullYear() && month === today.getMonth()
      ? today.getDate()
      : year < today.getFullYear() || (year === today.getFullYear() && month < today.getMonth())
        ? daysInMonth
        : 0;

    let workoutDays = 0;
    for (let d = 1; d <= daysToCount; d++) {
      const key = formatCalendarDateKey(new Date(year, month, d));
      if (workoutsByDate.has(key)) workoutDays++;
    }

    const restDays = daysToCount - workoutDays;

    return { workoutDays, restDays, daysToCount };
  }, [currentMonth, workoutsByDate]);

  const handlePrevMonth = useCallback(() => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    setSelectedDate(null);
  }, []);

  const handleNextMonth = useCallback(() => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    setSelectedDate(null);
  }, []);

  const handleTodayClick = useCallback(() => {
    setCurrentMonth(new Date());
    setSelectedDate(null);
  }, []);

  const handleSelectDate = useCallback((date: Date) => {
    setSelectedDate((prev) => {
      if (prev && formatCalendarDateKey(prev) === formatCalendarDateKey(date)) {
        return null;
      }
      return date;
    });
  }, []);

  const isViewingCurrentMonth = useMemo(() => {
    const now = new Date();
    return (
      currentMonth.getFullYear() === now.getFullYear() &&
      currentMonth.getMonth() === now.getMonth()
    );
  }, [currentMonth]);

  const selectedDateWorkouts = useMemo(() => {
    if (!selectedDate) return [];
    return workoutsByDate.get(formatCalendarDateKey(selectedDate)) || [];
  }, [selectedDate, workoutsByDate]);

  // Forecast handlers
  const handleForecastDayTap = useCallback((day: ForecastDay) => {
    setSelectedForecastDay(day);
  }, []);

  const handleForecastAssign = useCallback(async (date: string, presetId: string | null) => {
    try {
      const res = await fetch('/api/forecast', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, presetId }),
      });
      if (res.ok) {
        const data = await res.json();
        setForecast(data.forecast || []);
      }
    } catch (err) {
      console.error('Failed to update forecast:', err);
    }
  }, []);

  const handleForecastReset = useCallback(async (date: string) => {
    try {
      const res = await fetch(`/api/forecast?date=${date}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const data = await res.json();
        setForecast(data.forecast || []);
      }
    } catch (err) {
      console.error('Failed to reset forecast:', err);
    }
  }, []);

  return (
    <div className="w-full max-w-lg mx-auto animate-fade-in-blur">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold">Calendar</h1>
          {monthStats.daysToCount > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {monthStats.workoutDays} workout{monthStats.workoutDays !== 1 ? 's' : ''} · {monthStats.restDays} rest day{monthStats.restDays !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowLegend(true)}
          className="h-9 w-9 p-0 rounded-lg interactive-scale"
          title="Workout colours"
        >
          <Palette className="h-5 w-5" />
        </Button>
      </div>

      {/* Forecast Strip */}
      {(presets.length > 0 || forecastLoading) && (
        <ForecastStrip
          forecast={forecast}
          getColor={getColor}
          onDayTap={handleForecastDayTap}
          isLoading={forecastLoading}
        />
      )}

      {/* Calendar Grid */}
      <CalendarGrid
        currentMonth={currentMonth}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        workoutsByDate={workoutsByDate}
        selectedDate={selectedDate}
        onSelectDate={handleSelectDate}
        getColor={getColor}
        onTodayClick={handleTodayClick}
        isCurrentMonth={isViewingCurrentMonth}
      />

      {/* Monthly summary */}
      {workouts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground animate-slide-up">
          <div className="w-14 h-14 bg-muted/50 rounded-2xl flex items-center justify-center mb-3">
            <Dumbbell className="h-7 w-7 text-muted-foreground/60" />
          </div>
          <p className="text-sm font-medium">No workouts yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Log your first workout to see it here
          </p>
        </div>
      )}

      {/* Day Detail Sheet */}
      <CalendarDayDetail
        date={selectedDate}
        workouts={selectedDateWorkouts}
        getColor={getColor}
        open={selectedDate !== null}
        onClose={() => setSelectedDate(null)}
      />

      {/* Forecast Day Picker Sheet */}
      <ForecastDayPicker
        day={selectedForecastDay}
        presets={presets}
        getColor={getColor}
        open={selectedForecastDay !== null}
        onClose={() => setSelectedForecastDay(null)}
        onSelect={handleForecastAssign}
        onReset={handleForecastReset}
      />

      {/* Legend Sheet */}
      <CalendarLegend
        categories={categories}
        getColor={getColor}
        overrides={overrides}
        onSetColor={setColorOverride}
        onResetColor={removeColorOverride}
        open={showLegend}
        onClose={() => setShowLegend(false)}
      />
    </div>
  );
}
