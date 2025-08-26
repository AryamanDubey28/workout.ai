'use client';

import { useState } from 'react';
import { Exercise } from '@/types/workout';
import { Button } from '@/components/ui/button';
import { Autocomplete } from '@/components/ui/autocomplete';
import { Trash2, ChevronDown, ChevronRight, Edit3, Dumbbell } from 'lucide-react';

interface ExerciseRowProps {
  exercise: Exercise;
  onChange: (exercise: Exercise) => void;
  onDelete: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

interface SetsAndRepsInputsProps {
  exercise: Exercise;
  onChange: (exercise: Exercise) => void;
}

interface WeightInputsProps {
  exercise: Exercise;
  onChange: (exercise: Exercise) => void;
}

function WeightInputs({ exercise, onChange }: WeightInputsProps) {
  const hasMultipleSets = exercise.sets && exercise.sets > 1;
  const isUsingPerSetWeights = exercise.weightsPerSet && exercise.weightsPerSet.length > 0;

  const handleGeneralWeightChange = (weight: string | 'BW') => {
    if (!hasMultipleSets || !isUsingPerSetWeights) {
      // Simple case: update the general weight field
      onChange({
        ...exercise,
        weight: weight,
      });
      return;
    }

    // Apply the weight to all sets
    const newWeightsPerSet = new Array(exercise.sets).fill(weight);
    
    onChange({
      ...exercise,
      weight: weight,
      weightsPerSet: newWeightsPerSet,
    });
  };

  const handleWeightForSetChange = (setIndex: number, weight: string | 'BW') => {
    const currentWeightsPerSet = exercise.weightsPerSet || [];
    const newWeightsPerSet = [...currentWeightsPerSet];
    newWeightsPerSet[setIndex] = weight;

    onChange({
      ...exercise,
      weightsPerSet: newWeightsPerSet,
    });
  };

  const enablePerSetWeights = () => {
    if (!exercise.sets || exercise.sets < 1) return;
    
    // Initialize weightsPerSet array with current weight for all sets
    const newWeightsPerSet = new Array(exercise.sets).fill(exercise.weight || '');
    
    onChange({
      ...exercise,
      weightsPerSet: newWeightsPerSet,
    });
  };

  const disablePerSetWeights = () => {
    // Use the first weight from the array as the general weight, or keep current
    const generalWeight = exercise.weightsPerSet?.[0] || exercise.weight || '';
    
    onChange({
      ...exercise,
      weight: generalWeight,
      weightsPerSet: undefined,
    });
  };

  // Simple weight input (no sets or single set)
  if (!hasMultipleSets) {
    return (
      <div className="flex gap-3 items-center">
        <Button
          type="button"
          variant={exercise.weight === 'BW' ? 'default' : 'outline'}
          onClick={() => handleGeneralWeightChange(exercise.weight === 'BW' ? '' : 'BW')}
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
            onChange={(e) => handleGeneralWeightChange(e.target.value)}
            className="flex-1 px-4 py-3 text-base border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary h-12 transition-all duration-200 hover:border-border/70"
          />
        )}
      </div>
    );
  }

  // Multi-set weight options
  if (!isUsingPerSetWeights) {
    return (
      <div className="space-y-3">
        {/* General weight input */}
        <div className="flex gap-3 items-center">
          <Button
            type="button"
            variant={exercise.weight === 'BW' ? 'default' : 'outline'}
            onClick={() => handleGeneralWeightChange(exercise.weight === 'BW' ? '' : 'BW')}
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
              onChange={(e) => handleGeneralWeightChange(e.target.value)}
              className="flex-1 px-4 py-3 text-base border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary h-12 transition-all duration-200 hover:border-border/70"
            />
          )}
        </div>
        
        {/* Simple option to enable per-set weights */}
        <div className="flex items-center justify-end pt-1">
          <button
            type="button"
            onClick={enablePerSetWeights}
            className="text-xs text-muted-foreground hover:text-primary underline underline-offset-2 transition-all duration-200"
          >
            Different weights per set?
          </button>
        </div>
      </div>
    );
  }

  // Per-set weight inputs - Simple horizontal layout
  return (
    <div className="space-y-3">
      {/* Simple header with exit option */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Different weights per set</div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={disablePerSetWeights}
          className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-all duration-200"
          title="Use same weight for all sets"
        >
          ✕
        </Button>
      </div>

      {/* Simple inline weight inputs */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: exercise.sets || 0 }, (_, index) => (
          <div key={index} className="flex items-center gap-1 min-w-0">
            <span className="text-xs text-muted-foreground shrink-0">{index + 1}:</span>
            <Button
              type="button"
              variant={exercise.weightsPerSet?.[index] === 'BW' ? 'default' : 'outline'}
              onClick={() => handleWeightForSetChange(index, exercise.weightsPerSet?.[index] === 'BW' ? '' : 'BW')}
              className="px-2 py-1 text-xs h-8 min-w-[35px] transition-all duration-200"
              title={`Toggle bodyweight for set ${index + 1}`}
            >
              BW
            </Button>
            {exercise.weightsPerSet?.[index] !== 'BW' && (
              <input
                type="text"
                placeholder="kg"
                value={exercise.weightsPerSet?.[index] || ''}
                onChange={(e) => handleWeightForSetChange(index, e.target.value)}
                className="w-16 px-2 py-1 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary h-8 transition-all duration-200 hover:border-border/70 text-center"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SetsAndRepsInputs({ exercise, onChange }: SetsAndRepsInputsProps) {
  const handleSetsChange = (newSets: number | undefined) => {
    if (!newSets || newSets < 1) {
      // Clear everything if sets is 0 or undefined
      onChange({
        ...exercise,
        sets: undefined,
        reps: undefined,
        repsPerSet: undefined,
        weightsPerSet: undefined,
      });
      return;
    }

    // Initialize repsPerSet array based on number of sets
    const currentRepsPerSet = exercise.repsPerSet || [];
    const newRepsPerSet: number[] = [];
    
    for (let i = 0; i < newSets; i++) {
      // Preserve existing reps if available, otherwise use the general reps value or 0
      newRepsPerSet[i] = currentRepsPerSet[i] || exercise.reps || 0;
    }

    // Initialize weightsPerSet array if it was being used
    let newWeightsPerSet: (string | 'BW')[] | undefined = undefined;
    if (exercise.weightsPerSet && exercise.weightsPerSet.length > 0) {
      const currentWeightsPerSet = exercise.weightsPerSet || [];
      newWeightsPerSet = [];
      
      for (let i = 0; i < newSets; i++) {
        // Preserve existing weights if available, otherwise use the general weight value
        newWeightsPerSet[i] = currentWeightsPerSet[i] || exercise.weight || '';
      }
    }

    onChange({
      ...exercise,
      sets: newSets,
      repsPerSet: newRepsPerSet,
      weightsPerSet: newWeightsPerSet,
      // Keep the general reps for backwards compatibility but it won't be used in display
      reps: exercise.reps,
    });
  };

  const handleRepsForSetChange = (setIndex: number, reps: number | undefined) => {
    const currentRepsPerSet = exercise.repsPerSet || [];
    const newRepsPerSet = [...currentRepsPerSet];
    newRepsPerSet[setIndex] = reps || 0;

    onChange({
      ...exercise,
      repsPerSet: newRepsPerSet,
    });
  };

  const handleGeneralRepsChange = (reps: number | undefined) => {
    if (!exercise.sets || exercise.sets < 1) {
      // If no sets defined, just update the general reps field
      onChange({
        ...exercise,
        reps: reps,
      });
      return;
    }

    // Apply the reps to all sets
    const newRepsPerSet = new Array(exercise.sets).fill(reps || 0);
    
    onChange({
      ...exercise,
      reps: reps,
      repsPerSet: newRepsPerSet,
    });
  };

  // If no sets defined or sets is 0, show the simple two-input layout
  if (!exercise.sets || exercise.sets < 1) {
    return (
      <>
        <div>
          <input
            type="number"
            placeholder="Sets"
            value={exercise.sets || ''}
            onChange={(e) => handleSetsChange(parseInt(e.target.value) || undefined)}
            className="w-full px-4 py-3 text-base border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary h-12 transition-all duration-200 hover:border-border/70"
          />
          <div className="text-xs text-muted-foreground mt-1.5 px-1">Sets</div>
        </div>
        <div>
          <input
            type="number"
            placeholder="Reps"
            value={exercise.reps || ''}
            onChange={(e) => handleGeneralRepsChange(parseInt(e.target.value) || undefined)}
            className="w-full px-4 py-3 text-base border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary h-12 transition-all duration-200 hover:border-border/70"
          />
          <div className="text-xs text-muted-foreground mt-1.5 px-1">Reps</div>
        </div>
      </>
    );
  }

  // Show expanded view with individual set inputs
  return (
    <div className="space-y-4">
      {/* Sets input row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <input
            type="number"
            placeholder="Sets"
            value={exercise.sets || ''}
            onChange={(e) => handleSetsChange(parseInt(e.target.value) || undefined)}
            className="w-full px-4 py-3 text-base border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary h-12 transition-all duration-200 hover:border-border/70"
          />
          <div className="text-xs text-muted-foreground mt-1.5 px-1">Sets</div>
        </div>
        <div>
          <input
            type="number"
            placeholder="Apply to all"
            value={exercise.reps || ''}
            onChange={(e) => handleGeneralRepsChange(parseInt(e.target.value) || undefined)}
            className="w-full px-4 py-3 text-base border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary h-12 transition-all duration-200 hover:border-border/70"
          />
          <div className="text-xs text-muted-foreground mt-1.5 px-1">Quick fill all sets</div>
        </div>
      </div>

      {/* Individual set reps inputs */}
      <div className="space-y-2">
        <div className="text-sm font-medium text-muted-foreground">Reps per set:</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {Array.from({ length: exercise.sets }, (_, index) => (
            <div key={index} className="space-y-1">
              <input
                type="number"
                placeholder="0"
                value={exercise.repsPerSet?.[index] || ''}
                onChange={(e) => handleRepsForSetChange(index, parseInt(e.target.value) || undefined)}
                className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary h-10 transition-all duration-200 hover:border-border/70"
              />
              <div className="text-xs text-muted-foreground text-center">Set {index + 1}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ExerciseRow({ exercise, onChange, onDelete, isExpanded = false, onToggleExpand }: ExerciseRowProps) {
  const handleInputChange = (field: keyof Exercise, value: any) => {
    onChange({
      ...exercise,
      [field]: value,
    });
  };

  const handleExerciseSelect = (suggestion: any) => {
    // Auto-fill exercise data from last used values
    const updatedExercise = {
      ...exercise,
      name: suggestion.name,
    };

    // Fill in last used data if available
    if (suggestion.lastWeight) {
      updatedExercise.weight = suggestion.lastWeight;
    }
    
    if (suggestion.useEffectiveReps !== undefined) {
      updatedExercise.useEffectiveReps = suggestion.useEffectiveReps;
      
      if (suggestion.useEffectiveReps) {
        if (suggestion.lastEffectiveRepsMax) {
          updatedExercise.effectiveRepsMax = suggestion.lastEffectiveRepsMax;
        }
        if (suggestion.lastEffectiveRepsTarget) {
          updatedExercise.effectiveRepsTarget = suggestion.lastEffectiveRepsTarget;
        }
        // Clear conflicting fields
        updatedExercise.sets = undefined;
        updatedExercise.reps = undefined;
      } else {
        if (suggestion.lastSets) {
          updatedExercise.sets = suggestion.lastSets;
        }
        if (suggestion.lastReps) {
          updatedExercise.reps = suggestion.lastReps;
        }
        // Clear conflicting fields
        updatedExercise.effectiveRepsMax = undefined;
        updatedExercise.effectiveRepsTarget = undefined;
      }
    }

    onChange(updatedExercise);
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
    if (exercise.useEffectiveReps) {
      const weight = exercise.weight === 'BW' ? 'BW' : exercise.weight ? `${exercise.weight}kg` : '';
      const max = exercise.effectiveRepsMax || '?';
      const target = exercise.effectiveRepsTarget || '?';
      return `${weight} - ${max}/${target} ER`.trim();
    }

    // Check if we have per-set weights
    const hasPerSetWeights = exercise.weightsPerSet && exercise.weightsPerSet.length > 0;
    
    if (hasPerSetWeights) {
      // Show combined weight+reps per set for clarity
      const setDetails = [];
      for (let i = 0; i < (exercise.weightsPerSet?.length || 0); i++) {
        const weight = exercise.weightsPerSet![i];
        const reps = exercise.repsPerSet?.[i] || '?';
        const weightStr = weight === 'BW' ? 'BW' : weight ? `${weight}kg` : '?kg';
        setDetails.push(`${weightStr}×${reps}`);
      }
      return `⚖️ ${setDetails.join(', ')}`;
    } else {
      // Standard weight display
      const weight = exercise.weight === 'BW' ? 'BW' : exercise.weight ? `${exercise.weight}kg` : '';
      
      if (exercise.repsPerSet && exercise.repsPerSet.length > 0) {
        const sets = exercise.repsPerSet.length;
        const allSameReps = exercise.repsPerSet.every(reps => reps === exercise.repsPerSet![0]);
        
        if (allSameReps) {
          // All sets have same reps: "20kg - 3x8"
          return `${weight} - ${sets}x${exercise.repsPerSet[0]}`.trim();
        } else {
          // Different reps per set: "20kg - 8, 7, 6"
          return `${weight} - ${exercise.repsPerSet.join(', ')}`.trim();
        }
      } else {
        // Fallback to old format
        const sets = exercise.sets || '?';
        const reps = exercise.reps || '?';
        return `${weight} - ${sets}x${reps}`.trim();
      }
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
              {exercise.weightsPerSet && exercise.weightsPerSet.length > 0 && (
                <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">⚖️</span>
              )}
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
            <Autocomplete
              value={exercise.name}
              onChange={(value) => handleInputChange('name', value)}
              onSelect={handleExerciseSelect}
              placeholder="Exercise name"
              className="transition-all duration-200 hover:border-border/70"
            />
          </div>

          {/* Weight Row */}
          <div>
            <WeightInputs 
              exercise={exercise} 
              onChange={onChange}
            />
            {exercise.weight === 'BW' && !exercise.weightsPerSet && (
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
                <SetsAndRepsInputs 
                  exercise={exercise} 
                  onChange={onChange}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}