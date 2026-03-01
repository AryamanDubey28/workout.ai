'use client';

import { useState, useEffect, useCallback } from 'react';
import { User, UserFact, FactCategory } from '@/types/user';
import { MacroGoal, GoalType, ActivityLevel, Sex } from '@/types/meal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { LogOut, User as UserIcon, Mail, Calendar, Weight, Target, Calculator, Save, Loader2, Check, Dumbbell, Download, Sparkles, Plus, X, ChevronRight } from 'lucide-react';

const FACT_CATEGORIES: { value: FactCategory; label: string }[] = [
  { value: 'health', label: 'Health & Injuries' },
  { value: 'diet', label: 'Diet & Nutrition' },
  { value: 'goals', label: 'Goals & Motivation' },
  { value: 'preferences', label: 'Training Preferences' },
  { value: 'training', label: 'Training Patterns' },
  { value: 'adherence', label: 'Habits & Adherence' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'personality', label: 'Personality' },
];

interface UserProfileProps {
  user: User;
  onLogout: () => void;
  onManagePresets: () => void;
}

const GOAL_TYPES: { value: GoalType; label: string; desc: string }[] = [
  { value: 'cutting', label: 'Cutting', desc: 'Lose fat' },
  { value: 'maintenance', label: 'Maintenance', desc: 'Stay the same' },
  { value: 'bulking', label: 'Bulking', desc: 'Build muscle' },
  { value: 'custom', label: 'Custom', desc: 'Set your own' },
];

const ACTIVITY_LEVELS: { value: ActivityLevel; label: string; multiplier: number }[] = [
  { value: 'sedentary', label: 'Sedentary (desk job)', multiplier: 1.2 },
  { value: 'light', label: 'Lightly active (1-3x/wk)', multiplier: 1.375 },
  { value: 'moderate', label: 'Moderately active (3-5x/wk)', multiplier: 1.55 },
  { value: 'active', label: 'Very active (6-7x/wk)', multiplier: 1.725 },
  { value: 'very_active', label: 'Extremely active (2x/day)', multiplier: 1.9 },
];

function calculateMacros(
  weightLbs: number,
  heightCm: number,
  age: number,
  sex: Sex,
  activityLevel: ActivityLevel,
  calorieAdjustment: number
): { calories: number; protein: number; carbs: number; fat: number } {
  const weightKg = weightLbs * 0.453592;

  // Mifflin-St Jeor equation
  let bmr: number;
  if (sex === 'male') {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  } else {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  }

  const activityMultiplier = ACTIVITY_LEVELS.find((a) => a.value === activityLevel)?.multiplier || 1.55;
  const tdee = Math.round(bmr * activityMultiplier) + calorieAdjustment;

  // Macro split
  const protein = Math.round(weightKg * 2.0); // 2g/kg
  const fat = Math.round((tdee * 0.25) / 9); // 25% from fat
  const carbsCal = tdee - protein * 4 - fat * 9;
  const carbs = Math.round(Math.max(carbsCal, 0) / 4);

  return { calories: tdee, protein, carbs, fat };
}

