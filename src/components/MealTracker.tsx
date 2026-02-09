'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, ChevronLeft, ChevronRight, Loader2, UtensilsCrossed, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MealCard } from '@/components/MealCard';
import { Meal, Macros, MacroGoal } from '@/types/meal';

function formatDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatDateDisplay(date: Date): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (formatDateKey(date) === formatDateKey(today)) return 'Today';
  if (formatDateKey(date) === formatDateKey(yesterday)) return 'Yesterday';

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function ProgressBar({ current, target, color }: { current: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const isOver = current > target && target > 0;
  return (
    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mt-1">
      <div
        className={`h-full rounded-full transition-all duration-500 ${isOver ? 'bg-destructive' : color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function MealTracker() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [meals, setMeals] = useState<Meal[]>([]);
  const [totals, setTotals] = useState<Macros>({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [goal, setGoal] = useState<MacroGoal | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadGoal = useCallback(async () => {
    try {
      const res = await fetch('/api/goals');
      if (res.ok) {
        const data = await res.json();
        if (data.goal) setGoal(data.goal);
      }
    } catch (err) {
      console.error('Failed to load goal:', err);
    }
  }, []);

  const loadMeals = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const dateKey = formatDateKey(selectedDate);
      const res = await fetch(`/api/meals?date=${dateKey}`);
      if (res.ok) {
        const data = await res.json();
        setMeals(
          data.meals.map((m: any) => ({
            ...m,
            createdAt: new Date(m.createdAt),
          }))
        );
        setTotals(data.totals);
      }
    } catch (err) {
      console.error('Failed to load meals:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadGoal();
  }, [loadGoal]);

  useEffect(() => {
    loadMeals();
  }, [loadMeals]);

  const handlePrevDay = () => {
    setSelectedDate((d) => {
      const prev = new Date(d);
      prev.setDate(prev.getDate() - 1);
      return prev;
    });
  };

  const handleNextDay = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (selectedDate >= tomorrow) return; // Don't go past today
    setSelectedDate((d) => {
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      return next;
    });
  };

  const handleImageCapture = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      // Step 1: Analyze image
      const formData = new FormData();
      formData.append('image', file);

      const analyzeRes = await fetch('/api/meals/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!analyzeRes.ok) {
        const errData = await analyzeRes.json();
        throw new Error(errData.error || 'Failed to analyze image');
      }

      const analysis = await analyzeRes.json();

      // Step 2: Save the meal
      const mealData = {
        id: crypto.randomUUID(),
        description: analysis.description,
        macros: analysis.macros,
        date: formatDateKey(selectedDate),
      };

      const saveRes = await fetch('/api/meals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mealData),
      });

      if (saveRes.ok) {
        const { meal } = await saveRes.json();
        const newMeal: Meal = {
          ...meal,
          createdAt: new Date(meal.createdAt),
        };
        setMeals((prev) => [...prev, newMeal]);
        setTotals((prev) => ({
          calories: prev.calories + newMeal.macros.calories,
          protein: prev.protein + newMeal.macros.protein,
          carbs: prev.carbs + newMeal.macros.carbs,
          fat: prev.fat + newMeal.macros.fat,
        }));
      }
    } catch (err: any) {
      console.error('Error:', err);
      setError(err.message || 'Something went wrong');
    } finally {
      setIsAnalyzing(false);
      // Reset file input so the same file can be selected again
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteMeal = async (mealId: string) => {
    const meal = meals.find((m) => m.id === mealId);
    if (!meal) return;

    try {
      const res = await fetch(`/api/meals/${mealId}`, { method: 'DELETE' });
      if (res.ok) {
        setMeals((prev) => prev.filter((m) => m.id !== mealId));
        setTotals((prev) => ({
          calories: prev.calories - meal.macros.calories,
          protein: prev.protein - meal.macros.protein,
          carbs: prev.carbs - meal.macros.carbs,
          fat: prev.fat - meal.macros.fat,
        }));
      }
    } catch (err) {
      console.error('Failed to delete meal:', err);
    }
  };

  const isToday = formatDateKey(selectedDate) === formatDateKey(new Date());

  const formatGoalLabel = (current: number, target: number) => {
    if (target <= 0) return '';
    return `/ ${target}`;
  };

  return (
    <div className="animate-fade-in-blur">
      {/* Date Selector */}
      <div className="flex items-center justify-between mb-6 animate-slide-up">
        <Button variant="ghost" size="sm" onClick={handlePrevDay} className="interactive-scale">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-lg font-semibold">{formatDateDisplay(selectedDate)}</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleNextDay}
          disabled={isToday}
          className="interactive-scale"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Daily Totals */}
      <Card className="mb-6 border-border/50 bg-card/50 backdrop-blur-sm animate-slide-up animation-delay-75">
        <CardContent className="p-4">
          <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-3 font-medium">
            Daily Totals {goal && <span className="normal-case">vs Goal</span>}
          </h3>
          <div className="grid grid-cols-4 gap-3">
            <div className="text-center">
              <div className="text-xl font-bold">{Math.round(totals.calories)}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Cal {goal ? formatGoalLabel(totals.calories, goal.calories) : ''}
              </div>
              {goal && <ProgressBar current={totals.calories} target={goal.calories} color="bg-foreground/60" />}
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-blue-500">{Math.round(totals.protein)}g</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Protein {goal ? formatGoalLabel(totals.protein, goal.protein) : ''}
              </div>
              {goal && <ProgressBar current={totals.protein} target={goal.protein} color="bg-blue-500" />}
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-amber-500">{Math.round(totals.carbs)}g</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Carbs {goal ? formatGoalLabel(totals.carbs, goal.carbs) : ''}
              </div>
              {goal && <ProgressBar current={totals.carbs} target={goal.carbs} color="bg-amber-500" />}
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-rose-500">{Math.round(totals.fat)}g</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Fat {goal ? formatGoalLabel(totals.fat, goal.fat) : ''}
              </div>
              {goal && <ProgressBar current={totals.fat} target={goal.fat} color="bg-rose-500" />}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive animate-slide-up">
          {error}
        </div>
      )}

      {/* Add Meal Button */}
      <div className="mb-6 animate-slide-up animation-delay-150">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          onClick={handleImageCapture}
          disabled={isAnalyzing}
          className="w-full flex items-center gap-2 interactive-scale hover:shadow-lg hover:shadow-primary/25 transition-all duration-200"
          size="lg"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing meal...
            </>
          ) : (
            <>
              <Camera className="h-4 w-4" />
              <Plus className="h-3 w-3" />
              Snap a Meal
            </>
          )}
        </Button>
      </div>

      {/* Meals List */}
      {isLoading ? (
        <div className="text-center py-8">
          <Loader2 className="h-6 w-6 text-primary mx-auto animate-spin" />
          <p className="text-sm text-muted-foreground mt-2">Loading meals...</p>
        </div>
      ) : meals.length === 0 ? (
        <div className="text-center py-12 animate-slide-up animation-delay-300">
          <div className="mx-auto w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4 animate-scale-in animation-delay-500">
            <UtensilsCrossed className="h-10 w-10 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No meals logged</h3>
          <p className="text-muted-foreground text-sm px-4">
            Take a photo of your meal to get an instant macro breakdown
          </p>
        </div>
      ) : (
        <div className="space-y-3 stagger-children">
          {meals.map((meal) => (
            <MealCard key={meal.id} meal={meal} onDelete={handleDeleteMeal} />
          ))}
        </div>
      )}
    </div>
  );
}
