'use client';

import { useState, useRef } from 'react';
import { SavedMeal, Macros, MealCategory, MEAL_CATEGORIES } from '@/types/meal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  X, Bookmark, Loader2, Trash2, Search, Plus, Camera, Sparkles,
  ArrowLeft, Pencil, Check, Save,
} from 'lucide-react';

type View = 'list' | 'detail' | 'analyze' | 'log';

interface FoodBankPickerProps {
  savedMeals: SavedMeal[];
  isLoading: boolean;
  isOpen: boolean;
  onSelect: (meal: SavedMeal, category: MealCategory) => void;
  onDelete: (id: string) => void;
  onUpdate: (meal: SavedMeal) => void;
  onAdd: (meal: SavedMeal) => void;
  onClose: () => void;
}

export function FoodBankPicker({
  savedMeals,
  isLoading,
  isOpen,
  onSelect,
  onDelete,
  onUpdate,
  onAdd,
  onClose,
}: FoodBankPickerProps) {
  const [view, setView] = useState<View>('list');
  const [searchQuery, setSearchQuery] = useState('');

  // Log view state
  const [selectedMeal, setSelectedMeal] = useState<SavedMeal | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<MealCategory>('breakfast');

  // Detail/edit view state
  const [editMeal, setEditMeal] = useState<SavedMeal | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editMacros, setEditMacros] = useState<Macros>({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Analyze view state
  const [analyzeText, setAnalyzeText] = useState('');
  const [analyzeFile, setAnalyzeFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<{ description: string; macros: Macros } | null>(null);
  const [analyzeName, setAnalyzeName] = useState('');
  const [analyzeEditMacros, setAnalyzeEditMacros] = useState<Macros>({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [isSavingNew, setIsSavingNew] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const filteredMeals = savedMeals.filter((meal) =>
    meal.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const resetAndClose = () => {
    setView('list');
    setSearchQuery('');
    setSelectedMeal(null);
    setEditMeal(null);
    setAnalyzeResult(null);
    setAnalyzeText('');
    setAnalyzeFile(null);
    setAnalyzeName('');
    setError(null);
    onClose();
  };

  const goToList = () => {
    setView('list');
    setSelectedMeal(null);
    setEditMeal(null);
    setAnalyzeResult(null);
    setAnalyzeText('');
    setAnalyzeFile(null);
    setAnalyzeName('');
    setError(null);
  };

  const openDetail = (meal: SavedMeal) => {
    setEditMeal(meal);
    setEditName(meal.name);
    setEditDescription(meal.description);
    setEditMacros({ ...meal.macros });
    setError(null);
    setView('detail');
  };

  const openLog = (meal: SavedMeal) => {
    setSelectedMeal(meal);
    setView('log');
  };

  const handleSaveEdit = async () => {
    if (!editMeal || !editName.trim()) return;
    setIsSavingEdit(true);
    setError(null);

    try {
      const res = await fetch(`/api/meals/saved/${editMeal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), description: editDescription, macros: editMacros }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || 'Failed to update');
      }
      const { savedMeal } = await res.json();
      onUpdate({ ...savedMeal, createdAt: new Date(savedMeal.createdAt) });
      goToList();
    } catch (err: any) {
      setError(err.message || 'Failed to save changes');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleAnalyze = async () => {
    if (!analyzeText.trim() && !analyzeFile) return;
    setIsAnalyzing(true);
    setError(null);

    try {
      const formData = new FormData();
      if (analyzeFile) formData.append('image', analyzeFile);
      if (analyzeText.trim()) formData.append('text', analyzeText.trim());

      const res = await fetch('/api/meals/analyze', { method: 'POST', body: formData });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || 'Failed to analyze');
      }
      const data = await res.json();
      setAnalyzeResult({ description: data.description, macros: data.macros });
      setAnalyzeName(data.description.slice(0, 50));
      setAnalyzeEditMacros({ ...data.macros });
    } catch (err: any) {
      setError(err.message || 'Failed to analyze meal');
    } finally {
      setIsAnalyzing(false);
      setAnalyzeFile(null);
    }
  };

  const handleSaveNew = async () => {
    if (!analyzeName.trim() || !analyzeResult) return;
    setIsSavingNew(true);
    setError(null);

    try {
      const res = await fetch('/api/meals/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          name: analyzeName.trim(),
          description: analyzeResult.description,
          macros: analyzeEditMacros,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || 'Failed to save');
      }
      const { savedMeal } = await res.json();
      onAdd({ ...savedMeal, createdAt: new Date(savedMeal.createdAt) });
      goToList();
    } catch (err: any) {
      setError(err.message || 'Failed to save to Food Bank');
    } finally {
      setIsSavingNew(false);
    }
  };

  const updateEditMacro = (field: keyof Macros, value: string) => {
    const num = value === '' ? 0 : Number(value);
    if (isNaN(num)) return;
    setEditMacros((prev) => ({ ...prev, [field]: num }));
  };

  const updateAnalyzeMacro = (field: keyof Macros, value: string) => {
    const num = value === '' ? 0 : Number(value);
    if (isNaN(num)) return;
    setAnalyzeEditMacros((prev) => ({ ...prev, [field]: num }));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setAnalyzeFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-backdrop-in"
      onClick={resetAndClose}
    >
      <Card
        className="w-full max-w-md mx-auto animate-modal-in border-border/50 shadow-2xl shadow-black/25 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hidden file input for analyze view */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />

        <CardHeader className="pb-3 shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              {view !== 'list' && (
                <Button variant="ghost" size="sm" onClick={goToList} className="h-7 w-7 p-0 mr-1">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <Bookmark className="h-4 w-4 text-primary" />
              {view === 'list' && 'Food Bank'}
              {view === 'log' && 'Log Meal'}
              {view === 'detail' && 'Edit Meal'}
              {view === 'analyze' && 'Add New'}
            </CardTitle>
            <div className="flex items-center gap-1">
              {view === 'list' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setError(null); setView('analyze'); }}
                  className="h-8 w-8 p-0"
                  title="Add new meal"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={resetAndClose} className="h-8 w-8 p-0">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-hidden flex flex-col pt-0 min-h-0">
          {/* Error */}
          {error && (
            <div className="mb-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-2 shrink-0">
              {error}
            </div>
          )}

          {/* ===== LIST VIEW ===== */}
          {view === 'list' && (
            <>
              {savedMeals.length > 3 && (
                <div className="mb-3 shrink-0">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search saved meals..."
                      className="pl-9 text-sm"
                    />
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredMeals.length === 0 ? (
                  <div className="text-center py-8">
                    {searchQuery ? (
                      <p className="text-sm text-muted-foreground">
                        No saved meals match &quot;{searchQuery}&quot;
                      </p>
                    ) : (
                      <>
                        <p className="text-sm text-muted-foreground mb-2">No saved meals yet.</p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setView('analyze')}
                          className="text-xs"
                        >
                          <Plus className="h-3.5 w-3.5 mr-1.5" />
                          Add your first meal
                        </Button>
                      </>
                    )}
                  </div>
                ) : (
                  filteredMeals.map((meal) => (
                    <div
                      key={meal.id}
                      className="relative group border border-border/50 rounded-lg hover:border-primary/30 hover:bg-primary/5 transition-all duration-200"
                    >
                      <button
                        onClick={() => openLog(meal)}
                        className="w-full text-left p-3 pr-20"
                      >
                        <div className="text-sm font-medium group-hover:text-primary transition-colors">
                          {meal.name}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {meal.macros.calories} cal · {meal.macros.protein}g P · {meal.macros.carbs}g C · {meal.macros.fat}g F
                        </div>
                      </button>
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); openDetail(meal); }}
                          className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                          title="Edit meal"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Delete "${meal.name}" from Food Bank?`)) {
                              onDelete(meal.id);
                            }
                          }}
                          className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                          title="Delete meal"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {/* ===== LOG VIEW ===== */}
          {view === 'log' && selectedMeal && (
            <div className="flex flex-col h-full">
              <div className="mb-4">
                <h3 className="text-sm font-semibold mb-1">{selectedMeal.name}</h3>
                <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{selectedMeal.description}</p>

                <MacroGrid macros={selectedMeal.macros} />
              </div>

              <div className="mb-4">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
                  Log as
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {MEAL_CATEGORIES.map((cat) => (
                    <button
                      key={cat.key}
                      onClick={() => setSelectedCategory(cat.key)}
                      className={`py-2 px-3 text-sm font-medium rounded-lg transition-colors ${
                        selectedCategory === cat.key
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-auto">
                <Button variant="outline" onClick={goToList}>
                  Back
                </Button>
                <Button
                  onClick={() => {
                    if (selectedMeal) {
                      onSelect(selectedMeal, selectedCategory);
                      setSelectedMeal(null);
                      setSearchQuery('');
                    }
                  }}
                  className="interactive-scale"
                >
                  Log Meal
                </Button>
              </div>
            </div>
          )}

          {/* ===== DETAIL/EDIT VIEW ===== */}
          {view === 'detail' && editMeal && (
            <div className="flex flex-col h-full gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Name
                </label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Meal name"
                  className="text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Description
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="min-h-16 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  maxLength={500}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Macros
                </label>
                <EditableMacroGrid macros={editMacros} onUpdate={updateEditMacro} />
              </div>

              <div className="grid grid-cols-2 gap-2 mt-auto">
                <Button variant="outline" onClick={goToList} disabled={isSavingEdit}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveEdit}
                  disabled={isSavingEdit || !editName.trim()}
                  className="interactive-scale"
                >
                  {isSavingEdit ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                  ) : (
                    <><Save className="h-4 w-4 mr-2" />Save Changes</>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* ===== ANALYZE VIEW ===== */}
          {view === 'analyze' && (
            <div className="flex flex-col h-full gap-3">
              {analyzeResult ? (
                <>
                  {/* Post-analysis: name, macros, save */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
                      Name
                    </label>
                    <Input
                      value={analyzeName}
                      onChange={(e) => setAnalyzeName(e.target.value)}
                      placeholder="Name this meal"
                      className="text-sm"
                      autoFocus
                    />
                  </div>

                  <div className="bg-muted/50 rounded-lg p-2.5">
                    <p className="text-xs text-muted-foreground mb-0.5">AI Description</p>
                    <p className="text-sm">{analyzeResult.description}</p>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
                      Macros
                    </label>
                    <EditableMacroGrid macros={analyzeEditMacros} onUpdate={updateAnalyzeMacro} />
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-auto">
                    <Button
                      variant="outline"
                      onClick={() => { setAnalyzeResult(null); setAnalyzeText(''); }}
                      disabled={isSavingNew}
                    >
                      Re-analyze
                    </Button>
                    <Button
                      onClick={handleSaveNew}
                      disabled={isSavingNew || !analyzeName.trim()}
                      className="interactive-scale"
                    >
                      {isSavingNew ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                      ) : (
                        <><Check className="h-4 w-4 mr-2" />Save to Bank</>
                      )}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {/* Pre-analysis: input */}
                  <p className="text-xs text-muted-foreground">
                    Describe or photograph a meal to analyze and save to your Food Bank.
                  </p>

                  <div>
                    <textarea
                      value={analyzeText}
                      onChange={(e) => setAnalyzeText(e.target.value)}
                      placeholder="e.g. Protein shake with whole milk and mixed berries"
                      className="min-h-20 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      maxLength={500}
                      autoFocus
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs"
                    >
                      <Camera className="h-3.5 w-3.5 mr-1.5" />
                      {analyzeFile ? 'Change Photo' : 'Attach Photo'}
                    </Button>
                    {analyzeFile ? (
                      <span className="text-xs text-muted-foreground flex items-center gap-1 min-w-0">
                        <span className="truncate">
                          {analyzeFile.name.length > 25 ? analyzeFile.name.slice(0, 25) + '...' : analyzeFile.name}
                        </span>
                        <button onClick={() => setAnalyzeFile(null)} className="shrink-0 text-destructive hover:text-destructive/80">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Optional</span>
                    )}
                  </div>

                  <Button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing || (!analyzeText.trim() && !analyzeFile)}
                    className="w-full mt-auto interactive-scale"
                  >
                    {isAnalyzing ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyzing...</>
                    ) : (
                      <><Sparkles className="h-4 w-4 mr-2" />Analyze Meal</>
                    )}
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ===== Shared sub-components ===== */

function MacroGrid({ macros }: { macros: Macros }) {
  return (
    <div className="grid grid-cols-4 gap-2 bg-muted/30 rounded-lg p-3">
      <div className="text-center">
        <div className="text-sm font-bold">{macros.calories}</div>
        <div className="text-[10px] text-muted-foreground uppercase">Cal</div>
      </div>
      <div className="text-center">
        <div className="text-sm font-bold text-blue-500">{macros.protein}g</div>
        <div className="text-[10px] text-muted-foreground uppercase">Pro</div>
      </div>
      <div className="text-center">
        <div className="text-sm font-bold text-amber-500">{macros.carbs}g</div>
        <div className="text-[10px] text-muted-foreground uppercase">Carbs</div>
      </div>
      <div className="text-center">
        <div className="text-sm font-bold text-rose-500">{macros.fat}g</div>
        <div className="text-[10px] text-muted-foreground uppercase">Fat</div>
      </div>
    </div>
  );
}

function EditableMacroGrid({
  macros,
  onUpdate,
}: {
  macros: Macros;
  onUpdate: (field: keyof Macros, value: string) => void;
}) {
  const fields: { key: keyof Macros; label: string; color: string }[] = [
    { key: 'calories', label: 'Cal', color: '' },
    { key: 'protein', label: 'Protein', color: 'text-blue-500' },
    { key: 'carbs', label: 'Carbs', color: 'text-amber-500' },
    { key: 'fat', label: 'Fat', color: 'text-rose-500' },
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {fields.map((f) => (
        <div key={f.key} className="text-center">
          <input
            type="number"
            inputMode="numeric"
            value={macros[f.key]}
            onChange={(e) => onUpdate(f.key, e.target.value)}
            className={`w-full text-center text-sm font-bold bg-background border border-border rounded-md py-1 ${f.color} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
          />
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">{f.label}</div>
        </div>
      ))}
    </div>
  );
}
