export interface PaletteEntry {
  name: string;
  bg: string;
  text: string;
  hex: string;
  dot: string;
}

export const WORKOUT_COLOR_PALETTE: PaletteEntry[] = [
  { name: 'Blue',    bg: 'bg-blue-500',    text: 'text-blue-500',    hex: '#3b82f6', dot: 'bg-blue-500'    },
  { name: 'Emerald', bg: 'bg-emerald-500', text: 'text-emerald-500', hex: '#10b981', dot: 'bg-emerald-500' },
  { name: 'Violet',  bg: 'bg-violet-500',  text: 'text-violet-500',  hex: '#8b5cf6', dot: 'bg-violet-500'  },
  { name: 'Amber',   bg: 'bg-amber-500',   text: 'text-amber-500',   hex: '#f59e0b', dot: 'bg-amber-500'   },
  { name: 'Rose',    bg: 'bg-rose-500',     text: 'text-rose-500',    hex: '#f43f5e', dot: 'bg-rose-500'    },
  { name: 'Cyan',    bg: 'bg-cyan-500',     text: 'text-cyan-500',    hex: '#06b6d4', dot: 'bg-cyan-500'    },
  { name: 'Orange',  bg: 'bg-orange-500',   text: 'text-orange-500',  hex: '#f97316', dot: 'bg-orange-500'  },
  { name: 'Pink',    bg: 'bg-pink-500',     text: 'text-pink-500',    hex: '#ec4899', dot: 'bg-pink-500'    },
  { name: 'Teal',    bg: 'bg-teal-500',     text: 'text-teal-500',    hex: '#14b8a6', dot: 'bg-teal-500'    },
  { name: 'Indigo',  bg: 'bg-indigo-500',   text: 'text-indigo-500',  hex: '#6366f1', dot: 'bg-indigo-500'  },
];

const STORAGE_KEY = 'workout-ai-calendar-color-overrides';

export function hashWorkoutName(name: string): number {
  let hash = 0;
  const normalized = name.toLowerCase().trim();
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash) % WORKOUT_COLOR_PALETTE.length;
}

export function getWorkoutColor(name: string, overrides: Record<string, number>): PaletteEntry {
  const normalized = name.toLowerCase().trim();
  const overrideIndex = overrides[normalized];
  const index = overrideIndex !== undefined ? overrideIndex : hashWorkoutName(name);
  return WORKOUT_COLOR_PALETTE[index];
}

export function loadColorOverrides(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveColorOverrides(overrides: Record<string, number>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {}
}

export function formatCalendarDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
