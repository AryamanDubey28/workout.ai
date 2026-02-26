import { MealCategory } from '@/types/meal';

export function getCategoryForTime(date: Date): MealCategory {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  if (timeInMinutes < 750) return 'breakfast';   // before 12:30
  if (timeInMinutes < 870) return 'lunch';        // 12:30 - 14:30
  if (timeInMinutes < 1065) return 'snack';       // 14:30 - 17:45
  return 'dinner';                                 // 17:45+
}

export function timeToInputValue(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

export function inputValueToDate(timeStr: string, baseDate: Date): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return d;
}