export function UserProfile({ user, onLogout, onManagePresets }: UserProfileProps) {
  const [goal, setGoal] = useState<MacroGoal | null>(null);
  const [isLoadingGoal, setIsLoadingGoal] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [exportingRange, setExportingRange] = useState<string | null>(null);

  // Facts state — localStorage cache for instant loads
  const FACTS_CACHE_KEY = 'workout-ai-facts';
  const [facts, setFacts] = useState<UserFact[]>(() => {
    try {
      const cached = localStorage.getItem(FACTS_CACHE_KEY);
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [isLoadingFacts, setIsLoadingFacts] = useState(() => {
    try { return !localStorage.getItem(FACTS_CACHE_KEY); } catch { return true; }
  });
  const [showFacts, setShowFacts] = useState(false);
  const [newFactContent, setNewFactContent] = useState('');
  const [newFactCategory, setNewFactCategory] = useState<FactCategory>('personality');
  const [isAddingFact, setIsAddingFact] = useState(false);

  // Persist facts to localStorage whenever they change
  useEffect(() => {
    if (facts.length > 0) {
      try { localStorage.setItem(FACTS_CACHE_KEY, JSON.stringify(facts)); } catch {}
    }
  }, [facts]);

  // Form state
  const [goalType, setGoalType] = useState<GoalType>('maintenance');
  const [calories, setCalories] = useState(2000);
  const [protein, setProtein] = useState(150);
  const [carbs, setCarbs] = useState(200);
  const [fat, setFat] = useState(65);
  const [heightCm, setHeightCm] = useState<number | ''>('');
  const [calorieAdjustment, setCalorieAdjustment] = useState(0);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');
  const [sex, setSex] = useState<Sex>('male');

  const loadGoal = useCallback(async () => {
    try {
      const res = await fetch('/api/goals');
      if (res.ok) {
        const data = await res.json();
        if (data.goal) {
          setGoal(data.goal);
          setGoalType(data.goal.goalType);
          setCalories(data.goal.calories);
          setProtein(data.goal.protein);
          setCarbs(data.goal.carbs);
          setFat(data.goal.fat);
          if (data.goal.heightCm) setHeightCm(data.goal.heightCm);
          if (data.goal.activityLevel) setActivityLevel(data.goal.activityLevel);
          if (data.goal.sex) setSex(data.goal.sex);
        }
      }
    } catch (err) {
      console.error('Failed to load goal:', err);
    } finally {
      setIsLoadingGoal(false);
    }
  }, []);

  useEffect(() => {
    loadGoal();
  }, [loadGoal]);

  const loadFacts = useCallback(async () => {
    try {
      const res = await fetch('/api/facts');
      if (res.ok) {
        const data = await res.json();
        setFacts(data.facts || []);
      }
    } catch (err) {
      console.error('Failed to load facts:', err);
    } finally {
      setIsLoadingFacts(false);
    }
  }, []);

  useEffect(() => {
    loadFacts();
  }, [loadFacts]);

  const handleAddFact = async () => {
    if (!newFactContent.trim()) return;
    setIsAddingFact(true);
    try {
      const res = await fetch('/api/facts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: newFactCategory, content: newFactContent.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setFacts((prev) => [...prev, data.fact]);
        setNewFactContent('');
      }
    } catch (err) {
      console.error('Failed to add fact:', err);
    } finally {
      setIsAddingFact(false);
    }
  };

  const handleDeleteFact = async (factId: string) => {
    try {
      const res = await fetch(`/api/facts/${factId}`, { method: 'DELETE' });
      if (res.ok) {
        setFacts((prev) => {
          const updated = prev.filter((f) => f.id !== factId);
          if (updated.length === 0) {
            try { localStorage.removeItem(FACTS_CACHE_KEY); } catch {}
          }
          return updated;
        });
      }
    } catch (err) {
      console.error('Failed to delete fact:', err);
    }
  };

  const handleAutoCalculate = () => {
    if (!heightCm || !user.weight || !user.age) return;
    const macros = calculateMacros(user.weight, Number(heightCm), user.age, sex, activityLevel, calorieAdjustment);
    setCalories(macros.calories);
    setProtein(macros.protein);
    setCarbs(macros.carbs);
    setFat(macros.fat);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/goals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalType,
          calories,
          protein,
          carbs,
          fat,
          heightCm: heightCm || undefined,
          activityLevel,
          sex,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setGoal(data.goal);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (err) {
      console.error('Failed to save goal:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = async (range: '30' | '60' | 'all') => {
    setExportingRange(range);
    try {
      const res = await fetch(`/api/workouts/export?range=${range}`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `workouts-${range === 'all' ? 'all' : `last-${range}-days`}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExportingRange(null);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
      });
      onLogout();
    } catch (error) {
      console.error('Logout failed:', error);
      // Still call onLogout to clear the local state
      onLogout();
    }
  };

  return (
    <div className="space-y-4">
      {/* User Info Card */}
      <Card className="w-full max-w-md animate-scale-in border-border/50 shadow-lg">
        <CardHeader className="animate-slide-down">
          <CardTitle className="flex items-center gap-2">
            <UserIcon className="h-5 w-5 text-primary" />
            User Profile
          </CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 stagger-children">
            <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors duration-200">
              <UserIcon className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium min-w-[60px]">Name:</span>
              <span className="text-foreground/80">{user.name}</span>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors duration-200">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium min-w-[60px]">Email:</span>
              <span className="text-foreground/80 truncate">{user.email}</span>
            </div>

            {user.dateOfBirth && (
              <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors duration-200">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium min-w-[60px]">DOB:</span>
                <span className="text-foreground/80">{new Date(`${user.dateOfBirth}T00:00:00`).toLocaleDateString()}</span>
              </div>
            )}

            <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors duration-200">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium min-w-[60px]">Age:</span>
              <span className="text-foreground/80">{user.age} years old</span>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors duration-200">
              <Weight className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium min-w-[60px]">Weight:</span>
              <span className="text-foreground/80">{user.weight} lbs</span>
            </div>
          </div>

          <div className="animate-slide-up animation-delay-500">
            <Button
              onClick={handleLogout}
              variant="outline"
              className="w-full mt-6 interactive-scale hover:bg-destructive/5 hover:border-destructive/20 hover:text-destructive transition-all duration-200"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Workout Presets Card */}
      <Card className="w-full max-w-md animate-scale-in animation-delay-100 border-border/50 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Dumbbell className="h-5 w-5 text-primary" />
            Workout Presets
          </CardTitle>
          <CardDescription>Manage your workout templates and split cycle</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={onManagePresets}
            className="w-full interactive-scale"
          >
            Manage Presets
          </Button>
        </CardContent>
      </Card>

      {/* About You Card — summary, opens Drawer */}
      <Card
        className="w-full max-w-md animate-scale-in animation-delay-100 border-border/50 shadow-lg cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setShowFacts(true)}
      >
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                About You
              </CardTitle>
              <CardDescription>
                {isLoadingFacts
                  ? 'Loading...'
                  : facts.length === 0
                    ? 'Tap to add things the AI should know about you'
                    : `${facts.length} fact${facts.length === 1 ? '' : 's'} across ${FACT_CATEGORIES.filter((cat) => facts.some((f) => f.category === cat.value)).length} categories`}
              </CardDescription>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
          </div>
        </CardHeader>
        {!isLoadingFacts && facts.length > 0 && (
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-1.5">
              {facts.slice(0, 4).map((fact) => (
                <span
                  key={fact.id}
                  className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground truncate max-w-[180px]"
                >
                  {fact.content}
                </span>
              ))}
              {facts.length > 4 && (
                <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                  +{facts.length - 4} more
                </span>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* About You Drawer — full facts management */}
      <Drawer open={showFacts} onOpenChange={setShowFacts}>
        <DrawerContent style={{ height: '85dvh' }}>
          <div className="flex flex-col h-full overflow-hidden">
            <DrawerHeader className="shrink-0">
              <DrawerTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                About You
              </DrawerTitle>
              <p className="text-sm text-muted-foreground">Things the AI knows about you to personalize your experience</p>
            </DrawerHeader>

            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {facts.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Chat with your AI assistant and it will learn about you over time.
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    You can also add facts manually below.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {FACT_CATEGORIES.filter((cat) => facts.some((f) => f.category === cat.value)).map((cat) => (
                    <div key={cat.value}>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
                        {cat.label}
                      </div>
                      <div className="space-y-1">
                        {facts
                          .filter((f) => f.category === cat.value)
                          .map((fact) => (
                            <div
                              key={fact.id}
                              className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors"
                            >
                              <span className="text-sm flex-1">{fact.content}</span>
                              {fact.source === 'ai_extracted' && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium shrink-0">
                                  AI
                                </span>
                              )}
                              <button
                                onClick={() => handleDeleteFact(fact.id)}
                                className="p-1 rounded text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive shrink-0 transition-colors"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add fact form — pinned at bottom */}
            <div className="shrink-0 px-4 pb-6 pt-3 border-t border-border/50 space-y-2">
              <div className="flex gap-2">
                <select
                  value={newFactCategory}
                  onChange={(e) => setNewFactCategory(e.target.value as FactCategory)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0"
                >
                  {FACT_CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
                <Input
                  value={newFactContent}
                  onChange={(e) => setNewFactContent(e.target.value)}
                  placeholder="e.g., Is vegetarian"
                  className="h-9 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newFactContent.trim()) {
                      handleAddFact();
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddFact}
                  disabled={!newFactContent.trim() || isAddingFact}
                  className="h-9 px-2.5 shrink-0"
                >
                  {isAddingFact ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Export Data Card */}
      <Card className="w-full max-w-md animate-scale-in animation-delay-100 border-border/50 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            Export Workouts
          </CardTitle>
          <CardDescription>Download your workout data as CSV</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {([
            { range: '30' as const, label: 'Past 30 Days' },
            { range: '60' as const, label: 'Past 60 Days' },
            { range: 'all' as const, label: 'All Time' },
          ]).map(({ range, label }) => (
            <Button
              key={range}
              variant="outline"
              onClick={() => handleExport(range)}
              disabled={exportingRange !== null}
              className="w-full interactive-scale justify-between"
            >
              <span>{label}</span>
              {exportingRange === range ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
            </Button>
          ))}
        </CardContent>
      </Card>

      {/* Macro Goals Card */}
      <Card className="w-full max-w-md animate-scale-in animation-delay-150 border-border/50 shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                Macro Goals
              </CardTitle>
              <CardDescription>Set your daily nutrition targets</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingGoal ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !showGoalForm && goal ? (
            /* Display current goals */
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Goal:</span>
                <span className="text-sm font-semibold capitalize">{goal.goalType}</span>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="text-center p-2 rounded-lg bg-muted/50">
                  <div className="text-lg font-bold">{goal.calories}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Cal</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-blue-500/10">
                  <div className="text-lg font-bold text-blue-500">{goal.protein}g</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Protein</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-amber-500/10">
                  <div className="text-lg font-bold text-amber-500">{goal.carbs}g</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Carbs</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-rose-500/10">
                  <div className="text-lg font-bold text-rose-500">{goal.fat}g</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Fat</div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowGoalForm(true)}
                className="w-full mt-2 interactive-scale"
              >
                Edit Goals
              </Button>
            </div>
          ) : (
            /* Goal form */
            <div className="space-y-5 animate-slide-up">
              {/* Goal Type */}
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2 block">
                  Goal Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {GOAL_TYPES.map((g) => (
                    <button
                      key={g.value}
                      onClick={() => {
                        setGoalType(g.value);
                        if (g.value === 'cutting') setCalorieAdjustment(-500);
                        else if (g.value === 'bulking') setCalorieAdjustment(300);
                        else setCalorieAdjustment(0);
                      }}
                      className={`p-2.5 rounded-lg border text-left transition-all duration-200 ${
                        goalType === g.value
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border hover:border-border/80 hover:bg-muted/50'
                      }`}
                    >
                      <div className="text-sm font-medium">{g.label}</div>
                      <div className="text-[10px] text-muted-foreground">{g.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Auto Calculate Section */}
              {goalType !== 'custom' && (
                <div className="border border-border/50 rounded-lg p-3 space-y-3 bg-muted/20">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    <Calculator className="h-3.5 w-3.5" />
                    Auto Calculate
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase mb-1 block">Sex</label>
                      <div className="flex gap-1">
                        {(['male', 'female'] as Sex[]).map((s) => (
                          <button
                            key={s}
                            onClick={() => setSex(s)}
                            className={`flex-1 py-1.5 px-2 rounded text-xs font-medium transition-all ${
                              sex === s
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted hover:bg-muted/80'
                            }`}
                          >
                            {s === 'male' ? 'Male' : 'Female'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase mb-1 block">Height (cm)</label>
                      <Input
                        type="number"
                        value={heightCm}
                        onChange={(e) => setHeightCm(e.target.value ? Number(e.target.value) : '')}
                        placeholder="175"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  {(goalType === 'cutting' || goalType === 'bulking') && (
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase mb-1 block">
                        Calorie {goalType === 'cutting' ? 'Deficit' : 'Surplus'}
                      </label>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          value={Math.abs(calorieAdjustment)}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setCalorieAdjustment(goalType === 'cutting' ? -val : val);
                          }}
                          className="h-8 text-sm"
                        />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">cal/day</span>
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase mb-1 block">Activity Level</label>
                    <select
                      value={activityLevel}
                      onChange={(e) => setActivityLevel(e.target.value as ActivityLevel)}
                      className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      {ACTIVITY_LEVELS.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleAutoCalculate}
                    disabled={!heightCm}
                    className="w-full text-xs interactive-scale"
                  >
                    <Calculator className="h-3.5 w-3.5 mr-1.5" />
                    Calculate from my stats
                  </Button>
                </div>
              )}

              {/* Manual Macro Inputs */}
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2 block">
                  Daily Targets
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase mb-1 block">Calories</label>
                    <Input
                      type="number"
                      value={calories}
                      onChange={(e) => setCalories(Number(e.target.value))}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase mb-1 block">Protein (g)</label>
                    <Input
                      type="number"
                      value={protein}
                      onChange={(e) => setProtein(Number(e.target.value))}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase mb-1 block">Carbs (g)</label>
                    <Input
                      type="number"
                      value={carbs}
                      onChange={(e) => setCarbs(Number(e.target.value))}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase mb-1 block">Fat (g)</label>
                    <Input
                      type="number"
                      value={fat}
                      onChange={(e) => setFat(Number(e.target.value))}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex gap-2">
                {goal && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowGoalForm(false)}
                    className="flex-1 interactive-scale"
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  size="sm"
                  className={`flex-1 interactive-scale ${saved ? 'bg-green-600 hover:bg-green-600' : ''}`}
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  ) : saved ? (
                    <Check className="h-4 w-4 mr-1.5" />
                  ) : (
                    <Save className="h-4 w-4 mr-1.5" />
                  )}
                  {saved ? 'Saved!' : 'Save Goals'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Version info */}
      <div className="flex justify-center mt-4 animate-fade-in animation-delay-700">
        <span className="text-xs text-muted-foreground/60 font-mono">
          v3.1.2
        </span>
      </div>
    </div>
  );
}
