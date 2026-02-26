import { Workout } from '@/types/workout';

export interface WorkoutGroup {
  label: string;
  workouts: Workout[];
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay();
  // Monday = start of week
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d;
}

function monthYearLabel(date: Date, currentYear: number): string {
  const month = date.toLocaleDateString('en-US', { month: 'long' });
  const year = date.getFullYear();
  return year === currentYear ? month : `${month} ${year}`;
}

export function groupWorkoutsByDate(workouts: Workout[]): WorkoutGroup[] {
  if (workouts.length === 0) return [];

  const now = new Date();
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const thisWeekStart = startOfWeek(now);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const currentYear = now.getFullYear();

  const groups = new Map<string, Workout[]>();
  const groupOrder: string[] = [];

  function addToGroup(label: string, workout: Workout) {
    if (!groups.has(label)) {
      groups.set(label, []);
      groupOrder.push(label);
    }
    groups.get(label)!.push(workout);
  }

  for (const workout of workouts) {
    const workoutDay = startOfDay(workout.date);

    if (workoutDay.getTime() === today.getTime()) {
      addToGroup('Today', workout);
    } else if (workoutDay.getTime() === yesterday.getTime()) {
      addToGroup('Yesterday', workout);
    } else if (workoutDay >= thisWeekStart) {
      addToGroup('This Week', workout);
    } else if (workoutDay >= lastWeekStart) {
      addToGroup('Last Week', workout);
    } else {
      addToGroup(monthYearLabel(workout.date, currentYear), workout);
    }
  }

  return groupOrder.map((label) => ({
    label,
    workouts: groups.get(label)!,
  }));
}
