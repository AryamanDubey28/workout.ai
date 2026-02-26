'use client';

import { useState } from 'react';
import { Meal, MealCategory } from '@/types/meal';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2, Pencil } from 'lucide-react';
import { getCategoryForTime, timeToInputValue, inputValueToDate } from '@/lib/mealUtils';

interface MealCardProps {
  meal: Meal;
  onDelete: (id: string) => void;
  onUpdateTime?: (id: string, newTime: Date, newCategory: MealCategory) => void;
}

export function MealCard({ meal, onDelete, onUpdateTime }: MealCardProps) {
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [editTimeValue, setEditTimeValue] = useState(() => timeToInputValue(meal.createdAt));

  const time = meal.createdAt.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  const handleTimeConfirm = () => {
    const newDate = inputValueToDate(editTimeValue, meal.createdAt);
    const newCategory = getCategoryForTime(newDate);
    onUpdateTime?.(meal.id, newDate, newCategory);
    setIsEditingTime(false);
  };

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden group hover:shadow-md transition-all duration-200">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              {isEditingTime ? (
                <input
                  type="time"
                  value={editTimeValue}
                  onChange={(e) => setEditTimeValue(e.target.value)}
                  onBlur={handleTimeConfirm}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleTimeConfirm();
                    if (e.key === 'Escape') setIsEditingTime(false);
                  }}
                  autoFocus
                  className="h-6 rounded border border-input bg-background px-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              ) : (
                <button
                  onClick={() => {
                    setEditTimeValue(timeToInputValue(meal.createdAt));
                    setIsEditingTime(true);
                  }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors group/time"
                  title="Edit meal time"
                >
                  <span>{time}</span>
                  <Pencil className="h-2.5 w-2.5 opacity-0 group-hover/time:opacity-100 transition-opacity" />
                </button>
              )}
            </div>
            <p className="text-sm font-medium truncate">{meal.description}</p>
            <div className="grid grid-cols-4 gap-2 mt-3">
              <div className="text-center">
                <div className="text-sm font-semibold text-foreground">
                  {meal.macros.calories}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Cal
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm font-semibold text-blue-500">
                  {meal.macros.protein}g
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Protein
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm font-semibold text-amber-500">
                  {meal.macros.carbs}g
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Carbs
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm font-semibold text-rose-500">
                  {meal.macros.fat}g
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Fat
                </div>
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(meal.id)}
            className="h-8 w-8 p-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all duration-200 shrink-0"
            title="Delete meal"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
