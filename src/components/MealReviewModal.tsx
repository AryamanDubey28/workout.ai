'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Macros, MealItem, MealCategory, MEAL_CATEGORIES } from '@/types/meal';
import { X, Loader2, Send, Sparkles, Pencil, Save, ChevronDown, Bookmark, Check } from 'lucide-react';

interface RefinementMessage {
  role: 'user' | 'assistant';
  text: string;
  macros?: Macros;
}

interface MealReviewModalProps {
  description: string;
  macros: Macros;
  items?: MealItem[];
  category: MealCategory;
  analysisContext?: string;
  onConfirm: (description: string, macros: Macros, category: MealCategory) => void;
  isSaving?: boolean;
  onCancel: () => void;
}

export function MealReviewModal({
  description: initialDescription,
  macros: initialMacros,
  items: initialItems,
  category: initialCategory,
  analysisContext,
  onConfirm,
  isSaving = false,
  onCancel,
}: MealReviewModalProps) {
  const [description, setDescription] = useState(initialDescription);
  const [macros, setMacros] = useState<Macros>(initialMacros);
  const [items, setItems] = useState<MealItem[] | undefined>(initialItems);
  const [category, setCategory] = useState<MealCategory>(initialCategory);
  const [refinementText, setRefinementText] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [messages, setMessages] = useState<RefinementMessage[]>([]);
  const [isEditingMacros, setIsEditingMacros] = useState(false);
  const [showItems, setShowItems] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFoodBankInput, setShowFoodBankInput] = useState(false);
  const [foodBankName, setFoodBankName] = useState('');
  const [isSavingToBank, setIsSavingToBank] = useState(false);
  const [savedToBank, setSavedToBank] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleRefine = async () => {
    const text = refinementText.trim();
    if (!text || isRefining || isSaving) return;

    setRefinementText('');
    setIsRefining(true);
    setError(null);

    setMessages((prev) => [...prev, { role: 'user', text }]);

    try {
      const res = await fetch('/api/meals/analyze/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          macros,
          items,
          refinement: text,
          context: analysisContext,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to refine');
      }

      const updated = await res.json();
      setDescription(updated.description);
      setMacros(updated.macros);
      if (updated.items) setItems(updated.items);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: updated.description, macros: updated.macros },
      ]);
    } catch (err: any) {
      setError(err.message || 'Failed to refine analysis');
    } finally {
      setIsRefining(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleRefine();
    }
  };

  const handleSaveToBank = async () => {
    const name = foodBankName.trim();
    if (!name) return;

    setIsSavingToBank(true);
    setError(null);

    try {
      const res = await fetch('/api/meals/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          name,
          description,
          macros,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || 'Failed to save to Food Bank');
      }

      setSavedToBank(true);
      setShowFoodBankInput(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save to Food Bank');
    } finally {
      setIsSavingToBank(false);
    }
  };

  const updateMacro = (field: keyof Macros, value: string) => {
    const num = value === '' ? 0 : Number(value);
    if (isNaN(num)) return;
    setMacros((prev) => ({ ...prev, [field]: num }));
  };

  const categoryLabel = MEAL_CATEGORIES.find((c) => c.key === category)?.label || 'Snack';

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-backdrop-in"
      onClick={() => {
        if (!isSaving) onCancel();
      }}
    >
      <Card
        className="w-full max-w-md border-border/50 shadow-2xl shadow-black/25 animate-modal-in rounded-xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="pb-3 pt-4 px-4 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-base">Review Meal</h3>
            </div>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onCancel} disabled={isSaving}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="px-4 pb-4 flex flex-col gap-4 overflow-hidden flex-1 min-h-0">
          {analysisContext && (
            <div className="text-xs rounded-lg border border-border/60 bg-muted/30 p-2.5 text-muted-foreground">
              Context note: {analysisContext}
            </div>
          )}

          {/* AI Suggestion */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium">{description}</p>
              <button
                onClick={() => setIsEditingMacros((v) => !v)}
                className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Edit macros manually"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {isEditingMacros ? (
                <>
                  <div className="text-center">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={macros.calories}
                      onChange={(e) => updateMacro('calories', e.target.value)}
                      className="w-full text-center text-lg font-bold bg-background border border-border rounded-md py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Cal</div>
                  </div>
                  <div className="text-center">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={macros.protein}
                      onChange={(e) => updateMacro('protein', e.target.value)}
                      className="w-full text-center text-lg font-bold text-blue-500 bg-background border border-border rounded-md py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Protein</div>
                  </div>
                  <div className="text-center">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={macros.carbs}
                      onChange={(e) => updateMacro('carbs', e.target.value)}
                      className="w-full text-center text-lg font-bold text-amber-500 bg-background border border-border rounded-md py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Carbs</div>
                  </div>
                  <div className="text-center">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={macros.fat}
                      onChange={(e) => updateMacro('fat', e.target.value)}
                      className="w-full text-center text-lg font-bold text-rose-500 bg-background border border-border rounded-md py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Fat</div>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-center">
                    <div className="text-lg font-bold">{macros.calories}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Cal</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-blue-500">{macros.protein}g</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Protein</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-amber-500">{macros.carbs}g</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Carbs</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-rose-500">{macros.fat}g</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Fat</div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Per-item Breakdown */}
          {items && items.length > 1 && (
            <div>
              <button
                onClick={() => setShowItems((v) => !v)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
              >
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${showItems ? 'rotate-180' : ''}`}
                />
                <span>{showItems ? 'Hide' : 'Show'} item breakdown ({items.length} items)</span>
              </button>
              {showItems && (
                <div className="mt-2 space-y-1.5">
                  {items.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between text-xs bg-muted/30 rounded-md px-2.5 py-1.5 gap-2"
                    >
                      <span className="font-medium truncate">{item.name}</span>
                      <span className="text-muted-foreground whitespace-nowrap shrink-0">
                        {item.macros.calories} cal · {item.macros.protein}g P · {item.macros.carbs}g C · {item.macros.fat}g F
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Category Selector */}
          <div className="flex gap-1.5">
            {MEAL_CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setCategory(cat.key)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  category === cat.key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Refinement Chat */}
          {messages.length > 0 && (
            <div className="flex-1 overflow-y-auto space-y-2 min-h-0 max-h-40">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`text-xs px-3 py-2 rounded-lg ${
                    msg.role === 'user'
                      ? 'bg-primary/10 text-foreground ml-8'
                      : 'bg-muted/50 text-foreground mr-8'
                  }`}
                >
                  {msg.role === 'user' ? (
                    msg.text
                  ) : (
                    <div>
                      <span className="font-medium">{msg.text}</span>
                      {msg.macros && (
                        <span className="text-muted-foreground ml-1">
                          — {msg.macros.calories} cal, {msg.macros.protein}g P, {msg.macros.carbs}g C, {msg.macros.fat}g F
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-2">
              {error}
            </div>
          )}

          {/* Refinement Input */}
          <div className="flex gap-2 shrink-0">
            <Input
              ref={inputRef}
              value={refinementText}
              onChange={(e) => setRefinementText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Refine... e.g. 'add 2 scoops protein'"
              className="text-sm"
              disabled={isRefining || isSaving}
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={handleRefine}
              disabled={!refinementText.trim() || isRefining || isSaving}
              className="shrink-0 h-9 w-9 p-0"
            >
              {isRefining ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Save to Food Bank */}
          {savedToBank ? (
            <div className="flex items-center justify-center gap-1.5 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-2.5">
              <Check className="h-3.5 w-3.5" />
              Saved to Food Bank
            </div>
          ) : showFoodBankInput ? (
            <div className="flex gap-2">
              <Input
                value={foodBankName}
                onChange={(e) => setFoodBankName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveToBank();
                  if (e.key === 'Escape') setShowFoodBankInput(false);
                }}
                placeholder="Name this meal, e.g. Protein Shake"
                className="text-sm"
                autoFocus
                disabled={isSavingToBank}
              />
              <Button
                size="sm"
                onClick={handleSaveToBank}
                disabled={!foodBankName.trim() || isSavingToBank}
                className="shrink-0"
              >
                {isSavingToBank ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFoodBankInput(true)}
              disabled={isRefining || isSaving}
              className="w-full text-xs"
            >
              <Bookmark className="h-3.5 w-3.5 mr-1.5" />
              Save to Food Bank
            </Button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={onCancel} disabled={isRefining || isSaving || isSavingToBank}>
              Cancel
            </Button>
            <Button
              onClick={() => onConfirm(description, macros, category)}
              disabled={isRefining || isSaving || isSavingToBank}
              className="interactive-scale"
            >
              {isSaving ? (
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
          </div>

          <div className="text-center text-[11px] text-muted-foreground">
            Category: {categoryLabel}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
