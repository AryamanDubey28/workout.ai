'use client';

import { useState } from 'react';
import { Exercise } from '@/types/workout';
import { Button } from '@/components/ui/button';
import { Trash2, ChevronDown, ChevronRight, Edit3, Dumbbell } from 'lucide-react';

interface ExerciseRowProps {
  exercise: Exercise;
  onChange: (exercise: Exercise) => void;
  onDelete: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export function ExerciseRow({ exercise, onChange, onDelete, isExpanded = false, onToggleExpand }: ExerciseRowProps) {
  const handleInputChange = (field: keyof Exercise, value: any) => {
    onChange({
      ...exercise,
      [field]: value,
    });
  };

  const toggleEffectiveReps = () => {
    onChange({
      ...exercise,
      useEffectiveReps: !exercise.useEffectiveReps,
      // Clear conflicting fields when toggling
      ...(exercise.useEffectiveReps 
        ? { effectiveRepsMax: undefined, effectiveRepsTarget: undefined }
        : { sets: undefined, reps: undefined }
      ),
    });
  };

  const formatExerciseSummary = () => {
    const weight = exercise.weight === 'BW' ? 'BW' : exercise.weight ? `${exercise.weight}kg` : '';
    
    if (exercise.useEffectiveReps) {
      const max = exercise.effectiveRepsMax || '?';
      const target = exercise.effectiveRepsTarget || '?';
      return `${weight} - ${max}/${target} ER`.trim();
    } else {
      const sets = exercise.sets || '?';
      const reps = exercise.reps || '?';
      return `${weight} - ${sets}x${reps}`.trim();
    }
  };

  // If collapsed, show compact summary
  if (!isExpanded) {
    return (
      <div className="border rounded-lg bg-card/30 hover:bg-card/50 transition-all duration-200 hover:shadow-sm hover:border-border/70 group">
        <div 
          className="flex items-center justify-between p-4 cursor-pointer transition-all duration-200"
          onClick={onToggleExpand}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Dumbbell className="h-4 w-4 text-muted-foreground flex-shrink-0 transition-colors duration-200 group-hover:text-primary" />
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate transition-colors duration-200 group-hover:text-primary">
                {exercise.name || 'Unnamed Exercise'}
              </div>
              <div className="text-sm text-muted-foreground transition-colors duration-200 group-hover:text-foreground/70">
                {formatExerciseSummary()}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity duration-200">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand?.();
              }}
              className="px-2 interactive-scale hover:bg-primary/10 hover:text-primary transition-all duration-200"
              title="Edit exercise"
            >
              <Edit3 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="px-2 text-destructive hover:text-destructive hover:bg-destructive/10 interactive-scale transition-all duration-200"
              title="Delete exercise"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Expanded view for editing
  return (
    <div className="border rounded-lg bg-card/50 overflow-hidden transition-all duration-300 shadow-sm hover:shadow-md border-border/70 hover:border-border">
      {/* Header with collapse button */}
      <div className="flex items-center justify-between p-4 bg-muted/20 border-b transition-all duration-200 hover:bg-muted/30">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onToggleExpand}
            className="px-2 hover:bg-background/50 interactive-scale transition-all duration-200"
          >
            <ChevronDown className="h-4 w-4 transition-transform duration-200" />
          </Button>
          <div className="flex items-center gap-2">
            <Dumbbell className="h-4 w-4 text-muted-foreground transition-colors duration-200 hover:text-primary" />
            <span className="font-medium">
              {exercise.name || 'Unnamed Exercise'}
            </span>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="px-2 text-destructive hover:text-destructive hover:bg-destructive/10 interactive-scale transition-all duration-200"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-4">
        {/* Unified Layout - Works across all screen sizes */}
        <div className="space-y-4">
          {/* Exercise Name */}
          <div>
            <input
              type="text"
              placeholder="Exercise name"
              value={exercise.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              className="w-full px-4 py-3 text-base border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 hover:border-border/70"
            />
          </div>

          {/* Weight Row */}
          <div>
            <div className="flex gap-3 items-center">
              <Button
                type="button"
                variant={exercise.weight === 'BW' ? 'default' : 'outline'}
                onClick={() => handleInputChange('weight', exercise.weight === 'BW' ? '' : 'BW')}
                className="px-4 py-3 text-sm font-medium shrink-0 h-12 min-w-[80px] interactive-scale transition-all duration-200"
                title="Toggle bodyweight"
              >
                BW
              </Button>
              {exercise.weight !== 'BW' && (
                <input
                  type="text"
                  placeholder="Weight (kg)"
                  value={exercise.weight || ''}
                  onChange={(e) => handleInputChange('weight', e.target.value)}
                  className="flex-1 px-4 py-3 text-base border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary h-12 transition-all duration-200 hover:border-border/70"
                />
              )}
            </div>
            {exercise.weight === 'BW' && (
              <div className="text-sm text-muted-foreground mt-2 pl-1">Using bodyweight for this exercise</div>
            )}
          </div>

          {/* Sets & Reps Row */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">
                {exercise.useEffectiveReps ? 'Effective Reps' : 'Sets & Reps'}
              </span>
              <Button
                type="button"
                variant={exercise.useEffectiveReps ? 'default' : 'outline'}
                onClick={toggleEffectiveReps}
                className="px-4 py-2 text-sm font-medium interactive-scale transition-all duration-200"
                title="Toggle Effective Reps"
              >
                ER
              </Button>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              {exercise.useEffectiveReps ? (
                <>
                  <div>
                    <input
                      type="number"
                      placeholder="Max"
                      title="Maximum reps in one go"
                      value={exercise.effectiveRepsMax || ''}
                      onChange={(e) => handleInputChange('effectiveRepsMax', parseInt(e.target.value) || undefined)}
                      className="w-full px-4 py-3 text-base border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary h-12 transition-all duration-200 hover:border-border/70"
                    />
                    <div className="text-xs text-muted-foreground mt-1.5 px-1">Max reps</div>
                  </div>
                  <div>
                    <input
                      type="number"
                      placeholder="Target"
                      title="Target total with rest pauses"
                      value={exercise.effectiveRepsTarget || ''}
                      onChange={(e) => handleInputChange('effectiveRepsTarget', parseInt(e.target.value) || undefined)}
                      className="w-full px-4 py-3 text-base border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary h-12 transition-all duration-200 hover:border-border/70"
                    />
                    <div className="text-xs text-muted-foreground mt-1.5 px-1">Target total</div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <input
                      type="number"
                      placeholder="Sets"
                      value={exercise.sets || ''}
                      onChange={(e) => handleInputChange('sets', parseInt(e.target.value) || undefined)}
                      className="w-full px-4 py-3 text-base border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary h-12 transition-all duration-200 hover:border-border/70"
                    />
                    <div className="text-xs text-muted-foreground mt-1.5 px-1">Sets</div>
                  </div>
                  <div>
                    <input
                      type="number"
                      placeholder="Reps"
                      value={exercise.reps || ''}
                      onChange={(e) => handleInputChange('reps', parseInt(e.target.value) || undefined)}
                      className="w-full px-4 py-3 text-base border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary h-12 transition-all duration-200 hover:border-border/70"
                    />
                    <div className="text-xs text-muted-foreground mt-1.5 px-1">Reps</div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}