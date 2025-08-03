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
      <div className="border rounded-lg bg-card/30 hover:bg-card/50 transition-all duration-200 hover:shadow-sm">
        <div 
          className="flex items-center justify-between p-4 cursor-pointer transition-all duration-150"
          onClick={onToggleExpand}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Dumbbell className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">
                {exercise.name || 'Unnamed Exercise'}
              </div>
              <div className="text-sm text-muted-foreground">
                {formatExerciseSummary()}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand?.();
              }}
              className="px-2"
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
              className="px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
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
    <div className="border rounded-lg bg-card/50 overflow-hidden transition-all duration-200 shadow-sm">
      {/* Header with collapse button */}
      <div className="flex items-center justify-between p-4 bg-muted/20 border-b transition-colors duration-150">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onToggleExpand}
            className="px-2 hover:bg-background/50"
          >
            <ChevronDown className="h-4 w-4 transition-transform duration-200" />
          </Button>
          <div className="flex items-center gap-2">
            <Dumbbell className="h-4 w-4 text-muted-foreground" />
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
          className="px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-4 animate-in slide-in-from-top-2 duration-300">
        {/* Desktop Layout - Only for very large screens */}
        <div className="hidden 2xl:grid grid-cols-12 gap-3 items-center">
          {/* Exercise Name */}
          <div className="col-span-5">
            <input
              type="text"
              placeholder="Exercise name"
              value={exercise.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              className="w-full px-3 py-2.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          {/* Weight */}
          <div className="col-span-2">
            <div className="flex h-[42px]">
              <input
                type="text"
                placeholder={exercise.weight === 'BW' ? 'BW' : 'Weight'}
                value={exercise.weight === 'BW' ? 'BW' : exercise.weight}
                onChange={(e) => handleInputChange('weight', e.target.value)}
                className="flex-1 px-2 py-2.5 text-sm border border-r-0 rounded-l-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:z-10 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={exercise.weight === 'BW'}
              />
              <Button
                type="button"
                variant={exercise.weight === 'BW' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleInputChange('weight', exercise.weight === 'BW' ? '' : 'BW')}
                className="px-2 rounded-l-none text-xs h-[42px] border-l-0"
              >
                BW
              </Button>
            </div>
          </div>

          {/* Sets & Reps OR Effective Reps */}
          <div className="col-span-3">
            {exercise.useEffectiveReps ? (
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Max"
                  title="Maximum reps in one go"
                  value={exercise.effectiveRepsMax || ''}
                  onChange={(e) => handleInputChange('effectiveRepsMax', parseInt(e.target.value) || undefined)}
                  className="flex-1 px-2 py-2.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <input
                  type="number"
                  placeholder="Target"
                  title="Target total with rest pauses"
                  value={exercise.effectiveRepsTarget || ''}
                  onChange={(e) => handleInputChange('effectiveRepsTarget', parseInt(e.target.value) || undefined)}
                  className="flex-1 px-2 py-2.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Sets"
                  value={exercise.sets || ''}
                  onChange={(e) => handleInputChange('sets', parseInt(e.target.value) || undefined)}
                  className="flex-1 px-2 py-2.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <input
                  type="number"
                  placeholder="Reps"
                  value={exercise.reps || ''}
                  onChange={(e) => handleInputChange('reps', parseInt(e.target.value) || undefined)}
                  className="flex-1 px-2 py-2.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
            )}
          </div>

          {/* Toggle */}
          <div className="col-span-2 flex gap-1 justify-end">
            <Button
              type="button"
              variant={exercise.useEffectiveReps ? 'default' : 'outline'}
              size="sm"
              onClick={toggleEffectiveReps}
              className="px-2 text-xs"
              title="Toggle Effective Reps"
            >
              ER
            </Button>
          </div>
        </div>

        {/* Mobile/Tablet Layout - Used for most screen sizes */}
        <div className="2xl:hidden space-y-4">
          {/* Exercise Name */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">Exercise</label>
            <input
              type="text"
              placeholder="Exercise name"
              value={exercise.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              className="w-full px-3 py-3 text-base border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          {/* Weight */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">Weight</label>
            <div className="flex h-[52px]">
              <input
                type="text"
                placeholder={exercise.weight === 'BW' ? 'BW' : 'Weight (kg)'}
                value={exercise.weight === 'BW' ? 'BW' : exercise.weight}
                onChange={(e) => handleInputChange('weight', e.target.value)}
                className="flex-1 px-3 py-3 text-base border border-r-0 rounded-l-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:z-10 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={exercise.weight === 'BW'}
              />
              <Button
                type="button"
                variant={exercise.weight === 'BW' ? 'default' : 'outline'}
                onClick={() => handleInputChange('weight', exercise.weight === 'BW' ? '' : 'BW')}
                className="px-4 rounded-l-none text-sm h-[52px] border-l-0 min-w-[60px]"
              >
                BW
              </Button>
            </div>
          </div>

          {/* Sets & Reps OR Effective Reps */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-muted-foreground">
                {exercise.useEffectiveReps ? 'Effective Reps' : 'Sets & Reps'}
              </label>
              <Button
                type="button"
                variant={exercise.useEffectiveReps ? 'default' : 'outline'}
                size="sm"
                onClick={toggleEffectiveReps}
                className="px-3 text-xs"
                title="Toggle Effective Reps"
              >
                ER
              </Button>
            </div>
            
            {exercise.useEffectiveReps ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <input
                    type="number"
                    placeholder="Max"
                    title="Maximum reps in one go"
                    value={exercise.effectiveRepsMax || ''}
                    onChange={(e) => handleInputChange('effectiveRepsMax', parseInt(e.target.value) || undefined)}
                    className="w-full px-3 py-3.5 text-base border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                  <div className="text-xs text-muted-foreground mt-1.5">Max reps</div>
                </div>
                <div>
                  <input
                    type="number"
                    placeholder="Target"
                    title="Target total with rest pauses"
                    value={exercise.effectiveRepsTarget || ''}
                    onChange={(e) => handleInputChange('effectiveRepsTarget', parseInt(e.target.value) || undefined)}
                    className="w-full px-3 py-3.5 text-base border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                  <div className="text-xs text-muted-foreground mt-1.5">Target total</div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <input
                    type="number"
                    placeholder="Sets"
                    value={exercise.sets || ''}
                    onChange={(e) => handleInputChange('sets', parseInt(e.target.value) || undefined)}
                    className="w-full px-3 py-3.5 text-base border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                  <div className="text-xs text-muted-foreground mt-1.5">Sets</div>
                </div>
                <div>
                  <input
                    type="number"
                    placeholder="Reps"
                    value={exercise.reps || ''}
                    onChange={(e) => handleInputChange('reps', parseInt(e.target.value) || undefined)}
                    className="w-full px-3 py-3.5 text-base border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                  <div className="text-xs text-muted-foreground mt-1.5">Reps</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}