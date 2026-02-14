export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MealItem {
  name: string;
  macros: Macros;
}

export type MealCategory = 'breakfast' | 'lunch' | 'snack' | 'dinner';

export const MEAL_CATEGORIES: { key: MealCategory; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'snack', label: 'Snack' },
  { key: 'dinner', label: 'Dinner' },
];

export interface Meal {
  id: string;
  description: string;
  macros: Macros;
  category: MealCategory;
  imageUrl?: string;
  createdAt: Date;
}

export interface DailyMacros {
  date: string; // YYYY-MM-DD
  meals: Meal[];
  totals: Macros;
}

export type GoalType = 'cutting' | 'bulking' | 'maintenance' | 'custom';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Sex = 'male' | 'female';

export interface MacroGoal {
  goalType: GoalType;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  heightCm?: number;
  activityLevel?: ActivityLevel;
  sex?: Sex;
}

export interface SavedMeal {
  id: string;
  name: string;
  description: string;
  macros: Macros;
  createdAt: Date;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}
