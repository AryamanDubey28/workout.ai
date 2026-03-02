'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Loader2, UtensilsCrossed, Plus, Camera, Sparkles, X, Bookmark, PenLine, Clock, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MealCard } from '@/components/MealCard';
import { MealReviewModal } from '@/components/MealReviewModal';
import { Meal, Macros, MealItem, MacroGoal, MealCategory, MEAL_CATEGORIES, SavedMeal, FoodSuggestion } from '@/types/meal';
import { FoodBankPicker } from '@/components/FoodBankPicker';
import { getCategoryForTime, timeToInputValue, inputValueToDate } from '@/lib/mealUtils';
import { autoCalculateMacro, validateMacroConsistency, TouchedFields } from '@/lib/macroCalc';
import {
  DndContext,
  DragOverEvent,
  DragEndEvent,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

function DroppableCategory({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`transition-colors duration-200 rounded-lg ${isOver ? 'bg-primary/5 ring-1 ring-primary/20' : ''}`}>
      {children}
    </div>
  );
}

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
  const [quickAddCategory, setQuickAddCategory] = useState<MealCategory>(() => getCategoryForTime(new Date()));

  // Manual entry mode state
  type LogMode = 'ai' | 'manual';
  const [logMode, setLogMode] = useState<LogMode>('ai');
  const [manualDescription, setManualDescription] = useState('');
  const [manualMacros, setManualMacros] = useState({ calories: '', protein: '', carbs: '', fat: '' });
  const [touchedFields, setTouchedFields] = useState<TouchedFields>({ calories: false, protein: false, carbs: false, fat: false });
  const [autoFilledField, setAutoFilledField] = useState<keyof Macros | null>(null);
  const [manualTime, setManualTime] = useState<string>(() => timeToInputValue(new Date()));
  const [isSavingManual, setIsSavingManual] = useState(false);

  // Review modal state
  const [pendingCategory, setPendingCategory] = useState<MealCategory>(() => getCategoryForTime(new Date()));
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

  // Food suggestions state
  const [suggestions, setSuggestions] = useState<FoodSuggestion[]>([]);

  // Drag-and-drop state
  const [isDragDirty, setIsDragDirty] = useState(false);
  const mealsRef = useRef(meals);
  mealsRef.current = meals;

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const findMealContainer = useCallback((id: string | number): MealCategory | undefined => {
    const strId = String(id);
    if (MEAL_CATEGORIES.some(cat => cat.key === strId)) return strId as MealCategory;
    return mealsRef.current.find(m => m.id === strId)?.category;
  }, []);

  const handleMealDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeContainer = findMealContainer(active.id);
    const overContainer = findMealContainer(over.id);

    if (!activeContainer || !overContainer || activeContainer === overContainer) return;

    setMeals(prev => prev.map(m =>
      m.id === String(active.id) ? { ...m, category: overContainer } : m
    ));
  }, [findMealContainer]);

  const handleMealDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    setMeals(prev => {
      const activeMeal = prev.find(m => m.id === activeId);
      if (!activeMeal) return prev;

      const category = activeMeal.category;
      const categoryMeals = prev.filter(m => m.category === category);
      const oldIndex = categoryMeals.findIndex(m => m.id === activeId);
      const newIndex = categoryMeals.findIndex(m => m.id === overId);

      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const reordered = arrayMove(categoryMeals, oldIndex, newIndex);
        const otherMeals = prev.filter(m => m.category !== category);
        return [...otherMeals, ...reordered];
      }
      return prev;
    });

    setIsDragDirty(true);
  }, []);

  const loadGoal = useCallback(async () => {
    // Show cached goal instantly
    try {
      const cached = localStorage.getItem('workout-ai-macro-goal');
      if (cached) setGoal(JSON.parse(cached));
    } catch {}

    try {
      const res = await fetch('/api/goals');
      if (res.ok) {
        const data = await res.json();
        if (data.goal) {
          setGoal(data.goal);
          try { localStorage.setItem('workout-ai-macro-goal', JSON.stringify(data.goal)); } catch {}
        }
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

  // Persist meal reorder after drag
  useEffect(() => {
    if (!isDragDirty) return;
    setIsDragDirty(false);

    const updates = MEAL_CATEGORIES.flatMap(cat =>
      meals
        .filter(m => m.category === cat.key)
        .map((m, i) => ({ id: m.id, category: m.category, sortOrder: i }))
    );

    if (updates.length === 0) return;

    fetch('/api/meals/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    }).catch(err => {
      console.error('Error saving meal order:', err);
      loadMeals();
    });
  }, [isDragDirty, meals, loadMeals]);

  const loadSavedMeals = useCallback(async () => {
    // Show cached data instantly
    try {
      const cached = localStorage.getItem('workout-ai-saved-meals');
      if (cached) {
        setSavedMeals(JSON.parse(cached));
      } else {
        setIsLoadingSavedMeals(true);
      }
    } catch {
      setIsLoadingSavedMeals(true);
    }

    // Fetch fresh
    try {
      const res = await fetch('/api/meals/saved');
      if (res.ok) {
        const data = await res.json();
        setSavedMeals(data.savedMeals);
        try { localStorage.setItem('workout-ai-saved-meals', JSON.stringify(data.savedMeals)); } catch {}
      }
    } catch (err) {
      console.error('Failed to load saved meals:', err);
    } finally {
      setIsLoadingSavedMeals(false);
    }
  }, []);

  const loadSuggestions = useCallback(async () => {
    try {
      const res = await fetch('/api/meals/suggestions');
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (err) {
      console.error('Failed to load food suggestions:', err);
    }
  }, []);

  useEffect(() => {
    loadSavedMeals();
    loadSuggestions();
  }, [loadSavedMeals, loadSuggestions]);

  const handleSelectFromBank = async (meal: SavedMeal, category: MealCategory) => {
    setIsFoodBankOpen(false);
    await handleConfirmMeal(meal.description, meal.macros, category, new Date());
  };

  const updateSavedMealsCache = (meals: SavedMeal[]) => {
    try { localStorage.setItem('workout-ai-saved-meals', JSON.stringify(meals)); } catch {}
  };

  const handleDeleteSavedMeal = async (id: string) => {
    try {
      const res = await fetch(`/api/meals/saved/${id}`, { method: 'DELETE' });
      if (res.ok) {
        const updated = savedMeals.filter((m) => m.id !== id);
        setSavedMeals(updated);
        updateSavedMealsCache(updated);
      }
    } catch (err) {
      console.error('Failed to delete saved meal:', err);
    }
  };

  const handleUpdateSavedMeal = (meal: SavedMeal) => {
    const updated = savedMeals.map((m) => (m.id === meal.id ? meal : m));
    setSavedMeals(updated);
    updateSavedMealsCache(updated);
  };

  const handleAddSavedMeal = (meal: SavedMeal) => {
    const updated = [...savedMeals, meal];
    setSavedMeals(updated);
    updateSavedMealsCache(updated);
  };

  const handleAcceptSuggestion = async (suggestion: FoodSuggestion, editedData: { name: string; description: string; macros: Macros }) => {
    try {
      const res = await fetch(`/api/meals/suggestions/${suggestion.id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editedData),
      });
      if (res.ok) {
        const { savedMeal } = await res.json();
        const newSaved = [...savedMeals, { ...savedMeal, createdAt: new Date(savedMeal.createdAt) }];
        setSavedMeals(newSaved);
        updateSavedMealsCache(newSaved);
        setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
      }
    } catch (err) {
      console.error('Failed to accept suggestion:', err);
    }
  };

  const handleDismissSuggestion = async (suggestionId: string) => {
    try {
      const res = await fetch(`/api/meals/suggestions/${suggestionId}/dismiss`, {
        method: 'POST',
      });
      if (res.ok) {
        setSuggestions((prev) => prev.filter((s) => s.id !== suggestionId));
      }
    } catch (err) {
      console.error('Failed to dismiss suggestion:', err);
    }
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

  const handleManualMacroChange = (field: keyof Macros, value: string) => {
    const numValue = value === '' ? 0 : Number(value);
    if (value !== '' && isNaN(numValue)) return;

    const newManualMacros = { ...manualMacros, [field]: value };
    const newTouched = { ...touchedFields, [field]: value !== '' };
    setTouchedFields(newTouched);

    const numericMacros: Macros = {
      calories: newManualMacros.calories === '' ? 0 : Number(newManualMacros.calories),
      protein: newManualMacros.protein === '' ? 0 : Number(newManualMacros.protein),
      carbs: newManualMacros.carbs === '' ? 0 : Number(newManualMacros.carbs),
      fat: newManualMacros.fat === '' ? 0 : Number(newManualMacros.fat),
    };

    const { macros: calculated, autoFilledField: filled } = autoCalculateMacro(numericMacros, newTouched);

    if (filled) {
      setAutoFilledField(filled);
      setManualMacros({ ...newManualMacros, [filled]: calculated[filled].toString() });
    } else {
      // Clear previously auto-filled field if no longer auto-calculable
      if (autoFilledField && !newTouched[autoFilledField]) {
        setManualMacros({ ...newManualMacros, [autoFilledField]: '' });
      } else {
        setManualMacros(newManualMacros);
      }
      setAutoFilledField(null);
    }
  };

  const handleManualSave = async () => {
    if (!manualDescription.trim()) return;

    const macros: Macros = {
      calories: manualMacros.calories === '' ? 0 : Math.round(Number(manualMacros.calories)),
      protein: manualMacros.protein === '' ? 0 : Math.round(Number(manualMacros.protein)),
      carbs: manualMacros.carbs === '' ? 0 : Math.round(Number(manualMacros.carbs)),
      fat: manualMacros.fat === '' ? 0 : Math.round(Number(manualMacros.fat)),
    };

    const mealDate = inputValueToDate(manualTime, selectedDate);

    setIsSavingManual(true);
    await handleConfirmMeal(manualDescription.trim(), macros, quickAddCategory, mealDate);
    setIsSavingManual(false);

    // Reset manual form
    setManualDescription('');
    setManualMacros({ calories: '', protein: '', carbs: '', fat: '' });
    setTouchedFields({ calories: false, protein: false, carbs: false, fat: false });
    setAutoFilledField(null);
    setManualTime(timeToInputValue(new Date()));
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

  const handleConfirmMeal = async (description: string, macros: Macros, category: MealCategory, createdAt?: Date) => {
    setIsSavingMeal(true);
    setError(null);

    try {
      const mealData = {
        id: crypto.randomUUID(),
        description,
        macros,
        category,
        date: formatDateKey(selectedDate),
        createdAt: (createdAt || new Date()).toISOString(),
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

  const handleUpdateMealTime = async (mealId: string, newTime: Date, newCategory: MealCategory) => {
    try {
      const res = await fetch(`/api/meals/${mealId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          createdAt: newTime.toISOString(),
          category: newCategory,
        }),
      });
      if (res.ok) {
        const { meal: updated } = await res.json();
        setMeals((prev) =>
          prev.map((m) =>
            m.id === mealId
              ? { ...m, createdAt: new Date(updated.createdAt), category: updated.category }
              : m
          )
        );
      }
    } catch (err) {
      console.error('Failed to update meal time:', err);
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
  const canSaveManual = manualDescription.trim().length > 0;

  // Macro validation — only when all 4 fields manually entered
  const allTouched = touchedFields.calories && touchedFields.protein && touchedFields.carbs && touchedFields.fat;
  const macroWarning = allTouched
    ? validateMacroConsistency({
        calories: Number(manualMacros.calories) || 0,
        protein: Number(manualMacros.protein) || 0,
        carbs: Number(manualMacros.carbs) || 0,
        fat: Number(manualMacros.fat) || 0,
      })
    : null;

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
      <div className="flex items-center justify-between mb-5 animate-slide-up">
        <Button variant="ghost" size="sm" onClick={handlePrevDay} className="interactive-scale h-9 w-9 p-0 rounded-lg">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-lg font-semibold">{formatDateDisplay(selectedDate)}</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleNextDay}
          disabled={isToday}
          className="interactive-scale h-9 w-9 p-0 rounded-lg"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Daily Totals — top of page for at-a-glance progress */}
      <div className="mb-5 p-4 rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm animate-slide-up">
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center">
            <div className="text-2xl font-bold tabular-nums">{Math.round(totals.calories)}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
              Cal {goal ? formatGoalLabel(totals.calories, goal.calories) : ''}
            </div>
            {goal && <ProgressBar current={totals.calories} target={goal.calories} color="bg-foreground/60" />}
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-500 tabular-nums">{Math.round(totals.protein)}g</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
              Protein {goal ? formatGoalLabel(totals.protein, goal.protein) : ''}
            </div>
            {goal && <ProgressBar current={totals.protein} target={goal.protein} color="bg-blue-500" />}
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-amber-500 tabular-nums">{Math.round(totals.carbs)}g</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
              Carbs {goal ? formatGoalLabel(totals.carbs, goal.carbs) : ''}
            </div>
            {goal && <ProgressBar current={totals.carbs} target={goal.carbs} color="bg-amber-500" />}
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-rose-500 tabular-nums">{Math.round(totals.fat)}g</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
              Fat {goal ? formatGoalLabel(totals.fat, goal.fat) : ''}
            </div>
            {goal && <ProgressBar current={totals.fat} target={goal.fat} color="bg-rose-500" />}
          </div>
        </div>
      </div>

      {/* Log a Meal Card */}
      <Card
        ref={uploadCardRef}
        className="mb-5 border-border/60 bg-card/70 backdrop-blur-sm animate-slide-up animation-delay-75 rounded-2xl overflow-hidden"
      >
        <CardContent className="p-4 sm:p-5">
          <div className="max-w-2xl mx-auto">
            {/* Compact header */}
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <UtensilsCrossed className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold leading-none">Log a Meal</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {logMode === 'ai' ? 'Describe, snap a photo, or both' : 'Enter macros from the label'}
                </p>
              </div>
            </div>

            {/* Mode Toggle */}
            <div className="flex gap-1 mb-3 p-1 bg-muted/40 rounded-xl">
              <button
                onClick={() => setLogMode('ai')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  logMode === 'ai'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                AI Analyze
              </button>
              <button
                onClick={() => setLogMode('manual')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  logMode === 'manual'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <PenLine className="h-3.5 w-3.5" />
                Manual Entry
              </button>
            </div>

            {/* Category selector */}
            <div className="flex gap-1.5 mb-3">
              {MEAL_CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setQuickAddCategory(cat.key)}
                  className={`flex-1 rounded-full px-2 py-1.5 text-xs font-medium transition-all ${
                    quickAddCategory === cat.key
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {logMode === 'manual' ? (
              <>
                {/* Description — single-line input */}
                <input
                  type="text"
                  value={manualDescription}
                  onChange={(e) => setManualDescription(e.target.value)}
                  placeholder="e.g. Chicken breast with rice"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  maxLength={200}
                />

                {/* Macro inputs */}
                <div className="grid grid-cols-4 gap-2 mt-3">
                  {(['calories', 'protein', 'carbs', 'fat'] as const).map((field) => {
                    const colorMap = { calories: '', protein: 'text-blue-500', carbs: 'text-amber-500', fat: 'text-rose-500' };
                    const labelMap = { calories: 'Cal', protein: 'Protein', carbs: 'Carbs', fat: 'Fat' };
                    const isAutoFilled = autoFilledField === field;
                    return (
                      <div key={field} className="text-center">
                        <input
                          type="number"
                          inputMode="numeric"
                          value={manualMacros[field]}
                          onChange={(e) => handleManualMacroChange(field, e.target.value)}
                          placeholder="0"
                          className={`w-full text-center text-lg font-bold bg-background border rounded-md py-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                            isAutoFilled ? 'border-primary/50 bg-primary/5' : 'border-border'
                          } ${colorMap[field]}`}
                        />
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">
                          {labelMap[field]}
                          {isAutoFilled && <span className="text-primary ml-0.5">*</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Auto-calc hint */}
                {autoFilledField && (
                  <p className="text-[11px] text-primary mt-1">
                    * {autoFilledField.charAt(0).toUpperCase() + autoFilledField.slice(1)} auto-calculated
                  </p>
                )}

                {/* Validation warning */}
                {macroWarning && (
                  <div className="mt-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                    {macroWarning}
                  </div>
                )}

                {/* Time picker */}
                <div className="flex items-center gap-2 mt-3">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <input
                    type="time"
                    value={manualTime}
                    onChange={(e) => {
                      setManualTime(e.target.value);
                      const date = inputValueToDate(e.target.value, new Date());
                      setQuickAddCategory(getCategoryForTime(date));
                    }}
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <span className="text-xs text-muted-foreground">Meal time</span>
                </div>

                {/* Save button */}
                <Button
                  onClick={handleManualSave}
                  disabled={isSavingManual || !canSaveManual}
                  className="mt-3 w-full h-11 text-sm interactive-scale rounded-xl"
                >
                  {isSavingManual ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Meal
                    </>
                  )}
                </Button>
              </>
            ) : (
              <>
                {/* Meal description */}
                <textarea
                  id="meal-description"
                  value={mealDescription}
                  onChange={(e) => setMealDescription(e.target.value)}
                  placeholder="e.g. Protein shake with whole milk and mixed berries"
                  className="min-h-[72px] w-full resize-y rounded-xl border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  maxLength={500}
                />

                {/* Actions row */}
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs rounded-lg"
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
                  className="mt-3 w-full h-11 text-sm interactive-scale rounded-xl"
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
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Food Bank */}
      <Button
        variant="outline"
        onClick={() => {
          loadSavedMeals();
          loadSuggestions();
          setIsFoodBankOpen(true);
        }}
        disabled={isAnalyzing || isSavingMeal}
        className="w-full mb-5 h-11 interactive-scale animate-slide-up animation-delay-150 rounded-xl"
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
        <DndContext
          sensors={dndSensors}
          collisionDetection={closestCenter}
          onDragOver={handleMealDragOver}
          onDragEnd={handleMealDragEnd}
        >
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

                  {/* Category Meals (droppable + sortable) */}
                  <DroppableCategory id={cat.key}>
                    <SortableContext items={categoryMeals.map(m => m.id)} strategy={verticalListSortingStrategy}>
                      {categoryMeals.length > 0 ? (
                        <div className="space-y-2">
                          {categoryMeals.map((meal) => (
                            <MealCard key={meal.id} meal={meal} onDelete={handleDeleteMeal} onUpdateTime={handleUpdateMealTime} />
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground py-3 px-1 border-b border-border/30">
                          No {cat.label.toLowerCase()} logged
                        </div>
                      )}
                    </SortableContext>
                  </DroppableCategory>
                </div>
              );
            })}
          </div>
        </DndContext>
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
        suggestions={suggestions}
        isLoading={isLoadingSavedMeals}
        isOpen={isFoodBankOpen}
        onSelect={handleSelectFromBank}
        onDelete={handleDeleteSavedMeal}
        onUpdate={handleUpdateSavedMeal}
        onAdd={handleAddSavedMeal}
        onAcceptSuggestion={handleAcceptSuggestion}
        onDismissSuggestion={handleDismissSuggestion}
        onClose={() => setIsFoodBankOpen(false)}
      />
    </div>
  );
}
