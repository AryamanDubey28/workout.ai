export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Meal {
  id: string;
  description: string;
  macros: Macros;
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

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}
