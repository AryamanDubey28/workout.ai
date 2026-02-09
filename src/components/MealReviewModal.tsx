'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Macros, MealCategory, MEAL_CATEGORIES } from '@/types/meal';
import { X, Loader2, Send, Check, Sparkles } from 'lucide-react';

interface RefinementMessage {
  role: 'user' | 'assistant';
  text: string;
  macros?: Macros;
}

interface MealReviewModalProps {
  description: string;
  macros: Macros;
  category: MealCategory;
  onConfirm: (description: string, macros: Macros, category: MealCategory) => void;
  onCancel: () => void;
}

export function MealReviewModal({
  description: initialDescription,
  macros: initialMacros,
  category: initialCategory,
  onConfirm,
  onCancel,
}: MealReviewModalProps) {
  const [description, setDescription] = useState(initialDescription);
  const [macros, setMacros] = useState<Macros>(initialMacros);
  const [category, setCategory] = useState<MealCategory>(initialCategory);
  const [refinementText, setRefinementText] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [messages, setMessages] = useState<RefinementMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleRefine = async () => {
    const text = refinementText.trim();
    if (!text || isRefining) return;

    setRefinementText('');
    setIsRefining(true);
    setError(null);

    setMessages((prev) => [...prev, { role: 'user', text }]);

    try {
      const res = await fetch('/api/meals/analyze/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, macros, refinement: text }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to refine');
      }

      const updated = await res.json();
      setDescription(updated.description);
      setMacros(updated.macros);
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

  const categoryLabel = MEAL_CATEGORIES.find((c) => c.key === category)?.label || 'Snack';

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center animate-backdrop-in"
      onClick={onCancel}
    >
      <Card
        className="w-full sm:max-w-md mx-auto border-border/50 shadow-2xl shadow-black/25 animate-modal-in rounded-b-none sm:rounded-b-xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="pb-3 pt-4 px-4 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-base">Review Meal</h3>
            </div>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onCancel}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="px-4 pb-4 flex flex-col gap-4 overflow-hidden flex-1 min-h-0">
          {/* AI Suggestion */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-3">
            <p className="text-sm font-medium">{description}</p>
            <div className="grid grid-cols-4 gap-2">
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
            </div>
          </div>

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
              disabled={isRefining}
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={handleRefine}
              disabled={!refinementText.trim() || isRefining}
              className="shrink-0 h-9 w-9 p-0"
            >
              {isRefining ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Confirm Button */}
          <Button
            onClick={() => onConfirm(description, macros, category)}
            disabled={isRefining}
            className="w-full interactive-scale"
            size="lg"
          >
            <Check className="h-4 w-4 mr-2" />
            Add to {categoryLabel}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
