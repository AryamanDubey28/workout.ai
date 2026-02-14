'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Loader2, UtensilsCrossed, Plus, Camera, Sparkles, X, Bookmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MealCard } from '@/components/MealCard';
import { MealReviewModal } from '@/components/MealReviewModal';
import { Meal, Macros, MealItem, MacroGoal, MealCategory, MEAL_CATEGORIES, SavedMeal } from '@/types/meal';
import { FoodBankPicker } from '@/components/FoodBankPicker';

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
  const [isSavingMeal, setIsSavingMeal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadCardRef = useRef<HTMLDivElement>(null);

  // Input state
  const [mealDescription, setMealDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [quickAddCategory, setQuickAddCategory] = useState<MealCategory>('breakfast');

  // Review modal state
  const [pendingCategory, setPendingCategory] = useState<MealCategory>('breakfast');
  const [reviewData, setReviewData] = useState<{
    description: string;
    macros: Macros;
    items?: MealItem[];
    context?: string;
  } | null>(null);

  // Food bank state
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  const [isFoodBankOpen, setIsFoodBankOpen] = useState(false);
  const [isLoadingSavedMeals, setIsLoadingSavedMeals] = useState(false);

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

  const loadSavedMeals = useCallback(async () => {
    setIsLoadingSavedMeals(true);
    try {
      const res = await fetch('/api/meals/saved');
      if (res.ok) {
        const data = await res.json();
        setSavedMeals(data.savedMeals);
      }
    } catch (err) {
      console.error('Failed to load saved meals:', err);
    } finally {
      setIsLoadingSavedMeals(false);
    }
  }, []);

  useEffect(() => {
    loadSavedMeals();
  }, [loadSavedMeals]);

  const handleSelectFromBank = async (meal: SavedMeal, category: MealCategory) => {
    setIsFoodBankOpen(false);
    await handleConfirmMeal(meal.description, meal.macros, category);
  };

  const handleDeleteSavedMeal = async (id: string) => {
    try {
      const res = await fetch(`/api/meals/saved/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSavedMeals((prev) => prev.filter((m) => m.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete saved meal:', err);
    }
  };

  const handleUpdateSavedMeal = (meal: SavedMeal) => {
    setSavedMeals((prev) => prev.map((m) => (m.id === meal.id ? meal : m)));
  };

  const handleAddSavedMeal = (meal: SavedMeal) => {
    setSavedMeals((prev) => [...prev, meal]);
  };

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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAnalyze = async () => {
    if (!mealDescription.trim() && !selectedFile) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      const formData = new FormData();
      if (selectedFile) {
        formData.append('image', selectedFile);
      }
      const text = mealDescription.trim();
      if (text) {
        formData.append('text', text);
      }

      const analyzeRes = await fetch('/api/meals/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!analyzeRes.ok) {
        const errData = await analyzeRes.json();
        throw new Error(errData.error || 'Failed to analyze meal');
      }

      const analysis = await analyzeRes.json();
      setPendingCategory(quickAddCategory);
      setReviewData({
        description: analysis.description,
        macros: analysis.macros,
        items: analysis.items,
        context: text || undefined,
      });
    } catch (err: any) {
      console.error('Error:', err);
      setError(err.message || 'Something went wrong');
    } finally {
      setIsAnalyzing(false);
      setSelectedFile(null);
      setMealDescription('');
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

  const canAnalyze = mealDescription.trim().length > 0 || selectedFile !== null;

  return (
    <div className="animate-fade-in-blur max-w-3xl mx-auto">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
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

      {/* Log a Meal Card */}
      <Card
        ref={uploadCardRef}
        className="mb-6 border-border/60 bg-card/70 backdrop-blur-sm animate-slide-up animation-delay-75"
      >
        <CardContent className="p-4 sm:p-6">
          <div className="max-w-2xl mx-auto">
            <div className="text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <UtensilsCrossed className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-base sm:text-lg font-semibold">Log a Meal</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Describe what you ate, snap a photo, or both.
              </p>
            </div>

            {/* Category selector */}
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

            {/* Meal description */}
            <div className="mt-4 text-left">
              <label
                htmlFor="meal-description"
                className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
              >
                Describe your meal
              </label>
              <textarea
                id="meal-description"
                value={mealDescription}
                onChange={(e) => setMealDescription(e.target.value)}
                placeholder="e.g. Protein shake with whole milk and mixed berries"
                className="mt-2 min-h-20 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                maxLength={500}
              />
            </div>

            {/* Photo attach row */}
            <div className="mt-3 flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs"
              >
                <Camera className="h-3.5 w-3.5 mr-1.5" />
                {selectedFile ? 'Change Photo' : 'Attach Photo'}
              </Button>
              {selectedFile ? (
                <span className="text-xs text-muted-foreground flex items-center gap-1 min-w-0">
                  <span className="truncate">
                    {selectedFile.name.length > 25
                      ? selectedFile.name.slice(0, 25) + '...'
                      : selectedFile.name}
                  </span>
                  <button
                    onClick={() => setSelectedFile(null)}
                    className="shrink-0 text-destructive hover:text-destructive/80"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Optional</span>
              )}
            </div>

            <Button
              onClick={handleAnalyze}
              disabled={isAnalyzing || !canAnalyze}
              size="lg"
              className="mt-4 h-12 sm:h-14 px-8 text-sm sm:text-base w-full sm:w-auto interactive-scale"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : selectedFile ? (
                <>
                  <Camera className="h-4 w-4 mr-2" />
                  Analyze Photo
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Analyze Meal
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

      {/* Food Bank */}
      <Button
        variant="outline"
        onClick={() => {
          loadSavedMeals();
          setIsFoodBankOpen(true);
        }}
        disabled={isAnalyzing || isSavingMeal}
        className="w-full mb-6 h-11 interactive-scale animate-slide-up animation-delay-150"
      >
        <Bookmark className="h-4 w-4 mr-2" />
        Food Bank
        {savedMeals.length > 0 && (
          <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
            {savedMeals.length}
          </span>
        )}
      </Button>

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
              Describe or photograph your first meal above to start tracking.
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
                    onClick={() => {
                      setQuickAddCategory(cat.key);
                      uploadCardRef.current?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    disabled={isAnalyzing}
                    className="h-8 w-8 p-0 hover:bg-primary/10 text-muted-foreground hover:text-primary"
                  >
                    <Plus className="h-4 w-4" />
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
          items={reviewData.items}
          analysisContext={reviewData.context}
          category={pendingCategory}
          onConfirm={handleConfirmMeal}
          isSaving={isSavingMeal}
          onCancel={() => setReviewData(null)}
        />
      )}

      {/* Food Bank Picker */}
      <FoodBankPicker
        savedMeals={savedMeals}
        isLoading={isLoadingSavedMeals}
        isOpen={isFoodBankOpen}
        onSelect={handleSelectFromBank}
        onDelete={handleDeleteSavedMeal}
        onUpdate={handleUpdateSavedMeal}
        onAdd={handleAddSavedMeal}
        onClose={() => setIsFoodBankOpen(false)}
      />
    </div>
  );
}
