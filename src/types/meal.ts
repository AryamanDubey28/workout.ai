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

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}
