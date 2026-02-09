'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Loader2, UtensilsCrossed, Plus, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MealCard } from '@/components/MealCard';
import { MealReviewModal } from '@/components/MealReviewModal';
import { Meal, Macros, MacroGoal, MealCategory, MEAL_CATEGORIES } from '@/types/meal';

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
  const [analyzingCategory, setAnalyzingCategory] = useState<MealCategory | null>(null);
  const [isSavingMeal, setIsSavingMeal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Review modal state
  const [pendingCategory, setPendingCategory] = useState<MealCategory>('breakfast');
  const [quickAddCategory, setQuickAddCategory] = useState<MealCategory>('breakfast');
  const [analysisContext, setAnalysisContext] = useState('');
  const [reviewData, setReviewData] = useState<{
    description: string;
    macros: Macros;
    context?: string;
  } | null>(null);

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
    if (selectedDate >= tomorrow) return;
    setSelectedDate((d) => {
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      return next;
    });
  };

  const handleAddMeal = (category: MealCategory) => {
    setPendingCategory(category);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzing(true);
    setAnalyzingCategory(pendingCategory);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('image', file);
      const context = analysisContext.trim();
      if (context) {
        formData.append('context', context);
      }

      const analyzeRes = await fetch('/api/meals/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!analyzeRes.ok) {
        const errData = await analyzeRes.json();
        throw new Error(errData.error || 'Failed to analyze image');
      }

      const analysis = await analyzeRes.json();
      setReviewData({
        description: analysis.description,
        macros: analysis.macros,
        context: context || undefined,
      });
    } catch (err: any) {
      console.error('Error:', err);
      setError(err.message || 'Something went wrong');
    } finally {
      setIsAnalyzing(false);
      setAnalyzingCategory(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmMeal = async (description: string, macros: Macros, category: MealCategory) => {
    setIsSavingMeal(true);
    setError(null);

    try {
      const mealData = {
        id: crypto.randomUUID(),
        description,
        macros,
        category,
        date: formatDateKey(selectedDate),
      };

      const saveRes = await fetch('/api/meals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mealData),
      });

      if (!saveRes.ok) {
        const errData = await saveRes.json().catch(() => null);
        throw new Error(errData?.error || 'Failed to save meal');
      }

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
      setAnalysisContext('');
      setReviewData(null);
    } catch (err: any) {
      console.error('Error saving meal:', err);
      setError(err.message || 'Failed to save meal');
    } finally {
      setIsSavingMeal(false);
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

  // Group meals by category
  const mealsByCategory = MEAL_CATEGORIES.reduce(
    (acc, cat) => {
      acc[cat.key] = meals.filter((m) => m.category === cat.key);
      return acc;
    },
    {} as Record<MealCategory, Meal[]>
  );

  return (
    <div className="animate-fade-in-blur max-w-3xl mx-auto">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

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

      {/* Upload Area */}
      <Card className="mb-6 border-border/60 bg-card/70 backdrop-blur-sm animate-slide-up animation-delay-75">
        <CardContent className="p-4 sm:p-6">
          <div className="max-w-2xl mx-auto text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <Camera className="h-7 w-7 text-primary" />
            </div>
            <h3 className="text-base sm:text-lg font-semibold">Upload Meal Photo</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Add an optional note for better one-shot accuracy.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
              {MEAL_CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setQuickAddCategory(cat.key)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    quickAddCategory === cat.key
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="mt-4 text-left">
              <label
                htmlFor="meal-analysis-context"
                className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
              >
                Comment for AI (optional)
              </label>
              <textarea
                id="meal-analysis-context"
                value={analysisContext}
                onChange={(e) => setAnalysisContext(e.target.value)}
                placeholder="Example: This has 2 chicken thighs, extra olive oil, and no rice."
                className="mt-2 min-h-24 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                maxLength={280}
              />
            </div>

            <Button
              onClick={() => handleAddMeal(quickAddCategory)}
              disabled={isAnalyzing}
              size="lg"
              className="mt-4 h-12 sm:h-14 px-8 text-sm sm:text-base w-full sm:w-auto interactive-scale"
            >
              {isAnalyzing && analyzingCategory === quickAddCategory ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing photo...
                </>
              ) : (
                <>
                  <Camera className="h-4 w-4 mr-2" />
                  Add Photo to {MEAL_CATEGORIES.find((cat) => cat.key === quickAddCategory)?.label}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

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

      {/* Meal Category Sections */}
      {isLoading ? (
        <div className="text-center py-8">
          <Loader2 className="h-6 w-6 text-primary mx-auto animate-spin" />
          <p className="text-sm text-muted-foreground mt-2">Loading meals...</p>
        </div>
      ) : meals.length === 0 && !isAnalyzing ? (
        <div>
          {/* Empty state message */}
          <div className="text-center py-8 mb-4 animate-slide-up animation-delay-300">
            <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-3 animate-scale-in animation-delay-500">
              <UtensilsCrossed className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold mb-1">No meals logged</h3>
            <p className="text-muted-foreground text-sm px-4">
              Upload your first meal photo above to start tracking.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4 stagger-children">
          {MEAL_CATEGORIES.map((cat) => {
            const categoryMeals = mealsByCategory[cat.key] || [];
            return (
              <div key={cat.key}>
                {/* Category Header */}
                <div className="flex items-center justify-between mb-2 px-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{cat.label}</span>
                    {categoryMeals.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {categoryMeals.reduce((sum, m) => sum + m.macros.calories, 0)} cal
                      </span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAddMeal(cat.key)}
                    disabled={isAnalyzing}
                    className="h-8 w-8 p-0 hover:bg-primary/10 text-muted-foreground hover:text-primary"
                  >
                    {isAnalyzing && analyzingCategory === cat.key ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {/* Category Meals */}
                {categoryMeals.length > 0 ? (
                  <div className="space-y-2">
                    {categoryMeals.map((meal) => (
                      <MealCard key={meal.id} meal={meal} onDelete={handleDeleteMeal} />
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground py-2 px-1 border-b border-border/30">
                    No {cat.label.toLowerCase()} logged
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Review Modal */}
      {reviewData && (
        <MealReviewModal
          description={reviewData.description}
          macros={reviewData.macros}
          analysisContext={reviewData.context}
          category={pendingCategory}
          onConfirm={handleConfirmMeal}
          isSaving={isSavingMeal}
          onCancel={() => setReviewData(null)}
        />
      )}
    </div>
  );
}
