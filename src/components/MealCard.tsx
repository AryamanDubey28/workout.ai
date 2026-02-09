'use client';

import { Meal } from '@/types/meal';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

interface MealCardProps {
  meal: Meal;
  onDelete: (id: string) => void;
}

export function MealCard({ meal, onDelete }: MealCardProps) {
  const time = meal.createdAt.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden group hover:shadow-md transition-all duration-200">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-muted-foreground">{time}</span>
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
